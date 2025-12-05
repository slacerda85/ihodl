// BOLT #4: Multi-Path Payments (MPP) Implementation
// Implements Basic MPP as defined in BOLT #4
// https://github.com/lightning/bolts/blob/master/04-onion-routing.md#basic-multi-part-payments

import {
  MppConfig,
  MppPayment,
  MppPart,
  MppPartStatus,
  MppPaymentStatus,
  MppSplitResult,
  MppPartAllocation,
  MppRoute,
  MppRouteHop,
  MppPaymentRequest,
  MppPaymentResult,
  MppPartResult,
  ChannelLiquidity,
  LiquidityHint,
  DEFAULT_MPP_CONFIG,
  TLV_PAYMENT_DATA,
} from '@/core/models/lightning/mpp'
import { Sha256, ShortChannelId } from '@/core/models/lightning/base'
import { FailureCode } from '@/core/models/lightning/routing'
import { RoutingGraph, PaymentRoute } from './routing'
import { encodeBigSize } from './base'
import { randomBytes } from '../crypto'

// ==========================================
// FASE 3: ENHANCED MPP FEATURES
// ==========================================

/**
 * Configuração avançada para retry inteligente
 */
export interface EnhancedRetryConfig {
  /** Máximo de retries por parte */
  maxRetriesPerPart: number
  /** Máximo de retries totais do pagamento */
  maxTotalRetries: number
  /** Delay base entre retries (ms) */
  retryDelayMs: number
  /** Fator de backoff exponencial */
  backoffFactor: number
  /** Delay máximo entre retries (ms) */
  maxRetryDelayMs: number
  /** Se deve tentar resplit em falha */
  enableResplit: boolean
  /** Se deve fazer probe de liquidez */
  enableLiquidityProbing: boolean
}

export const DEFAULT_ENHANCED_RETRY_CONFIG: EnhancedRetryConfig = {
  maxRetriesPerPart: 3,
  maxTotalRetries: 10,
  retryDelayMs: 100,
  backoffFactor: 2,
  maxRetryDelayMs: 5000,
  enableResplit: true,
  enableLiquidityProbing: true,
}

/**
 * Informação de falha de canal/path
 */
export interface FailedPathInfo {
  /** ID do canal que falhou */
  channelId: Uint8Array
  /** Node que reportou a falha */
  failingNode?: Uint8Array
  /** Código de falha */
  failureCode: FailureCode
  /** Timestamp da falha */
  timestamp: number
  /** Quantidade que falhou */
  amountMsat: bigint
  /** Quantas vezes falhou */
  failureCount: number
  /** Expiry da exclusão (quando pode tentar de novo) */
  exclusionExpiry: number
}

/**
 * Gerenciador de exclusão de paths
 */
export class PathExclusionManager {
  private failedPaths: Map<string, FailedPathInfo> = new Map()
  private failedNodes: Map<string, number> = new Map() // nodeId -> expiry timestamp

  /** Duração padrão de exclusão (30 minutos) */
  private static readonly DEFAULT_EXCLUSION_DURATION_MS = 30 * 60 * 1000

  /** Exclusão curta para erros temporários (5 minutos) */
  private static readonly SHORT_EXCLUSION_DURATION_MS = 5 * 60 * 1000

  /** Exclusão longa para erros graves (2 horas) */
  private static readonly LONG_EXCLUSION_DURATION_MS = 2 * 60 * 60 * 1000

  /**
   * Registra falha de um canal/path
   */
  recordFailure(
    channelId: Uint8Array,
    failureCode: FailureCode,
    amountMsat: bigint,
    failingNode?: Uint8Array,
  ): void {
    const channelHex = uint8ArrayToHex(channelId)
    const existing = this.failedPaths.get(channelHex)

    const exclusionDuration = this.getExclusionDuration(failureCode)

    if (existing) {
      existing.failureCount++
      existing.timestamp = Date.now()
      existing.amountMsat = amountMsat
      existing.failureCode = failureCode
      // Aumentar exclusão com falhas repetidas
      existing.exclusionExpiry = Date.now() + exclusionDuration * Math.min(existing.failureCount, 4)
    } else {
      this.failedPaths.set(channelHex, {
        channelId,
        failingNode,
        failureCode,
        timestamp: Date.now(),
        amountMsat,
        failureCount: 1,
        exclusionExpiry: Date.now() + exclusionDuration,
      })
    }

    // Também excluir o node se aplicável
    if (failingNode && this.shouldExcludeNode(failureCode)) {
      const nodeHex = uint8ArrayToHex(failingNode)
      this.failedNodes.set(nodeHex, Date.now() + exclusionDuration)
    }
  }

  /**
   * Verifica se canal está excluído
   */
  isChannelExcluded(channelId: Uint8Array): boolean {
    const channelHex = uint8ArrayToHex(channelId)
    const info = this.failedPaths.get(channelHex)
    return info !== undefined && info.exclusionExpiry > Date.now()
  }

  /**
   * Verifica se canal está excluído para um valor específico
   */
  isChannelExcludedForAmount(channelId: Uint8Array, amountMsat: bigint): boolean {
    const channelHex = uint8ArrayToHex(channelId)
    const info = this.failedPaths.get(channelHex)

    if (!info || info.exclusionExpiry <= Date.now()) return false

    // Se falhou para valor menor ou igual, está excluído
    if (info.amountMsat <= amountMsat) return true

    // Para valores menores, pode tentar (liquidez parcial)
    return false
  }

  /**
   * Verifica se node está excluído
   */
  isNodeExcluded(nodeId: Uint8Array): boolean {
    const nodeHex = uint8ArrayToHex(nodeId)
    const expiry = this.failedNodes.get(nodeHex)
    return expiry !== undefined && expiry > Date.now()
  }

  /**
   * Retorna canais excluídos para filtragem de rotas
   */
  getExcludedChannels(): Set<string> {
    const excluded = new Set<string>()
    const now = Date.now()

    for (const [channelHex, info] of this.failedPaths) {
      if (info.exclusionExpiry > now) {
        excluded.add(channelHex)
      }
    }

    return excluded
  }

  /**
   * Retorna nodes excluídos
   */
  getExcludedNodes(): Set<string> {
    const excluded = new Set<string>()
    const now = Date.now()

    for (const [nodeHex, expiry] of this.failedNodes) {
      if (expiry > now) {
        excluded.add(nodeHex)
      }
    }

    return excluded
  }

  /**
   * Limpa exclusões expiradas
   */
  pruneExpired(): void {
    const now = Date.now()

    for (const [key, info] of this.failedPaths) {
      if (info.exclusionExpiry <= now) {
        this.failedPaths.delete(key)
      }
    }

    for (const [key, expiry] of this.failedNodes) {
      if (expiry <= now) {
        this.failedNodes.delete(key)
      }
    }
  }

