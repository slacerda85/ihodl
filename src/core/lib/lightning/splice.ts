/**
 * Splice - Adicionar/Remover fundos de canais Lightning
 *
 * Implementa o protocolo de splicing conforme proposta BOLT:
 * - Splice In: Adicionar fundos ao canal (on-chain → canal)
 * - Splice Out: Remover fundos do canal (canal → on-chain)
 *
 * O splicing permite modificar a capacidade de um canal sem fechá-lo,
 * mantendo o canal operacional durante todo o processo.
 *
 * Referência: https://github.com/lightning/bolts/pull/863
 */

import { uint8ArrayToHex, concatUint8Arrays } from '../utils/utils'
import { encodeTlvStream, decodeTlvStream } from './onion'
import {
  InteractiveTxNegotiator,
  InteractiveTxState,
  type InteractiveTxConfig,
  type ConstructedTx,
} from './interactiveTx'
import type { LocalConfig, RemoteConfig } from './commitment'

// ============================================================================
// Tipos locais para splice
// ============================================================================

/**
 * Input para splice (compatível com InteractiveTx)
 */
export interface SpliceTxInput {
  /** TX anterior serializada */
  prevTx: Uint8Array
  /** Output index da TX anterior */
  prevTxVout: number
  /** Valor em satoshis */
  value: bigint
  /** Sequence number */
  sequence?: number
}

/**
 * Output para splice
 */
export interface SpliceTxOutput {
  /** Valor em satoshis */
  value: bigint
  /** Script do output */
  script: Uint8Array
}

// ============================================================================
// TLV Helpers
// ============================================================================

/**
 * Converte Map para array de TLV (formato usado pelo encodeTlvStream)
 */
function mapToTlvArray(map: Map<bigint, Uint8Array>): { type: number; value: Uint8Array }[] {
  const result: { type: number; value: Uint8Array }[] = []
  for (const [type, value] of map) {
    result.push({ type: Number(type), value })
  }
  return result
}

/**
 * Converte array de TLV para Map (formato usado nas interfaces)
 */
function tlvArrayToMap(array: { type: bigint; value: Uint8Array }[]): Map<bigint, Uint8Array> {
  const result = new Map<bigint, Uint8Array>()
  for (const { type, value } of array) {
    result.set(type, value)
  }
  return result
}

// ============================================================================
// Constantes
// ============================================================================

/** Message type: splice_init (74) */
export const MSG_SPLICE_INIT = 74

/** Message type: splice_ack (76) */
export const MSG_SPLICE_ACK = 76

/** Message type: splice_locked (78) */
export const MSG_SPLICE_LOCKED = 78

/** Número mínimo de confirmações para splice */
export const SPLICE_MIN_DEPTH = 3

/** Timeout padrão para negociação de splice (ms) */
export const SPLICE_NEGOTIATION_TIMEOUT = 300000 // 5 minutos

/** Feature bit para splice (proposto) */
export const SPLICE_FEATURE_BIT = 62

// ============================================================================
// Tipos e Enums
// ============================================================================

/**
 * Estados do processo de splice
 */
export enum SpliceState {
  /** Nenhum splice em andamento */
  IDLE = 'idle',
  /** Splice iniciado, aguardando ack */
  AWAITING_ACK = 'awaiting_ack',
  /** Negociando transação de splice */
  NEGOTIATING = 'negotiating',
  /** Aguardando assinaturas */
  AWAITING_SIGNATURES = 'awaiting_signatures',
  /** Splice TX assinada, aguardando confirmação */
  AWAITING_CONFIRMATION = 'awaiting_confirmation',
  /** Splice TX confirmada, aguardando splice_locked */
  AWAITING_LOCKED = 'awaiting_locked',
  /** Splice completo */
  COMPLETED = 'completed',
  /** Splice abortado */
  ABORTED = 'aborted',
}

/**
 * Tipo de splice
 */
export enum SpliceType {
  /** Splice In: adicionar fundos (aumentar capacidade) */
  SPLICE_IN = 'splice_in',
  /** Splice Out: remover fundos (diminuir capacidade) */
  SPLICE_OUT = 'splice_out',
  /** Combinado: splice in e out simultaneamente */
  COMBINED = 'combined',
}

