/**
 * BOLT #2: Interactive Transaction Construction
 *
 * Implementa o protocolo de construção interativa de transações para:
 * - Dual Funding (ambos contribuem para funding)
 * - Splicing (adicionar/remover fundos de canal aberto)
 * - RBF (Replace-By-Fee para funding transaction)
 *
 * Referência: https://github.com/lightning/bolts/blob/master/02-peer-protocol.md
 */

import { sha256, randomBytes } from '../crypto/crypto'
import { uint8ArrayToHex } from '../utils'
import {
  TxAddInputMessage,
  TxAddOutputMessage,
  TxRemoveInputMessage,
  TxRemoveOutputMessage,
  TxCompleteMessage,
  TxSignaturesMessage,
  TxAbortMessage,
} from '@/core/models/lightning/peer'
import { LightningMessageType } from '@/core/models/lightning/base'
import {
  encodeTxAddInputMessage,
  encodeTxAddOutputMessage,
  encodeTxCompleteMessage,
  encodeTxSignaturesMessage,
} from './peer'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Número máximo de inputs/outputs permitidos na negociação */
export const MAX_INPUTS_OUTPUTS = 252

/** Número máximo de rodadas de negociação */
export const MAX_NEGOTIATION_ROUNDS = 100

/** Timeout para negociação em ms */
export const NEGOTIATION_TIMEOUT_MS = 60000

/** Serial ID bit para determinar quem contribuiu (bit 0) */
export const SERIAL_ID_INITIATOR_BIT = 0n

// ============================================================================
// TYPES
// ============================================================================

/**
 * Estado da negociação interativa
 */
export enum InteractiveTxState {
  /** Aguardando início */
  IDLE = 'IDLE',
  /** Negociação em andamento - nossa vez */
  AWAITING_OUR_TURN = 'AWAITING_OUR_TURN',
  /** Negociação em andamento - vez do peer */
  AWAITING_PEER_TURN = 'AWAITING_PEER_TURN',
  /** Ambos enviaram tx_complete */
  TX_COMPLETE = 'TX_COMPLETE',
  /** Aguardando assinaturas */
  AWAITING_SIGNATURES = 'AWAITING_SIGNATURES',
  /** Transação construída com sucesso */
  SUCCESS = 'SUCCESS',
  /** Negociação abortada */
  ABORTED = 'ABORTED',
  /** Erro durante negociação */
  FAILED = 'FAILED',
}

/**
 * Input proposto para a transação
 */
export interface ProposedInput {
  serialId: bigint
  prevTx: Uint8Array
  prevTxVout: number
  sequence: number
  /** True se contribuído por nós */
  isOurs: boolean
  /** Valor do output sendo gasto (para validação) */
  value?: bigint
}

/**
 * Output proposto para a transação
 */
export interface ProposedOutput {
  serialId: bigint
  sats: bigint
  script: Uint8Array
  /** True se contribuído por nós */
  isOurs: boolean
}

/**
 * Estado completo da negociação
 */
export interface InteractiveTxNegotiationState {
  /** Estado atual */
  state: InteractiveTxState
  /** Channel ID sendo negociado */
  channelId: Uint8Array
  /** Se somos o iniciador */
  weAreInitiator: boolean
  /** Inputs propostos */
  inputs: Map<bigint, ProposedInput>
  /** Outputs propostos */
  outputs: Map<bigint, ProposedOutput>
  /** Se nós já enviamos tx_complete */
  weSentComplete: boolean
  /** Se peer já enviou tx_complete */
  peerSentComplete: boolean
  /** Contador de rodadas */
  roundCount: number
  /** Locktime da transação */
  locktime: number
  /** Feerate alvo em sat/vB */
  targetFeerate: number
  /** Nossa contribuição em satoshis */
  ourContribution: bigint
  /** Contribuição do peer em satoshis */
  peerContribution: bigint
  /** Timestamp de início */
  startTime: number
  /** Último serial ID que geramos */
  lastSerialId: bigint
}

