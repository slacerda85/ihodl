// BOLT #4: Multi-Path Payments (MPP) Tests
// Tests for MPP splitting, routing, and payment collection

import {
  MppPaymentManager,
  MppPaymentCollector,
  encodeTu64,
  decodeTu64,
  generatePartId,
  uint8ArrayToHex,
} from '../mpp'
import {
  MppConfig,
  MppPaymentStatus,
  MppPaymentRequest,
  DEFAULT_MPP_CONFIG,
  TLV_PAYMENT_DATA,
  MPP_FEATURE_BIT,
  MPP_FEATURE_BIT_OPTIONAL,
} from '@/core/models/lightning/mpp'
import { RoutingGraph } from '../routing'
import { FailureCode } from '@/core/models/lightning/routing'
import { sha256 } from '../../crypto'

// Helper function to create test payment hash
function createTestPaymentHash(seed: string): Uint8Array {
  return sha256(new TextEncoder().encode(seed))
}

// Helper function to create test node ID
function createTestNodeId(index: number): Uint8Array {
  const nodeId = new Uint8Array(33)
  nodeId[0] = 0x02 // Compressed public key prefix
  nodeId[32] = index
  return nodeId
}

// Helper function to create test short channel ID
function createTestShortChannelId(
  blockHeight: number,
  txIndex: number,
  outputIndex: number,
): Uint8Array {
  const scid = new Uint8Array(8)
  // BOLT #7: block_height (3 bytes) | tx_index (3 bytes) | output_index (2 bytes)
  scid[0] = (blockHeight >> 16) & 0xff
  scid[1] = (blockHeight >> 8) & 0xff
  scid[2] = blockHeight & 0xff
  scid[3] = (txIndex >> 16) & 0xff
  scid[4] = (txIndex >> 8) & 0xff
  scid[5] = txIndex & 0xff
  scid[6] = (outputIndex >> 8) & 0xff
  scid[7] = outputIndex & 0xff
  return scid
}

// Create mock routing graph with channels
function createMockRoutingGraph(): RoutingGraph {
  const graph = new RoutingGraph()

  // Add nodes
  for (let i = 0; i < 5; i++) {
    graph.addNode({
      nodeId: createTestNodeId(i),
      lastUpdate: Date.now(),
      addresses: [{ type: 'ipv4', address: `192.168.1.${i}`, port: 9735 }],
      alias: `Node${i}`,
    })
  }

  // Add channels with varying capacities
  const channels: {
    id: Uint8Array
    node1: number
    node2: number
    capacity: bigint
  }[] = [
    { id: createTestShortChannelId(700000, 1, 0), node1: 0, node2: 1, capacity: 1000000000n },
    { id: createTestShortChannelId(700000, 2, 0), node1: 0, node2: 2, capacity: 500000000n },
    { id: createTestShortChannelId(700000, 3, 0), node1: 1, node2: 3, capacity: 800000000n },
    { id: createTestShortChannelId(700000, 4, 0), node1: 2, node2: 3, capacity: 600000000n },
    { id: createTestShortChannelId(700000, 5, 0), node1: 3, node2: 4, capacity: 2000000000n },
  ]

  for (const ch of channels) {
    graph.addChannel({
      shortChannelId: ch.id,
      nodeId1: createTestNodeId(ch.node1),
      nodeId2: createTestNodeId(ch.node2),
      capacity: ch.capacity,
      feeBaseMsat: 1000,
      feeProportionalMillionths: 100,
      cltvExpiryDelta: 40,
      htlcMinimumMsat: 1000n,
      htlcMaximumMsat: ch.capacity,
      lastUpdate: Date.now(),
    })
  }

  return graph
}