/**
 * Mensagem splice_init
 */
export interface SpliceInitMessage {
  /** Channel ID (32 bytes) */
  channelId: Uint8Array
  /** Funding feerate em sat/kw */
  fundingFeeratePerKw: number
  /** Locktime para a transação de splice */
  locktime: number
  /** Valor relativo que queremos adicionar (pode ser negativo para splice out) */
  relativeSatoshis: bigint
  /** Pubkey para o novo funding output */
  fundingPubkey: Uint8Array
  /** Flag: exigir confirmação para splice out */
  requireConfirmedInputs?: boolean
  /** TLV extensions */
  tlvs?: Map<bigint, Uint8Array>
}

/**
 * Mensagem splice_ack
 */
export interface SpliceAckMessage {
  /** Channel ID (32 bytes) */
  channelId: Uint8Array
  /** Valor relativo que o peer quer adicionar */
  relativeSatoshis: bigint
  /** Pubkey para o novo funding output */
  fundingPubkey: Uint8Array
  /** TLV extensions */
  tlvs?: Map<bigint, Uint8Array>
}

/**
 * Mensagem splice_locked
 */
export interface SpliceLockedMessage {
  /** Channel ID (32 bytes) */
  channelId: Uint8Array
  /** Next per-commitment point após splice */
  nextPerCommitmentPoint: Uint8Array
}

/**
 * Dados de um splice em andamento
 */
export interface SpliceData {
  /** ID único do splice */
  spliceId: string
  /** Tipo de splice */
  type: SpliceType
  /** Estado atual */
  state: SpliceState
  /** Somos o iniciador? */
  weInitiated: boolean
  /** Valor que nós estamos adicionando/removendo */
  ourRelativeSatoshis: bigint
  /** Valor que o peer está adicionando/removendo */
  theirRelativeSatoshis: bigint
  /** Novo valor total do canal após splice */
  newCapacity: bigint
  /** Novo funding output index */
  newFundingOutputIndex?: number
  /** Nova funding txid */
  newFundingTxid?: Uint8Array
  /** Transação de splice construída */
  spliceTx?: ConstructedTx
  /** Feerate negociado */
  feeratePerKw: number
  /** Locktime */
  locktime: number
  /** Confirmações da splice tx */
  confirmations: number
  /** Timestamp de início */
  startedAt: number
  /** Timestamp de última atualização */
  updatedAt: number
  /** Erro, se houver */
  error?: string
}

/**
 * Configuração para iniciar um splice
 */
export interface SpliceConfig {
  /** Valor a adicionar (positivo) ou remover (negativo) em satoshis */
  relativeSatoshis: bigint
  /** UTXOs para usar no splice in */
  inputs?: SpliceTxInput[]
  /** Endereço para splice out */
  outputAddress?: string
  /** Feerate em sat/kw */
  feeratePerKw?: number
  /** Locktime */
  locktime?: number
  /** Exigir inputs confirmados */
  requireConfirmedInputs?: boolean
}

/**
 * Resultado de operação de splice
 */
export interface SpliceResult {
  success: boolean
  spliceId?: string
  error?: string
  spliceTxid?: string
  newCapacity?: bigint
}

/**
 * Callback para eventos de splice
 */
export type SpliceEventCallback = (event: SpliceEvent) => void

/**
 * Evento de splice
 */
export interface SpliceEvent {
  type: 'state_change' | 'tx_broadcast' | 'confirmed' | 'locked' | 'error'
  channelId: string
  spliceId: string
  data: unknown
  timestamp: number
}

// ============================================================================
// Splice Manager
// ============================================================================

/**
 * Gerenciador de splice para um canal
 */
export class SpliceManager {
  private channelId: Uint8Array
  private currentCapacity: bigint
  private localPubkey: Uint8Array
  private remotePubkey: Uint8Array
  private localConfig: LocalConfig
  private remoteConfig: RemoteConfig

  private currentSplice: SpliceData | null = null
  private interactiveTx: InteractiveTxNegotiator | null = null
  private eventCallbacks: SpliceEventCallback[] = []

