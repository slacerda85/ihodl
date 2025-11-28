import {
  Byte,
  U16,
  U32,
  U64,
  Tu32,
  Tu64,
  BigSize,
  Point,
  Sha256,
  ShortChannelId,
  SciddirOrPubkey,
} from './base'

// Constants
export const VERSION = 0x00
export const HOP_PAYLOADS_SIZE = 1300
export const HMAC_SIZE = 32
export const SESSION_KEY_SIZE = 32
export const SHARED_SECRET_SIZE = 32

// Key types for HMAC generation
export const enum KeyType {
  RHO = 'rho',
  MU = 'mu',
  UM = 'um',
  PAD = 'pad',
}

// Failure code flags
export const enum FailureFlag {
  BADONION = 0x8000,
  PERM = 0x4000,
  NODE = 0x2000,
  UPDATE = 0x1000,
}

// Failure codes
export const enum FailureCode {
  TEMPORARY_NODE_FAILURE = 0x0002,
  PERMANENT_NODE_FAILURE = 0x0003,
  REQUIRED_NODE_FEATURE_MISSING = 0x0004,
  INVALID_ONION_VERSION = 0x8005,
  INVALID_ONION_HMAC = 0x8006,
  INVALID_ONION_KEY = 0x8007,
  TEMPORARY_CHANNEL_FAILURE = 0x1007,
  PERMANENT_CHANNEL_FAILURE = 0x1008,
  REQUIRED_CHANNEL_FEATURE_MISSING = 0x1009,
  UNKNOWN_NEXT_PEER = 0x100a,
  AMOUNT_BELOW_MINIMUM = 0x100b,
  FEE_INSUFFICIENT = 0x100c,
  INCORRECT_CLTV_EXPIRY = 0x100d,
  EXPIRY_TOO_SOON = 0x100e,
  INCORRECT_OR_UNKNOWN_PAYMENT_DETAILS = 0x400f,
  FINAL_INCORRECT_CLTV_EXPIRY = 0x0010,
  FINAL_INCORRECT_HTLC_AMOUNT = 0x0011,
  CHANNEL_DISABLED = 0x0014,
  EXPIRY_TOO_FAR = 0x0015,
  INVALID_ONION_PAYLOAD = 0x4027,
  MPP_TIMEOUT = 0x0017,
  INVALID_ONION_BLINDING = 0x8024,
}

// Onion Packet
export interface OnionPacket {
  version: Byte
  publicKey: Point
  hopPayloads: Uint8Array // 1300 bytes
  hmac: Sha256
}

// Hop Payloads
export interface HopPayloads {
  length: BigSize
  payload: Uint8Array
  hmac: Sha256
  filler: Uint8Array
}

// Payload TLV types
export const enum PayloadType {
  AMT_TO_FORWARD = 2,
  OUTGOING_CLTV_VALUE = 4,
  SHORT_CHANNEL_ID = 6,
  PAYMENT_DATA = 8,
  ENCRYPTED_RECIPIENT_DATA = 10,
  CURRENT_PATH_KEY = 12,
  PAYMENT_METADATA = 16,
  TOTAL_AMOUNT_MSAT = 18,
}

export interface PayloadTlv {
  amtToForward?: Tu64
  outgoingCltvValue?: Tu32
  shortChannelId?: ShortChannelId
  paymentData?: {
    paymentSecret: Sha256
    totalMsat: Tu64
  }
  encryptedRecipientData?: Uint8Array
  currentPathKey?: Point
  paymentMetadata?: Uint8Array
  totalAmountMsat?: Tu64
}

// Blinded Path
export interface BlindedPath {
  firstNodeId: SciddirOrPubkey
  firstPathKey: Point
  numHops: Byte
  path: BlindedPathHop[]
}

export interface BlindedPathHop {
  blindedNodeId: Point
  enclen: U16
  encryptedRecipientData: Uint8Array
}

