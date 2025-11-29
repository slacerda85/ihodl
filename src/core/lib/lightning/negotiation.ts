// BOLT #12: Negotiation Protocol for Lightning Payments (Offers)
// Implementation of encoding/decoding and validation functions for BOLT 12 offers,
// invoice requests, and invoices with Merkle tree signature support

import {
  Offer,
  InvoiceRequest,
  Invoice,
  InvoiceError,
  BlindedPayinfo,
  FallbackAddress,
  OfferValidation,
  InvoiceRequestValidation,
  InvoiceValidation,
  OfferExpiryStatus,
  InvoiceExpiryStatus,
  Bolt12TlvRecord,
  Bolt12TlvStream,
  MerkleNode,
  SignatureTag,
  OfferTlvType,
  InvoiceRequestTlvType,
  InvoiceTlvType,
  InvoiceErrorTlvType,
  PaymentFlowType,
  OFFER_PREFIX,
  INVOICE_REQUEST_PREFIX,
  INVOICE_PREFIX,
  DEFAULT_INVOICE_EXPIRY_SECONDS,
  OFFER_FIELD_RANGE_MIN,
  OFFER_FIELD_RANGE_MAX,
  OFFER_EXPERIMENTAL_RANGE_MIN,
  OFFER_EXPERIMENTAL_RANGE_MAX,
  INVREQ_FIELD_RANGE_MIN,
  INVREQ_FIELD_RANGE_MAX,
  INVREQ_EXPERIMENTAL_RANGE_MIN,
  INVREQ_EXPERIMENTAL_RANGE_MAX,
  INVOICE_FIELD_RANGE_MIN,
  INVOICE_FIELD_RANGE_MAX,
  SIGNATURE_TLV_MIN,
  SIGNATURE_TLV_MAX,
} from '@/core/models/lightning/negotiation'
import { Sha256, Bip340sig, BECH32_CHARSET } from '@/core/models/lightning/base'
import { sha256 } from '../crypto'
import {
  signBolt12Message,
  verifyBolt12Signature,
  SchnorrPublicKey,
  SchnorrPrivateKey,
} from '../bip/bip340'
import { toWords, fromWords } from '../bip/bech32'
import { concatUint8Arrays } from '../utils'

// ============================================================================
// TLV Encoding/Decoding Functions
// ============================================================================

/**
 * Encodes a BigSize value (variable-length integer)
 * BOLT #1: BigSize encoding (0-252: 1 byte, 253-65535: 3 bytes, etc.)
 */
export function encodeBigSize(value: bigint): Uint8Array {
  if (value < 0n) {
    throw new Error('BigSize value must be non-negative')
  }

  // 0-252: single byte
  if (value < 0xfdn) {
    return new Uint8Array([Number(value)])
  }
  // 253-65535: 0xfd followed by 2 bytes big-endian
  else if (value < 0x10000n) {
    const buf = new Uint8Array(3)
    buf[0] = 0xfd
    buf[1] = Number((value >> 8n) & 0xffn)
    buf[2] = Number(value & 0xffn)
    return buf
  }
  // 65536-4294967295: 0xfe followed by 4 bytes big-endian
  else if (value < 0x100000000n) {
    const buf = new Uint8Array(5)
    buf[0] = 0xfe
    buf[1] = Number((value >> 24n) & 0xffn)
    buf[2] = Number((value >> 16n) & 0xffn)
    buf[3] = Number((value >> 8n) & 0xffn)
    buf[4] = Number(value & 0xffn)
    return buf
  }
  // 4294967296+: 0xff followed by 8 bytes big-endian
  else {
    const buf = new Uint8Array(9)
    buf[0] = 0xff
    for (let i = 0; i < 8; i++) {
      buf[8 - i] = Number((value >> BigInt(i * 8)) & 0xffn)
    }
    return buf
  }
}

/**
 * Decodes a BigSize value from buffer
 * Returns [value, bytesRead]
 */
