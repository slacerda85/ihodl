// BOLT #2: Channel State Machine
// Gerencia o estado completo de um canal Lightning

import { sha256 } from '../crypto/crypto'
import { uint8ArrayToHex } from '../utils/utils'
import { HTLCManager, HTLCOwner, UpdateAddHtlc } from './htlc'
import { RevocationStore, getPerCommitmentSecretFromSeed, secretToPoint } from './revocation'
import {
  CommitmentBuilder,
  LocalConfig,
  RemoteConfig,
  CommitmentTx,
  ChannelType,
  DUST_LIMIT_P2WPKH,
  fundingOutputScript,
} from './commitment'
import { LightningMessageType } from '../../models/lightning/base'
import {
  encodeOpenChannelMessage,
  encodeAcceptChannelMessage,
  encodeFundingSignedMessage,
  encodeUpdateAddHtlcMessage,
  encodeUpdateFulfillHtlcMessage,
  encodeUpdateFailHtlcMessage,
  encodeCommitmentSignedMessage,
  encodeRevokeAndAckMessage,
  encodeShutdownMessage,
  encodeChannelReestablishMessage,
} from './peer'
import { signMessage, verifyMessage, hash256 } from '../crypto/crypto'
import { BITCOIN_CHAIN_HASH } from '../../models/lightning/p2p'

// ==========================================
// TIPOS E ENUMS
// ==========================================

/**
 * Estados do canal conforme BOLT #2
 */
export enum ChannelState {
  /** Canal sendo criado, aguardando open_channel */
  PREOPENING = 'PREOPENING',
  /** Negociação inicial (open_channel/accept_channel) */
  OPENING = 'OPENING',
  /** Aguardando funding transaction ser criada */
  FUNDED = 'FUNDED',
  /** Aguardando confirmações da funding tx */
  WAITING_FOR_FUNDING_CONFIRMED = 'WAITING_FOR_FUNDING_CONFIRMED',
  /** Aguardando channel_ready do peer */
  WAITING_FOR_CHANNEL_READY = 'WAITING_FOR_CHANNEL_READY',
  /** Canal operacional */
  OPEN = 'OPEN',
  /** Shutdown iniciado, aguardando HTLCs serem resolvidos */
  SHUTDOWN = 'SHUTDOWN',
  /** Negociando closing transaction */
  NEGOTIATING_CLOSING = 'NEGOTIATING_CLOSING',
  /** Closing transaction broadcast */
  CLOSING = 'CLOSING',
  /** Force close iniciado por nós */
  FORCE_CLOSING = 'FORCE_CLOSING',
  /** Canal fechado */
  CLOSED = 'CLOSED',
  /** Estado de erro/recuperação */
  REESTABLISHING = 'REESTABLISHING',
}

/**
 * Flags do canal
 */
export enum ChannelFlags {
  /** Canal anunciado (gossip) */
  ANNOUNCE_CHANNEL = 0x01,
  /** Somos o fundador */
  WE_ARE_FUNDER = 0x02,
  /** Option_upfront_shutdown_script negociado */
  OPTION_UPFRONT_SHUTDOWN = 0x04,
  /** Static_remotekey negociado */
  OPTION_STATIC_REMOTEKEY = 0x08,
  /** Anchor outputs negociados */
  OPTION_ANCHORS = 0x10,
  /** Zero fee HTLC anchors */
  OPTION_ANCHORS_ZERO_FEE = 0x20,
}

/**
 * Informações do canal para persistência
 */
export interface ChannelInfo {
  /** ID do canal (short_channel_id) - 8 bytes */
  channelId?: Uint8Array
  /** Temporary channel ID durante abertura */
  tempChannelId: Uint8Array
  /** Node ID do peer */
  peerId: Uint8Array
  /** Estado atual */
  state: ChannelState
  /** Flags */
  flags: number
  /** Funding txid */
  fundingTxid?: Uint8Array
  /** Funding output index */
  fundingOutputIndex?: number
  /** Valor total do canal em satoshis */
  fundingSatoshis: bigint
  /** Feerate atual em sat/kw */
  feeratePerKw: number
  /** Configuração local */
  localConfig: LocalConfig
  /** Configuração remota */
  remoteConfig: RemoteConfig
  /** Número de confirmações atuais */
  fundingConfirmations: number
  /** Confirmações necessárias */
  minimumDepth: number
  /** Short channel ID (após confirmação) */
  shortChannelId?: bigint
  /** Timestamp de criação */
  createdAt: number
  /** Timestamp de última atualização */
  updatedAt: number
}

/**
 * Resultado de uma operação de canal
 */
export interface ChannelOperationResult {
  success: boolean
  message?: string
  error?: Error
  data?: unknown
}

/**
 * Mensagem pendente para enviar
 */
export interface PendingMessage {
  type: string
  payload: Uint8Array
  timestamp: number
}

// ==========================================
// CHANNEL MANAGER
// ==========================================

/**
 * ChannelManager - Gerencia o estado de um único canal
 *
 * Responsabilidades:
 * - Manter estado do canal
 * - Coordenar HTLCManager e CommitmentBuilder
 * - Processar mensagens do protocolo
 * - Gerenciar transições de estado
 */
export class ChannelManager {
  private info: ChannelInfo
  private htlcManager: HTLCManager
  private commitmentBuilder?: CommitmentBuilder
  private localRevocationStore: RevocationStore
  private remoteRevocationStore: RevocationStore
  private pendingMessages: PendingMessage[] = []
  private nextLocalHtlcId: bigint = 0n

