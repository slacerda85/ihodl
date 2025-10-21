// Test script for Lightning Network functions
import { disconnectFromNode, getNetworkGraph, estimateRoutingFee } from './src/lib/lightning'

async function testLightningFunctions() {
  console.log('Testing Lightning Network functions...\n')

  try {
    // Test getNetworkGraph
    console.log('1. Testing getNetworkGraph...')
    const networkGraph = await getNetworkGraph()
    console.log(
      `✓ Network graph: ${networkGraph.nodes.length} nodes, ${networkGraph.edges.length} edges`,
    )
    console.log()

    // Test estimateRoutingFee
    console.log('2. Testing estimateRoutingFee...')
    const feeEstimate = await estimateRoutingFee('mock-destination-pubkey', 10000)
    console.log(`✓ Fee estimate: ${feeEstimate.fee} sats, probability: ${feeEstimate.probability}`)
    console.log()

    // Test disconnection
    console.log('3. Testing disconnectFromNode...')
    await disconnectFromNode()
    console.log('✓ Disconnected successfully\n')

    console.log('All Lightning Network functions tested successfully!')
  } catch (error) {
    console.error('Test failed:', error)
  }
}

// Run the test
testLightningFunctions()
