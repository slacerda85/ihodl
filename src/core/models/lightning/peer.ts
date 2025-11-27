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
  upfront_shutdown_script?: {
    shutdown_scriptpubkey: Uint8Array
  }
  channel_type?: {
    type: Uint8Array
  }
}

export interface AcceptChannelTlvs extends TlvStream {
  upfront_shutdown_script?: {
    shutdown_scriptpubkey: Uint8Array
  }
  channel_type?: {
    type: Uint8Array
  }
}

export interface ChannelReadyTlvs extends TlvStream {
  short_channel_id?: {
    alias: Uint8Array // short_channel_id
  }
}

export interface TxInitRbfTlvs extends TlvStream {
  funding_output_contribution?: {
    satoshis: bigint
  }
  require_confirmed_inputs?: object
}

export interface TxAckRbfTlvs extends TlvStream {
  funding_output_contribution?: {
    satoshis: bigint
  }
  require_confirmed_inputs?: object
}

export interface ClosingSignedTlvs extends TlvStream {
  fee_range?: {
    min_fee_satoshis: number
    max_fee_satoshis: number
  }
}

export interface UpdateAddHtlcTlvs extends TlvStream {
  blinded_path?: {
    path_key: Point
  }
}

export interface UpdateFulfillHtlcTlvs extends TlvStream {
  attribution_data?: {
    htlc_hold_times: number[]
    truncated_hmacs: Uint8Array[]
  }
}

export interface UpdateFailHtlcTlvs extends TlvStream {
  attribution_data?: {
    htlc_hold_times: number[]
    truncated_hmacs: Uint8Array[]
  }
}

export interface ChannelReestablishTlvs extends TlvStream {
  next_funding?: {
    next_funding_txid: Sha256
  }
}

// Interactive Transaction Construction Messages

export interface TxAddInputMessage {
  type: LightningMessageType.TX_ADD_INPUT
  channel_id: ChannelId
  serial_id: U64
  prevtx_len: U16
  prevtx: Uint8Array
  prevtx_vout: U32
  sequence: U32
}

export interface TxAddOutputMessage {
  type: LightningMessageType.TX_ADD_OUTPUT
  channel_id: ChannelId
  serial_id: bigint
  sats: bigint
  scriptlen: number
  script: Uint8Array
}

export interface TxRemoveInputMessage {
  type: LightningMessageType.TX_REMOVE_INPUT
  channel_id: ChannelId
  serial_id: bigint
}

export interface TxRemoveOutputMessage {
  type: LightningMessageType.TX_REMOVE_OUTPUT
  channel_id: ChannelId
  serial_id: bigint
}

export interface TxCompleteMessage {
  type: LightningMessageType.TX_COMPLETE
  channel_id: ChannelId
}

export interface Witness {
  len: number
  witness_data: Uint8Array
}

export interface TxSignaturesMessage {
  type: LightningMessageType.TX_SIGNATURES
  channel_id: ChannelId
  txid: Sha256
  num_witnesses: number
  witnesses: Witness[]
}

export interface TxInitRbfMessage {
  type: LightningMessageType.TX_INIT_RBF
  channel_id: ChannelId
  locktime: number
  feerate: number
  tlvs: TxInitRbfTlvs
}

export interface TxAckRbfMessage {
  type: LightningMessageType.TX_ACK_RBF
  channel_id: ChannelId
  tlvs: TxAckRbfTlvs
}

export interface TxAbortMessage {
  type: LightningMessageType.TX_ABORT
  channel_id: ChannelId
  len: number
  data: Uint8Array
}

// Channel Establishment v1 Messages

export interface OpenChannelMessage {
  type: LightningMessageType.OPEN_CHANNEL
  chain_hash: ChainHash
  temporary_channel_id: ChannelId
  funding_satoshis: bigint
  push_msat: bigint
  dust_limit_satoshis: bigint
  max_htlc_value_in_flight_msat: bigint
  channel_reserve_satoshis: bigint
  htlc_minimum_msat: bigint
  feerate_per_kw: number
  to_self_delay: number
  max_accepted_htlcs: number
  funding_pubkey: Point
  revocation_basepoint: Point
  payment_basepoint: Point
  delayed_payment_basepoint: Point
  htlc_basepoint: Point
  first_per_commitment_point: Point
  channel_flags: number
  tlvs: OpenChannelTlvs
}

export interface AcceptChannelMessage {
  type: LightningMessageType.ACCEPT_CHANNEL
  temporary_channel_id: ChannelId
  dust_limit_satoshis: bigint
  max_htlc_value_in_flight_msat: bigint
  channel_reserve_satoshis: bigint
  htlc_minimum_msat: bigint
  minimum_depth: number
  to_self_delay: number
  max_accepted_htlcs: number
  funding_pubkey: Point
  revocation_basepoint: Point
  payment_basepoint: Point
  delayed_payment_basepoint: Point
  htlc_basepoint: Point
  first_per_commitment_point: Point
  tlvs: AcceptChannelTlvs
}

export interface FundingCreatedMessage {
  type: LightningMessageType.FUNDING_CREATED
  temporary_channel_id: ChannelId
  funding_txid: Sha256
  funding_output_index: number
  signature: Signature
}

export interface FundingSignedMessage {
  type: LightningMessageType.FUNDING_SIGNED
  channel_id: ChannelId
  signature: Signature
}

export interface ChannelReadyMessage {
  type: LightningMessageType.CHANNEL_READY
  channel_id: ChannelId
  second_per_commitment_point: Point
  tlvs: ChannelReadyTlvs
}

// Channel Establishment v2 Messages

