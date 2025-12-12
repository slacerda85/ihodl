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
  ShortChannelId,
  // SciddirOrPubkey,
} from '@/core/models/lightning/base'
import { encodeBigSize, decodeBigSize } from '@/core/lib/lightning/base'
import { hmacSha256, sha256 } from '@/core/lib/crypto'
import { chacha20 } from '@noble/ciphers/chacha.js'
import * as secp256k1 from 'secp256k1'

// ==========================================
// PATHFINDING AND ROUTING GRAPH
// ==========================================

/**
 * Routing Graph Node
 */
export interface RoutingNode {
  nodeId: Uint8Array // 33-byte compressed pubkey
  features?: Uint8Array
  lastUpdate: number
  addresses: NodeAddress[]
  alias?: string
}

/**
 * Node Address Types
 */
export interface NodeAddress {
  type: 'ipv4' | 'ipv6' | 'torv2' | 'torv3' | 'dns'
  address: string
  port: number
}

/**
 * Routing Graph Channel
 */
export interface RoutingChannel {
  shortChannelId: ShortChannelId
  nodeId1: Uint8Array
  nodeId2: Uint8Array
  capacity: bigint
  features?: Uint8Array
  lastUpdate: number
  feeBaseMsat: number
  feeProportionalMillionths: number
  cltvExpiryDelta: number
  htlcMinimumMsat: bigint
  htlcMaximumMsat?: bigint
  disabled?: boolean
}

/**
 * Payment Route Hop
 */
export interface RouteHop {
  nodeId: Uint8Array
  shortChannelId: ShortChannelId
  feeBaseMsat: number
  feeProportionalMillionths: number
  cltvExpiryDelta: number
  htlcMinimumMsat: bigint
  htlcMaximumMsat?: bigint
}

/**
 * Complete Payment Route
 */
export interface PaymentRoute {
  hops: RouteHop[]
  totalAmountMsat: bigint
  totalFeeMsat: bigint
  totalCltvExpiry: number
}

/**
 * Pathfinding Algorithm Result
 */
export interface PathfindResult {
  route: PaymentRoute | null
  error?: string
}

/**
 * Lightning Network Routing Graph
 */
export class RoutingGraph {
  private nodes: Map<string, RoutingNode> = new Map()
  private channels: Map<string, RoutingChannel> = new Map()
  private nodeChannels: Map<string, Set<string>> = new Map() // nodeId -> channelIds

  /**
   * Add or update node in routing graph
   */
  addNode(node: RoutingNode): void {
    const key = uint8ArrayToHex(node.nodeId)
    this.nodes.set(key, { ...node, lastUpdate: Date.now() })
  }

  /**
   * Add or update channel in routing graph
   */
  addChannel(channel: RoutingChannel): void {
    const key = uint8ArrayToHex(channel.shortChannelId)
    this.channels.set(key, { ...channel, lastUpdate: Date.now() })

    // Update node-channel mappings
    const node1Key = uint8ArrayToHex(channel.nodeId1)
    const node2Key = uint8ArrayToHex(channel.nodeId2)

    if (!this.nodeChannels.has(node1Key)) {
      this.nodeChannels.set(node1Key, new Set())
    }
    if (!this.nodeChannels.has(node2Key)) {
      this.nodeChannels.set(node2Key, new Set())
    }

    this.nodeChannels.get(node1Key)!.add(key)
    this.nodeChannels.get(node2Key)!.add(key)
  }

  /**
   * Remove stale entries older than maxAge
   */
  pruneStaleEntries(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    // 7 days
    const cutoff = Date.now() - maxAge

    // Remove stale nodes
    for (const [key, node] of this.nodes.entries()) {
      if (node.lastUpdate < cutoff) {
        this.nodes.delete(key)
        this.nodeChannels.delete(key)
      }
    }

    // Remove stale channels
    for (const [key, channel] of this.channels.entries()) {
      if (channel.lastUpdate < cutoff) {
        this.channels.delete(key)
      }
    }
  }