/**
 * Resultado de processamento de mensagem
 */
export interface InteractiveTxResult {
  success: boolean
  state: InteractiveTxState
  messagesToSend: Uint8Array[]
  error?: string
  /** Transação construída (quando state = SUCCESS) */
  constructedTx?: ConstructedTx
}

/**
 * Transação construída
 */
export interface ConstructedTx {
  /** Inputs ordenados */
  inputs: {
    prevTxid: Uint8Array
    prevVout: number
    sequence: number
    serialId: bigint
  }[]
  /** Outputs ordenados */
  outputs: {
    value: bigint
    script: Uint8Array
    serialId: bigint
  }[]
  /** Locktime */
  locktime: number
  /** TXID calculado */
  txid: Uint8Array
  /** Índice do funding output */
  fundingOutputIndex: number
}

/**
 * Configuração para negociação
 */
export interface InteractiveTxConfig {
  /** Channel ID */
  channelId: Uint8Array
  /** Se somos o iniciador */
  weAreInitiator: boolean
  /** Nossa contribuição em satoshis */
  ourContribution: bigint
  /** Contribuição do peer em satoshis */
  peerContribution: bigint
  /** Feerate alvo em sat/vB */
  targetFeerate: number
  /** Locktime (default: 0) */
  locktime?: number
  /** Script do funding output */
  fundingScript: Uint8Array
  /** Inputs que queremos contribuir */
  ourInputs: {
    prevTx: Uint8Array
    prevTxVout: number
    value: bigint
    sequence?: number
  }[]
  /** Outputs de troco que queremos */
  ourChangeOutputs: {
    value: bigint
    script: Uint8Array
  }[]
}

// ============================================================================
// INTERACTIVE TX NEGOTIATOR
// ============================================================================

/**
 * Gerencia a negociação interativa de transação
 */
export class InteractiveTxNegotiator {
  private negotiation: InteractiveTxNegotiationState

  constructor(config: InteractiveTxConfig) {
    this.negotiation = {
      state: InteractiveTxState.IDLE,
      channelId: config.channelId,
      weAreInitiator: config.weAreInitiator,
      inputs: new Map(),
      outputs: new Map(),
      weSentComplete: false,
      peerSentComplete: false,
      roundCount: 0,
      locktime: config.locktime ?? 0,
      targetFeerate: config.targetFeerate,
      ourContribution: config.ourContribution,
      peerContribution: config.peerContribution,
      startTime: Date.now(),
      lastSerialId: 0n,
    }
  }

  /**
   * Retorna estado atual
   */
  getState(): InteractiveTxState {
    return this.negotiation.state
  }

  /**
   * Retorna estado completo da negociação
   */
  getNegotiationState(): InteractiveTxNegotiationState {
    return { ...this.negotiation }
  }

  /**
   * Inicia a negociação (chamado pelo iniciador)
   */
  start(config: InteractiveTxConfig): InteractiveTxResult {
    if (this.negotiation.state !== InteractiveTxState.IDLE) {
      return {
        success: false,
        state: this.negotiation.state,
        messagesToSend: [],
        error: 'Negotiation already started',
      }
    }

    const messages: Uint8Array[] = []

    // Adicionar nossos inputs
    for (const input of config.ourInputs) {
      const serialId = this.generateSerialId(true)
      const msg = this.createTxAddInput(serialId, input.prevTx, input.prevTxVout, input.sequence)
      messages.push(msg)

      this.negotiation.inputs.set(serialId, {
        serialId,
        prevTx: input.prevTx,
        prevTxVout: input.prevTxVout,
        sequence: input.sequence ?? 0xfffffffd,
        isOurs: true,
        value: input.value,
      })
    }

    // Adicionar funding output
    const fundingValue = config.ourContribution + config.peerContribution
    const fundingSerialId = this.generateSerialId(true)
    const fundingMsg = this.createTxAddOutput(fundingSerialId, fundingValue, config.fundingScript)
    messages.push(fundingMsg)

    this.negotiation.outputs.set(fundingSerialId, {
      serialId: fundingSerialId,
      sats: fundingValue,
      script: config.fundingScript,
      isOurs: true,
    })

    // Adicionar outputs de troco
    for (const output of config.ourChangeOutputs) {
      const serialId = this.generateSerialId(true)
      const msg = this.createTxAddOutput(serialId, output.value, output.script)
      messages.push(msg)

      this.negotiation.outputs.set(serialId, {
        serialId,
        sats: output.value,
        script: output.script,
        isOurs: true,
      })
    }

    // Se não temos mais para adicionar, enviar tx_complete
    if (this.shouldSendComplete()) {
      const completeMsg = this.createTxComplete()
      messages.push(completeMsg)
      this.negotiation.weSentComplete = true
    }

    this.negotiation.state = InteractiveTxState.AWAITING_PEER_TURN
    this.negotiation.roundCount++

    return {
      success: true,
      state: this.negotiation.state,
      messagesToSend: messages,
    }
  }

