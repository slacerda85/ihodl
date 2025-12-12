/**
 * Splice Tests
 *
 * Testes unitários para o sistema de Splice (BOLT #2 proposed)
 * - Splice In: Adicionar fundos ao canal
 * - Splice Out: Remover fundos do canal
 */

import {
  SpliceManager,
  SpliceState,
  SpliceType,
  encodeSpliceInitMessage,
  decodeSpliceInitMessage,
  encodeSpliceAckMessage,
  decodeSpliceAckMessage,
  encodeSpliceLockedMessage,
  decodeSpliceLockedMessage,
  isSpliceSupported,
  calculateSpliceFee,
  validateSpliceParams,
  MSG_SPLICE_INIT,
  MSG_SPLICE_ACK,
  MSG_SPLICE_LOCKED,
  SPLICE_MIN_DEPTH,
  SPLICE_FEATURE_BIT,
  type SpliceInitMessage,
  type SpliceAckMessage,
  type SpliceLockedMessage,
  type SpliceConfig,
} from '../splice'
import type { LocalConfig, RemoteConfig } from '../commitment'
import { uint8ArrayToHex } from '@/core/lib/utils/utils'

// ==========================================
// HELPERS
// ==========================================

function createMockChannelId(): Uint8Array {
  const channelId = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    channelId[i] = i
  }
  return channelId
}

function createMockPubkey(seed: number = 0x02): Uint8Array {
  const pubkey = new Uint8Array(33)
  pubkey[0] = seed
  for (let i = 1; i < 33; i++) {
    pubkey[i] = (i + seed) % 256
  }
  return pubkey
}

function createMockLocalConfig(): LocalConfig {
  return {
    perCommitmentSecretSeed: new Uint8Array(32).fill(0x01),
    dustLimitSat: 546n,
    maxHtlcValueInFlightMsat: 1000000000n,
    channelReserveSat: 10000n,
    htlcMinimumMsat: 1000n,
    toSelfDelay: 144,
    maxAcceptedHtlcs: 483,
    fundingPubkey: createMockPubkey(0x02),
    fundingPrivateKey: new Uint8Array(32).fill(0x02),
    revocationBasepoint: createMockPubkey(0x03),
    paymentBasepoint: createMockPubkey(0x04),
    delayedPaymentBasepoint: createMockPubkey(0x05),
    htlcBasepoint: createMockPubkey(0x06),
    initialMsat: 500000000n,
  }
}

function createMockRemoteConfig(): RemoteConfig {
  return {
    dustLimitSat: 546n,
    maxHtlcValueInFlightMsat: 1000000000n,
    channelReserveSat: 10000n,
    htlcMinimumMsat: 1000n,
    toSelfDelay: 144,
    maxAcceptedHtlcs: 483,
    fundingPubkey: createMockPubkey(0x08),
    revocationBasepoint: createMockPubkey(0x09),
    paymentBasepoint: createMockPubkey(0x0a),
    delayedPaymentBasepoint: createMockPubkey(0x0b),
    htlcBasepoint: createMockPubkey(0x0c),
    initialMsat: 500000000n,
    nextPerCommitmentPoint: createMockPubkey(0x0d),
  }
}

function createSpliceManager(): SpliceManager {
  return new SpliceManager({
    channelId: createMockChannelId(),
    currentCapacity: 1000000n,
    localPubkey: createMockPubkey(0x02),
    remotePubkey: createMockPubkey(0x03),
    localConfig: createMockLocalConfig(),
    remoteConfig: createMockRemoteConfig(),
  })
}

// ==========================================
// SPLICE MANAGER TESTS
// ==========================================