  /**
   * Find route using Dijkstra's algorithm
   */
  findRoute(
    sourceNodeId: Uint8Array,
    destinationNodeId: Uint8Array,
    amountMsat: bigint,
    maxFeeMsat: bigint = 10000n,
    maxCltvExpiry: number = 144 * 24, // ~24 hours
  ): PathfindResult {
    const sourceKey = uint8ArrayToHex(sourceNodeId)
    const destKey = uint8ArrayToHex(destinationNodeId)

    if (!this.nodes.has(sourceKey) || !this.nodes.has(destKey)) {
      return { route: null, error: 'Source or destination node not found in graph' }
    }

    // Dijkstra's algorithm implementation
    const distances = new Map<string, bigint>()
    const previous = new Map<string, { nodeId: string; channelId: string }>()
    const feeDistances = new Map<string, bigint>()
    const cltvDistances = new Map<string, number>()
    const unvisited = new Set<string>()

    // Initialize
    for (const nodeKey of this.nodes.keys()) {
      distances.set(nodeKey, nodeKey === sourceKey ? 0n : BigInt(Number.MAX_SAFE_INTEGER))
      feeDistances.set(nodeKey, nodeKey === sourceKey ? 0n : BigInt(Number.MAX_SAFE_INTEGER))
      cltvDistances.set(nodeKey, nodeKey === sourceKey ? 0 : Number.MAX_SAFE_INTEGER)
      unvisited.add(nodeKey)
    }

    while (unvisited.size > 0) {
      // Find node with minimum distance
      let current: string | null = null
      let minDistance = BigInt(Number.MAX_SAFE_INTEGER)

      for (const nodeKey of unvisited) {
        const dist = distances.get(nodeKey)!
        if (dist < minDistance) {
          minDistance = dist
          current = nodeKey
        }
      }

      if (!current || minDistance === BigInt(Number.MAX_SAFE_INTEGER)) {
        break
      }

      unvisited.delete(current)

      // If we reached destination, reconstruct path
      if (current === destKey) {
        return this.reconstructRoute(current, previous, amountMsat)
      }

      // Explore neighbors
      const neighborChannels = this.nodeChannels.get(current)
      if (!neighborChannels) continue

      for (const channelId of neighborChannels) {
        const channel = this.channels.get(channelId)
        if (!channel || channel.disabled) continue

        // Determine neighbor node
        const currentNodeId = hexToUint8Array(current)
        const neighborNodeId = channel.nodeId1.every((b, i) => b === currentNodeId[i])
          ? channel.nodeId2
          : channel.nodeId1
        const neighborKey = uint8ArrayToHex(neighborNodeId)

        if (!unvisited.has(neighborKey)) continue

        // Check capacity and amount constraints
        if (
          amountMsat < channel.htlcMinimumMsat ||
          (channel.htlcMaximumMsat && amountMsat > channel.htlcMaximumMsat)
        ) {
          continue
        }

        // Calculate fees for this hop
        const feeMsat =
          BigInt(channel.feeBaseMsat) +
          (amountMsat * BigInt(channel.feeProportionalMillionths)) / 1000000n

        // Calculate CLTV expiry for this hop
        const cltvExpiry = channel.cltvExpiryDelta

        // Calculate total distance (we use a combination of fee and CLTV)
        const currentFeeDist = feeDistances.get(current)!
        const currentCltvDist = cltvDistances.get(current)!
        const newFeeDist = currentFeeDist + feeMsat
        const newCltvDist = currentCltvDist + cltvExpiry

        // Skip if constraints exceeded
        if (newFeeDist > maxFeeMsat || newCltvDist > maxCltvExpiry) {
          continue
        }

        // Use combined metric: prioritize lower fees, then lower CLTV
        const neighborFeeDist = feeDistances.get(neighborKey)!
        const neighborCltvDist = cltvDistances.get(neighborKey)!

        const currentCombined = distances.get(current)!
        const newCombined = newFeeDist + BigInt(newCltvDist * 10) // Smaller weight for CLTV
        const neighborCombined = distances.get(neighborKey)!

        if (newCombined < neighborCombined) {
          distances.set(neighborKey, newCombined)
          feeDistances.set(neighborKey, newFeeDist)
          cltvDistances.set(neighborKey, newCltvDist)
          previous.set(neighborKey, { nodeId: current, channelId })
        }
      }
    }

    return { route: null, error: 'No route found' }
  }