  /**
   * Processa mensagem recebida do peer
   */
  processMessage(
    messageType: LightningMessageType,
    message:
      | TxAddInputMessage
      | TxAddOutputMessage
      | TxRemoveInputMessage
      | TxRemoveOutputMessage
      | TxCompleteMessage
      | TxAbortMessage,
  ): InteractiveTxResult {
    // Verificar timeout
    if (Date.now() - this.negotiation.startTime > NEGOTIATION_TIMEOUT_MS) {
      this.negotiation.state = InteractiveTxState.FAILED
      return {
        success: false,
        state: this.negotiation.state,
        messagesToSend: [],
        error: 'Negotiation timeout',
      }
    }

    // Verificar limite de rodadas
    if (this.negotiation.roundCount >= MAX_NEGOTIATION_ROUNDS) {
      this.negotiation.state = InteractiveTxState.FAILED
      return {
        success: false,
        state: this.negotiation.state,
        messagesToSend: [this.createTxAbort('Too many negotiation rounds')],
        error: 'Too many negotiation rounds',
      }
    }

    switch (messageType) {
      case LightningMessageType.TX_ADD_INPUT:
        return this.handleTxAddInput(message as TxAddInputMessage)

      case LightningMessageType.TX_ADD_OUTPUT:
        return this.handleTxAddOutput(message as TxAddOutputMessage)

      case LightningMessageType.TX_REMOVE_INPUT:
        return this.handleTxRemoveInput(message as TxRemoveInputMessage)

      case LightningMessageType.TX_REMOVE_OUTPUT:
        return this.handleTxRemoveOutput(message as TxRemoveOutputMessage)

      case LightningMessageType.TX_COMPLETE:
        return this.handleTxComplete(message as TxCompleteMessage)

      case LightningMessageType.TX_ABORT:
        return this.handleTxAbort(message as TxAbortMessage)

      default:
        return {
          success: false,
          state: this.negotiation.state,
          messagesToSend: [],
          error: `Unexpected message type: ${messageType}`,
        }
    }
  }

  /**
   * Processa tx_add_input do peer
   */
  private handleTxAddInput(msg: TxAddInputMessage): InteractiveTxResult {
    // Validar serial ID (bit 0 deve indicar que é do peer)
    const isFromInitiator = (msg.serialId & 1n) === SERIAL_ID_INITIATOR_BIT
    if (isFromInitiator === this.negotiation.weAreInitiator) {
      return this.failWithAbort('Invalid serial_id parity for tx_add_input')
    }

    // Verificar duplicata
    if (this.negotiation.inputs.has(msg.serialId)) {
      return this.failWithAbort('Duplicate serial_id for tx_add_input')
    }

    // Verificar limite de inputs
    if (this.negotiation.inputs.size >= MAX_INPUTS_OUTPUTS) {
      return this.failWithAbort('Too many inputs')
    }

    // Adicionar input
    this.negotiation.inputs.set(msg.serialId, {
      serialId: msg.serialId,
      prevTx: msg.prevtx,
      prevTxVout: msg.prevtxVout,
      sequence: msg.sequence,
      isOurs: false,
    })

    // Reset peer complete flag (novo input invalida tx_complete anterior)
    this.negotiation.peerSentComplete = false

    return this.continueNegotiation()
  }