  constructor(params: {
    channelId: Uint8Array
    currentCapacity: bigint
    localPubkey: Uint8Array
    remotePubkey: Uint8Array
    localConfig: LocalConfig
    remoteConfig: RemoteConfig
  }) {
    this.channelId = params.channelId
    this.currentCapacity = params.currentCapacity
    this.localPubkey = params.localPubkey
    this.remotePubkey = params.remotePubkey
    this.localConfig = params.localConfig
    this.remoteConfig = params.remoteConfig
  }

  // ==========================================================================
  // Getters
  // ==========================================================================

  get state(): SpliceState {
    return this.currentSplice?.state ?? SpliceState.IDLE
  }

  get isActive(): boolean {
    return this.currentSplice !== null && this.currentSplice.state !== SpliceState.IDLE
  }

  get spliceData(): SpliceData | null {
    return this.currentSplice
  }

  // ==========================================================================
  // Iniciação de Splice
  // ==========================================================================

  /**
   * Inicia um splice
   */
  async initiateSplice(config: SpliceConfig): Promise<SpliceResult> {
    if (this.isActive) {
      return {
        success: false,
        error: 'Splice already in progress',
      }
    }

    // Validar config
    if (config.relativeSatoshis === 0n) {
      return {
        success: false,
        error: 'Relative satoshis cannot be zero',
      }
    }

    // Determinar tipo
    let type: SpliceType
    if (config.relativeSatoshis > 0n) {
      type = SpliceType.SPLICE_IN
      if (!config.inputs || config.inputs.length === 0) {
        return {
          success: false,
          error: 'Splice in requires inputs',
        }
      }
    } else {
      type = SpliceType.SPLICE_OUT
      if (!config.outputAddress) {
        return {
          success: false,
          error: 'Splice out requires output address',
        }
      }
    }

    // Calcular nova capacidade
    const newCapacity = this.currentCapacity + config.relativeSatoshis
    if (newCapacity <= 0n) {
      return {
        success: false,
        error: 'New capacity would be non-positive',
      }
    }

    // Criar splice data
    const spliceId = this.generateSpliceId()
    const now = Date.now()

    this.currentSplice = {
      spliceId,
      type,
      state: SpliceState.AWAITING_ACK,
      weInitiated: true,
      ourRelativeSatoshis: config.relativeSatoshis,
      theirRelativeSatoshis: 0n,
      newCapacity,
      feeratePerKw: config.feeratePerKw ?? 1000,
      locktime: config.locktime ?? 0,
      confirmations: 0,
      startedAt: now,
      updatedAt: now,
    }

    this.emitEvent({
      type: 'state_change',
      channelId: uint8ArrayToHex(this.channelId),
      spliceId,
      data: { state: SpliceState.AWAITING_ACK },
      timestamp: now,
    })

    return {
      success: true,
      spliceId,
    }
  }

  /**
   * Cria mensagem splice_init
   */
  createSpliceInitMessage(): SpliceInitMessage | null {
    if (!this.currentSplice || this.currentSplice.state !== SpliceState.AWAITING_ACK) {
      return null
    }

    return {
      channelId: this.channelId,
      fundingFeeratePerKw: this.currentSplice.feeratePerKw,
      locktime: this.currentSplice.locktime,
      relativeSatoshis: this.currentSplice.ourRelativeSatoshis,
      fundingPubkey: this.localPubkey,
    }
  }

  // ==========================================================================
  // Processamento de Mensagens
  // ==========================================================================

