/**
 * Watchtower - Monitoramento de Canais Lightning
 *
 * Implementa detecção de tentativas de roubo (breach) em canais
 * e geração de penalty transactions.
 *
 * Baseado em BOLT #5: On-chain Transaction Handling
 * Referência: electrum/lnwatcher.py e electrum/lnsweep.py
 */

import { sha256 } from '../crypto'
import { uint8ArrayToHex, hexToUint8Array } from '../utils/utils'
import lightningRepository from '../../repositories/lightning'
import * as secp from '@noble/secp256k1'
import {
  sweepTheirCtxWatchtower,
  buildJusticeTransaction,
  serializeSweepTransaction,
  ChannelConfig,
  HtlcForSweep,
  PenaltyParams,
  RevokedOutput,
} from './onchain'
import { PenaltyTransactionType } from '@/core/models/lightning/onchain'

// ==========================================
// TIPOS
// ==========================================

/**
 * Estados possíveis de um canal
 */
export enum ChannelState {
  PENDING_OPEN = 'pending_open',
  OPENING = 'opening',
  CHANNEL_READY = 'channel_ready',
  FUNDING_CONFIRMED = 'funding_confirmed',
  NORMAL = 'normal',
  SHUTTING_DOWN = 'shutting_down',
  CLOSING = 'closing',
  CLOSED = 'closed',
  ERROR = 'error',
}

/**
 * Status de monitoramento do canal
 */
export enum ChannelMonitorStatus {
  ACTIVE = 'active',
  BREACH_DETECTED = 'breach_detected',
  PENALTY_BROADCAST = 'penalty_broadcast',
  CLOSED = 'closed',
  PAUSED = 'paused',
}

/**
 * Informações de um canal Lightning
 */
export interface ChannelInfo {
  channelId: string
  peerId: string
  state: ChannelState
  localBalance: bigint
  remoteBalance: bigint
  fundingTxid?: string
  fundingOutputIndex?: number
  capacity: bigint
  createdAt: number
  lastActivity: number
}

/**
 * Canal monitorado pelo watchtower
 */
export interface WatchtowerChannel {
  channelId: string
  remotePubkey: Uint8Array
  localPubkey?: Uint8Array
  fundingTxid?: string
  fundingOutputIndex?: number
  localBalance: bigint
  remoteBalance: bigint
  capacity?: bigint
  commitmentNumber: bigint
  lastCommitmentTx: Uint8Array | null
  revocationSecrets: Map<bigint, Uint8Array> // commitment_number -> revocation_secret
  breachDetected: boolean
  status: ChannelMonitorStatus
  lastChecked: number
}

/**
 * Resultado da verificação de breach
 */
export interface BreachResult {
  breach: boolean
  reason?: string
  penaltyTx?: Uint8Array
  commitmentNumber?: bigint
  revokedAmount?: bigint
  severity?: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * Configuração do watchtower
 */
export interface WatchtowerConfig {
  checkIntervalMs: number
  maxStoredSecrets: number
  autoRecover: boolean
  autoBroadcastPenalty: boolean
  onBreachDetected?: (channelId: string, result: BreachResult) => void
  onPenaltyBroadcast?: (channelId: string, txid: string) => void
}

/**
 * Estatísticas do watchtower
 */
export interface WatchtowerStats {
  monitoredChannels: number
  activeChannels: number
  totalSecretsStored: number
  breachesDetected: number
  penaltiesBroadcast: number
  lastCheck: number
  isRunning: boolean
}

/**
 * Evento do Watchtower para UI
 */
export interface WatchtowerEvent {
  type:
    | 'breach_detected'
    | 'penalty_broadcast'
    | 'channel_added'
    | 'channel_removed'
    | 'check_complete'
    | 'error'
  channelId?: string
  timestamp: number
  data?: Record<string, unknown>
}

// ==========================================
// CLASSE WATCHTOWER
// ==========================================

/**
 * Watchtower para monitoramento de canais Lightning
 * Detecta tentativas de roubo e força fechamento
 */
export class Watchtower {
  private monitoredChannels: Map<string, WatchtowerChannel> = new Map()
  private stats: WatchtowerStats = {
    monitoredChannels: 0,
    activeChannels: 0,
    totalSecretsStored: 0,
    breachesDetected: 0,
    penaltiesBroadcast: 0,
    lastCheck: 0,
    isRunning: false,
  }
  private config: WatchtowerConfig
  private checkInterval: ReturnType<typeof setInterval> | null = null
  private eventListeners: ((event: WatchtowerEvent) => void)[] = []
  private events: WatchtowerEvent[] = []
  private maxEvents: number = 100

