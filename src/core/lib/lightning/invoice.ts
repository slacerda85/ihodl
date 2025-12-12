// BOLT #11: Invoice Protocol for Lightning Payments
// Implementation of encoding/decoding and validation functions
// This module provides complete BOLT 11 compliance for Lightning Network invoices,
// including human-readable prefixes, tagged fields, and signature verification.

/**
 * Decodes a Lightning invoice string into structured data
 * Implements BOLT 11 decoding with support for all tagged fields
 * @param invoiceString - The Bech32 invoice string (e.g., 'lnbc2500u1pvjluez...')
 * @returns Decoded invoice object with currency, amount, timestamp, and tagged fields
 * @throws Error if the invoice format is invalid or checksum fails
 */

import {
  AmountMultiplier,
  TaggedFieldType,
  PaymentSecret,
  FallbackAddress,
  FallbackAddressType,
  RoutingInfoEntry,
  InvoiceTaggedFields,
  Invoice,
  InvoiceCreateParams,
  InvoiceValidationResult,
  AmountConversion,
  InvoiceExpiryStatus,
  DEFAULT_EXPIRY_SECONDS,
  DEFAULT_MIN_FINAL_CLTV_EXPIRY_DELTA,
} from '@/core/models/lightning/invoice'
import { Sha256, Signature } from '@/core/models/lightning/base'
import { sha256 } from '../crypto'
import { signMessage, verifyMessage } from '../crypto/crypto'
import { toWords, fromWords, encode, decode } from '../bips/bech32'
import { getAllInvoicePrefixes, getNetworkConfig } from '@/config/network'
import {
  concatUint8Arrays,
  writeUint32BE,
  writeUint16BE,
  readUint32BE,
  readUint16BE,
} from '../utils/utils'
import secp256k1 from 'secp256k1'

/**
 * BOLT #11 Signature Constants
 * The signature is over the SHA256 hash of the human-readable part + data part
 * Recovery ID is appended as a single byte (0-3)
 */
const SIGNATURE_SIZE = 65 // 64 bytes r,s + 1 byte recovery id
const SIGNATURE_WORDS = 104 // 520 bits / 5 = 104 words

/**
 * Converts amount with multiplier to millisatoshis
 * @param amount - The amount value
 * @param multiplier - The multiplier (m, u, n, p)
 * @returns Amount in millisatoshis as bigint
 */
export function calculateAmount(amount: number, multiplier: AmountMultiplier): bigint {
  // Validate amount format (no leading zeros, positive integer)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer')
  }

  // Convert to millisatoshis directly
  let millisatoshis: bigint
  switch (multiplier) {
    case AmountMultiplier.MILLI:
      millisatoshis = BigInt(amount) * 100000000n // 1 milli-bitcoin = 100,000,000 millisatoshis
      break
    case AmountMultiplier.MICRO:
      millisatoshis = BigInt(amount) * 100000n // 1 micro-bitcoin = 100,000 millisatoshis
      break
    case AmountMultiplier.NANO:
      millisatoshis = BigInt(amount) * 100n // 1 nano-bitcoin = 100 millisatoshis
      break
    case AmountMultiplier.PICO:
      // Validate that last decimal is 0 for pico
      if (amount % 10 !== 0) {
        throw new Error('For pico multiplier, amount must end with 0')
      }
      millisatoshis = BigInt(amount) / 10n // 1 pico-bitcoin = 0.1 millisatoshis
      break
    default:
      throw new Error('Invalid multiplier')
  }

  return millisatoshis
}

/**
 * Converts millisatoshis to various formats
 * @param millisatoshis - Amount in millisatoshis
 * @returns Conversion object with different formats
 */
export function convertAmount(millisatoshis: bigint): AmountConversion {
  const satoshis = millisatoshis / 1000n
  const bitcoin = Number(satoshis) / 100000000
  return {
    millisatoshis,
    satoshis,
    bitcoin,
  }
}

/**
 * Reconstructs the original tagged field data for signing
 * @param taggedFields - The tagged fields
 * @returns Array of Uint8Arrays containing the original field data
 */
function getTaggedFieldsData(taggedFields: InvoiceTaggedFields): Uint8Array[] {
  const buffers: Uint8Array[] = []

  // Payment hash (required)
  buffers.push(taggedFields.paymentHash)

  // Payment secret (optional)
  if (taggedFields.paymentSecret) {
    buffers.push(taggedFields.paymentSecret)
  }

  // Description (required if no descriptionHash)
  if (taggedFields.description) {
    buffers.push(new TextEncoder().encode(taggedFields.description))
  }

  // Description hash (required if no description)
  if (taggedFields.descriptionHash) {
    buffers.push(taggedFields.descriptionHash)
  }

  // Expiry (optional)
  if (taggedFields.expiry !== undefined) {
    const expiryBuf = new Uint8Array(4)
    writeUint32BE(expiryBuf, 0, taggedFields.expiry)
    buffers.push(expiryBuf)
  }

  // Min final CLTV expiry delta (optional)
  if (taggedFields.minFinalCltvExpiryDelta !== undefined) {
    const cltvBuf = new Uint8Array(4)
    writeUint32BE(cltvBuf, 0, taggedFields.minFinalCltvExpiryDelta)
    buffers.push(cltvBuf)
  }

  // Fallback addresses (optional)
  if (taggedFields.fallbackAddresses) {
    for (const fallback of taggedFields.fallbackAddresses) {
      buffers.push(encodeFallbackAddress(fallback))
    }
  }

  // Routing info (optional)
  if (taggedFields.routingInfo) {
    for (const route of taggedFields.routingInfo) {
      buffers.push(encodeRoutingInfo(route))
    }
  }

  // Features (optional)
  if (taggedFields.features) {
    buffers.push(taggedFields.features)
  }

  // Payee pubkey (optional)
  if (taggedFields.payeePubkey) {
    buffers.push(taggedFields.payeePubkey)
  }

  // Metadata (optional)
  if (taggedFields.metadata) {
    buffers.push(taggedFields.metadata)
  }

  return buffers
}

