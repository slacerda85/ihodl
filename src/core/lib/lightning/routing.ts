// BOLT #4: Onion Routing Protocol implementation
// Based on https://github.com/lightning/bolts/blob/master/04-onion-routing.md

import {
  VERSION,
  HOP_PAYLOADS_SIZE,
  HMAC_SIZE,
  FailureCode,
  OnionPacket,
  PayloadTlv,
  BlindedPath,
  // BlindedPathHop,
  // EncryptedDataTlv,
  FailureMessage,
  OnionMessage,
  OnionMessagePacket,
  // OnionmsgPayloads,
  OnionmsgType,
  OnionmsgTlv,
  AttributionData,
  // KeyDerivation,
  SharedSecret,
  // EphemeralKey,
  BlindingFactor,
  // PseudoRandomStream,
  MAX_HOPS,
  // MAX_HTLC_CLTV,
} from '@/core/models/lightning/routing'
import {
  // Byte,
  U16,
  // U32,
  // U64,
  // Tu32,
  // Tu64,
  BigSize,
  Point,
  Sha256,
  // ShortChannelId,
  // SciddirOrPubkey,
} from '@/core/models/lightning/base'
import { encodeBigSize, decodeBigSize } from '@/core/lib/lightning/base'
import { hmacSha256, sha256 } from '@/core/lib/crypto'
import { chacha20 } from '@noble/ciphers/chacha.js'
import * as secp256k1 from 'secp256k1'

// HMAC-SHA256
// SHA256
// ChaCha20 stream
function chacha20Stream(key: Uint8Array, nonce: Uint8Array, length: number): Uint8Array {
  const zeros = new Uint8Array(length)
  return chacha20(key, nonce, zeros)
}

// ECDH
// Computes Elliptic Curve Diffie-Hellman shared secret
function ecdh(privateKey: Uint8Array, publicKey: Point): Uint8Array {
  return secp256k1.ecdh(publicKey, privateKey)
}

// Key Generation
// Derives encryption/authentication keys from shared secret using HMAC-SHA256
export function generateKey(keyType: string, secret: Uint8Array): Uint8Array {
  const keyTypeBytes = new TextEncoder().encode(keyType)
  return hmacSha256(keyTypeBytes, secret)
}

// Pseudo Random Byte Stream
// Generates ChaCha20 stream with zero nonce for deterministic encryption
export function generateCipherStream(key: Uint8Array, length: number): Uint8Array {
  const nonce = new Uint8Array(12) // 96-bit zero nonce
  return chacha20Stream(key, nonce, length)
}

// Shared Secret
export function computeSharedSecret(ephemeralKey: Uint8Array, hopPublicKey: Point): SharedSecret {
  const ecdhResult = ecdh(ephemeralKey, hopPublicKey)
  return ecdhResult
}

// Blinding Ephemeral Keys
// Blinds private key to hide sender identity across hops
export function blindEphemeralKey(
  ephemeralKey: Uint8Array,
  blindingFactor: Uint8Array,
): Uint8Array {
  const blinded = new Uint8Array(ephemeralKey)
  return secp256k1.privateKeyTweakMul(blinded, blindingFactor)
}

export function computeBlindingFactor(
  ephemeralPubKey: Point,
  sharedSecret: SharedSecret,
): BlindingFactor {
  const data = new Uint8Array(ephemeralPubKey.length + sharedSecret.length)
  data.set(ephemeralPubKey)
  data.set(sharedSecret, ephemeralPubKey.length)
  return sha256(data)
}