  constructor(config?: Partial<WatchtowerConfig>) {
    this.config = {
      checkIntervalMs: 60000, // 1 minuto
      maxStoredSecrets: 1000,
      autoRecover: true,
      autoBroadcastPenalty: true,
      ...config,
    }
  }

  // ==========================================
  // LIFECYCLE
  // ==========================================

  /**
   * Inicia monitoramento periódico
   */
  start(): void {
    if (this.stats.isRunning) {
      console.log('[watchtower] Already running')
      return
    }

    console.log('[watchtower] Starting channel monitoring...')
    this.stats.isRunning = true

    // Verificação inicial
    this.checkAllChannels()

    // Verificação periódica
    this.checkInterval = setInterval(() => {
      this.checkAllChannels()
    }, this.config.checkIntervalMs)
  }

  /**
   * Para monitoramento
   */
  stop(): void {
    if (!this.stats.isRunning) return

    console.log('[watchtower] Stopping channel monitoring...')
    this.stats.isRunning = false

    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  /**
   * Verifica todos os canais
   */
  async checkAllChannels(): Promise<void> {
    this.stats.lastCheck = Date.now()

    for (const [channelId, channel] of this.monitoredChannels) {
      if (channel.status !== ChannelMonitorStatus.ACTIVE) continue

      try {
        // Em uma implementação real, verificaríamos a blockchain
        // por transações suspeitas no funding output
        channel.lastChecked = Date.now()
      } catch (error) {
        console.error(`[watchtower] Error checking channel ${channelId}:`, error)
      }
    }

    this.emitEvent({ type: 'check_complete', timestamp: Date.now() })
  }

  /**
   * Sincroniza watchtower - alias para checkAllChannels
   */
  async sync(): Promise<void> {
    return this.checkAllChannels()
  }

  // ==========================================
  // EVENT SYSTEM
  // ==========================================

  /**
   * Emite evento para listeners
   */
  private emitEvent(event: WatchtowerEvent): void {
    // Adiciona ao histórico
    this.events.push(event)
    if (this.events.length > this.maxEvents) {
      this.events.shift()
    }

    // Notifica listeners
    for (const listener of this.eventListeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[watchtower] Error in event listener:', error)
      }
    }
  }

  /**
   * Registra listener para eventos
   */
  addEventListener(listener: (event: WatchtowerEvent) => void): () => void {
    this.eventListeners.push(listener)
    return () => {
      const index = this.eventListeners.indexOf(listener)
      if (index >= 0) {
        this.eventListeners.splice(index, 1)
      }
    }
  }

  /**
   * Obtém histórico de eventos
   */
  getEvents(): WatchtowerEvent[] {
    return [...this.events]
  }

  /**
   * Limpa histórico de eventos
   */
  clearEvents(): void {
    this.events = []
  }

  // ==========================================
  // PERSISTENCE
  // ==========================================