export interface OpeningTlvs extends TlvStream {
  upfront_shutdown_script?: {
    shutdown_scriptpubkey: Uint8Array
  }
  channel_type?: {
    type: Uint8Array
  }
  require_confirmed_inputs?: object
}

export interface AcceptTlvs extends TlvStream {
  upfront_shutdown_script?: {
    shutdown_scriptpubkey: Uint8Array
  }
  channel_type?: {
    type: Uint8Array
  }
  require_confirmed_inputs?: object
}

export interface OpenChannel2Message {
  type: LightningMessageType.OPEN_CHANNEL2
  chain_hash: ChainHash
  temporary_channel_id: ChannelId
  funding_feerate_perkw: number
  commitment_feerate_perkw: number
  funding_satoshis: bigint
  dust_limit_satoshis: bigint
  max_htlc_value_in_flight_msat: bigint
  htlc_minimum_msat: bigint
  to_self_delay: number
  max_accepted_htlcs: number
  locktime: number
  funding_pubkey: Point
  revocation_basepoint: Point
  payment_basepoint: Point
  delayed_payment_basepoint: Point
  htlc_basepoint: Point
  first_per_commitment_point: Point
  second_per_commitment_point: Point
  channel_flags: number
  tlvs: OpeningTlvs
}

export interface AcceptChannel2Message {
  type: LightningMessageType.ACCEPT_CHANNEL2
  temporary_channel_id: ChannelId
  funding_satoshis: bigint
  dust_limit_satoshis: bigint
  max_htlc_value_in_flight_msat: bigint
  htlc_minimum_msat: bigint
  minimum_depth: number
  to_self_delay: number
  max_accepted_htlcs: number
  funding_pubkey: Point
  revocation_basepoint: Point
  payment_basepoint: Point
  delayed_payment_basepoint: Point
  htlc_basepoint: Point
  first_per_commitment_point: Point
  second_per_commitment_point: Point
  tlvs: AcceptTlvs
}

export interface CommitmentSignedMessage {
  type: LightningMessageType.COMMITMENT_SIGNED
  channel_id: ChannelId
  signature: Signature
  num_htlcs: number
  htlc_signature: Signature[]
}

export interface RevokeAndAckMessage {
  type: LightningMessageType.REVOKE_AND_ACK
  channel_id: ChannelId
  per_commitment_secret: Uint8Array // 32 bytes
  next_per_commitment_point: Point
}

// Channel Quiescence Messages

export interface StfuMessage {
  type: LightningMessageType.STFU
  channel_id: ChannelId
  initiator: number // 0 or 1
}

// Channel Close Messages

export interface ShutdownMessage {
  type: LightningMessageType.SHUTDOWN
  channel_id: ChannelId
  len: number
  scriptpubkey: Uint8Array
}

export interface ClosingTlvs extends TlvStream {
  closer_output_only?: {
    sig: Signature
  }
  closee_output_only?: {
    sig: Signature
  }
  closer_and_closee_outputs?: {
    sig: Signature
  }
}

export interface ClosingCompleteMessage {
  type: LightningMessageType.CLOSING_COMPLETE
  channel_id: ChannelId
  closer_scriptpubkey_len: number
  closer_scriptpubkey: Uint8Array
  closee_scriptpubkey_len: number
  closee_scriptpubkey: Uint8Array
  fee_satoshis: bigint
  locktime: number
  tlvs: ClosingTlvs
}

export interface ClosingSigMessage {
  type: LightningMessageType.CLOSING_SIG
  channel_id: ChannelId
  closer_scriptpubkey_len: number
  closer_scriptpubkey: Uint8Array
  closee_scriptpubkey_len: number
  closee_scriptpubkey: Uint8Array
  fee_satoshis: bigint
  locktime: number
  tlvs: ClosingTlvs
}

export interface ClosingSignedMessage {
  type: LightningMessageType.CLOSING_SIGNED
  channel_id: ChannelId
  fee_satoshis: bigint
  signature: Signature
  tlvs: ClosingSignedTlvs
}

// Normal Operation Messages

export interface UpdateAddHtlcMessage {
  type: LightningMessageType.UPDATE_ADD_HTLC
  channel_id: ChannelId
  id: bigint
  amount_msat: bigint
  payment_hash: Sha256
  cltv_expiry: number
  onion_routing_packet: Uint8Array // 1366 bytes
  tlvs: UpdateAddHtlcTlvs
}

export interface UpdateFulfillHtlcMessage {
  type: LightningMessageType.UPDATE_FULFILL_HTLC
  channel_id: ChannelId
  id: bigint
  payment_preimage: Uint8Array // 32 bytes
  tlvs: UpdateFulfillHtlcTlvs
}

export interface UpdateFailHtlcMessage {
  type: LightningMessageType.UPDATE_FAIL_HTLC
  channel_id: ChannelId
  id: bigint
  len: number
  reason: Uint8Array
  tlvs: UpdateFailHtlcTlvs
}

export interface UpdateFailMalformedHtlcMessage {
  type: LightningMessageType.UPDATE_FAIL_MALFORMED_HTLC
  channel_id: ChannelId
  id: bigint
  sha256_of_onion: Sha256
  failure_code: number
}

export interface UpdateFeeMessage {
  type: LightningMessageType.UPDATE_FEE
  channel_id: ChannelId
  feerate_per_kw: number
}

// Message Retransmission Messages

export interface ChannelReestablishMessage {
  type: LightningMessageType.CHANNEL_REESTABLISH
  channel_id: ChannelId
  next_commitment_number: bigint
  next_revocation_number: bigint
  your_last_per_commitment_secret: Uint8Array // 32 bytes
  my_current_per_commitment_point: Point
  tlvs: ChannelReestablishTlvs
}
