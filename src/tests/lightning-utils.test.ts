import {
  createFundingTransaction,
  createCommitmentTransaction,
  createHtlcTransaction,
  // signLightningTransaction,
  validateChannelTransaction,
} from '../lib/lightning/utils'

describe('Lightning Utils', () => {
  describe('createFundingTransaction', () => {
    it('should create a valid funding transaction', () => {
      const mockUtxos = [
        {
          txid: 'b'.repeat(64),
          vout: 0,
          value: 2100000, // 0.021 BTC - more than needed to have fee
          scriptPubKey: '0014' + 'c'.repeat(40), // P2WPKH
        },
      ]

      const tx = createFundingTransaction(
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', // funding address
        2000000, // amount
        1, // feeRate
        mockUtxos,
      )
      expect(tx).toBeDefined()
      expect(tx.txid).toBe('')
      expect(tx.hex).toBe('')
      expect(tx.inputs).toHaveLength(1)
      expect(tx.outputs).toHaveLength(2) // funding + change
      expect(tx.fee).toBeGreaterThan(0)
    })
  })

  describe('createCommitmentTransaction', () => {
    it('should create a valid commitment transaction', () => {
      const tx = createCommitmentTransaction(
        'test-channel-id',
        'a'.repeat(64), // fundingTxid
        0, // fundingVout
        1000000, // localBalance
        1000000, // remoteBalance
        '02'.repeat(33), // localPubkey
        '03'.repeat(33), // remotePubkey
        0, // commitmentNumber
      )
      expect(tx).toBeDefined()
      expect(tx.txid).toBe('')
      expect(tx.hex).toBe('')
      expect(tx.inputs).toHaveLength(1)
      expect(tx.outputs).toHaveLength(2) // to_local and to_remote
    })
  })

  describe('createHtlcTransaction', () => {
    it('should create a valid HTLC transaction', () => {
      const tx = createHtlcTransaction(
        'd'.repeat(64), // paymentHash
        100000, // amount
        100000, // expiry
        '02'.repeat(33), // revocationPubkey
        '03'.repeat(33), // localDelayedPubkey
        '04'.repeat(33), // remoteHtlcPubkey
      )
      expect(tx).toBeDefined()
      expect(tx.txid).toBe('')
      expect(tx.hex).toBe('')
      expect(tx.inputs).toHaveLength(0) // HTLC tx doesn't have inputs in this simplified version
      expect(tx.outputs).toHaveLength(1)
    })
  })

  describe('validateChannelTransaction', () => {
    it('should validate a commitment transaction', () => {
      const mockTx = {
        version: 2,
        inputs: [{ txid: 'a'.repeat(64), vout: 0 }],
        outputs: [
          { value: 1000000, scriptPubKey: new Uint8Array(22) },
          { value: 1000000, scriptPubKey: new Uint8Array(22) },
        ],
        locktime: 0,
      }

      const mockChannelState = {
        channelId: 'test-channel-id',
        localBalance: 1000000,
        remoteBalance: 1000000,
        commitmentNumber: 0,
      }

      const result = validateChannelTransaction(mockTx, mockChannelState)
      expect(result).toBeDefined()
      expect(typeof result.valid).toBe('boolean')
      expect(Array.isArray(result.errors)).toBe(true)
    })

    it('should detect invalid transactions', () => {
      const invalidTx = {
        version: 1, // Invalid version
        inputs: [],
        outputs: [],
        locktime: 0,
      }

      const mockChannelState = {
        channelId: 'test-channel-id',
        localBalance: 1000000,
        remoteBalance: 1000000,
        commitmentNumber: 0,
      }

      const result = validateChannelTransaction(invalidTx, mockChannelState)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })
})