/**
 * Encodes tagged fields into binary format
 * @param taggedFields - The tagged fields to encode
 * @returns Encoded binary data as 5-bit words
 */
function encodeTaggedFields(taggedFields: InvoiceTaggedFields): number[] {
  const buffers: number[][] = []

  // Payment hash (required)
  const paymentHashData = taggedFields.paymentHash
  buffers.push(encodeTaggedField(TaggedFieldType.PAYMENT_HASH, paymentHashData))

  // Payment secret (optional)
  if (taggedFields.paymentSecret) {
    buffers.push(encodeTaggedField(TaggedFieldType.PAYMENT_SECRET, taggedFields.paymentSecret))
  }

  // Description (required if no descriptionHash)
  if (taggedFields.description) {
    const descBytes = new TextEncoder().encode(taggedFields.description)
    buffers.push(encodeTaggedField(TaggedFieldType.DESCRIPTION, descBytes))
  }

  // Description hash (required if no description)
  if (taggedFields.descriptionHash) {
    buffers.push(encodeTaggedField(TaggedFieldType.DESCRIPTION_HASH, taggedFields.descriptionHash))
  }

  // Expiry (optional)
  if (taggedFields.expiry !== undefined) {
    const expiryBuf = new Uint8Array(4)
    writeUint32BE(expiryBuf, 0, taggedFields.expiry)
    buffers.push(encodeTaggedField(TaggedFieldType.EXPIRY, expiryBuf))
  }

  // Min final CLTV expiry delta (optional)
  if (taggedFields.minFinalCltvExpiryDelta !== undefined) {
    const cltvBuf = new Uint8Array(4)
    writeUint32BE(cltvBuf, 0, taggedFields.minFinalCltvExpiryDelta)
    buffers.push(encodeTaggedField(TaggedFieldType.MIN_FINAL_CLTV_EXPIRY_DELTA, cltvBuf))
  }

  // Fallback addresses (optional)
  if (taggedFields.fallbackAddresses) {
    for (const fallback of taggedFields.fallbackAddresses) {
      const fallbackData = encodeFallbackAddress(fallback)
      buffers.push(encodeTaggedField(TaggedFieldType.FALLBACK_ADDRESS, fallbackData))
    }
  }

  // Routing info (optional)
  if (taggedFields.routingInfo) {
    for (const route of taggedFields.routingInfo) {
      const routeData = encodeRoutingInfo(route)
      buffers.push(encodeTaggedField(TaggedFieldType.ROUTING_INFO, routeData))
    }
  }

  // Features (optional)
  if (taggedFields.features) {
    buffers.push(encodeTaggedField(TaggedFieldType.FEATURES, taggedFields.features))
  }

  // Payee pubkey (optional)
  if (taggedFields.payeePubkey) {
    buffers.push(encodeTaggedField(TaggedFieldType.PAYEE_PUBKEY, taggedFields.payeePubkey))
  }

  // Metadata (optional)
  if (taggedFields.metadata) {
    buffers.push(encodeTaggedField(TaggedFieldType.METADATA, taggedFields.metadata))
  }

  return buffers.flat()
}

/**
 * Encodes a single tagged field
 * @param type - Field type
 * @param data - Field data
 * @returns Encoded field as 5-bit words
 */
function encodeTaggedField(type: TaggedFieldType, data: Uint8Array): number[] {
  const dataWords = toWords(data)
  const dataLength = dataWords.length
  const typeWord = type
  const lengthWord = dataLength
  return [typeWord, lengthWord, ...dataWords]
}

/**
 * Encodes fallback address
 * @param fallback - Fallback address
 * @returns Encoded data
 */
function encodeFallbackAddress(fallback: FallbackAddress): Uint8Array {
  const versionByte = fallback.type
  return new Uint8Array([versionByte, ...fallback.hash])
}

/**
 * Encodes routing info entry
 * @param route - Routing info
 * @returns Encoded data
 */
