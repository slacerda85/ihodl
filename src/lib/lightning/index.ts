export { LNDClient } from './lnd-client'
export { CLNClient } from './cln-client'
export { EclairClient } from './eclair-client'

export {
  createLightningClient,
  authenticatedLightningClient,
  unauthenticatedLightningClient,
} from './clients'

export { createLightningWalletProvider, BreezWalletProvider, breezClient } from './client'

export {
  LIGHTNING_PURPOSE,
  LIGHTNING_CHAIN_BITCOIN,
  LIGHTNING_CHAIN_TESTNET,
  LN_VER_BOLT,
  LN_VER_BIFROST,
  BASEPOINT_FUNDING,
  BASEPOINT_PAYMENT,
  BASEPOINT_DELAYED,
  BASEPOINT_REVOCATION,
  BASEPOINT_HTLC,
  BASEPOINT_PTLC,
} from './constants'

export {
  deriveExtendedLightningKey,
  deriveNodeKey,
  constructChannelIndex,
  deriveChannelBasepoint,
  deriveBasepoint,
  derivePerCommitmentBasepoint,
  deriveLightningChannelKeyset,
  deriveFundingWallet,
  deriveFundingWalletAddress,
  generateFundingWalletAddresses,
  deriveNodeAddress,
} from './keys'

export {
  createFundingTransaction,
  createCommitmentTransaction,
  createHtlcTransaction,
  signLightningTransaction,
  validateChannelTransaction,
  calculateLightningFee,
  estimateCommitmentTxSize,
  validateChannelParams,
  generateChannelId,
  parseChannelId,
} from './utils'

export { initializeLightningWallet, createInvoice, estimateRoutingFee } from './wallet'

export {
  LightningSecureStorage,
  lightningSecureStorage,
  initializeLightningStorage,
  hasLightningNodeData,
  backupLightningNode,
  restoreLightningNode,
} from './storage'

export type {
  LightningClient,
  LightningClientConfig,
  LightningNode,
  LightningChannel,
  LightningInvoice,
  LightningPayment,
  ChannelStatus,
  ChannelType,
  CommitmentType,
  ChannelLifecycleState,
  HtlcStatus,
  PaymentStatus,
  HtlcAttemptStatus,
  CreateInvoiceParams,
  PaymentResult,
  LightningChannelKeyset,
  LightningNodeKey,
  NodeAddress,
  Feature,
  Htlc,
  HtlcAttempt,
  Route,
  Hop,
  MppRecord,
  AmpRecord,
  HtlcFailure,
  ChannelUpdate,
  FailureCode,
  RoutingHint,
  InvoiceFeature,
  LightningWalletData,
  LightningConfig,
  SecureStorageConfig,
  LightningNodeState,
} from './types'

export type { LightningWalletConfig, LightningWalletProvider } from './client'
