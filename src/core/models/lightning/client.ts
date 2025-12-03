// BOLT #1 & #8: Lightning Network Client
// Interfaces and types for Lightning Network client connections

import { TransportKeys } from './transport'
import { Socket, TLSSocket, Peer } from '@/core/models/network'

// Derivation paths para Lightning (LNPBP-46)
// m'/purpose'/chain'/account'/change/addressIndex
export const LIGHTNING_PURPOSE = 9735 // LNPBP-46 purpose for Lightning
export const LIGHTNING_COIN_TYPE = 0 // Bitcoin mainnet

// Channel opening fee configuration
export interface ChannelOpeningFeeConfig {
  baseFee: bigint // Base fee em sats
  feeRate: number // Taxa percentual (0.01 = 1%)
  minChannelSize: bigint // Tamanho mínimo do canal em sats
}

export const DEFAULT_CHANNEL_FEE_CONFIG: ChannelOpeningFeeConfig = {
  baseFee: 2000n, // 2000 sats base fee
  feeRate: 0.004, // 0.4% fee
  minChannelSize: 20000n, // Mínimo de 20k sats
}

// Lightning payment request
export interface LightningPaymentRequest {
  invoice: string // BOLT11 invoice string
  amount?: bigint // Amount override (se invoice não especificar)
}

// Payment result
export interface PaymentResult {
  success: boolean
  preimage?: Uint8Array // Payment preimage (prova de pagamento)
  paymentHash: Uint8Array
  error?: string
}

// Invoice generation parameters
export interface GenerateInvoiceParams {
  amount?: bigint // Amount em millisatoshis (undefined = donation invoice)
  description: string
  expiry?: number // Em segundos
  metadata?: Uint8Array
}

// Invoice with channel opening info
export interface InvoiceWithChannelInfo {
  invoice: string // BOLT11 encoded invoice
  qrCode: string // Same as invoice (for QR display)
  amount?: bigint // Amount em millisatoshis
  channelOpeningFee?: bigint // Fee para abertura de canal (se necessário)
  requiresChannel: boolean // Se precisa abrir canal
  paymentHash: string // Hex do payment hash
}

// Lightning Socket Type - TCP padrão, TLS para Tor/.onion
export type LightningSocket = Socket | TLSSocket

// Lightning Connection Interface
// BOLT #8: Conexão após handshake Noise_XK completo
export interface LightningConnection extends Socket {
  transportKeys: TransportKeys
  peerPubKey: Uint8Array
}

// Client Configuration
export interface LightningClientConfig {
  peer: Peer
  peerPubKey?: Uint8Array
  timeout?: number
  pingInterval?: number
}

// Connection States
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  HANDSHAKING = 'handshaking',
  CONNECTED = 'connected',
  ERROR = 'error',
}

// Client Events
export interface LightningClientEvents {
  connected: (connection: LightningConnection) => void
  disconnected: (reason?: string) => void
  error: (error: Error) => void
  message: (message: Uint8Array) => void
}

// Handshake Result
export interface HandshakeResult {
  transportKeys: TransportKeys
  peerPubKey: Uint8Array
}

// Message Handler
export type MessageHandler = (message: Uint8Array) => void | Promise<void>

// Ping/Pong Configuration
export interface PingPongConfig {
  interval: number // milliseconds
  timeout: number // milliseconds
  maxMissedPings: number
}

// Default Configurations
export const DEFAULT_CLIENT_CONFIG: Partial<LightningClientConfig> = {
  timeout: 10000, // 10 seconds
  pingInterval: 30000, // 30 seconds
}

export const DEFAULT_PING_PONG_CONFIG: PingPongConfig = {
  interval: 30000, // 30 seconds
  timeout: 5000, // 5 seconds
  maxMissedPings: 3,
}
