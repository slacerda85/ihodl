// Lightning Network types and interfaces for iHodl wallet

/**
 * Lightning Network client configuration
 */
export interface LightningClientConfig {
  /** Node URL (host:port) */
  url: string
  /** Authentication method */
  auth: {
    /** TLS certificate (base64) */
    cert?: string
    /** Macaroon for authentication (base64) */
    macaroon?: string
    /** API key for REST authentication */
    apiKey?: string
  }
  /** Node type */
  type: 'lnd' | 'cln' | 'eclair'
  /** Connection timeout in milliseconds */
  timeout?: number
}

/**
 * Lightning Network client interface
 */
export interface LightningClient {
  /** Get node information */
  getInfo(): Promise<LightningNode>
  /** List channels */
  listChannels(): Promise<LightningChannel[]>
  /** Get channel information */
  getChannel(channelId: string): Promise<LightningChannel | null>
  /** Open channel */
  openChannel(params: OpenChannelParams): Promise<{ channelId: string }>
  /** Close channel */
  closeChannel(channelId: string, force?: boolean): Promise<void>
  /** Create invoice */
  createInvoice(params: CreateInvoiceParams): Promise<LightningInvoice>
  /** Pay invoice */
  payInvoice(paymentRequest: string): Promise<PaymentResult>
  /** List payments */
  listPayments(): Promise<LightningPayment[]>
  /** List invoices */
  listInvoices(): Promise<LightningInvoice[]>
  /** Get network graph */
  describeGraph(): Promise<{ nodes: LightningNode[]; channels: LightningChannel[] }>
  /** Estimate routing fee */
  estimateFee(destination: string, amount: number): Promise<{ fee: number; probability: number }>
  /** Connect to peer */
  connectPeer(pubkey: string, host: string): Promise<void>
  /** Disconnect from peer */
  disconnectPeer(pubkey: string): Promise<void>
  /** List peers */
  listPeers(): Promise<Peer[]>
}

/**
 * Peer information
 */
export interface Peer {
  /** Public key */
  pubKey: string
  /** Address */
  address: string
  /** Inbound connection */
  inbound: boolean
  /** Ping time */
  pingTime: number
}

/**
 * Represents a Lightning Network node
 */
export interface LightningNode {
  /** Node public key */
  pubKey: string
  /** Node alias */
  alias: string
  /** Color for node identification */
  color: string
  /** Number of channels */
  numChannels: number
  /** Total capacity in satoshis */
  totalCapacity: number
  /** Last update timestamp */
  lastUpdate: number
  /** Addresses */
  addresses: NodeAddress[]
  /** Features */
  features: { [key: number]: Feature }
}

/**
 * Node address
 */
export interface NodeAddress {
  /** Network type */
  network: string
  /** Address */
  addr: string
}

/**
 * Feature information
 */
export interface Feature {
  /** Feature name */
  name: string
  /** Whether feature is known */
  isKnown: boolean
  /** Whether feature is required */
  isRequired: boolean
}

/**
 * Lightning Network configuration
 */
export interface LightningConfig {
  /** Node URL (host:port) */
  nodeUrl: string
  /** Node type */
  type: 'lnd' | 'cln' | 'eclair'
  /** Authentication method */
  authMethod: 'macaroon' | 'tls' | 'api'
  /** TLS certificate (base64) */
  tlsCert?: string
  /** Macaroon for authentication (base64) */
  macaroon?: string
  /** API key for REST authentication */
  apiKey?: string
  /** Connection timeout in milliseconds */
  timeout?: number
  /** Maximum fee limit for payments in satoshis */
  maxFeeLimit?: number
  /** Default CLTV expiry delta for invoices */
  defaultCltvExpiry?: number
  /** Payment timeout in seconds */
  timeoutSeconds?: number
}

/**
 * Parameters for creating a Lightning invoice
 */
export interface CreateInvoiceParams {
  /** Amount in satoshis (0 for amountless) */
  amount: number
  /** Invoice description */
  description?: string
  /** Expiry time in seconds */
  expiry?: number
  /** Fallback on-chain address */
  fallbackAddr?: string
  /** Private channels only */
  private?: boolean
}