// Encrypted Data TLV
export const enum EncryptedDataType {
  PADDING = 1,
  SHORT_CHANNEL_ID = 2,
  NEXT_NODE_ID = 4,
  PATH_ID = 6,
  NEXT_PATH_KEY_OVERRIDE = 8,
  PAYMENT_RELAY = 10,
  PAYMENT_CONSTRAINTS = 12,
  ALLOWED_FEATURES = 14,
}

export interface EncryptedDataTlv {
  padding?: Uint8Array
  shortChannelId?: ShortChannelId
  nextNodeId?: Point
  pathId?: Uint8Array
  nextPathKeyOverride?: Point
  paymentRelay?: {
    cltvExpiryDelta: U16
    feeProportionalMillionths: U32
    feeBaseMsat: Tu32
  }
  paymentConstraints?: {
    maxCltvExpiry: U32
    htlcMinimumMsat: Tu64
  }
  allowedFeatures?: Uint8Array
}

// Failure Message
export interface FailureMessage {
  failureCode: U16
  data?: Uint8Array
}

// Specific failure data structures
export interface TemporaryChannelFailureData {
  len: U16
  channelUpdate: Uint8Array
}

export interface AmountBelowMinimumData {
  htlcMsat: U64
  len: U16
  channelUpdate: Uint8Array
}

export interface FeeInsufficientData {
  htlcMsat: U64
  len: U16
  channelUpdate: Uint8Array
}

export interface IncorrectCltvExpiryData {
  cltvExpiry: U32
  len: U16
  channelUpdate: Uint8Array
}

export interface ExpiryTooSoonData {
  len: U16
  channelUpdate: Uint8Array
}

export interface IncorrectOrUnknownPaymentDetailsData {
  htlcMsat: U64
  height: U32
}

export interface FinalIncorrectCltvExpiryData {
  cltvExpiry: U32
}

export interface FinalIncorrectHtlcAmountData {
  incomingHtlcAmt: U64
}

export interface ChannelDisabledData {
  disabledFlags: U16
  len: U16
  channelUpdate: Uint8Array
}

export interface InvalidOnionPayloadData {
  type: BigSize
  offset: U16
}

// Onion Message
export interface OnionMessage {
  pathKey: Point
  len: U16
  onionMessagePacket: OnionMessagePacket
}

export interface OnionMessagePacket {
  version: Byte
  publicKey: Point
  onionmsgPayloads: Uint8Array
  hmac: Sha256
}

export interface OnionmsgPayloads {
  length: BigSize
  onionmsgTlv: Uint8Array
  hmac: Sha256
  filler: Uint8Array
}

// Onion Message TLV
export const enum OnionmsgType {
  REPLY_PATH = 2,
  ENCRYPTED_RECIPIENT_DATA = 4,
  INVOICE_REQUEST = 64,
  INVOICE = 66,
  INVOICE_ERROR = 68,
}

export interface OnionmsgTlv {
  replyPath?: BlindedPath
  encryptedRecipientData?: Uint8Array
  invoiceRequest?: Uint8Array // tlv_invoice_request
  invoice?: Uint8Array // tlv_invoice
  invoiceError?: Uint8Array // tlv_invoice_error
}

// Attribution Data (for errors and success)
export interface AttributionData {
  htlcHoldTimes: Uint8Array // 20 * u16
  hmacs: Uint8Array // 210 * u32 (truncated to 4 bytes each)
}

// Key Generation
export interface KeyDerivation {
  rho: Sha256
  mu: Sha256
  um: Sha256
  pad: Sha256
}

// Shared Secret
export type SharedSecret = Sha256

// Ephemeral Key
export type EphemeralKey = Point

// Blinding Factor
export type BlindingFactor = Sha256

// Pseudo Random Stream
export interface PseudoRandomStream {
  generate(length: number): Uint8Array
}

// Constants for max values
export const MAX_HOPS = 20
export const MAX_HTLC_CLTV = 2016