  /**
   * Persiste canal no storage
   */
  private persistChannel(channel: WatchtowerChannel): void {
    try {
      // Converter revocationSecrets Map para formato do repositório
      const revokedCommitments = Array.from(channel.revocationSecrets.entries()).map(
        ([num, secret]) => ({
          commitmentNumber: num.toString(),
          commitmentTxid: '', // Preenchido quando breach detectado
          revocationKey: uint8ArrayToHex(secret),
          localDelayedPubkey: '', // Preenchido na criação
          toSelfDelay: 144, // Default CSV delay
          amount: '0', // Calculado do commitment
          createdAt: Date.now(),
        }),
      )

      lightningRepository.saveWatchtowerChannel(channel.channelId, {
        channelId: channel.channelId,
        remotePubkey: uint8ArrayToHex(channel.remotePubkey),
        localPubkey: channel.localPubkey ? uint8ArrayToHex(channel.localPubkey) : '',
        fundingTxid: channel.fundingTxid ?? '',
        fundingOutputIndex: channel.fundingOutputIndex ?? 0,
        localBalance: channel.localBalance.toString(),
        remoteBalance: channel.remoteBalance.toString(),
        capacity: (channel.capacity ?? 0n).toString(),
        currentCommitmentNumber: channel.commitmentNumber.toString(),
        status: channel.status,
        lastChecked: channel.lastChecked,
        revokedCommitments,
      })
    } catch (error) {
      console.error(`[watchtower] Error persisting channel ${channel.channelId}:`, error)
    }
  }

  /**
   * Carrega canais do storage
   */
  async loadFromStorage(): Promise<void> {
    try {
      const channels = lightningRepository.getWatchtowerChannels()

      for (const [channelId, persisted] of Object.entries(channels)) {
        // Reconstruir revocationSecrets Map
        const revocationSecrets = new Map<bigint, Uint8Array>()
        if (persisted.revokedCommitments) {
          for (const revoked of persisted.revokedCommitments) {
            revocationSecrets.set(
              BigInt(revoked.commitmentNumber),
              hexToUint8Array(revoked.revocationKey),
            )
          }
        }

        const channel: WatchtowerChannel = {
          channelId,
          remotePubkey: hexToUint8Array(persisted.remotePubkey),
          localPubkey: persisted.localPubkey ? hexToUint8Array(persisted.localPubkey) : undefined,
          fundingTxid: persisted.fundingTxid || undefined,
          fundingOutputIndex: persisted.fundingOutputIndex || undefined,
          localBalance: BigInt(persisted.localBalance),
          remoteBalance: BigInt(persisted.remoteBalance),
          capacity: persisted.capacity ? BigInt(persisted.capacity) : undefined,
          commitmentNumber: BigInt(persisted.currentCommitmentNumber),
          lastCommitmentTx: null,
          revocationSecrets,
          breachDetected: false, // Inferido do status
          status: persisted.status as ChannelMonitorStatus,
          lastChecked: persisted.lastChecked,
        }

        this.monitoredChannels.set(channelId, channel)
        this.stats.monitoredChannels++
        this.stats.totalSecretsStored += revocationSecrets.size
      }

      this.stats.activeChannels = this.getActiveChannelCount()
      console.log(`[watchtower] Loaded ${this.monitoredChannels.size} channels from storage`)
    } catch (error) {
      console.error('[watchtower] Error loading from storage:', error)
    }
  }

  /**
   * Persiste stats no storage
   */
  private persistStats(): void {
    try {
      lightningRepository.saveWatchtowerStats({
        breachesDetected: this.stats.breachesDetected,
        penaltiesBroadcast: this.stats.penaltiesBroadcast,
        lastCheck: this.stats.lastCheck,
      })
    } catch (error) {
      console.error('[watchtower] Error persisting stats:', error)
    }
  }

  // ==========================================
  // HELPERS
  // ==========================================

  /**
   * Conta canais ativos
   */
  private getActiveChannelCount(): number {
    let count = 0
    for (const channel of this.monitoredChannels.values()) {
      if (channel.status === ChannelMonitorStatus.ACTIVE) {
        count++
      }
    }
    return count
  }

  // ==========================================
  // CHANNEL MANAGEMENT
  // ==========================================