  // Callbacks
  private onStateChange?: (oldState: ChannelState, newState: ChannelState) => void
  private onMessage?: (type: string, payload: Uint8Array) => void

  constructor(params: {
    tempChannelId: Uint8Array
    peerId: Uint8Array
    fundingSatoshis: bigint
    localConfig: LocalConfig
    remoteConfig?: RemoteConfig
    weAreFunder: boolean
    announceChannel?: boolean
  }) {
    const now = Date.now()

    this.info = {
      tempChannelId: params.tempChannelId,
      peerId: params.peerId,
      state: ChannelState.PREOPENING,
      flags: 0,
      fundingSatoshis: params.fundingSatoshis,
      feeratePerKw: 1000, // Default, será negociado
      localConfig: params.localConfig,
      remoteConfig: params.remoteConfig || this.defaultRemoteConfig(),
      fundingConfirmations: 0,
      minimumDepth: 3, // Default, será negociado
      createdAt: now,
      updatedAt: now,
    }

    if (params.weAreFunder) {
      this.info.flags |= ChannelFlags.WE_ARE_FUNDER
    }
    if (params.announceChannel) {
      this.info.flags |= ChannelFlags.ANNOUNCE_CHANNEL
    }

    this.htlcManager = new HTLCManager()
    this.localRevocationStore = new RevocationStore()
    this.remoteRevocationStore = new RevocationStore()
  }

  // ==========================================
  // GETTERS
  // ==========================================

  get channelId(): Uint8Array | undefined {
    return this.info.channelId
  }

  get tempChannelId(): Uint8Array {
    return this.info.tempChannelId
  }

  get state(): ChannelState {
    return this.info.state
  }

  get peerId(): Uint8Array {
    return this.info.peerId
  }

  get fundingSatoshis(): bigint {
    return this.info.fundingSatoshis
  }

  get localBalanceMsat(): bigint {
    return this.info.localConfig.initialMsat
  }

  get remoteBalanceMsat(): bigint {
    return this.info.remoteConfig.initialMsat
  }

  get isOpen(): boolean {
    return this.info.state === ChannelState.OPEN
  }

  get weAreFunder(): boolean {
    return (this.info.flags & ChannelFlags.WE_ARE_FUNDER) !== 0
  }

  get shortChannelId(): bigint | undefined {
    return this.info.shortChannelId
  }

  // ==========================================
  // ESTADO DO CANAL
  // ==========================================

  /**
   * Transição de estado do canal
   */
  private transitionTo(newState: ChannelState): void {
    const oldState = this.info.state
    if (oldState === newState) return

    // Validar transição
    if (!this.isValidTransition(oldState, newState)) {
      throw new Error(`Invalid state transition: ${oldState} -> ${newState}`)
    }

    this.info.state = newState
    this.info.updatedAt = Date.now()

    this.onStateChange?.(oldState, newState)
  }

  /**
   * Verifica se uma transição de estado é válida
   */
  private isValidTransition(from: ChannelState, to: ChannelState): boolean {
    const validTransitions: Record<ChannelState, ChannelState[]> = {
      [ChannelState.PREOPENING]: [ChannelState.OPENING],
      [ChannelState.OPENING]: [ChannelState.FUNDED, ChannelState.CLOSED],
      [ChannelState.FUNDED]: [ChannelState.WAITING_FOR_FUNDING_CONFIRMED, ChannelState.CLOSED],
      [ChannelState.WAITING_FOR_FUNDING_CONFIRMED]: [
        ChannelState.WAITING_FOR_CHANNEL_READY,
        ChannelState.FORCE_CLOSING,
        ChannelState.CLOSED,
      ],
      [ChannelState.WAITING_FOR_CHANNEL_READY]: [
        ChannelState.OPEN,
        ChannelState.FORCE_CLOSING,
        ChannelState.CLOSED,
      ],
      [ChannelState.OPEN]: [
        ChannelState.SHUTDOWN,
        ChannelState.FORCE_CLOSING,
        ChannelState.REESTABLISHING,
      ],
      [ChannelState.SHUTDOWN]: [
        ChannelState.NEGOTIATING_CLOSING,
        ChannelState.FORCE_CLOSING,
        ChannelState.CLOSED,
      ],
      [ChannelState.NEGOTIATING_CLOSING]: [ChannelState.CLOSING, ChannelState.FORCE_CLOSING],
      [ChannelState.CLOSING]: [ChannelState.CLOSED],
      [ChannelState.FORCE_CLOSING]: [ChannelState.CLOSED],
      [ChannelState.CLOSED]: [],
      [ChannelState.REESTABLISHING]: [
        ChannelState.OPEN,
        ChannelState.FORCE_CLOSING,
        ChannelState.CLOSED,
      ],
    }

    return validTransitions[from]?.includes(to) ?? false
  }

  // ==========================================
  // ABERTURA DE CANAL
  // ==========================================

  /**
   * Inicia abertura de canal (como fundador)
   */
  initiateOpen(feeratePerKw: number): Uint8Array {
    if (!this.weAreFunder) {
      throw new Error('Only funder can initiate channel open')
    }

    this.transitionTo(ChannelState.OPENING)
    this.info.feeratePerKw = feeratePerKw

    // Criar open_channel message
    return this.createOpenChannelMessage()
  }

