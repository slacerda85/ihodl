// Lightning Network types and interfaces for iHodl wallet

import { AppAction } from '@/features/store'

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
  /** Child index */
  childIndex: number
}

/**
 * HTLC failure information
 */
export interface HtlcFailure {
  /** Failure code */
  code: FailureCode
  /** Channel update */
  channelUpdate?: ChannelUpdate
  /** HTLC MSP */
  htlcMsat: number
  /** Onion SHA */
  onionSha256: string
  /** CLTV expiry */
  cltvExpiry: number
  /** Flags */
  flags: number
  /** Failure source index */
  failureSourceIndex: number
  /** Height */
  height: number
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
  /** Fee base msat */
  feeBaseMsat: number
  /** Fee rate */
  feeRate: number
  /** HTLC maximum msat */
  htlcMaximumMsat: number
  /** Extra opaque data */
  extraOpaqueData: string
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
  /** Node connection details */
  nodeUrl: string
  /** Authentication method */
  authMethod: 'tls' | 'macaroon'
  /** TLS certificate */
  tlsCert?: string
  /** Macaroon for authentication */
  macaroon?: string
  /** Maximum fee limit for payments */
  maxFeeLimit: number
  /** Default CLTV expiry */
  defaultCltvExpiry: number
  /** Timeout for payments */
  timeoutSeconds: number
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

// Invoice management functions

/**
 * Creates a new Lightning invoice
 * @param params - Parameters for creating the invoice
 * @returns Promise resolving to the created invoice
 */
export async function createInvoice(params: CreateInvoiceParams): Promise<LightningInvoice> {
  // TODO: Implement invoice creation via Lightning node API
  // This would typically connect to LND, CLN, or other Lightning implementations
  throw new Error('Invoice creation not yet implemented')
}

/**
 * Decodes a BOLT11 Lightning invoice
 * @param paymentRequest - The BOLT11 payment request string
 * @returns Decoded invoice information
 */
export function decodeInvoice(paymentRequest: string): LightningInvoice {
  // TODO: Implement BOLT11 decoding
  // This involves parsing the bech32-encoded invoice string
  throw new Error('Invoice decoding not yet implemented')
}

/**
 * Lists all invoices (paid and unpaid)
 * @param pendingOnly - If true, only return pending invoices
 * @param offset - Offset for pagination
 * @param limit - Maximum number of invoices to return
 * @returns Promise resolving to array of invoices
 */
export async function listInvoices(
  pendingOnly: boolean = false,
  offset: number = 0,
  limit: number = 100,
): Promise<LightningInvoice[]> {
  // TODO: Implement invoice listing via Lightning node API
  throw new Error('Invoice listing not yet implemented')
}

/**
 * Looks up an invoice by payment hash
 * @param paymentHash - The payment hash to look up
 * @returns Promise resolving to the invoice if found
 */
export async function lookupInvoice(paymentHash: string): Promise<LightningInvoice | null> {
  // TODO: Implement invoice lookup via Lightning node API
  throw new Error('Invoice lookup not yet implemented')
}

/**
 * Cancels an unpaid invoice
 * @param paymentHash - The payment hash of the invoice to cancel
 * @returns Promise resolving when invoice is cancelled
 */
export async function cancelInvoice(paymentHash: string): Promise<void> {
  // TODO: Implement invoice cancellation via Lightning node API
  throw new Error('Invoice cancellation not yet implemented')
}

// Channel management functions

/**
 * Opens a new Lightning channel
 * @param params - Parameters for opening the channel
 * @returns Promise resolving to the channel opening result
 */
export async function openChannel(params: OpenChannelParams): Promise<{ channelId: string }> {
  // TODO: Implement channel opening via Lightning node API
  // This involves funding a channel with an on-chain transaction
  throw new Error('Channel opening not yet implemented')
}

/**
 * Closes an existing Lightning channel
 * @param channelId - The ID of the channel to close
 * @param force - If true, force close the channel
 * @returns Promise resolving when channel closure is initiated
 */
export async function closeChannel(channelId: string, force: boolean = false): Promise<void> {
  // TODO: Implement channel closing via Lightning node API
  throw new Error('Channel closing not yet implemented')
}

/**
 * Lists all channels
 * @param activeOnly - If true, only return active channels
 * @returns Promise resolving to array of channels
 */
export async function listChannels(activeOnly: boolean = false): Promise<LightningChannel[]> {
  // TODO: Implement channel listing via Lightning node API
  throw new Error('Channel listing not yet implemented')
}

/**
 * Gets detailed information about a specific channel
 * @param channelId - The ID of the channel
 * @returns Promise resolving to channel details
 */
export async function getChannelInfo(channelId: string): Promise<LightningChannel | null> {
  // TODO: Implement channel info retrieval via Lightning node API
  throw new Error('Channel info retrieval not yet implemented')
}

/**
 * Updates channel policy (fees, etc.)
 * @param channelId - The ID of the channel to update
 * @param feeRate - New fee rate in ppm
 * @param baseFeeMsat - New base fee in msat
 * @param timeLockDelta - New timelock delta
 * @returns Promise resolving when update is complete
 */
export async function updateChannelPolicy(
  channelId: string,
  feeRate: number,
  baseFeeMsat: number,
  timeLockDelta: number,
): Promise<void> {
  // TODO: Implement channel policy update via Lightning node API
  throw new Error('Channel policy update not yet implemented')
}

// Payment functions

/**
 * Sends a Lightning payment
 * @param params - Parameters for the payment
 * @returns Promise resolving to payment result
 */
export async function sendPayment(params: SendPaymentParams): Promise<PaymentResult> {
  // TODO: Implement payment sending via Lightning node API
  // This involves finding a route and sending HTLCs
  throw new Error('Payment sending not yet implemented')
}

/**
 * Gets the status of a payment
 * @param paymentHash - The payment hash to check
 * @returns Promise resolving to payment status
 */
export async function getPaymentStatus(paymentHash: string): Promise<PaymentStatus> {
  // TODO: Implement payment status checking via Lightning node API
  throw new Error('Payment status checking not yet implemented')
}

/**
 * Lists payment history
 * @param includeIncomplete - If true, include incomplete payments
 * @param offset - Offset for pagination
 * @param limit - Maximum number of payments to return
 * @returns Promise resolving to array of payments
 */
export async function listPayments(
  includeIncomplete: boolean = false,
  offset: number = 0,
  limit: number = 100,
): Promise<LightningPayment[]> {
  // TODO: Implement payment listing via Lightning node API
  throw new Error('Payment listing not yet implemented')
}

/**
 * Probes a payment route without actually sending payment
 * @param params - Parameters for the payment probe
 * @returns Promise resolving to route information
 */
export async function probePayment(params: SendPaymentParams): Promise<Route | null> {
  // TODO: Implement payment probing via Lightning node API
  throw new Error('Payment probing not yet implemented')
}

/**
 * Decodes a payment request
 * @param paymentRequest - The BOLT11 payment request
 * @returns Decoded payment information
 */
export function decodePaymentRequest(paymentRequest: string): {
  destination: string
  amount: number
  description: string
  expiry: number
} {
  // TODO: Implement payment request decoding
  throw new Error('Payment request decoding not yet implemented')
}

// Node connection and utilities

/**
 * Connects to a Lightning node
 * @param config - Lightning configuration
 * @returns Promise resolving when connected
 */
export async function connectToNode(config: LightningConfig): Promise<void> {
  // TODO: Implement node connection
  // This would establish connection to LND, CLN, or other Lightning implementations
  throw new Error('Node connection not yet implemented')
}

/**
 * Disconnects from the Lightning node
 * @returns Promise resolving when disconnected
 */
export async function disconnectFromNode(): Promise<void> {
  // TODO: Implement node disconnection
  throw new Error('Node disconnection not yet implemented')
}

/**
 * Gets node information
 * @returns Promise resolving to node info
 */
export async function getNodeInfo(): Promise<LightningNode> {
  // TODO: Implement node info retrieval
  throw new Error('Node info retrieval not yet implemented')
}

/**
 * Gets network graph information
 * @param includeUnannounced - Include unannounced channels
 * @returns Promise resolving to network graph
 */
export async function getNetworkGraph(includeUnannounced: boolean = false): Promise<{
  nodes: LightningNode[]
  edges: LightningChannel[]
}> {
  // TODO: Implement network graph retrieval
  throw new Error('Network graph retrieval not yet implemented')
}

/**
 * Estimates routing fees for a payment
 * @param destination - Destination node public key
 * @param amount - Amount in satoshis
 * @returns Promise resolving to fee estimate
 */
export async function estimateRoutingFee(
  destination: string,
  amount: number,
): Promise<{ fee: number; probability: number }> {
  // TODO: Implement fee estimation
  throw new Error('Fee estimation not yet implemented')
}

// Storage and integration functions

/**
 * Saves Lightning wallet data to storage
 * @param data - Lightning wallet data to save
 * @param walletId - The wallet ID (required when using store)
 * @param dispatch - Optional dispatch function to update store
 */
export async function saveLightningWalletData(
  data: LightningWalletData,
  walletId?: string,
  dispatch?: (action: AppAction) => void,
): Promise<void> {
  try {
    if (dispatch && walletId) {
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'SET_LIGHTNING_WALLET', payload: { walletId, data } },
      })
    } else {
      console.warn(
        '[lightning] No dispatch or walletId provided, Lightning wallet data not saved to store',
      )
    }
  } catch (error) {
    console.error('Error saving Lightning wallet data:', error)
    throw new Error('Failed to save Lightning wallet data')
  }
}

