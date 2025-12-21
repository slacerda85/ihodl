// BOLT #2: Peer Protocol for Channel Management

import {
  encodeU16,
  decodeU16,
  encodeU32,
  decodeU32,
  encodeU64,
  decodeU64,
  encodeTlvStream,
  decodeTlvStream,
} from '@/core/lib/lightning/base'
import { TlvStream, TlvRecord } from '@/core/models/lightning/base'

import type {
  // ChannelId,
  // Sha256,
  // Point,
  // Signature,
  // ChainHash,
  OpenChannelTlvs,
  AcceptChannelTlvs,
  ChannelReadyTlvs,
  TxInitRbfTlvs,
  TxAckRbfTlvs,
  ClosingSignedTlvs,
  UpdateAddHtlcTlvs,
  UpdateFulfillHtlcTlvs,
  UpdateFailHtlcTlvs,
  ChannelReestablishTlvs,
  ShutdownTlvs,
  TxAddInputMessage,
  TxAddOutputMessage,
  TxRemoveInputMessage,
  TxRemoveOutputMessage,
  TxCompleteMessage,
  Witness,
  TxSignaturesMessage,
  TxInitRbfMessage,
  TxAckRbfMessage,
  TxAbortMessage,
  OpenChannelMessage,
  AcceptChannelMessage,
  FundingCreatedMessage,
  FundingSignedMessage,
  ChannelReadyMessage,
  UpdateAddHtlcMessage,
  UpdateFulfillHtlcMessage,
  UpdateFailHtlcMessage,
  CommitmentSignedMessage,
  RevokeAndAckMessage,
  ShutdownMessage,
  ClosingSignedMessage,
  ChannelReestablishMessage,
  UpdateFailMalformedHtlcMessage,
  UpdateFeeMessage,
} from '@/core/models/lightning/peer'

// ==========================================
// PEER MANAGER
// ==========================================

import {
  LightningConnection,
  LightningClientConfig,
  DEFAULT_CLIENT_CONFIG,
} from '@/core/models/lightning/client'
import { Peer as PeerType } from '@/core/models/network'
import { createLightningSocket } from '@/core/lib/network/socket'
import {
  generateKey,
  initializeHandshakeState,
  actOneSend,
  actTwoReceive,
  actThreeSend,
  encryptMessage,
  decryptMessage,
  decryptLengthPrefix,
  decryptMessageBody,
} from './transport'
import { encodeInitMessage, decodeInitMessage, encodePingMessage, decodePongMessage } from './base'
import { KeyPair, HandshakeState, TransportKeys } from '@/core/models/lightning/transport'
import { LightningMessageType, InitMessage, PingMessage } from '@/core/models/lightning/base'
import { hexToUint8Array } from '../utils/utils'
import lightningRepository, { PersistedPeer } from '../../repositories/lightning'

class BufferReader {
  private offset = 0

  constructor(private buf: Uint8Array) {}

  readU16(): number {
    const val = decodeU16(this.buf, this.offset)
    this.offset += 2
    return val
  }

  readU32(): number {
    const val = decodeU32(this.buf, this.offset)
    this.offset += 4
    return val
  }

  readU64(): bigint {
    const val = decodeU64(this.buf, this.offset)
    this.offset += 8
    return val
  }

  readBytes(len: number): Uint8Array {
    const val = this.buf.subarray(this.offset, this.offset + len)
    this.offset += len
    return val
  }

  skip(len: number): void {
    this.offset += len
  }

  remaining(): Uint8Array {
    return this.buf.subarray(this.offset)
  }
}

// Encoding/Decoding Functions

// Interactive Transaction Construction

export function encodeTxAddInputMessage({
  type,
  channelId,
  serialId,
  prevtxLen,
  prevtx,
  prevtxVout,
  sequence,
}: TxAddInputMessage): Uint8Array {
  const buffers = [
    encodeU16(type),
    channelId,
    encodeU64(serialId),
    encodeU16(prevtxLen),
    prevtx,
    encodeU32(prevtxVout),
    encodeU32(sequence),
  ]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeTxAddInputMessage(buf: Uint8Array): TxAddInputMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const serialId = reader.readU64()
  const prevtxLen = reader.readU16()
  const prevtx = reader.readBytes(prevtxLen)
  const prevtxVout = reader.readU32()
  const sequence = reader.readU32()
  return {
    type: LightningMessageType.TX_ADD_INPUT,
    channelId,
    serialId,
    prevtxLen,
    prevtx,
    prevtxVout,
    sequence,
  }
}

export function encodeTxAddOutputMessage(msg: TxAddOutputMessage): Uint8Array {
  const buffers = [
    encodeU16(msg.type),
    msg.channelId,
    encodeU64(msg.serialId),
    encodeU64(msg.sats),
    encodeU16(msg.scriptlen),
    msg.script,
  ]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeTxAddOutputMessage(buf: Uint8Array): TxAddOutputMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const serialId = reader.readU64()
  const sats = reader.readU64()
  const scriptlen = reader.readU16()
  const script = reader.readBytes(scriptlen)
  return {
    type: LightningMessageType.TX_ADD_OUTPUT,
    channelId,
    serialId,
    sats,
    scriptlen,
    script,
  }
}

export function encodeTxRemoveInputMessage(msg: TxRemoveInputMessage): Uint8Array {
  const buffers = [encodeU16(msg.type), msg.channelId, encodeU64(msg.serialId)]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeTxRemoveInputMessage(buf: Uint8Array): TxRemoveInputMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const serialId = reader.readU64()
  return {
    type: LightningMessageType.TX_REMOVE_INPUT,
    channelId,
    serialId,
  }
}

export function encodeTxRemoveOutputMessage(msg: TxRemoveOutputMessage): Uint8Array {
  const buffers = [encodeU16(msg.type), msg.channelId, encodeU64(msg.serialId)]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeTxRemoveOutputMessage(buf: Uint8Array): TxRemoveOutputMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const serialId = reader.readU64()
  return {
    type: LightningMessageType.TX_REMOVE_OUTPUT,
    channelId,
    serialId,
  }
}

export function encodeTxCompleteMessage(msg: TxCompleteMessage): Uint8Array {
  const buffers = [encodeU16(msg.type), msg.channelId]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeTxCompleteMessage(buf: Uint8Array): TxCompleteMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  return {
    type: LightningMessageType.TX_COMPLETE,
    channelId,
  }
}