  /**
   * Processa splice_init recebido
   */
  async processSpliceInit(message: SpliceInitMessage): Promise<SpliceAckMessage | null> {
    if (this.isActive) {
      // Já temos um splice em andamento
      console.warn('[splice] Received splice_init but splice already in progress')
      return null
    }

    // Validar channel_id
    if (!this.compareBytes(message.channelId, this.channelId)) {
      console.error('[splice] Channel ID mismatch')
      return null
    }

    // Determinar tipo
    let type: SpliceType
    if (message.relativeSatoshis > 0n) {
      type = SpliceType.SPLICE_IN
    } else if (message.relativeSatoshis < 0n) {
      type = SpliceType.SPLICE_OUT
    } else {
      console.error('[splice] Relative satoshis cannot be zero')
      return null
    }

    // Calcular nova capacidade (apenas com contribuição do peer por enquanto)
    const newCapacity = this.currentCapacity + message.relativeSatoshis

    if (newCapacity <= 0n) {
      console.error('[splice] New capacity would be non-positive')
      return null
    }

    // Criar splice data
    const spliceId = this.generateSpliceId()
    const now = Date.now()

    this.currentSplice = {
      spliceId,
      type,
      state: SpliceState.NEGOTIATING,
      weInitiated: false,
      ourRelativeSatoshis: 0n, // Podemos adicionar nossa contribuição depois
      theirRelativeSatoshis: message.relativeSatoshis,
      newCapacity,
      feeratePerKw: message.fundingFeeratePerKw,
      locktime: message.locktime,
      confirmations: 0,
      startedAt: now,
      updatedAt: now,
    }

    this.emitEvent({
      type: 'state_change',
      channelId: uint8ArrayToHex(this.channelId),
      spliceId,
      data: { state: SpliceState.NEGOTIATING },
      timestamp: now,
    })

    // Retornar splice_ack
    return {
      channelId: this.channelId,
      relativeSatoshis: 0n, // Não estamos contribuindo por enquanto
      fundingPubkey: this.localPubkey,
    }
  }

  /**
   * Processa splice_ack recebido
   */
  async processSpliceAck(message: SpliceAckMessage): Promise<boolean> {
    if (!this.currentSplice || this.currentSplice.state !== SpliceState.AWAITING_ACK) {
      console.error('[splice] Unexpected splice_ack')
      return false
    }

    // Validar channel_id
    if (!this.compareBytes(message.channelId, this.channelId)) {
      console.error('[splice] Channel ID mismatch')
      return false
    }

    // Atualizar com contribuição do peer
    this.currentSplice.theirRelativeSatoshis = message.relativeSatoshis
    this.currentSplice.newCapacity =
      this.currentCapacity + this.currentSplice.ourRelativeSatoshis + message.relativeSatoshis

    // Verificar se tipo mudou para combined
    if (this.currentSplice.ourRelativeSatoshis > 0n && message.relativeSatoshis < 0n) {
      this.currentSplice.type = SpliceType.COMBINED
    } else if (this.currentSplice.ourRelativeSatoshis < 0n && message.relativeSatoshis > 0n) {
      this.currentSplice.type = SpliceType.COMBINED
    }

    // Transicionar para negociação de TX
    this.currentSplice.state = SpliceState.NEGOTIATING
    this.currentSplice.updatedAt = Date.now()

    // Iniciar interactive tx
    this.startInteractiveTx()

    this.emitEvent({
      type: 'state_change',
      channelId: uint8ArrayToHex(this.channelId),
      spliceId: this.currentSplice.spliceId,
      data: { state: SpliceState.NEGOTIATING },
      timestamp: Date.now(),
    })

    return true
  }

  /**
   * Processa splice_locked recebido
   */
  processSpliceLockedMessage(message: SpliceLockedMessage): boolean {
    if (!this.currentSplice) {
      console.error('[splice] No splice in progress')
      return false
    }

    if (
      this.currentSplice.state !== SpliceState.AWAITING_LOCKED &&
      this.currentSplice.state !== SpliceState.AWAITING_CONFIRMATION
    ) {
      console.error('[splice] Unexpected splice_locked')
      return false
    }

    // Validar channel_id
    if (!this.compareBytes(message.channelId, this.channelId)) {
      console.error('[splice] Channel ID mismatch')
      return false
    }

    // Splice completo!
    this.currentSplice.state = SpliceState.COMPLETED
    this.currentSplice.updatedAt = Date.now()

    this.emitEvent({
      type: 'locked',
      channelId: uint8ArrayToHex(this.channelId),
      spliceId: this.currentSplice.spliceId,
      data: {
        newCapacity: this.currentSplice.newCapacity.toString(),
        nextPerCommitmentPoint: uint8ArrayToHex(message.nextPerCommitmentPoint),
      },
      timestamp: Date.now(),
    })

    // Atualizar capacidade do canal
    this.currentCapacity = this.currentSplice.newCapacity

    return true
  }

