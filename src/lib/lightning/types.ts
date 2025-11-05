// Lightning Network types and interfaces

export interface LightningInvoice {
  paymentHash: string
  paymentRequest: string
  amount: number // in satoshis
  description?: string
  descriptionHash?: string // BOLT 11 h field
  expiry: number // timestamp
  timestamp: number
  cltvExpiry?: number // BOLT 11 c field
  features?: Uint8Array // BOLT 11 9 field
  signature?: Uint8Array // BOLT 11 signature
  status: 'pending' | 'paid' | 'expired' | 'cancelled'
  fallbackAddress?: string
  routingHints?: RoutingHint[]
  payeePubKey?: string // BOLT 11 n field
  minFinalCltvExpiry?: number // BOLT 11 c field
  channelOpeningFee?: number // Fee for channel opening when no channels exist
}

export interface RoutingHint {
  nodeId: string
  channelId: string
  feeBaseMsat: number
  feeProportionalMillionths: number
  cltvExpiryDelta: number
}

export interface Channel {
  channelId: string
  fundingTxId: string
  fundingOutputIndex: number
  capacity: number // in satoshis
  localBalance: number
  remoteBalance: number
  status: 'pending' | 'open' | 'closing' | 'closed'
  peerId: string
  channelPoint: string // funding_txid:funding_output_index
  localChannelReserve: number
  remoteChannelReserve: number
  channelFlags?: number
  csvDelay?: number
  pushAmount?: number
}

export interface LightningNode {
  nodeId: string
  alias?: string
  color?: string
  addresses: NodeAddress[]
  features?: Uint8Array
}

export interface LightningNodeState {
  nodeId: string
  alias?: string
  color?: string
  features: string[]
  network: string
  version: string
  lastSyncHeight: number
  lastActive: number
}

export interface NodeAddress {
  network: string
  addr: string
}

export interface Payment {
  paymentHash: string
  amount: number
  fee: number
  status: 'pending' | 'succeeded' | 'failed'
  timestamp: number
  description?: string
  htlcs?: HTLC[]
}

export interface HTLC {
  incomingAmount: number
  outgoingAmount: number
  incomingTimelock: number
  outgoingTimelock: number
  paymentHash: string
  incomingIndex: number
  outgoingIndex: number
}

export interface LightningWallet {
  nodeId: string
  channels: Channel[]
  balance: number // total channel balance in satoshis
  pendingBalance: number
  pubKey: string
  alias?: string
}

// BOLT 2 Channel Establishment
export interface OpenChannelRequest {
  chainHash: string
  temporaryChannelId: string
  fundingSatoshis: number
  pushMsat: number
  dustLimitSatoshis: number
  maxHtlcValueInFlightMsat: number
  channelReserveSatoshis: number
  htlcMinimumMsat: number
  feeratePerKw: number
  toSelfDelay: number
  maxAcceptedHtlcs: number
  fundingPubkey: string
  revocationBasepoint: string
  paymentBasepoint: string
  delayedPaymentBasepoint: string
  htlcBasepoint: string
  firstCommitmentPoint: string
  channelFlags: number
  shutdownScriptpubkey?: Uint8Array
}

export interface AcceptChannelResponse {
  temporaryChannelId: string
  dustLimitSatoshis: number
  maxHtlcValueInFlightMsat: number
  channelReserveSatoshis: number
  htlcMinimumMsat: number
  minimumDepth: number
  toSelfDelay: number
  maxAcceptedHtlcs: number
  fundingPubkey: string
  revocationBasepoint: string
  paymentBasepoint: string
  delayedPaymentBasepoint: string
  htlcBasepoint: string
  firstCommitmentPoint: string
  shutdownScriptpubkey?: Uint8Array
}

// BOLT 2 Channel Updates
export interface UpdateAddHTLC {
  channelId: string
  id: number
  amountMsat: number
  paymentHash: string
  cltvExpiry: number
  onionRoutingPacket: Uint8Array
}

export interface CommitmentSigned {
  channelId: string
  signature: string
  htlcSignatures: string[]
}

export interface RevokeAndAck {
  channelId: string
  perCommitmentSecret: Uint8Array
  nextPerCommitmentPoint: string
}
