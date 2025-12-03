// BOLT #2: Peer Protocol for Channel Management

import {
  /* BigSize, TlvRecord, */ TlvStream,
  LightningMessageType,
  U32,
  U64,
  U16,
} from '@/core/models/lightning/base'

// Common types
export type ChannelId = Uint8Array // 32 bytes (funding txid || output index) big endian exclusive-OR
export type Sha256 = Uint8Array // 32 bytes
export type Point = Uint8Array // 33 bytes (compressed pubkey)
export type Signature = Uint8Array // 64 bytes
export type ChainHash = Sha256

// TLV types
export interface OpenChannelTlvs extends TlvStream {
  upfrontShutdownScript?: {
    shutdownScriptpubkey: Uint8Array
  }
  channelType?: {
    type: Uint8Array
  }
}

export interface AcceptChannelTlvs extends TlvStream {
  upfrontShutdownScript?: {
    shutdownScriptpubkey: Uint8Array
  }
  channelType?: {
    type: Uint8Array
  }
}

export interface ChannelReadyTlvs extends TlvStream {
  shortChannelId?: {
    alias: Uint8Array // short_channel_id
  }
}

export interface TxInitRbfTlvs extends TlvStream {
  fundingOutputContribution?: {
    satoshis: bigint
  }
  requireConfirmedInputs?: object
}

export interface TxAckRbfTlvs extends TlvStream {
  fundingOutputContribution?: {
    satoshis: bigint
  }
  requireConfirmedInputs?: object
}

export interface ClosingSignedTlvs extends TlvStream {
  feeRange?: {
    minFeeSatoshis: number
    maxFeeSatoshis: number
  }
}

export interface UpdateAddHtlcTlvs extends TlvStream {
  blindedPath?: {
    pathKey: Point
  }
}

export interface UpdateFulfillHtlcTlvs extends TlvStream {
  attributionData?: {
    htlcHoldTimes: number[]
    truncatedHmacs: Uint8Array[]
  }
}

export interface UpdateFailHtlcTlvs extends TlvStream {
  attributionData?: {
    htlcHoldTimes: number[]
    truncatedHmacs: Uint8Array[]
  }
}

export interface ShutdownTlvs extends TlvStream {
  upfrontShutdownScript?: {
    shutdownScriptpubkey: Uint8Array
  }
}

// Interactive Transaction Construction Messages

export interface TxAddInputMessage {
  type: LightningMessageType.TX_ADD_INPUT
  channelId: ChannelId
  serialId: U64
  prevtxLen: U16
  prevtx: Uint8Array
  prevtxVout: U32
  sequence: U32
}

export interface TxAddOutputMessage {
  type: LightningMessageType.TX_ADD_OUTPUT
  channelId: ChannelId
  serialId: bigint
  sats: bigint
  scriptlen: number
  script: Uint8Array
}

export interface TxRemoveInputMessage {
  type: LightningMessageType.TX_REMOVE_INPUT
  channelId: ChannelId
  serialId: bigint
}

export interface TxRemoveOutputMessage {
  type: LightningMessageType.TX_REMOVE_OUTPUT
  channelId: ChannelId
  serialId: bigint
}

export interface TxCompleteMessage {
  type: LightningMessageType.TX_COMPLETE
  channelId: ChannelId
}

export interface Witness {
  len: number
  witnessData: Uint8Array
}

export interface TxSignaturesMessage {
  type: LightningMessageType.TX_SIGNATURES
  channelId: ChannelId
  txid: Sha256
  numWitnesses: number
  witnesses: Witness[]
}

export interface TxInitRbfMessage {
  type: LightningMessageType.TX_INIT_RBF
  channelId: ChannelId
  locktime: number
  feerate: number
  tlvs: TxInitRbfTlvs
}

export interface TxAckRbfMessage {
  type: LightningMessageType.TX_ACK_RBF
  channelId: ChannelId
  tlvs: TxAckRbfTlvs
}

export interface TxAbortMessage {
  type: LightningMessageType.TX_ABORT
  channelId: ChannelId
  len: number
  data: Uint8Array
}

