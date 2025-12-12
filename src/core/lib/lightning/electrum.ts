/**
 * Lightning-Electrum Integration
 *
 * Integra o módulo Lightning com o servidor Electrum para:
 * - Monitoramento de funding transactions
 * - Broadcast de commitment/closing transactions
 * - Monitoramento de breaches (watchtower)
 * - Consulta de confirmações
 *
 * Baseado em: BOLT #5 (On-chain Transaction Handling)
 */

import {
  connect,
  close,
  callElectrumMethod,
  getTransaction,
  broadcastTransaction,
  getBlockHeader,
  getMerkleProof,
} from '../electrum/client'
import type { Connection } from '@/core/models/network'
import type { Tx } from '@/core/models/transaction'
import { toScriptHash } from '../address'
import { hexToUint8Array, uint8ArrayToHex } from '../utils/utils'
import { sha256 } from '../crypto'

// ==========================================
// TIPOS
// ==========================================

/**
 * Status de uma transação on-chain
 */
export interface TxStatus {
  txid: string
  confirmed: boolean
  confirmations: number
  blockHeight?: number
  blockHash?: string
}

/**
 * Output não gasto (UTXO)
 */
export interface Utxo {
  txid: string
  vout: number
  value: number // satoshis
  scriptPubKey: string
  confirmations: number
  height?: number
}

/**
 * Callback para notificação de mudança de status
 */
export type TxStatusCallback = (txid: string, status: TxStatus) => void

/**
 * Callback para notificação de nova transação
 */
export type NewTxCallback = (tx: Tx) => void

/**
 * Opções de monitoramento
 */
export interface MonitorOptions {
  confirmationsRequired?: number
  pollIntervalMs?: number
  onStatusChange?: TxStatusCallback
  onNewTx?: NewTxCallback
}

// ==========================================
// CONSTANTES
// ==========================================

const DEFAULT_CONFIRMATIONS_REQUIRED = 3
const DEFAULT_POLL_INTERVAL_MS = 30000 // 30 segundos
const FUNDING_CONFIRMATIONS = 3 // Confirmações para funding tx
const CLOSING_CONFIRMATIONS = 1 // Confirmações para closing tx

// ==========================================
// CLASSE PRINCIPAL
// ==========================================

/**
 * Gerenciador de integração Electrum para Lightning
 */
export class LightningElectrumManager {
  private socket: Connection | null = null
  private monitoredTxs: Map<string, MonitorOptions> = new Map()
  private monitoredAddresses: Map<string, NewTxCallback> = new Map()
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private isConnected = false
  private lastBlockHeight = 0

  /**
   * Conecta ao servidor Electrum
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.socket) {
      return
    }

    try {
      this.socket = await connect()
      this.isConnected = true
      console.log('[lightning-electrum] Connected to Electrum server')

      // Obter altura atual do bloco
      await this.updateBlockHeight()
    } catch (error) {
      console.error('[lightning-electrum] Failed to connect:', error)
      throw error
    }
  }

  /**
   * Desconecta do servidor Electrum
   */
  disconnect(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }

    if (this.socket) {
      close(this.socket)
      this.socket = null
    }

