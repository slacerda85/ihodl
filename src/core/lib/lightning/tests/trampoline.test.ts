/**
 * Trampoline Routing Tests
 *
 * Tests for trampoline routing implementation:
 * - Route creation with fee levels
 * - TLV encoding/decoding
 * - Sphinx onion construction
 * - Fee calculation and retry logic
 * - Trampoline node management
 *
 * Reference: https://github.com/lightning/bolts/pull/836
 */

import {
  TrampolineRouter,
  createTrampolineRouter,
  supportsTrampolineRouting,
  DEFAULT_FEE_LEVELS,
  KNOWN_TRAMPOLINE_NODES,
  TrampolineNode,
  TrampolineRoute,
  TrampolineTlvType,
} from '../trampoline'
import { uint8ArrayToHex, hexToUint8Array } from '@/core/lib/utils'
import * as secp256k1 from '@noble/secp256k1'

// Helper: Create valid test node ID from private key (33-byte compressed pubkey)
function createValidNodeId(index: number): Uint8Array {
  // Create a deterministic 32-byte private key from index
  const privateKey = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    privateKey[i] = (index + i * 7 + 1) % 256
  }
  // Ensure non-zero
  if (privateKey.every(b => b === 0)) {
    privateKey[31] = 1
  }
  // Derive public key
  return secp256k1.getPublicKey(privateKey, true)
}

// Helper: Create test node ID for non-crypto tests (33-byte mock pubkey)
function createTestNodeId(index: number): Uint8Array {
  const nodeId = new Uint8Array(33)
  nodeId[0] = 0x02 // Compressed pubkey prefix (even Y)
  for (let i = 1; i < 32; i++) {
    nodeId[i] = (index + i) % 256
  }
  nodeId[32] = index
  return nodeId
}

// Helper: Create test payment hash (32 bytes)
function createTestPaymentHash(seed: string): Uint8Array {
  const encoder = new TextEncoder()
  const data = encoder.encode(seed)
  const hash = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    hash[i] = data[i % data.length] ^ (i * 17)
  }
  return hash
}

// Helper: Create test payment secret (32 bytes)
function createTestPaymentSecret(seed: string): Uint8Array {
  return createTestPaymentHash(`secret-${seed}`)
}

// Helper: Create custom trampoline node with valid pubkey
function createTestTrampolineNode(index: number): TrampolineNode {
  return {
    nodeId: createValidNodeId(100 + index),
    alias: `Trampoline${index}`,
    feeBaseMsat: BigInt(1000 + index * 100),
    feeProportionalMillionths: 100 + index * 10,
    cltvExpiryDelta: 144 + index * 10,
  }
}

// Helper: Create test trampoline node with mock pubkey (for non-crypto tests)
function createMockTrampolineNode(index: number): TrampolineNode {
  return {
    nodeId: createTestNodeId(100 + index),
    alias: `Trampoline${index}`,
    feeBaseMsat: BigInt(1000 + index * 100),
    feeProportionalMillionths: 100 + index * 10,
    cltvExpiryDelta: 144 + index * 10,
  }
}

describe('TrampolineRouter Initialization', () => {
  it('should create router with default trampoline nodes', () => {
    const router = createTrampolineRouter()
    const nodes = router.getTrampolineNodes()

    expect(nodes.length).toBe(KNOWN_TRAMPOLINE_NODES.length)
    expect(nodes[0].alias).toBe('ACINQ')
  })

  it('should create router with custom trampoline nodes', () => {
    const customNodes = [createMockTrampolineNode(1), createMockTrampolineNode(2)]

    const router = createTrampolineRouter(customNodes)
    const nodes = router.getTrampolineNodes()

    expect(nodes.length).toBe(2)
    expect(nodes[0].alias).toBe('Trampoline1')
    expect(nodes[1].alias).toBe('Trampoline2')
  })

  it('should create router with empty nodes list', () => {
    const router = createTrampolineRouter([])
    expect(router.getTrampolineNodes().length).toBe(0)
  })
})

