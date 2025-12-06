/**
 * Boltz Exchange API Integration
 *
 * Integração com a API Boltz para Submarine Swaps reais:
 * - Loop In: On-chain BTC → Lightning (Forward Swap)
 * - Loop Out: Lightning → On-chain BTC (Reverse Swap)
 *
 * API Reference: https://docs.boltz.exchange/
 */

import {
  SwapType,
  SwapState,
  type SwapData,
  type SwapFees,
  type SwapOffer,
  extractSwapScriptParams,
  generateSwapKeyPair,
  generatePreimage,
} from './submarineSwap'
import { hexToUint8Array, uint8ArrayToHex } from '@/core/lib/utils'

// ============================================================================
// Constantes
// ============================================================================

/** Base URL da API Boltz (mainnet) */
export const BOLTZ_API_MAINNET = 'https://api.boltz.exchange'

/** Base URL da API Boltz (testnet) */
export const BOLTZ_API_TESTNET = 'https://testnet.boltz.exchange/api'

/** Pair padrão para swaps BTC */
export const BTC_PAIR = 'BTC/BTC'

/** Timeout padrão para requests (ms) */
export const REQUEST_TIMEOUT = 30000

/** Intervalo de polling para status (ms) */
export const STATUS_POLL_INTERVAL = 5000

// ============================================================================
// Tipos da API Boltz
// ============================================================================

/**
 * Resposta de /getpairs
 */
export interface BoltzPairsResponse {
  warnings: string[]
  pairs: {
    [pair: string]: {
      rate: number
      limits: {
        maximal: number
        minimal: number
        maximalZeroConf: {
          baseAsset: number
          quoteAsset: number
        }
      }
      fees: {
        percentage: number
        minerFees: {
          baseAsset: {
            normal: number
            reverse: {
              claim: number
              lockup: number
            }
          }
          quoteAsset: {
            normal: number
            reverse: {
              claim: number
              lockup: number
            }
          }
        }
      }
      hash: string
    }
  }
}

/**
 * Request para criar swap normal (Loop In)
 */
export interface BoltzCreateSwapRequest {
  type: 'submarine'
  pairId: string
  orderSide: 'buy' | 'sell'
  invoice: string
  refundPublicKey: string
  channel?: {
    auto: boolean
    private: boolean
    inboundLiquidity: number
  }
}

/**
 * Resposta de criação de swap normal
 */
export interface BoltzSwapResponse {
  id: string
  bip21: string
  address: string
  redeemScript: string
  acceptZeroConf: boolean
  expectedAmount: number
  timeoutBlockHeight: number
  blindingKey?: string
}

/**
 * Request para criar reverse swap (Loop Out)
 */
export interface BoltzCreateReverseSwapRequest {
  type: 'reversesubmarine'
  pairId: string
  orderSide: 'buy' | 'sell'
  invoiceAmount: number
  claimPublicKey: string
  preimageHash: string
  onchainAmount?: number
  address?: string
}

/**
 * Resposta de criação de reverse swap
 */
export interface BoltzReverseSwapResponse {
  id: string
  invoice: string
  redeemScript: string
  lockupAddress: string
  onchainAmount: number
  timeoutBlockHeight: number
  blindingKey?: string
}

/**
 * Status de um swap
 */
export interface BoltzSwapStatus {
  status: BoltzSwapStatusType
  zeroConfRejected?: boolean
  transaction?: {
    id: string
    hex: string
  }
  failureReason?: string
}

/**
 * Tipos de status Boltz
 */
export type BoltzSwapStatusType =
  | 'swap.created'
  | 'swap.expired'
  | 'transaction.mempool'
  | 'transaction.confirmed'
  | 'transaction.claimed'
  | 'transaction.refunded'
  | 'invoice.pending'
  | 'invoice.paid'
  | 'invoice.failedToPay'
  | 'invoice.settled'
  | 'invoice.expired'
  | 'minerfee.paid'
  | 'transaction.lockupFailed'

// ============================================================================
// Cliente Boltz
// ============================================================================

/**
 * Cliente para API Boltz
 */
export class BoltzClient {
  private baseUrl: string
  private network: 'mainnet' | 'testnet'

  constructor(network: 'mainnet' | 'testnet' = 'mainnet') {
    this.network = network
    this.baseUrl = network === 'mainnet' ? BOLTZ_API_MAINNET : BOLTZ_API_TESTNET
  }