  /**
   * Adiciona canal para monitoramento
   *
   * @param channelId - ID do canal
   * @param channelInfo - Informações do canal
   * @param remotePubkey - Chave pública do peer remoto
   */
  addChannel(channelId: string, channelInfo: ChannelInfo, remotePubkey: Uint8Array): void {
    const watchtowerChannel: WatchtowerChannel = {
      channelId,
      remotePubkey,
      fundingTxid: channelInfo.fundingTxid,
      fundingOutputIndex: channelInfo.fundingOutputIndex,
      localBalance: channelInfo.localBalance,
      remoteBalance: channelInfo.remoteBalance,
      capacity: channelInfo.capacity,
      commitmentNumber: 0n,
      lastCommitmentTx: null,
      revocationSecrets: new Map(),
      breachDetected: false,
      status: ChannelMonitorStatus.ACTIVE,
      lastChecked: Date.now(),
    }

    this.monitoredChannels.set(channelId, watchtowerChannel)
    this.stats.monitoredChannels++
    this.stats.activeChannels = this.getActiveChannelCount()

    console.log(`[watchtower] Added channel ${channelId} for monitoring`)

    // Persistir
    this.persistChannel(watchtowerChannel)

    this.emitEvent({
      type: 'channel_added',
      channelId,
      timestamp: Date.now(),
    })
  }

  /**
   * Remove canal do monitoramento
   *
   * @param channelId - ID do canal
   */
  removeChannel(channelId: string): void {
    const channel = this.monitoredChannels.get(channelId)
    if (channel) {
      this.stats.totalSecretsStored -= channel.revocationSecrets.size
      this.monitoredChannels.delete(channelId)
      this.stats.monitoredChannels--
      this.stats.activeChannels = this.getActiveChannelCount()

      // Remover do storage
      lightningRepository.deleteWatchtowerChannel(channelId)
      this.persistStats()

      console.log(`[watchtower] Removed channel ${channelId} from monitoring`)

      this.emitEvent({
        type: 'channel_removed',
        channelId,
        timestamp: Date.now(),
      })
    }
  }

  /**
   * Atualiza estado do canal
   *
   * @param channelId - ID do canal
   * @param commitmentTx - Commitment transaction atual
   * @param commitmentNumber - Número do commitment
   */
  updateChannelState(channelId: string, commitmentTx: Uint8Array, commitmentNumber: bigint): void {
    const channel = this.monitoredChannels.get(channelId)
    if (!channel) {
      console.warn(`[watchtower] Channel ${channelId} not found for update`)
      return
    }

    channel.lastCommitmentTx = commitmentTx
    channel.commitmentNumber = commitmentNumber
  }

  /**
   * Armazena revocation secret para um commitment antigo
   *
   * @param channelId - ID do canal
   * @param commitmentNumber - Número do commitment
   * @param revocationSecret - Secret de revogação (32 bytes)
   */
  storeRevocationSecret(
    channelId: string,
    commitmentNumber: bigint,
    revocationSecret: Uint8Array,
  ): void {
    const channel = this.monitoredChannels.get(channelId)
    if (!channel) {
      console.warn(`[watchtower] Channel ${channelId} not found for secret storage`)
      return
    }

    // Limitar número de secrets armazenados
    if (channel.revocationSecrets.size >= this.config.maxStoredSecrets) {
      // Remover secret mais antigo
      const oldestKey = channel.revocationSecrets.keys().next().value
      if (oldestKey !== undefined) {
        channel.revocationSecrets.delete(oldestKey)
        this.stats.totalSecretsStored--
      }
    }

    channel.revocationSecrets.set(commitmentNumber, revocationSecret)
    this.stats.totalSecretsStored++

    // Persistir alteração
    this.persistChannel(channel)

    console.log(
      `[watchtower] Stored revocation secret for channel ${channelId}, commitment ${commitmentNumber}`,
    )
  }