/**
 * Loads Lightning wallet data from storage
 * @param walletId - The wallet ID (required when using store)
 * @param state - Optional state to read from store
 * @returns Promise resolving to Lightning wallet data or null if not found
 */
export async function loadLightningWalletData(
  walletId?: string,
  state?: { lightning: { lightningWallets: { [key: string]: LightningWalletData } } },
): Promise<LightningWalletData | null> {
  try {
    if (state && walletId) {
      return state.lightning.lightningWallets[walletId] || null
    } else {
      console.warn(
        '[lightning] No state or walletId provided, cannot read Lightning wallet data from store',
      )
      return null
    }
  } catch (error) {
    console.error('Error loading Lightning wallet data:', error)
    throw new Error('Failed to load Lightning wallet data')
  }
}

/**
 * Saves Lightning configuration to storage
 * @param config - Lightning configuration to save
 * @param walletId - The wallet ID (required when using store)
 * @param dispatch - Optional dispatch function to update store
 */
export async function saveLightningConfig(
  config: LightningConfig,
  walletId?: string,
  dispatch?: (action: AppAction) => void,
): Promise<void> {
  try {
    if (dispatch && walletId) {
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'SET_LIGHTNING_CONFIG', payload: { walletId, config } },
      })
    } else {
      console.warn(
        '[lightning] No dispatch or walletId provided, Lightning config not saved to store',
      )
    }
  } catch (error) {
    console.error('Error saving Lightning config:', error)
    throw new Error('Failed to save Lightning configuration')
  }
}