  /**
   * Faz request HTTP
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Boltz API error: ${response.status} - ${errorText}`)
      }

      return await response.json()
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Obtém informações sobre pares de swap
   */
  async getPairs(): Promise<BoltzPairsResponse> {
    return this.request<BoltzPairsResponse>('/getpairs')
  }

  /**
   * Obtém fees e limites para BTC/BTC
   */
  async getSwapFees(): Promise<SwapFees> {
    const pairs = await this.getPairs()
    const btcPair = pairs.pairs[BTC_PAIR]

    if (!btcPair) {
      throw new Error('BTC/BTC pair not found')
    }

    return {
      percentageBps: Math.round(btcPair.fees.percentage * 100), // convert % to bps
      miningFeeSat: BigInt(btcPair.fees.minerFees.baseAsset.normal),
      minAmountSat: BigInt(btcPair.limits.minimal),
      maxForwardSat: BigInt(btcPair.limits.maximal),
      maxReverseSat: BigInt(btcPair.limits.maximal),
    }
  }

  /**
   * Obtém oferta de swap
   */
  async getSwapOffer(): Promise<SwapOffer> {
    const fees = await this.getSwapFees()

    // Boltz não expõe pubkey diretamente, será fornecida na resposta do swap
    return {
      fees,
      serverPubkey: '',
      relays: [],
      powBits: 0,
      timestamp: Date.now(),
    }
  }