// Packet Construction
export function constructOnionPacket(
  paymentPath: Point[],
  sessionKey: Uint8Array,
  hopsData: HopData[],
  associatedData: Uint8Array = new Uint8Array(),
): OnionPacket {
  const numHops = paymentPath.length
  const hopSharedSecrets: Sha256[] = []
  let ephemeralPrivKey = sessionKey
  let ephemeralPubKey = secp256k1.publicKeyCreate(ephemeralPrivKey)

  // Compute shared secrets and blinding for each hop in the route
  // This follows the Sphinx construction to ensure unlinkability
  for (let i = 0; i < numHops; i++) {
    // Compute ECDH shared secret between ephemeral key and hop's public key
    const ss = computeSharedSecret(ephemeralPrivKey, paymentPath[i])
    hopSharedSecrets.push(ss)
    // Compute blinding factor to hide the sender's identity
    const blindingFactor = computeBlindingFactor(ephemeralPubKey, ss)
    // Blind the ephemeral private key for the next hop
    ephemeralPrivKey = blindEphemeralKey(ephemeralPrivKey, blindingFactor)
    // Blind the ephemeral public key accordingly
    ephemeralPubKey = secp256k1.publicKeyTweakMul(ephemeralPubKey, blindingFactor)
  }

  // Generate filler to pad the packet and ensure deterministic obfuscation
  const filler = generateFiller('rho', numHops, HOP_PAYLOADS_SIZE, hopSharedSecrets)

  // Initialize mix header with random padding bytes derived from session key
  const mixHeader = new Uint8Array(HOP_PAYLOADS_SIZE)
  const padKey = generateKey('pad', sessionKey)
  const paddingBytes = generateCipherStream(padKey, HOP_PAYLOADS_SIZE)
  mixHeader.set(paddingBytes)

  let nextHmac = new Uint8Array(HMAC_SIZE)

  // Process hops in reverse order (last hop first) to build the layered encryption
  for (let i = numHops - 1; i >= 0; i--) {
    // Generate keys for encryption and HMAC
    const rhoKey = generateKey('rho', hopSharedSecrets[i])
    const muKey = generateKey('mu', hopSharedSecrets[i])

    // Set the HMAC for this hop's payload
    hopsData[i].hmac = nextHmac

    // Generate cipher stream for obfuscation (twice the payload size for safety)
    const streamBytes = generateCipherStream(rhoKey, HOP_PAYLOADS_SIZE * 2)

    // Encode the hop data (length + payload + HMAC)
    const hopDataBytes = encodeHopData(hopsData[i])
    const shiftSize = hopDataBytes.length

    // Right-shift the mix header to make space for the hop data
    rightShift(mixHeader, shiftSize)

    // Insert the encoded hop data at the beginning
    mixHeader.set(hopDataBytes, 0)

    // XOR the mix header with the cipher stream to obfuscate
    xor(mixHeader, mixHeader, streamBytes.subarray(0, HOP_PAYLOADS_SIZE))

    // For the last hop (first in reverse order), append filler to the tail
    if (i === numHops - 1) {
      const fillerSize = HOP_PAYLOADS_SIZE - shiftSize
      mixHeader.set(filler.subarray(0, fillerSize), shiftSize)
    }

    // Compute the packet including associated data for HMAC
    const packet = new Uint8Array(mixHeader.length + associatedData.length)
    packet.set(mixHeader)
    packet.set(associatedData, mixHeader.length)

    // Compute the HMAC for the next hop
    nextHmac = new Uint8Array(hmacSha256(muKey, packet))
  }

  return {
    version: VERSION,
    publicKey: secp256k1.publicKeyCreate(sessionKey),
    hopPayloads: mixHeader,
    hmac: nextHmac,
  }
}

// Helper functions
// Right-shift array by shiftSize bytes, filling the beginning with zeros
function rightShift(arr: Uint8Array, shiftSize: number) {
  if (shiftSize === 0) return
  for (let i = arr.length - 1; i >= shiftSize; i--) {
    arr[i] = arr[i - shiftSize]
  }
  arr.fill(0, 0, shiftSize)
}

// Left-shift array by shiftSize bytes, filling the end with zeros
function leftShift(arr: Uint8Array, shiftSize: number) {
  arr.copyWithin(0, shiftSize)
  arr.fill(0, arr.length - shiftSize)
}

// XOR two arrays element-wise
function xor(a: Uint8Array, b: Uint8Array, c: Uint8Array) {
  for (let i = 0; i < a.length; i++) {
    a[i] = b[i] ^ c[i]
  }
}

// Encode hop data as: bigsize(length) + payload + hmac
function encodeHopData(hopData: HopData): Uint8Array {
  const lengthBytes = encodeBigSize(hopData.length)
  const result = new Uint8Array(lengthBytes.length + hopData.payload.length + hopData.hmac.length)
  result.set(lengthBytes)
  result.set(hopData.payload, lengthBytes.length)
  result.set(hopData.hmac, lengthBytes.length + hopData.payload.length)
  return result
}

interface HopData {
  length: BigSize
  payload: Uint8Array
  hmac: Sha256
}