export function encodeTxSignaturesMessage(msg: TxSignaturesMessage): Uint8Array {
  const numWitnessesBuf = encodeU16(msg.numWitnesses)
  let witnessesBuf = new Uint8Array(0)
  for (const witness of msg.witnesses) {
    const lenBuf = encodeU16(witness.len)
    witnessesBuf = new Uint8Array([...witnessesBuf, ...lenBuf, ...witness.witnessData])
  }
  const buffers = [encodeU16(msg.type), msg.channelId, msg.txid, numWitnessesBuf, witnessesBuf]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeTxSignaturesMessage(buf: Uint8Array): TxSignaturesMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const txid = reader.readBytes(32)
  const numWitnesses = reader.readU16()
  const witnesses: Witness[] = []
  for (let i = 0; i < numWitnesses; i++) {
    const len = reader.readU16()
    const witnessData = reader.readBytes(len)
    witnesses.push({ len, witnessData })
  }
  return {
    type: LightningMessageType.TX_SIGNATURES,
    channelId,
    txid,
    numWitnesses,
    witnesses,
  }
}

export function encodeTxInitRbfMessage(msg: TxInitRbfMessage): Uint8Array {
  const buffers = [
    encodeU16(msg.type),
    msg.channelId,
    encodeU32(msg.locktime),
    encodeU32(msg.feerate),
    encodeTlvStream(msg.tlvs as TlvStream),
  ]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeTxInitRbfMessage(buf: Uint8Array): TxInitRbfMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const locktime = reader.readU32()
  const feerate = reader.readU32()
  const tlvs = decodeTlvStream(reader.remaining()) as TxInitRbfTlvs
  return {
    type: LightningMessageType.TX_INIT_RBF,
    channelId,
    locktime,
    feerate,
    tlvs,
  }
}

export function encodeTxAckRbfMessage(msg: TxAckRbfMessage): Uint8Array {
  const buffers = [encodeU16(msg.type), msg.channelId, encodeTlvStream(msg.tlvs as TlvStream)]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeTxAckRbfMessage(buf: Uint8Array): TxAckRbfMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const tlvs = decodeTlvStream(reader.remaining()) as TxAckRbfTlvs
  return {
    type: LightningMessageType.TX_ACK_RBF,
    channelId,
    tlvs,
  }
}

export function encodeTxAbortMessage(msg: TxAbortMessage): Uint8Array {
  const buffers = [encodeU16(msg.type), msg.channelId, encodeU16(msg.len), msg.data]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeTxAbortMessage(buf: Uint8Array): TxAbortMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const len = reader.readU16()
  const data = reader.readBytes(len)
  return {
    type: LightningMessageType.TX_ABORT,
    channelId,
    len,
    data,
  }
}

// Channel Establishment v1

export function encodeOpenChannelMessage(msg: OpenChannelMessage): Uint8Array {
  const buffers = [
    encodeU16(msg.type),
    msg.chainHash,
    msg.temporaryChannelId,
    encodeU64(msg.fundingSatoshis),
    encodeU64(msg.pushMsat),
    encodeU64(msg.dustLimitSatoshis),
    encodeU64(msg.maxHtlcValueInFlightMsat),
    encodeU64(msg.channelReserveSatoshis),
    encodeU64(msg.htlcMinimumMsat),
    encodeU32(msg.feeratePerKw),
    encodeU16(msg.toSelfDelay),
    encodeU16(msg.maxAcceptedHtlcs),
    msg.fundingPubkey,
    msg.revocationBasepoint,
    msg.paymentBasepoint,
    msg.delayedPaymentBasepoint,
    msg.htlcBasepoint,
    msg.firstPerCommitmentPoint,
    new Uint8Array([msg.channelFlags]),
    encodeTlvStream(msg.tlvs as TlvStream),
  ]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeOpenChannelMessage(buf: Uint8Array): OpenChannelMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const chainHash = reader.readBytes(32)
  const temporaryChannelId = reader.readBytes(32)
  const fundingSatoshis = reader.readU64()
  const pushMsat = reader.readU64()
  const dustLimitSatoshis = reader.readU64()
  const maxHtlcValueInFlightMsat = reader.readU64()
  const channelReserveSatoshis = reader.readU64()
  const htlcMinimumMsat = reader.readU64()
  const feeratePerKw = reader.readU32()
  const toSelfDelay = reader.readU16()
  const maxAcceptedHtlcs = reader.readU16()
  const fundingPubkey = reader.readBytes(33)
  const revocationBasepoint = reader.readBytes(33)
  const paymentBasepoint = reader.readBytes(33)
  const delayedPaymentBasepoint = reader.readBytes(33)
  const htlcBasepoint = reader.readBytes(33)
  const firstPerCommitmentPoint = reader.readBytes(33)
  const channelFlags = reader.readBytes(1)[0]
  const tlvs = decodeTlvStream(reader.remaining()) as OpenChannelTlvs
  return {
    type: LightningMessageType.OPEN_CHANNEL,
    chainHash,
    temporaryChannelId,
    fundingSatoshis,
    pushMsat,
    dustLimitSatoshis,
    maxHtlcValueInFlightMsat,
    channelReserveSatoshis,
    htlcMinimumMsat,
    feeratePerKw,
    toSelfDelay,
    maxAcceptedHtlcs,
    fundingPubkey,
    revocationBasepoint,
    paymentBasepoint,
    delayedPaymentBasepoint,
    htlcBasepoint,
    firstPerCommitmentPoint,
    channelFlags,
    tlvs,
  }
}

// Similarly for other messages, but due to length, I'll stop here and note that the pattern continues for all messages.