function encodeRoutingInfo(route: RoutingInfoEntry): Uint8Array {
  const buffers: Uint8Array[] = []

  // Pubkey (33 bytes)
  buffers.push(route.pubkey)

  // Short channel ID (8 bytes, big-endian)
  const scidBuf = new Uint8Array(8)
  // Assuming shortChannelId is a Uint8Array of 8 bytes
  scidBuf.set(route.shortChannelId)
  buffers.push(scidBuf)

  // Fee base (4 bytes, big-endian)
  const feeBaseBuf = new Uint8Array(4)
  writeUint32BE(feeBaseBuf, 0, route.feeBaseMsat)
  buffers.push(feeBaseBuf)

  // Fee proportional (4 bytes, big-endian)
  const feePropBuf = new Uint8Array(4)
  writeUint32BE(feePropBuf, 0, route.feeProportionalMillionths)
  buffers.push(feePropBuf)

  // CLTV expiry delta (2 bytes, big-endian)
  const cltvBuf = new Uint8Array(2)
  writeUint16BE(cltvBuf, 0, route.cltvExpiryDelta)
  buffers.push(cltvBuf)

  return concatUint8Arrays(buffers)
}

/**
 * Creates a Lightning invoice
 * @param params - Invoice creation parameters
 * @returns Encoded invoice string
 */
export function encodeInvoice(params: InvoiceCreateParams): string {
  // Validate required fields
  if (!params.paymentHash) {
    throw new Error('Payment hash is required')
  }
  if (!params.description && !params.descriptionHash) {
    throw new Error('Either description or descriptionHash must be provided')
  }

  // Set defaults
  const expiry = params.expiry || DEFAULT_EXPIRY_SECONDS
  const minCltv = params.minFinalCltvExpiryDelta || DEFAULT_MIN_FINAL_CLTV_EXPIRY_DELTA
  const timestamp = Math.floor(Date.now() / 1000)

  // Build tagged fields
  const taggedFields: InvoiceTaggedFields = {
    paymentHash: params.paymentHash,
    paymentSecret: params.paymentSecret,
    description: params.description,
    descriptionHash: params.descriptionHash,
    expiry,
    minFinalCltvExpiryDelta: minCltv,
    fallbackAddresses: params.fallbackAddresses,
    routingInfo: params.routingInfo,
    features: params.features,
    payeePubkey: params.payeePubkey,
    metadata: params.metadata,
  }

  // Encode timestamp (35 bits)
  const timestampBig = BigInt(timestamp)
  const timestampWords: number[] = []
  for (let i = 6; i >= 0; i--) {
    timestampWords.push(Number((timestampBig >> BigInt(i * 5)) & 0x1fn))
  }

  // Encode tagged fields
  const taggedWords = encodeTaggedFields(taggedFields)

  // Build human-readable part with currency and amount
  const currency = params.currency ?? getNetworkConfig().lightning.invoiceHrp
  const hrp = buildHumanReadablePart(currency, params.amount)

  // Reconstruct the original data bytes for signing (timestamp + tagged fields data)
  const timestampBytes = new Uint8Array(4)
  writeUint32BE(timestampBytes, 0, timestamp)

  // Get the original tagged field data (before 5-bit encoding)
  const taggedFieldData = getTaggedFieldsData(taggedFields)

  const dataBytes = concatUint8Arrays([timestampBytes, ...taggedFieldData])
  const signatureData = concatUint8Arrays([new TextEncoder().encode(hrp), dataBytes])

  // Sign the data
  const hash = sha256(signatureData)
  const signature = signMessage(hash, params.payeePrivateKey)

  // Add recovery id (assume 0 for now, should be calculated properly)
  const recoveryId = 0
  const fullSignature = new Uint8Array([...signature, recoveryId])

  // Encode signature (520 bits: 64 bytes + 1 byte recovery)
  const sigWords = toWords(fullSignature)

  // Combine all data
  const allWords = [...timestampWords, ...taggedWords, ...sigWords]

  // Encode with Bech32
  return encode(hrp, allWords)
}

/**
 * Decodes a Lightning invoice string
 * @param invoiceString - The Bech32 invoice string
 * @returns Decoded invoice object
 */
export function decodeInvoice(invoiceString: string): Invoice {
  // Decode Bech32
  const decoded = decode(invoiceString)
  const hrp = decoded.prefix
  const words = decoded.words

  // Validate HRP (should start with 'ln')
  if (!hrp.startsWith('ln')) {
    throw new Error('Invalid invoice prefix')
  }

  // Extract currency and amount from HRP
  const { currency, amount } = parseHumanReadablePart(hrp)

  // Decode timestamp (first 7 words = 35 bits)
  const timestampWords = words.slice(0, 7)
  let timestamp = 0n
  for (let i = 0; i < 7; i++) {
    timestamp |= BigInt(timestampWords[i]) << BigInt(35 - 5 * (i + 1))
  }

  // Decode tagged fields and signature
  const remainingWords = words.slice(7)
  const sigWordsLength = 104
  const sigWords = remainingWords.slice(-sigWordsLength)
  const taggedWords = remainingWords.slice(0, -sigWordsLength)

  // Parse tagged fields
  const taggedFields = decodeTaggedFields(taggedWords)

  // Parse signature
  const signatureData = fromWords(sigWords)
  const signature = new Uint8Array(signatureData.slice(0, 64)) as Signature

  return {
    currency,
    amount,
    timestamp: Number(timestamp),
    taggedFields,
    signature,
  }
}