describe('Trampoline Node Management', () => {
  let router: TrampolineRouter

  beforeEach(() => {
    router = createTrampolineRouter([])
  })

  it('should add trampoline node', () => {
    const node = createMockTrampolineNode(1)
    router.addTrampolineNode(node)

    const nodes = router.getTrampolineNodes()
    expect(nodes.length).toBe(1)
    expect(nodes[0].alias).toBe('Trampoline1')
  })

  it('should not add duplicate node', () => {
    const node = createMockTrampolineNode(1)
    router.addTrampolineNode(node)
    router.addTrampolineNode(node) // Duplicate

    const nodes = router.getTrampolineNodes()
    expect(nodes.length).toBe(1)
  })

  it('should remove trampoline node', () => {
    const node1 = createMockTrampolineNode(1)
    const node2 = createMockTrampolineNode(2)

    router.addTrampolineNode(node1)
    router.addTrampolineNode(node2)

    expect(router.getTrampolineNodes().length).toBe(2)

    router.removeTrampolineNode(node1.nodeId)

    const nodes = router.getTrampolineNodes()
    expect(nodes.length).toBe(1)
    expect(nodes[0].alias).toBe('Trampoline2')
  })

  it('should select trampoline node', () => {
    const node = createMockTrampolineNode(1)
    router.addTrampolineNode(node)

    const selected = router.selectTrampolineNode(createTestNodeId(99))

    expect(selected).not.toBeNull()
    expect(selected!.alias).toBe('Trampoline1')
  })

  it('should return null when no trampoline nodes available', () => {
    const selected = router.selectTrampolineNode(createTestNodeId(99))
    expect(selected).toBeNull()
  })
})

describe('Fee Calculation', () => {
  let router: TrampolineRouter

  beforeEach(() => {
    router = createTrampolineRouter()
  })

  it('should calculate fee for level 0 (zero fee)', () => {
    const amount = 1000000n // 1000 sats
    const fee = router.calculateFeeForLevel(amount, 0)

    expect(fee).toBe(0n) // Level 0 has zero fees
  })

  it('should calculate fee for level 1', () => {
    const amount = 1000000n // 1000 sats
    const fee = router.calculateFeeForLevel(amount, 1)

    // Level 1: base=1000, proportional=100 (0.01%)
    // Fee = 1000 + (1000000 * 100 / 1000000) = 1000 + 100 = 1100
    expect(fee).toBe(1100n)
  })

  it('should calculate fee for level 2', () => {
    const amount = 10000000n // 10000 sats
    const fee = router.calculateFeeForLevel(amount, 2)

    // Level 2: base=3000, proportional=500 (0.05%)
    // Fee = 3000 + (10000000 * 500 / 1000000) = 3000 + 5000 = 8000
    expect(fee).toBe(8000n)
  })

  it('should calculate fee for level 3', () => {
    const amount = 100000000n // 100000 sats (0.001 BTC)
    const fee = router.calculateFeeForLevel(amount, 3)

    // Level 3: base=5000, proportional=1000 (0.1%)
    // Fee = 5000 + (100000000 * 1000 / 1000000) = 5000 + 100000 = 105000
    expect(fee).toBe(105000n)
  })

  it('should clamp level to max available', () => {
    const amount = 1000000n
    const fee = router.calculateFeeForLevel(amount, 100) // Level doesn't exist

    // Should use last level (3)
    const expectedFee = router.calculateFeeForLevel(amount, 3)
    expect(fee).toBe(expectedFee)
  })

  it('should get CLTV delta for level', () => {
    expect(router.getCltvDeltaForLevel(0)).toBe(576)
    expect(router.getCltvDeltaForLevel(1)).toBe(576)
    expect(router.getCltvDeltaForLevel(2)).toBe(576)
    expect(router.getCltvDeltaForLevel(3)).toBe(576)
  })
})