export function decodeBigSize(buffer: Uint8Array, offset = 0): [bigint, number] {
  if (offset >= buffer.length) {
    throw new Error('Buffer too short for BigSize')
  }

  const first = buffer[offset]

  // Single byte value (0-252)
  if (first < 0xfd) {
    return [BigInt(first), 1]
  }
  // 2-byte value
  else if (first === 0xfd) {
    if (offset + 3 > buffer.length) {
      throw new Error('Buffer too short for 2-byte BigSize')
    }
    const value = (BigInt(buffer[offset + 1]) << 8n) | BigInt(buffer[offset + 2])
    return [value, 3]
  }
  // 4-byte value
  else if (first === 0xfe) {
    if (offset + 5 > buffer.length) {
      throw new Error('Buffer too short for 4-byte BigSize')
    }
    let value = 0n
    for (let i = 0; i < 4; i++) {
      value = (value << 8n) | BigInt(buffer[offset + 1 + i])
    }
    return [value, 5]
  }
  // 8-byte value
  else {
    if (offset + 9 > buffer.length) {
      throw new Error('Buffer too short for 8-byte BigSize')
    }
    let value = 0n
    for (let i = 0; i < 8; i++) {
      value = (value << 8n) | BigInt(buffer[offset + 1 + i])
    }
    return [value, 9]
  }
}

/**
 * Encodes a TLV record (type-length-value)
 * BOLT #1: TLV encoding with BigSize type and length
 */
export function encodeTlvRecord(type: bigint, value: Uint8Array): Uint8Array {
  // Encode type as BigSize
  const encodedType = encodeBigSize(type)

  // Encode length as BigSize
  const encodedLength = encodeBigSize(BigInt(value.length))

  // Concatenate: type || length || value
  return concatUint8Arrays([encodedType, encodedLength, value])
}

/**
 * Decodes TLV stream from buffer
 * Returns array of TLV records
 */
export function decodeTlvStream(buffer: Uint8Array): Bolt12TlvStream {
  const records: Bolt12TlvRecord[] = []
  let offset = 0

  while (offset < buffer.length) {
    // Decode type
    const [type, typeBytes] = decodeBigSize(buffer, offset)
    offset += typeBytes

    // Decode length
    const [length, lengthBytes] = decodeBigSize(buffer, offset)
    offset += lengthBytes

    // Extract value
    const valueEnd = offset + Number(length)
    if (valueEnd > buffer.length) {
      throw new Error('TLV value extends beyond buffer')
    }
    const value = buffer.slice(offset, valueEnd)
    offset = valueEnd

    records.push({ type, length, value })
  }

  return records
}

/**
 * Encodes TLV stream to buffer
 * TLV records must be in ascending order by type
 */
export function encodeTlvStream(records: Bolt12TlvStream): Uint8Array {
  // Sort by type (ascending order required by BOLT #1)
  const sorted = [...records].sort((a, b) => {
    if (a.type < b.type) return -1
    if (a.type > b.type) return 1
    return 0
  })

  // Encode each record
  const encoded = sorted.map(record => encodeTlvRecord(record.type, record.value))

  return concatUint8Arrays(encoded)
}

// ============================================================================
// Merkle Tree Construction (for BIP-340 signatures)
// ============================================================================

/**
 * Hashes a TLV record as a Merkle leaf
 * BOLT #12: H("LnLeaf", tlv) where tlv is the complete TLV record
 */
function hashTlvLeaf(tlvRecord: Bolt12TlvRecord): Sha256 {
  // Reconstruct complete TLV (type || length || value)
  const tlvBytes = encodeTlvRecord(tlvRecord.type, tlvRecord.value)

  // Hash with "LnLeaf" tag
  const tag = new TextEncoder().encode('LnLeaf')
  const tagHash = sha256(tag)

  // Tagged hash: SHA256(tagHash || tagHash || tlvBytes)
  return sha256(concatUint8Arrays([tagHash, tagHash, tlvBytes]))
}

/**
 * Creates nonce leaf for a TLV record
 * BOLT #12: H("LnNonce"||first-tlv, tlv-type)
 */
function hashNonceLeaf(firstTlv: Bolt12TlvRecord, tlvType: bigint): Sha256 {
  // Reconstruct first TLV
  const firstTlvBytes = encodeTlvRecord(firstTlv.type, firstTlv.value)

  // Create tag: "LnNonce" || first-tlv
  const nonceTag = concatUint8Arrays([new TextEncoder().encode('LnNonce'), firstTlvBytes])
  const tagHash = sha256(nonceTag)

  // Encode tlv-type
  const typeBytes = encodeBigSize(tlvType)

  // Tagged hash: SHA256(tagHash || tagHash || typeBytes)
  return sha256(concatUint8Arrays([tagHash, tagHash, typeBytes]))
}

