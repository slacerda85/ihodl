// Shared Lightning Network service types used across services and UI mapping
// Moved from legacy ln-service to decouple callers from ln-service implementation

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

export interface SendPaymentResult {
  success: boolean
  paymentHash: string
  preimage?: string
  error?: string
  feePaid?: bigint
}

export interface ChannelState {
  channelId: string
  peerId: string
  state: 'opening' | 'open' | 'closing' | 'closed'
  localBalanceSat: bigint
  remoteBalanceSat: bigint
  capacitySat: bigint
  isActive: boolean
}

export interface InvoiceState {
  paymentHash: string
  invoice: string
  amount: bigint
  description: string
  status: 'pending' | 'paid' | 'expired'
  createdAt: number
  expiresAt: number
}

export interface PaymentState {
  paymentHash: string
  amount: bigint
  status: 'pending' | 'succeeded' | 'failed'
  direction: 'sent' | 'received'
  createdAt: number
  resolvedAt?: number
  error?: string
}

export interface GenerateInvoiceParams {
  amount: bigint
  description?: string
  expiry?: number
}

export interface SendPaymentParams {
  invoice: string
  maxFee?: bigint
}