// Channel Establishment v1 Messages

export interface OpenChannelMessage {
  type: LightningMessageType.OPEN_CHANNEL
  chainHash: ChainHash
  temporaryChannelId: ChannelId
  fundingSatoshis: bigint
  pushMsat: bigint
  dustLimitSatoshis: bigint
  maxHtlcValueInFlightMsat: bigint
  channelReserveSatoshis: bigint
  htlcMinimumMsat: bigint
  feeratePerKw: number
  toSelfDelay: number
  maxAcceptedHtlcs: number
  fundingPubkey: Point
  revocationBasepoint: Point
  paymentBasepoint: Point
  delayedPaymentBasepoint: Point
  htlcBasepoint: Point
  firstPerCommitmentPoint: Point
  channelFlags: number
  tlvs: OpenChannelTlvs
}

export interface AcceptChannelMessage {
  type: LightningMessageType.ACCEPT_CHANNEL
  temporaryChannelId: ChannelId
  dustLimitSatoshis: bigint
  maxHtlcValueInFlightMsat: bigint
  channelReserveSatoshis: bigint
  htlcMinimumMsat: bigint
  minimumDepth: number
  toSelfDelay: number
  maxAcceptedHtlcs: number
  fundingPubkey: Point
  revocationBasepoint: Point
  paymentBasepoint: Point
  delayedPaymentBasepoint: Point
  htlcBasepoint: Point
  firstPerCommitmentPoint: Point
  tlvs: AcceptChannelTlvs
}

export interface FundingCreatedMessage {
  type: LightningMessageType.FUNDING_CREATED
  temporaryChannelId: ChannelId
  fundingTxid: Sha256
  fundingOutputIndex: number
  signature: Signature
}

export interface FundingSignedMessage {
  type: LightningMessageType.FUNDING_SIGNED
  channelId: ChannelId
  signature: Signature
}

export interface ChannelReadyMessage {
  type: LightningMessageType.CHANNEL_READY
  channelId: ChannelId
  secondPerCommitmentPoint: Point
  tlvs: ChannelReadyTlvs
}

// Channel Establishment v2 Messages

export interface OpeningTlvs extends TlvStream {
  upfrontShutdownScript?: {
    shutdownScriptpubkey: Uint8Array
  }
  channelType?: {
    type: Uint8Array
  }
  requireConfirmedInputs?: object
}

export interface AcceptTlvs extends TlvStream {
  upfrontShutdownScript?: {
    shutdownScriptpubkey: Uint8Array
  }
  channelType?: {
    type: Uint8Array
  }
  requireConfirmedInputs?: object
}

export interface OpenChannel2Message {
  type: LightningMessageType.OPEN_CHANNEL2
  chainHash: ChainHash
  temporaryChannelId: ChannelId
  fundingFeeratePerkw: number
  commitmentFeeratePerkw: number
  fundingSatoshis: bigint
  dustLimitSatoshis: bigint
  maxHtlcValueInFlightMsat: bigint
  htlcMinimumMsat: bigint
  toSelfDelay: number
  maxAcceptedHtlcs: number
  locktime: number
  fundingPubkey: Point
  revocationBasepoint: Point
  paymentBasepoint: Point
  delayedPaymentBasepoint: Point
  htlcBasepoint: Point
  firstPerCommitmentPoint: Point
  secondPerCommitmentPoint: Point
  channelFlags: number
  tlvs: OpeningTlvs
}

export interface AcceptChannel2Message {
  type: LightningMessageType.ACCEPT_CHANNEL2
  temporaryChannelId: ChannelId
  fundingSatoshis: bigint
  dustLimitSatoshis: bigint
  maxHtlcValueInFlightMsat: bigint
  htlcMinimumMsat: bigint
  minimumDepth: number
  toSelfDelay: number
  maxAcceptedHtlcs: number
  fundingPubkey: Point
  revocationBasepoint: Point
  paymentBasepoint: Point
  delayedPaymentBasepoint: Point
  htlcBasepoint: Point
  firstPerCommitmentPoint: Point
  secondPerCommitmentPoint: Point
  tlvs: AcceptTlvs
}

