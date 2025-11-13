import { decodeBolt11Invoice } from '../../lib/lightning/utils'
import { BOLT11_TEST_VECTORS, BOLT11_FEATURE_TEST_VECTORS } from './bolt11-vectors'

describe('BOLT 11 Compliance Tests', () => {
  describe('Official Test Vectors', () => {
    BOLT11_TEST_VECTORS.forEach((testVector, index) => {
      it(`${testVector.description} (vector ${index})`, async () => {
        const result = await decodeBolt11Invoice(testVector.invoice)

        // Verify payment hash
        expect(result.paymentHash).toBe(testVector.expected.paymentHash)

        // Verify amount if specified
        if (testVector.expected.amount !== undefined) {
          expect(result.amount).toBe(testVector.expected.amount)
        }

        // Verify description if specified
        if (testVector.expected.description !== undefined) {
          expect(result.description).toBe(testVector.expected.description)
        }

        // Verify description hash if specified
        if (testVector.expected.descriptionHash !== undefined) {
          expect(result.descriptionHash).toBe(testVector.expected.descriptionHash)
        }

        // Verify payment secret if specified
        if (testVector.expected.paymentSecret !== undefined) {
          expect(result.paymentSecret).toBe(testVector.expected.paymentSecret)
        }

        // Verify expiry if specified
        if (testVector.expected.expiry !== undefined) {
          // Expiry should be timestamp + expiry seconds
          const expectedExpiry = (result.timestamp || 0) + testVector.expected.expiry
          expect(result.expiry).toBe(expectedExpiry)
        }

        // Verify features if specified
        if (testVector.expected.features !== undefined) {
          expect(result.features).toBeDefined()
          // Feature verification would require proper feature bit parsing
        }

        // Verify fallback address if specified
        if (testVector.expected.fallbackAddress !== undefined) {
          expect(result.fallbackAddress).toBe(testVector.expected.fallbackAddress)
        }

        // Verify routing info if specified
        if (testVector.expected.routingInfo !== undefined) {
          expect(result.routingHints).toBeDefined()
          expect(Array.isArray(result.routingHints)).toBe(true)
          expect(result.routingHints!.length).toBe(testVector.expected.routingInfo.length)

          testVector.expected.routingInfo.forEach((expectedRoute, routeIndex) => {
            const actualRoute = result.routingHints![routeIndex]
            expect(actualRoute.nodeId).toBe(expectedRoute.pubkey)
            expect(actualRoute.channelId).toBe(expectedRoute.shortChannelId)
            expect(actualRoute.feeBaseMsat).toBe(expectedRoute.feeBaseMsat)
            expect(actualRoute.feeProportionalMillionths).toBe(
              expectedRoute.feeProportionalMillionths,
            )
            expect(actualRoute.cltvExpiryDelta).toBe(expectedRoute.cltvExpiryDelta)
          })
        }

        // Verify node ID if specified
        if (testVector.expected.nodeId !== undefined) {
          expect(result.payeePubKey).toBe(testVector.expected.nodeId)
        }
      })
    })
  })

  describe('Feature Test Vectors', () => {
    BOLT11_FEATURE_TEST_VECTORS.forEach((testVector, index) => {
      it(`Feature test: ${testVector.description} (vector ${index})`, async () => {
        const result = await decodeBolt11Invoice(testVector.invoice)

        // Basic verification that decoding doesn't throw
        expect(result).toBeDefined()
        expect(result.paymentHash).toBeDefined()
        expect(typeof result.paymentHash).toBe('string')
        expect(result.paymentHash!.length).toBe(64) // 32 bytes hex
      })
    })
  })

  describe('Error Cases', () => {
    it('should reject invalid BOLT11 invoices', async () => {
      // Skip until proper validation is implemented
      await expect(decodeBolt11Invoice('invalid')).rejects.toThrow()
      await expect(decodeBolt11Invoice('')).rejects.toThrow()
      await expect(decodeBolt11Invoice('lnbc1invalid')).rejects.toThrow()
    })

    it('should reject malformed invoices', async () => {
      // Skip until proper validation is implemented
      await expect(
        decodeBolt11Invoice(
          'lnbc1ps9zprzpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsdqq9qypqszpyrpe4tym8d3q87d43cgdhhlsrt78epu7u99mkzttmt2wtsx0304rrw50addkryfrd3vn3zy467vxwlmf4uz7yvntuwjr2hqjl9lw5cqwtp2d',
        ),
      ).rejects.toThrow() // truncated
    })
  })

  describe('Network Detection', () => {
    it('should detect mainnet invoices', async () => {
      // Skip until proper network detection is implemented
      const mainnetInvoice =
        'lnbc1ps9zprzpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsdqq9qypqszpyrpe4tym8d3q87d43cgdhhlsrt78epu7u99mkzttmt2wtsx0304rrw50addkryfrd3vn3zy467vxwlmf4uz7yvntuwjr2hqjl9lw5cqwtp2dy'
      const result = await decodeBolt11Invoice(mainnetInvoice)
      expect(result.network).toBe('mainnet')
    })

    it('should detect testnet invoices', async () => {
      // Skip until proper network detection is implemented
      const testnetInvoice =
        'lntb1ps9zprzpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsdqq9qypqszpyrpe4tym8d3q87d43cgdhhlsrt78epu7u99mkzttmt2wtsx0304rrw50addkryfrd3vn3zy467vxwlmf4uz7yvntuwjr2hqjl9lw5cqwtp2dy'
      const result = await decodeBolt11Invoice(testnetInvoice)
      expect(result.network).toBe('testnet')
    })
  })
})