  /**
   * Cria um swap normal (Loop In: Chain → Lightning)
   */
  async createSwap(params: {
    invoice: string
    refundPublicKey: string
  }): Promise<BoltzSwapResponse> {
    const request: BoltzCreateSwapRequest = {
      type: 'submarine',
      pairId: BTC_PAIR,
      orderSide: 'sell',
      invoice: params.invoice,
      refundPublicKey: params.refundPublicKey,
    }

    return this.request<BoltzSwapResponse>('/createswap', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  /**
   * Cria um reverse swap (Loop Out: Lightning → Chain)
   */
  async createReverseSwap(params: {
    invoiceAmount: number
    claimPublicKey: string
    preimageHash: string
    onchainAddress?: string
  }): Promise<BoltzReverseSwapResponse> {
    const request: BoltzCreateReverseSwapRequest = {
      type: 'reversesubmarine',
      pairId: BTC_PAIR,
      orderSide: 'buy',
      invoiceAmount: params.invoiceAmount,
      claimPublicKey: params.claimPublicKey,
      preimageHash: params.preimageHash,
      address: params.onchainAddress,
    }

    return this.request<BoltzReverseSwapResponse>('/createswap', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  /**
   * Obtém status de um swap
   */
  async getSwapStatus(swapId: string): Promise<BoltzSwapStatus> {
    return this.request<BoltzSwapStatus>(`/swapstatus?id=${swapId}`)
  }

  /**
   * Faz streaming de status via WebSocket (se disponível)
   */
  subscribeToSwapStatus(
    swapId: string,
    onStatus: (status: BoltzSwapStatus) => void,
    onError?: (error: Error) => void,
  ): () => void {
    let isRunning = true

    // Polling fallback (Boltz também suporta WebSocket, mas polling é mais simples)
    const poll = async () => {
      while (isRunning) {
        try {
          const status = await this.getSwapStatus(swapId)
          onStatus(status)

          // Parar se swap terminou
          if (isTerminalStatus(status.status)) {
            isRunning = false
            break
          }
        } catch (err) {
          onError?.(err instanceof Error ? err : new Error(String(err)))
        }

        await sleep(STATUS_POLL_INTERVAL)
      }
    }

    poll()

    // Retorna função para cancelar
    return () => {
      isRunning = false
    }
  }

  /**
   * Broadcast de transação claim
   */
  async broadcastTransaction(txHex: string): Promise<{ transactionId: string }> {
    return this.request<{ transactionId: string }>('/broadcasttransaction', {
      method: 'POST',
      body: JSON.stringify({
        currency: 'BTC',
        transactionHex: txHex,
      }),
    })
  }
}

// ============================================================================
// Boltz Swap Manager
// ============================================================================

/**
 * Gerenciador de swaps integrado com Boltz
 */
export class BoltzSwapManager {
  private client: BoltzClient
  private swaps: Map<string, SwapData> = new Map()
  private subscriptions: Map<string, () => void> = new Map()
  private network: 'mainnet' | 'testnet'

  constructor(network: 'mainnet' | 'testnet' = 'mainnet') {
    this.network = network
    this.client = new BoltzClient(network)
  }

  /**
   * Obtém fees atuais
   */
  async getFees(): Promise<SwapFees> {
    return this.client.getSwapFees()
  }

  /**
   * Cria Loop In (Chain → Lightning)
   */
  async createLoopIn(params: { invoice: string; refundAddress: string }): Promise<SwapData> {
    // Gerar keypair para refund
    const { privateKey, publicKey } = generateSwapKeyPair()
    const refundPubkeyHex = uint8ArrayToHex(publicKey)

    // Criar swap na API Boltz
    const response = await this.client.createSwap({
      invoice: params.invoice,
      refundPublicKey: refundPubkeyHex,
    })

    // Validar e extrair parâmetros do redeem script retornado
    const redeemScriptBytes = hexToUint8Array(response.redeemScript)
    const scriptParams = extractSwapScriptParams(redeemScriptBytes)

    if (!scriptParams) {
      throw new Error('Invalid redeem script: could not extract parameters')
    }

    // Criar SwapData
    const swapData: SwapData = {
      type: SwapType.FORWARD,
      state: SwapState.CREATED,
      locktime: response.timeoutBlockHeight,
      onchainAmountSat: BigInt(response.expectedAmount),
      lightningAmountSat: 0n, // Será extraído da invoice
      redeemScript: response.redeemScript,
      paymentHash: '', // Extrair da invoice
      privateKey: uint8ArrayToHex(privateKey),
      lockupAddress: response.address,
      claimToAddress: params.refundAddress,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      serverPubkey: uint8ArrayToHex(scriptParams.claimPubkey),
    }

    // Salvar swap
    this.swaps.set(response.id, swapData)

    // Iniciar monitoramento
    this.startMonitoring(response.id)

    return swapData
  }

  /**
   * Cria Loop Out (Lightning → Chain)
   */
  async createLoopOut(params: { amountSat: bigint; onchainAddress: string }): Promise<SwapData> {
    // Gerar preimage e keypair
    const { preimage, paymentHash } = generatePreimage()
    const { privateKey, publicKey } = generateSwapKeyPair()

    const claimPubkeyHex = uint8ArrayToHex(publicKey)
    const preimageHashHex = uint8ArrayToHex(paymentHash)

    // Criar reverse swap na API Boltz
    const response = await this.client.createReverseSwap({
      invoiceAmount: Number(params.amountSat),
      claimPublicKey: claimPubkeyHex,
      preimageHash: preimageHashHex,
      onchainAddress: params.onchainAddress,
    })

    // Validar e extrair parâmetros do redeem script
    const redeemScriptBytes = hexToUint8Array(response.redeemScript)
    const scriptParams = extractSwapScriptParams(redeemScriptBytes)

    if (!scriptParams) {
      throw new Error('Invalid redeem script: could not extract parameters')
    }

    // Criar SwapData
    const swapData: SwapData = {
      type: SwapType.REVERSE,
      state: SwapState.CREATED,
      locktime: response.timeoutBlockHeight,
      onchainAmountSat: BigInt(response.onchainAmount),
      lightningAmountSat: params.amountSat,
      redeemScript: response.redeemScript,
      preimage: uint8ArrayToHex(preimage),
      paymentHash: preimageHashHex,
      privateKey: uint8ArrayToHex(privateKey),
      lockupAddress: response.lockupAddress,
      claimToAddress: params.onchainAddress,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      serverPubkey: uint8ArrayToHex(scriptParams.refundPubkey),
    }

    // Salvar swap
    this.swaps.set(response.id, swapData)

    // Iniciar monitoramento
    this.startMonitoring(response.id)

    return { ...swapData, invoice: response.invoice } as SwapData & { invoice: string }
  }

  /**
   * Obtém swap por ID
   */
  getSwap(swapId: string): SwapData | undefined {
    return this.swaps.get(swapId)
  }

  /**
   * Lista todos os swaps
   */
  getAllSwaps(): SwapData[] {
    return Array.from(this.swaps.values())
  }

  /**
   * Inicia monitoramento de status
   */
  private startMonitoring(swapId: string): void {
    const unsubscribe = this.client.subscribeToSwapStatus(
      swapId,
      status => this.handleStatusUpdate(swapId, status),
      error => console.error(`Swap ${swapId} monitoring error:`, error),
    )

    this.subscriptions.set(swapId, unsubscribe)
  }

  /**
   * Para monitoramento de um swap
   */
  stopMonitoring(swapId: string): void {
    const unsubscribe = this.subscriptions.get(swapId)
    if (unsubscribe) {
      unsubscribe()
      this.subscriptions.delete(swapId)
    }
  }

  /**
   * Processa atualização de status
   */
  private handleStatusUpdate(swapId: string, status: BoltzSwapStatus): void {
    const swap = this.swaps.get(swapId)
    if (!swap) return

    const newState = mapBoltzStatusToSwapState(status.status)

    // Atualizar estado
    swap.state = newState
    swap.updatedAt = Date.now()

    // Salvar TX info se disponível
    if (status.transaction) {
      if (swap.type === SwapType.FORWARD) {
        swap.fundingTxid = status.transaction.id
      } else {
        swap.spendingTxid = status.transaction.id
      }
    }

    this.swaps.set(swapId, swap)
  }

  /**
   * Tenta claim de reverse swap
   */
  async claimReverseSwap(
    swapId: string,
    claimAddress: string,
    feeRate: number,
  ): Promise<{ txid: string }> {
    const swap = this.swaps.get(swapId)
    if (!swap) {
      throw new Error('Swap not found')
    }

    if (swap.type !== SwapType.REVERSE) {
      throw new Error('Not a reverse swap')
    }

    if (!swap.preimage) {
      throw new Error('Preimage not available')
    }

    // TODO: Construir e assinar claim transaction
    // Isso requer:
    // 1. Buscar UTXO do lockup address
    // 2. Construir TX com witness correto
    // 3. Assinar com privateKey do swap
    // 4. Broadcast via Boltz ou Electrum

    throw new Error('Claim not implemented - use external signing')
  }

  /**
   * Tenta refund de swap expirado
   */
  async refundExpiredSwap(
    swapId: string,
    refundAddress: string,
    feeRate: number,
  ): Promise<{ txid: string }> {
    const swap = this.swaps.get(swapId)
    if (!swap) {
      throw new Error('Swap not found')
    }

    if (swap.type !== SwapType.FORWARD) {
      throw new Error('Only forward swaps can be refunded')
    }

    if (swap.state !== SwapState.EXPIRED) {
      throw new Error('Swap is not expired')
    }

    // TODO: Construir e assinar refund transaction
    // Similar ao claim, mas usando o path de refund do script

    throw new Error('Refund not implemented - use external signing')
  }

  /**
   * Limpa recursos
   */
  destroy(): void {
    for (const [swapId] of this.subscriptions) {
      this.stopMonitoring(swapId)
    }
    this.swaps.clear()
  }
}

// ============================================================================
// Utilitários
// ============================================================================

/**
 * Verifica se status é terminal
 */
function isTerminalStatus(status: BoltzSwapStatusType): boolean {
  return [
    'swap.expired',
    'transaction.claimed',
    'transaction.refunded',
    'invoice.failedToPay',
    'invoice.expired',
    'transaction.lockupFailed',
  ].includes(status)
}

/**
 * Mapeia status Boltz para SwapState
 */
function mapBoltzStatusToSwapState(status: BoltzSwapStatusType): SwapState {
  const mapping: Record<BoltzSwapStatusType, SwapState> = {
    'swap.created': SwapState.CREATED,
    'swap.expired': SwapState.EXPIRED,
    'transaction.mempool': SwapState.FUNDED,
    'transaction.confirmed': SwapState.CONFIRMED,
    'transaction.claimed': SwapState.COMPLETED,
    'transaction.refunded': SwapState.REFUNDED,
    'invoice.pending': SwapState.CREATED,
    'invoice.paid': SwapState.FUNDED,
    'invoice.failedToPay': SwapState.FAILED,
    'invoice.settled': SwapState.COMPLETED,
    'invoice.expired': SwapState.EXPIRED,
    'minerfee.paid': SwapState.FUNDED,
    'transaction.lockupFailed': SwapState.FAILED,
  }

  return mapping[status] || SwapState.CREATED
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// Exports
// ============================================================================

export { SwapType, SwapState, type SwapData, type SwapFees } from './submarineSwap'