  /**
   * Processa open_channel recebido
   */
  handleOpenChannel(message: OpenChannelMessage): Uint8Array {
    if (this.weAreFunder) {
      throw new Error('Received open_channel but we are funder')
    }

    this.transitionTo(ChannelState.OPENING)

    // Atualizar info com dados do peer
    this.info.fundingSatoshis = message.fundingSatoshis
    this.info.feeratePerKw = message.feeratePerKw
    this.info.minimumDepth = 3 // Nosso mínimo

    // Atualizar config remota
    this.info.remoteConfig = {
      dustLimitSat: message.dustLimitSatoshis,
      maxAcceptedHtlcs: message.maxAcceptedHtlcs,
      htlcMinimumMsat: message.htlcMinimumMsat,
      maxHtlcValueInFlightMsat: message.maxHtlcValueInFlightMsat,
      toSelfDelay: message.toSelfDelay,
      channelReserveSat: message.channelReserveSatoshis,
      fundingPubkey: message.fundingPubkey,
      revocationBasepoint: message.revocationBasepoint,
      paymentBasepoint: message.paymentBasepoint,
      delayedPaymentBasepoint: message.delayedPaymentBasepoint,
      htlcBasepoint: message.htlcBasepoint,
      initialMsat: message.pushMsat,
      nextPerCommitmentPoint: message.firstPerCommitmentPoint,
    }

    // Criar accept_channel
    return this.createAcceptChannelMessage()
  }

  /**
   * Processa accept_channel recebido
   */
  handleAcceptChannel(message: AcceptChannelMessage): ChannelOperationResult {
    if (!this.weAreFunder) {
      return { success: false, error: new Error('Received accept_channel but we are not funder') }
    }

    // Atualizar config remota
    this.info.remoteConfig = {
      dustLimitSat: message.dustLimitSatoshis,
      maxAcceptedHtlcs: message.maxAcceptedHtlcs,
      htlcMinimumMsat: message.htlcMinimumMsat,
      maxHtlcValueInFlightMsat: message.maxHtlcValueInFlightMsat,
      toSelfDelay: message.toSelfDelay,
      channelReserveSat: message.channelReserveSatoshis,
      fundingPubkey: message.fundingPubkey,
      revocationBasepoint: message.revocationBasepoint,
      paymentBasepoint: message.paymentBasepoint,
      delayedPaymentBasepoint: message.delayedPaymentBasepoint,
      htlcBasepoint: message.htlcBasepoint,
      initialMsat: 0n, // Accept não tem push
      nextPerCommitmentPoint: message.firstPerCommitmentPoint,
    }

    this.info.minimumDepth = message.minimumDepth

    return { success: true }
  }

  /**
   * Cria e broadcasta a funding transaction (como funder)
   */
  async createFundingTransaction(
    walletService: any, // LightningWalletService
    utxos: any[],
    changeAddress: string,
    feeratePerByte: number,
  ): Promise<{ txid: Uint8Array; outputIndex: number; signature: Uint8Array }> {
    if (!this.weAreFunder) {
      throw new Error('Only funder can create funding transaction')
    }

    if (this.info.state !== ChannelState.OPENING) {
      throw new Error(`Cannot create funding tx in state ${this.info.state}`)
    }

    // Usar o LightningWalletService para criar a funding transaction
    const result = await walletService.createFundingTransaction(
      this,
      utxos,
      changeAddress,
      feeratePerByte,
    )

    // Transicionar para FUNDED
    this.setFundingTx(result.txid, result.outputIndex)

    return result
  }

  /**
   * Define a funding transaction
   */
  setFundingTx(txid: Uint8Array, outputIndex: number): void {
    this.info.fundingTxid = txid
    this.info.fundingOutputIndex = outputIndex

    // Calcular channel_id = funding_txid XOR funding_output_index
    this.info.channelId = new Uint8Array(32)
    this.info.channelId.set(txid)
    // XOR com output index nos últimos 2 bytes
    this.info.channelId[30] ^= (outputIndex >> 8) & 0xff
    this.info.channelId[31] ^= outputIndex & 0xff

    // Inicializar CommitmentBuilder
    this.commitmentBuilder = new CommitmentBuilder({
      localConfig: this.info.localConfig,
      remoteConfig: this.info.remoteConfig,
      htlcManager: this.htlcManager,
      fundingTxid: txid,
      fundingOutputIndex: outputIndex,
      fundingSatoshis: this.info.fundingSatoshis,
      channelType: this.getChannelType(),
    })

    this.transitionTo(ChannelState.FUNDED)
  }

  /**
   * Verifica assinatura do commitment transaction recebido
   * O peer assina nosso commitment (LOCAL), então verificamos com a chave pública dele
   */
  private verifyRemoteCommitmentSignature(signature: Uint8Array): boolean {
    if (!this.commitmentBuilder) {
      throw new Error('CommitmentBuilder not initialized')
    }

    // Construir nosso commitment (LOCAL) que o peer está assinando
    const localCommitment = this.commitmentBuilder.buildCommitmentTx(HTLCOwner.LOCAL)

    // Verificar assinatura usando a chave pública do peer
    return this.commitmentBuilder.verifyCommitmentSignature(localCommitment, signature)
  }

