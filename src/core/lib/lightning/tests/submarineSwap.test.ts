/**
 * Unit Tests for Submarine Swaps
 *
 * Tests for atomic swaps between on-chain Bitcoin and Lightning Network
 */

import { sha256 } from '@noble/hashes/sha2.js'
import { ripemd160 } from '@noble/hashes/legacy.js'
import * as secp256k1 from '@noble/secp256k1'
import {
  // Constants
  SWAP_TX_SIZE,
  MIN_SWAP_AMOUNT_SAT,
  MIN_LOCKTIME_DELTA,
  LOCKTIME_DELTA_REFUND,
  MAX_LOCKTIME_DELTA,
  MIN_FINAL_CLTV_DELTA_FOR_CLIENT,
  REDEEM_AFTER_DOUBLE_SPENT_DELAY,
  // Enums
  SwapType,
  SwapState,
  // Types
  SwapFees,
  SwapOffer,
  SwapData,
  // Script functions
  constructSwapScript,
  scriptToP2wshAddress,
  validateSwapScript,
  extractSwapScriptParams,
  // Fee calculations
  calculateSwapFee,
  calculateReverseSwapReceiveAmount,
  calculateForwardSwapSendAmount,
  // Key/preimage functions
  generateSwapKeyPair,
  generatePreimage,
  verifyPreimage,
  // Witness functions
  constructClaimWitness,
  constructRefundWitness,
  calculateClaimWitnessSize,
  calculateRefundWitnessSize,
  calculateSwapTxFee,
  // Manager
  SwapManager,
  createSwapManager,
} from '../submarineSwap'
import { uint8ArrayToHex } from '@/core/lib/utils'

