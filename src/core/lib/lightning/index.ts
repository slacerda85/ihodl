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