export function encodeAcceptChannelMessage(msg: AcceptChannelMessage): Uint8Array {
  const buffers = [
    encodeU16(msg.type),
    msg.temporaryChannelId,
    encodeU64(msg.dustLimitSatoshis),
    encodeU64(msg.maxHtlcValueInFlightMsat),
    encodeU64(msg.channelReserveSatoshis),
    encodeU64(msg.htlcMinimumMsat),
    encodeU32(msg.minimumDepth),
    encodeU16(msg.toSelfDelay),
    encodeU16(msg.maxAcceptedHtlcs),
    msg.fundingPubkey,
    msg.revocationBasepoint,
    msg.paymentBasepoint,
    msg.delayedPaymentBasepoint,
    msg.htlcBasepoint,
    msg.firstPerCommitmentPoint,
    encodeTlvStream(msg.tlvs as TlvStream),
  ]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeAcceptChannelMessage(buf: Uint8Array): AcceptChannelMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const temporaryChannelId = reader.readBytes(32)
  const dustLimitSatoshis = reader.readU64()
  const maxHtlcValueInFlightMsat = reader.readU64()
  const channelReserveSatoshis = reader.readU64()
  const htlcMinimumMsat = reader.readU64()
  const minimumDepth = reader.readU32()
  const toSelfDelay = reader.readU16()
  const maxAcceptedHtlcs = reader.readU16()
  const fundingPubkey = reader.readBytes(33)
  const revocationBasepoint = reader.readBytes(33)
  const paymentBasepoint = reader.readBytes(33)
  const delayedPaymentBasepoint = reader.readBytes(33)
  const htlcBasepoint = reader.readBytes(33)
  const firstPerCommitmentPoint = reader.readBytes(33)
  const tlvs = decodeTlvStream(reader.remaining()) as AcceptChannelTlvs
  return {
    type: LightningMessageType.ACCEPT_CHANNEL,
    temporaryChannelId,
    dustLimitSatoshis,
    maxHtlcValueInFlightMsat,
    channelReserveSatoshis,
    htlcMinimumMsat,
    minimumDepth,
    toSelfDelay,
    maxAcceptedHtlcs,
    fundingPubkey,
    revocationBasepoint,
    paymentBasepoint,
    delayedPaymentBasepoint,
    htlcBasepoint,
    firstPerCommitmentPoint,
    tlvs,
  }
}

// Add similar functions for all other messages following the same pattern.

// HTLC Messages

export function encodeUpdateAddHtlcMessage(msg: UpdateAddHtlcMessage): Uint8Array {
  const buffers = [
    encodeU16(msg.type),
    msg.channelId,
    encodeU64(msg.id),
    encodeU64(msg.amountMsat),
    msg.paymentHash,
    encodeU32(msg.cltvExpiry),
    msg.onionRoutingPacket,
    encodeTlvStream(msg.tlvs as TlvStream),
  ]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeUpdateAddHtlcMessage(buf: Uint8Array): UpdateAddHtlcMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const id = reader.readU64()
  const amountMsat = reader.readU64()
  const paymentHash = reader.readBytes(32)
  const cltvExpiry = reader.readU32()
  const onionRoutingPacket = reader.readBytes(1366)
  const tlvs = decodeTlvStream(reader.remaining()) as UpdateAddHtlcTlvs
  return {
    type: LightningMessageType.UPDATE_ADD_HTLC,
    channelId,
    id,
    amountMsat,
    paymentHash,
    cltvExpiry,
    onionRoutingPacket,
    tlvs,
  }
}

export function encodeUpdateFulfillHtlcMessage(msg: UpdateFulfillHtlcMessage): Uint8Array {
  const buffers = [encodeU16(msg.type), msg.channelId, encodeU64(msg.id), msg.paymentPreimage]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeUpdateFulfillHtlcMessage(buf: Uint8Array): UpdateFulfillHtlcMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const id = reader.readU64()
  const paymentPreimage = reader.readBytes(32)
  const tlvs = decodeTlvStream(reader.remaining()) as UpdateFulfillHtlcTlvs
  return {
    type: LightningMessageType.UPDATE_FULFILL_HTLC,
    channelId,
    id,
    paymentPreimage,
    tlvs,
  }
}

export function encodeUpdateFailHtlcMessage(msg: UpdateFailHtlcMessage): Uint8Array {
  const buffers = [
    encodeU16(msg.type),
    msg.channelId,
    encodeU64(msg.id),
    encodeU16(msg.len),
    msg.reason,
  ]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeUpdateFailHtlcMessage(buf: Uint8Array): UpdateFailHtlcMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const id = reader.readU64()
  const len = reader.readU16()
  const reason = reader.readBytes(len)
  const tlvs = decodeTlvStream(reader.remaining()) as UpdateFailHtlcTlvs
  return {
    type: LightningMessageType.UPDATE_FAIL_HTLC,
    channelId,
    id,
    len,
    reason,
    tlvs,
  }
}

/**
 * BOLT #2: update_fail_malformed_htlc
 * Sent when an HTLC is malformed and cannot be properly processed.
 *
 * Message format:
 * - type: 135 (u16)
 * - channel_id: 32 bytes
 * - id: u64 (HTLC id)
 * - sha256_of_onion: 32 bytes (hash of malformed onion)
 * - failure_code: u16 (MUST have BADONION bit set)
 */
export function encodeUpdateFailMalformedHtlcMessage(
  msg: UpdateFailMalformedHtlcMessage,
): Uint8Array {
  const buffers = [
    encodeU16(msg.type),
    msg.channelId,
    encodeU64(msg.id),
    msg.sha256OfOnion,
    encodeU16(msg.failureCode),
  ]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeUpdateFailMalformedHtlcMessage(
  buf: Uint8Array,
): UpdateFailMalformedHtlcMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const id = reader.readU64()
  const sha256OfOnion = reader.readBytes(32)
  const failureCode = reader.readU16()
  return {
    type: LightningMessageType.UPDATE_FAIL_MALFORMED_HTLC,
    channelId,
    id,
    sha256OfOnion,
    failureCode,
  }
}

/**
 * BOLT #2: update_fee
 * Sent when one party wants to update the fee rate for the commitment transaction.
 *
 * Message format:
 * - type: 134 (u16)
 * - channel_id: 32 bytes
 * - feerate_per_kw: u32 (fee rate in satoshis per 1000-weight)
 *
 * Only the funder can send this message.
 */
export function encodeUpdateFeeMessage(msg: UpdateFeeMessage): Uint8Array {
  const buffers = [encodeU16(msg.type), msg.channelId, encodeU32(msg.feeratePerKw)]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeUpdateFeeMessage(buf: Uint8Array): UpdateFeeMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const feeratePerKw = reader.readU32()
  return {
    type: LightningMessageType.UPDATE_FEE,
    channelId,
    feeratePerKw,
  }
}