  /**
   * Processa tx_add_output do peer
   */
  private handleTxAddOutput(msg: TxAddOutputMessage): InteractiveTxResult {
    // Validar serial ID
    const isFromInitiator = (msg.serialId & 1n) === SERIAL_ID_INITIATOR_BIT
    if (isFromInitiator === this.negotiation.weAreInitiator) {
      return this.failWithAbort('Invalid serial_id parity for tx_add_output')
    }

    // Verificar duplicata
    if (this.negotiation.outputs.has(msg.serialId)) {
      return this.failWithAbort('Duplicate serial_id for tx_add_output')
    }

    // Verificar limite de outputs
    if (this.negotiation.outputs.size >= MAX_INPUTS_OUTPUTS) {
      return this.failWithAbort('Too many outputs')
    }

    // Adicionar output
    this.negotiation.outputs.set(msg.serialId, {
      serialId: msg.serialId,
      sats: msg.sats,
      script: msg.script,
      isOurs: false,
    })

    // Reset peer complete flag
    this.negotiation.peerSentComplete = false

    return this.continueNegotiation()
  }

  /**
   * Processa tx_remove_input do peer
   */
  private handleTxRemoveInput(msg: TxRemoveInputMessage): InteractiveTxResult {
    // Verificar se input existe e é do peer
    const input = this.negotiation.inputs.get(msg.serialId)
    if (!input) {
      return this.failWithAbort('Unknown serial_id for tx_remove_input')
    }

    if (input.isOurs) {
      return this.failWithAbort('Cannot remove input that is not yours')
    }

    this.negotiation.inputs.delete(msg.serialId)
    this.negotiation.peerSentComplete = false

    return this.continueNegotiation()
  }

  /**
   * Processa tx_remove_output do peer
   */
  private handleTxRemoveOutput(msg: TxRemoveOutputMessage): InteractiveTxResult {
    // Verificar se output existe e é do peer
    const output = this.negotiation.outputs.get(msg.serialId)
    if (!output) {
      return this.failWithAbort('Unknown serial_id for tx_remove_output')
    }

    if (output.isOurs) {
      return this.failWithAbort('Cannot remove output that is not yours')
    }

    this.negotiation.outputs.delete(msg.serialId)
    this.negotiation.peerSentComplete = false

    return this.continueNegotiation()
  }

  /**
   * Processa tx_complete do peer
   */
  private handleTxComplete(_msg: TxCompleteMessage): InteractiveTxResult {
    this.negotiation.peerSentComplete = true

    // Se ambos enviaram complete, construir transação
    if (this.negotiation.weSentComplete && this.negotiation.peerSentComplete) {
      return this.finishNegotiation()
    }

    // Senão, nossa vez de responder
    const messages: Uint8Array[] = []

    // Se não temos mais para adicionar, enviar tx_complete
    if (this.shouldSendComplete()) {
      messages.push(this.createTxComplete())
      this.negotiation.weSentComplete = true

      if (this.negotiation.peerSentComplete) {
        return this.finishNegotiation()
      }
    }

    this.negotiation.state = InteractiveTxState.AWAITING_PEER_TURN
    return {
      success: true,
      state: this.negotiation.state,
      messagesToSend: messages,
    }
  }

  /**
   * Processa tx_abort do peer
   */
  private handleTxAbort(msg: TxAbortMessage): InteractiveTxResult {
    this.negotiation.state = InteractiveTxState.ABORTED
    const errorText = new TextDecoder().decode(msg.data)

    return {
      success: false,
      state: this.negotiation.state,
      messagesToSend: [],
      error: `Peer aborted: ${errorText}`,
    }
  }

