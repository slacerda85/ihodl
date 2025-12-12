// Lightning Network Service
// Este serviço abstrai as operações Lightning Network para o frontend
// Segue o padrão de arquitetura: lib (funções puras) -> services (lógica de negócio) -> UI

import { LightningRepository, PersistedChannel } from '../repositories/lightning'
import WalletService from './wallet'
import {
  encodeInvoice,
  decodeInvoice,
  validateInvoice,
  getInvoiceExpiryStatus,
} from '../lib/lightning/invoice'
import { sha256, randomBytes } from '../lib/crypto/crypto'
import { uint8ArrayToHex, hexToUint8Array } from '../lib/utils'
import {
  CurrencyPrefix,
  DEFAULT_EXPIRY_SECONDS,
  DEFAULT_MIN_FINAL_CLTV_EXPIRY_DELTA,
} from '@/core/models/lightning/invoice'
import { deriveChildKey, createPublicKey } from '../lib/key'
import { LightningTransport, getTransport, type TransportEvent } from './ln-transport-service'
import { ChannelOpeningFeeConfig } from '../models/lightning/client'
import {
  TRAMPOLINE_FEE_LEVEL_COUNT,
  EnhancedTrampolineRouter,
  createEnhancedTrampolineRouter,
} from '../lib/lightning'
import {
  ReadinessState,
  ReadinessLevel,
  getReadinessLevel,
  isOperationAllowed,
  createInitialReadinessState,
} from '../models/lightning/readiness'
import { getLightningRoutingService, RoutingMode } from './ln-routing-service'

// ==========================================
// TIPOS
// ==========================================

/**
 * Resultado de geração de invoice
 */
export interface GenerateInvoiceResult {
  invoice: string
  paymentHash: string
  paymentSecret: string
  amount: bigint
  description: string
  expiry: number
  createdAt: number
  requiresChannelOpening: boolean
  channelOpeningFee?: bigint
}

/**
 * Resultado de envio de pagamento
 */
export interface SendPaymentResult {
  success: boolean
  paymentHash: string
  preimage?: string
  error?: string
  feePaid?: bigint
}

/**
 * Estado de um canal simplificado para o frontend
 */
export interface ChannelState {
  channelId: string
  peerId: string
  state: 'opening' | 'open' | 'closing' | 'closed'
  localBalanceSat: bigint
  remoteBalanceSat: bigint
  capacitySat: bigint
  isActive: boolean
}

/**
 * Estado de uma invoice simplificado para o frontend
 */
export interface InvoiceState {
  paymentHash: string
  invoice: string
  amount: bigint
  description: string
  status: 'pending' | 'paid' | 'expired'
  createdAt: number
  expiresAt: number
}

/**
 * Estado de um pagamento simplificado para o frontend
 */
export interface PaymentState {
  paymentHash: string
  amount: bigint
  status: 'pending' | 'succeeded' | 'failed'
  direction: 'sent' | 'received'
  createdAt: number
  resolvedAt?: number
  error?: string
}

// ==========================================
// TRANSPORTE (BOLT1)
// ==========================================

/** Instância singleton do transporte */
let transport: LightningTransport | null = null

/**
 * Obtém ou cria a instância do transporte
 */
function getOrCreateTransport(): LightningTransport {
  if (!transport) {
    transport = getTransport()
  }
  return transport
}

/**
 * Conecta a um peer Lightning (BOLT1)
 *
 * @param peerId - ID do peer no formato nodeId@host:port
 */
export async function connectToPeer(peerId: string): Promise<void> {
  const t = getOrCreateTransport()
  await t.connect(peerId)
}

/**
 * Desconecta do peer atual
 */
export async function disconnect(): Promise<void> {
  const t = getOrCreateTransport()
  await t.disconnect()
}

/**
 * Envia ping para manter conexão (BOLT1)
 */
export async function sendPing(): Promise<void> {
  const t = getOrCreateTransport()
  await t.sendPing()
}

/**
 * Obtém status de conexão atual
 */
export function getConnectionStatus() {
  const t = getOrCreateTransport()
  return {
    isConnected: t.isConnected,
    peerId: t.peerId,
    negotiatedFeatures: t.negotiatedFeatures,
    lastPing: t.lastPing,
    lastPong: t.lastPong,
  }
}

/**
 * Adiciona listener para eventos de transporte
 */
export function addTransportListener(listener: (event: TransportEvent) => void): () => void {
  const t = getOrCreateTransport()
  return t.addListener(listener)
}