  /**
   * Cria mensagem splice_locked
   */
  createSpliceLockedMessage(nextPerCommitmentPoint: Uint8Array): SpliceLockedMessage | null {
    if (!this.currentSplice) {
      return null
    }

    return {
      channelId: this.channelId,
      nextPerCommitmentPoint,
    }
  }

  // ==========================================================================
  // Interactive TX para Splice
  // ==========================================================================

  /**
   * Inicia negociação interactive tx
   * Nota: O InteractiveTxNegotiator requer uma configuração específica
   * que inclui fundingScript e outros parâmetros. Aqui criamos uma
   * configuração básica para splice.
   */
  private startInteractiveTx(): void {
    if (!this.currentSplice) return

    // Criar funding script para o novo canal
    const fundingScript = this.createSpliceFundingScript()

    const ourContrib =
      this.currentSplice.ourRelativeSatoshis > 0n ? this.currentSplice.ourRelativeSatoshis : 0n
    const peerContrib =
      this.currentSplice.theirRelativeSatoshis > 0n ? this.currentSplice.theirRelativeSatoshis : 0n

    const config: InteractiveTxConfig = {
      channelId: this.channelId,
      weAreInitiator: this.currentSplice.weInitiated,
      ourContribution: ourContrib,
      peerContribution: peerContrib,
      targetFeerate: this.currentSplice.feeratePerKw / 4, // Convert sat/kw to sat/vB
      locktime: this.currentSplice.locktime,
      fundingScript,
      ourInputs: [],
      ourChangeOutputs: [],
    }

    this.interactiveTx = new InteractiveTxNegotiator(config)
  }