describe('Fee Level Management', () => {
  let router: TrampolineRouter

  beforeEach(() => {
    router = createTrampolineRouter()
  })

  it('should start at fee level 0', () => {
    expect(router.getCurrentFeeLevel()).toBe(0)
  })

  it('should increment fee level', () => {
    expect(router.getCurrentFeeLevel()).toBe(0)

    router.incrementFeeLevel()
    expect(router.getCurrentFeeLevel()).toBe(1)

    router.incrementFeeLevel()
    expect(router.getCurrentFeeLevel()).toBe(2)

    router.incrementFeeLevel()
    expect(router.getCurrentFeeLevel()).toBe(3)
  })

  it('should not exceed max fee level', () => {
    for (let i = 0; i < 10; i++) {
      router.incrementFeeLevel()
    }

    expect(router.getCurrentFeeLevel()).toBe(3) // Max is 3
  })

  it('should reset fee level', () => {
    router.incrementFeeLevel()
    router.incrementFeeLevel()
    expect(router.getCurrentFeeLevel()).toBe(2)

    router.resetFeeLevel()
    expect(router.getCurrentFeeLevel()).toBe(0)
  })

  it('should check if can retry', () => {
    expect(router.canRetry()).toBe(true) // Level 0

    router.incrementFeeLevel()
    router.incrementFeeLevel()
    router.incrementFeeLevel() // Now at level 3

    expect(router.canRetry()).toBe(false) // Can't go higher
  })
})

describe('Route Creation', () => {
  let router: TrampolineRouter

  beforeEach(() => {
    router = createTrampolineRouter()
  })

  it('should create trampoline route', () => {
    const destination = createTestNodeId(99)
    const amount = 1000000n // 1000 sats
    const currentBlockHeight = 800000

    const route = router.createTrampolineRoute(destination, amount, currentBlockHeight, 0)

    expect(route).not.toBeNull()
    expect(route!.hops.length).toBe(2)
    expect(route!.totalAmountMsat).toBe(amount) // Level 0 has no fees
    expect(route!.totalFeeMsat).toBe(0n)
  })

  it('should create route with fees at higher levels', () => {
    const destination = createTestNodeId(99)
    const amount = 1000000n
    const currentBlockHeight = 800000

    const route = router.createTrampolineRoute(destination, amount, currentBlockHeight, 1)

    expect(route).not.toBeNull()
    expect(route!.totalAmountMsat).toBeGreaterThan(amount)
    expect(route!.totalFeeMsat).toBeGreaterThan(0n)
    expect(route!.totalAmountMsat).toBe(amount + route!.totalFeeMsat)
  })

  it('should include correct hops', () => {
    const destination = createTestNodeId(99)
    const amount = 1000000n
    const currentBlockHeight = 800000

    const route = router.createTrampolineRoute(destination, amount, currentBlockHeight, 0)

    expect(route).not.toBeNull()

    // First hop: to trampoline
    expect(route!.hops[0].nodeId).toEqual(KNOWN_TRAMPOLINE_NODES[0].nodeId)
    expect(route!.hops[0].amountMsat).toBe(route!.totalAmountMsat)

    // Second hop: to destination
    expect(route!.hops[1].nodeId).toEqual(destination)
    expect(route!.hops[1].amountMsat).toBe(amount)
  })

  it('should calculate CLTV correctly', () => {
    const destination = createTestNodeId(99)
    const amount = 1000000n
    const currentBlockHeight = 800000

    const route = router.createTrampolineRoute(destination, amount, currentBlockHeight, 0)

    expect(route).not.toBeNull()

    // Destination CLTV
    const destinationCltv = route!.hops[1].cltvExpiry
    expect(destinationCltv).toBe(currentBlockHeight + 576) // Default level delta

    // Trampoline CLTV should be higher
    const trampolineCltv = route!.hops[0].cltvExpiry
    expect(trampolineCltv).toBeGreaterThan(destinationCltv)
  })

  it('should return null when no trampoline nodes', () => {
    const emptyRouter = createTrampolineRouter([])
    const destination = createTestNodeId(99)

    const route = emptyRouter.createTrampolineRoute(destination, 1000000n, 800000, 0)

    expect(route).toBeNull()
  })
})