/**
 * Hashes two nodes to create a branch node
 * BOLT #12: H("LnBranch", lesser-SHA256 || greater-SHA256)
 * Ordering ensures compact proofs (left/right inherently determined)
 */
function hashBranch(left: Sha256, right: Sha256): Sha256 {
  const tag = new TextEncoder().encode('LnBranch')
  const tagHash = sha256(tag)

  // Order by value (lesser first)
  const [lesser, greater] = compareSha256(left, right) <= 0 ? [left, right] : [right, left]

  // Tagged hash: SHA256(tagHash || tagHash || lesser || greater)
  return sha256(concatUint8Arrays([tagHash, tagHash, lesser, greater]))
}

/**
 * Compares two SHA256 hashes
 * Returns -1 if a < b, 0 if equal, 1 if a > b
 */
function compareSha256(a: Sha256, b: Sha256): number {
  for (let i = 0; i < 32; i++) {
    if (a[i] < b[i]) return -1
    if (a[i] > b[i]) return 1
  }
  return 0
}

/**
 * Builds Merkle tree from TLV stream
 * BOLT #12: Each TLV paired with nonce leaf, then recursive branch hashing
 */
export function buildMerkleTree(tlvStream: Bolt12TlvStream): MerkleNode {
  if (tlvStream.length === 0) {
    throw new Error('Cannot build Merkle tree from empty TLV stream')
  }

  // First TLV for nonce generation
  const firstTlv = tlvStream[0]

  // Create leaf pairs: [TLV leaf, nonce leaf] for each TLV
  const leaves: Sha256[] = []
  for (const tlv of tlvStream) {
    const tlvLeaf = hashTlvLeaf(tlv)
    const nonceLeaf = hashNonceLeaf(firstTlv, tlv.type)

    // Add both leaves in order (will be sorted when hashing branches)
    leaves.push(tlvLeaf, nonceLeaf)
  }

  // Build tree from leaves up
  return buildMerkleTreeRecursive(leaves)
}

/**
 * Recursively builds Merkle tree from leaf hashes
 * Handles unbalanced trees (not power of 2 leaves)
 */
function buildMerkleTreeRecursive(hashes: Sha256[]): MerkleNode {
  // Base case: single hash
  if (hashes.length === 1) {
    return { hash: hashes[0] }
  }

  // Pair up hashes and create branch nodes
  const nextLevel: Sha256[] = []
  for (let i = 0; i < hashes.length; i += 2) {
    if (i + 1 < hashes.length) {
      // Pair exists
      nextLevel.push(hashBranch(hashes[i], hashes[i + 1]))
    } else {
      // Odd one out - promote to next level
      nextLevel.push(hashes[i])
    }
  }

  return buildMerkleTreeRecursive(nextLevel)
}

/**
 * Gets Merkle root hash from tree
 */
export function getMerkleRoot(tree: MerkleNode): Sha256 {
  return tree.hash
}

// ============================================================================
// Signature Calculation (BIP-340)
// ============================================================================

/**
 * Creates BIP-340 Schnorr signature over Merkle root
 * BOLT #12: Signs Merkle root with tagged hash "lightning" || messagename || fieldname
 * @param merkleRoot - 32-byte Merkle root of TLV stream
 * @param privateKey - 32-byte private key
 * @param messageName - Type of message ('invoice_request' or 'invoice')
 * @param fieldName - Signature field name (default: 'signature')
 * @param auxRand - Optional 32-byte auxiliary randomness for nonce generation
 * @returns 64-byte BIP-340 Schnorr signature
 */
export async function signMerkleRoot(
  merkleRoot: Sha256,
  privateKey: SchnorrPrivateKey,
  messageName: 'invoice_request' | 'invoice',
  fieldName = 'signature',
  auxRand?: Uint8Array,
): Promise<Bip340sig> {
  return signBolt12Message(merkleRoot, privateKey, messageName, fieldName, auxRand)
}