/**
 * Parâmetros para geração de invoice
 */
export interface GenerateInvoiceParams {
  amount: bigint // em millisatoshis
  description?: string
  expiry?: number // segundos
}

/**
 * Parâmetros para envio de pagamento
 */
export interface SendPaymentParams {
  invoice: string
  maxFee?: bigint // fee máxima aceita
}

// ==========================================
// CONSTANTES
// ==========================================

const LIGHTNING_PURPOSE = 9735 // LNPBP-46

const DEFAULT_CHANNEL_FEE_CONFIG: ChannelOpeningFeeConfig = {
  baseFee: 1000n, // 1000 sats base
  feeRate: 0.01, // 1%
  minChannelSize: 100000n, // 100k sats mínimo
}

// ==========================================
// LIGHTNING SERVICE
// ==========================================

interface LightningServiceInterface {
  // Inicialização
  initialize(walletId: string, password?: string): Promise<void>
  isInitialized(): boolean

  // Invoices
  generateInvoice(params: GenerateInvoiceParams): Promise<GenerateInvoiceResult>
  decodeInvoice(
    invoice: string,
  ): Promise<{ amount: bigint; description: string; paymentHash: string; isExpired: boolean }>

  // Pagamentos
  sendPayment(params: SendPaymentParams): Promise<SendPaymentResult>

  // Saldo e Canais
  getBalance(): Promise<bigint>
  hasActiveChannels(): Promise<boolean>
  getChannels(): Promise<ChannelState[]>

  // Histórico
  getInvoices(): Promise<InvoiceState[]>
  getPayments(): Promise<PaymentState[]>

  // Métricas de routing
  getRoutingMetrics(): {
    localRoutingAttempts: number
    localRoutingFailures: number
    trampolineFallbacks: number
  }
}

export default class LightningService implements LightningServiceInterface {
  private repository: LightningRepository
  private walletService: WalletService
  private masterKey: Uint8Array | null = null
  private network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet'
  private feeConfig: ChannelOpeningFeeConfig = DEFAULT_CHANNEL_FEE_CONFIG
  private nodeIndex: number = 0
  private initialized: boolean = false
  private trampolineRouter: EnhancedTrampolineRouter
  private readinessState: ReadinessState = createInitialReadinessState()
  private routingMetrics = {
    localRoutingAttempts: 0,
    localRoutingFailures: 0,
    trampolineFallbacks: 0,
  }

  /**
   * Registra métricas de falha de routing local
   */
  private recordLocalRoutingFailure(errorType: string): void {
    this.routingMetrics.localRoutingFailures++
    console.log(`[LightningService] Local routing failure recorded: ${errorType}`)
  }

  /**
   * Registra uso de fallback para trampoline
   */
  private recordTrampolineFallback(): void {
    this.routingMetrics.trampolineFallbacks++
    console.log('[LightningService] Trampoline fallback recorded')
  }

  /**
   * Obtém métricas de routing para debug/monitoramento
   */
  getRoutingMetrics() {
    return { ...this.routingMetrics }
  }

  constructor() {
    this.repository = new LightningRepository()
    this.walletService = new WalletService()
    this.trampolineRouter = createEnhancedTrampolineRouter()
  }

  // ==========================================
  // INICIALIZAÇÃO
  // ==========================================

  /**
   * Inicializa o serviço Lightning com a carteira ativa
   */
  async initialize(walletId: string, password?: string): Promise<void> {
    try {
      // Obter master key da carteira
      this.masterKey = this.walletService.getMasterKey(walletId, password)
      this.initialized = true
      console.log('[LightningService] Initialized successfully')
    } catch (error) {
      console.error('[LightningService] Failed to initialize:', error)
      throw new Error('Failed to initialize Lightning service')
    }
  }

  /**
   * Verifica se o serviço está inicializado
   */
  isInitialized(): boolean {
    return this.initialized && this.masterKey !== null
  }

  /**
   * Obtém o estado atual de readiness do Lightning Network
   */
  getReadinessState(): ReadinessState {
    return { ...this.readinessState }
  }

  /**
   * Atualiza o estado de readiness
   */
  updateReadinessState(updates: Partial<ReadinessState>): void {
    this.readinessState = { ...this.readinessState, ...updates }
  }

  // ==========================================
  // DERIVAÇÃO DE CHAVES
  // ==========================================