  /**
   * Cria o funding script para splice
   */
  private createSpliceFundingScript(): Uint8Array {
    // P2WSH 2-of-2 multisig
    // OP_2 <local_pubkey> <remote_pubkey> OP_2 OP_CHECKMULTISIG
    const keys = [this.localPubkey, this.remotePubkey].sort((a, b) => {
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] - b[i]
      }
      return 0
    })

    const script = new Uint8Array(71) // 1 + 33 + 1 + 33 + 1 + 1 + 1
    let offset = 0
    script[offset++] = 0x52 // OP_2
    script[offset++] = 0x21 // Push 33 bytes
    script.set(keys[0], offset)
    offset += 33
    script[offset++] = 0x21 // Push 33 bytes
    script.set(keys[1], offset)
    offset += 33
    script[offset++] = 0x52 // OP_2
    script[offset++] = 0xae // OP_CHECKMULTISIG

    return script
  }

  /**
   * Configura inputs para o splice
   */
  configureInputs(inputs: SpliceTxInput[]): void {
    if (!this.currentSplice) return
    // Store inputs for later use in interactive tx
    // This would be used when starting the negotiation
  }

  /**
   * Configura output de troco para o splice
   */
  configureChangeOutput(value: bigint, script: Uint8Array): void {
    if (!this.currentSplice) return
    // Store change output for later use in interactive tx
  }

  /**
   * Processa mensagem de tx interativa
   */
  processInteractiveTxMessage(messageType: number, message: unknown): unknown | null {
    if (!this.interactiveTx) return null

    const result = this.interactiveTx.processMessage(messageType as never, message as never)

    // Verificar se negociação terminou
    if (result.state === InteractiveTxState.SUCCESS && this.currentSplice) {
      this.currentSplice.spliceTx = result.constructedTx
      this.currentSplice.state = SpliceState.AWAITING_SIGNATURES
      this.currentSplice.updatedAt = Date.now()

      this.emitEvent({
        type: 'state_change',
        channelId: uint8ArrayToHex(this.channelId),
        spliceId: this.currentSplice.spliceId,
        data: { state: SpliceState.AWAITING_SIGNATURES },
        timestamp: Date.now(),
      })
    }

    return result
  }

  // ==========================================================================
  // Confirmação e Finalização
  // ==========================================================================

  /**
   * Atualiza contagem de confirmações
   */
  updateConfirmations(confirmations: number): void {
    if (!this.currentSplice) return

    this.currentSplice.confirmations = confirmations
    this.currentSplice.updatedAt = Date.now()

    // Verificar se atingiu minimum depth
    if (
      confirmations >= SPLICE_MIN_DEPTH &&
      this.currentSplice.state === SpliceState.AWAITING_CONFIRMATION
    ) {
      this.currentSplice.state = SpliceState.AWAITING_LOCKED

      this.emitEvent({
        type: 'confirmed',
        channelId: uint8ArrayToHex(this.channelId),
        spliceId: this.currentSplice.spliceId,
        data: { confirmations },
        timestamp: Date.now(),
      })
    }
  }

  /**
   * Registra que a splice tx foi broadcast
   */
  onSpliceTxBroadcast(txid: Uint8Array): void {
    if (!this.currentSplice) return

    this.currentSplice.newFundingTxid = txid
    this.currentSplice.state = SpliceState.AWAITING_CONFIRMATION
    this.currentSplice.updatedAt = Date.now()

    this.emitEvent({
      type: 'tx_broadcast',
      channelId: uint8ArrayToHex(this.channelId),
      spliceId: this.currentSplice.spliceId,
      data: { txid: uint8ArrayToHex(txid) },
      timestamp: Date.now(),
    })
  }

  /**
   * Aborta splice em andamento
   */
  abort(reason: string): void {
    if (!this.currentSplice) return

    this.currentSplice.state = SpliceState.ABORTED
    this.currentSplice.error = reason
    this.currentSplice.updatedAt = Date.now()

    this.emitEvent({
      type: 'error',
      channelId: uint8ArrayToHex(this.channelId),
      spliceId: this.currentSplice.spliceId,
      data: { error: reason },
      timestamp: Date.now(),
    })

    // Limpar estado
    this.interactiveTx = null
  }

  /**
   * Limpa splice completo
   */
  clear(): void {
    this.currentSplice = null
    this.interactiveTx = null
  }

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  /**
   * Registra callback para eventos
   */
  onEvent(callback: SpliceEventCallback): void {
    this.eventCallbacks.push(callback)
  }

  /**
   * Remove callback
   */
  offEvent(callback: SpliceEventCallback): void {
    const index = this.eventCallbacks.indexOf(callback)
    if (index !== -1) {
      this.eventCallbacks.splice(index, 1)
    }
  }

  private emitEvent(event: SpliceEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event)
      } catch (e) {
        console.error('[splice] Error in event callback:', e)
      }
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private generateSpliceId(): string {
    const random = new Uint8Array(16)
    crypto.getRandomValues(random)
    return uint8ArrayToHex(random)
  }

  private compareBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  // ==========================================================================
  // Serialização
  // ==========================================================================

  /**
   * Exporta estado para JSON
   */
  toJSON(): object {
    return {
      channelId: uint8ArrayToHex(this.channelId),
      currentCapacity: this.currentCapacity.toString(),
      currentSplice: this.currentSplice
        ? {
            spliceId: this.currentSplice.spliceId,
            type: this.currentSplice.type,
            state: this.currentSplice.state,
            weInitiated: this.currentSplice.weInitiated,
            ourRelativeSatoshis: this.currentSplice.ourRelativeSatoshis.toString(),
            theirRelativeSatoshis: this.currentSplice.theirRelativeSatoshis.toString(),
            newCapacity: this.currentSplice.newCapacity.toString(),
            newFundingTxid: this.currentSplice.newFundingTxid
              ? uint8ArrayToHex(this.currentSplice.newFundingTxid)
              : null,
            feeratePerKw: this.currentSplice.feeratePerKw,
            confirmations: this.currentSplice.confirmations,
            startedAt: this.currentSplice.startedAt,
            updatedAt: this.currentSplice.updatedAt,
            error: this.currentSplice.error,
          }
        : null,
    }
  }
}

// ============================================================================
// Message Encoding/Decoding
// ============================================================================

/**
 * Codifica mensagem splice_init
 */