/**
 * Parameters for opening a Lightning channel
 */
export interface OpenChannelParams {
  /** Node public key to connect to */
  nodePubkey: string
  /** Local funding amount in satoshis */
  localFundingAmount: number
  /** Push amount to remote in satoshis */
  pushSat?: number
  /** Target confirmations */
  targetConf?: number
  /** Minimum HTLC size in satoshis */
  minHtlcMsat?: number
  /** Remote CSV delay */
  remoteCsvDelay?: number
  /** Minimum depth */
  minConfs?: number
  /** Whether channel is private */
  private?: boolean
  /** Commitment type */
  commitmentType?: CommitmentType
}

/**
 * Parameters for sending a Lightning payment
 */
export interface SendPaymentParams {
  /** Payment request (BOLT11 invoice) */
  paymentRequest: string
  /** Amount in satoshis (for amountless invoices) */
  amount?: number
  /** Maximum fee limit in satoshis */
  feeLimit?: number
  /** CLTV expiry delta */
  cltvLimit?: number
  /** Timeout in seconds */
  timeoutSeconds?: number
  /** Allow self payment */
  allowSelfPayment?: boolean
}

/**
 * Result of a payment attempt
 */
export interface PaymentResult {
  /** Payment hash */
  paymentHash: string
  /** Payment preimage */
  paymentPreimage?: string
  /** Amount paid in satoshis */
  amount: number
  /** Fee paid in satoshis */
  fee: number
  /** Whether payment succeeded */
  success: boolean
  /** Failure reason if failed */
  failureReason?: string
}

/**
 * Lightning Network wallet data
 */
export interface LightningWalletData {
  /** Node public key */
  nodePubkey: string
  /** Channels */
  channels: LightningChannel[]
  /** Payments history */
  payments: LightningPayment[]
  /** Invoices */
  invoices: LightningInvoice[]
  /** Configuration */
  config: LightningConfig
}

/**
 * Represents a Lightning Network invoice (payment request)
 */
export interface LightningInvoice {
  /** The invoice string in BOLT11 format */
  paymentRequest: string
  /** The payment hash (32 bytes, hex encoded) */
  paymentHash: string
  /** Amount in satoshis (0 for amountless invoices) */
  amount: number
  /** Invoice description */
  description?: string
  /** Invoice description hash */
  descriptionHash?: string
  /** Payment secret for AMP payments */
  paymentSecret?: string
  /** Expiry time in seconds from creation */
  expiry: number
  /** Timestamp when invoice was created */
  timestamp: number
  /** Public key of the payee node */
  payeePubKey: string
  /** Minimum final CLTV expiry */
  minFinalCltvExpiry: number
  /** Fallback on-chain address */
  fallbackAddr?: string
  /** Routing hints for private channels */
  routingHints: RoutingHint[]
  /** Features supported by the invoice */
  features: InvoiceFeature[]
  /** Signature of the invoice */
  signature: string
}

/**
 * Routing hint for private channel payment
 */
export interface RoutingHint {
  /** Public key of the hop node */
  nodeId: string
  /** Channel ID */
  chanId: string
  /** Fee base in msat */
  feeBaseMsat: number
  /** Fee proportional millionths */
  feeProportionalMillionths: number
  /** CLTV expiry delta */
  cltvExpiryDelta: number
}

/**
 * Invoice feature flags
 */
export interface InvoiceFeature {
  /** Feature name */
  name: string
  /** Whether feature is required */
  required: boolean
  /** Feature bit */
  bit: number
}

/**
 * Represents a Lightning Network channel
 */
export interface LightningChannel {
  /** Channel ID (funding txid + output index) */
  channelId: string
  /** Channel point (funding txid:vout) */
  channelPoint: string
  /** Local balance in satoshis */
  localBalance: number
  /** Remote balance in satoshis */
  remoteBalance: number
  /** Capacity in satoshis */
  capacity: number
  /** Remote node public key */
  remotePubkey: string
  /** Channel status */
  status: ChannelStatus
  /** Channel type */
  channelType: ChannelType
  /** Number of confirmations */
  numConfirmations: number
  /** Commitment type */
  commitmentType: CommitmentType
  /** Private channel flag */
  private: boolean
  /** Initiator flag */
  initiator: boolean
  /** Fee per kilo-weight */
  feePerKw: number
  /** Unsettled balance */
  unsettledBalance: number
  /** Total amount sent */
  totalSatoshisSent: number
  /** Total amount received */
  totalSatoshisReceived: number
  /** Number of updates */
  numUpdates: number
  /** Pending HTLCs */
  pendingHtlcs: Htlc[]
  /** CSV delay */
  csvDelay: number
  /** Active flag */
  active: boolean
  /** Lifecycle state */
  lifecycleState: ChannelLifecycleState
}