/**
 * Loads Lightning configuration from storage
 * @param walletId - The wallet ID (required when using store)
 * @param state - Optional state to read from store
 * @returns Promise resolving to Lightning configuration or null if not found
 */
export async function loadLightningConfig(
  walletId?: string,
  state?: { lightning: { lightningConfigs: { [key: string]: LightningConfig } } },
): Promise<LightningConfig | null> {
  try {
    if (state && walletId) {
      return state.lightning.lightningConfigs[walletId] || null
    } else {
      console.warn(
        '[lightning] No state or walletId provided, cannot read Lightning config from store',
      )
      return null
    }
  } catch (error) {
    console.error('Error loading Lightning config:', error)
    throw new Error('Failed to load Lightning configuration')
  }
}

/**
 * Gets the total Lightning balance (sum of all channel balances)
 * @param walletId - The wallet ID
 * @param state - Optional state to read from store
 * @returns Promise resolving to total balance in satoshis
 */
export async function getLightningBalance(
  walletId: string,
  state?: { lightning: { lightningWallets: { [key: string]: LightningWalletData } } },
): Promise<number> {
  const walletData = await loadLightningWalletData(walletId, state)
  if (!walletData) {
    return 0
  }

  return walletData.channels
    .filter(channel => channel.active)
    .reduce((total, channel) => total + channel.localBalance, 0)
}

/**
 * Gets Lightning transaction history (payments and invoices)
 * @param walletId - The wallet ID
 * @param state - Optional state to read from store
 * @param limit - Maximum number of transactions to return
 * @returns Promise resolving to array of Lightning transactions
 */
export async function getLightningTransactionHistory(
  walletId: string,
  state?: { lightning: { lightningWallets: { [key: string]: LightningWalletData } } },
  limit: number = 50,
): Promise<{
  payments: LightningPayment[]
  invoices: LightningInvoice[]
}> {
  const walletData = await loadLightningWalletData(walletId, state)
  if (!walletData) {
    return { payments: [], invoices: [] }
  }

  // Sort by timestamp descending
  const sortedPayments = walletData.payments
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)

  const sortedInvoices = walletData.invoices
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)

  return {
    payments: sortedPayments,
    invoices: sortedInvoices,
  }
}

/**
 * Initializes Lightning wallet for an existing Bitcoin wallet
 * @param bitcoinWalletId - The ID of the Bitcoin wallet
 * @param config - Lightning configuration
 * @param dispatch - Optional dispatch function to update store
 * @returns Promise resolving to initialized Lightning wallet data
 */
export async function initializeLightningWallet(
  bitcoinWalletId: string,
  config: LightningConfig,
  dispatch?: (action: AppAction) => void,
): Promise<LightningWalletData> {
  const walletData: LightningWalletData = {
    nodePubkey: '', // Will be set when connected to node
    channels: [],
    payments: [],
    invoices: [],
    config,
  }

  await saveLightningWalletData(walletData, bitcoinWalletId, dispatch)
  await saveLightningConfig(config, bitcoinWalletId, dispatch)

  return walletData
}
