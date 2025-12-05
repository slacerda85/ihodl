// Lightning Network Module Exports
// Este arquivo centraliza todas as exportações do módulo Lightning

// HTLC Manager (BOLT #2)
export {
  HTLCManager,
  HTLCOwner,
  HTLCDirection,
  HTLCState,
  type UpdateAddHtlc,
  type CtnPair,
  type FeeUpdate,
  type HTLCLog,
} from './htlc'

// Revocation Store (BOLT #3)
export {
  RevocationStore,
  START_INDEX,
  getPerCommitmentSecretFromSeed,
  secretToPoint,
  derivePrivkey,
  derivePubkey,
  deriveRevocationPubkey,
  type RevocationBucket,
} from './revocation'

// Commitment Transaction Builder (BOLT #3)
export {
  CommitmentBuilder,
  ChannelType,
  ANCHOR_OUTPUT_VALUE,
  DUST_LIMIT_P2WPKH,
  DUST_LIMIT_P2WSH,
  HTLC_OUTPUT_SIZE,
  HTLC_SUCCESS_TX_SIZE,
  HTLC_TIMEOUT_TX_SIZE,
  fundingOutputScript,
  toLocalScript,
  toRemoteScript,
  offeredHtlcScript,
  receivedHtlcScript,
  type LocalConfig,
  type RemoteConfig,
  type CommitmentOutput,
  type HTLCOutput,
  type CommitmentTx,
  type CommitmentInput,
} from './commitment'

// Key Derivation (LNPBP-46)
export {
  deriveLightningKey,
  getExtendedLightningKey,
  getNodeKey,
  getChannelBasepoints,
  getFundingWallet,
  getPublicKeyFromExtended,
  constructChannelIndex,
  LightningKeyDeriver,
  NodeIndex,
  CoinType,
  LnVersion,
  FundingCase,
  type KeyDerivationContext,
} from './keys'

// Onion Routing (BOLT #4)
export {
  createOnionPacket,
  createHopPayload,
  processOnionPacket,
  decodeOnionPacket,
  serializeOnionPacket,
  encodeTlvStream,
  decodeTlvStream,
  encodeBigSize,
  decodeBigSize,
  encodeTu64,
  encodeTu32,
  ONION_PACKET_SIZE,
  HOP_PAYLOADS_SIZE,
  HMAC_SIZE,
  MAX_HOPS,
  type HopInfo,
  type PaymentRoute,
  type OnionProcessResult,
} from './onion'

// Gossip Protocol (BOLT #7)
export {
  GossipSync,
  createGossipSync,
  GossipSyncState,
  type GossipSyncOptions,
  type GossipSyncStats,
  type GossipMessageCallback,
  type GossipPeerInterface,
} from './gossip'

// Trampoline Routing
export {
  TrampolineRouter,
  createTrampolineRouter,
  supportsTrampolineRouting,
  KNOWN_TRAMPOLINE_NODES,
  DEFAULT_FEE_LEVELS,
  TrampolineTlvType,
  type TrampolineNode,
  type TrampolineFeeLevel,
  type TrampolineHop,
  type TrampolineRoute,
  type TrampolinePayload,
  type TrampolineOnionResult,
} from './trampoline'

// Watchtower
export {
  Watchtower,
  createWatchtower,
  deriveRevocationPubkey as deriveWatchtowerRevocationPubkey,
  deriveRevocationPrivkey,
  ChannelState as WatchtowerChannelState,
  type WatchtowerConfig,
  type WatchtowerChannel,
  type BreachResult,
  type WatchtowerStats,
  type ChannelInfo as WatchtowerChannelInfo,
} from './watchtower'

// Channel Manager (BOLT #2)
export {
  ChannelManager,
  ChannelState,
  ChannelFlags,
  type ChannelInfo,
  type ChannelOperationResult,
  type PendingMessage,
  type OpenChannelMessage,
  type AcceptChannelMessage,
  type FundingCreatedMessage,
  type FundingSignedMessage,
  type ChannelReadyMessage,
} from './channel'

// Peer Protocol (BOLT #2)
export {
  encodeChannelReestablishMessage,
  decodeChannelReestablishMessage,
  createChannelReestablishMessage,
  PeerManager,
} from './peer'

// Multi-Path Payments (BOLT #4)
export {
  MppPaymentManager,
  MppPaymentCollector,
  encodeTu64 as encodeMppTu64,
  decodeTu64 as decodeMppTu64,
  generatePartId,
  uint8ArrayToHex as mppUint8ArrayToHex,
  type PendingMppPayment,
  type IncomingMppHtlc,
  type MppReceiveResult,
  type TimedOutPayment,
} from './mpp'

// BOLT #1 - Base Protocol
export {
  // BigSize encoding
  encodeBigSize as encodeBolt1BigSize,
  decodeBigSize as decodeBolt1BigSize,
  isValidBigSize,
  // TLV encoding
  encodeTlvStream as encodeBolt1TlvStream,
  decodeTlvStream as decodeBolt1TlvStream,
  createTlvRecord,
  findTlv,
  // Feature bits
  FEATURE_BITS,
  hasFeature,
  setFeature,
  clearFeature,
  negotiateFeatures,
  areFeaturesCompatible,
  createFeatureVector,
  listFeatures,
  // Init message
  encodeInitMessage,
  decodeInitMessage,
  createInitMessage,
  // Error message
  encodeErrorMessage,
  decodeErrorMessage,
  createErrorMessage,
  // Warning message
  encodeWarningMessage,
  decodeWarningMessage,
  createWarningMessage,
  // Ping/Pong
  encodePingMessage,
  decodePingMessage,
  createPingMessage,
  encodePongMessage,
  decodePongMessage,
  createPongMessage,
  // Message utilities
  getMessageType,
  // Chain hashes
  CHAIN_HASHES,
  GLOBAL_ERROR_CHANNEL_ID,
} from './bolt1'

// Re-export types from models
export type {
  TlvRecord,
  TlvStream,
  InitMessage,
  ErrorMessage,
  WarningMessage,
  PingMessage,
  PongMessage,
  ChainHash,
  ChannelId,
  LightningMessage,
} from '@/core/models/lightning/base'

export { LightningMessageType, InitTlvType } from '@/core/models/lightning/base'

// Lightning-Electrum Integration
export {
  LightningElectrumManager,
  getLightningElectrumManager,
  createLightningElectrumManager,
  type TxStatus,
  type Utxo,
  type TxStatusCallback,
  type NewTxCallback,
  type MonitorOptions,
} from './electrum'

// Channel Backup & Restore (BOLT #2)
export {
  // Constants
  CHANNEL_BACKUP_VERSION,
  KNOWN_BACKUP_VERSIONS,
  BACKUP_MAGIC,
  // Types
  RestoreState,
  type ChannelBackupData,
  type FullBackup,
  type EncryptedBackup,
  type RestoreContext,
  type RestoreResult,
  type SweepInfo,
  type RestoreSummary,
  // Serialization
  serializeChannelBackup,
  deserializeChannelBackup,
  serializeFullBackup,
  deserializeFullBackup,
  // Encryption
  encryptBackup,
  decryptBackup,
  exportEncryptedBackup,
  importEncryptedBackup,
  exportSingleChannelBackup,
  importSingleChannelBackup,
  // Utility
  deriveChannelIdFromFunding,
  validateChannelBackup,
  getBackupChecksum,
  createBackupFromPersistedChannel,
  // Restore
  prepareChannelRestore,
  createRestoreReestablishMessage,
  prepareSweepInfo,
  isChannelCloseTransaction,
  calculateSweepAddress,
  createRestoreSummary,
} from './backup'