describe('TLV Encoding', () => {
  let router: TrampolineRouter

  beforeEach(() => {
    router = createTrampolineRouter()
  })

  it('should encode trampoline payload with basic fields', () => {
    const payload = {
      amtToForward: 1000000n,
      outgoingCltvValue: 800000,
    }

    const encoded = router.encodeTrampolinePayload(payload)

    expect(encoded.length).toBeGreaterThan(0)

    // Should contain type 2 (amt_to_forward)
    expect(encoded[0]).toBe(TrampolineTlvType.AMT_TO_FORWARD)
  })

  it('should encode payload with outgoing node ID', () => {
    const outgoingNodeId = createTestNodeId(5)

    const payload = {
      amtToForward: 1000000n,
      outgoingCltvValue: 800000,
      outgoingNodeId,
    }

    const encoded = router.encodeTrampolinePayload(payload)

    // Should contain the node ID somewhere
    const encodedHex = uint8ArrayToHex(encoded)
    const nodeIdHex = uint8ArrayToHex(outgoingNodeId)

    expect(encodedHex).toContain(nodeIdHex)
  })

  it('should encode payload with payment secret', () => {
    const paymentSecret = createTestPaymentSecret('test')

    const payload = {
      amtToForward: 1000000n,
      outgoingCltvValue: 800000,
      paymentSecret,
      totalAmountMsat: 1000000n,
    }

    const encoded = router.encodeTrampolinePayload(payload)

    // Should contain payment_data type (8)
    let hasPaymentData = false
    for (let i = 0; i < encoded.length - 1; i++) {
      if (encoded[i] === TrampolineTlvType.PAYMENT_DATA) {
        hasPaymentData = true
        break
      }
    }
    expect(hasPaymentData).toBe(true)
  })

  it('should encode payload with all fields', () => {
    const outgoingNodeId = createTestNodeId(5)
    const paymentSecret = createTestPaymentSecret('test')
    const invoiceFeatures = new Uint8Array([0x01, 0x02])
    const invoiceRoutingInfo = new Uint8Array([0x03, 0x04, 0x05])

    const payload = {
      amtToForward: 5000000n,
      outgoingCltvValue: 850000,
      outgoingNodeId,
      paymentSecret,
      totalAmountMsat: 5000000n,
      invoiceFeatures,
      invoiceRoutingInfo,
    }

    const encoded = router.encodeTrampolinePayload(payload)

    // Should have substantial length with all fields
    // 33 (nodeId) + 32 (secret) + overhead bytes
    expect(encoded.length).toBeGreaterThan(70)
  })
})

describe('Trampoline Onion Construction', () => {
  // Note: These tests require valid EC points for the Sphinx ECDH
  // The KNOWN_TRAMPOLINE_NODES have valid pubkeys, but our test destination does not
  // These tests verify route creation and structure, not actual crypto operations

  let router: TrampolineRouter

  beforeEach(() => {
    // Use router with valid trampoline nodes
    router = createTrampolineRouter()
  })

  it('should create route with valid structure', () => {
    const destination = createValidNodeId(99)
    const amount = 1000000n
    const currentBlockHeight = 800000

    const route = router.createTrampolineRoute(destination, amount, currentBlockHeight, 0)
    expect(route).not.toBeNull()
    expect(route!.hops.length).toBe(2)
    expect(route!.hops[0].nodeId).toEqual(KNOWN_TRAMPOLINE_NODES[0].nodeId)
    expect(route!.hops[1].nodeId).toEqual(destination)
  })

  it('should create trampoline onion with valid keys', () => {
    // Create a router with valid test trampoline nodes
    const validTrampolineNode = createTestTrampolineNode(1)
    const validRouter = createTrampolineRouter([validTrampolineNode])

    const destination = createValidNodeId(99)
    const amount = 1000000n
    const currentBlockHeight = 800000

    const route = validRouter.createTrampolineRoute(destination, amount, currentBlockHeight, 0)
    expect(route).not.toBeNull()

    const paymentHash = createTestPaymentHash('test')
    const paymentSecret = createTestPaymentSecret('test')
    const sessionKey = new Uint8Array(32)
    sessionKey.fill(0x42)
    // Ensure session key is valid
    sessionKey[0] = 0x01

    const onion = validRouter.createTrampolineOnion(route!, paymentHash, paymentSecret, sessionKey)

    // Onion structure: version (1) + ephemeral_pubkey (33) + hop_payloads (650) + hmac (32)
    expect(onion.length).toBe(1 + 33 + 650 + 32)

    // Version should be 0
    expect(onion[0]).toBe(0)

    // Ephemeral pubkey should be valid compressed key
    expect(onion[1]).toBeGreaterThanOrEqual(0x02)
    expect(onion[1]).toBeLessThanOrEqual(0x03)
  })

  it('should create different onions with different session keys', () => {
    const validTrampolineNode = createTestTrampolineNode(1)
    const validRouter = createTrampolineRouter([validTrampolineNode])

    const destination = createValidNodeId(99)
    const amount = 1000000n
    const currentBlockHeight = 800000

    const route = validRouter.createTrampolineRoute(destination, amount, currentBlockHeight, 0)!
    const paymentHash = createTestPaymentHash('test')
    const paymentSecret = createTestPaymentSecret('test')

    const sessionKey1 = new Uint8Array(32)
    sessionKey1.fill(0x11)
    sessionKey1[0] = 0x01

    const sessionKey2 = new Uint8Array(32)
    sessionKey2.fill(0x22)
    sessionKey2[0] = 0x01

    const onion1 = validRouter.createTrampolineOnion(route, paymentHash, paymentSecret, sessionKey1)
    const onion2 = validRouter.createTrampolineOnion(route, paymentHash, paymentSecret, sessionKey2)

    // Onions should be different
    expect(uint8ArrayToHex(onion1)).not.toBe(uint8ArrayToHex(onion2))
  })

  it('should generate random session key if not provided', () => {
    const validTrampolineNode = createTestTrampolineNode(1)
    const validRouter = createTrampolineRouter([validTrampolineNode])

    const destination = createValidNodeId(99)
    const amount = 1000000n
    const currentBlockHeight = 800000

    const route = validRouter.createTrampolineRoute(destination, amount, currentBlockHeight, 0)!
    const paymentHash = createTestPaymentHash('test')
    const paymentSecret = createTestPaymentSecret('test')

    const onion1 = validRouter.createTrampolineOnion(route, paymentHash, paymentSecret)
    const onion2 = validRouter.createTrampolineOnion(route, paymentHash, paymentSecret)

    // Should be different due to random session keys
    expect(uint8ArrayToHex(onion1)).not.toBe(uint8ArrayToHex(onion2))
  })
})