export interface CommitmentSignedMessage {
  type: LightningMessageType.COMMITMENT_SIGNED
  channelId: ChannelId
  signature: Signature
  numHtlcs: number
  htlcSignatures: Signature[]
}

export interface RevokeAndAckMessage {
  type: LightningMessageType.REVOKE_AND_ACK
  channelId: ChannelId
  perCommitmentSecret: Uint8Array // 32 bytes
  nextPerCommitmentPoint: Point
}

// Channel Quiescence Messages

export interface StfuMessage {
  type: LightningMessageType.STFU
  channelId: ChannelId
  initiator: number // 0 or 1
}

// Channel Close Messages

export interface ShutdownMessage {
  type: LightningMessageType.SHUTDOWN
  channelId: ChannelId
  len: number
  scriptpubkey: Uint8Array
  tlvs: ShutdownTlvs
}

export interface ClosingTlvs extends TlvStream {
  closerOutputOnly?: {
    sig: Signature
  }
  closeeOutputOnly?: {
    sig: Signature
  }
  closerAndCloseeOutputs?: {
    sig: Signature
  }
}

export interface ClosingCompleteMessage {
  type: LightningMessageType.CLOSING_COMPLETE
  channelId: ChannelId
  closerScriptpubkeyLen: number
  closerScriptpubkey: Uint8Array
  closeeScriptpubkeyLen: number
  closeeScriptpubkey: Uint8Array
  feeSatoshis: bigint
  locktime: number
  tlvs: ClosingTlvs
}

export interface ClosingSigMessage {
  type: LightningMessageType.CLOSING_SIG
  channelId: ChannelId
  closerScriptpubkeyLen: number
  closerScriptpubkey: Uint8Array
  closeeScriptpubkeyLen: number
  closeeScriptpubkey: Uint8Array
  feeSatoshis: bigint
  locktime: number
  tlvs: ClosingTlvs
}

export interface ClosingSignedMessage {
  type: LightningMessageType.CLOSING_SIGNED
  channelId: ChannelId
  feeSatoshis: bigint
  signature: Signature
  tlvs: ClosingSignedTlvs
}

// Normal Operation Messages

export interface UpdateAddHtlcMessage {
  type: LightningMessageType.UPDATE_ADD_HTLC
  channelId: ChannelId
  id: bigint
  amountMsat: bigint
  paymentHash: Sha256
  cltvExpiry: number
  onionRoutingPacket: Uint8Array // 1366 bytes
  tlvs: UpdateAddHtlcTlvs
}

export interface UpdateFulfillHtlcMessage {
  type: LightningMessageType.UPDATE_FULFILL_HTLC
  channelId: ChannelId
  id: bigint
  paymentPreimage: Uint8Array // 32 bytes
  tlvs: UpdateFulfillHtlcTlvs
}

export interface UpdateFailHtlcMessage {
  type: LightningMessageType.UPDATE_FAIL_HTLC
  channelId: ChannelId
  id: bigint
  len: number
  reason: Uint8Array
  tlvs: UpdateFailHtlcTlvs
}

export interface UpdateFailMalformedHtlcMessage {
  type: LightningMessageType.UPDATE_FAIL_MALFORMED_HTLC
  channelId: ChannelId
  id: bigint
  sha256OfOnion: Sha256
  failureCode: number
}

export interface UpdateFeeMessage {
  type: LightningMessageType.UPDATE_FEE
  channelId: ChannelId
  feeratePerKw: number
}

// Message Retransmission Messages

export interface ChannelReestablishTlvs extends TlvStream {
  nextFunding?: {
    nextFundingTxid: Sha256
  }
}

export interface ChannelReestablishMessage {
  type: LightningMessageType.CHANNEL_REESTABLISH
  channelId: ChannelId
  nextCommitmentNumber: bigint
  nextRevocationNumber: bigint
  yourLastPerCommitmentSecret: Uint8Array // 32 bytes
  myCurrentPerCommitmentPoint: Point
  tlvs: ChannelReestablishTlvs
}