describe('submarineSwap', () => {
  // ============================================================================
  // Constants Tests
  // ============================================================================

  describe('constants', () => {
    it('should have correct SWAP_TX_SIZE', () => {
      expect(SWAP_TX_SIZE).toBe(150)
    })

    it('should have correct MIN_SWAP_AMOUNT_SAT', () => {
      expect(MIN_SWAP_AMOUNT_SAT).toBe(20000)
    })

    it('should have correct locktime deltas', () => {
      expect(MIN_LOCKTIME_DELTA).toBe(60)
      expect(LOCKTIME_DELTA_REFUND).toBe(70)
      expect(MAX_LOCKTIME_DELTA).toBe(100)
    })

    it('should have correct CLTV delta for client', () => {
      expect(MIN_FINAL_CLTV_DELTA_FOR_CLIENT).toBe(3 * 144) // ~3 days
    })

    it('should have correct redeem delay', () => {
      expect(REDEEM_AFTER_DOUBLE_SPENT_DELAY).toBe(144) // ~1 day
    })
  })

  // ============================================================================
  // Enums Tests
  // ============================================================================

  describe('SwapType enum', () => {
    it('should have FORWARD type', () => {
      expect(SwapType.FORWARD).toBe('forward')
    })

    it('should have REVERSE type', () => {
      expect(SwapType.REVERSE).toBe('reverse')
    })
  })

  describe('SwapState enum', () => {
    it('should have all states', () => {
      expect(SwapState.CREATED).toBe('created')
      expect(SwapState.FUNDED).toBe('funded')
      expect(SwapState.CONFIRMED).toBe('confirmed')
      expect(SwapState.COMPLETED).toBe('completed')
      expect(SwapState.EXPIRED).toBe('expired')
      expect(SwapState.REFUNDED).toBe('refunded')
      expect(SwapState.FAILED).toBe('failed')
    })
  })

  // ============================================================================
  // Script Construction Tests
  // ============================================================================

  describe('constructSwapScript', () => {
    const mockPaymentHash = new Uint8Array(32).fill(0xab)
    const mockClaimPubkey = new Uint8Array(33)
    const mockRefundPubkey = new Uint8Array(33)

    beforeAll(() => {
      // Generate valid compressed pubkeys
      const claimPriv = new Uint8Array(32).fill(0x11)
      const refundPriv = new Uint8Array(32).fill(0x22)
      mockClaimPubkey.set(secp256k1.getPublicKey(claimPriv, true))
      mockRefundPubkey.set(secp256k1.getPublicKey(refundPriv, true))
    })

    it('should construct valid swap script', () => {
      const locktime = 800000

      const script = constructSwapScript(
        mockPaymentHash,
        locktime,
        mockClaimPubkey,
        mockRefundPubkey,
      )

      expect(script).toBeInstanceOf(Uint8Array)
      expect(script.length).toBeGreaterThan(100)
    })

    it('should throw for invalid payment hash length', () => {
      const invalidHash = new Uint8Array(31) // Should be 32

      expect(() => {
        constructSwapScript(invalidHash, 800000, mockClaimPubkey, mockRefundPubkey)
      }).toThrow('Payment hash must be 32 bytes')
    })

    it('should throw for invalid claim pubkey length', () => {
      const invalidPubkey = new Uint8Array(32) // Should be 33

      expect(() => {
        constructSwapScript(mockPaymentHash, 800000, invalidPubkey, mockRefundPubkey)
      }).toThrow('Claim pubkey must be 33 bytes (compressed)')
    })

    it('should throw for invalid refund pubkey length', () => {
      const invalidPubkey = new Uint8Array(32) // Should be 33

      expect(() => {
        constructSwapScript(mockPaymentHash, 800000, mockClaimPubkey, invalidPubkey)
      }).toThrow('Refund pubkey must be 33 bytes (compressed)')
    })

    it('should include payment hash RIPEMD160 in script', () => {
      const locktime = 800000
      const script = constructSwapScript(
        mockPaymentHash,
        locktime,
        mockClaimPubkey,
        mockRefundPubkey,
      )

      const expectedRipemd = ripemd160(mockPaymentHash)
      const scriptHex = uint8ArrayToHex(script)
      const ripemdHex = uint8ArrayToHex(expectedRipemd)

      expect(scriptHex).toContain(ripemdHex)
    })

    it('should produce different scripts for different locktimes', () => {
      const script1 = constructSwapScript(
        mockPaymentHash,
        800000,
        mockClaimPubkey,
        mockRefundPubkey,
      )
      const script2 = constructSwapScript(
        mockPaymentHash,
        900000,
        mockClaimPubkey,
        mockRefundPubkey,
      )

      expect(uint8ArrayToHex(script1)).not.toBe(uint8ArrayToHex(script2))
    })
  })

  // ============================================================================
  // Address Generation Tests
  // ============================================================================

  describe('scriptToP2wshAddress', () => {
    it('should generate mainnet address with bc prefix', () => {
      const script = new Uint8Array(100).fill(0x00)
      const address = scriptToP2wshAddress(script, 'mainnet')

      expect(address.startsWith('bc1q')).toBe(true)
    })

    it('should generate testnet address with tb prefix', () => {
      const script = new Uint8Array(100).fill(0x00)
      const address = scriptToP2wshAddress(script, 'testnet')

      expect(address.startsWith('tb1q')).toBe(true)
    })

    it('should generate different addresses for different scripts', () => {
      const script1 = new Uint8Array(100).fill(0x00)
      const script2 = new Uint8Array(100).fill(0xff)

      const addr1 = scriptToP2wshAddress(script1, 'mainnet')
      const addr2 = scriptToP2wshAddress(script2, 'mainnet')

      expect(addr1).not.toBe(addr2)
    })

    it('should generate same address for same script', () => {
      const script = new Uint8Array(100).fill(0xab)

      const addr1 = scriptToP2wshAddress(script, 'mainnet')
      const addr2 = scriptToP2wshAddress(script, 'mainnet')

      expect(addr1).toBe(addr2)
    })
  })

  // ============================================================================
  // Script Validation Tests
  // ============================================================================

  describe('validateSwapScript', () => {
    it('should validate correctly constructed script', () => {
      const paymentHash = new Uint8Array(32).fill(0xab)
      const locktime = 800000
      const claimPriv = new Uint8Array(32).fill(0x11)
      const refundPriv = new Uint8Array(32).fill(0x22)
      const claimPubkey = secp256k1.getPublicKey(claimPriv, true)
      const refundPubkey = secp256k1.getPublicKey(refundPriv, true)

      const script = constructSwapScript(paymentHash, locktime, claimPubkey, refundPubkey)
      const address = scriptToP2wshAddress(script, 'mainnet')

      const isValid = validateSwapScript(
        script,
        address,
        paymentHash,
        locktime,
        claimPubkey,
        refundPubkey,
      )

      expect(isValid).toBe(true)
    })

    it('should reject script with wrong address', () => {
      const paymentHash = new Uint8Array(32).fill(0xab)
      const locktime = 800000
      const claimPriv = new Uint8Array(32).fill(0x11)
      const refundPriv = new Uint8Array(32).fill(0x22)
      const claimPubkey = secp256k1.getPublicKey(claimPriv, true)
      const refundPubkey = secp256k1.getPublicKey(refundPriv, true)

      const script = constructSwapScript(paymentHash, locktime, claimPubkey, refundPubkey)

      const isValid = validateSwapScript(
        script,
        'bc1qwrongaddress',
        paymentHash,
        locktime,
        claimPubkey,
        refundPubkey,
      )

      expect(isValid).toBe(false)
    })
  })

  describe('extractSwapScriptParams', () => {
    it('should extract parameters from valid script', () => {
      const paymentHash = new Uint8Array(32).fill(0xab)
      const locktime = 800000
      const claimPriv = new Uint8Array(32).fill(0x11)
      const refundPriv = new Uint8Array(32).fill(0x22)
      const claimPubkey = secp256k1.getPublicKey(claimPriv, true)
      const refundPubkey = secp256k1.getPublicKey(refundPriv, true)

      const script = constructSwapScript(paymentHash, locktime, claimPubkey, refundPubkey)
      const params = extractSwapScriptParams(script)

      expect(params).not.toBeNull()
      if (params) {
        expect(params.locktime).toBe(locktime)
        expect(uint8ArrayToHex(params.claimPubkey)).toBe(uint8ArrayToHex(claimPubkey))
        expect(uint8ArrayToHex(params.refundPubkey)).toBe(uint8ArrayToHex(refundPubkey))
        expect(uint8ArrayToHex(params.paymentHashRipemd)).toBe(
          uint8ArrayToHex(ripemd160(paymentHash)),
        )
      }
    })

    it('should return null for invalid script', () => {
      const invalidScript = new Uint8Array(10).fill(0x00)
      const params = extractSwapScriptParams(invalidScript)

      expect(params).toBeNull()
    })

    it('should return null for empty script', () => {
      const emptyScript = new Uint8Array(0)
      const params = extractSwapScriptParams(emptyScript)

      expect(params).toBeNull()
    })
  })

  // ============================================================================
  // Fee Calculation Tests
  // ============================================================================

  describe('calculateSwapFee', () => {
    const mockFees: SwapFees = {
      percentageBps: 100, // 1%
      miningFeeSat: 1000n,
      minAmountSat: 10000n,
      maxForwardSat: 10000000n,
      maxReverseSat: 5000000n,
    }

    it('should calculate correct fee with percentage and mining fee', () => {
      const amount = 100000n
      const fee = calculateSwapFee(amount, mockFees)

      // 1% of 100000 = 1000, + 1000 mining = 2000
      expect(fee).toBe(2000n)
    })

    it('should handle zero amount', () => {
      const fee = calculateSwapFee(0n, mockFees)

      expect(fee).toBe(1000n) // Just mining fee
    })

    it('should handle large amounts', () => {
      const amount = 1000000000n // 10 BTC in sats
      const fee = calculateSwapFee(amount, mockFees)

      // 1% of 1000000000 = 10000000, + 1000 mining = 10001000
      expect(fee).toBe(10001000n)
    })
  })

  describe('calculateReverseSwapReceiveAmount', () => {
    const mockFees: SwapFees = {
      percentageBps: 100, // 1%
      miningFeeSat: 1000n,
      minAmountSat: 10000n,
      maxForwardSat: 10000000n,
      maxReverseSat: 5000000n,
    }

    it('should calculate correct receive amount after fees', () => {
      const sendAmount = 100000n
      const receiveAmount = calculateReverseSwapReceiveAmount(sendAmount, mockFees)

      // Send 100000, fee is 2000, receive 98000
      expect(receiveAmount).toBe(98000n)
    })

    it('should return negative for small amounts where fee exceeds amount', () => {
      const tinyFees: SwapFees = {
        ...mockFees,
        miningFeeSat: 50000n,
      }
      const sendAmount = 10000n
      const receiveAmount = calculateReverseSwapReceiveAmount(sendAmount, tinyFees)

      // Fee would exceed amount
      expect(receiveAmount).toBeLessThan(0n)
    })
  })

  describe('calculateForwardSwapSendAmount', () => {
    const mockFees: SwapFees = {
      percentageBps: 100, // 1%
      miningFeeSat: 1000n,
      minAmountSat: 10000n,
      maxForwardSat: 10000000n,
      maxReverseSat: 5000000n,
    }

    it('should calculate correct send amount to receive desired amount', () => {
      const receiveAmount = 98000n
      const sendAmount = calculateForwardSwapSendAmount(receiveAmount, mockFees)

      // Should be approximately 100000 + rounding
      expect(sendAmount).toBeGreaterThanOrEqual(100000n)
    })

    it('should account for mining fee', () => {
      const receiveAmount = 50000n
      const sendAmount = calculateForwardSwapSendAmount(receiveAmount, mockFees)

      // Send amount should cover receive + fees
      const fee = calculateSwapFee(sendAmount, mockFees)
      expect(sendAmount - fee).toBeGreaterThanOrEqual(receiveAmount)
    })
  })

  // ============================================================================
  // Key/Preimage Functions Tests
  // ============================================================================

  describe('generateSwapKeyPair', () => {
    it('should generate valid keypair', () => {
      const { privateKey, publicKey } = generateSwapKeyPair()

      expect(privateKey).toBeInstanceOf(Uint8Array)
      expect(privateKey.length).toBe(32)
      expect(publicKey).toBeInstanceOf(Uint8Array)
      expect(publicKey.length).toBe(33) // Compressed pubkey
    })

    it('should generate different keypairs each time', () => {
      const pair1 = generateSwapKeyPair()
      const pair2 = generateSwapKeyPair()

      expect(uint8ArrayToHex(pair1.privateKey)).not.toBe(uint8ArrayToHex(pair2.privateKey))
      expect(uint8ArrayToHex(pair1.publicKey)).not.toBe(uint8ArrayToHex(pair2.publicKey))
    })

    it('should generate valid secp256k1 keypair', () => {
      const { privateKey, publicKey } = generateSwapKeyPair()

      // Verify public key matches private key
      const derivedPubkey = secp256k1.getPublicKey(privateKey, true)
      expect(uint8ArrayToHex(publicKey)).toBe(uint8ArrayToHex(derivedPubkey))
    })
  })

  describe('generatePreimage', () => {
    it('should generate valid preimage and hash', () => {
      const { preimage, paymentHash } = generatePreimage()

      expect(preimage).toBeInstanceOf(Uint8Array)
      expect(preimage.length).toBe(32)
      expect(paymentHash).toBeInstanceOf(Uint8Array)
      expect(paymentHash.length).toBe(32)
    })

    it('should generate correct hash of preimage', () => {
      const { preimage, paymentHash } = generatePreimage()

      const expectedHash = sha256(preimage)
      expect(uint8ArrayToHex(paymentHash)).toBe(uint8ArrayToHex(expectedHash))
    })

    it('should generate different preimages each time', () => {
      const result1 = generatePreimage()
      const result2 = generatePreimage()

      expect(uint8ArrayToHex(result1.preimage)).not.toBe(uint8ArrayToHex(result2.preimage))
      expect(uint8ArrayToHex(result1.paymentHash)).not.toBe(uint8ArrayToHex(result2.paymentHash))
    })
  })

  describe('verifyPreimage', () => {
    it('should verify correct preimage', () => {
      const { preimage, paymentHash } = generatePreimage()

      expect(verifyPreimage(preimage, paymentHash)).toBe(true)
    })

    it('should reject incorrect preimage', () => {
      const { paymentHash } = generatePreimage()
      const wrongPreimage = new Uint8Array(32).fill(0xff)

      expect(verifyPreimage(wrongPreimage, paymentHash)).toBe(false)
    })

    it('should reject preimage with wrong length', () => {
      const { paymentHash } = generatePreimage()
      const shortPreimage = new Uint8Array(31)

      expect(verifyPreimage(shortPreimage, paymentHash)).toBe(false)
    })

    it('should reject payment hash with wrong length', () => {
      const { preimage } = generatePreimage()
      const shortHash = new Uint8Array(31)

      expect(verifyPreimage(preimage, shortHash)).toBe(false)
    })
  })

  // ============================================================================
  // Witness Functions Tests
  // ============================================================================

  describe('constructClaimWitness', () => {
    it('should construct claim witness with correct elements', () => {
      const signature = new Uint8Array(71).fill(0x30)
      const preimage = new Uint8Array(32).fill(0xab)
      const redeemScript = new Uint8Array(100).fill(0x00)

      const witness = constructClaimWitness(signature, preimage, redeemScript)

      expect(witness).toHaveLength(3)
      expect(uint8ArrayToHex(witness[0])).toBe(uint8ArrayToHex(signature))
      expect(uint8ArrayToHex(witness[1])).toBe(uint8ArrayToHex(preimage))
      expect(uint8ArrayToHex(witness[2])).toBe(uint8ArrayToHex(redeemScript))
    })
  })

  describe('constructRefundWitness', () => {
    it('should construct refund witness with empty element', () => {
      const signature = new Uint8Array(71).fill(0x30)
      const redeemScript = new Uint8Array(100).fill(0x00)

      const witness = constructRefundWitness(signature, redeemScript)

      expect(witness).toHaveLength(3)
      expect(uint8ArrayToHex(witness[0])).toBe(uint8ArrayToHex(signature))
      expect(witness[1].length).toBe(0) // Empty element for refund path
      expect(uint8ArrayToHex(witness[2])).toBe(uint8ArrayToHex(redeemScript))
    })
  })

  describe('calculateClaimWitnessSize', () => {
    it('should calculate correct witness size', () => {
      const redeemScriptSize = 107

      const size = calculateClaimWitnessSize(redeemScriptSize)

      // signature (73) + preimage (32) + script (107) + varints
      expect(size).toBeGreaterThan(200)
    })
  })

  describe('calculateRefundWitnessSize', () => {
    it('should calculate correct witness size', () => {
      const redeemScriptSize = 107

      const size = calculateRefundWitnessSize(redeemScriptSize)

      // signature (73) + empty (1) + script (107) + varints
      expect(size).toBeGreaterThan(170)
    })

    it('should be smaller than claim witness size', () => {
      const redeemScriptSize = 107

      const claimSize = calculateClaimWitnessSize(redeemScriptSize)
      const refundSize = calculateRefundWitnessSize(redeemScriptSize)

      // Claim has preimage, refund has empty element
      expect(refundSize).toBeLessThan(claimSize)
    })
  })

  describe('calculateSwapTxFee', () => {
    it('should calculate correct fee for single input/output', () => {
      const witnessSize = 200
      const feeRate = 10

      const fee = calculateSwapTxFee(witnessSize, feeRate, 1, 1)

      expect(fee).toBeGreaterThan(0n)
    })

    it('should increase fee with more inputs', () => {
      const witnessSize = 200
      const feeRate = 10

      const fee1 = calculateSwapTxFee(witnessSize, feeRate, 1, 1)
      const fee2 = calculateSwapTxFee(witnessSize, feeRate, 2, 1)

      expect(fee2).toBeGreaterThan(fee1)
    })

    it('should increase fee with higher fee rate', () => {
      const witnessSize = 200

      const fee1 = calculateSwapTxFee(witnessSize, 10, 1, 1)
      const fee2 = calculateSwapTxFee(witnessSize, 20, 1, 1)

      expect(fee2).toBeGreaterThan(fee1)
    })
  })

  // ============================================================================
  // SwapManager Tests
  // ============================================================================

  describe('SwapManager', () => {
    let manager: SwapManager

    const mockOffer: SwapOffer = {
      fees: {
        percentageBps: 100,
        miningFeeSat: 1000n,
        minAmountSat: 10000n,
        maxForwardSat: 10000000n,
        maxReverseSat: 5000000n,
      },
      serverPubkey: '02' + '11'.repeat(32),
      relays: ['wss://relay.example.com'],
      powBits: 0,
      timestamp: Date.now(),
    }

    beforeEach(() => {
      manager = createSwapManager('mainnet')
    })

    describe('createForwardSwap', () => {
      it('should create forward swap with correct data', async () => {
        const params = {
          amountSat: 100000n,
          invoice: 'lnbc1000n1...',
          refundAddress: 'bc1qtest...',
          offer: mockOffer,
        }

        const swap = await manager.createForwardSwap(params)

        expect(swap.type).toBe(SwapType.FORWARD)
        expect(swap.state).toBe(SwapState.CREATED)
        expect(swap.lightningAmountSat).toBe(100000n)
        expect(swap.preimage).toBeDefined()
        expect(swap.paymentHash).toBeDefined()
        expect(swap.privateKey).toBeDefined()
        expect(swap.claimToAddress).toBe('bc1qtest...')
        expect(swap.serverPubkey).toBe(mockOffer.serverPubkey)
      })

      it('should calculate onchain amount including fees', async () => {
        const params = {
          amountSat: 100000n,
          invoice: 'lnbc1000n1...',
          refundAddress: 'bc1qtest...',
          offer: mockOffer,
        }

        const swap = await manager.createForwardSwap(params)

        // On-chain should be lightning amount + fee
        expect(swap.onchainAmountSat).toBeGreaterThan(swap.lightningAmountSat)
      })
    })

    describe('createReverseSwap', () => {
      it('should create reverse swap with correct data', async () => {
        const params = {
          amountSat: 100000n,
          onchainAddress: 'bc1qtest...',
          offer: mockOffer,
        }

        const swap = await manager.createReverseSwap(params)

        expect(swap.type).toBe(SwapType.REVERSE)
        expect(swap.state).toBe(SwapState.CREATED)
        expect(swap.lightningAmountSat).toBe(100000n)
        expect(swap.privateKey).toBeDefined()
        expect(swap.claimToAddress).toBe('bc1qtest...')
      })

      it('should calculate receive amount after fees', async () => {
        const params = {
          amountSat: 100000n,
          onchainAddress: 'bc1qtest...',
          offer: mockOffer,
        }

        const swap = await manager.createReverseSwap(params)

        // On-chain receive should be less than lightning send
        expect(swap.onchainAmountSat).toBeLessThan(swap.lightningAmountSat)
      })
    })

    describe('updateSwapFromServer', () => {
      it('should update swap with server response', async () => {
        const params = {
          amountSat: 100000n,
          invoice: 'lnbc1000n1...',
          refundAddress: 'bc1qtest...',
          offer: mockOffer,
        }

        const swap = await manager.createForwardSwap(params)

        manager.updateSwapFromServer(swap.paymentHash, {
          swapId: 'swap123',
          lockupAddress: 'bc1qlock...',
          redeemScript: 'abcd1234',
          locktime: 800000,
          expectedAmountSat: 102000n,
          totalFeeSat: 2000n,
        })

        const updatedSwap = manager.getSwap(swap.paymentHash)
        expect(updatedSwap?.lockupAddress).toBe('bc1qlock...')
        expect(updatedSwap?.redeemScript).toBe('abcd1234')
        expect(updatedSwap?.locktime).toBe(800000)
      })

      it('should throw for non-existent swap', () => {
        expect(() => {
          manager.updateSwapFromServer('nonexistent', {
            swapId: 'swap123',
            lockupAddress: 'bc1qlock...',
            redeemScript: 'abcd1234',
            locktime: 800000,
            expectedAmountSat: 102000n,
            totalFeeSat: 2000n,
          })
        }).toThrow('Swap not found')
      })
    })

    describe('state transitions', () => {
      let swap: SwapData

      beforeEach(async () => {
        swap = await manager.createForwardSwap({
          amountSat: 100000n,
          invoice: 'lnbc1000n1...',
          refundAddress: 'bc1qtest...',
          offer: mockOffer,
        })
      })

      it('should transition to FUNDED state', () => {
        manager.setSwapFunded(swap.paymentHash, 'txid123', 0)

        const updated = manager.getSwap(swap.paymentHash)
        expect(updated?.state).toBe(SwapState.FUNDED)
        expect(updated?.fundingTxid).toBe('txid123')
        expect(updated?.fundingVout).toBe(0)
      })

      it('should transition to CONFIRMED state', () => {
        manager.setSwapFunded(swap.paymentHash, 'txid123', 0)
        manager.setSwapConfirmed(swap.paymentHash)

        const updated = manager.getSwap(swap.paymentHash)
        expect(updated?.state).toBe(SwapState.CONFIRMED)
      })

      it('should transition to COMPLETED state', () => {
        manager.setSwapFunded(swap.paymentHash, 'txid123', 0)
        manager.setSwapConfirmed(swap.paymentHash)
        manager.setSwapCompleted(swap.paymentHash, 'spendtxid')

        const updated = manager.getSwap(swap.paymentHash)
        expect(updated?.state).toBe(SwapState.COMPLETED)
        expect(updated?.spendingTxid).toBe('spendtxid')
      })

      it('should transition to EXPIRED state', () => {
        manager.setSwapExpired(swap.paymentHash)

        const updated = manager.getSwap(swap.paymentHash)
        expect(updated?.state).toBe(SwapState.EXPIRED)
      })

      it('should transition to REFUNDED state', () => {
        manager.setSwapExpired(swap.paymentHash)
        manager.setSwapRefunded(swap.paymentHash, 'refundtxid')

        const updated = manager.getSwap(swap.paymentHash)
        expect(updated?.state).toBe(SwapState.REFUNDED)
        expect(updated?.spendingTxid).toBe('refundtxid')
      })
    })

    describe('listSwaps', () => {
      it('should list all swaps', async () => {
        await manager.createForwardSwap({
          amountSat: 100000n,
          invoice: 'lnbc1...',
          refundAddress: 'bc1q...',
          offer: mockOffer,
        })
        await manager.createReverseSwap({
          amountSat: 50000n,
          onchainAddress: 'bc1q...',
          offer: mockOffer,
        })

        const swaps = manager.listSwaps()
        expect(swaps).toHaveLength(2)
      })
    })

    describe('listPendingSwaps', () => {
      it('should only list pending swaps', async () => {
        const swap1 = await manager.createForwardSwap({
          amountSat: 100000n,
          invoice: 'lnbc1...',
          refundAddress: 'bc1q...',
          offer: mockOffer,
        })
        await manager.createReverseSwap({
          amountSat: 50000n,
          onchainAddress: 'bc1q...',
          offer: mockOffer,
        })

        // Complete first swap
        manager.setSwapFunded(swap1.paymentHash, 'txid', 0)
        manager.setSwapConfirmed(swap1.paymentHash)
        manager.setSwapCompleted(swap1.paymentHash, 'spend')

        const pending = manager.listPendingSwaps()
        expect(pending).toHaveLength(1)
        expect(pending[0].type).toBe(SwapType.REVERSE)
      })
    })

    describe('isSwapExpired', () => {
      it('should return true when block height exceeds locktime', async () => {
        const swap = await manager.createForwardSwap({
          amountSat: 100000n,
          invoice: 'lnbc1...',
          refundAddress: 'bc1q...',
          offer: mockOffer,
        })

        manager.updateSwapFromServer(swap.paymentHash, {
          swapId: 'swap123',
          lockupAddress: 'bc1q...',
          redeemScript: 'abcd',
          locktime: 800000,
          expectedAmountSat: 102000n,
          totalFeeSat: 2000n,
        })

        expect(manager.isSwapExpired(swap.paymentHash, 800001)).toBe(true)
        expect(manager.isSwapExpired(swap.paymentHash, 799999)).toBe(false)
      })

      it('should return false for non-existent swap', () => {
        expect(manager.isSwapExpired('nonexistent', 800000)).toBe(false)
      })
    })

    describe('export/import', () => {
      it('should export and import swaps correctly', async () => {
        await manager.createForwardSwap({
          amountSat: 100000n,
          invoice: 'lnbc1...',
          refundAddress: 'bc1q...',
          offer: mockOffer,
        })

        const exported = manager.exportSwaps()
        expect(Object.keys(exported)).toHaveLength(1)

        const newManager = createSwapManager('mainnet')
        newManager.importSwaps(exported)

        expect(newManager.listSwaps()).toHaveLength(1)
      })
    })
  })

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe('createSwapManager', () => {
    it('should create mainnet manager by default', () => {
      const manager = createSwapManager()
      expect(manager).toBeInstanceOf(SwapManager)
    })

    it('should create testnet manager when specified', () => {
      const manager = createSwapManager('testnet')
      expect(manager).toBeInstanceOf(SwapManager)
    })
  })
})