describe('Outer Onion Encapsulation', () => {
  let router: TrampolineRouter

  beforeEach(() => {
    router = createTrampolineRouter()
  })

  it('should encapsulate trampoline onion for normal onion', () => {
    const trampolineOnion = new Uint8Array(716) // Typical size
    trampolineOnion.fill(0x42)

    const amount = 1000000n
    const cltvExpiry = 800576

    const payload = router.encapsulateForNormalOnion(trampolineOnion, amount, cltvExpiry)

    // Should have TLV structure
    expect(payload.length).toBeGreaterThan(trampolineOnion.length)

    // Should contain amt_to_forward (type 2) and outgoing_cltv_value (type 4)
    expect(payload[0]).toBe(2) // First TLV type
  })
})

describe('Complete Payment Creation', () => {
  it('should create complete trampoline payment with valid keys', () => {
    const validTrampolineNode = createTestTrampolineNode(1)
    const router = createTrampolineRouter([validTrampolineNode])

    const destination = createValidNodeId(99)
    const amount = 1000000n
    const paymentHash = createTestPaymentHash('payment')
    const paymentSecret = createTestPaymentSecret('payment')
    const currentBlockHeight = 800000

    const result = router.createTrampolinePayment(
      destination,
      amount,
      paymentHash,
      paymentSecret,
      currentBlockHeight,
      0,
    )

    expect(result).not.toBeNull()
    expect(result!.outerOnion.length).toBeGreaterThan(0)
    expect(result!.trampolineOnion.length).toBe(1 + 33 + 650 + 32)
    expect(result!.sessionKey.length).toBe(32)
  })

  it('should create payment with current fee level', () => {
    const validTrampolineNode = createTestTrampolineNode(1)
    const router = createTrampolineRouter([validTrampolineNode])

    const destination = createValidNodeId(99)
    const amount = 1000000n
    const paymentHash = createTestPaymentHash('payment')
    const paymentSecret = createTestPaymentSecret('payment')
    const currentBlockHeight = 800000

    // Increment fee level
    router.incrementFeeLevel()
    router.incrementFeeLevel()

    const result = router.createTrampolinePayment(
      destination,
      amount,
      paymentHash,
      paymentSecret,
      currentBlockHeight,
    )

    // Should use current fee level (2)
    expect(result).not.toBeNull()
  })

  it('should return null when no trampoline nodes', () => {
    const emptyRouter = createTrampolineRouter([])
    const destination = createTestNodeId(99)
    const paymentHash = createTestPaymentHash('payment')
    const paymentSecret = createTestPaymentSecret('payment')

    const result = emptyRouter.createTrampolinePayment(
      destination,
      1000000n,
      paymentHash,
      paymentSecret,
      800000,
    )

    expect(result).toBeNull()
  })
})