export function encodeCommitmentSignedMessage(msg: CommitmentSignedMessage): Uint8Array {
  const buffers = [
    encodeU16(msg.type),
    msg.channelId,
    msg.signature,
    encodeU16(msg.numHtlcs),
    ...msg.htlcSignatures,
  ]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeCommitmentSignedMessage(buf: Uint8Array): CommitmentSignedMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const signature = reader.readBytes(64)
  const numHtlcs = reader.readU16()
  const htlcSignatures: Uint8Array[] = []
  for (let i = 0; i < numHtlcs; i++) {
    htlcSignatures.push(reader.readBytes(64))
  }
  return {
    type: LightningMessageType.COMMITMENT_SIGNED,
    channelId,
    signature,
    numHtlcs,
    htlcSignatures,
  }
}

export function encodeRevokeAndAckMessage(msg: RevokeAndAckMessage): Uint8Array {
  const buffers = [
    encodeU16(msg.type),
    msg.channelId,
    msg.perCommitmentSecret,
    msg.nextPerCommitmentPoint,
  ]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeRevokeAndAckMessage(buf: Uint8Array): RevokeAndAckMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const perCommitmentSecret = reader.readBytes(32)
  const nextPerCommitmentPoint = reader.readBytes(33)
  return {
    type: LightningMessageType.REVOKE_AND_ACK,
    channelId,
    perCommitmentSecret,
    nextPerCommitmentPoint,
  }
}

// Channel Reestablish Messages - BOLT #2

/**
 * Encodes a channel_reestablish message - BOLT #2
 *
 * This message is sent when reconnecting to a peer to synchronize
 * channel state. It contains:
 * - channel_id: 32 bytes
 * - next_commitment_number: u64 (our next commitment number)
 * - next_revocation_number: u64 (commitment number of next revocation_secret we expect)
 * - your_last_per_commitment_secret: 32 bytes (last per-commitment secret received, or zeros)
 * - my_current_per_commitment_point: 33 bytes (our current per-commitment point)
 * - tlvs: optional TLV stream (next_funding for splice)
 */
export function encodeChannelReestablishMessage(msg: ChannelReestablishMessage): Uint8Array {
  // Build buffers array
  const buffers: Uint8Array[] = [
    encodeU16(msg.type),
    msg.channelId,
    encodeU64(msg.nextCommitmentNumber),
    encodeU64(msg.nextRevocationNumber),
    msg.yourLastPerCommitmentSecret,
    msg.myCurrentPerCommitmentPoint,
  ]

  // Encode TLVs if present
  if (msg.tlvs?.nextFunding) {
    // TLV type 0: next_funding_txid (32 bytes)
    const tlvRecords: TlvRecord[] = [
      {
        type: 0n,
        length: 32n,
        value: msg.tlvs.nextFunding.nextFundingTxid,
      },
    ]
    buffers.push(encodeTlvStream(tlvRecords as TlvStream))
  }

  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

/**
 * Decodes a channel_reestablish message - BOLT #2
 */
export function decodeChannelReestablishMessage(buf: Uint8Array): ChannelReestablishMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type

  const channelId = reader.readBytes(32)
  const nextCommitmentNumber = reader.readU64()
  const nextRevocationNumber = reader.readU64()
  const yourLastPerCommitmentSecret = reader.readBytes(32)
  const myCurrentPerCommitmentPoint = reader.readBytes(33)

  // Parse TLVs from remaining data
  const tlvStream = decodeTlvStream(reader.remaining())
  const tlvs = tlvStream as ChannelReestablishTlvs

  // Check for next_funding TLV (type 0)
  for (const tlv of tlvStream) {
    if (tlv.type === 0n && tlv.value.length === 32) {
      ;(tlvs as unknown as { nextFunding: { nextFundingTxid: Uint8Array } }).nextFunding = {
        nextFundingTxid: tlv.value,
      }
    }
  }

  return {
    type: LightningMessageType.CHANNEL_REESTABLISH,
    channelId,
    nextCommitmentNumber,
    nextRevocationNumber,
    yourLastPerCommitmentSecret,
    myCurrentPerCommitmentPoint,
    tlvs,
  }
}

/**
 * Creates a channel_reestablish message for reconnection
 *
 * @param channelId - The channel identifier
 * @param nextCommitmentNumber - Our next commitment number
 * @param nextRevocationNumber - The commitment number of the next revocation we expect
 * @param lastReceivedSecret - Last per-commitment secret received (32 bytes of zeros if none)
 * @param currentPoint - Our current per-commitment point
 * @param nextFundingTxid - Optional: next funding txid for splice
 */
export function createChannelReestablishMessage(
  channelId: Uint8Array,
  nextCommitmentNumber: bigint,
  nextRevocationNumber: bigint,
  lastReceivedSecret: Uint8Array,
  currentPoint: Uint8Array,
  nextFundingTxid?: Uint8Array,
): ChannelReestablishMessage {
  const baseTlvs: TlvRecord[] = []
  const tlvs = baseTlvs as ChannelReestablishTlvs

  if (nextFundingTxid) {
    ;(tlvs as unknown as { nextFunding: { nextFundingTxid: Uint8Array } }).nextFunding = {
      nextFundingTxid,
    }
  }

  return {
    type: LightningMessageType.CHANNEL_REESTABLISH,
    channelId,
    nextCommitmentNumber,
    nextRevocationNumber,
    yourLastPerCommitmentSecret: lastReceivedSecret,
    myCurrentPerCommitmentPoint: currentPoint,
    tlvs,
  }
}

// Funding Messages

export function encodeFundingCreatedMessage(msg: FundingCreatedMessage): Uint8Array {
  const buffers = [
    encodeU16(msg.type),
    msg.temporaryChannelId,
    msg.fundingTxid,
    encodeU16(msg.fundingOutputIndex),
    msg.signature,
  ]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeFundingCreatedMessage(buf: Uint8Array): FundingCreatedMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const temporaryChannelId = reader.readBytes(32)
  const fundingTxid = reader.readBytes(32)
  const fundingOutputIndex = reader.readU16()
  const signature = reader.readBytes(64)
  return {
    type: LightningMessageType.FUNDING_CREATED,
    temporaryChannelId,
    fundingTxid,
    fundingOutputIndex,
    signature,
  }
}

export function encodeFundingSignedMessage(msg: FundingSignedMessage): Uint8Array {
  const buffers = [encodeU16(msg.type), msg.channelId, msg.signature]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeFundingSignedMessage(buf: Uint8Array): FundingSignedMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const signature = reader.readBytes(64)
  return {
    type: LightningMessageType.FUNDING_SIGNED,
    channelId,
    signature,
  }
}