  /**
   * Registra sucesso de um canal (remove exclusão)
   */
  recordSuccess(channelId: Uint8Array): void {
    const channelHex = uint8ArrayToHex(channelId)
    this.failedPaths.delete(channelHex)
  }

  /**
   * Determina duração de exclusão baseado no código de falha
   */
  private getExclusionDuration(failureCode: FailureCode): number {
    switch (failureCode) {
      // Erros temporários - exclusão curta
      case FailureCode.TEMPORARY_NODE_FAILURE:
      case FailureCode.TEMPORARY_CHANNEL_FAILURE:
        return PathExclusionManager.SHORT_EXCLUSION_DURATION_MS

      // Erros de liquidez - exclusão média
      case FailureCode.AMOUNT_BELOW_MINIMUM:
      case FailureCode.INSUFFICIENT_BALANCE:
        return PathExclusionManager.DEFAULT_EXCLUSION_DURATION_MS

      // Erros graves - exclusão longa
      case FailureCode.PERMANENT_NODE_FAILURE:
      case FailureCode.PERMANENT_CHANNEL_FAILURE:
      case FailureCode.REQUIRED_NODE_FEATURE_MISSING:
      case FailureCode.REQUIRED_CHANNEL_FEATURE_MISSING:
        return PathExclusionManager.LONG_EXCLUSION_DURATION_MS

      // Erros desconhecidos - exclusão média
      default:
        return PathExclusionManager.DEFAULT_EXCLUSION_DURATION_MS
    }
  }

  /**
   * Determina se deve excluir o node baseado no erro
   */
  private shouldExcludeNode(failureCode: FailureCode): boolean {
    switch (failureCode) {
      case FailureCode.PERMANENT_NODE_FAILURE:
      case FailureCode.REQUIRED_NODE_FEATURE_MISSING:
      case FailureCode.TEMPORARY_NODE_FAILURE:
        return true
      default:
        return false
    }
  }
}

/**
 * Estratégias de splitting dinâmico
 */
export enum SplitStrategy {
  /** Dividir igualmente */
  EQUAL = 'equal',
  /** Baseado em liquidez conhecida */
  LIQUIDITY_BASED = 'liquidity_based',
  /** Baseado em taxa de sucesso */
  SUCCESS_RATE_BASED = 'success_rate_based',
  /** Híbrido (liquidez + sucesso) */
  HYBRID = 'hybrid',
  /** Adaptativo (muda baseado em falhas) */
  ADAPTIVE = 'adaptive',
}

/**
 * Resultado de análise de erro de pagamento
 */
export interface PaymentErrorAnalysis {
  /** Código de falha original */
  originalCode: FailureCode
  /** Se é erro recuperável */
  isRecoverable: boolean
  /** Ação recomendada */
  recommendedAction: 'retry' | 'resplit' | 'abort' | 'wait'
  /** Canal a excluir (se aplicável) */
  channelToExclude?: Uint8Array
  /** Node a excluir (se aplicável) */
  nodeToExclude?: Uint8Array
  /** Novo valor sugerido para tentar */
  suggestedAmountMsat?: bigint
  /** Delay antes de retry */
  retryDelayMs: number
  /** Mensagem de erro legível */
  humanReadableError: string
}

/**
 * Analisa erro de pagamento e determina melhor ação
 */
export function analyzePaymentError(
  failureCode: FailureCode,
  failingChannel?: Uint8Array,
  failingNode?: Uint8Array,
  attemptedAmountMsat?: bigint,
  retryCount: number = 0,
): PaymentErrorAnalysis {
  const baseDelay = 100 * Math.pow(2, Math.min(retryCount, 5)) // Exponential backoff

  switch (failureCode) {
    // Erros de liquidez - pode tentar com valor menor
    case FailureCode.TEMPORARY_CHANNEL_FAILURE:
      return {
        originalCode: failureCode,
        isRecoverable: true,
        recommendedAction: 'resplit',
        channelToExclude: failingChannel,
        suggestedAmountMsat: attemptedAmountMsat ? attemptedAmountMsat / 2n : undefined,
        retryDelayMs: baseDelay,
        humanReadableError: 'Canal temporariamente indisponível - tentando rota alternativa',
      }

    case FailureCode.AMOUNT_BELOW_MINIMUM:
      return {
        originalCode: failureCode,
        isRecoverable: false,
        recommendedAction: 'abort',
        retryDelayMs: 0,
        humanReadableError: 'Valor abaixo do mínimo do canal',
      }

    case FailureCode.INSUFFICIENT_BALANCE:
      return {
        originalCode: failureCode,
        isRecoverable: true,
        recommendedAction: 'resplit',
        channelToExclude: failingChannel,
        suggestedAmountMsat: attemptedAmountMsat ? (attemptedAmountMsat * 3n) / 4n : undefined,
        retryDelayMs: baseDelay,
        humanReadableError: 'Liquidez insuficiente - dividindo pagamento',
      }

    // Erros de node - tentar evitar node
    case FailureCode.TEMPORARY_NODE_FAILURE:
      return {
        originalCode: failureCode,
        isRecoverable: true,
        recommendedAction: 'retry',
        nodeToExclude: failingNode,
        retryDelayMs: baseDelay * 2,
        humanReadableError: 'Node temporariamente indisponível',
      }

    case FailureCode.PERMANENT_NODE_FAILURE:
      return {
        originalCode: failureCode,
        isRecoverable: retryCount < 2, // Pode tentar outra rota
        recommendedAction: retryCount < 2 ? 'retry' : 'abort',
        nodeToExclude: failingNode,
        retryDelayMs: baseDelay * 3,
        humanReadableError: 'Node permanentemente indisponível',
      }

    // Erros de feature - provavelmente fatal
    case FailureCode.REQUIRED_NODE_FEATURE_MISSING:
    case FailureCode.REQUIRED_CHANNEL_FEATURE_MISSING:
      return {
        originalCode: failureCode,
        isRecoverable: false,
        recommendedAction: 'abort',
        nodeToExclude: failingNode,
        retryDelayMs: 0,
        humanReadableError: 'Feature requerida não suportada',
      }

    // Erros de CLTV - pode ajustar e tentar de novo
    case FailureCode.INCORRECT_CLTV_EXPIRY:
    case FailureCode.EXPIRY_TOO_SOON:
      return {
        originalCode: failureCode,
        isRecoverable: true,
        recommendedAction: 'retry',
        channelToExclude: failingChannel,
        retryDelayMs: baseDelay,
        humanReadableError: 'Erro de timing - ajustando parâmetros',
      }

    // Erro de MPP - timeout de partes
    case FailureCode.MPP_TIMEOUT:
      return {
        originalCode: failureCode,
        isRecoverable: true,
        recommendedAction: 'retry',
        retryDelayMs: baseDelay * 2,
        humanReadableError: 'Timeout de pagamento multipart - tentando novamente',
      }

    // Destino não encontrado
    case FailureCode.UNKNOWN_NEXT_PEER:
      return {
        originalCode: failureCode,
        isRecoverable: false,
        recommendedAction: 'abort',
        retryDelayMs: 0,
        humanReadableError: 'Destino não encontrado na rede',
      }

    // Erro desconhecido
    default:
      return {
        originalCode: failureCode,
        isRecoverable: retryCount < 3,
        recommendedAction: retryCount < 3 ? 'retry' : 'abort',
        channelToExclude: failingChannel,
        retryDelayMs: baseDelay * 2,
        humanReadableError: `Erro de pagamento: ${FailureCode[failureCode] || failureCode}`,
      }
  }
}