/**
 * HTLC (Hash Time Lock Contract) in a channel
 */
export interface Htlc {
  /** Incoming amount */
  incomingAmount: number
  /** Outgoing amount */
  outgoingAmount: number
  /** Incoming HTLC ID */
  incomingHtlcId: number
  /** Outgoing HTLC ID */
  outgoingHtlcId: number
  /** Expiry height */
  expiryHeight: number
  /** Hash lock */
  hashLock: string
  /** Status */
  status: HtlcStatus
}

/**
 * Represents a Lightning channel keyset with all basepoints
 */
export interface LightningChannelKeyset {
  /** Channel ID */
  channelId: string
  /** Funding basepoint private key */
  fundingPrivateKey: Uint8Array
  /** Payment basepoint private key */
  paymentPrivateKey: Uint8Array
  /** Delayed basepoint private key */
  delayedPrivateKey: Uint8Array
  /** Revocation basepoint private key */
  revocationPrivateKey: Uint8Array
  /** HTLC basepoint private key */
  htlcPrivateKey: Uint8Array
  /** PTLC basepoint private key */
  ptlcPrivateKey: Uint8Array
  /** Per-commitment basepoint private key (for commitment #0) */
  perCommitmentPrivateKey: Uint8Array
}

/**
 * Represents a Lightning node key
 */
export interface LightningNodeKey {
  /** Node index */
  nodeIndex: number
  /** Node private key */
  privateKey: Uint8Array
  /** Node public key */
  publicKey: Uint8Array
}

/**
 * Channel status enumeration
 */
export type ChannelStatus =
  | 'pending_open'
  | 'opened'
  | 'active'
  | 'inactive'
  | 'closing'
  | 'closed'
  | 'unknown'

/**
 * Channel type enumeration
 */
export type ChannelType = 'legacy' | 'static_remote_key' | 'anchors' | 'unknown'

/**
 * Commitment type enumeration
 */
export type CommitmentType = 'legacy' | 'static_remote_key' | 'anchors' | 'unknown'

/**
 * Channel lifecycle state
 */
export type ChannelLifecycleState = 'opening' | 'active' | 'closing' | 'closed' | 'unknown'

/**
 * HTLC status
 */
export type HtlcStatus = 'in_flight' | 'succeeded' | 'failed' | 'unknown'

/**
 * Represents a Lightning Network payment
 */
export interface LightningPayment {
  /** Payment hash */
  paymentHash: string
  /** Payment preimage */
  paymentPreimage?: string
  /** Amount in satoshis */
  amount: number
  /** Fee paid in satoshis */
  fee: number
  /** Payment status */
  status: PaymentStatus
  /** Timestamp */
  timestamp: number
  /** Description */
  description?: string
  /** Invoice string */
  invoice?: string
  /** Destination public key */
  destination?: string
  /** Payment request */
  paymentRequest?: string
  /** Failure reason */
  failureReason?: string
  /** HTLC attempts */
  htlcs: HtlcAttempt[]
  /** Payment index */
  paymentIndex: number
  /** Failure reason code */
  failureCode?: number
}

/**
 * HTLC attempt for a payment
 */
export interface HtlcAttempt {
  /** Attempt ID */
  attemptId: number
  /** Status */
  status: HtlcAttemptStatus
  /** Route taken */
  route: Route
  /** Attempt time */
  attemptTime: number
  /** Resolve time */
  resolveTime?: number
  /** Failure details */
  failure?: HtlcFailure
  /** Preimage */
  preimage?: string
}

/**
 * Route information for payment
 */