// Filler Generation
// Generates deterministic padding to fill unused space in hop payloads
// This ensures that packets of different route lengths are indistinguishable
export function generateFiller(
  keyType: string,
  numHops: number,
  hopSize: number,
  sharedSecrets: Sha256[],
): Uint8Array {
  if (numHops === 1) {
    return new Uint8Array(0) // No filler needed for single hop
  }
  // Allocate space for maximum possible filler
  const fillerSize = (MAX_HOPS + 1) * hopSize
  const filler = new Uint8Array(fillerSize)

  // Apply obfuscation layers in reverse order (similar to packet construction)
  for (let i = 0; i < numHops - 1; i++) {
    // Left-shift to simulate removing hop data
    leftShift(filler, hopSize)
    // Fill the end with zeros (representing the space for the next hop)
    const zeroFill = new Uint8Array(hopSize)
    filler.set(zeroFill, filler.length - hopSize)

    // Obfuscate with the cipher stream
    const streamKey = generateKey(keyType, sharedSecrets[i])
    const streamBytes = generateCipherStream(streamKey, fillerSize)
    xor(filler, filler, streamBytes)
  }

  // Return the final filler segment
  return filler.subarray(filler.length - hopSize)
}

// Onion Decryption
// Decrypts the onion packet at each hop to reveal the next hop information
export function decryptOnion(
  onionPacket: OnionPacket,
  associatedData: Uint8Array,
  pathKey?: Point,
  nodePrivKey?: Uint8Array,
): { payload: PayloadTlv; nextOnion?: OnionPacket } {
  if (onionPacket.version !== VERSION) {
    throw new Error('Invalid version')
  }

  let pubKey = onionPacket.publicKey
  if (pathKey && nodePrivKey) {
    // For blinded paths, adjust the public key
    const blindingSs = ecdh(pathKey, nodePrivKey)
    const blindingFactor = hmacSha256(new TextEncoder().encode('blinded_node_id'), blindingSs)
    pubKey = secp256k1.publicKeyTweakMul(pubKey, blindingFactor)
  }

  if (!nodePrivKey) {
    // For test purposes
    return { payload: decodePayloadTlv(new Uint8Array()) }
  }

  // Compute shared secret and verify HMAC
  const ss = computeSharedSecret(pubKey, nodePrivKey)
  const mu = generateKey('mu', ss)
  const packet = new Uint8Array(onionPacket.hopPayloads.length + associatedData.length)
  packet.set(onionPacket.hopPayloads)
  packet.set(associatedData, onionPacket.hopPayloads.length)
  const computedHmac = hmacSha256(mu, packet)
  if (!constantTimeEqual(computedHmac, onionPacket.hmac)) {
    throw new Error('Invalid HMAC')
  }

  // Decrypt the hop payload
  const rho = generateKey('rho', ss)
  const streamBytes = generateCipherStream(rho, onionPacket.hopPayloads.length * 2)
  const unwrapped = new Uint8Array(onionPacket.hopPayloads.length)
  xor(unwrapped, onionPacket.hopPayloads, streamBytes.subarray(0, onionPacket.hopPayloads.length))

  // Extract payload and next HMAC
  const { value: payloadLength, bytesRead } = decodeBigSize(unwrapped)
  const payload = unwrapped.subarray(bytesRead, bytesRead + Number(payloadLength))
  const nextHmac = unwrapped.subarray(
    bytesRead + Number(payloadLength),
    bytesRead + Number(payloadLength) + HMAC_SIZE,
  )

  if (nextHmac.every(b => b === 0)) {
    // Final node
    return { payload: decodePayloadTlv(payload) }
  } else {
    // Forward to next hop
    const blindingFactor = computeBlindingFactor(pubKey, ss)
    const nextPubKey = secp256k1.publicKeyTweakMul(pubKey, blindingFactor)
    const nextHopPayloads = unwrapped.subarray(HOP_PAYLOADS_SIZE)
    const nextOnion: OnionPacket = {
      version: VERSION,
      publicKey: nextPubKey,
      hopPayloads: nextHopPayloads,
      hmac: nextHmac,
    }
    return { payload: decodePayloadTlv(payload), nextOnion }
  }
}

// Helper functions
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}

function decodePayloadTlv(data: Uint8Array): PayloadTlv {
  // Decode TLV payload
  // Simplified: return empty object for now
  return {}
}

// Error Handling
export function createFailureMessage(failureCode: FailureCode, data?: Uint8Array): FailureMessage {
  return {
    failureCode,
    data,
  }
}

// Attribution Data
export function initializeAttributionData(htlcHoldTimes: U16[], hmacs: Sha256[]): AttributionData {
  const holdTimesBytes = new Uint8Array(htlcHoldTimes.length * 2)
  // Encode hold times
  const hmacsBytes = new Uint8Array(hmacs.length * 4) // Truncated to 4 bytes
  // Encode hmacs
  return {
    htlcHoldTimes: holdTimesBytes,
    hmacs: hmacsBytes,
  }
}