  /**
   * Processa funding_created
   */
  handleFundingCreated(message: FundingCreatedMessage): Uint8Array {
    if (this.weAreFunder) {
      throw new Error('Received funding_created but we are funder')
    }

    this.setFundingTx(message.fundingTxid, message.fundingOutputIndex)

    // Verificar assinatura do commitment remoto
    if (!this.verifyRemoteCommitmentSignature(message.signature)) {
      throw new Error('Invalid remote commitment signature in funding_created')
    }

    // Criar funding_signed
    return this.createFundingSignedMessage(message.signature)
  }

  /**
   * Processa funding_signed
   */
  handleFundingSigned(message: FundingSignedMessage): ChannelOperationResult {
    if (!this.weAreFunder) {
      return { success: false, error: new Error('Received funding_signed but we are not funder') }
    }

    // Verificar assinatura do commitment
    if (!this.verifyRemoteCommitmentSignature(message.signature)) {
      return {
        success: false,
        error: new Error('Invalid remote commitment signature in funding_signed'),
      }
    }

    this.transitionTo(ChannelState.WAITING_FOR_FUNDING_CONFIRMED)

    return { success: true }
  }

  /**
   * Atualiza confirmações da funding tx
   */
  updateFundingConfirmations(confirmations: number): boolean {
    this.info.fundingConfirmations = confirmations

    if (
      confirmations >= this.info.minimumDepth &&
      this.info.state === ChannelState.WAITING_FOR_FUNDING_CONFIRMED
    ) {
      this.transitionTo(ChannelState.WAITING_FOR_CHANNEL_READY)
      return true // Pronto para enviar channel_ready
    }

    return false
  }

  /**
   * Processa channel_ready recebido
   */
  handleChannelReady(message: ChannelReadyMessage): ChannelOperationResult {
    // Armazenar next per-commitment point
    this.info.remoteConfig.nextPerCommitmentPoint = message.nextPerCommitmentPoint

    // Se já enviamos channel_ready, transicionar para OPEN
    if (this.info.state === ChannelState.WAITING_FOR_CHANNEL_READY) {
      this.transitionTo(ChannelState.OPEN)
    }

    return { success: true }
  }

  // ==========================================
  // OPERAÇÕES HTLC
  // ==========================================

  /**
   * Adiciona um HTLC (enviando update_add_htlc)
   */
  addHtlc(
    amountMsat: bigint,
    paymentHash: Uint8Array,
    cltvExpiry: number,
    onionRoutingPacket: Uint8Array,
  ): { htlcId: bigint; message: Uint8Array } {
    if (this.info.state !== ChannelState.OPEN) {
      throw new Error(`Cannot add HTLC in state ${this.info.state}`)
    }

    const htlcId = this.nextLocalHtlcId++

    const htlc: UpdateAddHtlc = {
      htlcId,
      amountMsat,
      paymentHash,
      cltvExpiry,
      onionRoutingPacket,
    }

    this.htlcManager.sendHtlc(htlc)

    return {
      htlcId,
      message: this.createUpdateAddHtlcMessage(htlc),
    }
  }

  /**
   * Processa update_add_htlc recebido
   */
  handleUpdateAddHtlc(message: UpdateAddHtlc): ChannelOperationResult {
    if (this.info.state !== ChannelState.OPEN) {
      return { success: false, error: new Error(`Cannot receive HTLC in state ${this.info.state}`) }
    }

    // Validações
    if (message.amountMsat < this.info.localConfig.htlcMinimumMsat) {
      return { success: false, error: new Error('HTLC amount below minimum') }
    }

    // Verificar se não excede max_accepted_htlcs
    const currentHtlcs = this.htlcManager.getCurrentHtlcCount(HTLCOwner.REMOTE)
    if (currentHtlcs >= this.info.localConfig.maxAcceptedHtlcs) {
      return { success: false, error: new Error('Max HTLCs exceeded') }
    }

    this.htlcManager.recvHtlc(message)

    return { success: true, data: { htlcId: message.htlcId } }
  }

  /**
   * Resolve um HTLC (enviando update_fulfill_htlc)
   * Neste caso, estamos resolvendo um HTLC que recebemos do peer (REMOTE)
   */
  fulfillHtlc(htlcId: bigint, preimage: Uint8Array): Uint8Array {
    if (this.info.state !== ChannelState.OPEN && this.info.state !== ChannelState.SHUTDOWN) {
      throw new Error(`Cannot fulfill HTLC in state ${this.info.state}`)
    }

    // sendSettle: estamos enviando o settle para o HTLC que o REMOTE nos enviou
    this.htlcManager.sendSettle(htlcId)

    return this.createUpdateFulfillHtlcMessage(htlcId, preimage)
  }

  /**
   * Processa update_fulfill_htlc recebido
   * O peer está resolvendo um HTLC que enviamos (LOCAL)
   */
  handleUpdateFulfillHtlc(htlcId: bigint, preimage: Uint8Array): ChannelOperationResult {
    // Verificar se preimage corresponde ao payment_hash
    const htlc = this.htlcManager.getHtlcById(HTLCOwner.LOCAL, htlcId)
    if (!htlc) {
      return { success: false, error: new Error('Unknown HTLC') }
    }

    const calculatedHash = sha256(preimage)
    if (uint8ArrayToHex(calculatedHash) !== uint8ArrayToHex(htlc.paymentHash)) {
      return { success: false, error: new Error('Invalid preimage') }
    }

    // recvSettle: recebemos settle do HTLC que enviamos
    this.htlcManager.recvSettle(htlcId)

    return { success: true, data: { preimage } }
  }

