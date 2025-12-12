// BOLT #11: Invoice Protocol for Lightning Payments
// Based on https://github.com/lightning/bolts/blob/master/11-payment-encoding.md

import { Sha256, Point, Signature } from './base'
import { PaymentHash } from './transaction'
import { FeatureVector } from './features'

// Constants
export const DEFAULT_EXPIRY_SECONDS = 3600 // 1 hour
export const DEFAULT_MIN_FINAL_CLTV_EXPIRY_DELTA = 18

// Currency prefixes for different networks
export enum CurrencyPrefix {
  BITCOIN_MAINNET = 'lnbc',
  BITCOIN_TESTNET = 'lntb',
  BITCOIN_SIGNET = 'lntbs',
  BITCOIN_REGTEST = 'lnbcrt',
}

// Amount multipliers
export enum AmountMultiplier {
  MILLI = 'm', // * 0.001
  MICRO = 'u', // * 0.000001
  NANO = 'n', // * 0.000000001
  PICO = 'p', // * 0.000000000001
}

// Tagged field types (5-bit type identifiers)
export enum TaggedFieldType {
  PAYMENT_HASH = 1, // p
  UNKNOWN_2 = 2, // Appears in test vectors as payment_hash
  ROUTING_INFO = 3, // r
  FEATURES = 5, // 9
  EXPIRY = 6, // x
  FALLBACK_ADDRESS = 9, // f
  DESCRIPTION = 13, // d
  PAYMENT_SECRET = 16, // s
  PAYEE_PUBKEY = 19, // n
  UNKNOWN_22 = 22, // Appears in test vectors as description
  DESCRIPTION_HASH = 23, // h
  MIN_FINAL_CLTV_EXPIRY_DELTA = 24, // c
  METADATA = 27, // m
}

// Payment secret (256-bit)
export type PaymentSecret = Sha256

// Expiry time in seconds
export type ExpirySeconds = number

// Minimum final CLTV expiry delta
export type MinFinalCltvExpiryDelta = number

// Fallback address types
export enum FallbackAddressType {
  P2PKH = 17, // 17 followed by 20-byte hash
  P2SH = 18, // 18 followed by 20-byte hash
  P2WPKH = 0, // witness version 0, 20-byte hash
  P2WSH = 0, // witness version 0, 32-byte hash
  P2TR = 1, // witness version 1, 32-byte hash
}

// Fallback address structure
export interface FallbackAddress {
  type: FallbackAddressType
  hash: Uint8Array // 20 or 32 bytes depending on type
}

// Routing information entry
export interface RoutingInfoEntry {
  pubkey: Point // 33-byte compressed pubkey
  shortChannelId: Uint8Array // 8-byte short channel ID
  feeBaseMsat: number // base fee in millisatoshis (big-endian U32)
  feeProportionalMillionths: number // proportional fee in millionths (big-endian U32)
  cltvExpiryDelta: number // CLTV expiry delta (big-endian U16)
}

// Tagged fields
export interface InvoiceTaggedFields {
  paymentHash: PaymentHash
  paymentSecret?: PaymentSecret
  description?: string
  descriptionHash?: Sha256
  expiry?: ExpirySeconds
  minFinalCltvExpiryDelta?: MinFinalCltvExpiryDelta
  fallbackAddresses?: FallbackAddress[]
  routingInfo?: RoutingInfoEntry[]
  features?: FeatureVector
  payeePubkey?: Point
  metadata?: Uint8Array
}

// Invoice structure
export interface Invoice {
  currency: string
  amount?: bigint // amount in millisatoshis, undefined for donation
  timestamp: number // seconds since Unix epoch
  taggedFields: InvoiceTaggedFields
  signature: Signature
}

// Invoice encoding/decoding result
export interface InvoiceParseResult {
  invoice: Invoice
  bech32String: string
}

// Invoice creation parameters
export interface InvoiceCreateParams {
  currency?: string
  amount?: bigint
  paymentHash: PaymentHash
  paymentSecret?: PaymentSecret
  description?: string
  descriptionHash?: Sha256
  expiry?: ExpirySeconds
  minFinalCltvExpiryDelta?: MinFinalCltvExpiryDelta
  fallbackAddresses?: FallbackAddress[]
  routingInfo?: RoutingInfoEntry[]
  features?: FeatureVector
  payeePubkey?: Point
  metadata?: Uint8Array
  payeePrivateKey: Uint8Array // for signing
}

// Invoice validation result
export interface InvoiceValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

// Invoice amount conversion utilities
export interface AmountConversion {
  millisatoshis: bigint
  satoshis: bigint
  bitcoin: number
}

// Invoice expiry status
export interface InvoiceExpiryStatus {
  isExpired: boolean
  secondsUntilExpiry: number
  expiryTimestamp: number
}