export function encodeChannelReadyMessage(msg: ChannelReadyMessage): Uint8Array {
  const buffers = [
    encodeU16(msg.type),
    msg.channelId,
    msg.secondPerCommitmentPoint,
    encodeTlvStream(msg.tlvs as TlvStream),
  ]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeChannelReadyMessage(buf: Uint8Array): ChannelReadyMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const secondPerCommitmentPoint = reader.readBytes(33)
  const tlvs = decodeTlvStream(reader.remaining()) as ChannelReadyTlvs
  return {
    type: LightningMessageType.CHANNEL_READY,
    channelId,
    secondPerCommitmentPoint,
    tlvs,
  }
}

// Shutdown Messages

export function encodeShutdownMessage(msg: ShutdownMessage): Uint8Array {
  const buffers = [
    encodeU16(msg.type),
    msg.channelId,
    encodeU16(msg.len),
    msg.scriptpubkey,
    encodeTlvStream(msg.tlvs as TlvStream),
  ]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeShutdownMessage(buf: Uint8Array): ShutdownMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const len = reader.readU16()
  const scriptpubkey = reader.readBytes(len)
  const tlvs = decodeTlvStream(reader.remaining()) as ShutdownTlvs
  return {
    type: LightningMessageType.SHUTDOWN,
    channelId,
    len,
    scriptpubkey,
    tlvs,
  }
}

export function encodeClosingSignedMessage(msg: ClosingSignedMessage): Uint8Array {
  const buffers = [
    encodeU16(msg.type),
    msg.channelId,
    encodeU64(msg.feeSatoshis),
    msg.signature,
    encodeTlvStream(msg.tlvs as TlvStream),
  ]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeClosingSignedMessage(buf: Uint8Array): ClosingSignedMessage {
  const reader = new BufferReader(buf)
  reader.skip(2) // skip type
  const channelId = reader.readBytes(32)
  const feeSatoshis = reader.readU64()
  const signature = reader.readBytes(64)
  const tlvs = decodeTlvStream(reader.remaining()) as ClosingSignedTlvs
  return {
    type: LightningMessageType.CLOSING_SIGNED,
    channelId,
    feeSatoshis,
    signature,
    tlvs,
  }
}

/**
 * Estados de conexão peer
 */
export enum PeerState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
}

/**
 * Informações de um peer conectado
 */
export interface PeerInfo {
  id: string
  host: string
  port: number
  state: PeerState
  connectedAt?: number
  features?: Uint8Array
}

/**
 * Resultado de tentativa de conexão
 */
export interface PeerConnectionResult {
  success: boolean
  peerId: string
  connection?: LightningConnection
  message?: string
  error?: Error
}

/**
 * Política de reconexão automática
 */
export interface ReconnectionPolicy {
  enabled: boolean
  maxAttempts: number
  initialDelay: number // ms
  maxDelay: number // ms
  backoffMultiplier: number
}

/**
 * Peer com chave pública opcional
 */
export interface PeerWithPubkey extends PeerType {
  pubkey?: string
}

/**
 * Gerencia conexões peer na rede Lightning
 * Responsável por conectar/desconectar peers e manter estado de conexões
 */
export class PeerManager {
  private connectedPeers: Map<string, LightningConnection> = new Map()
  private peerStates: Map<string, PeerState> = new Map()
  private reconnectionPolicy: ReconnectionPolicy = {
    enabled: true,
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  }
  private reconnectionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private reconnectionAttempts: Map<string, number> = new Map()
  private connectedAt: Map<string, number> = new Map()
  // Buffer for leftover bytes from TCP reads (key is socket reference)
  private socketReceiveBuffers: WeakMap<object, Uint8Array> = new WeakMap()

  /**
   * Conecta a um peer específico da rede Lightning
   * Estabelece conexão completa (TLS + Handshake + Init) e registra peer
   */
  async connectPeer(peer: PeerWithPubkey): Promise<PeerConnectionResult> {
    const peerId = `${peer.host}:${peer.port}`

    // Verificar se já conectado
    if (this.connectedPeers.has(peerId)) {
      return { success: true, peerId, message: 'Already connected' }
    }

    try {
      // Atualizar estado para CONNECTING
      this.peerStates.set(peerId, PeerState.CONNECTING)

      // Criar configuração de conexão
      const config: LightningClientConfig = {
        peer,
        peerPubKey: peer.pubkey ? hexToUint8Array(peer.pubkey) : undefined,
        timeout: 10000,
      }

      // Estabelecer conexão Lightning completa
      const connection = await this.createLightningConnection(config)

      // Registrar peer conectado
      this.connectedPeers.set(peerId, connection)
      this.peerStates.set(peerId, PeerState.CONNECTED)
      this.connectedAt.set(peerId, Date.now())

      // Persistir estado do peer
      lightningRepository.savePeer({
        nodeId: peerId,
        host: peer.host,
        port: peer.port,
        pubkey: peer.pubkey || '',
        lastConnected: Date.now(),
      })

      console.log(`[lightning] Connected to peer: ${peerId}`)
      return { success: true, peerId, connection }
    } catch (error) {
      // Limpar estado em caso de falha
      this.peerStates.set(peerId, PeerState.DISCONNECTED)
      console.error(`[lightning] Failed to connect to peer ${peerId}:`, error)
      return { success: false, peerId, error: error as Error }
    }
  }

  /**
   * Desconecta de um peer específico
   * Fecha conexão graceful e limpa estado
   */
  async disconnectPeer(peerId: string): Promise<boolean> {
    const connection = this.connectedPeers.get(peerId)
    if (!connection) {
      return false
    }

    try {
      // Atualizar estado
      this.peerStates.set(peerId, PeerState.DISCONNECTING)

      // Fechar conexão
      const connectionWithCleanup = connection as LightningConnection & { cleanup?: () => void }
      if (connectionWithCleanup.cleanup) {
        connectionWithCleanup.cleanup()
      }
      connection.destroy()

      // Limpar estado
      this.connectedPeers.delete(peerId)
      this.peerStates.set(peerId, PeerState.DISCONNECTED)
      this.connectedAt.delete(peerId)

      // Atualizar persistência
      const peerData = lightningRepository.findPeerById(peerId)
      if (peerData) {
        peerData.lastConnected = Date.now()
        lightningRepository.savePeer(peerData)
      }

      console.log(`[lightning] Disconnected from peer: ${peerId}`)
      return true
    } catch (error) {
      console.error(`[lightning] Error disconnecting peer ${peerId}:`, error)
      return false
    }
  }

