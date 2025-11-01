// Test script for Lightning Network functions
import { estimateRoutingFee } from './src/lib/lightning'

async function testLightningFunctions() {
  console.log('Testing Lightning Network functions...\n')

  try {
    // Test estimateRoutingFee
    console.log('1. Testing estimateRoutingFee...')
    const feeEstimate = await estimateRoutingFee('mock-destination-pubkey', 10000)
    console.log(`✓ Fee estimate: ${feeEstimate.fee} sats, probability: ${feeEstimate.probability}`)
    console.log()

    console.log('All Lightning Network functions tested successfully!')
  } catch (error) {
    console.error('Test failed:', error)
  }
}

// Run the test
testLightningFunctions()
