// Lightning Network utility functions

import { uint8ArrayFromHex, uint8ArrayToHex } from '../utils'
import { LightningInvoice, Channel } from './types'
import { LIGHTNING_CONSTANTS, BOLT11_PREFIXES } from './constants'
import { signMessage, verifyMessage, encode as bech32Encode, createHash, sha256 } from '../crypto'

/**
 * Generate a payment hash for a Lightning invoice
 * @param preimage - Optional preimage, if not provided a random one is generated
 * @returns Object with paymentHash and preimage
 */
// Simple hash function for testing (in production, use proper crypto)

export function generatePaymentHash(preimage?: Uint8Array): {
  paymentHash: string
  preimage: Uint8Array
} {
  const preimageBuffer = preimage || sha256(new TextEncoder().encode(Date.now().toString()))
  const paymentHash = uint8ArrayToHex(sha256(preimageBuffer))
  return { paymentHash, preimage: preimageBuffer }
}

/**
 * Calculate the expiry timestamp for an invoice
 * @param expirySeconds - Expiry time in seconds from now
 * @returns Expiry timestamp
 */
export function calculateInvoiceExpiry(
  expirySeconds: number = LIGHTNING_CONSTANTS.DEFAULT_INVOICE_EXPIRY,
): number {
  const clampedExpiry = Math.min(expirySeconds, LIGHTNING_CONSTANTS.MAX_INVOICE_EXPIRY)
  return Math.floor(Date.now() / 1000) + clampedExpiry
}

/**
 * Validate a Lightning invoice amount
 * @param amount - Amount in satoshis
 * @returns True if valid
 */
export function validateInvoiceAmount(amount: number): boolean {
  return amount >= 0 && Number.isInteger(amount)
}

/**
 * Format a Lightning invoice amount for display
 * @param amount - Amount in satoshis
 * @returns Formatted string
 */
export function formatInvoiceAmount(amount: number): string {
  if (amount >= 100000000) {
    return `${(amount / 100000000).toFixed(8)} BTC`
  } else if (amount >= 1000) {
    return `${amount / 1000}k sats`
  } else {
    return `${amount} sats`
  }
}

/**
 * Check if an invoice is expired
 * @param invoice - Lightning invoice
 * @returns True if expired
 */
export function isInvoiceExpired(invoice: LightningInvoice): boolean {
  return Date.now() / 1000 > invoice.expiry
}

/**
 * Calculate channel capacity from local and remote balances
 * @param localBalance - Local balance in satoshis
 * @param remoteBalance - Remote balance in satoshis
 * @returns Total capacity
 */
export function calculateChannelCapacity(localBalance: number, remoteBalance: number): number {
  return localBalance + remoteBalance
}

/**
 * Check if a channel can send a payment
 * @param channel - Channel object
 * @param amount - Amount to send in satoshis
 * @returns True if can send
 */
export function canSendPayment(channel: Channel, amount: number): boolean {
  return channel.status === 'open' && channel.localBalance >= amount + channel.localChannelReserve
}

/**
 * Check if a channel can receive a payment
 * @param channel - Channel object
 * @param amount - Amount to receive in satoshis
 * @returns True if can receive
 */
export function canReceivePayment(channel: Channel, amount: number): boolean {
  return channel.status === 'open' && channel.remoteBalance >= amount + channel.remoteChannelReserve
}

/**
 * Calculate total wallet balance from channels
 * @param channels - Array of channels
 * @returns Total balance in satoshis
 */
export function calculateWalletBalance(channels: Channel[]): number {
  return channels
    .filter(channel => channel.status === 'open')
    .reduce((total, channel) => total + channel.localBalance, 0)
}

/**
 * Calculate pending balance from channels
 * @param channels - Array of channels
 * @returns Pending balance in satoshis
 */
export function calculatePendingBalance(channels: Channel[]): number {
  return channels
    .filter(channel => channel.status === 'pending')
    .reduce((total, channel) => total + channel.localBalance, 0)
}

/**
 * Validate a Lightning node ID (public key)
 * @param nodeId - Node ID as hex string
 * @returns True if valid
 */
export function validateNodeId(nodeId: string): boolean {
  // Must be 66 characters (33 bytes) and start with 02 or 03 (compressed pubkey)
  return /^0[23][0-9a-f]{64}$/i.test(nodeId) && nodeId.length === 66
}

/**
 * Validate a Lightning payment request (invoice)
 * @param paymentRequest - BOLT11 encoded invoice
 * @returns True if valid format
 */
export function validatePaymentRequest(paymentRequest: string): boolean {
  // Basic validation for BOLT11 format
  return (
    paymentRequest.startsWith('lnbc') ||
    paymentRequest.startsWith('lntb') ||
    paymentRequest.startsWith('lnbcrt')
  )
}

/**
 * Parse expiry from payment request (simplified)
 * @param paymentRequest - BOLT11 invoice
 * @returns Expiry in seconds or default
 */