export interface Route {
  /** Total amount */
  totalAmt: number
  /** Total fees */
  totalFees: number
  /** Total time lock */
  totalTimeLock: number
  /** Hops in the route */
  hops: Hop[]
}

/**
 * Hop in a payment route
 */
export interface Hop {
  /** Channel ID */
  chanId: string
  /** Channel capacity */
  chanCapacity: number
  /** Amount to forward */
  amtToForward: number
  /** Fee */
  fee: number
  /** Expiry */
  expiry: number
  /** Amount to forward in msat */
  amtToForwardMsat: number
  /** Fee in msat */
  feeMsat: number
  /** Public key */
  pubKey: string
  /** TLV payload */
  tlvPayload: boolean
  /** MPP record */
  mppRecord?: MppRecord
  /** AMP record */
  ampRecord?: AmpRecord
  /** Custom records */
  customRecords: { [key: string]: string }
  /** Metadata */
  metadata?: Uint8Array
}

/**
 * MPP (Multi-Part Payment) record
 */
export interface MppRecord {
  /** Payment address */
  paymentAddr: string
  /** Total amount in msat */
  totalAmtMsat: number
}

/**
 * AMP (Atomic Multi-Path) record
 */
export interface AmpRecord {
  /** Root share */
  rootShare: string
  /** Set ID */
  setId: string
}

/**
 * HTLC failure information
 */
export interface HtlcFailure {
  /** Failure code */
  code: FailureCode
  /** Channel update */
  channelUpdate?: ChannelUpdate
  /** HTLC msat */
  htlcMsat?: number
  /** Onion sha 256 */
  onionSha256?: string
  /** CLTV expiry */
  cltvExpiry?: number
  /** Flags */
  flags?: number
  /** Failure detail */
  failureDetail?: string
  /** MPP record */
  mppRecord?: MppRecord
}

/**
 * Channel update information
 */
export interface ChannelUpdate {
  /** Signature */
  signature: string
  /** Chain hash */
  chainHash: string
  /** Channel ID */
  chanId: string
  /** Timestamp */
  timestamp: number
  /** Message flags */
  messageFlags: number
  /** Channel flags */
  channelFlags: number
  /** Time lock delta */
  timeLockDelta: number
  /** HTLC minimum msat */
  htlcMinimumMsat: number
  /** Base fee */
  baseFee: number
  /** Fee rate */
  feeRate: number
  /** HTLC maximum msat */
  htlcMaximumMsat?: number
  /** Extra opaque data */
  extraOpaqueData?: string
}

/**
 * Failure code enumeration
 */
export type FailureCode =
  | 'reserved'
  | 'incorrect_or_unknown_payment_details'
  | 'incorrect_payment_amount'
  | 'final_incorrect_cltv_expiry'
  | 'final_incorrect_htlc_amount'
  | 'final_expiry_too_soon'
  | 'invalid_realm'
  | 'expiry_too_far'
  | 'invalid_onion_version'
  | 'invalid_onion_hmac'
  | 'invalid_onion_key'
  | 'amount_below_minimum'
  | 'fee_insufficient'
  | 'incorrect_cltv_expiry'
  | 'channel_disabled'
  | 'temporary_channel_failure'
  | 'required_node_feature_missing'
  | 'required_channel_feature_missing'
  | 'unknown_next_peer'
  | 'temporary_node_failure'
  | 'permanent_node_failure'
  | 'permanent_channel_failure'
  | 'expiry_too_soon'
  | 'unknown_failure'
  | 'unreadable_failure'

/**
 * Payment status enumeration
 */
export type PaymentStatus = 'unknown' | 'in_flight' | 'succeeded' | 'failed' | 'initiated'

/**
 * HTLC attempt status
 */
export type HtlcAttemptStatus = 'in_flight' | 'succeeded' | 'failed'

/**
 * Secure storage configuration
 */
export interface SecureStorageConfig {
  namespace?: string
}

/**
 * Lightning node state for storage
 */
export interface LightningNodeState {
  nodeId: string
  alias: string
  color: string
  features: string[]
  network: 'mainnet' | 'testnet' | 'regtest'
  version: string
  lastSyncHeight: number
  lastActive: number
}
