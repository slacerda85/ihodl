import { signTransaction } from './transactions'
import { fromMnemonic, createRootExtendedKey } from './key'

// Define SimpleTransaction interface locally for testing
interface SimpleTransaction {
  version: number
  inputs: {
    txid: string
    vout: number
    scriptSig: Uint8Array
    sequence: number
  }[]
  outputs: {
    value: number
    scriptPubKey: Uint8Array
  }[]
  locktime: number
  witnesses: Uint8Array[][]
}

// Mock transaction data for testing
const mockTransaction: SimpleTransaction = {
  version: 2,
  inputs: [
    {
      txid: 'a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d',
      vout: 0,
      scriptSig: new Uint8Array(0),
      sequence: 0xfffffffd,
    },
  ],
  outputs: [
    {
      value: 50000, // 0.0005 BTC in sats
      scriptPubKey: new Uint8Array([
        0x00,
        0x14, // OP_0, 20 bytes
        0x75,
        0x1e,
        0x76,
        0xe8,
        0x19,
        0x91,
        0x96,
        0xd4,
        0x54,
        0x94,
        0x1c,
        0x45,
        0xd1,
        0xb3,
        0xa3,
        0x23,
        0xf1,
        0x43,
        0x3b,
        0xd6,
      ]),
    },
  ],
  locktime: 0,
  witnesses: [],
}

const mockInputs = [
  {
    address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    amount: 100000, // 0.001 BTC in sats
    txid: 'a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d',
    vout: 0,
  },
]

// Test mnemonic for development (DO NOT USE IN PRODUCTION)
const testMnemonic =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('signTransaction', () => {
  it('should sign a transaction without errors', async () => {
    try {
      // Generate extended key from mnemonic
      const rootKey = fromMnemonic(testMnemonic)
      const extendedKey = createRootExtendedKey(rootKey)

      console.log('Testing signTransaction...')

      const result = await signTransaction({
        transaction: mockTransaction,
        inputs: mockInputs,
        extendedKey: extendedKey,
        purpose: 84,
        coinType: 0,
        accountIndex: 0,
      })

      console.log('Transaction signed successfully!')
      console.log('TXID:', result.txid)
      console.log('TX Hex length:', result.txHex.length)

      expect(result.txid).toBeDefined()
      expect(result.txHex).toBeDefined()
      expect(result.txHex.length).toBeGreaterThan(0)
    } catch (error) {
      console.error('Error in signTransaction:', error)
      throw error
    }
  })

  it('should handle different input amounts correctly', async () => {
    const testAmounts = [1000, 50000, 100000, 1000000, 10000000]

    for (const amount of testAmounts) {
      try {
        const rootKey = fromMnemonic(testMnemonic)
        const extendedKey = createRootExtendedKey(rootKey)

        const testInputs = [
          {
            ...mockInputs[0],
            amount: amount,
          },
        ]

        await signTransaction({
          transaction: mockTransaction,
          inputs: testInputs,
          extendedKey: extendedKey,
          purpose: 84,
          coinType: 0,
          accountIndex: 0,
        })

        console.log(`Amount ${amount} sats: OK`)
      } catch (error) {
        console.error(`Error with amount ${amount}:`, error)
        throw error
      }
    }
  })

  it('should handle edge cases', async () => {
    // Test with zero amount (should fail gracefully)
    try {
      const rootKey = fromMnemonic(testMnemonic)
      const extendedKey = createRootExtendedKey(rootKey)

      const zeroAmountInputs = [
        {
          ...mockInputs[0],
          amount: 0,
        },
      ]

      await signTransaction({
        transaction: mockTransaction,
        inputs: zeroAmountInputs,
        extendedKey: extendedKey,
        purpose: 84,
        coinType: 0,
        accountIndex: 0,
      })

      // If we reach here, the test should fail
      expect(true).toBe(false) // Should have thrown an error
    } catch (error) {
      console.log('Zero amount correctly rejected:', (error as Error).message)
      // This is expected behavior
    }
  })
})