/**
 * MPP Payment Manager
 * Handles splitting, routing, and tracking of multi-path payments
 */
export class MppPaymentManager {
  private config: MppConfig
  private routingGraph: RoutingGraph
  private activePayments: Map<string, MppPayment> = new Map()
  private liquidityHints: Map<string, LiquidityHint> = new Map()
  private channelLiquidity: Map<string, ChannelLiquidity> = new Map()

  constructor(routingGraph: RoutingGraph, config: Partial<MppConfig> = {}) {
    this.config = { ...DEFAULT_MPP_CONFIG, ...config }
    this.routingGraph = routingGraph
  }

  /**
   * Initiates a multi-path payment
   */
  async sendPayment(request: MppPaymentRequest): Promise<MppPaymentResult> {
    const startTime = Date.now()
    const paymentHashHex = uint8ArrayToHex(request.paymentHash)

    // Merge config with request-specific overrides
    const config = { ...this.config, ...request.config }

    // Validate request
    const validationError = this.validateRequest(request, config)
    if (validationError) {
      return { success: false, error: validationError }
    }

    // Create payment record
    const payment: MppPayment = {
      paymentHash: request.paymentHash,
      paymentSecret: request.paymentSecret,
      totalAmountMsat: request.amountMsat,
      destinationNodeId: request.destinationNodeId,
      parts: [],
      status: MppPaymentStatus.PENDING,
      totalFeesMsat: 0n,
      createdAt: Date.now(),
      metadata: request.metadata,
    }

    this.activePayments.set(paymentHashHex, payment)

    try {
      // Split the payment into parts
      const splitResult = await this.splitPayment(
        request.amountMsat,
        request.destinationNodeId,
        config,
      )

      if (!splitResult.success || splitResult.parts.length === 0) {
        payment.status = MppPaymentStatus.FAILED
        return { success: false, error: splitResult.error || 'Failed to split payment' }
      }

      // Find routes for each part
      const routedParts = await this.routeParts(
        splitResult.parts,
        request.destinationNodeId,
        request.paymentHash,
        request.paymentSecret,
        request.finalCltvDelta,
        config,
      )

      if (routedParts.length === 0) {
        payment.status = MppPaymentStatus.FAILED
        return { success: false, error: 'Failed to find routes for any part' }
      }

      // Update payment with parts
      payment.parts = routedParts
      payment.status = MppPaymentStatus.IN_FLIGHT

      // Send all parts
      const results = await this.sendAllParts(payment, config)

      // Aggregate results
      const successfulParts = results.filter(r => r.success)
      const totalFeePaid = successfulParts.reduce((sum, r) => sum + (r.feeMsat || 0n), 0n)

      if (successfulParts.length === routedParts.length) {
        // All parts succeeded
        payment.status = MppPaymentStatus.COMPLETE
        payment.completedAt = Date.now()
        payment.totalFeesMsat = totalFeePaid

        // Get preimage from first successful part
        const preimage = payment.parts.find(p => p.preimage)?.preimage

        return {
          success: true,
          preimage,
          totalFeesMsat: totalFeePaid,
          numParts: routedParts.length,
          timeTakenMs: Date.now() - startTime,
          partResults: results,
        }
      } else {
        // Some parts failed - payment failed
        payment.status = MppPaymentStatus.FAILED
        return {
          success: false,
          error: `Only ${successfulParts.length}/${routedParts.length} parts succeeded`,
          partResults: results,
        }
      }
    } catch (error) {
      payment.status = MppPaymentStatus.FAILED
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Validates a payment request
   */
  private validateRequest(request: MppPaymentRequest, config: MppConfig): string | null {
    if (request.amountMsat <= 0n) {
      return 'Amount must be positive'
    }

    if (request.paymentHash.length !== 32) {
      return 'Invalid payment hash length'
    }

    if (request.paymentSecret.length !== 32) {
      return 'Invalid payment secret length (required for MPP)'
    }

    if (request.destinationNodeId.length !== 33) {
      return 'Invalid destination node ID length'
    }

    if (request.amountMsat < config.minPartSizeMsat) {
      return `Amount ${request.amountMsat} is below minimum part size ${config.minPartSizeMsat}`
    }

    return null
  }

  /**
   * Splits a payment amount into multiple parts based on channel liquidity
   */
  async splitPayment(
    totalAmountMsat: bigint,
    destinationNodeId: Uint8Array,
    config: MppConfig,
  ): Promise<MppSplitResult> {
    // Get available channels and their liquidity
    const availableChannels = this.getAvailableChannels(destinationNodeId)

    if (availableChannels.length === 0) {
      return { success: false, parts: [], error: 'No available channels' }
    }

    // Calculate total available liquidity
    const totalLiquidity = availableChannels.reduce((sum, ch) => sum + ch.availableMsat, 0n)

    if (totalLiquidity < totalAmountMsat) {
      return {
        success: false,
        parts: [],
        error: `Insufficient liquidity: ${totalLiquidity} < ${totalAmountMsat}`,
      }
    }

    // Determine optimal number of parts
    const numParts = this.calculateOptimalParts(totalAmountMsat, availableChannels, config)

    if (numParts === 0) {
      return { success: false, parts: [], error: 'Cannot determine optimal split' }
    }

    // Split the payment
    const parts = this.performSplit(totalAmountMsat, numParts, availableChannels, config)

    // Validate split
    const totalSplit = parts.reduce((sum, p) => sum + p.amountMsat, 0n)
    if (totalSplit !== totalAmountMsat) {
      return {
        success: false,
        parts: [],
        error: `Split mismatch: ${totalSplit} != ${totalAmountMsat}`,
      }
    }

    return { success: true, parts }
  }

  /**
   * Gets available channels for routing to destination
   */
  private getAvailableChannels(_destinationNodeId: Uint8Array): ChannelLiquidity[] {
    const channels: ChannelLiquidity[] = []

    // Get all channels from our node
    const allChannels = this.routingGraph.getAllChannels()

    for (const channel of allChannels) {
      const channelIdHex = uint8ArrayToHex(channel.shortChannelId)

      // Check if we have liquidity info cached
      const cached = this.channelLiquidity.get(channelIdHex)

      if (cached) {
        channels.push(cached)
      } else {
        // Estimate from channel capacity
        const estimatedLiquidity: ChannelLiquidity = {
          channelId: channel.shortChannelId,
          availableMsat: channel.htlcMaximumMsat || channel.capacity,
          successRate: 0.5, // Default 50% success rate
        }
        channels.push(estimatedLiquidity)
      }
    }

    // Sort by success rate and available liquidity
    return channels.sort((a, b) => {
      const scoreA = Number(a.availableMsat) * a.successRate
      const scoreB = Number(b.availableMsat) * b.successRate
      return scoreB - scoreA
    })
  }

  /**
   * Calculates optimal number of parts for a payment
   */
  private calculateOptimalParts(
    totalAmountMsat: bigint,
    channels: ChannelLiquidity[],
    config: MppConfig,
  ): number {
    // If amount fits in single channel with good success rate, use 1 part
    const bestChannel = channels[0]
    if (
      bestChannel &&
      bestChannel.availableMsat >= totalAmountMsat &&
      bestChannel.successRate > 0.9
    ) {
      return 1
    }

    // Calculate minimum parts needed based on liquidity
    let minPartsNeeded = 1
    let accumulatedLiquidity = 0n

    for (const channel of channels) {
      if (accumulatedLiquidity >= totalAmountMsat) break
      accumulatedLiquidity += channel.availableMsat
      minPartsNeeded++
    }

    // Calculate ideal part size (aim for 80% of average channel capacity)
    const avgChannelCapacity =
      channels.reduce((sum, ch) => sum + ch.availableMsat, 0n) / BigInt(channels.length)

    const idealPartSize = (avgChannelCapacity * 80n) / 100n
    const idealParts = Number(totalAmountMsat / idealPartSize) + 1

    // Use the larger of minPartsNeeded and idealParts, capped by maxParts
    let numParts = Math.max(minPartsNeeded, idealParts)
    numParts = Math.min(numParts, config.maxParts)

    // Ensure each part meets minimum size
    const minParts = Number(totalAmountMsat / config.maxPartSizeMsat) + 1
    const maxParts = Number(totalAmountMsat / config.minPartSizeMsat)

    numParts = Math.max(numParts, minParts)
    numParts = Math.min(numParts, maxParts)

    return numParts
  }

  /**
   * Performs the actual split of payment into parts
   */
  private performSplit(
    totalAmountMsat: bigint,
    numParts: number,
    channels: ChannelLiquidity[],
    config: MppConfig,
  ): MppPartAllocation[] {
    const parts: MppPartAllocation[] = []
    let remainingAmount = totalAmountMsat

    // Strategy: Distribute proportionally to channel liquidity
    const totalLiquidity = channels
      .slice(0, numParts)
      .reduce((sum, ch) => sum + ch.availableMsat, 0n)

    for (let i = 0; i < numParts; i++) {
      const channel = channels[i % channels.length]

      let partAmount: bigint

      if (i === numParts - 1) {
        // Last part gets remaining amount
        partAmount = remainingAmount
      } else {
        // Proportional distribution with some randomness for privacy
        const proportion = (channel.availableMsat * 100n) / totalLiquidity
        partAmount = (totalAmountMsat * proportion) / 100n

        // Ensure minimum part size
        if (partAmount < config.minPartSizeMsat) {
          partAmount = config.minPartSizeMsat
        }

        // Ensure we don't exceed remaining
        if (partAmount > remainingAmount - config.minPartSizeMsat * BigInt(numParts - i - 1)) {
          partAmount = remainingAmount - config.minPartSizeMsat * BigInt(numParts - i - 1)
        }
      }

      parts.push({
        index: i,
        amountMsat: partAmount,
        preferredChannelId: channel.channelId,
      })

      remainingAmount -= partAmount
    }

    return parts
  }

  /**
   * Routes all parts of a payment
   */
  private async routeParts(
    allocations: MppPartAllocation[],
    destinationNodeId: Uint8Array,
    paymentHash: Sha256,
    paymentSecret: Sha256,
    finalCltvDelta: number,
    config: MppConfig,
  ): Promise<MppPart[]> {
    const parts: MppPart[] = []
    const usedChannels = new Set<string>()

    for (const allocation of allocations) {
      // Calculate max fee for this part
      const maxFeeMsat = this.calculateMaxFee(allocation.amountMsat, config)

      // Try to find route avoiding already-used channels when possible
      const route = await this.findRouteForPart(
        destinationNodeId,
        allocation.amountMsat,
        maxFeeMsat,
        finalCltvDelta,
        usedChannels,
        allocation.preferredChannelId,
      )

      if (route) {
        const partId = generatePartId()

        parts.push({
          partId,
          amountMsat: allocation.amountMsat,
          route,
          status: MppPartStatus.PENDING,
          retryCount: 0,
          createdAt: Date.now(),
        })

        // Mark first hop channel as used
        if (route.hops.length > 0) {
          usedChannels.add(uint8ArrayToHex(route.hops[0].shortChannelId))
        }
      }
    }

    return parts
  }

  /**
   * Finds a route for a single part
   */
  private async findRouteForPart(
    destinationNodeId: Uint8Array,
    amountMsat: bigint,
    maxFeeMsat: bigint,
    finalCltvDelta: number,
    usedChannels: Set<string>,
    preferredChannelId?: ShortChannelId,
  ): Promise<MppRoute | null> {
    // Get our node ID (would come from wallet/node config in real impl)
    const ourNodeId = new Uint8Array(33) // Placeholder

    // Find route using routing graph
    const result = this.routingGraph.findRoute(ourNodeId, destinationNodeId, amountMsat, maxFeeMsat)

    if (!result.route) {
      return null
    }

    // Convert to MPP route format
    return this.convertToMppRoute(result.route, amountMsat, finalCltvDelta)
  }

  /**
   * Converts a PaymentRoute to MppRoute
   */
  private convertToMppRoute(
    route: PaymentRoute,
    amountMsat: bigint,
    finalCltvDelta: number,
  ): MppRoute {
    const hops: MppRouteHop[] = []
    let currentAmount = amountMsat
    let currentCltv = finalCltvDelta

    // Process hops in reverse to calculate amounts and CLTVs
    for (let i = route.hops.length - 1; i >= 0; i--) {
      const hop = route.hops[i]

      hops.unshift({
        nodeId: hop.nodeId,
        shortChannelId: hop.shortChannelId,
        amountToForwardMsat: currentAmount,
        outgoingCltvValue: currentCltv,
        feeMsat:
          BigInt(hop.feeBaseMsat) +
          (currentAmount * BigInt(hop.feeProportionalMillionths)) / 1000000n,
      })

      // Update for next hop
      currentAmount += hops[0].feeMsat
      currentCltv += hop.cltvExpiryDelta
    }

    return {
      hops,
      totalFeeMsat: route.totalFeeMsat,
      totalCltvDelta: route.totalCltvExpiry,
      successProbability: this.estimateSuccessProbability(hops),
    }
  }

  /**
   * Estimates success probability for a route
   */
  private estimateSuccessProbability(hops: MppRouteHop[]): number {
    let probability = 1.0

    for (const hop of hops) {
      const channelHex = uint8ArrayToHex(hop.shortChannelId)
      const liquidity = this.channelLiquidity.get(channelHex)

      if (liquidity) {
        // Use historical success rate
        probability *= liquidity.successRate
      } else {
        // Default 80% per hop
        probability *= 0.8
      }
    }

    return probability
  }

  /**
   * Calculates maximum fee for a part
   */
  private calculateMaxFee(amountMsat: bigint, config: MppConfig): bigint {
    const percentFee = (amountMsat * BigInt(config.maxFeePercent)) / 100n
    return percentFee < config.maxFeeMsat ? percentFee : config.maxFeeMsat
  }

  /**
   * Sends all parts of a payment
   */
  private async sendAllParts(payment: MppPayment, config: MppConfig): Promise<MppPartResult[]> {
    // Send all parts in parallel
    const promises = payment.parts.map(part => this.sendPart(payment, part, config))
    const partResults = await Promise.all(promises)

    return partResults
  }

  /**
   * Sends a single part of the payment
   */
  private async sendPart(
    payment: MppPayment,
    part: MppPart,
    config: MppConfig,
  ): Promise<MppPartResult> {
    part.status = MppPartStatus.IN_FLIGHT

    try {
      // Build the onion packet for this part (will be used when sending HTLC)
      this.buildPartOnion(part, payment.paymentHash, payment.paymentSecret, payment.totalAmountMsat)

      // In real implementation, this would:
      // 1. Create HTLC with the onion packet
      // 2. Send update_add_htlc message
      // 3. Wait for fulfill or fail

      // Simulate success for now (real impl would await HTLC resolution)
      const success = Math.random() > 0.1 // 90% success rate for simulation

      if (success) {
        part.status = MppPartStatus.SETTLED
        part.preimage = randomBytes(32) // Would come from HTLC fulfill
        part.settledAt = Date.now()

        // Update liquidity hints on success
        this.updateLiquidityHints(part.route, true, part.amountMsat)

        return {
          partId: part.partId,
          amountMsat: part.amountMsat,
          success: true,
          feeMsat: part.route.totalFeeMsat,
        }
      } else {
        throw new Error('HTLC failed')
      }
    } catch (error) {
      // Handle failure with potential retry
      part.status = MppPartStatus.FAILED
      part.failureReason = error instanceof Error ? error.message : 'Unknown error'
      part.retryCount++

      // Update liquidity hints on failure
      this.updateLiquidityHints(part.route, false, part.amountMsat)

      // Retry if configured and under limit
      if (config.autoRetry && part.retryCount < config.maxRetriesPerPart) {
        return this.retryPart(payment, part, config)
      }

      return {
        partId: part.partId,
        amountMsat: part.amountMsat,
        success: false,
        error: part.failureReason,
      }
    }
  }

  /**
   * Retries a failed part with a new route
   */
  private async retryPart(
    payment: MppPayment,
    part: MppPart,
    config: MppConfig,
  ): Promise<MppPartResult> {
    // Find new route avoiding the failed channel
    const failedChannel = part.route.hops[0]?.shortChannelId
    const excludeChannels = new Set<string>()

    if (failedChannel) {
      excludeChannels.add(uint8ArrayToHex(failedChannel))
    }

    const newRoute = await this.findRouteForPart(
      payment.destinationNodeId,
      part.amountMsat,
      this.calculateMaxFee(part.amountMsat, config),
      part.route.hops[part.route.hops.length - 1]?.outgoingCltvValue || 40,
      excludeChannels,
    )

    if (!newRoute) {
      return {
        partId: part.partId,
        amountMsat: part.amountMsat,
        success: false,
        error: 'No alternative route found for retry',
      }
    }

    part.route = newRoute
    part.status = MppPartStatus.PENDING

    return this.sendPart(payment, part, config)
  }

  /**
   * Builds onion data for a part including MPP TLV
   */
  private buildPartOnion(
    part: MppPart,
    paymentHash: Sha256,
    paymentSecret: Sha256,
    totalAmountMsat: bigint,
  ): Uint8Array {
    // Build TLV payload for final hop with MPP data
    const tlvData = this.encodeMppTlv(paymentSecret, totalAmountMsat, part.amountMsat)

    // In real implementation, this would construct full onion packet
    // using constructOnionPacket from routing.ts
    return tlvData
  }

  /**
   * Encodes MPP TLV data for the final hop
   * Per BOLT #4: payment_data contains payment_secret and total_msat
   */
  encodeMppTlv(paymentSecret: Sha256, totalMsat: bigint, partAmountMsat: bigint): Uint8Array {
    const parts: Uint8Array[] = []

    // Type 8: payment_data
    // Contains: payment_secret (32 bytes) + total_msat (tu64)
    const type8 = encodeBigSize(BigInt(TLV_PAYMENT_DATA))
    const totalMsatBytes = encodeTu64(totalMsat)
    const paymentDataValue = new Uint8Array(32 + totalMsatBytes.length)
    paymentDataValue.set(paymentSecret, 0)
    paymentDataValue.set(totalMsatBytes, 32)
    const paymentDataLength = encodeBigSize(BigInt(paymentDataValue.length))

    parts.push(type8, paymentDataLength, paymentDataValue)

    // Concatenate all parts
    const totalLength = parts.reduce((sum, p) => sum + p.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const p of parts) {
      result.set(p, offset)
      offset += p.length
    }

    return result
  }

  /**
   * Decodes MPP TLV data from a received payment
   */
  decodeMppTlv(data: Uint8Array): { paymentSecret: Sha256; totalMsat: bigint } | null {
    if (data.length < 34) {
      // Minimum: 32 byte secret + 1 byte tu64
      return null
    }

    const paymentSecret = data.slice(0, 32) as Sha256
    const totalMsat = decodeTu64(data.slice(32))

    return { paymentSecret, totalMsat }
  }

  /**
   * Updates liquidity hints based on payment results
   */
  private updateLiquidityHints(route: MppRoute, success: boolean, amountMsat: bigint): void {
    for (const hop of route.hops) {
      const channelHex = uint8ArrayToHex(hop.shortChannelId)
      const existing = this.liquidityHints.get(channelHex)

      if (success) {
        // Payment succeeded - we know at least this much liquidity exists
        const hint: LiquidityHint = {
          channelId: hop.shortChannelId,
          direction: true, // Simplified
          minLiquidityMsat: existing
            ? existing.minLiquidityMsat > amountMsat
              ? existing.minLiquidityMsat
              : amountMsat
            : amountMsat,
          maxLiquidityMsat: existing?.maxLiquidityMsat || BigInt(Number.MAX_SAFE_INTEGER),
          lastUpdate: Date.now(),
        }
        this.liquidityHints.set(channelHex, hint)
      } else {
        // Payment failed - update max liquidity estimate
        const hint: LiquidityHint = {
          channelId: hop.shortChannelId,
          direction: true,
          minLiquidityMsat: existing?.minLiquidityMsat || 0n,
          maxLiquidityMsat: amountMsat - 1n,
          lastUpdate: Date.now(),
        }
        this.liquidityHints.set(channelHex, hint)
      }

      // Update channel liquidity cache
      this.updateChannelLiquidity(hop.shortChannelId, success, amountMsat)
    }
  }

  /**
   * Updates channel liquidity estimates
   */
  private updateChannelLiquidity(
    channelId: ShortChannelId,
    success: boolean,
    amountMsat: bigint,
  ): void {
    const channelHex = uint8ArrayToHex(channelId)
    const existing = this.channelLiquidity.get(channelHex)

    if (existing) {
      // Update success rate with exponential moving average
      const alpha = 0.3
      const newSuccessRate = success ? 1 : 0
      existing.successRate = alpha * newSuccessRate + (1 - alpha) * existing.successRate

      if (success) {
        existing.lastSuccessfulAmountMsat = amountMsat
      } else {
        existing.lastFailedAmountMsat = amountMsat
        // Reduce available estimate
        if (existing.availableMsat > amountMsat) {
          existing.availableMsat = amountMsat - 1n
        }
      }
    } else {
      this.channelLiquidity.set(channelHex, {
        channelId,
        availableMsat: success ? amountMsat : 0n,
        successRate: success ? 1 : 0,
        lastSuccessfulAmountMsat: success ? amountMsat : undefined,
        lastFailedAmountMsat: success ? undefined : amountMsat,
      })
    }
  }

  /**
   * Gets the status of an active payment
   */
  getPaymentStatus(paymentHash: Sha256): MppPayment | null {
    const key = uint8ArrayToHex(paymentHash)
    return this.activePayments.get(key) || null
  }

  /**
   * Cancels a pending payment
   */
  async cancelPayment(paymentHash: Sha256): Promise<boolean> {
    const key = uint8ArrayToHex(paymentHash)
    const payment = this.activePayments.get(key)

    if (!payment) {
      return false
    }

    if (payment.status === MppPaymentStatus.COMPLETE) {
      return false // Cannot cancel completed payment
    }

    // Mark all pending parts as failed
    for (const part of payment.parts) {
      if (part.status === MppPartStatus.PENDING || part.status === MppPartStatus.IN_FLIGHT) {
        part.status = MppPartStatus.FAILED
        part.failureReason = 'Cancelled by user'
      }
    }

    payment.status = MppPaymentStatus.FAILED
    return true
  }

  /**
   * Clears old liquidity hints
   */
  pruneOldHints(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs

    for (const [key, hint] of this.liquidityHints.entries()) {
      if (hint.lastUpdate < cutoff) {
        this.liquidityHints.delete(key)
      }
    }
  }

  /**
   * Gets current configuration
   */
  getConfig(): MppConfig {
    return { ...this.config }
  }

  /**
   * Updates configuration
   */
  updateConfig(config: Partial<MppConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

// ============================================
// MPP Receiver Functions
// ============================================

/**
 * MPP Payment Collector
 * Handles receiving multi-part payments
 */
export class MppPaymentCollector {
  private pendingPayments: Map<string, PendingMppPayment> = new Map()
  private config: MppReceiverConfig

  constructor(config: Partial<MppReceiverConfig> = {}) {
    this.config = { ...DEFAULT_MPP_RECEIVER_CONFIG, ...config }
  }

  /**
   * Processes an incoming HTLC that may be part of an MPP
   */
  processIncomingHtlc(htlc: IncomingMppHtlc): MppReceiveResult {
    const paymentHashHex = uint8ArrayToHex(htlc.paymentHash)

    // Check if this is a known pending payment
    let pending = this.pendingPayments.get(paymentHashHex)

    if (!pending) {
      // New payment - validate and create pending record
      if (!htlc.paymentSecret || !htlc.totalMsat) {
        // Not an MPP payment or missing required fields
        return {
          action: 'reject',
          failureCode: FailureCode.INCORRECT_OR_UNKNOWN_PAYMENT_DETAILS,
        }
      }

      pending = {
        paymentHash: htlc.paymentHash,
        paymentSecret: htlc.paymentSecret,
        totalMsat: htlc.totalMsat,
        receivedMsat: 0n,
        parts: [],
        createdAt: Date.now(),
        timeoutAt: Date.now() + this.config.mppTimeoutSec * 1000,
      }
      this.pendingPayments.set(paymentHashHex, pending)
    }

    // Validate payment secret matches
    if (!constantTimeEqual(htlc.paymentSecret!, pending.paymentSecret)) {
      return {
        action: 'reject',
        failureCode: FailureCode.INCORRECT_OR_UNKNOWN_PAYMENT_DETAILS,
      }
    }

    // Validate total amount matches
    if (htlc.totalMsat !== pending.totalMsat) {
      return {
        action: 'reject',
        failureCode: FailureCode.FINAL_INCORRECT_HTLC_AMOUNT,
      }
    }

    // Check timeout
    if (Date.now() > pending.timeoutAt) {
      this.pendingPayments.delete(paymentHashHex)
      return {
        action: 'reject',
        failureCode: FailureCode.MPP_TIMEOUT,
      }
    }

    // Add this part
    pending.parts.push({
      htlcId: htlc.htlcId,
      amountMsat: htlc.amountMsat,
      cltvExpiry: htlc.cltvExpiry,
    })
    pending.receivedMsat += htlc.amountMsat

    // Check if payment is complete
    if (pending.receivedMsat >= pending.totalMsat) {
      // Payment complete - fulfill all parts
      this.pendingPayments.delete(paymentHashHex)

      return {
        action: 'fulfill',
        htlcIds: pending.parts.map(p => p.htlcId),
      }
    }

    // Payment not yet complete - hold HTLC
    return {
      action: 'hold',
      receivedMsat: pending.receivedMsat,
      remainingMsat: pending.totalMsat - pending.receivedMsat,
    }
  }

  /**
   * Checks for and cleans up timed-out payments
   */
  checkTimeouts(): TimedOutPayment[] {
    const timedOut: TimedOutPayment[] = []
    const now = Date.now()

    for (const [key, pending] of this.pendingPayments.entries()) {
      if (now > pending.timeoutAt) {
        timedOut.push({
          paymentHash: pending.paymentHash,
          htlcIds: pending.parts.map(p => p.htlcId),
          receivedMsat: pending.receivedMsat,
          expectedMsat: pending.totalMsat,
        })
        this.pendingPayments.delete(key)
      }
    }

    return timedOut
  }

  /**
   * Gets pending payment status
   */
  getPendingPayment(paymentHash: Sha256): PendingMppPayment | null {
    const key = uint8ArrayToHex(paymentHash)
    return this.pendingPayments.get(key) || null
  }
}

// ============================================
// Helper Types and Functions
// ============================================

interface MppReceiverConfig {
  mppTimeoutSec: number
}

const DEFAULT_MPP_RECEIVER_CONFIG: MppReceiverConfig = {
  mppTimeoutSec: 60,
}

interface IncomingMppHtlc {
  htlcId: bigint
  paymentHash: Sha256
  amountMsat: bigint
  cltvExpiry: number
  paymentSecret?: Sha256
  totalMsat?: bigint
}

interface PendingMppPayment {
  paymentHash: Sha256
  paymentSecret: Sha256
  totalMsat: bigint
  receivedMsat: bigint
  parts: PendingMppPart[]
  createdAt: number
  timeoutAt: number
}

interface PendingMppPart {
  htlcId: bigint
  amountMsat: bigint
  cltvExpiry: number
}

interface MppReceiveResult {
  action: 'fulfill' | 'hold' | 'reject'
  htlcIds?: bigint[]
  receivedMsat?: bigint
  remainingMsat?: bigint
  failureCode?: FailureCode
}

interface TimedOutPayment {
  paymentHash: Sha256
  htlcIds: bigint[]
  receivedMsat: bigint
  expectedMsat: bigint
}

// Utility functions
function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function generatePartId(): string {
  const bytes = randomBytes(16)
  return uint8ArrayToHex(bytes)
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}

/**
 * Encodes a value as truncated u64 (tu64)
 * Per BOLT #1: variable length encoding, big-endian, no leading zeros
 */
function encodeTu64(value: bigint): Uint8Array {
  if (value === 0n) {
    return new Uint8Array(0)
  }

  const bytes: number[] = []
  let remaining = value

  while (remaining > 0n) {
    bytes.unshift(Number(remaining & 0xffn))
    remaining >>= 8n
  }

  return new Uint8Array(bytes)
}

/**
 * Decodes a truncated u64 (tu64)
 */
function decodeTu64(data: Uint8Array): bigint {
  if (data.length === 0) {
    return 0n
  }

  let value = 0n
  for (let i = 0; i < data.length; i++) {
    value = (value << 8n) | BigInt(data[i])
  }

  return value
}

// Export for testing
export { encodeTu64, decodeTu64, generatePartId, uint8ArrayToHex }
export type { PendingMppPayment, IncomingMppHtlc, MppReceiveResult, TimedOutPayment }

// ==========================================
// DYNAMIC SPLITTER
// ==========================================

/**
 * Histórico de tentativa de pagamento para aprendizado
 */
export interface PaymentAttemptHistory {
  amountMsat: bigint
  channelId: Uint8Array
  success: boolean
  timestamp: number
  feePaid?: bigint
}

/**
 * Splitter dinâmico baseado em liquidez e histórico
 */
export class DynamicSplitter {
  private attemptHistory: PaymentAttemptHistory[] = []
  private channelSuccessRates: Map<string, { successes: number; failures: number }> = new Map()
  private maxHistorySize: number = 1000

  /**
   * Registra tentativa de pagamento
   */
  recordAttempt(attempt: PaymentAttemptHistory): void {
    this.attemptHistory.push(attempt)

    // Manter tamanho do histórico
    if (this.attemptHistory.length > this.maxHistorySize) {
      this.attemptHistory = this.attemptHistory.slice(-this.maxHistorySize)
    }

    // Atualizar taxa de sucesso do canal
    const channelHex = uint8ArrayToHex(attempt.channelId)
    const stats = this.channelSuccessRates.get(channelHex) || { successes: 0, failures: 0 }

    if (attempt.success) {
      stats.successes++
    } else {
      stats.failures++
    }

    this.channelSuccessRates.set(channelHex, stats)
  }

  /**
   * Calcula split dinâmico baseado em estratégia
   */
  calculateDynamicSplit(
    totalAmountMsat: bigint,
    availableChannels: ChannelLiquidity[],
    strategy: SplitStrategy,
    config: MppConfig,
  ): MppPartAllocation[] {
    switch (strategy) {
      case SplitStrategy.EQUAL:
        return this.splitEqual(totalAmountMsat, availableChannels.length, config)

      case SplitStrategy.LIQUIDITY_BASED:
        return this.splitByLiquidity(totalAmountMsat, availableChannels, config)

      case SplitStrategy.SUCCESS_RATE_BASED:
        return this.splitBySuccessRate(totalAmountMsat, availableChannels, config)

      case SplitStrategy.HYBRID:
        return this.splitHybrid(totalAmountMsat, availableChannels, config)

      case SplitStrategy.ADAPTIVE:
        return this.splitAdaptive(totalAmountMsat, availableChannels, config)

      default:
        return this.splitEqual(totalAmountMsat, availableChannels.length, config)
    }
  }

  /**
   * Split igual
   */
  private splitEqual(
    totalAmountMsat: bigint,
    numChannels: number,
    config: MppConfig,
  ): MppPartAllocation[] {
    const numParts = Math.min(numChannels, config.maxParts)
    const baseAmount = totalAmountMsat / BigInt(numParts)
    const remainder = totalAmountMsat % BigInt(numParts)

    const parts: MppPartAllocation[] = []

    for (let i = 0; i < numParts; i++) {
      parts.push({
        index: i,
        amountMsat: i === 0 ? baseAmount + remainder : baseAmount,
      })
    }

    return parts
  }

  /**
   * Split baseado em liquidez disponível
   */
  private splitByLiquidity(
    totalAmountMsat: bigint,
    channels: ChannelLiquidity[],
    config: MppConfig,
  ): MppPartAllocation[] {
    const parts: MppPartAllocation[] = []
    let remainingAmount = totalAmountMsat

    // Ordenar por liquidez disponível
    const sortedChannels = [...channels].sort((a, b) => Number(b.availableMsat - a.availableMsat))

    for (
      let i = 0;
      i < Math.min(sortedChannels.length, config.maxParts) && remainingAmount > 0n;
      i++
    ) {
      const channel = sortedChannels[i]

      // Usar no máximo 80% da liquidez disponível para margem de segurança
      const maxForChannel = (channel.availableMsat * 80n) / 100n
      const amountForPart = remainingAmount < maxForChannel ? remainingAmount : maxForChannel

      if (amountForPart >= config.minPartSizeMsat) {
        parts.push({
          index: i,
          amountMsat: amountForPart,
          preferredChannelId: channel.channelId,
        })
        remainingAmount -= amountForPart
      }
    }

    // Se sobrou, adicionar ao primeiro part
    if (remainingAmount > 0n && parts.length > 0) {
      parts[0].amountMsat += remainingAmount
    }

    return parts
  }

  /**
   * Split baseado em taxa de sucesso histórica
   */
  private splitBySuccessRate(
    totalAmountMsat: bigint,
    channels: ChannelLiquidity[],
    config: MppConfig,
  ): MppPartAllocation[] {
    // Calcular score baseado em sucesso
    const channelsWithScore = channels.map(ch => {
      const channelHex = uint8ArrayToHex(ch.channelId)
      const stats = this.channelSuccessRates.get(channelHex)

      let successRate = 0.5 // Default 50%
      if (stats && stats.successes + stats.failures > 0) {
        successRate = stats.successes / (stats.successes + stats.failures)
      }

      return {
        channel: ch,
        score: successRate * Number(ch.availableMsat),
      }
    })

    // Ordenar por score
    channelsWithScore.sort((a, b) => b.score - a.score)

    const parts: MppPartAllocation[] = []
    let remainingAmount = totalAmountMsat
    const totalScore = channelsWithScore.reduce((sum, c) => sum + c.score, 0)

    for (
      let i = 0;
      i < Math.min(channelsWithScore.length, config.maxParts) && remainingAmount > 0n;
      i++
    ) {
      const { channel, score } = channelsWithScore[i]

      // Proporção baseada no score
      const proportion = totalScore > 0 ? score / totalScore : 1 / channelsWithScore.length
      let amountForPart = BigInt(Math.floor(Number(totalAmountMsat) * proportion))

      // Limitar pelo restante e mínimo
      if (amountForPart > remainingAmount) amountForPart = remainingAmount
      if (amountForPart < config.minPartSizeMsat && remainingAmount >= config.minPartSizeMsat) {
        amountForPart = config.minPartSizeMsat
      }

      if (amountForPart >= config.minPartSizeMsat) {
        parts.push({
          index: i,
          amountMsat: amountForPart,
          preferredChannelId: channel.channelId,
        })
        remainingAmount -= amountForPart
      }
    }

    // Se sobrou, adicionar ao primeiro part
    if (remainingAmount > 0n && parts.length > 0) {
      parts[0].amountMsat += remainingAmount
    }

    return parts
  }

  /**
   * Split híbrido (liquidez + sucesso)
   */
  private splitHybrid(
    totalAmountMsat: bigint,
    channels: ChannelLiquidity[],
    config: MppConfig,
  ): MppPartAllocation[] {
    // Combinar liquidez com taxa de sucesso
    const channelsWithScore = channels.map(ch => {
      const channelHex = uint8ArrayToHex(ch.channelId)
      const stats = this.channelSuccessRates.get(channelHex)

      let successRate = ch.successRate
      if (stats && stats.successes + stats.failures >= 5) {
        // Usar histórico se tiver dados suficientes
        successRate = stats.successes / (stats.successes + stats.failures)
      }

      // Score = raiz(liquidez) * successRate^2 (favorece alta taxa de sucesso)
      const score = Math.sqrt(Number(ch.availableMsat)) * Math.pow(successRate, 2)

      return { channel: ch, score }
    })

    channelsWithScore.sort((a, b) => b.score - a.score)

    const parts: MppPartAllocation[] = []
    let remainingAmount = totalAmountMsat

    for (
      let i = 0;
      i < Math.min(channelsWithScore.length, config.maxParts) && remainingAmount > 0n;
      i++
    ) {
      const { channel } = channelsWithScore[i]

      // Usar liquidez disponível como limite
      const maxForChannel = (channel.availableMsat * 85n) / 100n
      const amountForPart = remainingAmount < maxForChannel ? remainingAmount : maxForChannel

      if (amountForPart >= config.minPartSizeMsat) {
        parts.push({
          index: i,
          amountMsat: amountForPart,
          preferredChannelId: channel.channelId,
        })
        remainingAmount -= amountForPart
      }
    }

    if (remainingAmount > 0n && parts.length > 0) {
      parts[0].amountMsat += remainingAmount
    }

    return parts
  }

  /**
   * Split adaptativo - muda estratégia baseado em falhas recentes
   */
  private splitAdaptive(
    totalAmountMsat: bigint,
    channels: ChannelLiquidity[],
    config: MppConfig,
  ): MppPartAllocation[] {
    // Analisar falhas recentes
    const recentFailures = this.attemptHistory.filter(
      a => !a.success && Date.now() - a.timestamp < 10 * 60 * 1000,
    ).length

    const recentTotal = this.attemptHistory.filter(
      a => Date.now() - a.timestamp < 10 * 60 * 1000,
    ).length

    const recentFailureRate = recentTotal > 0 ? recentFailures / recentTotal : 0

    // Se muitas falhas recentes, ser mais conservador
    if (recentFailureRate > 0.5) {
      // Usar mais partes menores
      const conservativeConfig = {
        ...config,
        maxParts: Math.min(config.maxParts * 2, 10),
        minPartSizeMsat: config.minPartSizeMsat / 2n,
      }
      return this.splitByLiquidity(totalAmountMsat, channels, conservativeConfig)
    }

    // Se taxa de sucesso alta, pode ser mais agressivo
    if (recentFailureRate < 0.1 && recentTotal > 5) {
      return this.splitBySuccessRate(totalAmountMsat, channels, config)
    }

    // Default: híbrido
    return this.splitHybrid(totalAmountMsat, channels, config)
  }

  /**
   * Resplit após falha - divide parte que falhou em partes menores
   */
  resplitFailedPart(
    failedAmount: bigint,
    failedChannelId: Uint8Array,
    availableChannels: ChannelLiquidity[],
    config: MppConfig,
  ): MppPartAllocation[] {
    // Filtrar canal que falhou
    const channelsWithoutFailed = availableChannels.filter(
      ch => uint8ArrayToHex(ch.channelId) !== uint8ArrayToHex(failedChannelId),
    )

    if (channelsWithoutFailed.length === 0) {
      // Tentar o mesmo canal com valor menor
      return [
        {
          index: 0,
          amountMsat: failedAmount / 2n,
          preferredChannelId: failedChannelId,
        },
        {
          index: 1,
          amountMsat: failedAmount - failedAmount / 2n,
        },
      ]
    }

    // Dividir em 2 partes usando canais alternativos
    const numNewParts = Math.min(2, channelsWithoutFailed.length)
    const amountPerPart = failedAmount / BigInt(numNewParts)
    const remainder = failedAmount % BigInt(numNewParts)

    const parts: MppPartAllocation[] = []

    for (let i = 0; i < numNewParts; i++) {
      parts.push({
        index: i,
        amountMsat: i === 0 ? amountPerPart + remainder : amountPerPart,
        preferredChannelId: channelsWithoutFailed[i].channelId,
      })
    }

    return parts
  }

  /**
   * Limpa histórico antigo
   */
  pruneHistory(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs
    this.attemptHistory = this.attemptHistory.filter(a => a.timestamp > cutoff)
  }

  /**
   * Retorna estatísticas de sucesso por canal
   */
  getChannelStats(): Map<string, { successRate: number; attempts: number }> {
    const result = new Map<string, { successRate: number; attempts: number }>()

    for (const [channelHex, stats] of this.channelSuccessRates) {
      const total = stats.successes + stats.failures
      result.set(channelHex, {
        successRate: total > 0 ? stats.successes / total : 0,
        attempts: total,
      })
    }

    return result
  }
}