  /**
   * Deriva chave Lightning usando LNPBP-46 path m'/9735'/0'/0'/0/index
   */
  private deriveLightningKey(index: number): Uint8Array {
    if (!this.masterKey) {
      throw new Error('Service not initialized')
    }

    let key = this.masterKey
    key = deriveChildKey(key, LIGHTNING_PURPOSE + 0x80000000) // purpose' (hardened)
    key = deriveChildKey(key, 0x80000000) // coinType' (hardened)
    key = deriveChildKey(key, 0x80000000) // account' (hardened)
    key = deriveChildKey(key, 0) // change
    key = deriveChildKey(key, index) // addressIndex

    return key
  }

  /**
   * Obtém a chave pública do nó Lightning
   */
  getNodePubkey(): Uint8Array {
    const nodeKey = this.deriveLightningKey(0)
    return createPublicKey(nodeKey.subarray(0, 32))
  }

  // ==========================================
  // INVOICES
  // ==========================================

  /**
   * Gera uma invoice Lightning (BOLT #11)
   * Suporta abertura automática de canal (estilo Phoenix)
   */
  async generateInvoice(params: GenerateInvoiceParams): Promise<GenerateInvoiceResult> {
    if (!this.isInitialized()) {
      throw new Error('Lightning service not initialized')
    }

    // Verificar se a operação de recebimento é permitida pelo estado de readiness
    const readinessLevel = getReadinessLevel(this.readinessState)
    if (!isOperationAllowed(readinessLevel, 'receive')) {
      throw new Error(`Cannot generate invoice: ${readinessLevel}`)
    }

    const { amount, description = '', expiry = DEFAULT_EXPIRY_SECONDS } = params

    // Gerar preimage e payment hash
    const preimage = randomBytes(32)
    const paymentHash = sha256(preimage)
    const paymentSecret = randomBytes(32)

    // Verificar se precisa abrir canal
    const hasChannels = await this.hasActiveChannels()
    const requiresChannelOpening = !hasChannels
    let channelOpeningFee: bigint | undefined

    if (requiresChannelOpening) {
      channelOpeningFee = this.calculateChannelOpeningFee(amount)
    }

    // Derivar chave para assinatura
    const nodeIndex = this.nodeIndex++
    const privateKey = this.deriveLightningKey(nodeIndex).subarray(0, 32)
    const payeePubkey = createPublicKey(privateKey)

    // Determinar prefixo de rede
    const currencyPrefix = this.getCurrencyPrefix()

    // Criar invoice
    const invoice = encodeInvoice({
      currency: currencyPrefix,
      amount,
      paymentHash,
      paymentSecret,
      description,
      expiry,
      minFinalCltvExpiryDelta: DEFAULT_MIN_FINAL_CLTV_EXPIRY_DELTA,
      payeePubkey,
      payeePrivateKey: privateKey,
    })

    const createdAt = Date.now()

    // Persistir preimage e invoice
    this.repository.savePreimage({
      paymentHash: uint8ArrayToHex(paymentHash),
      preimage: uint8ArrayToHex(preimage),
      createdAt,
    })

    this.repository.saveInvoice({
      paymentHash: uint8ArrayToHex(paymentHash),
      bolt11: invoice,
      amountMsat: amount.toString(),
      description,
      expiry,
      createdAt,
    })

    return {
      invoice,
      paymentHash: uint8ArrayToHex(paymentHash),
      paymentSecret: uint8ArrayToHex(paymentSecret),
      amount,
      description,
      expiry,
      createdAt,
      requiresChannelOpening,
      channelOpeningFee,
    }
  }

  /**
   * Decodifica uma invoice Lightning
   */
  async decodeInvoice(invoiceString: string): Promise<{
    amount: bigint
    description: string
    paymentHash: string
    payeePubkey?: string
    paymentSecret?: string
    isExpired: boolean
  }> {
    const decoded = decodeInvoice(invoiceString)
    const validation = validateInvoice(decoded)

    if (!validation.isValid) {
      throw new Error(`Invalid invoice: ${validation.errors.join(', ')}`)
    }

    const expiryStatus = getInvoiceExpiryStatus(decoded)

    return {
      amount: decoded.amount || 0n,
      description: decoded.taggedFields.description || '',
      paymentHash: uint8ArrayToHex(decoded.taggedFields.paymentHash),
      payeePubkey: decoded.taggedFields.payeePubkey
        ? uint8ArrayToHex(decoded.taggedFields.payeePubkey)
        : undefined,
      paymentSecret: decoded.taggedFields.paymentSecret
        ? uint8ArrayToHex(decoded.taggedFields.paymentSecret)
        : undefined,
      isExpired: expiryStatus.isExpired,
    }
  }