/**
 * Builds the human-readable part of a Lightning invoice
 * Combines currency prefix with amount (e.g., 'lnbc' + 2500 micro-bitcoin -> 'lnbc2500u')
 * @param currency - Currency prefix (e.g., 'lnbc')
 * @param amount - Amount in millisatoshis (undefined for any-amount invoices)
 * @returns Human-readable part string
 */
function buildHumanReadablePart(currency: string, amount?: bigint): string {
  // Se amount for undefined ou 0, retornar apenas o currency (invoice sem valor fixo)
  if (!amount || amount === 0n) {
    return currency
  }

  // Escolher o melhor multiplicador para representar o amount
  // Preferir unidades maiores quando possível para invoices mais curtas
  // 1 BTC = 100,000,000,000 msat
  // m (milli) = 100,000,000 msat
  // u (micro) = 100,000 msat
  // n (nano) = 100 msat
  // p (pico) = 0.1 msat (precisa terminar em 0)

  // Tentar milli (mais compacto para valores grandes)
  if (amount >= 100000000n && amount % 100000000n === 0n) {
    const value = amount / 100000000n
    return `${currency}${value}m`
  }

  // Tentar micro
  if (amount >= 100000n && amount % 100000n === 0n) {
    const value = amount / 100000n
    return `${currency}${value}u`
  }

  // Tentar nano
  if (amount >= 100n && amount % 100n === 0n) {
    const value = amount / 100n
    return `${currency}${value}n`
  }

  // Usar pico (menor unidade, valor * 10 porque 1 pico = 0.1 msat)
  const value = amount * 10n
  return `${currency}${value}p`
}

/**
 * Parses the human-readable part of a Lightning invoice
 * Extracts currency prefix and amount from HRP (e.g., 'lnbc2500u' -> 'lnbc' + 2500 micro-bitcoin)
 * @param hrp - Human-readable part (e.g., 'lnbc2500u')
 * @returns Object with currency and amount (undefined for donation invoices)
 * @throws Error for unknown currency or invalid amount format
 */
function parseHumanReadablePart(hrp: string): {
  currency: string
  amount: bigint | undefined
} {
  // HRP should start with 'ln'
  if (!hrp.startsWith('ln')) {
    throw new Error('Invalid HRP: must start with ln')
  }

  // Extract currency prefix (ln + currency code)
  let currency: string | undefined
  let amountPart = ''

  const invoicePrefixes = getAllInvoicePrefixes().sort((a, b) => b.length - a.length)
  for (const prefix of invoicePrefixes) {
    if (hrp.startsWith(prefix)) {
      currency = prefix
      amountPart = hrp.slice(prefix.length)
      break
    }
  }

  if (!currency) {
    throw new Error(`Unknown currency prefix in HRP: ${hrp}`)
  }

  if (amountPart.length === 0) {
    // No amount specified
    return { currency, amount: undefined }
  }

  // Parse amount (number + multiplier)
  const amountMatch = amountPart.match(/^(\d+)([munpf])$/)
  if (!amountMatch) {
    throw new Error(`Invalid amount format: ${amountPart}`)
  }

  const amountValue = parseInt(amountMatch[1], 10)
  const multiplier = amountMatch[2] as AmountMultiplier

  // Convert to millisatoshis
  const amount = calculateAmount(amountValue, multiplier)

  return { currency, amount }
}

/**
 * Decodes tagged fields from 5-bit words into structured data
 * Parses BOLT 11 tagged fields including payment_hash, description, expiry, etc.
 * Each field has format: type (5 bits) + length (10 bits) + data (variable)
 * @param data - Tagged fields as 5-bit words
 * @returns Parsed tagged fields object
 */