export function encodeSpliceInitMessage(msg: SpliceInitMessage): Uint8Array {
  const parts: Uint8Array[] = []

  // Type (2 bytes)
  const typeBytes = new Uint8Array(2)
  new DataView(typeBytes.buffer).setUint16(0, MSG_SPLICE_INIT, false)
  parts.push(typeBytes)

  // Channel ID (32 bytes)
  parts.push(msg.channelId)

  // Funding feerate (4 bytes)
  const feerateBytes = new Uint8Array(4)
  new DataView(feerateBytes.buffer).setUint32(0, msg.fundingFeeratePerKw, false)
  parts.push(feerateBytes)

  // Locktime (4 bytes)
  const locktimeBytes = new Uint8Array(4)
  new DataView(locktimeBytes.buffer).setUint32(0, msg.locktime, false)
  parts.push(locktimeBytes)

  // Relative satoshis (8 bytes, signed)
  const relativeBytes = new Uint8Array(8)
  const view = new DataView(relativeBytes.buffer)
  view.setBigInt64(0, msg.relativeSatoshis, false)
  parts.push(relativeBytes)

  // Funding pubkey (33 bytes)
  parts.push(msg.fundingPubkey)

  // TLVs
  if (msg.tlvs && msg.tlvs.size > 0) {
    parts.push(encodeTlvStream(mapToTlvArray(msg.tlvs)))
  }

  return concatUint8Arrays(parts)
}

/**
 * Decodifica mensagem splice_init
 */
export function decodeSpliceInitMessage(data: Uint8Array): SpliceInitMessage | null {
  try {
    let offset = 0

    // Skip type (2 bytes) - assumindo que já foi verificado
    offset += 2

    // Channel ID
    const channelId = data.slice(offset, offset + 32)
    offset += 32

    // Feerate
    const view = new DataView(data.buffer, data.byteOffset)
    const fundingFeeratePerKw = view.getUint32(offset, false)
    offset += 4

    // Locktime
    const locktime = view.getUint32(offset, false)
    offset += 4

    // Relative satoshis
    const relativeSatoshis = view.getBigInt64(offset, false)
    offset += 8

    // Funding pubkey
    const fundingPubkey = data.slice(offset, offset + 33)
    offset += 33

    // TLVs
    let tlvs: Map<bigint, Uint8Array> | undefined
    if (offset < data.length) {
      tlvs = tlvArrayToMap(decodeTlvStream(data.slice(offset)))
    }

    return {
      channelId,
      fundingFeeratePerKw,
      locktime,
      relativeSatoshis,
      fundingPubkey,
      tlvs,
    }
  } catch {
    return null
  }
}

/**
 * Codifica mensagem splice_ack
 */
export function encodeSpliceAckMessage(msg: SpliceAckMessage): Uint8Array {
  const parts: Uint8Array[] = []

  // Type (2 bytes)
  const typeBytes = new Uint8Array(2)
  new DataView(typeBytes.buffer).setUint16(0, MSG_SPLICE_ACK, false)
  parts.push(typeBytes)

  // Channel ID (32 bytes)
  parts.push(msg.channelId)

  // Relative satoshis (8 bytes, signed)
  const relativeBytes = new Uint8Array(8)
  const view = new DataView(relativeBytes.buffer)
  view.setBigInt64(0, msg.relativeSatoshis, false)
  parts.push(relativeBytes)

  // Funding pubkey (33 bytes)
  parts.push(msg.fundingPubkey)

  // TLVs
  if (msg.tlvs && msg.tlvs.size > 0) {
    parts.push(encodeTlvStream(mapToTlvArray(msg.tlvs)))
  }

  return concatUint8Arrays(parts)
}

/**
 * Decodifica mensagem splice_ack
 */
export function decodeSpliceAckMessage(data: Uint8Array): SpliceAckMessage | null {
  try {
    let offset = 0

    // Skip type
    offset += 2

    // Channel ID
    const channelId = data.slice(offset, offset + 32)
    offset += 32

    // Relative satoshis
    const view = new DataView(data.buffer, data.byteOffset)
    const relativeSatoshis = view.getBigInt64(offset, false)
    offset += 8

    // Funding pubkey
    const fundingPubkey = data.slice(offset, offset + 33)
    offset += 33

    // TLVs
    let tlvs: Map<bigint, Uint8Array> | undefined
    if (offset < data.length) {
      tlvs = tlvArrayToMap(decodeTlvStream(data.slice(offset)))
    }

    return {
      channelId,
      relativeSatoshis,
      fundingPubkey,
      tlvs,
    }
  } catch {
    return null
  }
}