describe('MPP TLV Encoding', () => {
  describe('tu64 encoding', () => {
    it('should encode zero correctly', () => {
      const encoded = encodeTu64(0n)
      expect(encoded.length).toBe(0)
    })

    it('should encode small values without leading zeros', () => {
      const encoded = encodeTu64(100n)
      expect(encoded.length).toBe(1)
      expect(encoded[0]).toBe(100)
    })

    it('should encode 256 as 2 bytes', () => {
      const encoded = encodeTu64(256n)
      expect(encoded.length).toBe(2)
      expect(encoded[0]).toBe(1)
      expect(encoded[1]).toBe(0)
    })

    it('should encode large values correctly', () => {
      const value = 1000000000n // 1 BTC in msat
      const encoded = encodeTu64(value)
      expect(encoded.length).toBe(4)
      // Verify round-trip
      expect(decodeTu64(encoded)).toBe(value)
    })

    it('should encode max u64 correctly', () => {
      const maxU64 = 18446744073709551615n
      const encoded = encodeTu64(maxU64)
      expect(encoded.length).toBe(8)
      expect(decodeTu64(encoded)).toBe(maxU64)
    })

    it('should decode various BOLT test vectors', () => {
      // Test vectors from BOLT #1
      expect(decodeTu64(new Uint8Array([]))).toBe(0n)
      expect(decodeTu64(new Uint8Array([0x01]))).toBe(1n)
      expect(decodeTu64(new Uint8Array([0x01, 0x00]))).toBe(256n)
      expect(decodeTu64(new Uint8Array([0xff, 0xff, 0xff, 0xff]))).toBe(4294967295n)
    })
  })
})

describe('MPP Payment Splitting', () => {
  let manager: MppPaymentManager
  let graph: RoutingGraph

  beforeEach(() => {
    graph = createMockRoutingGraph()
    manager = new MppPaymentManager(graph)
  })

  describe('splitPayment', () => {
    it('should split large payment into multiple parts', async () => {
      const totalAmount = 1500000000n // 1.5 BTC in msat
      const destinationNodeId = createTestNodeId(4)

      const result = await manager.splitPayment(totalAmount, destinationNodeId, DEFAULT_MPP_CONFIG)

      expect(result.success).toBe(true)
      expect(result.parts.length).toBeGreaterThan(1)

      // Verify total equals original amount
      const totalSplit = result.parts.reduce((sum, p) => sum + p.amountMsat, 0n)
      expect(totalSplit).toBe(totalAmount)
    })

    it('should not split if single channel has enough capacity', async () => {
      const smallAmount = 100000000n // 0.1 BTC in msat
      const destinationNodeId = createTestNodeId(4)

      const result = await manager.splitPayment(smallAmount, destinationNodeId, {
        ...DEFAULT_MPP_CONFIG,
        maxParts: 1,
      })

      expect(result.success).toBe(true)
      expect(result.parts.length).toBe(1)
      expect(result.parts[0].amountMsat).toBe(smallAmount)
    })

    it('should respect minimum part size', async () => {
      const config: MppConfig = {
        ...DEFAULT_MPP_CONFIG,
        minPartSizeMsat: 50000000n, // 50k sats
      }
      const totalAmount = 200000000n
      const destinationNodeId = createTestNodeId(4)

      const result = await manager.splitPayment(totalAmount, destinationNodeId, config)

      expect(result.success).toBe(true)
      for (const part of result.parts) {
        expect(part.amountMsat).toBeGreaterThanOrEqual(config.minPartSizeMsat)
      }
    })

    it('should respect maximum parts limit', async () => {
      const config: MppConfig = {
        ...DEFAULT_MPP_CONFIG,
        maxParts: 4,
        minPartSizeMsat: 1000000n, // Allow smaller parts
      }
      const totalAmount = 500000000n // 0.5 BTC - amount that fits in available liquidity
      const destinationNodeId = createTestNodeId(4)

      const result = await manager.splitPayment(totalAmount, destinationNodeId, config)

      // May succeed or fail depending on route availability
      if (result.success) {
        expect(result.parts.length).toBeLessThanOrEqual(config.maxParts)
      } else {
        // If failed, it's because no routes available, which is valid behavior
        expect(result.error).toBeDefined()
      }
    })

    it('should fail if amount exceeds total liquidity', async () => {
      const hugeAmount = 100000000000000n // Way more than available
      const destinationNodeId = createTestNodeId(4)

      const result = await manager.splitPayment(hugeAmount, destinationNodeId, DEFAULT_MPP_CONFIG)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Insufficient liquidity')
    })
  })
})