  /**
   * Falha um HTLC (enviando update_fail_htlc)
   * Estamos falhando um HTLC que recebemos do peer (REMOTE)
   */
  failHtlc(htlcId: bigint, reason: Uint8Array): Uint8Array {
    this.htlcManager.sendFail(htlcId)

    return this.createUpdateFailHtlcMessage(htlcId, reason)
  }

  /**
   * Processa update_fail_htlc recebido
   * O peer está falhando um HTLC que enviamos (LOCAL)
   */
  handleUpdateFailHtlc(htlcId: bigint, _reason: Uint8Array): ChannelOperationResult {
    this.htlcManager.recvFail(htlcId)

    return { success: true }
  }

  // ==========================================
  // COMMITMENT OPERATIONS
  // ==========================================

  /**
   * Envia commitment_signed
   */
  sendCommitmentSigned(): Uint8Array {
    if (!this.commitmentBuilder) {
      throw new Error('CommitmentBuilder not initialized')
    }

    // Construir commitment do peer (REMOTE)
    const remoteCommitment = this.commitmentBuilder.buildCommitmentTx(HTLCOwner.REMOTE)

    // Assinar commitment usando chave privada real
    const signature = this.commitmentBuilder.signCommitmentTx(remoteCommitment)

    // Assinar cada HTLC output do commitment do peer
    const htlcSignatures: Uint8Array[] = []
    for (const output of remoteCommitment.outputs) {
      if (output.type === 'htlc_offered' || output.type === 'htlc_received') {
        const htlcSignature = this.commitmentBuilder.signHtlcTransaction(
          remoteCommitment,
          output,
          HTLCOwner.REMOTE,
        )
        htlcSignatures.push(htlcSignature)
      }
    }

    // Atualizar estado do HTLCManager
    this.htlcManager.sendCtx()

    return this.createCommitmentSignedMessage(signature, htlcSignatures)
  }

  /**
   * Processa commitment_signed recebido
   */
  handleCommitmentSigned(signature: Uint8Array, htlcSignatures: Uint8Array[]): Uint8Array {
    if (!this.commitmentBuilder) {
      throw new Error('CommitmentBuilder not initialized')
    }

    // Construir nosso commitment (LOCAL) para verificação
    const localCommitment = this.commitmentBuilder.buildCommitmentTx(HTLCOwner.LOCAL)

    // Verificar assinatura do commitment
    const isValidSignature = this.commitmentBuilder.verifyCommitmentSignature(
      localCommitment,
      signature,
    )
    if (!isValidSignature) {
      throw new Error('Invalid commitment signature')
    }

    // Verificar assinaturas HTLC
    const htlcOutputs = localCommitment.outputs.filter(
      o => o.type === 'htlc_offered' || o.type === 'htlc_received',
    )

    if (htlcOutputs.length !== htlcSignatures.length) {
      throw new Error(
        `HTLC signature count mismatch: expected ${htlcOutputs.length}, got ${htlcSignatures.length}`,
      )
    }

    for (let i = 0; i < htlcOutputs.length; i++) {
      const isValidHtlcSig = this.commitmentBuilder.verifyHtlcSignature(
        localCommitment,
        htlcOutputs[i],
        htlcSignatures[i],
      )
      if (!isValidHtlcSig) {
        throw new Error(`Invalid HTLC signature at index ${i}`)
      }
    }

    // Atualizar estado
    this.htlcManager.recvCtx()

    // Enviar revoke_and_ack
    return this.createRevokeAndAck()
  }

  /**
   * Processa revoke_and_ack recebido
   */
  handleRevokeAndAck(
    secret: Uint8Array,
    nextPerCommitmentPoint: Uint8Array,
  ): ChannelOperationResult {
    if (!this.commitmentBuilder) {
      return { success: false, error: new Error('CommitmentBuilder not initialized') }
    }

    // Verificar se o secret corresponde ao per-commitment point anterior
    const expectedPoint = this.info.remoteConfig.currentPerCommitmentPoint
    if (expectedPoint) {
      const derivedPoint = secretToPoint(secret)
      if (uint8ArrayToHex(derivedPoint) !== uint8ArrayToHex(expectedPoint)) {
        return { success: false, error: new Error('Invalid revocation secret') }
      }
    }

    // Armazenar secret
    const ctn = this.htlcManager.ctnOldest(HTLCOwner.REMOTE)
    this.remoteRevocationStore.addSecret(secret, ctn)
    this.commitmentBuilder.addRevocationSecret(secret, ctn)

    // Atualizar per-commitment point
    this.info.remoteConfig.currentPerCommitmentPoint = this.info.remoteConfig.nextPerCommitmentPoint
    this.info.remoteConfig.nextPerCommitmentPoint = nextPerCommitmentPoint

    // Atualizar estado
    this.htlcManager.recvRev()

    return { success: true }
  }

  /**
   * Cria revoke_and_ack message
   */
  private createRevokeAndAck(): Uint8Array {
    // Obter secret do commitment antigo
    const oldCtn = this.htlcManager.ctnOldest(HTLCOwner.LOCAL) - 1
    const oldSecret = getPerCommitmentSecretFromSeed(
      this.info.localConfig.perCommitmentSecretSeed,
      oldCtn,
    )

    // Próximo per-commitment point
    const nextCtn = this.htlcManager.ctnLatest(HTLCOwner.LOCAL) + 1
    const nextSecret = getPerCommitmentSecretFromSeed(
      this.info.localConfig.perCommitmentSecretSeed,
      nextCtn,
    )
    const nextPoint = secretToPoint(nextSecret)

    // Atualizar estado
    this.htlcManager.sendRev()

    return this.serializeRevokeAndAck(oldSecret, nextPoint)
  }