describe('Retry Logic', () => {
  let router: TrampolineRouter

  beforeEach(() => {
    router = createTrampolineRouter()
  })

  it('should retry with higher fee on FEE_INSUFFICIENT', () => {
    const FEE_INSUFFICIENT = 0x100c
    expect(router.getCurrentFeeLevel()).toBe(0)

    const shouldRetry = router.shouldRetryWithHigherFee(FEE_INSUFFICIENT)

    expect(shouldRetry).toBe(true)
    expect(router.getCurrentFeeLevel()).toBe(1)
  })

  it('should retry with higher fee on EXPIRY_TOO_SOON', () => {
    const EXPIRY_TOO_SOON = 0x100e
    const shouldRetry = router.shouldRetryWithHigherFee(EXPIRY_TOO_SOON)

    expect(shouldRetry).toBe(true)
    expect(router.getCurrentFeeLevel()).toBe(1)
  })

  it('should retry with higher fee on TEMPORARY_CHANNEL_FAILURE', () => {
    const TEMPORARY_CHANNEL_FAILURE = 0x1007
    const shouldRetry = router.shouldRetryWithHigherFee(TEMPORARY_CHANNEL_FAILURE)

    expect(shouldRetry).toBe(true)
    expect(router.getCurrentFeeLevel()).toBe(1)
  })

  it('should not retry on permanent errors', () => {
    const UNKNOWN_PAYMENT_HASH = 0x400b
    const shouldRetry = router.shouldRetryWithHigherFee(UNKNOWN_PAYMENT_HASH)

    expect(shouldRetry).toBe(false)
    expect(router.getCurrentFeeLevel()).toBe(0)
  })

  it('should not retry when at max fee level', () => {
    const FEE_INSUFFICIENT = 0x100c

    // Max out fee level
    for (let i = 0; i < 10; i++) {
      router.incrementFeeLevel()
    }
    expect(router.getCurrentFeeLevel()).toBe(3)

    const shouldRetry = router.shouldRetryWithHigherFee(FEE_INSUFFICIENT)

    expect(shouldRetry).toBe(false)
  })
})

describe('Feature Detection', () => {
  it('should detect trampoline support in features', () => {
    // Feature bit 56 is in byte 7 from the end
    const featuresWithTrampoline = new Uint8Array(8)
    featuresWithTrampoline[0] = 0x01 // Bit 56 set (byte 7 from end when length is 8)

    expect(supportsTrampolineRouting(featuresWithTrampoline)).toBe(true)
  })

  it('should detect trampoline optional support', () => {
    const featuresWithTrampolineOptional = new Uint8Array(8)
    featuresWithTrampolineOptional[0] = 0x02 // Bit 57 set

    expect(supportsTrampolineRouting(featuresWithTrampolineOptional)).toBe(true)
  })

  it('should return false for features without trampoline', () => {
    const featuresWithoutTrampoline = new Uint8Array(8)
    featuresWithoutTrampoline[0] = 0x00

    expect(supportsTrampolineRouting(featuresWithoutTrampoline)).toBe(false)
  })

  it('should return false for too short features', () => {
    const shortFeatures = new Uint8Array(4)
    expect(supportsTrampolineRouting(shortFeatures)).toBe(false)
  })
})