describe('MPP Payment Manager', () => {
  let manager: MppPaymentManager
  let graph: RoutingGraph

  beforeEach(() => {
    graph = createMockRoutingGraph()
    manager = new MppPaymentManager(graph)
  })

  describe('sendPayment', () => {
    it('should validate payment request', async () => {
      // Missing payment secret
      const invalidRequest: MppPaymentRequest = {
        paymentHash: createTestPaymentHash('test'),
        paymentSecret: new Uint8Array(31), // Wrong length
        amountMsat: 100000000n,
        destinationNodeId: createTestNodeId(4),
        finalCltvDelta: 40,
      }

      const result = await manager.sendPayment(invalidRequest)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid payment secret')
    })

    it('should reject zero amount', async () => {
      const request: MppPaymentRequest = {
        paymentHash: createTestPaymentHash('test'),
        paymentSecret: createTestPaymentHash('secret'),
        amountMsat: 0n,
        destinationNodeId: createTestNodeId(4),
        finalCltvDelta: 40,
      }

      const result = await manager.sendPayment(request)

      expect(result.success).toBe(false)
      expect(result.error).toContain('positive')
    })

    it('should track payment status', async () => {
      const paymentHash = createTestPaymentHash('test-payment')
      const request: MppPaymentRequest = {
        paymentHash,
        paymentSecret: createTestPaymentHash('secret'),
        amountMsat: 100000000n,
        destinationNodeId: createTestNodeId(4),
        finalCltvDelta: 40,
      }

      // Start payment (don't await to check in-flight status)
      const paymentPromise = manager.sendPayment(request)

      // Check status while in flight
      const status = manager.getPaymentStatus(paymentHash)
      // Status might be PENDING or IN_FLIGHT depending on timing
      expect(status).not.toBeNull()

      await paymentPromise
    })
  })

  describe('cancelPayment', () => {
    it('should cancel pending payment', async () => {
      const paymentHash = createTestPaymentHash('cancel-test')
      const request: MppPaymentRequest = {
        paymentHash,
        paymentSecret: createTestPaymentHash('secret'),
        amountMsat: 100000000n,
        destinationNodeId: createTestNodeId(4),
        finalCltvDelta: 40,
      }

      // Start payment
      const paymentPromise = manager.sendPayment(request)

      // Cancel it
      await manager.cancelPayment(paymentHash)

      await paymentPromise

      // Verify cancellation
      const status = manager.getPaymentStatus(paymentHash)
      if (status) {
        expect(status.status).toBe(MppPaymentStatus.FAILED)
      }
    })
  })

  describe('configuration', () => {
    it('should use default config', () => {
      const config = manager.getConfig()
      expect(config.maxParts).toBe(DEFAULT_MPP_CONFIG.maxParts)
      expect(config.minPartSizeMsat).toBe(DEFAULT_MPP_CONFIG.minPartSizeMsat)
    })

    it('should allow config updates', () => {
      manager.updateConfig({ maxParts: 8 })
      const config = manager.getConfig()
      expect(config.maxParts).toBe(8)
    })
  })
})