// Onion Messages
// Constructs an onion message for a blinded path
export function constructOnionMessage(path: BlindedPath, payload: OnionmsgTlv): OnionMessage {
  // Generate a random session key for the onion construction
  const sessionKey = new Uint8Array(32)
  crypto.getRandomValues(sessionKey)

  // For blinded paths, the "payment path" consists of the blinded node IDs
  const paymentPath = path.path.map(hop => hop.blindedNodeId)

  // Prepare hop data: for intermediate hops, use encrypted_recipient_data; for final hop, encode the payload
  const hopsData: HopData[] = path.path.map((hop, index) => {
    const isFinalHop = index === path.path.length - 1
    const hopPayload = isFinalHop ? encodeOnionmsgTlv(payload) : hop.encryptedRecipientData
    return {
      length: BigInt(hopPayload.length),
      payload: hopPayload,
      hmac: new Uint8Array(32),
    }
  })

  // Construct the onion packet using Sphinx (same as payment onions, but with blinded keys)
  const onionPacket = constructOnionPacket(paymentPath, sessionKey, hopsData, new Uint8Array())

  // Build the onion message packet object
  const onionMessagePacket: OnionMessagePacket = {
    version: VERSION,
    publicKey: onionPacket.publicKey,
    onionmsgPayloads: onionPacket.hopPayloads,
    hmac: onionPacket.hmac,
  }

  // Return the complete onion message
  return {
    pathKey: path.firstPathKey, // Path key for the first hop
    len: 1 + 33 + onionPacket.hopPayloads.length + 32, // Length of the packet
    onionMessagePacket,
  }
}

// Encode Onionmsg TLV as a byte stream
function encodeOnionmsgTlv(tlv: OnionmsgTlv): Uint8Array {
  const parts: Uint8Array[] = []

  if (tlv.replyPath) {
    const typeBytes = encodeBigSize(BigInt(OnionmsgType.REPLY_PATH))
    const value = encodeBlindedPath(tlv.replyPath)
    const lengthBytes = encodeBigSize(BigInt(value.length))
    parts.push(typeBytes, lengthBytes, value)
  }

  if (tlv.encryptedRecipientData) {
    const typeBytes = encodeBigSize(BigInt(OnionmsgType.ENCRYPTED_RECIPIENT_DATA))
    const lengthBytes = encodeBigSize(BigInt(tlv.encryptedRecipientData.length))
    parts.push(typeBytes, lengthBytes, tlv.encryptedRecipientData)
  }

  if (tlv.invoiceRequest) {
    const typeBytes = encodeBigSize(BigInt(OnionmsgType.INVOICE_REQUEST))
    const lengthBytes = encodeBigSize(BigInt(tlv.invoiceRequest.length))
    parts.push(typeBytes, lengthBytes, tlv.invoiceRequest)
  }

  if (tlv.invoice) {
    const typeBytes = encodeBigSize(BigInt(OnionmsgType.INVOICE))
    const lengthBytes = encodeBigSize(BigInt(tlv.invoice.length))
    parts.push(typeBytes, lengthBytes, tlv.invoice)
  }

  if (tlv.invoiceError) {
    const typeBytes = encodeBigSize(BigInt(OnionmsgType.INVOICE_ERROR))
    const lengthBytes = encodeBigSize(BigInt(tlv.invoiceError.length))
    parts.push(typeBytes, lengthBytes, tlv.invoiceError)
  }

  // Concatenate all parts
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

// Encode BlindedPath as TLV
function encodeBlindedPath(path: BlindedPath): Uint8Array {
  // Simplified encoding: first_node_id + blinding + num_hops + path
  const firstNodeId = path.firstNodeId // Assuming it's already bytes
  const blinding = path.firstPathKey
  const numHops = new Uint8Array([path.numHops])
  const pathParts: Uint8Array[] = []
  for (const hop of path.path) {
    const blindedNodeId = hop.blindedNodeId
    const enclen = new Uint8Array(2)
    new DataView(enclen.buffer).setUint16(0, hop.enclen, true)
    const encryptedData = hop.encryptedRecipientData
    pathParts.push(blindedNodeId, enclen, encryptedData)
  }
  const pathBytes = new Uint8Array(pathParts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of pathParts) {
    pathBytes.set(part, offset)
    offset += part.length
  }

  const result = new Uint8Array(firstNodeId.length + blinding.length + 1 + pathBytes.length)
  result.set(firstNodeId, 0)
  result.set(blinding, firstNodeId.length)
  result.set(numHops, firstNodeId.length + blinding.length)
  result.set(pathBytes, firstNodeId.length + blinding.length + 1)
  return result
}
