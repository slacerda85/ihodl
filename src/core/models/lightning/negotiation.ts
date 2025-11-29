// BOLT #12: Negotiation Protocol for Lightning Payments (Offers)
// Based on https://github.com/lightning/bolts/blob/master/12-offer-encoding.md

import {
  Byte,
  U16,
  U32,
  U64,
  Tu32,
  Tu64,
  BigSize,
  ChainHash,
  Sha256,
  Bip340sig,
  Point,
  Utf8,
} from './base'
import { BlindedPath } from './routing'

// ============================================================================
// Constants
// ============================================================================

export const OFFER_PREFIX = 'lno' // Human-readable prefix for offers
export const INVOICE_REQUEST_PREFIX = 'lnr' // Human-readable prefix for invoice requests
export const INVOICE_PREFIX = 'lni' // Human-readable prefix for invoices (BOLT 12)

export const DEFAULT_INVOICE_EXPIRY_SECONDS = 7200 // 2 hours

// TLV Field Ranges
export const OFFER_FIELD_RANGE_MIN = 1
export const OFFER_FIELD_RANGE_MAX = 79
export const OFFER_EXPERIMENTAL_RANGE_MIN = 1000000000
export const OFFER_EXPERIMENTAL_RANGE_MAX = 1999999999

export const INVREQ_FIELD_RANGE_MIN = 0
export const INVREQ_FIELD_RANGE_MAX = 159
export const INVREQ_EXPERIMENTAL_RANGE_MIN = 1000000000
export const INVREQ_EXPERIMENTAL_RANGE_MAX = 2999999999

export const INVOICE_FIELD_RANGE_MIN = 0
export const INVOICE_FIELD_RANGE_MAX = 159
export const INVOICE_EXPERIMENTAL_RANGE_MIN = 1000000000
export const INVOICE_EXPERIMENTAL_RANGE_MAX = 2999999999

// Signature TLV range
export const SIGNATURE_TLV_MIN = 240
export const SIGNATURE_TLV_MAX = 1000

// ============================================================================
// Offer TLV Types
// ============================================================================

export enum OfferTlvType {
  OFFER_CHAINS = 2,
  OFFER_METADATA = 4,
  OFFER_CURRENCY = 6,
  OFFER_AMOUNT = 8,
  OFFER_DESCRIPTION = 10,
  OFFER_FEATURES = 12,
  OFFER_ABSOLUTE_EXPIRY = 14,
  OFFER_PATHS = 16,
  OFFER_ISSUER = 18,
  OFFER_QUANTITY_MAX = 20,
  OFFER_ISSUER_ID = 22,
}

// ============================================================================
// Invoice Request TLV Types
// ============================================================================

export enum InvoiceRequestTlvType {
  // Invoice Request specific fields (80-159)
  INVREQ_METADATA = 0,
  INVREQ_CHAIN = 80,
  INVREQ_AMOUNT = 82,
  INVREQ_FEATURES = 84,
  INVREQ_QUANTITY = 86,
  INVREQ_PAYER_ID = 88,
  INVREQ_PAYER_NOTE = 89,
  INVREQ_PATHS = 90,
  INVREQ_BIP_353_NAME = 91,
  SIGNATURE = 240,
}

// ============================================================================
// Invoice TLV Types
// ============================================================================

export enum InvoiceTlvType {
  // Invoice specific fields (160-239)
  INVOICE_PATHS = 160,
  INVOICE_BLINDEDPAY = 162,
  INVOICE_CREATED_AT = 164,
  INVOICE_RELATIVE_EXPIRY = 166,
  INVOICE_PAYMENT_HASH = 168,
  INVOICE_AMOUNT = 170,
  INVOICE_FALLBACKS = 172,
  INVOICE_FEATURES = 174,
  INVOICE_NODE_ID = 176,
  SIGNATURE = 240,
}

// ============================================================================
// Invoice Error TLV Types
// ============================================================================

export enum InvoiceErrorTlvType {
  ERRONEOUS_FIELD = 1,
  SUGGESTED_VALUE = 3,
  ERROR = 5,
}

// ============================================================================
// Invoice Features (BOLT 12 specific)
// ============================================================================

export enum InvoiceFeatureBits {
  MPP_COMPULSORY = 16, // Multi-part-payment required
  MPP_OPTIONAL = 17, // Multi-part-payment optional
}

// ============================================================================
// Offer Structure
// ============================================================================

export interface Offer {
  // Chains the offer is valid for (bitcoin if omitted)
  chains?: ChainHash[]