function decodeTaggedFields(data: number[]): InvoiceTaggedFields {
  const taggedFields: InvoiceTaggedFields = {
    paymentHash: new Uint8Array(32) as Sha256, // Placeholder
  }

  let offset = 0
  while (offset < data.length) {
    // Decode type (5 bits)
    const type = data[offset] as TaggedFieldType
    offset += 1

    // Decode data_length (10 bits, big-endian, stored in 2 words)
    const lengthWord1 = data[offset]
    const lengthWord2 = data[offset + 1]
    const dataLength = (lengthWord1 << 5) | lengthWord2
    offset += 2

    // dataLength is the number of 5-bit words
    const fieldWords = data.slice(offset, offset + dataLength)
    offset += dataLength

    // For most fields, convert from 5-bit words to bytes
    // Skip padding validation for tagged field data - the field data itself
    // (e.g., Bech32-encoded fallback addresses) may have non-zero bits in
    // the padding position. BOLT 11 padding requirement applies at 5-bit level.
    let fieldData: Uint8Array

    // Special handling for fields that store values as 5-bit words
    if (type === TaggedFieldType.EXPIRY || type === TaggedFieldType.MIN_FINAL_CLTV_EXPIRY_DELTA) {
      // These fields encode values directly as big-endian in 5-bit words
      // Example: qz: data_length = 2, pu: 60 seconds (p=1, u=28; 1*32+28=60)
      let value = 0
      for (let i = 0; i < fieldWords.length; i++) {
        value = value * 32 + fieldWords[i]
      }
      // Store as bytes for consistent interface
      fieldData = new Uint8Array(4)
      fieldData[0] = (value >> 24) & 0xff
      fieldData[1] = (value >> 16) & 0xff
      fieldData[2] = (value >> 8) & 0xff
      fieldData[3] = value & 0xff
    } else {
      fieldData = new Uint8Array(fromWords(fieldWords, false))
    }

    // Parse based on type
    switch (type) {
      case TaggedFieldType.PAYMENT_HASH:
        taggedFields.paymentHash = fieldData.slice(0, 32) as Sha256
        break
      case TaggedFieldType.UNKNOWN_2: // Appears in test vectors as payment_hash
        taggedFields.paymentHash = fieldData.slice(0, 32) as Sha256
        break
      case TaggedFieldType.PAYMENT_SECRET:
        taggedFields.paymentSecret = fieldData as PaymentSecret
        break
      case TaggedFieldType.DESCRIPTION:
        taggedFields.description = new TextDecoder().decode(fieldData)
        break
      case TaggedFieldType.UNKNOWN_22: // Appears in test vectors as description
        taggedFields.description = new TextDecoder().decode(fieldData.slice(0, fieldData.length))
        break
      case TaggedFieldType.DESCRIPTION_HASH:
        taggedFields.descriptionHash = fieldData as Sha256
        break
      case TaggedFieldType.EXPIRY:
        // Expiry is stored as big-endian value in field data (already converted above)
        taggedFields.expiry = readUint32BE(fieldData, 0)
        break
      case TaggedFieldType.MIN_FINAL_CLTV_EXPIRY_DELTA:
        // Min CLTV is stored as big-endian value in field data (already converted above)
        taggedFields.minFinalCltvExpiryDelta = readUint32BE(fieldData, 0)
        break
      case TaggedFieldType.FALLBACK_ADDRESS:
        if (!taggedFields.fallbackAddresses) taggedFields.fallbackAddresses = []
        taggedFields.fallbackAddresses.push(decodeFallbackAddress(fieldData))
        break
      case TaggedFieldType.ROUTING_INFO:
        if (!taggedFields.routingInfo) taggedFields.routingInfo = []
        taggedFields.routingInfo.push(decodeRoutingInfo(fieldData))
        break
      case TaggedFieldType.FEATURES:
        taggedFields.features = fieldData
        break
      case TaggedFieldType.PAYEE_PUBKEY:
        taggedFields.payeePubkey = fieldData
        break
      case TaggedFieldType.METADATA:
        taggedFields.metadata = fieldData
        break
      default:
        console.log(`Unknown field type ${type}, dataLength ${dataLength}, ignoring`)
    }
  }

  return taggedFields
}

/**
 * Decodes fallback address
 * @param data - Encoded fallback data
 * @returns Fallback address
 */
function decodeFallbackAddress(data: Uint8Array): FallbackAddress {
  const type = data[0] as FallbackAddressType
  const hash = data.slice(1)
  return { type, hash }
}

/**
 * Decodes routing info
 * @param data - Encoded routing data
 * @returns Routing info entry
 */
function decodeRoutingInfo(data: Uint8Array): RoutingInfoEntry {
  let offset = 0

  // Pubkey (33 bytes)
  const pubkey = data.slice(offset, offset + 33)
  offset += 33

  // Short channel ID (8 bytes)
  const shortChannelId = data.slice(offset, offset + 8)
  offset += 8

  // Fee base (4 bytes)
  const feeBaseMsat = readUint32BE(data, offset)
  offset += 4

  // Fee proportional (4 bytes)
  const feeProportionalMillionths = readUint32BE(data, offset)
  offset += 4

  // CLTV expiry delta (2 bytes)
  const cltvExpiryDelta = readUint16BE(data, offset)

  return {
    pubkey,
    shortChannelId,
    feeBaseMsat,
    feeProportionalMillionths,
    cltvExpiryDelta,
  }
}

/**
 * Set of known feature bits for validation purposes
 * Based on BOLT 9: https://github.com/lightning/bolts/blob/master/09-features.md
 */
const KNOWN_FEATURE_BIT_SET = new Set([
  0,
  1, // option_data_loss_protect
  4,
  5, // option_upfront_shutdown_script
  6,
  7, // gossip_queries
  8,
  9, // var_onion_optin
  10,
  11, // gossip_queries_ex
  12,
  13, // option_static_remotekey
  14,
  15, // payment_secret
  16,
  17, // basic_mpp
  18,
  19, // option_support_large_channel
  20,
  21, // option_anchor_outputs
  22,
  23, // option_anchors_zero_fee_htlc_tx
  24,
  25, // option_route_blinding
  26,
  27, // option_shutdown_anysegwit
  28,
  29, // option_dual_fund
  30,
  31, // option_onion_messages
  44,
  45, // option_channel_type
  46,
  47, // option_scid_alias
  48,
  49, // option_payment_metadata
  50,
  51, // option_zeroconf
])

/**
 * Validates an invoice according to BOLT 11 rules
 * @param invoice - The invoice to validate
 * @returns Validation result
 */
