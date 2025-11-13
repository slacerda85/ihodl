// Test script for Lightning Network routing functions
import { estimateRoutingFee } from '../../lib/lightning'

describe('Lightning Routing Functions', () => {
  test('estimateRoutingFee returns valid fee estimate', async () => {
    const feeEstimate = await estimateRoutingFee('mock-destination-pubkey', 10000)

    expect(feeEstimate).toHaveProperty('fee')
    expect(feeEstimate).toHaveProperty('probability')
    expect(feeEstimate).toHaveProperty('hops')

    expect(typeof feeEstimate.fee).toBe('number')
    expect(typeof feeEstimate.probability).toBe('number')
    expect(typeof feeEstimate.hops).toBe('number')

    expect(feeEstimate.fee).toBeGreaterThanOrEqual(0)
    expect(feeEstimate.probability).toBeGreaterThan(0)
    expect(feeEstimate.probability).toBeLessThanOrEqual(1)
    expect(feeEstimate.hops).toBeGreaterThan(0)

    console.log(`✓ Fee estimate: ${feeEstimate.fee} sats, probability: ${feeEstimate.probability}`)
  })

  test('estimateRoutingFee handles different amounts', async () => {
    const amounts = [1000, 5000, 10000, 50000]

    for (const amount of amounts) {
      const feeEstimate = await estimateRoutingFee('mock-destination-pubkey', amount)
      expect(feeEstimate.fee).toBeGreaterThanOrEqual(0)
      expect(feeEstimate.fee).toBeLessThanOrEqual(amount) // Fee shouldn't exceed payment amount
    }
  })
})