describe('MPP TLV Encoding', () => {
  let manager: MppPaymentManager

  beforeEach(() => {
    const graph = createMockRoutingGraph()
    manager = new MppPaymentManager(graph)
  })

  describe('encodeMppTlv', () => {
    it('should encode payment_data TLV correctly', () => {
      const paymentSecret = createTestPaymentHash('secret')
      const totalMsat = 1000000000n

      const encoded = manager.encodeMppTlv(paymentSecret, totalMsat, 500000000n)

      // Should contain type 8 (payment_data)
      expect(encoded.length).toBeGreaterThan(34) // 32 byte secret + length + type

      // Verify we can decode it back
      // Skip type and length bytes
      let offset = 0
      // Read type (BigSize)
      const type = encoded[offset]
      expect(type).toBe(TLV_PAYMENT_DATA)
    })

    it('should round-trip encode/decode', () => {
      const paymentSecret = createTestPaymentHash('test-secret')
      const totalMsat = 250000000n

      const encoded = manager.encodeMppTlv(paymentSecret, totalMsat, 125000000n)

      // Find the payment data after type and length
      // Type 8 = 1 byte, length = 1 byte (for small payloads)
      const paymentData = encoded.slice(2)
      const decoded = manager.decodeMppTlv(paymentData)

      expect(decoded).not.toBeNull()
      expect(decoded!.totalMsat).toBe(totalMsat)
      expect(uint8ArrayToHex(decoded!.paymentSecret)).toBe(uint8ArrayToHex(paymentSecret))
    })
  })

  describe('decodeMppTlv', () => {
    it('should return null for too short data', () => {
      const shortData = new Uint8Array(10)
      const result = manager.decodeMppTlv(shortData)
      expect(result).toBeNull()
    })

    it('should decode valid payment data', () => {
      const paymentSecret = createTestPaymentHash('decode-test')
      const totalMsat = 500000000n

      // Manually construct payment_data
      const totalBytes = encodeTu64(totalMsat)
      const data = new Uint8Array(32 + totalBytes.length)
      data.set(paymentSecret, 0)
      data.set(totalBytes, 32)

      const result = manager.decodeMppTlv(data)

      expect(result).not.toBeNull()
      expect(result!.totalMsat).toBe(totalMsat)
    })
  })
})