  /**
   * Lista todos os peers conectados
   */
  getConnectedPeers(): PeerInfo[] {
    const peers: PeerInfo[] = []

    for (const peerId of this.connectedPeers.keys()) {
      const state = this.peerStates.get(peerId) || PeerState.DISCONNECTED
      peers.push({
        id: peerId,
        host: peerId.split(':')[0],
        port: parseInt(peerId.split(':')[1]),
        state,
        connectedAt: this.connectedAt.get(peerId),
      })
    }

    return peers
  }

  /**
   * Obtém peer para balanceamento de carga
   */
  getPeerForLoadBalancing(): PeerInfo | null {
    const connectedPeers = this.getConnectedPeers()
    if (connectedPeers.length === 0) {
      return null
    }

    // Estratégia simples: round-robin baseado em timestamp
    const index = Math.floor(Date.now() / 1000) % connectedPeers.length
    return connectedPeers[index]
  }

  /**
   * Carrega peers persistidos na inicialização
   */
  async loadPersistedPeers(): Promise<void> {
    try {
      const persistedPeers = lightningRepository.findAllPeers()

      for (const peerData of Object.values(persistedPeers)) {
        const peerId = peerData.nodeId

        if (this.reconnectionPolicy.enabled) {
          // Iniciar reconexão automática
          this.scheduleReconnection(peerData)
        } else {
          // Apenas registrar estado
          this.peerStates.set(peerId, PeerState.DISCONNECTED)
        }

        console.log(`[lightning] Loaded persisted peer: ${peerId}`)
      }
    } catch (error) {
      console.warn('[lightning] Failed to load persisted peers:', error)
    }
  }

  /**
   * Obtém conexão de um peer específico
   */
  getPeerConnection(peerId: string): LightningConnection | null {
    return this.connectedPeers.get(peerId) || null
  }