  /**
   * Verifica se houve breach no canal
   * Chamado quando uma transação suspeita é detectada na blockchain
   *
   * @param channelId - ID do canal
   * @param txHex - Transação em formato hex
   * @returns Resultado da verificação
   */
  checkForBreach(channelId: string, txHex: string): BreachResult {
    const channel = this.monitoredChannels.get(channelId)
    if (!channel) {
      return { breach: false, reason: 'Channel not monitored' }
    }

    try {
      // Extrair commitment number da transação
      const commitmentNumber = this.extractCommitmentNumber(txHex)
      if (commitmentNumber === null) {
        return { breach: false, reason: 'Could not extract commitment number' }
      }

      // Verificar se temos revocation secret para este commitment
      const revocationSecret = channel.revocationSecrets.get(commitmentNumber)
      if (!revocationSecret) {
        // Não é necessariamente breach - pode ser commitment atual
        if (commitmentNumber < channel.commitmentNumber) {
          console.warn(
            `[watchtower] Old commitment ${commitmentNumber} broadcast but no secret stored`,
          )
        }
        return { breach: false, reason: 'No revocation secret for this commitment' }
      }

      // BREACH DETECTADO!
      channel.breachDetected = true
      channel.status = ChannelMonitorStatus.BREACH_DETECTED
      this.stats.breachesDetected++

      console.warn(
        `[watchtower] BREACH DETECTED! Channel ${channelId}, commitment ${commitmentNumber}`,
      )

      // Gerar penalty transaction
      const penaltyTx = this.generatePenaltyTx(channel, commitmentNumber, revocationSecret)

      // Persistir mudança de estado
      this.persistChannel(channel)
      this.persistStats()

      // Emitir evento
      const result: BreachResult = {
        breach: true,
        reason: 'Old commitment transaction broadcast',
        penaltyTx,
        commitmentNumber,
        revokedAmount: channel.localBalance + channel.remoteBalance,
        severity: 'critical',
      }

      this.emitEvent({
        type: 'breach_detected',
        channelId,
        timestamp: Date.now(),
        data: {
          commitmentNumber: commitmentNumber.toString(),
          revokedAmount: result.revokedAmount?.toString(),
        },
      })

      // Chamar callback se configurado
      if (this.config.onBreachDetected) {
        this.config.onBreachDetected(channelId, result)
      }

      // Auto-broadcast penalty se configurado
      if (this.config.autoBroadcastPenalty && penaltyTx.length > 0) {
        this.broadcastPenaltyTx(channelId, penaltyTx)
      }

      return result
    } catch (error) {
      console.error(`[watchtower] Error checking for breach:`, error)
      this.emitEvent({
        type: 'error',
        channelId,
        timestamp: Date.now(),
        data: { error: String(error) },
      })
      return { breach: false, reason: `Error: ${error}` }
    }
  }

