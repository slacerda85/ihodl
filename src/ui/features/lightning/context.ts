/**
 * Context Lightning
 *
 * Define o contexto React para estado Lightning Network
 */

import { createContext } from 'react'
import type {
  LightningState,
  Invoice,
  Payment,
  Channel,
  DecodedInvoice,
  Millisatoshis,
} from './types'
import type { InitStatus } from '@/core/services/ln-initializer-service'
import type { ReadinessState, ReadinessLevel } from '@/core/models/lightning/readiness'

// ==========================================
// TIPOS DO CONTEXTO
// ==========================================

/** Parâmetros para abertura de canal */
export interface CreateChannelParams {
  peerId: string
  capacitySat: bigint
  pushMsat?: bigint
  feeRatePerKw?: number
}

/** Ações disponíveis no contexto Lightning */
export interface LightningActions {
  // Inicialização
  initialize: () => Promise<void>

  // Invoices
  generateInvoice: (amount: Millisatoshis, description?: string) => Promise<Invoice>
  decodeInvoice: (invoice: string) => Promise<DecodedInvoice>

  // Pagamentos
  sendPayment: (invoice: string, maxFee?: bigint) => Promise<Payment>

  // Saldo
  getBalance: () => Promise<Millisatoshis>
  refreshBalance: () => Promise<void>

  // Canais
  getChannels: () => Promise<Channel[]>
  hasChannels: () => Promise<boolean>
  createChannel: (params: CreateChannelParams) => Promise<Channel>
  closeChannel: (channelId: string) => Promise<void>
  forceCloseChannel: (channelId: string) => Promise<void>

  // Histórico
  refreshInvoices: () => Promise<void>
  refreshPayments: () => Promise<void>

  // Conexão (BOLT1)
  connectToPeer: (peerId: string) => Promise<void>
  disconnect: () => Promise<void>
  sendPing: () => Promise<void>
}

/** Tipo completo do contexto */
export interface LightningContextType extends LightningActions {
  state: LightningState
  initStatus: InitStatus
  readinessState: ReadinessState
  readinessLevel: ReadinessLevel
}

// ==========================================
// CONTEXTO
// ==========================================

/**
 * Contexto Lightning
 *
 * Usado para compartilhar estado e ações Lightning entre componentes
 */
export const LightningContext = createContext<LightningContextType | null>(null)