  // ==========================================
  // PAGAMENTOS
  // ==========================================

  /**
   * Envia pagamento para uma invoice Lightning
   */
  async sendPayment(params: SendPaymentParams): Promise<SendPaymentResult> {
    if (!this.isInitialized()) {
      throw new Error('Lightning service not initialized')
    }

    // Verificar se a operação de envio é permitida pelo estado de readiness
    const readinessLevel = getReadinessLevel(this.readinessState)
    if (!isOperationAllowed(readinessLevel, 'send')) {
      return {
        success: false,
        paymentHash: '',
        error: `Cannot send payment: ${readinessLevel}`,
      }
    }

    const { invoice } = params
    // TODO: maxFee será usado quando implementar path finding com limite de fee

    try {
      // Decodificar invoice
      const decoded = await this.decodeInvoice(invoice)

      if (decoded.isExpired) {
        return {
          success: false,
          paymentHash: decoded.paymentHash,
          error: 'Invoice expired',
        }
      }

      // Verificar saldo
      const balance = await this.getBalance()
      if (balance < decoded.amount) {
        return {
          success: false,
          paymentHash: decoded.paymentHash,
          error: 'Insufficient balance',
        }
      }

      // Verificar se há canais ativos
      const hasChannels = await this.hasActiveChannels()
      if (!hasChannels) {
        return {
          success: false,
          paymentHash: decoded.paymentHash,
          error: 'No active channels available',
        }
      }

      // Verificar se invoice tem payee pubkey (obrigatório para trampoline)
      if (!decoded.payeePubkey) {
        return {
          success: false,
          paymentHash: decoded.paymentHash,
          error: 'Invoice missing payee pubkey',
        }
      }

      // Verificar se invoice tem payment secret (obrigatório para trampoline)
      if (!decoded.paymentSecret) {
        return {
          success: false,
          paymentHash: decoded.paymentHash,
          error: 'Invoice missing payment secret',
        }
      }

      // Obter altura do bloco atual (simulado por enquanto)
      const currentBlockHeight = 800000 // TODO: obter da blockchain

      // Preparar dados para o pagamento
      const destinationNodeId = hexToUint8Array(decoded.payeePubkey)
      const paymentHash = hexToUint8Array(decoded.paymentHash)
      const paymentSecret = hexToUint8Array(decoded.paymentSecret)

      // Determinar modo de routing baseado no estado do sistema
      const routingMode = this.routingService.getCurrentMode()
      console.log(`[LightningService] Using routing mode: ${routingMode}`)

      if (routingMode === RoutingMode.LOCAL) {
        // Tentar local routing primeiro com fallback automático
        const localResult = await this.tryLocalRouting(
          decoded,
          destinationNodeId,
          paymentHash,
          params.maxFee,
        )

        if (localResult.success) {
          return localResult
        }

        console.log('[LightningService] Local routing failed, falling back to trampoline')
        this.recordTrampolineFallback()
        // Fallback automático para trampoline se local falhar
      }

      // Usar trampoline routing (modo padrão ou fallback)
      return await this.sendTrampolinePayment(
        decoded,
        destinationNodeId,
        paymentHash,
        paymentSecret,
        currentBlockHeight,
        params.maxFee,
      )
    } catch (error) {
      console.error('[LightningService] Payment failed:', error)
      return {
        success: false,
        paymentHash: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Tenta executar routing local com tratamento robusto de erros
   */
  private async tryLocalRouting(
    decoded: any,
    destinationNodeId: Uint8Array,
    paymentHash: Uint8Array,
    maxFee?: bigint,
  ): Promise<SendPaymentResult> {
    this.routingMetrics.localRoutingAttempts++

    try {
      console.log('[LightningService] Attempting local routing...')

      // Encontrar rota local
      const localRoute = this.routingService.findLocalRoute(
        this.getOurNodeId(),
        destinationNodeId,
        decoded.amount,
        maxFee || 10000n,
      )

      if (!localRoute) {
        console.log('[LightningService] No local route found')
        this.recordLocalRoutingFailure('no_route_found')
        return {
          success: false,
          paymentHash: decoded.paymentHash,
          error: 'No local route available',
        }
      }

      console.log('[LightningService] Found local route, attempting payment...')

      // TODO: Implementar envio via rota local real
      // Por enquanto, simular com verificação de timeout
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Local routing timeout'))
        }, 5000) // 5s timeout

        // Simulação de processamento
        setTimeout(() => {
          clearTimeout(timeout)
          // Simular falha aleatória para testar fallback (remover em produção)
          if (Math.random() < 0.3) {
            reject(new Error('Simulated local routing failure'))
          } else {
            resolve(true)
          }
        }, 1000)
      })

      // Simular sucesso
      this.repository.savePaymentInfo({
        paymentHash: decoded.paymentHash,
        amountMsat: decoded.amount.toString(),
        direction: 'sent',
        status: 'completed',
        createdAt: Date.now(),
      })

      return {
        success: true,
        paymentHash: decoded.paymentHash,
        preimage: uint8ArrayToHex(randomBytes(32)),
        feePaid: 1000n,
      }
    } catch (error) {
      console.error('[LightningService] Local routing failed:', error)

      // Categorizar erro para métricas futuras
      const errorMessage = error instanceof Error ? error.message : 'Unknown local routing error'
      this.recordLocalRoutingFailure(errorMessage)

      return {
        success: false,
        paymentHash: decoded.paymentHash,
        error: `Local routing failed: ${errorMessage}`,
      }
    }
  }

  /**
   * Envia pagamento usando routing trampoline
   */
  private async sendTrampolinePayment(
    decoded: any,
    destinationNodeId: Uint8Array,
    paymentHash: Uint8Array,
    paymentSecret: Uint8Array,
    currentBlockHeight: number,
    maxFee?: bigint,
  ): Promise<SendPaymentResult> {
    // Tentar pagamento com retry de fee levels
    const maxRetries = 3 // Máximo de tentativas com fees diferentes
    let lastError = ''

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const feeLevel = Math.min(attempt, TRAMPOLINE_FEE_LEVEL_COUNT - 1)

      // Criar pagamento trampoline com nível de fee específico
      const trampolineResult = this.trampolineRouter.createSmartTrampolinePaymentWithFeeLevel(
        destinationNodeId,
        decoded.amount,
        paymentHash,
        paymentSecret,
        currentBlockHeight,
        feeLevel,
      )

      if (!trampolineResult) {
        lastError = 'Failed to create trampoline payment'
        continue
      }

      // TODO: Conectar ao trampoline node e enviar onion
      // Por enquanto, simular envio com chance de falha baseada no fee level

      // Simulação: pagamentos com fee level baixo têm maior chance de falhar
      const failureChance = Math.max(0, 0.8 - feeLevel * 0.2) // 80% chance de falha no level 0, 0% no level 3
      const shouldFail = Math.random() < failureChance

      if (shouldFail && attempt < maxRetries) {
        console.log(
          `[LightningService] Payment attempt ${attempt + 1} failed with fee level ${feeLevel}, retrying with higher fee...`,
        )
        lastError = `Fee insufficient at level ${feeLevel}`
        continue
      }

      // Sucesso ou última tentativa
      if (!shouldFail || attempt === maxRetries) {
        // Registrar pagamento
        this.repository.savePaymentInfo({
          paymentHash: decoded.paymentHash,
          amountMsat: decoded.amount.toString(),
          direction: 'sent',
          status: 'completed',
          createdAt: Date.now(),
        })

        // Calcular fee total pago
        const feePaid = this.trampolineRouter.calculateFeeForLevel(decoded.amount, feeLevel)

        return {
          success: true,
          paymentHash: decoded.paymentHash,
          preimage: uint8ArrayToHex(randomBytes(32)), // Simulação
          feePaid,
        }
      }
    }

    // Todas as tentativas falharam
    return {
      success: false,
      paymentHash: decoded.paymentHash,
      error: `Payment failed after ${maxRetries + 1} attempts: ${lastError}`,
    }
  }

  /**
   * Obtém o node ID deste nó
   */
  private getOurNodeId(): Uint8Array {
    // TODO: Implementar obtenção do node ID real da carteira
    // Por enquanto, retornar um node ID simulado
    return hexToUint8Array('02' + '00'.repeat(32)) // Node ID simulado
  }

  // ==========================================
  // SALDO E CANAIS
  // ==========================================

  /**
   * Obtém o saldo total disponível em millisatoshis
   */
  async getBalance(): Promise<bigint> {
    const channels = await this.getChannels()
    return channels
      .filter(ch => ch.isActive)
      .reduce((sum, ch) => sum + ch.localBalanceSat * 1000n, 0n)
  }

  /**
   * Verifica se há canais ativos
   */
  async hasActiveChannels(): Promise<boolean> {
    const channels = await this.getChannels()
    return channels.some(ch => ch.isActive)
  }

  /**
   * Obtém lista de canais
   */
  async getChannels(): Promise<ChannelState[]> {
    const persistedChannels = this.repository.findAllChannels()

    return Object.values(persistedChannels).map(ch => this.mapPersistedChannel(ch))
  }

  // ==========================================
  // HISTÓRICO
  // ==========================================

  /**
   * Obtém histórico de invoices
   */
  async getInvoices(): Promise<InvoiceState[]> {
    const persistedInvoices = this.repository.findAllInvoices()
    const now = Date.now()

    return Object.values(persistedInvoices).map(inv => {
      const expiresAt = inv.createdAt + inv.expiry * 1000
      const isExpired = now > expiresAt

      // Verificar se foi pago
      const payment = this.repository.findPaymentInfoByHash(inv.paymentHash)
      const isPaid = payment?.status === 'succeeded'

      return {
        paymentHash: inv.paymentHash,
        invoice: inv.bolt11,
        amount: BigInt(inv.amountMsat || '0'),
        description: inv.description,
        status: isPaid
          ? ('paid' as const)
          : isExpired
            ? ('expired' as const)
            : ('pending' as const),
        createdAt: inv.createdAt,
        expiresAt,
      }
    })
  }

  /**
   * Obtém histórico de pagamentos
   */
  async getPayments(): Promise<PaymentState[]> {
    const persistedPayments = this.repository.findAllPaymentInfos()

    return Object.values(persistedPayments).map(pay => ({
      paymentHash: pay.paymentHash,
      amount: BigInt(pay.amountMsat || '0'),
      status: this.mapPaymentStatus(pay.status),
      direction: pay.direction,
      createdAt: pay.createdAt,
    }))
  }

  // ==========================================
  // HELPERS
  // ==========================================

  /**
   * Calcula fee de abertura de canal (estilo Phoenix)
   */
  private calculateChannelOpeningFee(amount: bigint): bigint {
    const { baseFee, feeRate } = this.feeConfig
    const variableFee = BigInt(Math.floor(Number(amount / 1000n) * feeRate)) // Converter msat para sat antes de calcular
    return baseFee + variableFee
  }

  /**
   * Obtém prefixo de rede para invoice
   */
  private getCurrencyPrefix(): CurrencyPrefix {
    switch (this.network) {
      case 'testnet':
        return CurrencyPrefix.BITCOIN_TESTNET
      case 'regtest':
        return CurrencyPrefix.BITCOIN_REGTEST
      default:
        return CurrencyPrefix.BITCOIN_MAINNET
    }
  }

  /**
   * Mapeia canal persistido para estado simplificado
   */
  private mapPersistedChannel(ch: PersistedChannel): ChannelState {
    return {
      channelId: ch.channelId,
      peerId: ch.nodeId,
      state: this.mapChannelState(ch.state),
      localBalanceSat: BigInt(ch.localBalance),
      remoteBalanceSat: BigInt(ch.remoteBalance),
      capacitySat: BigInt(ch.localBalance) + BigInt(ch.remoteBalance),
      isActive: ch.state === 'open',
    }
  }

  /**
   * Mapeia estado de canal para tipo simplificado
   */
  private mapChannelState(state: string): 'opening' | 'open' | 'closing' | 'closed' {
    switch (state.toLowerCase()) {
      case 'open':
      case 'normal':
        return 'open'
      case 'closing':
      case 'shutdown':
      case 'negotiating_closing':
        return 'closing'
      case 'closed':
        return 'closed'
      default:
        return 'opening'
    }
  }

  /**
   * Mapeia status de pagamento
   */
  private mapPaymentStatus(status: string): 'pending' | 'succeeded' | 'failed' {
    switch (status.toLowerCase()) {
      case 'succeeded':
      case 'completed':
        return 'succeeded'
      case 'failed':
        return 'failed'
      default:
        return 'pending'
    }
  }

  /**
   * Define configuração de fees para abertura de canal
   */
  setFeeConfig(config: ChannelOpeningFeeConfig): void {
    this.feeConfig = config
  }

  /**
   * Define a rede (mainnet, testnet, regtest)
   */
  setNetwork(network: 'mainnet' | 'testnet' | 'regtest'): void {
    this.network = network
  }
}
