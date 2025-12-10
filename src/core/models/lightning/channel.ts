/**
 * BOLT #2: Channel Types and Interfaces
 *
 * Tipos e interfaces para gerenciamento de canais Lightning.
 */

import type { Point } from './base'

// ==========================================
// ESTADOS DE CANAL
// ==========================================

/**
 * Estados possíveis de um canal Lightning
 */
export enum ChannelState {
  // Estados de abertura
  PENDING_OPEN = 'pending_open',
  OPENING = 'opening',
  CHANNEL_READY = 'channel_ready',
  FUNDING_CONFIRMED = 'funding_confirmed',

  // Estados normais
  NORMAL = 'normal',

  // Estados de fechamento
  SHUTTING_DOWN = 'shutting_down',
  CLOSING = 'closing',
  CLOSED = 'closed',

  // Estados de erro
  ERROR = 'error',
}

// ==========================================
// INFORMAÇÕES DE CANAL
// ==========================================

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
  shortChannelId?: Uint8Array
  createdAt: number
  lastActivity: number
}

/**
 * Configuração de fee para abertura de canal
 */
export interface ChannelFeeConfig {
  baseFee: bigint
  feeRate: number
  minChannelSize: bigint
}

/**
 * Configuração local de um canal
 */
export interface LocalChannelConfig {
  perCommitmentSecretSeed: Uint8Array
  dustLimitSat: bigint
  maxAcceptedHtlcs: number
  htlcMinimumMsat: bigint
  maxHtlcValueInFlightMsat: bigint
  toSelfDelay: number
  channelReserveSat: bigint
  fundingPubkey: Point
  revocationBasepoint: Point
  paymentBasepoint: Point
  delayedPaymentBasepoint: Point
  htlcBasepoint: Point
  initialMsat: bigint
}

/**
 * Configuração remota de um canal
 */
export interface RemoteChannelConfig {
  dustLimitSatoshis: bigint
  maxHtlcValueInFlightMsat: bigint
  channelReserveSatoshis: bigint
  htlcMinimumMsat: bigint
  toSelfDelay: number
  maxAcceptedHtlcs: number
  fundingPubkey: Point
  revocationBasepoint: Point
  paymentBasepoint: Point
  delayedPaymentBasepoint: Point
  htlcBasepoint: Point
  firstPerCommitmentPoint: Point
}

// ==========================================
// PARÂMETROS DE ABERTURA/FECHAMENTO
// ==========================================

/**
 * Parâmetros para abertura de canal
 */
export interface OpenChannelParams {
  peerId: string
  amount: bigint // Capacidade do canal em satoshis
  pushMsat?: bigint // Amount inicial para o peer remoto
  feeratePerKw?: number // Taxa de fee por KW
  dustLimitSatoshis?: bigint
  maxHtlcValueInFlightMsat?: bigint
  channelReserveSatoshis?: bigint
  htlcMinimumMsat?: bigint
  toSelfDelay?: number
  maxAcceptedHtlcs?: number
  announceChannel?: boolean // Se o canal deve ser anunciado na rede
  upfrontShutdownScript?: Uint8Array // Script de shutdown personalizado
}

/**
 * Resultado da abertura de canal
 */
export interface OpenChannelResult {
  success: boolean
  channelId?: string
  error?: string
}

/**
 * Parâmetros para fechamento de canal
 */
export interface CloseChannelParams {
  channelId: string
  scriptpubkey?: Uint8Array // Script de destino para fechamento cooperativo
  force?: boolean // Forçar fechamento unilateral
}

/**
 * Resultado do fechamento de canal
 */
export interface CloseChannelResult {
  success: boolean
  closingTxid?: string
  error?: string
}

// ==========================================
// HTLC
// ==========================================

/**
 * Informações de HTLC (Hash Time Locked Contract)
 */
export interface HtlcInfo {
  id: bigint
  amountMsat: bigint
  paymentHash: Uint8Array
  cltvExpiry: number
  direction: 'incoming' | 'outgoing'
  state: 'pending' | 'fulfilled' | 'failed'
}

// ==========================================
// ROTEAMENTO
// ==========================================

/**
 * Canal no grafo de roteamento
 */
export interface RoutingChannel {
  shortChannelId: Uint8Array
  nodeId1: Uint8Array
  nodeId2: Uint8Array
  capacity: bigint
  features: Uint8Array
  lastUpdate: number
  feeBaseMsat: number
  feeProportionalMillionths: number
  cltvExpiryDelta: number
  htlcMinimumMsat: bigint
  htlcMaximumMsat: bigint
  disabled?: boolean
}

/**
 * Nó no grafo de roteamento
 */
export interface RoutingNode {
  nodeId: Uint8Array
  features: Uint8Array
  lastUpdate: number
  addresses: NodeAddress[]
  alias: string
}

/**
 * Endereço de nó
 */
export interface NodeAddress {
  type: 'ipv4' | 'ipv6' | 'torv2' | 'torv3' | 'dns'
  address: string
  port: number
}

/**
 * Rota de pagamento
 */
export interface PaymentRoute {
  hops: RouteHop[]
  totalAmountMsat: bigint
  totalFeeMsat: bigint
  totalCltvExpiry: number
}

/**
 * Hop em uma rota de pagamento
 */
export interface RouteHop {
  nodePubkey: Uint8Array
  shortChannelId: Uint8Array
  amountMsat: bigint
  cltvExpiry: number
  feeMsat: bigint
}

// ==========================================
// COMMIT E REVOGAÇÃO
// ==========================================

/**
 * Estado de commitment de um canal
 */
export interface CommitmentState {
  commitmentNumber: bigint
  localCommitmentTx?: Uint8Array
  remoteCommitmentTx?: Uint8Array
  perCommitmentPoint: Point
  perCommitmentSecret?: Uint8Array
}

/**
 * TLVs para channel_reestablish
 */
export interface ChannelReestablishTlvs {
  nextFundingTxId?: Uint8Array
  nextLocalNonce?: Uint8Array
  nextRemoteNonce?: Uint8Array
}

// ==========================================
// CONSTANTES PADRÃO
// ==========================================

/**
 * Configuração padrão de fees para abertura de canal
 */
export const DEFAULT_CHANNEL_FEE_CONFIG: ChannelFeeConfig = {
  baseFee: 2000n, // 2000 sats
  feeRate: 0.004, // 0.4%
  minChannelSize: 20000n, // 20k sats
}

/**
 * Valores padrão para configuração de canal
 */
export const DEFAULT_CHANNEL_CONFIG = {
  dustLimitSat: 546n,
  maxAcceptedHtlcs: 30,
  htlcMinimumMsat: 1000n,
  toSelfDelay: 144, // ~1 dia
  channelReservePercent: 0.01, // 1%
}

/**
 * Timeouts padrão
 */
export const CHANNEL_TIMEOUTS = {
  fundingConfirmation: 2016, // ~2 semanas em blocos
  htlcTimeout: 144, // ~1 dia em blocos
  cltvExpiryDelta: 40, // Padrão BOLT
}