  // Metadata for merchant's use (can contain auth cookie)
  metadata?: Uint8Array

  // Currency code (ISO 4217) if not lightning-payable units
  currency?: Utf8 // ISO 4217 three-letter code (e.g., 'USD')

  // Amount expected per item (in currency or msat)
  amount?: Tu64

  // Description of purpose of payment
  description?: Utf8

  // Bitmap of BOLT 12 features
  features?: Uint8Array

  // Expiry time (seconds since Unix epoch)
  absoluteExpiry?: Tu64

  // Paths to reach the node (for private channels)
  paths?: BlindedPath[]

  // Issuer identification (e.g., "user@domain" or "domain")
  issuer?: Utf8

  // Maximum quantity per invoice (0 = unlimited)
  quantityMax?: Tu64

  // Public key to request invoice from (omitted if paths present)
  issuerId?: Point
}

// ============================================================================
// Invoice Request Structure
// ============================================================================

export interface InvoiceRequest {
  // ========================================================================
  // Mirrored Offer Fields (0-79)
  // ========================================================================

  chains?: ChainHash[]
  metadata?: Uint8Array // offer_metadata
  currency?: Utf8
  amount?: Tu64 // offer_amount
  description?: Utf8
  features?: Uint8Array // offer_features
  absoluteExpiry?: Tu64
  paths?: BlindedPath[] // offer_paths
  issuer?: Utf8
  quantityMax?: Tu64
  issuerId?: Point

  // ========================================================================
  // Invoice Request Specific Fields (0, 80-159)
  // ========================================================================

  // Unpredictable metadata for payer (MUST be present, type 0)
  invreqMetadata: Uint8Array

  // Chain for the invoice (bitcoin if omitted)
  invreqChain?: ChainHash

  // Amount in msat (may override offer_amount)
  invreqAmount?: Tu64

  // Bitmap of BOLT 12 invoice request features
  invreqFeatures?: Uint8Array

  // Quantity requested (required if offer_quantity_max present)
  invreqQuantity?: Tu64

  // Transient public key for payer (MUST be present)
  invreqPayerId: Point

  // Optional note from payer
  invreqPayerNote?: Utf8

  // Paths to reach the payer (for refunds/ATM scenarios)
  invreqPaths?: BlindedPath[]

  // BIP 353 name resolution info
  invreqBip353Name?: {
    name: Uint8Array
    domain: Uint8Array
  }

  // ========================================================================
  // Signature (240-1000)
  // ========================================================================

  // BIP-340 signature over Merkle root
  signature?: Bip340sig
}

// ============================================================================
// Invoice Structure
// ============================================================================

export interface Invoice {
  // ========================================================================
  // Mirrored Offer Fields (0-79)
  // ========================================================================

  chains?: ChainHash[]
  metadata?: Uint8Array // offer_metadata
  currency?: Utf8
  amount?: Tu64 // offer_amount
  description?: Utf8
  features?: Uint8Array // offer_features
  absoluteExpiry?: Tu64
  paths?: BlindedPath[] // offer_paths
  issuer?: Utf8
  quantityMax?: Tu64
  issuerId?: Point

  // ========================================================================
  // Mirrored Invoice Request Fields (0, 80-159)
  // ========================================================================

  invreqMetadata?: Uint8Array
  invreqChain?: ChainHash
  invreqAmount?: Tu64
  invreqFeatures?: Uint8Array
  invreqQuantity?: Tu64
  invreqPayerId?: Point
  invreqPayerNote?: Utf8
  invreqPaths?: BlindedPath[]
  invreqBip353Name?: {
    name: Uint8Array
    domain: Uint8Array
  }

  // ========================================================================
  // Invoice Specific Fields (160-239)
  // ========================================================================

  // Blinded paths to the recipient (MUST be present and non-empty)
  invoicePaths: BlindedPath[]

  // Payment info for each blinded path (MUST match invoicePaths length)
  invoiceBlindedpay: BlindedPayinfo[]

  // Creation timestamp (seconds since Unix epoch, MUST be present)
  invoiceCreatedAt: Tu64

  // Relative expiry (seconds from creation, default 7200)
  invoiceRelativeExpiry?: Tu32

  // Payment hash (SHA256 of payment preimage, MUST be present)
  invoicePaymentHash: Sha256

  // Amount to pay in msat (MUST be present)
  invoiceAmount: Tu64

  // Fallback onchain addresses
  invoiceFallbacks?: FallbackAddress[]

  // Bitmap of BOLT 12 invoice features
  invoiceFeatures?: Uint8Array