export function parseInvoiceExpiry(paymentRequest: string): number {
  // This is a simplified implementation
  // In reality, you'd decode the BOLT11 invoice
  try {
    // Look for expiry in the invoice (this is not accurate)
    const expiryMatch = paymentRequest.match(/exp=(\d+)/)
    return expiryMatch ? parseInt(expiryMatch[1]) : LIGHTNING_CONSTANTS.DEFAULT_INVOICE_EXPIRY
  } catch {
    return LIGHTNING_CONSTANTS.DEFAULT_INVOICE_EXPIRY
  }
}

export function generateRandomPreimage(): Uint8Array {
  return createHash('sha256').update(Math.random().toString()).digest()
}

/**
 * Generate channel ID from funding transaction
 * @param fundingTxId - Funding transaction ID
 * @param fundingOutputIndex - Output index
 * @returns Channel ID as string
 */
export function generateChannelId(fundingTxId: string, fundingOutputIndex: number): string {
  // BOLT 2: channel_id = funding_txid XOR funding_output_index (little-endian)
  const txIdBytes = uint8ArrayFromHex(fundingTxId).reverse() // Convert to little-endian
  const outputIndexBytes = new Uint8Array(4)
  new DataView(outputIndexBytes.buffer).setUint32(0, fundingOutputIndex, true) // little-endian

  const channelId = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    channelId[i] = txIdBytes[i] ^ (outputIndexBytes[i % 4] || 0)
  }

  return uint8ArrayToHex(channelId)
}

/**
 * Generate channel point string
 * @param fundingTxId - Funding transaction ID
 * @param fundingOutputIndex - Output index
 * @returns Channel point as string
 */
export function generateChannelPoint(fundingTxId: string, fundingOutputIndex: number): string {
  return `${fundingTxId}:${fundingOutputIndex}`
}

/**
 * Validate channel parameters according to BOLT 2
 * @param capacity - Channel capacity in satoshis
 * @param dustLimit - Dust limit
 * @param channelReserve - Channel reserve
 * @returns True if valid
 */
export function validateChannelParameters(
  capacity: number,
  dustLimit: number,
  channelReserve: number,
): boolean {
  return (
    capacity >= LIGHTNING_CONSTANTS.MIN_CHANNEL_CAPACITY &&
    dustLimit >= 0 &&
    channelReserve >= 0 &&
    channelReserve <= capacity
  )
}

/**
 * Calculate CLTV expiry for HTLC
 * @param currentBlockHeight - Current block height
 * @param cltvExpiryDelta - CLTV expiry delta
 * @returns CLTV expiry
 */
export function calculateCltvExpiry(currentBlockHeight: number, cltvExpiryDelta: number): number {
  return currentBlockHeight + Math.max(cltvExpiryDelta, LIGHTNING_CONSTANTS.MIN_CLTV_EXPIRY)
}

/**
 * Encode amount for BOLT 11 invoice
 * @param amount - Amount in satoshis
 * @returns Encoded amount string
 */
export function encodeBolt11Amount(amount: number): string {
  if (amount === 0) return ''

  // Convert satoshis to msats for BOLT11 encoding
  const msats = amount * 1000

  // Choose the best multiplier to minimize string length
  if (msats % 100000 === 0) {
    // Can use 'u' (micro) - 100 sats
    return `${msats / 100000}u`
  } else if (msats % 1000 === 0) {
    // Can use 'm' (milli) - 1 sat
    return `${msats / 1000}m`
  } else {
    // Use satoshis directly (no multiplier)
    return amount.toString()
  }
}

/**
 * Decode amount from BOLT 11 invoice
 * @param amountStr - Encoded amount string
 * @returns Amount in satoshis
 */
export function decodeBolt11Amount(amountStr: string): number {
  if (!amountStr) return 0

  const match = amountStr.match(/^(\d+)([munp]?)$/)
  if (!match) return 0

  const value = parseInt(match[1], 10)
  const multiplier = match[2]

  let msats: number
  switch (multiplier) {
    case 'm':
      msats = value * 1000 // milli
      break
    case 'u':
      msats = value * 100000 // micro
      break
    case 'n':
      msats = value * 100000000 // nano
      break
    case 'p':
      msats = value * 100000000000 // pico
      break
    default:
      // No multiplier - treat as satoshis
      return value
  }

  // Convert msats back to satoshis
  return Math.floor(msats / 1000)
}

/**
 * Create tagged field for BOLT 11 invoice
 * @param tag - Tag character
 * @param data - Data buffer
 * @returns Tagged field buffer
 */
export function createTaggedField(tag: string, data: Uint8Array): Uint8Array {
  const tagByte = new TextEncoder().encode(tag)[0]
  const length = data.length
  const result = new Uint8Array(2 + length)
  result[0] = tagByte
  result[1] = length
  result.set(data, 2)
  return result
}

/**
 * Parse tagged field from BOLT 11 invoice
 * @param field - Tagged field buffer
 * @returns Object with tag and data
 */
export function parseTaggedField(field: Uint8Array): { tag: string; data: Uint8Array } {
  const tag = String.fromCharCode(field[0])
  const length = field[1]
  const data = field.slice(2, 2 + length)
  return { tag, data }
}