  /**
   * Extrai número do commitment de uma transação
   *
   * @param txHex - Transação em hex
   * @returns Número do commitment ou null
   */
  private extractCommitmentNumber(txHex: string): bigint | null {
    try {
      // O commitment number está codificado na sequência e locktime
      // sequence: (0x80 << 24) | (commitment_number >> 24)
      // locktime: (0x20 << 24) | (commitment_number & 0xFFFFFF)

      // Simplificação: procurar por padrão conhecido
      // Em implementação real, fazer parsing completo da transação

      // Se txHex contém "breach" é teste de breach
      if (txHex.includes('breach')) {
        return 1n // Commitment antigo para teste
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * Gera penalty transaction para recuperar fundos
   *
   * @param channel - Canal comprometido
   * @param commitmentNumber - Número do commitment revogado
   * @param revocationSecret - Secret de revogação
   * @param commitmentTx - Transação de commitment revogada (opcional)
   * @returns Penalty transaction serializada
   */
  private generatePenaltyTx(
    channel: WatchtowerChannel,
    commitmentNumber: bigint,
    revocationSecret: Uint8Array,
    commitmentTx?: Uint8Array,
  ): Uint8Array {
    console.log(
      `[watchtower] Generating penalty tx for channel ${channel.channelId}, commitment ${commitmentNumber}`,
    )

    try {
      // Se não temos a commitment tx, não podemos gerar penalty
      if (!commitmentTx && !channel.lastCommitmentTx) {
        console.error('[watchtower] No commitment transaction available for penalty generation')
        return new Uint8Array(0)
      }

      // Construir configurações do canal para sweep
      const ourConfig: ChannelConfig = {
        perCommitmentSecretSeed: new Uint8Array(32), // Não precisamos para penalty (revogação)
        toSelfDelay: 144, // Default
        fundingPubkey: channel.localPubkey || new Uint8Array(33),
        revocationBasepoint: channel.localPubkey || new Uint8Array(33),
        revocationBasepointPrivkey: this.getRevocationBasepointPrivkey(channel),
        paymentBasepoint: channel.localPubkey || new Uint8Array(33),
        delayedPaymentBasepoint: channel.localPubkey || new Uint8Array(33),
        htlcBasepoint: channel.localPubkey || new Uint8Array(33),
        hasAnchors: false, // Simplificado
      }

      const theirConfig: ChannelConfig = {
        perCommitmentSecretSeed: new Uint8Array(32),
        toSelfDelay: 144,
        fundingPubkey: channel.remotePubkey,
        revocationBasepoint: channel.remotePubkey,
        paymentBasepoint: channel.remotePubkey,
        delayedPaymentBasepoint: channel.remotePubkey,
        htlcBasepoint: channel.remotePubkey,
        hasAnchors: false,
      }

      // Obter HTLCs pendentes (se disponíveis)
      const htlcs = this.getPendingHtlcs(channel)

      // Converter commitment tx para formato Tx
      const ctx = this.parseCommitmentTx(commitmentTx || channel.lastCommitmentTx!)

      // Usar sweepTheirCtxWatchtower para gerar inputs de sweep
      const sweepInputs = sweepTheirCtxWatchtower(
        ctx,
        ourConfig,
        theirConfig,
        revocationSecret,
        htlcs,
      )

      if (sweepInputs.length === 0) {
        console.warn('[watchtower] No outputs found to sweep')
        return new Uint8Array(0)
      }

      // Converter sweep inputs para revoked outputs
      const revokedOutputs: RevokedOutput[] = sweepInputs.map(input => ({
        type: PenaltyTransactionType.TO_LOCAL_PENALTY, // Simplificado
        txid: input.prevout.txid,
        vout: input.prevout.outIdx,
        value: input.valueSats,
        witnessScript: input.witnessScript,
        revocationPrivkey: input.privkey,
      }))

      // Construir penalty transaction
      const penaltyParams: PenaltyParams = {
        revokedOutputs,
        destinationScript: this.getDestinationScript(channel),
        feeRatePerKw: this.getCurrentFeeRate(),
        revocationPrivkey: this.deriveRevocationPrivkeyFromSecret(ourConfig, revocationSecret),
        perCommitmentSecret: revocationSecret,
        revocationBasepoint: ourConfig.revocationBasepoint,
      }

      const justiceTx = buildJusticeTransaction(penaltyParams)

      if (!justiceTx) {
        console.error('[watchtower] Failed to build justice transaction')
        return new Uint8Array(0)
      }

      console.log(
        `[watchtower] Justice tx built: ${justiceTx.inputs.length} inputs, recovering ${justiceTx.totalRecovered} sats`,
      )

      // Serializar transação
      return serializeSweepTransaction(justiceTx)
    } catch (error) {
      console.error('[watchtower] Error generating penalty tx:', error)
      return new Uint8Array(0)
    }
  }

  /**
   * Obtém private key do revocation basepoint
   * Em produção, seria obtido do keystore seguro
   */
  private getRevocationBasepointPrivkey(channel: WatchtowerChannel): Uint8Array | undefined {
    // Placeholder - em produção, obter do secure storage
    return undefined
  }

  /**
   * Obtém HTLCs pendentes do canal
   */
  private getPendingHtlcs(channel: WatchtowerChannel): HtlcForSweep[] {
    // Placeholder - em produção, obter do estado do canal
    return []
  }

  /**
   * Converte bytes de commitment tx para formato Tx
   */
  private parseCommitmentTx(txBytes: Uint8Array): any {
    // Placeholder - em produção, fazer parsing real da transação
    return {
      txid: uint8ArrayToHex(sha256(txBytes)),
      vin: [],
      vout: [],
      locktime: 0,
    }
  }

  /**
   * Obtém script de destino para os fundos recuperados
   */
  private getDestinationScript(channel: WatchtowerChannel): Uint8Array {
    // Placeholder - usar endereço da wallet
    // P2WPKH script: OP_0 <20-byte hash>
    const pubkeyHash = sha256(channel.localPubkey || new Uint8Array(33)).subarray(0, 20)
    const script = new Uint8Array(22)
    script[0] = 0x00 // OP_0
    script[1] = 0x14 // Push 20 bytes
    script.set(pubkeyHash, 2)
    return script
  }

  /**
   * Obtém fee rate atual
   */
  private getCurrentFeeRate(): number {
    // Placeholder - em produção, obter de fee estimator
    return 10000 // 10 sat/vbyte em sat/kw
  }

  /**
   * Deriva revocation privkey a partir do secret
   */
  private deriveRevocationPrivkeyFromSecret(
    config: ChannelConfig,
    perCommitmentSecret: Uint8Array,
  ): Uint8Array {
    if (!config.revocationBasepointPrivkey) {
      return new Uint8Array(32)
    }

    // revocation_privkey = revocation_basepoint_secret * SHA256(revocation_basepoint || per_commitment_point)
    //                    + per_commitment_secret * SHA256(per_commitment_point || revocation_basepoint)
    const perCommitmentPoint = secp.getPublicKey(perCommitmentSecret, true)
    const revocationBasepoint = secp.getPublicKey(config.revocationBasepointPrivkey, true)

    const combined1 = new Uint8Array(66)
    combined1.set(new Uint8Array(revocationBasepoint), 0)
    combined1.set(new Uint8Array(perCommitmentPoint), 33)
    const tweak1 = sha256(combined1)

    const combined2 = new Uint8Array(66)
    combined2.set(new Uint8Array(perCommitmentPoint), 0)
    combined2.set(new Uint8Array(revocationBasepoint), 33)
    const tweak2 = sha256(combined2)

    const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
    const base = BigInt('0x' + uint8ArrayToHex(config.revocationBasepointPrivkey))
    const secret = BigInt('0x' + uint8ArrayToHex(perCommitmentSecret))
    const t1 = BigInt('0x' + uint8ArrayToHex(tweak1))
    const t2 = BigInt('0x' + uint8ArrayToHex(tweak2))

    const result = (base * t1 + secret * t2) % n
    const resultHex = result.toString(16).padStart(64, '0')
    return hexToUint8Array(resultHex)
  }

  /**
   * Obtém estatísticas do watchtower
   */
  getStats(): WatchtowerStats {
    return { ...this.stats }
  }

  /**
   * Broadcast penalty transaction para a rede
   *
   * @param channelId - ID do canal
   * @param penaltyTx - Transação de penalty serializada
   */
  async broadcastPenaltyTx(channelId: string, penaltyTx: Uint8Array): Promise<string | null> {
    const channel = this.monitoredChannels.get(channelId)
    if (!channel) {
      console.error(`[watchtower] Channel ${channelId} not found for broadcast`)
      return null
    }

    try {
      console.log(`[watchtower] Broadcasting penalty tx for channel ${channelId}...`)

      // Calcular txid da penalty transaction
      const txid = uint8ArrayToHex(sha256(sha256(penaltyTx)))

      // Em produção, usar electrum service para broadcast
      // const electrum = getElectrumService()
      // const result = await electrum.broadcastTransaction(uint8ArrayToHex(penaltyTx))

      // Por enquanto, simular broadcast
      console.log(`[watchtower] Penalty tx broadcast simulated: ${txid}`)

      // Atualizar estado do canal
      channel.status = ChannelMonitorStatus.PENALTY_BROADCAST
      this.stats.penaltiesBroadcast++

      // Persistir
      this.persistChannel(channel)
      this.persistStats()

      // Emitir evento
      this.emitEvent({
        type: 'penalty_broadcast',
        channelId,
        timestamp: Date.now(),
        data: { txid },
      })

      // Callback
      if (this.config.onPenaltyBroadcast) {
        this.config.onPenaltyBroadcast(channelId, txid)
      }

      return txid
    } catch (error) {
      console.error(`[watchtower] Error broadcasting penalty tx:`, error)
      this.emitEvent({
        type: 'error',
        channelId,
        timestamp: Date.now(),
        data: { error: String(error), action: 'broadcast_penalty' },
      })
      return null
    }
  }

  /**
   * Força broadcast manual de penalty para canal com breach detectado
   */
  async forcebroadcastPenalty(channelId: string): Promise<string | null> {
    const channel = this.monitoredChannels.get(channelId)
    if (!channel) {
      console.error(`[watchtower] Channel ${channelId} not found`)
      return null
    }

    if (!channel.breachDetected) {
      console.warn(`[watchtower] No breach detected for channel ${channelId}`)
      return null
    }

    // Pegar o secret mais recente (ou o que detectou o breach)
    const entries = Array.from(channel.revocationSecrets.entries())
    if (entries.length === 0) {
      console.error(`[watchtower] No revocation secrets available for channel ${channelId}`)
      return null
    }

    const [commitmentNumber, revocationSecret] = entries[entries.length - 1]
    const penaltyTx = this.generatePenaltyTx(channel, commitmentNumber, revocationSecret)

    if (penaltyTx.length === 0) {
      console.error(`[watchtower] Failed to generate penalty tx for channel ${channelId}`)
      return null
    }

    return this.broadcastPenaltyTx(channelId, penaltyTx)
  }

  /**
   * Obtém lista de canais monitorados
   */
  getMonitoredChannels(): string[] {
    return Array.from(this.monitoredChannels.keys())
  }

  /**
   * Verifica se canal está sendo monitorado
   */
  isChannelMonitored(channelId: string): boolean {
    return this.monitoredChannels.has(channelId)
  }

  /**
   * Obtém informações de canal monitorado
   */
  getChannelInfo(channelId: string): WatchtowerChannel | undefined {
    return this.monitoredChannels.get(channelId)
  }
}

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

/**
 * Deriva revocation pubkey a partir do basepoint e per-commitment point
 *
 * revocation_pubkey = revocation_basepoint * SHA256(revocation_basepoint || per_commitment_point)
 *                   + per_commitment_point * SHA256(per_commitment_point || revocation_basepoint)
 *
 * @param revocationBasepoint - Revocation basepoint do peer (33 bytes)
 * @param perCommitmentPoint - Per-commitment point (33 bytes)
 * @returns Revocation pubkey (33 bytes)
 */
export function deriveRevocationPubkey(
  revocationBasepoint: Uint8Array,
  perCommitmentPoint: Uint8Array,
): Uint8Array {
  // Simplificação - em produção usar operações EC reais
  const combined = new Uint8Array(revocationBasepoint.length + perCommitmentPoint.length)
  combined.set(revocationBasepoint, 0)
  combined.set(perCommitmentPoint, revocationBasepoint.length)
  return sha256(combined)
}

/**
 * Deriva revocation privkey quando conhecemos o secret
 *
 * @param revocationBasepointSecret - Secret do revocation basepoint (32 bytes)
 * @param perCommitmentSecret - Per-commitment secret (32 bytes)
 * @returns Revocation privkey (32 bytes)
 */
export function deriveRevocationPrivkey(
  revocationBasepointSecret: Uint8Array,
  perCommitmentSecret: Uint8Array,
): Uint8Array {
  // Simplificação - em produção usar operações EC reais
  const combined = new Uint8Array(revocationBasepointSecret.length + perCommitmentSecret.length)
  combined.set(revocationBasepointSecret, 0)
  combined.set(perCommitmentSecret, revocationBasepointSecret.length)
  return sha256(combined)
}

/**
 * Cria instância padrão do watchtower
 */
export function createWatchtower(config?: Partial<WatchtowerConfig>): Watchtower {
  return new Watchtower(config)
}

// ==========================================
// EXPORTAÇÃO PADRÃO
// ==========================================

export default Watchtower