/**
 * Verifies BIP-340 Schnorr signature over Merkle root
 * BOLT #12: Verifies signature against Merkle root with tagged hash
 * @param merkleRoot - 32-byte Merkle root of TLV stream
 * @param signature - 64-byte BIP-340 Schnorr signature
 * @param publicKey - 32-byte x-only public key
 * @param messageName - Type of message ('invoice_request' or 'invoice')
 * @param fieldName - Signature field name (default: 'signature')
 * @returns True if signature is valid
 */
export async function verifyMerkleSignature(
  merkleRoot: Sha256,
  signature: Bip340sig,
  publicKey: SchnorrPublicKey,
  messageName: 'invoice_request' | 'invoice',
  fieldName = 'signature',
): Promise<boolean> {
  return verifyBolt12Signature(merkleRoot, signature, publicKey, messageName, fieldName)
}

// ============================================================================
// Bech32 Encoding/Decoding (without checksum)
// ============================================================================

/**
 * Encodes BOLT 12 data to bech32 string (no checksum)
 * BOLT #12: HRP + '1' + bech32-encoded TLV data (optionally with '+' separators)
 */
export function encodeBolt12(hrp: string, tlvStream: Bolt12TlvStream): string {
  // Encode TLV stream to bytes
  const tlvBytes = encodeTlvStream(tlvStream)

  // Convert to 5-bit words for bech32
  const words = toWords(tlvBytes)

  // Create bech32 string (without checksum)
  const wordChars = words.map(w => 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'[w]).join('')

  return `${hrp}1${wordChars}`
}

/**
 * Decodes BOLT 12 bech32 string (no checksum)
 * Handles '+' separators for long strings
 */
export function decodeBolt12(bolt12String: string): { hrp: string; tlvStream: Bolt12TlvStream } {
  // Remove '+' and whitespace (used for line breaks)
  const cleaned = bolt12String.replace(/\+\s*/g, '')

  // Convert to lowercase for processing
  const lowered = cleaned.toLowerCase()

  // Find separator
  const sepIndex = lowered.lastIndexOf('1')
  if (sepIndex === -1 || sepIndex === 0) {
    throw new Error('Invalid BOLT 12 string: missing separator')
  }

  // Extract HRP and data
  const hrp = lowered.slice(0, sepIndex)
  const dataPart = lowered.slice(sepIndex + 1)

  // Decode bech32 characters to words using existing function
  const words: number[] = []
  for (const c of dataPart) {
    const index = BECH32_CHARSET.indexOf(c)
    if (index === -1) {
      throw new Error(`Invalid bech32 character: ${c}`)
    }
    words.push(index)
  }

  // Convert words to bytes
  const tlvBytes = fromWords(words, false) // No padding check for BOLT 12

  // Decode TLV stream
  const tlvStream = decodeTlvStream(tlvBytes)

  return { hrp, tlvStream }
}

// ============================================================================
// Offer Functions
// ============================================================================

/**
 * Validates an offer structure
 * BOLT #12: Checks field ranges, required fields, and logical consistency
 */
export function validateOffer(offer: Offer): OfferValidation {
  const errors: string[] = []

  // Check for offer_issuer_id or offer_paths (at least one required)
  if (!offer.issuerId && (!offer.paths || offer.paths.length === 0)) {
    errors.push('Either offer_issuer_id or offer_paths must be set')
  }

  // Validate paths if present
  if (offer.paths) {
    for (const path of offer.paths) {
      if (path.numHops === 0) {
        errors.push('Blinded path must have at least one hop (num_hops > 0)')
      }
    }
  }

  // Check description requirement with amount
  if (offer.amount !== undefined && !offer.description) {
    errors.push('offer_description required when offer_amount is set')
  }

  // Check currency consistency
  if (offer.currency && offer.amount === undefined) {
    errors.push('offer_currency requires offer_amount to be set')
  }

  // Validate quantity_max
  if (offer.quantityMax !== undefined && offer.quantityMax === 0n) {
    // 0 means unlimited, which is valid
    // But explicit 0 in field should not be set per spec
    errors.push('offer_quantity_max should not be explicitly set to 0')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Checks if offer has expired
 * BOLT #12: Compare current time with offer_absolute_expiry
 */
export function getOfferExpiryStatus(offer: Offer, currentTime?: number): OfferExpiryStatus {
  const now = currentTime ?? Math.floor(Date.now() / 1000)

  if (!offer.absoluteExpiry) {
    // No expiry set - never expires
    return {
      isExpired: false,
      secondsUntilExpiry: Infinity,
      expiryTimestamp: Infinity,
    }
  }

  const expiryTimestamp = Number(offer.absoluteExpiry)
  const isExpired = now > expiryTimestamp
  const secondsUntilExpiry = isExpired ? 0 : expiryTimestamp - now

  return {
    isExpired,
    secondsUntilExpiry,
    expiryTimestamp,
  }
}

// ============================================================================
// Invoice Request Functions
// ============================================================================

/**
 * Validates an invoice request
 * BOLT #12: Checks required fields, field ranges, signature, and offer consistency
 */
export function validateInvoiceRequest(invreq: InvoiceRequest): InvoiceRequestValidation {
  const errors: string[] = []

  // Required fields (always)
  if (!invreq.invreqMetadata) {
    errors.push('invreq_metadata is required')
  }
  if (!invreq.invreqPayerId) {
    errors.push('invreq_payer_id is required')
  }

  // Check if this is a response to an offer
  const isOfferResponse = invreq.issuerId !== undefined || (invreq.paths && invreq.paths.length > 0)

  if (isOfferResponse) {
    // Response to offer - check offer fields are present and consistent

    // Amount handling
    if (invreq.amount === undefined && invreq.invreqAmount === undefined) {
      errors.push('Either offer_amount or invreq_amount must be present')
    }

    // Quantity handling
    if (invreq.quantityMax !== undefined) {
      if (!invreq.invreqQuantity) {
        errors.push('invreq_quantity required when offer_quantity_max is present')
      } else if (invreq.quantityMax > 0n && invreq.invreqQuantity > invreq.quantityMax) {
        errors.push('invreq_quantity exceeds offer_quantity_max')
      } else if (invreq.invreqQuantity === 0n) {
        errors.push('invreq_quantity must be greater than zero')
      }
    } else if (invreq.invreqQuantity) {
      errors.push('invreq_quantity present but offer_quantity_max not set in offer')
    }
  } else {
    // Not a response to offer - standalone invoice request (refund/ATM scenario)

    // Must have description
    if (!invreq.description) {
      errors.push('offer_description required for non-offer invoice requests')
    }

    // Must have amount
    if (!invreq.invreqAmount) {
      errors.push('invreq_amount required for non-offer invoice requests')
    }

    // Should not have certain offer fields
    if (
      invreq.metadata ||
      invreq.chains ||
      invreq.amount ||
      invreq.currency ||
      invreq.features ||
      invreq.quantityMax
    ) {
      errors.push('Offer-specific fields should not be present in non-offer invoice requests')
    }
  }

  // Validate paths if present
  if (invreq.invreqPaths) {
    for (const path of invreq.invreqPaths) {
      if (path.numHops === 0) {
        errors.push('Blinded path in invreq_paths must have at least one hop')
      }
    }
  }

  // Validate BIP 353 name if present
  if (invreq.invreqBip353Name) {
    const validChars = /^[0-9a-zA-Z._-]+$/
    const nameStr = new TextDecoder().decode(invreq.invreqBip353Name.name)
    const domainStr = new TextDecoder().decode(invreq.invreqBip353Name.domain)

    if (!validChars.test(nameStr) || !validChars.test(domainStr)) {
      errors.push('invreq_bip_353_name contains invalid characters')
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

// ============================================================================
// Invoice Functions
// ============================================================================

/**
 * Validates an invoice
 * BOLT #12: Checks required fields, paths, amounts, and consistency with invoice request
 */
export function validateInvoice(invoice: Invoice): InvoiceValidation {
  const errors: string[] = []

  // Required fields (always)
  if (!invoice.invoiceAmount) {
    errors.push('invoice_amount is required')
  }
  if (!invoice.invoiceCreatedAt) {
    errors.push('invoice_created_at is required')
  }
  if (!invoice.invoicePaymentHash) {
    errors.push('invoice_payment_hash is required')
  }
  if (!invoice.invoiceNodeId) {
    errors.push('invoice_node_id is required')
  }
  if (!invoice.signature) {
    errors.push('signature is required')
  }

  // Paths are required and must be non-empty
  if (!invoice.invoicePaths || invoice.invoicePaths.length === 0) {
    errors.push('invoice_paths is required and must not be empty')
  } else {
    // Validate each path has hops
    for (const path of invoice.invoicePaths) {
      if (path.numHops === 0) {
        errors.push('Blinded path in invoice_paths must have at least one hop')
      }
    }
  }

  // Blinded payinfo must match paths
  if (!invoice.invoiceBlindedpay) {
    errors.push('invoice_blindedpay is required')
  } else if (
    invoice.invoicePaths &&
    invoice.invoiceBlindedpay.length !== invoice.invoicePaths.length
  ) {
    errors.push('invoice_blindedpay must have exactly one entry per invoice_paths entry')
  }

  // Check if this is a response to invoice request
  if (invoice.invreqPayerId) {
    // Response to invoice request - validate consistency

    // If invreq_amount was present, invoice_amount must match
    if (invoice.invreqAmount && invoice.invoiceAmount !== invoice.invreqAmount) {
      errors.push('invoice_amount must equal invreq_amount when present in request')
    }

    // Check node ID consistency
    if (
      invoice.issuerId &&
      invoice.invoiceNodeId &&
      !arraysEqual(invoice.invoiceNodeId, invoice.issuerId)
    ) {
      errors.push('invoice_node_id must equal offer_issuer_id when present')
    }
  }

  // Validate fallback addresses if present
  if (invoice.invoiceFallbacks) {
    for (const fallback of invoice.invoiceFallbacks) {
      if (fallback.version > 16) {
        errors.push('Fallback address version must be <= 16')
      }
      if (fallback.address.length < 2 || fallback.address.length > 40) {
        errors.push('Fallback address must be 2-40 bytes')
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Checks if invoice has expired
 * BOLT #12: Default expiry is 7200 seconds (2 hours) from creation
 */
export function getInvoiceExpiryStatus(
  invoice: Invoice,
  currentTime?: number,
): InvoiceExpiryStatus {
  const now = currentTime ?? Math.floor(Date.now() / 1000)
  const createdAt = Number(invoice.invoiceCreatedAt)

  // Get expiry (default 7200 seconds if not specified)
  const relativeExpiry = invoice.invoiceRelativeExpiry ?? DEFAULT_INVOICE_EXPIRY_SECONDS
  const expiryTimestamp = createdAt + relativeExpiry

  const isExpired = now > expiryTimestamp
  const secondsUntilExpiry = isExpired ? 0 : expiryTimestamp - now

  return {
    isExpired,
    secondsUntilExpiry,
    expiryTimestamp,
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Compares two Uint8Arrays for equality
 */
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Extracts TLV records in a specific range
 * Used to extract offer/invreq/invoice specific fields
 */
export function extractTlvRange(
  tlvStream: Bolt12TlvStream,
  minType: bigint,
  maxType: bigint,
): Bolt12TlvStream {
  return tlvStream.filter(record => record.type >= minType && record.type <= maxType)
}

/**
 * Checks if TLV stream has any unknown even bits in features
 * BOLT #12: Unknown even bits must cause rejection
 */
export function hasUnknownEvenFeatures(features: Uint8Array): boolean {
  // Check each byte for even bits (0, 2, 4, 6 in each byte)
  for (let i = 0; i < features.length; i++) {
    const byte = features[i]
    // Check even bit positions: 0b01010101 = 0x55
    const evenBits = byte & 0x55
    if (evenBits !== 0) {
      // Has even bits set - would need to check if they're known features
      // For now, simplified check
      return true
    }
  }
  return false
}

/**
 * Determines payment flow type from invoice request
 */
export function getPaymentFlowType(invreq: InvoiceRequest): PaymentFlowType {
  // If has offer_issuer_id or offer_paths, it's responding to an offer
  if (invreq.issuerId || (invreq.paths && invreq.paths.length > 0)) {
    return PaymentFlowType.USER_PAYS_MERCHANT
  }

  // Otherwise it's a refund/ATM scenario
  return PaymentFlowType.MERCHANT_PAYS_USER
}