  // ==========================================
  // FECHAMENTO DE CANAL
  // ==========================================

  /**
   * Inicia shutdown cooperativo
   */
  initiateShutdown(scriptPubkey?: Uint8Array): Uint8Array {
    this.transitionTo(ChannelState.SHUTDOWN)

    return this.createShutdownMessage(scriptPubkey || this.info.localConfig.upfrontShutdownScript!)
  }

  /**
   * Processa shutdown recebido
   */
  handleShutdown(scriptPubkey: Uint8Array): ChannelOperationResult {
    if (this.info.state === ChannelState.OPEN) {
      this.transitionTo(ChannelState.SHUTDOWN)
    }

    // Verificar upfront_shutdown_script
    if (this.info.remoteConfig.upfrontShutdownScript) {
      const expected = uint8ArrayToHex(this.info.remoteConfig.upfrontShutdownScript)
      const received = uint8ArrayToHex(scriptPubkey)
      if (expected !== received) {
        return { success: false, error: new Error('Shutdown script mismatch') }
      }
    }

    return { success: true }
  }

  /**
   * Inicia force close
   */
  forceClose(): CommitmentTx {
    if (!this.commitmentBuilder) {
      throw new Error('CommitmentBuilder not initialized')
    }

    this.transitionTo(ChannelState.FORCE_CLOSING)

    // Obter último commitment válido
    return this.commitmentBuilder.buildCommitmentTx(HTLCOwner.LOCAL)
  }

  // ==========================================
  // REESTABLISHMENT
  // ==========================================

  /**
   * Cria channel_reestablish message
   */
  createChannelReestablish(): Uint8Array {
    const nextCommitmentNumber = BigInt(this.htlcManager.ctnLatest(HTLCOwner.LOCAL) + 1)
    const nextRevocationNumber = BigInt(this.htlcManager.ctnOldest(HTLCOwner.REMOTE))

    // Per-commitment secret para o commitment revogado mais recente
    let lastSecret: Uint8Array = new Uint8Array(32)
    try {
      const lastCtn = this.htlcManager.ctnOldest(HTLCOwner.LOCAL) - 1
      if (lastCtn >= 0) {
        lastSecret = new Uint8Array(
          getPerCommitmentSecretFromSeed(this.info.localConfig.perCommitmentSecretSeed, lastCtn),
        )
      }
    } catch {
      // No revoked commitments yet
    }

    // Próximo per-commitment point
    const nextCtn = this.htlcManager.ctnLatest(HTLCOwner.LOCAL) + 1
    const nextSecret = getPerCommitmentSecretFromSeed(
      this.info.localConfig.perCommitmentSecretSeed,
      nextCtn,
    )
    const nextPoint = secretToPoint(nextSecret)

    return this.serializeChannelReestablish(
      nextCommitmentNumber,
      nextRevocationNumber,
      lastSecret,
      nextPoint,
    )
  }