  /**
   * Continua a negociação após processar mensagem
   */
  private continueNegotiation(): InteractiveTxResult {
    this.negotiation.roundCount++
    const messages: Uint8Array[] = []

    // Verificar se devemos enviar tx_complete
    if (this.shouldSendComplete() && !this.negotiation.weSentComplete) {
      messages.push(this.createTxComplete())
      this.negotiation.weSentComplete = true

      if (this.negotiation.peerSentComplete) {
        return this.finishNegotiation()
      }
    }

    this.negotiation.state = InteractiveTxState.AWAITING_PEER_TURN

    return {
      success: true,
      state: this.negotiation.state,
      messagesToSend: messages,
    }
  }

  /**
   * Finaliza a negociação e constrói a transação
   */
  private finishNegotiation(): InteractiveTxResult {
    // Validar transação
    const validationError = this.validateConstructedTx()
    if (validationError) {
      return this.failWithAbort(validationError)
    }

    // Construir transação
    const constructedTx = this.buildConstructedTx()

    this.negotiation.state = InteractiveTxState.TX_COMPLETE

    return {
      success: true,
      state: this.negotiation.state,
      messagesToSend: [],
      constructedTx,
    }
  }

  /**
   * Valida a transação construída
   */
  private validateConstructedTx(): string | null {
    // Deve ter pelo menos um input
    if (this.negotiation.inputs.size === 0) {
      return 'No inputs in transaction'
    }

    // Deve ter pelo menos um output
    if (this.negotiation.outputs.size === 0) {
      return 'No outputs in transaction'
    }

    // Calcular valor total de inputs (se conhecido)
    let totalInputValue = 0n
    let allInputValuesKnown = true
    for (const input of this.negotiation.inputs.values()) {
      if (input.value !== undefined) {
        totalInputValue += input.value
      } else {
        allInputValuesKnown = false
      }
    }

    // Calcular valor total de outputs
    let totalOutputValue = 0n
    for (const output of this.negotiation.outputs.values()) {
      totalOutputValue += output.sats
    }

    // Verificar que inputs >= outputs (se valores conhecidos)
    if (allInputValuesKnown && totalInputValue < totalOutputValue) {
      return 'Insufficient input value for outputs'
    }

    return null
  }

  /**
   * Constrói a transação final
   */
  private buildConstructedTx(): ConstructedTx {
    // Ordenar inputs por serial_id
    const sortedInputs = Array.from(this.negotiation.inputs.values()).sort((a, b) =>
      a.serialId < b.serialId ? -1 : a.serialId > b.serialId ? 1 : 0,
    )

    // Ordenar outputs por serial_id
    const sortedOutputs = Array.from(this.negotiation.outputs.values()).sort((a, b) =>
      a.serialId < b.serialId ? -1 : a.serialId > b.serialId ? 1 : 0,
    )

    // Converter para formato de transação
    const inputs = sortedInputs.map(input => {
      // Extrair txid do prevTx (sha256 do tx serializado, reversed)
      const prevTxid = this.extractTxid(input.prevTx)
      return {
        prevTxid,
        prevVout: input.prevTxVout,
        sequence: input.sequence,
        serialId: input.serialId,
      }
    })

    const outputs = sortedOutputs.map(output => ({
      value: output.sats,
      script: output.script,
      serialId: output.serialId,
    }))

    // Encontrar funding output (maior valor com script de funding)
    const fundingValue = this.negotiation.ourContribution + this.negotiation.peerContribution
    const fundingOutputIndex = outputs.findIndex(o => o.value === fundingValue)

    // Calcular TXID (simplificado - em produção usar serialização completa)
    const txid = this.calculateTxid(inputs, outputs, this.negotiation.locktime)

    return {
      inputs,
      outputs,
      locktime: this.negotiation.locktime,
      txid,
      fundingOutputIndex: fundingOutputIndex >= 0 ? fundingOutputIndex : 0,
    }
  }