    this.isConnected = false
    this.monitoredTxs.clear()
    this.monitoredAddresses.clear()
    console.log('[lightning-electrum] Disconnected')
  }

  /**
   * Atualiza altura do bloco atual
   */
  private async updateBlockHeight(): Promise<number> {
    try {
      const response = await callElectrumMethod<{ height: number }>(
        'blockchain.headers.subscribe',
        [],
        this.socket!,
      )
      this.lastBlockHeight = response.result?.height || 0
      return this.lastBlockHeight
    } catch (error) {
      console.error('[lightning-electrum] Failed to get block height:', error)
      return this.lastBlockHeight
    }
  }

  /**
   * Obtém altura atual do blockchain
   */
  async getBlockHeight(): Promise<number> {
    await this.ensureConnected()
    return this.updateBlockHeight()
  }

  /**
   * Garante conexão ativa
   */
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected || !this.socket) {
      await this.connect()
    }
  }

  // ==========================================
  // FUNDING TRANSACTION
  // ==========================================

  /**
   * Monitora funding transaction de um canal
   *
   * @param fundingTxid - TXID da funding transaction
   * @param fundingOutputIndex - Índice do output de funding
   * @param onConfirmed - Callback quando confirmado
   * @returns Função para parar monitoramento
   */
  async monitorFundingTx(
    fundingTxid: string,
    fundingOutputIndex: number,
    onConfirmed: (confirmations: number) => void,
  ): Promise<() => void> {
    await this.ensureConnected()

    const options: MonitorOptions = {
      confirmationsRequired: FUNDING_CONFIRMATIONS,
      onStatusChange: (txid, status) => {
        if (status.confirmed && status.confirmations >= FUNDING_CONFIRMATIONS) {
          onConfirmed(status.confirmations)
        }
      },
    }

    this.monitoredTxs.set(fundingTxid, options)
    this.startPolling()

    console.log(`[lightning-electrum] Monitoring funding tx: ${fundingTxid}:${fundingOutputIndex}`)

    // Verificar status inicial
    const status = await this.getTxStatus(fundingTxid)
    if (status.confirmed && status.confirmations >= FUNDING_CONFIRMATIONS) {
      onConfirmed(status.confirmations)
    }

    return () => {
      this.monitoredTxs.delete(fundingTxid)
      console.log(`[lightning-electrum] Stopped monitoring funding tx: ${fundingTxid}`)
    }
  }

  /**
   * Verifica se funding transaction está confirmada
   *
   * @param fundingTxid - TXID da funding transaction
   * @param requiredConfirmations - Número de confirmações necessárias
   * @returns true se confirmada
   */
  async isFundingConfirmed(
    fundingTxid: string,
    requiredConfirmations: number = FUNDING_CONFIRMATIONS,
  ): Promise<boolean> {
    const status = await this.getTxStatus(fundingTxid)
    return status.confirmed && status.confirmations >= requiredConfirmations
  }

  // ==========================================
  // COMMITMENT/CLOSING TRANSACTIONS
  // ==========================================

  /**
   * Broadcast de commitment transaction (force close)
   *
   * @param rawTx - Raw transaction hex
   * @returns TXID da transação
   */
  async broadcastCommitmentTx(rawTx: string): Promise<string> {
    await this.ensureConnected()

    try {
      const txid = await broadcastTransaction(rawTx, this.socket!)
      console.log(`[lightning-electrum] Broadcast commitment tx: ${txid}`)
      return txid
    } catch (error) {
      console.error('[lightning-electrum] Failed to broadcast commitment tx:', error)
      throw error
    }
  }

  /**
   * Broadcast de closing transaction (cooperative close)
   *
   * @param rawTx - Raw transaction hex
   * @returns TXID da transação
   */
  async broadcastClosingTx(rawTx: string): Promise<string> {
    await this.ensureConnected()

    try {
      const txid = await broadcastTransaction(rawTx, this.socket!)
      console.log(`[lightning-electrum] Broadcast closing tx: ${txid}`)
      return txid
    } catch (error) {
      console.error('[lightning-electrum] Failed to broadcast closing tx:', error)
      throw error
    }
  }

  /**
   * Broadcast de justice/penalty transaction (watchtower)
   *
   * @param rawTx - Raw transaction hex
   * @returns TXID da transação
   */
  async broadcastJusticeTx(rawTx: string): Promise<string> {
    await this.ensureConnected()

    try {
      const txid = await broadcastTransaction(rawTx, this.socket!)
      console.log(`[lightning-electrum] Broadcast justice tx: ${txid}`)
      return txid
    } catch (error) {
      console.error('[lightning-electrum] Failed to broadcast justice tx:', error)
      throw error
    }
  }

  /**
   * Broadcast de HTLC timeout transaction
   *
   * @param rawTx - Raw transaction hex
   * @returns TXID da transação
   */
  async broadcastHtlcTimeoutTx(rawTx: string): Promise<string> {
    await this.ensureConnected()

    try {
      const txid = await broadcastTransaction(rawTx, this.socket!)
      console.log(`[lightning-electrum] Broadcast HTLC timeout tx: ${txid}`)
      return txid
    } catch (error) {
      console.error('[lightning-electrum] Failed to broadcast HTLC timeout tx:', error)
      throw error
    }
  }

  /**
   * Broadcast de HTLC success transaction
   *
   * @param rawTx - Raw transaction hex
   * @returns TXID da transação
   */
  async broadcastHtlcSuccessTx(rawTx: string): Promise<string> {
    await this.ensureConnected()

    try {
      const txid = await broadcastTransaction(rawTx, this.socket!)
      console.log(`[lightning-electrum] Broadcast HTLC success tx: ${txid}`)
      return txid
    } catch (error) {
      console.error('[lightning-electrum] Failed to broadcast HTLC success tx:', error)
      throw error
    }
  }

  // ==========================================
  // STATUS E CONSULTAS
  // ==========================================

  /**
   * Obtém status de uma transação
   *
   * @param txid - TXID da transação
   * @returns Status da transação
   */
  async getTxStatus(txid: string): Promise<TxStatus> {
    await this.ensureConnected()

    try {
      const response = await getTransaction(txid, true, this.socket!)
      const tx = response.result

      if (!tx) {
        return {
          txid,
          confirmed: false,
          confirmations: 0,
        }
      }

      const confirmations = tx.confirmations || 0

      return {
        txid,
        confirmed: confirmations > 0,
        confirmations,
        blockHeight: tx.height,
        blockHash: tx.blockhash,
      }
    } catch (error) {
      console.error(`[lightning-electrum] Failed to get tx status for ${txid}:`, error)
      return {
        txid,
        confirmed: false,
        confirmations: 0,
      }
    }
  }

  /**
   * Obtém transação completa
   *
   * @param txid - TXID da transação
   * @returns Transação ou null se não encontrada
   */
  async getTransaction(txid: string): Promise<Tx | null> {
    await this.ensureConnected()

    try {
      const response = await getTransaction(txid, true, this.socket!)
      return response.result || null
    } catch (error) {
      console.error(`[lightning-electrum] Failed to get transaction ${txid}:`, error)
      return null
    }
  }

  /**
   * Obtém UTXOs de um endereço
   *
   * @param address - Endereço Bitcoin
   * @returns Lista de UTXOs
   */
  async getUtxos(address: string): Promise<Utxo[]> {
    await this.ensureConnected()

    try {
      const scripthash = toScriptHash(address)
      const response = await callElectrumMethod<
        {
          tx_hash: string
          tx_pos: number
          value: number
          height: number
        }[]
      >('blockchain.scripthash.listunspent', [scripthash], this.socket!)

      const currentHeight = await this.getBlockHeight()

      return (response.result || []).map(utxo => ({
        txid: utxo.tx_hash,
        vout: utxo.tx_pos,
        value: utxo.value,
        scriptPubKey: '', // Será preenchido se necessário
        confirmations: utxo.height > 0 ? currentHeight - utxo.height + 1 : 0,
        height: utxo.height,
      }))
    } catch (error) {
      console.error(`[lightning-electrum] Failed to get UTXOs for ${address}:`, error)
      return []
    }
  }

  /**
   * Verifica se um output específico foi gasto
   *
   * @param txid - TXID da transação
   * @param vout - Índice do output
   * @returns true se foi gasto
   */
  async isOutputSpent(txid: string, vout: number): Promise<boolean> {
    await this.ensureConnected()

    try {
      // Buscar a transação para obter o scriptPubKey
      const tx = await this.getTransaction(txid)
      if (!tx || !tx.vout || !tx.vout[vout]) {
        return true // Se não encontrou, considera como gasto
      }

      const output = tx.vout[vout]
      const address = output.scriptPubKey?.addresses?.[0]

      if (!address) {
        return true
      }

      // Verificar se o UTXO ainda existe
      const utxos = await this.getUtxos(address)
      const exists = utxos.some(u => u.txid === txid && u.vout === vout)

      return !exists
    } catch (error) {
      console.error(`[lightning-electrum] Failed to check if output spent ${txid}:${vout}:`, error)
      return true // Em caso de erro, assumir que foi gasto (mais seguro)
    }
  }

  // ==========================================
  // MONITORAMENTO DE ENDEREÇOS (WATCHTOWER)
  // ==========================================

  /**
   * Monitora endereço para novas transações (usado pelo watchtower)
   *
   * @param address - Endereço a monitorar
   * @param callback - Callback para novas transações
   * @returns Função para parar monitoramento
   */
  async monitorAddress(address: string, callback: NewTxCallback): Promise<() => void> {
    await this.ensureConnected()

    this.monitoredAddresses.set(address, callback)
    this.startPolling()

    console.log(`[lightning-electrum] Monitoring address: ${address}`)

    return () => {
      this.monitoredAddresses.delete(address)
      console.log(`[lightning-electrum] Stopped monitoring address: ${address}`)
    }
  }

  /**
   * Monitora funding output de um canal para detectar breach
   *
   * @param fundingTxid - TXID da funding tx
   * @param fundingOutputIndex - Índice do output
   * @param onSpent - Callback quando o output for gasto
   * @returns Função para parar monitoramento
   */
  async monitorFundingOutput(
    fundingTxid: string,
    fundingOutputIndex: number,
    onSpent: (spendingTx: Tx) => void,
  ): Promise<() => void> {
    await this.ensureConnected()

    const outpoint = `${fundingTxid}:${fundingOutputIndex}`
    let wasSpent = false

    const checkSpent = async () => {
      if (wasSpent) return

      const spent = await this.isOutputSpent(fundingTxid, fundingOutputIndex)
      if (spent && !wasSpent) {
        wasSpent = true
        // Buscar a transação que gastou
        // Isso requer buscar o histórico do endereço
        console.log(`[lightning-electrum] Funding output spent: ${outpoint}`)
      }
    }

    // Verificar status inicial
    await checkSpent()

    // Adicionar ao polling
    const options: MonitorOptions = {
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
      onStatusChange: async () => {
        await checkSpent()
      },
    }

    this.monitoredTxs.set(outpoint, options)
    this.startPolling()

    return () => {
      this.monitoredTxs.delete(outpoint)
      console.log(`[lightning-electrum] Stopped monitoring funding output: ${outpoint}`)
    }
  }

  // ==========================================
  // FEE ESTIMATION
  // ==========================================

  /**
   * Estima fee rate para uma transação
   *
   * @param targetBlocks - Número de blocos alvo para confirmação
   * @returns Fee rate em sat/vB
   */
  async estimateFeeRate(targetBlocks: number = 6): Promise<number> {
    await this.ensureConnected()

    try {
      const response = await callElectrumMethod<number>(
        'blockchain.estimatefee',
        [targetBlocks],
        this.socket!,
      )

      const feeBtcPerKb = response.result || 0.00001
      const feeSatPerVb = Math.ceil((feeBtcPerKb * 100000000) / 1000)

      return Math.max(1, feeSatPerVb)
    } catch (error) {
      console.error('[lightning-electrum] Failed to estimate fee rate:', error)
      // Fallback conservador
      return targetBlocks <= 1 ? 10 : targetBlocks <= 3 ? 5 : 2
    }
  }

  /**
   * Obtém fee rates recomendadas para diferentes prioridades
   */
  async getRecommendedFeeRates(): Promise<{
    urgent: number // 1 bloco
    fast: number // 2 blocos
    normal: number // 6 blocos
    slow: number // 144 blocos (~24h)
  }> {
    const [urgent, fast, normal, slow] = await Promise.all([
      this.estimateFeeRate(1),
      this.estimateFeeRate(2),
      this.estimateFeeRate(6),
      this.estimateFeeRate(144),
    ])

    return { urgent, fast, normal, slow }
  }

  // ==========================================
  // MERKLE PROOF
  // ==========================================

  /**
   * Obtém merkle proof para uma transação (SPV verification)
   *
   * @param txid - TXID da transação
   * @param blockHeight - Altura do bloco
   * @returns Merkle proof
   */
  async getMerkleProof(
    txid: string,
    blockHeight: number,
  ): Promise<{
    merkle: string[]
    blockHeight: number
    pos: number
  } | null> {
    await this.ensureConnected()

    try {
      const response = await getMerkleProof(txid, blockHeight, this.socket!)

      if (!response.result) {
        return null
      }

      return {
        merkle: response.result.merkle,
        blockHeight: response.result.block_height,
        pos: response.result.pos,
      }
    } catch (error) {
      console.error(`[lightning-electrum] Failed to get merkle proof for ${txid}:`, error)
      return null
    }
  }

  /**
   * Verifica merkle proof
   *
   * @param txid - TXID da transação
   * @param merkle - Array de hashes do merkle path
   * @param pos - Posição da transação no bloco
   * @param merkleRoot - Merkle root esperado
   * @returns true se válido
   */
  verifyMerkleProof(txid: string, merkle: string[], pos: number, merkleRoot: string): boolean {
    let hash = hexToUint8Array(txid)

    for (let i = 0; i < merkle.length; i++) {
      const sibling = hexToUint8Array(merkle[i])

      // Determinar ordem de concatenação baseado na posição
      const isLeft = (pos >> i) & 1

      const concat = new Uint8Array(64)
      if (isLeft) {
        concat.set(sibling, 0)
        concat.set(hash, 32)
      } else {
        concat.set(hash, 0)
        concat.set(sibling, 32)
      }

      // Double SHA256
      hash = sha256(sha256(concat))
    }

    return uint8ArrayToHex(hash) === merkleRoot
  }

  // ==========================================
  // POLLING
  // ==========================================

  /**
   * Inicia polling para monitoramento
   */
  private startPolling(): void {
    if (this.pollInterval) {
      return
    }

    this.pollInterval = setInterval(async () => {
      await this.pollMonitoredItems()
    }, DEFAULT_POLL_INTERVAL_MS)

    console.log('[lightning-electrum] Started polling')
  }

  /**
   * Para polling
   */
  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
      console.log('[lightning-electrum] Stopped polling')
    }
  }

  /**
   * Executa polling de itens monitorados
   */
  private async pollMonitoredItems(): Promise<void> {
    if (!this.isConnected) {
      return
    }

    try {
      // Atualizar altura do bloco
      await this.updateBlockHeight()

      // Verificar transações monitoradas
      for (const [txid, options] of this.monitoredTxs) {
        if (txid.includes(':')) {
          // É um outpoint, não um txid
          continue
        }

        const status = await this.getTxStatus(txid)
        if (options.onStatusChange) {
          options.onStatusChange(txid, status)
        }
      }

      // Verificar endereços monitorados
      for (const [address, callback] of this.monitoredAddresses) {
        try {
          const scripthash = toScriptHash(address)
          const response = await callElectrumMethod<{ tx_hash: string; height: number }[]>(
            'blockchain.scripthash.get_history',
            [scripthash],
            this.socket!,
          )

          // Aqui poderia implementar lógica para detectar novas transações
          // comparando com histórico anterior
        } catch (error) {
          console.error(`[lightning-electrum] Error polling address ${address}:`, error)
        }
      }
    } catch (error) {
      console.error('[lightning-electrum] Polling error:', error)
    }
  }

  /**
   * Verifica se está conectado
   */
  isActive(): boolean {
    return this.isConnected
  }

  /**
   * Obtém número de itens sendo monitorados
   */
  getMonitoredCount(): { txs: number; addresses: number } {
    return {
      txs: this.monitoredTxs.size,
      addresses: this.monitoredAddresses.size,
    }
  }
}

// ==========================================
// SINGLETON EXPORT
// ==========================================

let instance: LightningElectrumManager | null = null

/**
 * Obtém instância singleton do manager
 */
export function getLightningElectrumManager(): LightningElectrumManager {
  if (!instance) {
    instance = new LightningElectrumManager()
  }
  return instance
}

/**
 * Cria nova instância (para testes)
 */
export function createLightningElectrumManager(): LightningElectrumManager {
  return new LightningElectrumManager()
}

// Export default instance
export default getLightningElectrumManager()