/**
 * Codifica mensagem splice_locked
 */
export function encodeSpliceLockedMessage(msg: SpliceLockedMessage): Uint8Array {
  const parts: Uint8Array[] = []

  // Type (2 bytes)
  const typeBytes = new Uint8Array(2)
  new DataView(typeBytes.buffer).setUint16(0, MSG_SPLICE_LOCKED, false)
  parts.push(typeBytes)

  // Channel ID (32 bytes)
  parts.push(msg.channelId)

  // Next per-commitment point (33 bytes)
  parts.push(msg.nextPerCommitmentPoint)

  return concatUint8Arrays(parts)
}

/**
 * Decodifica mensagem splice_locked
 */
export function decodeSpliceLockedMessage(data: Uint8Array): SpliceLockedMessage | null {
  try {
    let offset = 0

    // Skip type
    offset += 2

    // Channel ID
    const channelId = data.slice(offset, offset + 32)
    offset += 32

    // Next per-commitment point
    const nextPerCommitmentPoint = data.slice(offset, offset + 33)
    offset += 33

    return {
      channelId,
      nextPerCommitmentPoint,
    }
  } catch {
    return null
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Verifica se splice é suportado pelas features
 */
export function isSpliceSupported(features: Uint8Array): boolean {
  // Feature bit 62/63 para splice
  const byteIndex = Math.floor(SPLICE_FEATURE_BIT / 8)
  const bitIndex = SPLICE_FEATURE_BIT % 8

  if (byteIndex >= features.length) {
    return false
  }

  // Verificar bit compulsório ou opcional
  const byte = features[features.length - 1 - byteIndex]
  return (byte & (1 << bitIndex)) !== 0 || (byte & (1 << (bitIndex + 1))) !== 0
}

/**
 * Calcula fee necessária para splice tx
 */
export function calculateSpliceFee(params: {
  numInputs: number
  numOutputs: number
  feeratePerKw: number
}): bigint {
  // Estimativa de peso:
  // Header: 10.5 vbytes
  // Input (P2WPKH witness): ~68 vbytes cada
  // Output (P2WPKH): 31 vbytes cada
  // Output (P2WSH funding): 43 vbytes

  const headerWeight = 42 // 10.5 * 4
  const inputWeight = params.numInputs * 272 // 68 * 4
  const outputWeight = (params.numOutputs - 1) * 124 + 172 // Regular + funding
  const totalWeight = headerWeight + inputWeight + outputWeight

  // Converter para fee
  const feePerWeight = params.feeratePerKw / 1000
  return BigInt(Math.ceil((totalWeight * feePerWeight) / 4))
}

/**
 * Valida parâmetros de splice
 */
export function validateSpliceParams(params: {
  currentCapacity: bigint
  relativeSatoshis: bigint
  dustLimit: bigint
}): { valid: boolean; error?: string } {
  const newCapacity = params.currentCapacity + params.relativeSatoshis

  if (newCapacity <= 0n) {
    return {
      valid: false,
      error: 'New capacity would be non-positive',
    }
  }

  if (newCapacity < params.dustLimit) {
    return {
      valid: false,
      error: 'New capacity below dust limit',
    }
  }

  // Limite prático de tamanho de canal (16M sats = 0.16 BTC)
  const maxCapacity = 16777215n * 1000n // 16M sats
  if (newCapacity > maxCapacity) {
    return {
      valid: false,
      error: 'New capacity exceeds maximum',
    }
  }

  return { valid: true }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Cria SpliceManager
 */
export function createSpliceManager(params: {
  channelId: Uint8Array
  currentCapacity: bigint
  localPubkey: Uint8Array
  remotePubkey: Uint8Array
  localConfig: LocalConfig
  remoteConfig: RemoteConfig
}): SpliceManager {
  return new SpliceManager(params)
}

// ============================================================================
// Exports
// ============================================================================

export default SpliceManager