  /**
   * Extrai txid de uma transação serializada
   */
  private extractTxid(prevTx: Uint8Array): Uint8Array {
    // Txid = double sha256 da tx, reversed
    const hash1 = sha256(prevTx)
    const hash2 = sha256(hash1)
    // Reverse para little-endian
    const reversed = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      reversed[i] = hash2[31 - i]
    }
    return reversed
  }

  /**
   * Calcula TXID (placeholder - implementação simplificada)
   */
  private calculateTxid(
    inputs: ConstructedTx['inputs'],
    outputs: ConstructedTx['outputs'],
    locktime: number,
  ): Uint8Array {
    // Em produção, serializar a transação completa e fazer double sha256
    // Por enquanto, hash dos componentes
    const parts: Uint8Array[] = []

    for (const input of inputs) {
      parts.push(input.prevTxid)
      parts.push(new Uint8Array([input.prevVout & 0xff, (input.prevVout >> 8) & 0xff]))
    }

    for (const output of outputs) {
      const valBuf = new Uint8Array(8)
      const view = new DataView(valBuf.buffer)
      view.setBigUint64(0, output.value, true) // little-endian
      parts.push(valBuf)
      parts.push(output.script)
    }

    const lockBuf = new Uint8Array(4)
    new DataView(lockBuf.buffer).setUint32(0, locktime, true)
    parts.push(lockBuf)

    const combined = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
    let offset = 0
    for (const p of parts) {
      combined.set(p, offset)
      offset += p.length
    }

    return sha256(sha256(combined))
  }

  /**
   * Verifica se devemos enviar tx_complete
   */
  private shouldSendComplete(): boolean {
    // Por enquanto, sempre complete após adicionar nossos inputs/outputs
    // Em implementação real, verificar se temos mais para adicionar
    return true
  }

  /**
   * Gera serial ID único
   */
  private generateSerialId(isOurs: boolean): bigint {
    // Serial ID: número aleatório com bit 0 indicando quem contribuiu
    // bit 0 = 0: iniciador, bit 0 = 1: não-iniciador
    const randomPart = BigInt('0x' + uint8ArrayToHex(randomBytes(8))) & ~1n

    const parityBit =
      this.negotiation.weAreInitiator === isOurs
        ? SERIAL_ID_INITIATOR_BIT
        : SERIAL_ID_INITIATOR_BIT ^ 1n

    const serialId = randomPart | parityBit
    this.negotiation.lastSerialId = serialId

    return serialId
  }

  /**
   * Cria mensagem tx_add_input
   */
  private createTxAddInput(
    serialId: bigint,
    prevTx: Uint8Array,
    prevTxVout: number,
    sequence?: number,
  ): Uint8Array {
    const msg: TxAddInputMessage = {
      type: LightningMessageType.TX_ADD_INPUT,
      channelId: this.negotiation.channelId,
      serialId,
      prevtxLen: prevTx.length,
      prevtx: prevTx,
      prevtxVout: prevTxVout,
      sequence: sequence ?? 0xfffffffd,
    }
    return encodeTxAddInputMessage(msg)
  }

  /**
   * Cria mensagem tx_add_output
   */
  private createTxAddOutput(serialId: bigint, sats: bigint, script: Uint8Array): Uint8Array {
    const msg: TxAddOutputMessage = {
      type: LightningMessageType.TX_ADD_OUTPUT,
      channelId: this.negotiation.channelId,
      serialId,
      sats,
      scriptlen: script.length,
      script,
    }
    return encodeTxAddOutputMessage(msg)
  }

  /**
   * Cria mensagem tx_complete
   */
  private createTxComplete(): Uint8Array {
    const msg: TxCompleteMessage = {
      type: LightningMessageType.TX_COMPLETE,
      channelId: this.negotiation.channelId,
    }
    return encodeTxCompleteMessage(msg)
  }

  /**
   * Cria mensagem tx_abort
   */
  private createTxAbort(reason: string): Uint8Array {
    const data = new TextEncoder().encode(reason)
    // Formato: type (2) + channelId (32) + len (2) + data
    const result = new Uint8Array(2 + 32 + 2 + data.length)
    const view = new DataView(result.buffer)

    view.setUint16(0, LightningMessageType.TX_ABORT, false)
    result.set(this.negotiation.channelId, 2)
    view.setUint16(34, data.length, false)
    result.set(data, 36)

    return result
  }

  /**
   * Falha a negociação e envia tx_abort
   */
  private failWithAbort(reason: string): InteractiveTxResult {
    this.negotiation.state = InteractiveTxState.FAILED
    return {
      success: false,
      state: this.negotiation.state,
      messagesToSend: [this.createTxAbort(reason)],
      error: reason,
    }
  }

  /**
   * Recebe assinaturas do peer
   */
  processSignatures(msg: TxSignaturesMessage): InteractiveTxResult {
    if (this.negotiation.state !== InteractiveTxState.TX_COMPLETE) {
      return {
        success: false,
        state: this.negotiation.state,
        messagesToSend: [],
        error: 'Not ready to receive signatures',
      }
    }

    // Em produção: verificar assinaturas e aplicar à transação
    this.negotiation.state = InteractiveTxState.SUCCESS

    return {
      success: true,
      state: this.negotiation.state,
      messagesToSend: [],
    }
  }

  /**
   * Envia nossas assinaturas para a transação
   */
  createSignaturesMessage(witnesses: { witnessData: Uint8Array }[]): Uint8Array {
    const constructedTx = this.buildConstructedTx()

    const msg: TxSignaturesMessage = {
      type: LightningMessageType.TX_SIGNATURES,
      channelId: this.negotiation.channelId,
      txid: constructedTx.txid,
      numWitnesses: witnesses.length,
      witnesses: witnesses.map(w => ({
        len: w.witnessData.length,
        witnessData: w.witnessData,
      })),
    }

    return encodeTxSignaturesMessage(msg)
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Cria uma configuração básica para dual funding
 */
export function createDualFundingConfig(params: {
  channelId: Uint8Array
  weAreInitiator: boolean
  ourAmount: bigint
  peerAmount: bigint
  fundingScript: Uint8Array
  ourInputs: {
    prevTx: Uint8Array
    prevTxVout: number
    value: bigint
  }[]
  changeScript?: Uint8Array
  targetFeerate: number
}): InteractiveTxConfig {
  const changeOutputs: InteractiveTxConfig['ourChangeOutputs'] = []

  // Calcular troco
  const totalInputValue = params.ourInputs.reduce((sum, i) => sum + i.value, 0n)
  const estimatedFee = BigInt(params.targetFeerate * 200) // Estimativa simplificada

  if (totalInputValue > params.ourAmount + estimatedFee && params.changeScript) {
    changeOutputs.push({
      value: totalInputValue - params.ourAmount - estimatedFee,
      script: params.changeScript,
    })
  }

  return {
    channelId: params.channelId,
    weAreInitiator: params.weAreInitiator,
    ourContribution: params.ourAmount,
    peerContribution: params.peerAmount,
    targetFeerate: params.targetFeerate,
    fundingScript: params.fundingScript,
    ourInputs: params.ourInputs,
    ourChangeOutputs: changeOutputs,
  }
}

/**
 * Verifica se uma mensagem é parte do protocolo Interactive TX
 */
export function isInteractiveTxMessage(messageType: number): boolean {
  return (
    messageType === LightningMessageType.TX_ADD_INPUT ||
    messageType === LightningMessageType.TX_ADD_OUTPUT ||
    messageType === LightningMessageType.TX_REMOVE_INPUT ||
    messageType === LightningMessageType.TX_REMOVE_OUTPUT ||
    messageType === LightningMessageType.TX_COMPLETE ||
    messageType === LightningMessageType.TX_SIGNATURES ||
    messageType === LightningMessageType.TX_INIT_RBF ||
    messageType === LightningMessageType.TX_ACK_RBF ||
    messageType === LightningMessageType.TX_ABORT
  )
}