describe('SpliceManager', () => {
  let manager: SpliceManager

  beforeEach(() => {
    manager = createSpliceManager()
  })

  describe('initialization', () => {
    it('should start in IDLE state', () => {
      expect(manager.state).toBe(SpliceState.IDLE)
    })

    it('should not be active initially', () => {
      expect(manager.isActive).toBe(false)
    })

    it('should have no splice data initially', () => {
      expect(manager.spliceData).toBeNull()
    })
  })

  describe('initiateSplice', () => {
    it('should initiate splice in successfully', async () => {
      const config: SpliceConfig = {
        relativeSatoshis: 100000n,
        inputs: [
          {
            prevTx: new Uint8Array(100),
            prevTxVout: 0,
            value: 150000n,
          },
        ],
        feeratePerKw: 1000,
      }

      const result = await manager.initiateSplice(config)

      expect(result.success).toBe(true)
      expect(result.spliceId).toBeDefined()
      expect(manager.state).toBe(SpliceState.AWAITING_ACK)
      expect(manager.isActive).toBe(true)
    })

    it('should initiate splice out successfully', async () => {
      const config: SpliceConfig = {
        relativeSatoshis: -100000n,
        outputAddress: 'bc1qtest...',
        feeratePerKw: 1000,
      }

      const result = await manager.initiateSplice(config)

      expect(result.success).toBe(true)
      expect(manager.state).toBe(SpliceState.AWAITING_ACK)
    })

    it('should fail if splice already in progress', async () => {
      const config: SpliceConfig = {
        relativeSatoshis: 100000n,
        inputs: [{ prevTx: new Uint8Array(100), prevTxVout: 0, value: 150000n }],
      }

      await manager.initiateSplice(config)
      const result = await manager.initiateSplice(config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('already in progress')
    })

    it('should fail if relativeSatoshis is zero', async () => {
      const config: SpliceConfig = {
        relativeSatoshis: 0n,
      }

      const result = await manager.initiateSplice(config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('zero')
    })

    it('should fail splice in without inputs', async () => {
      const config: SpliceConfig = {
        relativeSatoshis: 100000n,
        // No inputs provided
      }

      const result = await manager.initiateSplice(config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('inputs')
    })

    it('should fail splice out without output address', async () => {
      const config: SpliceConfig = {
        relativeSatoshis: -100000n,
        // No outputAddress provided
      }

      const result = await manager.initiateSplice(config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('output address')
    })
  })

  describe('createSpliceInitMessage', () => {
    it('should create valid splice_init message after initiating', async () => {
      await manager.initiateSplice({
        relativeSatoshis: 100000n,
        inputs: [{ prevTx: new Uint8Array(100), prevTxVout: 0, value: 150000n }],
        feeratePerKw: 2000,
        locktime: 0,
      })

      const msg = manager.createSpliceInitMessage()

      expect(msg).not.toBeNull()
      expect(msg!.channelId.length).toBe(32)
      expect(msg!.relativeSatoshis).toBe(100000n)
      expect(msg!.fundingFeeratePerKw).toBe(2000)
      expect(msg!.fundingPubkey.length).toBe(33)
    })

    it('should return null if not in correct state', () => {
      const msg = manager.createSpliceInitMessage()
      expect(msg).toBeNull()
    })
  })

  describe('processSpliceInit', () => {
    it('should process valid splice_init message', async () => {
      const initMsg: SpliceInitMessage = {
        channelId: createMockChannelId(),
        fundingFeeratePerKw: 1000,
        locktime: 0,
        relativeSatoshis: 50000n,
        fundingPubkey: createMockPubkey(0x02),
      }

      const ackMsg = await manager.processSpliceInit(initMsg)

      expect(ackMsg).not.toBeNull()
      expect(ackMsg!.channelId.length).toBe(32)
      expect(manager.state).toBe(SpliceState.NEGOTIATING)
    })

    it('should reject if channel ID mismatch', async () => {
      const initMsg: SpliceInitMessage = {
        channelId: new Uint8Array(32).fill(0xff), // Different channel ID
        fundingFeeratePerKw: 1000,
        locktime: 0,
        relativeSatoshis: 50000n,
        fundingPubkey: createMockPubkey(0x02),
      }

      const ackMsg = await manager.processSpliceInit(initMsg)

      expect(ackMsg).toBeNull()
    })
  })

  describe('processSpliceAck', () => {
    it('should process valid splice_ack message', async () => {
      // First initiate splice
      await manager.initiateSplice({
        relativeSatoshis: 100000n,
        inputs: [{ prevTx: new Uint8Array(100), prevTxVout: 0, value: 150000n }],
      })

      const ackMsg: SpliceAckMessage = {
        channelId: createMockChannelId(),
        relativeSatoshis: 0n,
        fundingPubkey: createMockPubkey(0x03),
      }

      const result = await manager.processSpliceAck(ackMsg)

      expect(result).toBe(true)
      expect(manager.state).toBe(SpliceState.NEGOTIATING)
    })

    it('should update splice type to COMBINED when both contribute', async () => {
      await manager.initiateSplice({
        relativeSatoshis: 100000n,
        inputs: [{ prevTx: new Uint8Array(100), prevTxVout: 0, value: 150000n }],
      })

      const ackMsg: SpliceAckMessage = {
        channelId: createMockChannelId(),
        relativeSatoshis: -50000n, // Peer doing splice out
        fundingPubkey: createMockPubkey(0x03),
      }

      await manager.processSpliceAck(ackMsg)

      expect(manager.spliceData?.type).toBe(SpliceType.COMBINED)
    })
  })

  describe('processSpliceLockedMessage', () => {
    it('should reject if not in AWAITING_LOCKED state', () => {
      const lockedMsg: SpliceLockedMessage = {
        channelId: createMockChannelId(),
        nextPerCommitmentPoint: createMockPubkey(0x02),
      }

      const result = manager.processSpliceLockedMessage(lockedMsg)

      expect(result).toBe(false)
    })
  })

  describe('updateConfirmations', () => {
    it('should transition to AWAITING_LOCKED when confirmed', async () => {
      await manager.initiateSplice({
        relativeSatoshis: 100000n,
        inputs: [{ prevTx: new Uint8Array(100), prevTxVout: 0, value: 150000n }],
      })

      await manager.processSpliceAck({
        channelId: createMockChannelId(),
        relativeSatoshis: 0n,
        fundingPubkey: createMockPubkey(0x03),
      })

      // Simulate broadcast
      manager.onSpliceTxBroadcast(new Uint8Array(32).fill(0xab))

      // Should be awaiting confirmation
      expect(manager.state).toBe(SpliceState.AWAITING_CONFIRMATION)

      // Update confirmations to meet minimum
      manager.updateConfirmations(SPLICE_MIN_DEPTH)

      expect(manager.state).toBe(SpliceState.AWAITING_LOCKED)
    })
  })

  describe('abort', () => {
    it('should abort ongoing splice', async () => {
      await manager.initiateSplice({
        relativeSatoshis: 100000n,
        inputs: [{ prevTx: new Uint8Array(100), prevTxVout: 0, value: 150000n }],
      })

      manager.abort('User cancelled')

      expect(manager.state).toBe(SpliceState.ABORTED)
      expect(manager.spliceData?.error).toContain('cancelled')
    })
  })

  describe('event handling', () => {
    it('should emit events on state changes', async () => {
      const events: unknown[] = []
      manager.onEvent(event => events.push(event))

      await manager.initiateSplice({
        relativeSatoshis: 100000n,
        inputs: [{ prevTx: new Uint8Array(100), prevTxVout: 0, value: 150000n }],
      })

      expect(events.length).toBeGreaterThan(0)
      expect(events[0]).toHaveProperty('type', 'state_change')
    })
  })

  describe('status getters', () => {
    it('should return current status via getters', async () => {
      await manager.initiateSplice({
        relativeSatoshis: 100000n,
        inputs: [{ prevTx: new Uint8Array(100), prevTxVout: 0, value: 150000n }],
      })

      expect(manager.state).toBe(SpliceState.AWAITING_ACK)
      expect(manager.isActive).toBe(true)
      expect(manager.spliceData).not.toBeNull()
    })
  })
})

// ==========================================
// MESSAGE ENCODING/DECODING TESTS
// ==========================================

describe('Splice Message Encoding/Decoding', () => {
  describe('splice_init', () => {
    it('should encode and decode splice_init message', () => {
      const original: SpliceInitMessage = {
        channelId: createMockChannelId(),
        fundingFeeratePerKw: 2500,
        locktime: 0,
        relativeSatoshis: 500000n,
        fundingPubkey: createMockPubkey(0x02),
      }

      const encoded = encodeSpliceInitMessage(original)
      const decoded = decodeSpliceInitMessage(encoded)

      expect(decoded).not.toBeNull()
      expect(uint8ArrayToHex(decoded!.channelId)).toBe(uint8ArrayToHex(original.channelId))
      expect(decoded!.fundingFeeratePerKw).toBe(original.fundingFeeratePerKw)
      expect(decoded!.locktime).toBe(original.locktime)
      expect(decoded!.relativeSatoshis).toBe(original.relativeSatoshis)
      expect(uint8ArrayToHex(decoded!.fundingPubkey)).toBe(uint8ArrayToHex(original.fundingPubkey))
    })

    it('should handle negative relativeSatoshis (splice out)', () => {
      const original: SpliceInitMessage = {
        channelId: createMockChannelId(),
        fundingFeeratePerKw: 1000,
        locktime: 0,
        relativeSatoshis: -250000n,
        fundingPubkey: createMockPubkey(0x02),
      }

      const encoded = encodeSpliceInitMessage(original)
      const decoded = decodeSpliceInitMessage(encoded)

      expect(decoded!.relativeSatoshis).toBe(-250000n)
    })

    it('should encode message type correctly', () => {
      const msg: SpliceInitMessage = {
        channelId: createMockChannelId(),
        fundingFeeratePerKw: 1000,
        locktime: 0,
        relativeSatoshis: 100000n,
        fundingPubkey: createMockPubkey(0x02),
      }

      const encoded = encodeSpliceInitMessage(msg)
      const view = new DataView(encoded.buffer, encoded.byteOffset)
      const msgType = view.getUint16(0, false)

      expect(msgType).toBe(MSG_SPLICE_INIT)
    })

    it('should include TLVs when provided', () => {
      const tlvs = new Map<bigint, Uint8Array>()
      tlvs.set(1n, new Uint8Array([0x01, 0x02, 0x03]))

      const original: SpliceInitMessage = {
        channelId: createMockChannelId(),
        fundingFeeratePerKw: 1000,
        locktime: 0,
        relativeSatoshis: 100000n,
        fundingPubkey: createMockPubkey(0x02),
        tlvs,
      }

      const encoded = encodeSpliceInitMessage(original)
      const decoded = decodeSpliceInitMessage(encoded)

      expect(decoded!.tlvs).toBeDefined()
      expect(decoded!.tlvs!.get(1n)).toBeDefined()
    })
  })

  describe('splice_ack', () => {
    it('should encode and decode splice_ack message', () => {
      const original: SpliceAckMessage = {
        channelId: createMockChannelId(),
        relativeSatoshis: 0n,
        fundingPubkey: createMockPubkey(0x03),
      }

      const encoded = encodeSpliceAckMessage(original)
      const decoded = decodeSpliceAckMessage(encoded)

      expect(decoded).not.toBeNull()
      expect(uint8ArrayToHex(decoded!.channelId)).toBe(uint8ArrayToHex(original.channelId))
      expect(decoded!.relativeSatoshis).toBe(original.relativeSatoshis)
      expect(uint8ArrayToHex(decoded!.fundingPubkey)).toBe(uint8ArrayToHex(original.fundingPubkey))
    })

    it('should encode message type correctly', () => {
      const msg: SpliceAckMessage = {
        channelId: createMockChannelId(),
        relativeSatoshis: 0n,
        fundingPubkey: createMockPubkey(0x03),
      }

      const encoded = encodeSpliceAckMessage(msg)
      const view = new DataView(encoded.buffer, encoded.byteOffset)
      const msgType = view.getUint16(0, false)

      expect(msgType).toBe(MSG_SPLICE_ACK)
    })
  })

  describe('splice_locked', () => {
    it('should encode and decode splice_locked message', () => {
      const original: SpliceLockedMessage = {
        channelId: createMockChannelId(),
        nextPerCommitmentPoint: createMockPubkey(0x02),
      }

      const encoded = encodeSpliceLockedMessage(original)
      const decoded = decodeSpliceLockedMessage(encoded)

      expect(decoded).not.toBeNull()
      expect(uint8ArrayToHex(decoded!.channelId)).toBe(uint8ArrayToHex(original.channelId))
      expect(uint8ArrayToHex(decoded!.nextPerCommitmentPoint)).toBe(
        uint8ArrayToHex(original.nextPerCommitmentPoint),
      )
    })

    it('should encode message type correctly', () => {
      const msg: SpliceLockedMessage = {
        channelId: createMockChannelId(),
        nextPerCommitmentPoint: createMockPubkey(0x02),
      }

      const encoded = encodeSpliceLockedMessage(msg)
      const view = new DataView(encoded.buffer, encoded.byteOffset)
      const msgType = view.getUint16(0, false)

      expect(msgType).toBe(MSG_SPLICE_LOCKED)
    })
  })
})

// ==========================================
// HELPER FUNCTION TESTS
// ==========================================

describe('Splice Helper Functions', () => {
  describe('isSpliceSupported', () => {
    it('should return true when splice feature bit is set', () => {
      // Feature bit 62 = byte 7, bit 6
      const features = new Uint8Array(8)
      features[0] = 0x40 // Bit 62 (optional) set

      expect(isSpliceSupported(features)).toBe(true)
    })

    it('should return false when features too short', () => {
      const features = new Uint8Array(4) // Only 32 bits
      expect(isSpliceSupported(features)).toBe(false)
    })

    it('should return false when feature bit not set', () => {
      const features = new Uint8Array(8)
      expect(isSpliceSupported(features)).toBe(false)
    })
  })

  describe('calculateSpliceFee', () => {
    it('should calculate fee for splice transaction', () => {
      const fee = calculateSpliceFee({
        numInputs: 2,
        numOutputs: 2,
        feeratePerKw: 1000,
      })

      expect(fee).toBeGreaterThan(0n)
    })

    it('should increase with more inputs', () => {
      const fee1 = calculateSpliceFee({ numInputs: 1, numOutputs: 2, feeratePerKw: 1000 })
      const fee2 = calculateSpliceFee({ numInputs: 3, numOutputs: 2, feeratePerKw: 1000 })

      expect(fee2).toBeGreaterThan(fee1)
    })

    it('should increase with higher feerate', () => {
      const fee1 = calculateSpliceFee({ numInputs: 2, numOutputs: 2, feeratePerKw: 1000 })
      const fee2 = calculateSpliceFee({ numInputs: 2, numOutputs: 2, feeratePerKw: 2000 })

      expect(fee2).toBeGreaterThan(fee1)
    })
  })

  describe('validateSpliceParams', () => {
    it('should validate positive new capacity', () => {
      const result = validateSpliceParams({
        currentCapacity: 1000000n,
        relativeSatoshis: 500000n,
        dustLimit: 546n,
      })

      expect(result.valid).toBe(true)
    })

    it('should reject non-positive new capacity', () => {
      const result = validateSpliceParams({
        currentCapacity: 1000000n,
        relativeSatoshis: -1000001n,
        dustLimit: 546n,
      })

      expect(result.valid).toBe(false)
      expect(result.error).toContain('non-positive')
    })

    it('should reject capacity below dust limit', () => {
      const result = validateSpliceParams({
        currentCapacity: 1000n,
        relativeSatoshis: -500n,
        dustLimit: 546n,
      })

      expect(result.valid).toBe(false)
      expect(result.error).toContain('dust')
    })

    it('should reject capacity above maximum', () => {
      const result = validateSpliceParams({
        currentCapacity: 10000000000000n, // Very large
        relativeSatoshis: 10000000000000n,
        dustLimit: 546n,
      })

      expect(result.valid).toBe(false)
      expect(result.error).toContain('maximum')
    })
  })
})

// ==========================================
// CONSTANTS TESTS
// ==========================================

describe('Splice Constants', () => {
  it('should have correct message type values', () => {
    expect(MSG_SPLICE_INIT).toBe(74)
    expect(MSG_SPLICE_ACK).toBe(76)
    expect(MSG_SPLICE_LOCKED).toBe(78)
  })

  it('should have correct minimum depth', () => {
    expect(SPLICE_MIN_DEPTH).toBe(3)
  })

  it('should have correct feature bit', () => {
    expect(SPLICE_FEATURE_BIT).toBe(62)
  })
})