  // Node ID to pay (MUST be present)
  invoiceNodeId: Point

  // ========================================================================
  // Signature (240-1000)
  // ========================================================================

  // BIP-340 signature over Merkle root
  signature: Bip340sig
}

// ============================================================================
// Invoice Error Structure
// ============================================================================

export interface InvoiceError {
  // TLV field number that had a problem
  erroneousField?: Tu64

  // Suggested value for the erroneous field
  suggestedValue?: Uint8Array

  // Explanatory error message (MUST be present)
  error: Utf8
}

// ============================================================================
// Supporting Structures
// ============================================================================

/**
 * Blinded payment info (aggregated fees and CLTV for blinded path)
 */
export interface BlindedPayinfo {
  feeBaseMsat: U32
  feeProportionalMillionths: U32
  cltvExpiryDelta: U16
  htlcMinimumMsat: U64
  htlcMaximumMsat: U64
  features: Uint8Array
}

/**
 * Fallback onchain address
 */
export interface FallbackAddress {
  version: Byte // Witness version (0-16)
  address: Uint8Array // 2-40 bytes witness program
}

// ============================================================================
// Merkle Tree Structures (for signature calculation)
// ============================================================================

/**
 * Merkle leaf types for signature calculation
 */
export enum MerkleLeafType {
  LN_LEAF = 'LnLeaf',
  LN_NONCE = 'LnNonce',
  LN_BRANCH = 'LnBranch',
}

/**
 * Merkle tree node for signature calculation
 */
export interface MerkleNode {
  hash: Sha256
  left?: MerkleNode
  right?: MerkleNode
}

/**
 * Signature tag components
 * Format: "lightning" || messagename || fieldname
 */
export interface SignatureTag {
  prefix: 'lightning' // Literal 9-byte ASCII string
  messageName: 'invoice_request' | 'invoice' // TLV stream name
  fieldName: string // TLV field name (e.g., "signature")
}

// ============================================================================
// Encoding/Decoding Helpers
// ============================================================================

/**
 * Bech32-style encoding result (without checksum)
 */
export interface Bolt12Encoding {
  hrp: string // Human-readable prefix (lno, lnr, lni)
  data: Uint8Array // Bech32-encoded TLV data
}

/**
 * TLV record for BOLT 12
 */
export interface Bolt12TlvRecord {
  type: BigSize
  length: BigSize
  value: Uint8Array
}

export type Bolt12TlvStream = Bolt12TlvRecord[]

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Offer validation result
 */
export interface OfferValidation {
  isValid: boolean
  errors: string[]
}

/**
 * Invoice request validation result
 */
export interface InvoiceRequestValidation {
  isValid: boolean
  errors: string[]
}

/**
 * Invoice validation result
 */
export interface InvoiceValidation {
  isValid: boolean
  errors: string[]
}

/**
 * Payment flow type
 */
export enum PaymentFlowType {
  USER_PAYS_MERCHANT = 'user_pays_merchant', // Normal offer flow
  MERCHANT_PAYS_USER = 'merchant_pays_user', // Refund/ATM flow
}

/**
 * Offer expiry status
 */
export interface OfferExpiryStatus {
  isExpired: boolean
  secondsUntilExpiry: number
  expiryTimestamp: number
}

/**
 * Invoice expiry status
 */
export interface InvoiceExpiryStatus {
  isExpired: boolean
  secondsUntilExpiry: number
  expiryTimestamp: number
}

// ============================================================================
// Payment Proof Types
// ============================================================================

/**
 * Payer proof (proves who requested the invoice)
 */
export interface PayerProof {
  invreqMetadata: Uint8Array
  invreqPayerId: Point
  signature: Bip340sig
}

/**
 * Merchant proof (selective field revelation via Merkle proofs)
 */
export interface MerchantProof {
  revealedFields: Bolt12TlvRecord[]
  merkleProof: Sha256[]
  signature: Bip340sig
}

// ============================================================================
// Currency Conversion
// ============================================================================

/**
 * Currency conversion info
 */
export interface CurrencyConversion {
  fromCurrency: Utf8 // ISO 4217 code
  toCurrency: Utf8 // ISO 4217 code or 'BTC'
  rate: number
  timestamp: number // Unix timestamp of conversion
}

/**
 * Amount with currency
 */
export interface AmountWithCurrency {
  amount: Tu64
  currency: Utf8 // ISO 4217 code or 'BTC' for bitcoin
  exponent: number // ISO 4217 exponent (e.g., 2 for USD cents)
}