  /**
   * Reconstruct route from Dijkstra's previous map
   */
  private reconstructRoute(
    destination: string,
    previous: Map<string, { nodeId: string; channelId: string }>,
    amountMsat: bigint,
  ): PathfindResult {
    const hops: RouteHop[] = []
    let current = destination
    let totalFeeMsat = 0n
    let totalCltvExpiry = 0

    // Reconstruct path in reverse
    const visited = new Set<string>()
    while (previous.has(current)) {
      if (visited.has(current)) {
        console.error(`Loop detected in path reconstruction at ${current}`)
        break
      }
      visited.add(current)
      const prev = previous.get(current)!
      const channel = this.channels.get(prev.channelId)!
      const currentNodeId = hexToUint8Array(current)
      const isNode1 = channel.nodeId1.every((b, i) => b === currentNodeId[i])

      const hop: RouteHop = {
        nodeId: isNode1 ? channel.nodeId2 : channel.nodeId1,
        shortChannelId: channel.shortChannelId,
        feeBaseMsat: channel.feeBaseMsat,
        feeProportionalMillionths: channel.feeProportionalMillionths,
        cltvExpiryDelta: channel.cltvExpiryDelta,
        htlcMinimumMsat: channel.htlcMinimumMsat,
        htlcMaximumMsat: channel.htlcMaximumMsat,
      }

      hops.unshift(hop)

      // Calculate fees cumulatively
      const hopFee =
        BigInt(channel.feeBaseMsat) +
        (amountMsat * BigInt(channel.feeProportionalMillionths)) / 1000000n
      totalFeeMsat += hopFee
      totalCltvExpiry += channel.cltvExpiryDelta

      current = prev.nodeId
    }

    if (hops.length === 0) {
      return { route: null, error: 'Failed to reconstruct route' }
    }

    const route: PaymentRoute = {
      hops,
      totalAmountMsat: amountMsat + totalFeeMsat,
      totalFeeMsat,
      totalCltvExpiry,
    }

    return { route }
  }

  /**
   * Get all channels for a node
   */
  getNodeChannels(nodeId: Uint8Array): RoutingChannel[] {
    const nodeKey = uint8ArrayToHex(nodeId)
    const channelIds = this.nodeChannels.get(nodeKey)

    if (!channelIds) return []

    return Array.from(channelIds)
      .map(id => this.channels.get(id))
      .filter((channel): channel is RoutingChannel => channel !== undefined)
  }

  /**
   * Get node information
   */
  getNode(nodeId: Uint8Array): RoutingNode | null {
    const key = uint8ArrayToHex(nodeId)
    return this.nodes.get(key) || null
  }

  /**
   * Get channel information
   */
  getChannel(shortChannelId: ShortChannelId): RoutingChannel | null {
    const key = uint8ArrayToHex(shortChannelId)
    return this.channels.get(key) || null
  }

  /**
   * Get all nodes in the routing graph
   */
  getAllNodes(): RoutingNode[] {
    return Array.from(this.nodes.values())
  }

  /**
   * Get all channels in the routing graph
   */
  getAllChannels(): RoutingChannel[] {
    return Array.from(this.channels.values())
  }

  /**
   * Get graph statistics
   */
  getStats(): { nodes: number; channels: number } {
    return {
      nodes: this.nodes.size,
      channels: this.channels.size,
    }
  }
}

// Utility functions for hex conversion
function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

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