  /**
   * Processa channel_reestablish recebido
   */
  handleChannelReestablish(
    nextCommitmentNumber: bigint,
    _nextRevocationNumber: bigint,
    _lastRemoteSecret: Uint8Array,
    _myCurrentPerCommitmentPoint: Uint8Array,
  ): ChannelOperationResult {
    const ourNextCommitmentNumber = BigInt(this.htlcManager.ctnLatest(HTLCOwner.REMOTE) + 1)
    // ourNextRevocationNumber será usado para validação futura
    // const ourNextRevocationNumber = BigInt(this.htlcManager.ctnOldest(HTLCOwner.LOCAL))

    // Verificar se estamos em sync
    if (nextCommitmentNumber === ourNextCommitmentNumber) {
      // Peer tem nosso commitment mais recente
    } else if (nextCommitmentNumber === ourNextCommitmentNumber + 1n) {
      // Peer não recebeu nosso último commitment_signed
      // Precisamos reenviar
    } else if (nextCommitmentNumber === ourNextCommitmentNumber - 1n) {
      // Peer não recebeu nosso último revoke_and_ack
    } else {
      return { success: false, error: new Error('Unrecoverable channel state mismatch') }
    }

    this.transitionTo(ChannelState.OPEN)

    return { success: true }
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private defaultRemoteConfig(): RemoteConfig {
    return {
      dustLimitSat: DUST_LIMIT_P2WPKH,
      maxAcceptedHtlcs: 483,
      htlcMinimumMsat: 1000n,
      maxHtlcValueInFlightMsat: this.info.fundingSatoshis * 1000n,
      toSelfDelay: 144,
      channelReserveSat: this.info.fundingSatoshis / 100n,
      fundingPubkey: new Uint8Array(33),
      revocationBasepoint: new Uint8Array(33),
      paymentBasepoint: new Uint8Array(33),
      delayedPaymentBasepoint: new Uint8Array(33),
      htlcBasepoint: new Uint8Array(33),
      initialMsat: 0n,
    }
  }

  private getChannelType(): ChannelType {
    if (this.info.flags & ChannelFlags.OPTION_ANCHORS_ZERO_FEE) {
      return ChannelType.ANCHORS_ZERO_FEE_HTLC
    }
    if (this.info.flags & ChannelFlags.OPTION_ANCHORS) {
      return ChannelType.ANCHORS
    }
    return ChannelType.STATIC_REMOTEKEY
  }

  // ==========================================
  // MESSAGE SERIALIZATION
  // ==========================================

  private createOpenChannelMessage(): Uint8Array {
    // Primeiro per-commitment point
    const firstPerCommitmentPoint = secretToPoint(
      getPerCommitmentSecretFromSeed(this.info.localConfig.perCommitmentSecretSeed, 0),
    )

    const message = {
      type: 32, // OPEN_CHANNEL
      chainHash: BITCOIN_CHAIN_HASH, // Bitcoin mainnet chain hash
      temporaryChannelId: this.info.tempChannelId,
      fundingSatoshis: this.info.fundingSatoshis,
      pushMsat: 0n, // No push for now
      dustLimitSatoshis: this.info.localConfig.dustLimitSat,
      maxHtlcValueInFlightMsat: this.info.localConfig.maxHtlcValueInFlightMsat,
      channelReserveSatoshis: this.info.localConfig.channelReserveSat,
      htlcMinimumMsat: this.info.localConfig.htlcMinimumMsat,
      feeratePerKw: this.info.feeratePerKw,
      toSelfDelay: this.info.localConfig.toSelfDelay,
      maxAcceptedHtlcs: this.info.localConfig.maxAcceptedHtlcs,
      fundingPubkey: this.info.localConfig.fundingPubkey,
      revocationBasepoint: this.info.localConfig.revocationBasepoint,
      paymentBasepoint: this.info.localConfig.paymentBasepoint,
      delayedPaymentBasepoint: this.info.localConfig.delayedPaymentBasepoint,
      htlcBasepoint: this.info.localConfig.htlcBasepoint,
      firstPerCommitmentPoint,
      channelFlags: this.info.flags & ChannelFlags.ANNOUNCE_CHANNEL ? 1 : 0,
      tlvs: [],
    }

    return encodeOpenChannelMessage(message)
  }

  private createAcceptChannelMessage(): Uint8Array {
    // Primeiro per-commitment point
    const firstPerCommitmentPoint = secretToPoint(
      getPerCommitmentSecretFromSeed(this.info.localConfig.perCommitmentSecretSeed, 0),
    )

    const message = {
      type: 33, // ACCEPT_CHANNEL
      temporaryChannelId: this.info.tempChannelId,
      dustLimitSatoshis: this.info.localConfig.dustLimitSat,
      maxHtlcValueInFlightMsat: this.info.localConfig.maxHtlcValueInFlightMsat,
      channelReserveSatoshis: this.info.localConfig.channelReserveSat,
      htlcMinimumMsat: this.info.localConfig.htlcMinimumMsat,
      minimumDepth: this.info.minimumDepth,
      toSelfDelay: this.info.localConfig.toSelfDelay,
      maxAcceptedHtlcs: this.info.localConfig.maxAcceptedHtlcs,
      fundingPubkey: this.info.localConfig.fundingPubkey,
      revocationBasepoint: this.info.localConfig.revocationBasepoint,
      paymentBasepoint: this.info.localConfig.paymentBasepoint,
      delayedPaymentBasepoint: this.info.localConfig.delayedPaymentBasepoint,
      htlcBasepoint: this.info.localConfig.htlcBasepoint,
      firstPerCommitmentPoint,
      tlvs: [],
    }

    return encodeAcceptChannelMessage(message)
  }

  private createFundingSignedMessage(signature: Uint8Array): Uint8Array {
    if (!this.info.channelId) {
      throw new Error('Channel ID not set')
    }

    const message = {
      type: 35, // FUNDING_SIGNED
      channelId: this.info.channelId,
      signature,
    }

    return encodeFundingSignedMessage(message)
  }

  private createUpdateAddHtlcMessage(htlc: UpdateAddHtlc): Uint8Array {
    if (!this.info.channelId) {
      throw new Error('Channel ID not set')
    }

    if (!htlc.onionRoutingPacket) {
      throw new Error('Onion routing packet required for HTLC')
    }

    const message = {
      type: 128, // UPDATE_ADD_HTLC
      channelId: this.info.channelId,
      id: htlc.htlcId,
      amountMsat: htlc.amountMsat,
      paymentHash: htlc.paymentHash,
      cltvExpiry: htlc.cltvExpiry,
      onionRoutingPacket: htlc.onionRoutingPacket,
      tlvs: [],
    }

    return encodeUpdateAddHtlcMessage(message)
  }

  private createUpdateFulfillHtlcMessage(htlcId: bigint, preimage: Uint8Array): Uint8Array {
    if (!this.info.channelId) {
      throw new Error('Channel ID not set')
    }

    const message = {
      type: 130, // UPDATE_FULFILL_HTLC
      channelId: this.info.channelId,
      id: htlcId,
      paymentPreimage: preimage,
      tlvs: [],
    }

    return encodeUpdateFulfillHtlcMessage(message)
  }

  private createUpdateFailHtlcMessage(htlcId: bigint, reason: Uint8Array): Uint8Array {
    if (!this.info.channelId) {
      throw new Error('Channel ID not set')
    }

    const message = {
      type: 131, // UPDATE_FAIL_HTLC
      channelId: this.info.channelId,
      id: htlcId,
      len: reason.length,
      reason,
      tlvs: [],
    }

    return encodeUpdateFailHtlcMessage(message)
  }

  private createCommitmentSignedMessage(
    signature: Uint8Array,
    htlcSignatures: Uint8Array[],
  ): Uint8Array {
    if (!this.info.channelId) {
      throw new Error('Channel ID not set')
    }

    const message = {
      type: 132, // COMMITMENT_SIGNED
      channelId: this.info.channelId,
      signature,
      numHtlcs: htlcSignatures.length,
      htlcSignatures,
    }

    return encodeCommitmentSignedMessage(message)
  }

  private serializeRevokeAndAck(secret: Uint8Array, nextPoint: Uint8Array): Uint8Array {
    if (!this.info.channelId) {
      throw new Error('Channel ID not set')
    }

    const message = {
      type: 133, // REVOKE_AND_ACK
      channelId: this.info.channelId,
      perCommitmentSecret: secret,
      nextPerCommitmentPoint: nextPoint,
    }

    return encodeRevokeAndAckMessage(message)
  }

  private createShutdownMessage(scriptPubkey: Uint8Array): Uint8Array {
    if (!this.info.channelId) {
      throw new Error('Channel ID not set')
    }

    const message = {
      type: 38, // SHUTDOWN
      channelId: this.info.channelId,
      len: scriptPubkey.length,
      scriptpubkey: scriptPubkey,
      tlvs: [],
    }

    return encodeShutdownMessage(message)
  }

  private serializeChannelReestablish(
    nextCommitmentNumber: bigint,
    nextRevocationNumber: bigint,
    lastSecret: Uint8Array,
    nextPoint: Uint8Array,
  ): Uint8Array {
    if (!this.info.channelId) {
      throw new Error('Channel ID not set')
    }

    const message = {
      type: LightningMessageType.CHANNEL_REESTABLISH as const,
      channelId: this.info.channelId,
      nextCommitmentNumber,
      nextRevocationNumber,
      yourLastPerCommitmentSecret: lastSecret,
      myCurrentPerCommitmentPoint: nextPoint,
      tlvs: [], // Empty TLVs array for basic reestablish
    }
    return encodeChannelReestablishMessage(message)
  }

  // ==========================================
  // SERIALIZAÇÃO
  // ==========================================

  /**
   * Exporta estado para JSON
   */
  toJSON(): object {
    return {
      info: {
        channelId: this.info.channelId ? uint8ArrayToHex(this.info.channelId) : null,
        tempChannelId: uint8ArrayToHex(this.info.tempChannelId),
        peerId: uint8ArrayToHex(this.info.peerId),
        state: this.info.state,
        flags: this.info.flags,
        fundingTxid: this.info.fundingTxid ? uint8ArrayToHex(this.info.fundingTxid) : null,
        fundingOutputIndex: this.info.fundingOutputIndex,
        fundingSatoshis: this.info.fundingSatoshis.toString(),
        feeratePerKw: this.info.feeratePerKw,
        fundingConfirmations: this.info.fundingConfirmations,
        minimumDepth: this.info.minimumDepth,
        shortChannelId: this.info.shortChannelId?.toString(),
        createdAt: this.info.createdAt,
        updatedAt: this.info.updatedAt,
      },
      htlcManager: this.htlcManager.toJSON(),
      localRevocationStore: this.localRevocationStore.toJSON(),
      remoteRevocationStore: this.remoteRevocationStore.toJSON(),
    }
  }

  /**
   * Registra callback de mudança de estado
   */
  onStateChanged(callback: (oldState: ChannelState, newState: ChannelState) => void): void {
    this.onStateChange = callback
  }
}

// ==========================================
// MESSAGE TYPES (interfaces)
// ==========================================

export interface OpenChannelMessage {
  chainHash: Uint8Array
  tempChannelId: Uint8Array
  fundingSatoshis: bigint
  pushMsat: bigint
  dustLimitSatoshis: bigint
  maxHtlcValueInFlightMsat: bigint
  channelReserveSatoshis: bigint
  htlcMinimumMsat: bigint
  feeratePerKw: number
  toSelfDelay: number
  maxAcceptedHtlcs: number
  fundingPubkey: Uint8Array
  revocationBasepoint: Uint8Array
  paymentBasepoint: Uint8Array
  delayedPaymentBasepoint: Uint8Array
  htlcBasepoint: Uint8Array
  firstPerCommitmentPoint: Uint8Array
  channelFlags: number
}

export interface AcceptChannelMessage {
  tempChannelId: Uint8Array
  dustLimitSatoshis: bigint
  maxHtlcValueInFlightMsat: bigint
  channelReserveSatoshis: bigint
  htlcMinimumMsat: bigint
  minimumDepth: number
  toSelfDelay: number
  maxAcceptedHtlcs: number
  fundingPubkey: Uint8Array
  revocationBasepoint: Uint8Array
  paymentBasepoint: Uint8Array
  delayedPaymentBasepoint: Uint8Array
  htlcBasepoint: Uint8Array
  firstPerCommitmentPoint: Uint8Array
}

export interface FundingCreatedMessage {
  tempChannelId: Uint8Array
  fundingTxid: Uint8Array
  fundingOutputIndex: number
  signature: Uint8Array
}

export interface FundingSignedMessage {
  channelId: Uint8Array
  signature: Uint8Array
}

export interface ChannelReadyMessage {
  channelId: Uint8Array
  nextPerCommitmentPoint: Uint8Array
}

export default ChannelManager