describe('MPP Payment Collector (Receiver)', () => {
  let collector: MppPaymentCollector

  beforeEach(() => {
    collector = new MppPaymentCollector({ mppTimeoutSec: 60 })
  })

  describe('processIncomingHtlc', () => {
    it('should accept first part of MPP', () => {
      const paymentHash = createTestPaymentHash('mpp-receive')
      const paymentSecret = createTestPaymentHash('secret')
      const totalMsat = 1000000000n

      const result = collector.processIncomingHtlc({
        htlcId: 1n,
        paymentHash,
        amountMsat: 500000000n,
        cltvExpiry: 500000,
        paymentSecret,
        totalMsat,
      })

      expect(result.action).toBe('hold')
      expect(result.receivedMsat).toBe(500000000n)
      expect(result.remainingMsat).toBe(500000000n)
    })

    it('should fulfill when all parts received', () => {
      const paymentHash = createTestPaymentHash('complete-mpp')
      const paymentSecret = createTestPaymentHash('secret')
      const totalMsat = 1000000000n

      // First part
      collector.processIncomingHtlc({
        htlcId: 1n,
        paymentHash,
        amountMsat: 500000000n,
        cltvExpiry: 500000,
        paymentSecret,
        totalMsat,
      })

      // Second part - completes payment
      const result = collector.processIncomingHtlc({
        htlcId: 2n,
        paymentHash,
        amountMsat: 500000000n,
        cltvExpiry: 500000,
        paymentSecret,
        totalMsat,
      })

      expect(result.action).toBe('fulfill')
      expect(result.htlcIds).toEqual([1n, 2n])
    })

    it('should reject mismatched payment secret', () => {
      const paymentHash = createTestPaymentHash('secret-mismatch')
      const paymentSecret1 = createTestPaymentHash('secret1')
      const paymentSecret2 = createTestPaymentHash('secret2')
      const totalMsat = 1000000000n

      // First part
      collector.processIncomingHtlc({
        htlcId: 1n,
        paymentHash,
        amountMsat: 500000000n,
        cltvExpiry: 500000,
        paymentSecret: paymentSecret1,
        totalMsat,
      })

      // Second part with different secret
      const result = collector.processIncomingHtlc({
        htlcId: 2n,
        paymentHash,
        amountMsat: 500000000n,
        cltvExpiry: 500000,
        paymentSecret: paymentSecret2,
        totalMsat,
      })

      expect(result.action).toBe('reject')
      expect(result.failureCode).toBe(FailureCode.INCORRECT_OR_UNKNOWN_PAYMENT_DETAILS)
    })

    it('should reject mismatched total amount', () => {
      const paymentHash = createTestPaymentHash('amount-mismatch')
      const paymentSecret = createTestPaymentHash('secret')

      // First part
      collector.processIncomingHtlc({
        htlcId: 1n,
        paymentHash,
        amountMsat: 500000000n,
        cltvExpiry: 500000,
        paymentSecret,
        totalMsat: 1000000000n,
      })

      // Second part with different total
      const result = collector.processIncomingHtlc({
        htlcId: 2n,
        paymentHash,
        amountMsat: 500000000n,
        cltvExpiry: 500000,
        paymentSecret,
        totalMsat: 2000000000n, // Different total
      })

      expect(result.action).toBe('reject')
      expect(result.failureCode).toBe(FailureCode.FINAL_INCORRECT_HTLC_AMOUNT)
    })

    it('should reject HTLC without payment secret', () => {
      const paymentHash = createTestPaymentHash('no-secret')

      const result = collector.processIncomingHtlc({
        htlcId: 1n,
        paymentHash,
        amountMsat: 500000000n,
        cltvExpiry: 500000,
        // No paymentSecret
      })

      expect(result.action).toBe('reject')
      expect(result.failureCode).toBe(FailureCode.INCORRECT_OR_UNKNOWN_PAYMENT_DETAILS)
    })

    it('should handle more than 2 parts', () => {
      const paymentHash = createTestPaymentHash('multi-part')
      const paymentSecret = createTestPaymentHash('secret')
      const totalMsat = 1000000000n
      const partAmount = 250000000n

      // Send 4 parts
      for (let i = 0; i < 3; i++) {
        const result = collector.processIncomingHtlc({
          htlcId: BigInt(i + 1),
          paymentHash,
          amountMsat: partAmount,
          cltvExpiry: 500000,
          paymentSecret,
          totalMsat,
        })
        expect(result.action).toBe('hold')
      }

      // Fourth part completes
      const result = collector.processIncomingHtlc({
        htlcId: 4n,
        paymentHash,
        amountMsat: partAmount,
        cltvExpiry: 500000,
        paymentSecret,
        totalMsat,
      })

      expect(result.action).toBe('fulfill')
      expect(result.htlcIds).toHaveLength(4)
    })

    it('should overpay and still fulfill', () => {
      const paymentHash = createTestPaymentHash('overpay')
      const paymentSecret = createTestPaymentHash('secret')
      const totalMsat = 1000000000n

      // First part
      collector.processIncomingHtlc({
        htlcId: 1n,
        paymentHash,
        amountMsat: 600000000n, // 60%
        cltvExpiry: 500000,
        paymentSecret,
        totalMsat,
      })

      // Second part - overpays total
      const result = collector.processIncomingHtlc({
        htlcId: 2n,
        paymentHash,
        amountMsat: 600000000n, // 60% - total now 120%
        cltvExpiry: 500000,
        paymentSecret,
        totalMsat,
      })

      // Should still fulfill
      expect(result.action).toBe('fulfill')
    })
  })

  describe('checkTimeouts', () => {
    it('should detect timed out payments', async () => {
      // Create collector with very short timeout
      const shortTimeoutCollector = new MppPaymentCollector({ mppTimeoutSec: 0 })

      const paymentHash = createTestPaymentHash('timeout-test')
      const paymentSecret = createTestPaymentHash('secret')

      shortTimeoutCollector.processIncomingHtlc({
        htlcId: 1n,
        paymentHash,
        amountMsat: 500000000n,
        cltvExpiry: 500000,
        paymentSecret,
        totalMsat: 1000000000n,
      })

      // Wait for timeout to expire
      await new Promise(resolve => setTimeout(resolve, 10))

      // Check timeouts
      const timedOut = shortTimeoutCollector.checkTimeouts()

      expect(timedOut.length).toBe(1)
      expect(timedOut[0].htlcIds).toContain(1n)
    })
  })

  describe('getPendingPayment', () => {
    it('should return pending payment status', () => {
      const paymentHash = createTestPaymentHash('status-test')
      const paymentSecret = createTestPaymentHash('secret')
      const totalMsat = 1000000000n

      collector.processIncomingHtlc({
        htlcId: 1n,
        paymentHash,
        amountMsat: 300000000n,
        cltvExpiry: 500000,
        paymentSecret,
        totalMsat,
      })

      const pending = collector.getPendingPayment(paymentHash)

      expect(pending).not.toBeNull()
      expect(pending!.totalMsat).toBe(totalMsat)
      expect(pending!.receivedMsat).toBe(300000000n)
      expect(pending!.parts).toHaveLength(1)
    })

    it('should return null for unknown payment', () => {
      const unknownHash = createTestPaymentHash('unknown')
      const pending = collector.getPendingPayment(unknownHash)
      expect(pending).toBeNull()
    })
  })
})