  /**
   * Verifica se peer está conectado
   */
  isPeerConnected(peerId: string): boolean {
    return this.peerStates.get(peerId) === PeerState.CONNECTED
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Cria conexão TLS segura com peer Lightning
   */
  private async createConnection(peer: PeerType, timeout: number = 10000): Promise<any> {
    return createLightningSocket(peer, timeout)
  }

  /**
   * Executa handshake completo BOLT #8 (Noise_XK_secp256k1_ChaChaPoly_SHA256)
   */
  private async performNoiseHandshake(
    socket: any,
    peerPubKey: Uint8Array,
    timeout: number = 10000,
  ): Promise<{ transportKeys: TransportKeys; peerPubKey: Uint8Array }> {
    console.log(`[${new Date().toISOString()}] [lightning] Starting Noise handshake (BOLT #8)...`)

    // Gerar chave local efêmera para handshake
    const localKeyPair: KeyPair = generateKey()
    console.log(`[${new Date().toISOString()}] [lightning] Generated local ephemeral key pair`)

    // Inicializar estado do handshake
    const handshakeState: HandshakeState = initializeHandshakeState(peerPubKey, localKeyPair)
    console.log(`[${new Date().toISOString()}] [lightning] Initialized handshake state`)

    // Act One: Enviar chave efêmera
    const { message: actOneMsg, newState: stateAfterActOne } = actOneSend(
      handshakeState,
      localKeyPair,
    )
    console.log(
      `[${new Date().toISOString()}] [lightning] Sending Act One message:`,
      actOneMsg.length,
      'bytes',
    )
    await this.sendRaw(socket, actOneMsg)
    console.log(`[${new Date().toISOString()}] [lightning] Act One sent successfully`)

    // Act Two: Receber chave efêmera do responder
    console.log(`[${new Date().toISOString()}] [lightning] Waiting for Act Two response...`)
    const actTwoMsg = await this.receiveRaw(socket, 50, timeout)
    console.log(
      `[${new Date().toISOString()}] [lightning] Received Act Two message:`,
      actTwoMsg.length,
      'bytes',
    )

    const actTwoResult = actTwoReceive(stateAfterActOne, actTwoMsg, localKeyPair)
    if ('error' in actTwoResult) {
      console.error(`[${new Date().toISOString()}] [lightning] Act Two failed:`, actTwoResult.error)
      throw new Error(`Handshake Act Two failed: ${actTwoResult.error}`)
    }
    console.log(`[${new Date().toISOString()}] [lightning] Act Two processed successfully`)

    // Extrair chave pública efêmera do responder do Act Two
    const responderEphemeralPubkey = actTwoMsg.subarray(1, 34)
    console.log(`[${new Date().toISOString()}] [lightning] Extracted responder ephemeral pubkey`)

    // Act Three: Initiator ENVIA sua chave estática criptografada
    console.log(`[${new Date().toISOString()}] [lightning] Preparing Act Three...`)
    const actThreeResult = actThreeSend(
      actTwoResult.newState,
      localKeyPair, // nossa chave estática
      responderEphemeralPubkey, // chave efêmera do responder
    )
    console.log(
      `[${new Date().toISOString()}] [lightning] Sending Act Three message:`,
      actThreeResult.message.length,
      'bytes',
    )
    await this.sendRaw(socket, actThreeResult.message)
    console.log(`[${new Date().toISOString()}] [lightning] Act Three sent successfully`)

    console.log(`[${new Date().toISOString()}] [lightning] Noise handshake completed successfully`)
    return {
      transportKeys: actThreeResult.keys,
      peerPubKey,
    }
  }

  /**
   * Troca mensagens Init (BOLT #1)
   */
  private async exchangeInitMessages(
    socket: any,
    transportKeys: TransportKeys,
    timeout: number = 10000,
  ): Promise<void> {
    console.log(
      `[${new Date().toISOString()}] [lightning] Starting Init message exchange (BOLT #1)...`,
    )

    // Criar mensagem Init local (features básicas)
    const initMsg: InitMessage = {
      type: LightningMessageType.INIT,
      gflen: 0,
      globalfeatures: new Uint8Array(0),
      flen: 0,
      features: new Uint8Array(0),
      tlvs: [],
    }

    console.log(`[${new Date().toISOString()}] [lightning] Created local Init message:`, {
      type: initMsg.type,
      globalFeaturesLength: initMsg.gflen,
      featuresLength: initMsg.flen,
    })

    // Codificar e enviar Init
    const encodedInit = encodeInitMessage(initMsg)
    console.log(
      `[${new Date().toISOString()}] [lightning] Encoded Init message:`,
      encodedInit.length,
      'bytes',
    )

    const { encrypted: encryptedInit } = encryptMessage(transportKeys, encodedInit)
    console.log(
      `[${new Date().toISOString()}] [lightning] Encrypted Init message:`,
      encryptedInit.length,
      'bytes',
    )

    await this.sendRaw(socket, encryptedInit)
    console.log(`[${new Date().toISOString()}] [lightning] Sent local Init message`)

    // Receber e decodificar Init do peer (two-step receive for streaming)
    console.log(`[${new Date().toISOString()}] [lightning] Waiting for peer Init message...`)

    // Step 1: Receive encrypted length prefix (18 bytes)
    const encryptedLength = await this.receiveRaw(socket, 18, timeout)
    console.log(
      `[${new Date().toISOString()}] [lightning] Received encrypted length:`,
      encryptedLength.length,
      'bytes',
    )

    // Decrypt length to know how many more bytes to receive
    const lengthResult = decryptLengthPrefix(transportKeys, encryptedLength)
    if ('error' in lengthResult) {
      console.error(
        `[${new Date().toISOString()}] [lightning] Failed to decrypt length prefix:`,
        lengthResult.error,
      )
      throw new Error(`Failed to decrypt length prefix: ${lengthResult.error}`)
    }
    const { length: messageLength, newKeys: keysAfterLength } = lengthResult
    console.log(
      `[${new Date().toISOString()}] [lightning] Decrypted message length:`,
      messageLength,
      'bytes',
    )

    // Step 2: Receive encrypted message body (messageLength + 16 bytes for MAC)
    const encryptedBody = await this.receiveRaw(socket, messageLength + 16, timeout)
    console.log(
      `[${new Date().toISOString()}] [lightning] Received encrypted body:`,
      encryptedBody.length,
      'bytes',
    )

    // Decrypt message body
    const bodyResult = decryptMessageBody(keysAfterLength, encryptedBody, messageLength)
    if ('error' in bodyResult) {
      console.error(
        `[${new Date().toISOString()}] [lightning] Failed to decrypt message body:`,
        bodyResult.error,
      )
      throw new Error(`Failed to decrypt message body: ${bodyResult.error}`)
    }
    console.log(
      `[${new Date().toISOString()}] [lightning] Successfully decrypted peer Init:`,
      bodyResult.message.length,
      'bytes',
    )

    // Decodificar Init do peer (não usado por enquanto)
    const peerInit = decodeInitMessage(bodyResult.message)
    console.log('[lightning] Decoded peer Init:', {
      type: peerInit.type,
      globalFeaturesLength: peerInit.gflen,
      featuresLength: peerInit.flen,
    })

    console.log('[lightning] Init exchange completed successfully')
  }

  /**
   * Inicia keep-alive com ping/pong (BOLT #1)
   */
  private startPingPong(
    socket: any,
    transportKeys: TransportKeys,
    config: any = { interval: 30000, timeout: 10000, maxMissedPings: 3 },
  ): () => void {
    let missedPings = 0
    let pingTimeout: ReturnType<typeof setTimeout> | null = null

    const pingInterval = setInterval(async () => {
      try {
        const pingMsg: PingMessage = {
          type: LightningMessageType.PING,
          numPongBytes: 1,
          byteslen: 0,
          ignored: new Uint8Array(0),
        }

        const encodedPing = encodePingMessage(pingMsg)
        const { encrypted: encryptedPing } = encryptMessage(transportKeys, encodedPing)
        await this.sendRaw(socket, encryptedPing)
        console.log('[lightning] Ping sent')

        // Set timeout for pong response
        pingTimeout = setTimeout(() => {
          missedPings++
          console.warn(`[lightning] Ping timeout, missed: ${missedPings}`)
          if (missedPings >= config.maxMissedPings) {
            console.error('[lightning] Too many missed pings, closing connection')
            socket.destroy()
          }
        }, config.timeout)
      } catch (error) {
        console.warn('[lightning] Ping failed:', error)
        clearInterval(pingInterval)
        if (pingTimeout) clearTimeout(pingTimeout)
      }
    }, config.interval)

    const onData = async (data: string | Buffer) => {
      try {
        const buffer =
          typeof data === 'string'
            ? new TextEncoder().encode(data)
            : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
        const decrypted = decryptMessage(transportKeys, buffer)
        if ('error' in decrypted) return // Não é mensagem válida

        // Tentar decodificar como Pong
        if (decrypted.message.length >= 2) {
          const msgType = (decrypted.message[0] << 8) | decrypted.message[1]
          if (msgType === LightningMessageType.PONG) {
            // Pong recebido - reset missed pings counter
            if (pingTimeout) {
              clearTimeout(pingTimeout)
              pingTimeout = null
            }
            missedPings = 0
            decodePongMessage(decrypted.message)
            console.log('[lightning] Pong received')
          }
        }
      } catch {
        // Ignorar mensagens não-pong
      }
    }

    socket.on('data', onData)

    // Cleanup function
    const cleanup = () => {
      clearInterval(pingInterval)
      if (pingTimeout) clearTimeout(pingTimeout)
      socket.removeListener('data', onData)
    }

    socket.on('close', cleanup)

    return cleanup
  }

  /**
   * Cria conexão Lightning completa
   */
  private async createLightningConnection(
    config: LightningClientConfig,
  ): Promise<LightningConnection> {
    const finalConfig: LightningClientConfig = { ...DEFAULT_CLIENT_CONFIG, ...config }

    if (!finalConfig.peerPubKey) {
      throw new Error('Peer public key is required for Lightning connection')
    }

    const peerPubKey = finalConfig.peerPubKey
    console.log(
      `[${new Date().toISOString()}] [lightning] Creating Lightning connection to peer:`,
      {
        host: finalConfig.peer.host,
        port: finalConfig.peer.port,
        hasPubKey: !!peerPubKey,
      },
    )

    try {
      // 1. Conexão TCP (não TLS - Lightning usa Noise para criptografia)
      console.log(
        `[${new Date().toISOString()}] [lightning] Step 1: Establishing TCP connection...`,
      )
      const socket = await this.createConnection(finalConfig.peer, finalConfig.timeout)
      console.log(
        `[${new Date().toISOString()}] [lightning] TCP connection established successfully`,
      )

      // 2. Handshake BOLT #8 (Noise_XK_secp256k1_ChaChaPoly_SHA256)
      console.log(
        `[${new Date().toISOString()}] [lightning] Step 2: Performing BOLT #8 Noise handshake...`,
      )
      const handshakeResult = await this.performNoiseHandshake(
        socket,
        peerPubKey,
        finalConfig.timeout,
      )
      console.log(
        `[${new Date().toISOString()}] [lightning] Noise handshake completed successfully`,
      )

      // 3. Troca de Init messages (BOLT #1)
      console.log(
        `[${new Date().toISOString()}] [lightning] Step 3: Exchanging BOLT #1 Init messages...`,
      )
      await this.exchangeInitMessages(socket, handshakeResult.transportKeys, finalConfig.timeout)
      console.log(
        `[${new Date().toISOString()}] [lightning] Init message exchange completed successfully`,
      )

      // 4. Iniciar Ping/Pong (BOLT #1)
      console.log(
        `[${new Date().toISOString()}] [lightning] Step 4: Starting BOLT #1 Ping/Pong keep-alive...`,
      )
      const cleanupPingPong = this.startPingPong(socket, handshakeResult.transportKeys)
      console.log(`[${new Date().toISOString()}] [lightning] Ping/Pong keep-alive started`)

      // 5. Retornar conexão com estado de transporte
      const lightningConnection: LightningConnection = Object.assign(socket, {
        transportKeys: handshakeResult.transportKeys,
        peerPubKey: handshakeResult.peerPubKey,
      })

      // Add cleanup function to connection
      const extendedConnection = lightningConnection as LightningConnection & {
        cleanup: () => void
      }
      extendedConnection.cleanup = cleanupPingPong

      console.log(
        `[${new Date().toISOString()}] [lightning] Lightning connection established successfully`,
      )
      return extendedConnection
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [lightning] Connection failed:`, error)
      throw error
    }
  }

  /**
   * Envia dados brutos pelo socket
   */
  private sendRaw(socket: any, data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.write(data, undefined, (err?: Error | undefined) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  /**
   * Recebe dados brutos do socket
   */
  private receiveRaw(
    socket: any,
    expectedLength: number,
    timeout: number = 10000,
  ): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      // Start with any leftover data from previous reads
      const existingBuffer = this.socketReceiveBuffers.get(socket) || new Uint8Array(0)
      const chunks: Uint8Array[] = existingBuffer.length > 0 ? [existingBuffer] : []
      this.socketReceiveBuffers.delete(socket)

      let timeoutId: ReturnType<typeof setTimeout> | null = null

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
        socket.removeListener('data', onData)
        socket.removeListener('error', onError)
      }

      const tryResolve = () => {
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
        if (totalLength >= expectedLength) {
          cleanup()

          // Combine all chunks into one buffer
          const combined = new Uint8Array(totalLength)
          let writeOffset = 0
          for (const chunk of chunks) {
            combined.set(chunk, writeOffset)
            writeOffset += chunk.length
          }

          // Extract the requested bytes
          const result = combined.subarray(0, expectedLength)

          // Save any excess bytes for the next receive call
          if (totalLength > expectedLength) {
            const excess = combined.subarray(expectedLength)
            this.socketReceiveBuffers.set(socket, excess)
          }

          resolve(result)
          return true
        }
        return false
      }

      // Check if we already have enough data from the buffer
      if (tryResolve()) {
        return
      }

      const onData = (data: string | Buffer) => {
        const dataBuffer =
          typeof data === 'string'
            ? new TextEncoder().encode(data)
            : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
        chunks.push(dataBuffer)
        tryResolve()
      }

      const onError = (err: Error) => {
        cleanup()
        reject(err)
      }

      const onTimeout = () => {
        cleanup()
        reject(new Error(`Receive timeout after ${timeout}ms waiting for ${expectedLength} bytes`))
      }

      // Set timeout
      timeoutId = setTimeout(onTimeout, timeout)

      socket.on('data', onData)
      socket.on('error', onError)
    })
  }

  /**
   * Agenda reconexão automática para um peer
   */
  private scheduleReconnection(peerData: PersistedPeer): void {
    const peerId = peerData.nodeId

    // Cancelar reconexão existente se houver
    this.cancelReconnection(peerId)

    // Resetar contador de tentativas
    this.reconnectionAttempts.set(peerId, 0)

    // Agendar primeira tentativa
    this.attemptReconnection(peerData)
  }

  /**
   * Tenta reconectar a um peer com backoff exponencial
   */
  private attemptReconnection(peerData: PersistedPeer): void {
    const peerId = peerData.nodeId
    const attempts = this.reconnectionAttempts.get(peerId) || 0

    if (attempts >= this.reconnectionPolicy.maxAttempts) {
      console.log(`[lightning] Max reconnection attempts reached for peer: ${peerId}`)
      return
    }

    // Calcular delay com backoff exponencial
    const delay = Math.min(
      this.reconnectionPolicy.initialDelay *
        Math.pow(this.reconnectionPolicy.backoffMultiplier, attempts),
      this.reconnectionPolicy.maxDelay,
    )

    console.log(
      `[lightning] Scheduling reconnection attempt ${attempts + 1}/${this.reconnectionPolicy.maxAttempts} for peer: ${peerId} in ${delay}ms`,
    )

    const timer = setTimeout(async () => {
      try {
        // Tentar conectar
        const peer: PeerWithPubkey = {
          host: peerData.host,
          port: peerData.port,
          pubkey: peerData.pubkey,
        }

        const result = await this.connectPeer(peer)

        if (result.success) {
          console.log(`[lightning] Successfully reconnected to peer: ${peerId}`)
          this.reconnectionTimers.delete(peerId)
          this.reconnectionAttempts.delete(peerId)
        } else {
          // Agendar próxima tentativa
          this.reconnectionAttempts.set(peerId, attempts + 1)
          this.attemptReconnection(peerData)
        }
      } catch (error) {
        console.error(`[lightning] Reconnection attempt failed for peer ${peerId}:`, error)
        // Agendar próxima tentativa
        this.reconnectionAttempts.set(peerId, attempts + 1)
        this.attemptReconnection(peerData)
      }
    }, delay)

    this.reconnectionTimers.set(peerId, timer)
  }

  /**
   * Cancela reconexão agendada para um peer
   */
  private cancelReconnection(peerId: string): void {
    const timer = this.reconnectionTimers.get(peerId)
    if (timer) {
      clearTimeout(timer)
      this.reconnectionTimers.delete(peerId)
    }
  }
}