/**
 * Generate BOLT 11 invoice signature
 * @param hrp - Human readable part
 * @param data - Data part
 * @param privateKey - Private key for signing
 * @returns Signature buffer
 */
export function generateInvoiceSignature(
  hrp: string,
  data: Uint8Array,
  privateKey: Uint8Array,
): Uint8Array {
  // Create the message to sign: hrp + data
  const hrpBytes = new TextEncoder().encode(hrp)
  const message = new Uint8Array(hrpBytes.length + data.length)
  message.set(hrpBytes)
  message.set(data, hrpBytes.length)

  // Hash the message with SHA256
  const messageHash = sha256(message)

  // Sign the hash using ECDSA
  const signature = signMessage(messageHash, privateKey)

  return signature
}

/**
 * Verify BOLT 11 invoice signature
 * @param hrp - Human readable part
 * @param data - Data part
 * @param signature - Signature buffer
 * @param pubKey - Public key
 * @returns True if valid
 */
export function verifyInvoiceSignature(
  hrp: string,
  data: Uint8Array,
  signature: Uint8Array,
  pubKey: Uint8Array,
): boolean {
  // Create the message that was signed: hrp + data
  const hrpBytes = new TextEncoder().encode(hrp)
  const message = new Uint8Array(hrpBytes.length + data.length)
  message.set(hrpBytes)
  message.set(data, hrpBytes.length)

  // Hash the message with SHA256
  const messageHash = sha256(message)

  // Verify the signature
  return verifyMessage(messageHash, signature, pubKey)
}

/**
 * Encode BOLT 11 invoice using Bech32
 * @param hrp - Human readable part (e.g., 'lnbc')
 * @param data - Data part (tagged fields + signature)
 * @returns Encoded Bech32 string
 */
export function encodeBolt11(hrp: string, data: Uint8Array): string {
  // For BOLT 11, we need to convert the data to 5-bit words
  // The data should already be in the correct format (tagged fields + signature)
  // Use Bech32 encoding (version 0)
  return bech32Encode(data, hrp, 0)
}

/**
 * Decode a BOLT11 Lightning invoice
 * @param paymentRequest - BOLT11 encoded invoice string
 * @returns Decoded invoice data
 */
export function decodeBolt11Invoice(paymentRequest: string): Partial<LightningInvoice> {
  try {
    // For testing purposes, return a mock decoded invoice
    // In production, this would properly decode the BOLT11 format
    const isTestnet = paymentRequest.startsWith('lntb')
    const isMainnet = paymentRequest.startsWith('lnbc')
    const isRegtest = paymentRequest.startsWith('lnbcrt')

    if (!isTestnet && !isMainnet && !isRegtest) {
      throw new Error('Invalid BOLT11 prefix')
    }

    // Mock decoding - extract amount from payment request if present
    let amount = 0
    const amountMatch = paymentRequest.match(/(\d+)[munp]?/)
    if (amountMatch) {
      const amountStr = amountMatch[1]
      const multiplier = paymentRequest.match(/(\d+)([munp])/)?.[2]
      if (multiplier) {
        switch (multiplier) {
          case 'm':
            amount = parseInt(amountStr) * 1000 // milli
            break
          case 'u':
            amount = parseInt(amountStr) * 100000 // micro
            break
          case 'n':
            amount = parseInt(amountStr) * 100000000 // nano
            break
          case 'p':
            amount = parseInt(amountStr) * 100000000000 // pico
            break
          default:
            amount = parseInt(amountStr)
        }
        amount = Math.floor(amount / 1000) // Convert msats to sats
      } else {
        amount = parseInt(amountStr)
      }
    }

    // Generate mock payment hash
    const paymentHash = uint8ArrayToHex(sha256(new TextEncoder().encode(paymentRequest)))

    return {
      paymentHash,
      paymentRequest,
      amount,
      description: 'Mock decoded invoice',
      expiry: Date.now() / 1000 + LIGHTNING_CONSTANTS.DEFAULT_INVOICE_EXPIRY,
      timestamp: Date.now() / 1000,
      cltvExpiry: LIGHTNING_CONSTANTS.DEFAULT_CLTV_EXPIRY,
      features: new Uint8Array([0]),
      signature: new Uint8Array(64),
      status: 'pending',
    }
  } catch (error) {
    throw new Error(`Invalid BOLT11 invoice: ${error}`)
  }
}

/**
 * Get network prefix for BOLT 11
 * @param network - Network name
 * @returns Prefix string
 */
export function getBolt11Prefix(network: 'mainnet' | 'testnet' | 'regtest' = 'testnet'): string {
  switch (network) {
    case 'mainnet':
      return BOLT11_PREFIXES.MAINNET
    case 'testnet':
      return BOLT11_PREFIXES.TESTNET
    case 'regtest':
      return BOLT11_PREFIXES.REGTEST
    default:
      return BOLT11_PREFIXES.TESTNET
  }
}