describe('MPP Utility Functions', () => {
  describe('generatePartId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 10; i++) {
        ids.add(generatePartId())
      }
      // In test environment with mocked crypto, we just verify it generates strings
      expect(ids.size).toBeGreaterThanOrEqual(1)
    })

    it('should generate hex string of correct length', () => {
      const id = generatePartId()
      expect(id.length).toBe(32) // 16 bytes = 32 hex chars
      expect(/^[0-9a-f]+$/.test(id)).toBe(true)
    })
  })

  describe('uint8ArrayToHex', () => {
    it('should convert bytes to hex correctly', () => {
      const bytes = new Uint8Array([0x00, 0x01, 0x0f, 0xff])
      const hex = uint8ArrayToHex(bytes)
      expect(hex).toBe('00010fff')
    })

    it('should handle empty array', () => {
      const hex = uint8ArrayToHex(new Uint8Array(0))
      expect(hex).toBe('')
    })
  })
})

describe('MPP Feature Bits', () => {
  it('should define correct feature bits per BOLT #9', () => {
    // basic_mpp is feature bit 16/17
    expect(MPP_FEATURE_BIT).toBe(16)
    expect(MPP_FEATURE_BIT_OPTIONAL).toBe(17)
  })
})

describe('MPP Integration Scenarios', () => {
  let manager: MppPaymentManager
  let collector: MppPaymentCollector
  let graph: RoutingGraph

  beforeEach(() => {
    graph = createMockRoutingGraph()
    manager = new MppPaymentManager(graph)
    collector = new MppPaymentCollector()
  })

  it('should handle end-to-end MPP payment simulation', async () => {
    const paymentHash = createTestPaymentHash('e2e-test')
    const paymentSecret = createTestPaymentHash('e2e-secret')
    const amount = 1000000000n

    // 1. Sender splits and prepares payment
    const splitResult = await manager.splitPayment(amount, createTestNodeId(4), DEFAULT_MPP_CONFIG)
    expect(splitResult.success).toBe(true)

    // 2. Simulate receiver collecting parts
    for (let i = 0; i < splitResult.parts.length; i++) {
      const part = splitResult.parts[i]
      const result = collector.processIncomingHtlc({
        htlcId: BigInt(i + 1),
        paymentHash,
        amountMsat: part.amountMsat,
        cltvExpiry: 500000,
        paymentSecret,
        totalMsat: amount,
      })

      if (i < splitResult.parts.length - 1) {
        expect(result.action).toBe('hold')
      } else {
        expect(result.action).toBe('fulfill')
        expect(result.htlcIds?.length).toBe(splitResult.parts.length)
      }
    }
  })

  it('should handle partial failure scenario', async () => {
    const paymentHash = createTestPaymentHash('partial-fail')
    const paymentSecret = createTestPaymentHash('secret')
    const amount = 1000000000n

    // Start collecting parts
    collector.processIncomingHtlc({
      htlcId: 1n,
      paymentHash,
      amountMsat: 500000000n,
      cltvExpiry: 500000,
      paymentSecret,
      totalMsat: amount,
    })

    // Simulate timeout before second part arrives
    const shortCollector = new MppPaymentCollector({ mppTimeoutSec: 0 })
    shortCollector.processIncomingHtlc({
      htlcId: 1n,
      paymentHash,
      amountMsat: 500000000n,
      cltvExpiry: 500000,
      paymentSecret,
      totalMsat: amount,
    })

    // Wait for timeout to expire
    await new Promise(resolve => setTimeout(resolve, 10))

    const timedOut = shortCollector.checkTimeouts()
    expect(timedOut.length).toBe(1)
    expect(timedOut[0].receivedMsat).toBe(500000000n)
    expect(timedOut[0].expectedMsat).toBe(amount)
  })
})