describe('Default Fee Levels', () => {
  it('should have correct structure', () => {
    expect(DEFAULT_FEE_LEVELS.length).toBe(4)

    for (let i = 0; i < DEFAULT_FEE_LEVELS.length; i++) {
      const level = DEFAULT_FEE_LEVELS[i]
      expect(level.level).toBe(i)
      expect(typeof level.feeBaseMsat).toBe('bigint')
      expect(typeof level.feeProportionalMillionths).toBe('number')
      expect(typeof level.cltvExpiryDelta).toBe('number')
    }
  })

  it('should have increasing fees', () => {
    for (let i = 1; i < DEFAULT_FEE_LEVELS.length; i++) {
      const prev = DEFAULT_FEE_LEVELS[i - 1]
      const curr = DEFAULT_FEE_LEVELS[i]

      expect(curr.feeBaseMsat).toBeGreaterThanOrEqual(prev.feeBaseMsat)
      expect(curr.feeProportionalMillionths).toBeGreaterThanOrEqual(prev.feeProportionalMillionths)
    }
  })

  it('should have level 0 with zero fees', () => {
    const level0 = DEFAULT_FEE_LEVELS[0]
    expect(level0.feeBaseMsat).toBe(0n)
    expect(level0.feeProportionalMillionths).toBe(0)
  })
})

describe('Known Trampoline Nodes', () => {
  it('should have ACINQ nodes', () => {
    const acinq = KNOWN_TRAMPOLINE_NODES.find(n => n.alias === 'ACINQ')
    expect(acinq).toBeDefined()
    expect(acinq!.nodeId.length).toBe(33)
    expect(acinq!.nodeId[0]).toBe(0x03) // Compressed pubkey prefix
  })

  it('should have valid node IDs', () => {
    for (const node of KNOWN_TRAMPOLINE_NODES) {
      expect(node.nodeId.length).toBe(33)
      // First byte should be 0x02 or 0x03 (compressed pubkey)
      expect(node.nodeId[0] === 0x02 || node.nodeId[0] === 0x03).toBe(true)
    }
  })

  it('should have reasonable fee parameters', () => {
    for (const node of KNOWN_TRAMPOLINE_NODES) {
      expect(node.feeBaseMsat).toBeGreaterThanOrEqual(0n)
      expect(node.feeBaseMsat).toBeLessThan(1000000n) // Less than 1000 sats base
      expect(node.feeProportionalMillionths).toBeGreaterThanOrEqual(0)
      expect(node.feeProportionalMillionths).toBeLessThan(10000) // Less than 1%
      expect(node.cltvExpiryDelta).toBeGreaterThanOrEqual(40)
      expect(node.cltvExpiryDelta).toBeLessThan(1000)
    }
  })
})

describe('Integration: Full Payment Flow', () => {
  it('should simulate payment with retry using valid keys', () => {
    const validTrampolineNode = createTestTrampolineNode(1)
    const router = createTrampolineRouter([validTrampolineNode])

    const destination = createValidNodeId(99)
    const amount = 10000000n // 10k sats
    const paymentHash = createTestPaymentHash('payment')
    const paymentSecret = createTestPaymentSecret('payment')
    const currentBlockHeight = 800000

    // First attempt at level 0
    const attempt1 = router.createTrampolinePayment(
      destination,
      amount,
      paymentHash,
      paymentSecret,
      currentBlockHeight,
    )
    expect(attempt1).not.toBeNull()

    // Simulate FEE_INSUFFICIENT error
    const shouldRetry = router.shouldRetryWithHigherFee(0x100c)
    expect(shouldRetry).toBe(true)
    expect(router.getCurrentFeeLevel()).toBe(1)

    // Retry at higher fee level
    const attempt2 = router.createTrampolinePayment(
      destination,
      amount,
      paymentHash,
      paymentSecret,
      currentBlockHeight,
    )
    expect(attempt2).not.toBeNull()

    // Second attempt should have higher fees (larger total)
    // The outerOnion contains the fee info
    expect(attempt2!.trampolineOnion.length).toBe(attempt1!.trampolineOnion.length)
  })

  it('should handle maximum retries', () => {
    const router = createTrampolineRouter()
    const FEE_INSUFFICIENT = 0x100c

    // Retry until max level
    let retryCount = 0
    while (router.shouldRetryWithHigherFee(FEE_INSUFFICIENT)) {
      retryCount++
    }

    expect(retryCount).toBe(3) // Levels 0->1, 1->2, 2->3
    expect(router.getCurrentFeeLevel()).toBe(3)
    expect(router.canRetry()).toBe(false)
  })
})