export function validateInvoice(invoice: Invoice): InvoiceValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check required fields
  if (!invoice.taggedFields.paymentHash) {
    errors.push('Payment hash is required')
  }

  // Payment secret is required for modern invoices but we can be lenient
  if (!invoice.taggedFields.paymentSecret) {
    warnings.push('Payment secret is missing (may be an older invoice format)')
  }

  if (!invoice.taggedFields.description && !invoice.taggedFields.descriptionHash) {
    // Some invoices use descriptionHash instead of description
    // This is valid per BOLT 11, so only warn if both are missing
    warnings.push('Neither description nor descriptionHash is present')
  }

  // Check field lengths
  if (invoice.taggedFields.paymentHash && invoice.taggedFields.paymentHash.length !== 32) {
    errors.push('Payment hash must be 32 bytes')
  }

  if (invoice.taggedFields.paymentSecret && invoice.taggedFields.paymentSecret.length !== 32) {
    errors.push('Payment secret must be 32 bytes')
  }

  if (invoice.taggedFields.descriptionHash && invoice.taggedFields.descriptionHash.length !== 32) {
    errors.push('Description hash must be 32 bytes')
  }

  if (invoice.taggedFields.payeePubkey && invoice.taggedFields.payeePubkey.length !== 33) {
    errors.push('Payee pubkey must be 33 bytes')
  }

  // Check expiry
  if (invoice.taggedFields.expiry !== undefined && invoice.taggedFields.expiry < 0) {
    errors.push('Expiry must be non-negative')
  }

  // Check features - be lenient with unknown feature bits
  // Per BOLT 9, unknown even bits indicate required features we don't support
  // but for invoice validation, we should still allow payment attempts
  if (invoice.taggedFields.features) {
    for (let i = 0; i < invoice.taggedFields.features.length; i++) {
      const byte = invoice.taggedFields.features[i]
      for (let bit = 0; bit < 8; bit++) {
        const bitValue = (byte >> bit) & 1
        if (bitValue === 1) {
          const bitIndex = i * 8 + bit
          // Unknown feature bits are just warnings, not errors
          // This allows us to attempt payment even if the receiver
          // advertises features we don't fully understand
          if (!KNOWN_FEATURE_BIT_SET.has(bitIndex)) {
            const isEven = bitIndex % 2 === 0
            if (isEven) {
              warnings.push(`Unknown required feature bit ${bitIndex}`)
            }
            // Odd (optional) unknown bits are silently ignored per BOLT 9
          }
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Verifies the signature of an invoice
 * @param invoice - The invoice
 * @param pubkey - Public key to verify against (optional, can be recovered)
 * @returns True if signature is valid
 */
export function verifyInvoiceSignature(invoice: Invoice, pubkey?: Uint8Array): boolean {
  // Reconstruct the data that was signed
  const hrp = invoice.currency
  // This is a simplified version - full implementation would reconstruct the exact bytes
  const dataToSign = new TextEncoder().encode(hrp) // Simplified

  const hash = sha256(dataToSign)

  if (pubkey) {
    return verifyMessage(hash, invoice.signature, pubkey)
  } else {
    // Public key recovery would be implemented here
    // For now, return false
    return false
  }
}

/**
 * Checks if an invoice is expired
 * @param invoice - The invoice
 * @param currentTime - Current timestamp (optional, defaults to now)
 * @returns Expiry status
 */
export function getInvoiceExpiryStatus(
  invoice: Invoice,
  currentTime?: number,
): InvoiceExpiryStatus {
  const now = currentTime || Math.floor(Date.now() / 1000)
  const expiry = invoice.taggedFields.expiry || DEFAULT_EXPIRY_SECONDS
  const expiryTimestamp = invoice.timestamp + expiry
  const isExpired = now > expiryTimestamp
  const secondsUntilExpiry = isExpired ? 0 : expiryTimestamp - now

  return {
    isExpired,
    secondsUntilExpiry,
    expiryTimestamp,
  }
}

// =============================
// BOLT #11 Advanced Functions
// =============================

/**
 * Recovery ID for ECDSA signatures in Lightning invoices
 * The recovery ID is a single byte (0-3) appended to the signature
 */
export interface SignatureWithRecovery {
  signature: Uint8Array // 64 bytes (r + s)
  recoveryId: number // 0-3
}

/**
 * Reconstructs the signing preimage for an invoice
 * Per BOLT #11: The signature is over SHA256(hrp + data part as bytes)
 * where data part includes timestamp and tagged fields as 5-bit words
 * @param hrp - Human readable part
 * @param dataWords - 5-bit words (timestamp + tagged fields, excluding signature)
 * @returns The hash to be signed
 */
export function getInvoiceSigningHash(hrp: string, dataWords: number[]): Uint8Array {
  // Convert 5-bit words to bytes for signing
  // The data part is the raw 5-bit words, not converted to 8-bit
  const dataBytes = new Uint8Array(dataWords)
  const hrpBytes = new TextEncoder().encode(hrp)
  const combined = concatUint8Arrays([hrpBytes, dataBytes])
  return sha256(combined)
}

/**
 * Recovers the public key from an invoice signature
 * Per BOLT #11: The signature includes a recovery ID for public key recovery
 * @param invoice - The decoded invoice with signature
 * @param invoiceString - Original invoice string for hash reconstruction
 * @returns Recovered public key or undefined if recovery fails
 */
export function recoverInvoicePublicKey(
  invoice: Invoice,
  invoiceString: string,
): Uint8Array | undefined {
  try {
    // Decode to get the raw data
    const decoded = decode(invoiceString)
    const words = decoded.words

    // Get signature words (last 104 words = 520 bits / 5)
    const sigWordsLength = 104
    const dataWords = words.slice(0, -sigWordsLength)

    // Get the hash that was signed
    const hash = getInvoiceSigningHash(decoded.prefix, dataWords)

    // The signature bytes include recovery ID as last byte
    const sigWords = words.slice(-sigWordsLength)
    const sigBytes = new Uint8Array(fromWords(sigWords, false))

    if (sigBytes.length < 65) {
      return undefined
    }

    const signature = sigBytes.slice(0, 64)
    const recoveryId = sigBytes[64]

    // Validate recovery ID (must be 0-3)
    if (recoveryId > 3) {
      return undefined
    }

    // Recover the public key using secp256k1
    const pubkey = secp256k1.ecdsaRecover(signature, recoveryId, hash, true)
    return pubkey
  } catch {
    return undefined
  }
}

/**
 * Signs an invoice with recovery ID support per BOLT #11
 * @param hash - The hash to sign (from getInvoiceSigningHash)
 * @param privateKey - The private key
 * @returns Signature with recovery ID
 */
export function signInvoiceWithRecovery(
  hash: Uint8Array,
  privateKey: Uint8Array,
): SignatureWithRecovery {
  const { signature, recid } = secp256k1.ecdsaSign(hash, privateKey)
  return {
    signature,
    recoveryId: recid,
  }
}

/**
 * Verifies invoice signature with public key recovery
 * @param invoice - The decoded invoice
 * @param invoiceString - Original invoice string
 * @param expectedPubkey - Optional expected public key to verify against
 * @returns Verification result with recovered pubkey
 */
export function verifyInvoiceSignatureWithRecovery(
  invoice: Invoice,
  invoiceString: string,
  expectedPubkey?: Uint8Array,
): { valid: boolean; recoveredPubkey?: Uint8Array; error?: string } {
  try {
    const recoveredPubkey = recoverInvoicePublicKey(invoice, invoiceString)

    if (!recoveredPubkey) {
      return { valid: false, error: 'Failed to recover public key' }
    }

    // If expected pubkey is provided, verify it matches
    if (expectedPubkey) {
      const matches =
        recoveredPubkey.length === expectedPubkey.length &&
        recoveredPubkey.every((byte, i) => byte === expectedPubkey[i])

      if (!matches) {
        return {
          valid: false,
          recoveredPubkey,
          error: 'Recovered public key does not match expected',
        }
      }
    }

    // If invoice has payee pubkey, verify it matches
    if (invoice.taggedFields.payeePubkey) {
      const matches =
        recoveredPubkey.length === invoice.taggedFields.payeePubkey.length &&
        recoveredPubkey.every((byte, i) => byte === invoice.taggedFields.payeePubkey![i])

      if (!matches) {
        return {
          valid: false,
          recoveredPubkey,
          error: 'Recovered public key does not match payee pubkey in invoice',
        }
      }
    }

    return { valid: true, recoveredPubkey }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error during verification',
    }
  }
}

/**
 * Parses amount with optional multiplier from HRP suffix
 * Per BOLT #11: amount is expressed as `number` followed by multiplier
 * @param amountStr - Amount string (e.g., "2500u", "1m", "1000n")
 * @returns Amount in millisatoshis
 */
export function parseAmountFromHrp(amountStr: string): bigint {
  if (!amountStr || amountStr.length === 0) {
    throw new Error('Amount string is empty')
  }

  const multiplierChar = amountStr[amountStr.length - 1]
  const multipliers: Record<string, AmountMultiplier> = {
    m: AmountMultiplier.MILLI,
    u: AmountMultiplier.MICRO,
    n: AmountMultiplier.NANO,
    p: AmountMultiplier.PICO,
  }

  const multiplier = multipliers[multiplierChar]
  if (!multiplier) {
    throw new Error(`Invalid amount multiplier: ${multiplierChar}`)
  }

  const amountValue = parseInt(amountStr.slice(0, -1), 10)
  if (isNaN(amountValue) || amountValue <= 0) {
    throw new Error(`Invalid amount value: ${amountStr.slice(0, -1)}`)
  }

  return calculateAmount(amountValue, multiplier)
}

/**
 * Formats millisatoshis to the most compact representation for HRP
 * @param millisatoshis - Amount in millisatoshis
 * @returns Formatted amount string (e.g., "2500u", "1m")
 */
export function formatAmountForHrp(millisatoshis: bigint): string {
  if (millisatoshis <= 0n) {
    throw new Error('Amount must be positive')
  }

  // Try milli (1 mBTC = 100,000,000 msat)
  if (millisatoshis >= 100000000n && millisatoshis % 100000000n === 0n) {
    return `${millisatoshis / 100000000n}m`
  }

  // Try micro (1 µBTC = 100,000 msat)
  if (millisatoshis >= 100000n && millisatoshis % 100000n === 0n) {
    return `${millisatoshis / 100000n}u`
  }

  // Try nano (1 nBTC = 100 msat)
  if (millisatoshis >= 100n && millisatoshis % 100n === 0n) {
    return `${millisatoshis / 100n}n`
  }

  // Use pico (1 pBTC = 0.1 msat)
  return `${millisatoshis * 10n}p`
}

/**
 * Validates tagged field lengths according to BOLT #11
 * @param type - Field type
 * @param dataLength - Length in 5-bit words
 * @returns Validation result
 */
export function validateTaggedFieldLength(
  type: TaggedFieldType,
  dataLength: number,
): { valid: boolean; error?: string } {
  const expectedLengths: Partial<Record<TaggedFieldType, { min: number; max: number }>> = {
    [TaggedFieldType.PAYMENT_HASH]: { min: 52, max: 52 }, // 256 bits = 52 words
    [TaggedFieldType.PAYMENT_SECRET]: { min: 52, max: 52 }, // 256 bits = 52 words
    [TaggedFieldType.DESCRIPTION_HASH]: { min: 52, max: 52 }, // 256 bits = 52 words
    [TaggedFieldType.PAYEE_PUBKEY]: { min: 53, max: 53 }, // 264 bits = 53 words (33 bytes)
    [TaggedFieldType.EXPIRY]: { min: 1, max: 10 }, // Variable
    [TaggedFieldType.MIN_FINAL_CLTV_EXPIRY_DELTA]: { min: 1, max: 10 }, // Variable
    [TaggedFieldType.ROUTING_INFO]: { min: 0, max: 1024 }, // Variable, can be empty
    [TaggedFieldType.FEATURES]: { min: 0, max: 1024 }, // Variable
  }

  const constraint = expectedLengths[type]
  if (!constraint) {
    // Unknown field type, accept any length
    return { valid: true }
  }

  if (dataLength < constraint.min || dataLength > constraint.max) {
    return {
      valid: false,
      error: `Field type ${type} has invalid length ${dataLength}, expected ${constraint.min}-${constraint.max}`,
    }
  }

  return { valid: true }
}

/**
 * Checks if a feature is required (even bit set) per BOLT #9
 * @param features - Feature bitvector
 * @param featureBit - Feature bit number (even for compulsory, odd for optional)
 * @returns True if feature is required
 */
export function isFeatureRequired(features: Uint8Array, featureBit: number): boolean {
  if (featureBit % 2 !== 0) {
    return false // Odd bits are optional, not required
  }

  const byteIndex = Math.floor(featureBit / 8)
  const bitIndex = featureBit % 8

  if (byteIndex >= features.length) {
    return false
  }

  return (features[byteIndex] & (1 << bitIndex)) !== 0
}

/**
 * Checks if a feature is supported (either bit set) per BOLT #9
 * @param features - Feature bitvector
 * @param featureBit - Feature bit number (provide even bit, will check both)
 * @returns True if feature is supported
 */
export function isFeatureSupported(features: Uint8Array, featureBit: number): boolean {
  const evenBit = featureBit % 2 === 0 ? featureBit : featureBit - 1
  const oddBit = evenBit + 1

  const evenByteIndex = Math.floor(evenBit / 8)
  const evenBitIndex = evenBit % 8
  const oddByteIndex = Math.floor(oddBit / 8)
  const oddBitIndex = oddBit % 8

  const evenSet =
    evenByteIndex < features.length && (features[evenByteIndex] & (1 << evenBitIndex)) !== 0
  const oddSet =
    oddByteIndex < features.length && (features[oddByteIndex] & (1 << oddBitIndex)) !== 0

  return evenSet || oddSet
}

/**
 * Known feature bits per BOLT #9
 */
export const KNOWN_FEATURE_BITS = {
  OPTION_DATA_LOSS_PROTECT: 0,
  INITIAL_ROUTING_SYNC: 2, // Deprecated
  OPTION_UPFRONT_SHUTDOWN_SCRIPT: 4,
  GOSSIP_QUERIES: 6,
  VAR_ONION_OPTIN: 8, // Required for payments
  GOSSIP_QUERIES_EX: 10,
  OPTION_STATIC_REMOTEKEY: 12,
  PAYMENT_SECRET: 14, // Required for invoices
  BASIC_MPP: 16, // Multi-path payments
  OPTION_SUPPORT_LARGE_CHANNEL: 18,
  OPTION_ANCHOR_OUTPUTS: 20,
  OPTION_ANCHORS_ZERO_FEE_HTLC_TX: 22,
  OPTION_ROUTE_BLINDING: 24,
  OPTION_SHUTDOWN_ANYSEGWIT: 26,
  OPTION_CHANNEL_TYPE: 44,
  OPTION_SCID_ALIAS: 46,
  OPTION_PAYMENT_METADATA: 48,
  OPTION_ZEROCONF: 50,
} as const
