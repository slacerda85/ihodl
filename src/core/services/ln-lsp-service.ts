/**
 * Lightning Service Provider (LSP) Service
 *
 * Serviço para interagir com LSPs para abertura automática de canais,
 * estimativa de taxas e anúncios de liquidez.
 */

import LightningService from './ln-service'
import type { Satoshis } from '@/ui/features/lightning/types'

// ==========================================
// TIPOS
// ==========================================

/**
 * Estimativa de taxa para abertura de canal
 */
export interface FeeEstimate {
  /** Taxa base em satoshis */
  baseFee: Satoshis
  /** Taxa proporcional (ppm) */
  proportionalFeePpm: number
  /** Taxa total estimada para o valor especificado */
  totalFee: Satoshis
  /** Taxa mínima aceita */
  minFee: Satoshis
  /** Taxa máxima aceita */
  maxFee: Satoshis
}

/**
 * Anúncio de liquidez de um LSP
 */
export interface LiquidityAd {
  /** ID do LSP */
  lspId: string
  /** Nome do LSP */
  name: string
  /** Descrição do serviço */
  description: string
  /** URI do LSP */
  uri: string
  /** Capacidade mínima do canal */
  minChannelSize: Satoshis
  /** Capacidade máxima do canal */
  maxChannelSize: Satoshis
  /** Taxa base */
  baseFee: Satoshis
  /** Taxa proporcional (ppm) */
  proportionalFeePpm: number
  /** Features suportadas */
  features: string[]
}

/**
 * Resultado da abertura de canal via LSP
 */
export interface LSPChannelOpeningResult {
  /** ID do canal criado */
  channelId: string
  /** Capacidade do canal */
  capacity: Satoshis
  /** Taxa paga */
  feePaid: Satoshis
  /** Status da operação */
  success: boolean
  /** Mensagem de erro, se aplicável */
  error?: string
}

// ==========================================
// LSP SERVICE
// ==========================================

export default class LSPService {
  private lightningService: LightningService
  private availableLSPs: LiquidityAd[] = []

  constructor(lightningService: LightningService) {
    this.lightningService = lightningService
    this.initializeDefaultLSPs()
  }

  /**
   * Inicializa LSPs padrão conhecidos
   */
  private initializeDefaultLSPs(): void {
    // LSPs conhecidos - em produção, isso seria carregado dinamicamente
    this.availableLSPs = [
      {
        lspId: 'phoenix-lsp',
        name: 'Phoenix LSP',
        description: 'LSP oficial do Phoenix Wallet',
        uri: 'https://lsp.phoenix.acinq.co',
        minChannelSize: 100000n, // 100k sats
        maxChannelSize: 10000000n, // 10M sats
        baseFee: 2000n, // 2000 sats
        proportionalFeePpm: 1000, // 0.1%
        features: ['auto-channel', 'zero-conf', 'jit-routing'],
      },
      {
        lspId: 'lnd-lsp',
        name: 'LND LSP',
        description: 'LSP baseado em LND',
        uri: 'https://lsp.lnd.co',
        minChannelSize: 200000n, // 200k sats
        maxChannelSize: 16777215n, // ~16.7M sats
        baseFee: 3000n, // 3000 sats
        proportionalFeePpm: 2000, // 0.2%
        features: ['auto-channel', 'jit-routing'],
      },
    ]
  }

  /**
   * Obtém lista de LSPs disponíveis
   */
  getAvailableLSPs(): LiquidityAd[] {
    return [...this.availableLSPs]
  }

  /**
   * Estima taxa para abertura de canal com um LSP específico
   */
  estimateFee(lspId: string, channelCapacity: Satoshis): FeeEstimate | null {
    const lsp = this.availableLSPs.find(l => l.lspId === lspId)
    if (!lsp) return null

    // Verifica se a capacidade está dentro dos limites
    if (channelCapacity < lsp.minChannelSize || channelCapacity > lsp.maxChannelSize) {
      return null
    }

    const baseFee = lsp.baseFee
    const proportionalFee = (channelCapacity * BigInt(lsp.proportionalFeePpm)) / 1000000n
    const totalFee = baseFee + proportionalFee

    return {
      baseFee,
      proportionalFeePpm: lsp.proportionalFeePpm,
      totalFee,
      minFee: baseFee, // mínimo é a taxa base
      maxFee: baseFee + (channelCapacity * BigInt(5000)) / 1000000n, // máximo 0.5%
    }
  }

  /**
   * Abre um canal automaticamente usando um LSP
   */
  async openChannelViaLSP(
    lspId: string,
    channelCapacity: Satoshis,
    maxFee?: Satoshis,
  ): Promise<LSPChannelOpeningResult> {
    try {
      const lsp = this.availableLSPs.find(l => l.lspId === lspId)
      if (!lsp) {
        return {
          channelId: '',
          capacity: 0n,
          feePaid: 0n,
          success: false,
          error: 'LSP not found',
        }
      }

      // Verifica capacidade
      if (channelCapacity < lsp.minChannelSize || channelCapacity > lsp.maxChannelSize) {
        return {
          channelId: '',
          capacity: 0n,
          feePaid: 0n,
          success: false,
          error: `Channel capacity ${channelCapacity} outside LSP limits`,
        }
      }

      // Estima taxa
      const feeEstimate = this.estimateFee(lspId, channelCapacity)
      if (!feeEstimate) {
        return {
          channelId: '',
          capacity: 0n,
          feePaid: 0n,
          success: false,
          error: 'Failed to estimate fee',
        }
      }

      // Verifica limite de taxa se especificado
      if (maxFee && feeEstimate.totalFee > maxFee) {
        return {
          channelId: '',
          capacity: 0n,
          feePaid: 0n,
          success: false,
          error: `Fee ${feeEstimate.totalFee} exceeds maximum ${maxFee}`,
        }
      }

      // TODO: Implementar integração real com LSP
      // Por enquanto, simula abertura de canal
      console.log(
        `[LSP] Opening channel via ${lsp.name}: capacity=${channelCapacity}, fee=${feeEstimate.totalFee}`,
      )

      // Simulação - em produção, faria chamada real para o LSP
      const channelId = `lsp-${lspId}-${Date.now()}`
      const feePaid = feeEstimate.totalFee

      // Simula delay de rede
      await new Promise(resolve => setTimeout(resolve, 2000))

      return {
        channelId,
        capacity: channelCapacity,
        feePaid,
        success: true,
      }
    } catch (error) {
      console.error('[LSP] Failed to open channel:', error)
      return {
        channelId: '',
        capacity: 0n,
        feePaid: 0n,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Seleciona o melhor LSP baseado na capacidade e taxa
   */
  selectBestLSP(channelCapacity: Satoshis, maxFee?: Satoshis): LiquidityAd | null {
    let bestLSP: LiquidityAd | null = null
    let bestFee: Satoshis = maxFee || 100000000n // 100M sats como limite padrão

    for (const lsp of this.availableLSPs) {
      if (channelCapacity < lsp.minChannelSize || channelCapacity > lsp.maxChannelSize) {
        continue
      }

      const feeEstimate = this.estimateFee(lsp.lspId, channelCapacity)
      if (!feeEstimate) continue

      if (feeEstimate.totalFee < bestFee) {
        bestFee = feeEstimate.totalFee
        bestLSP = lsp
      }
    }

    return bestLSP
  }
}
