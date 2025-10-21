/**
 * P2P Engine Usage Example
 * Demonstrates how to use the Lightning P2P protocol engine
 */

import { P2PEngine, P2PMessageType, createPingMessage, createInitMessage } from './index'

// Example: Initialize P2P engine
async function initializeP2P() {
  console.log('Initializing P2P Engine...')

  // Create P2P engine with custom config
  const p2pEngine = new P2PEngine({
    maxConnections: 5,
    heartbeatInterval: 30000,
    connectionTimeout: 10000,
  })

  // Register message handler
  p2pEngine.onMessage((connectionId: string, message: any) => {
    console.log(`Received message from ${connectionId}:`, {
      type: message.type,
      payloadLength: message.payload.length,
      timestamp: message.timestamp,
    })

    // Handle different message types
    switch (message.type) {
      case P2PMessageType.PING:
        console.log('Received PING, sending PONG...')
        // Send pong response
        break
      case P2PMessageType.INIT:
        console.log('Received INIT message')
        // Handle initialization
        break
      default:
        console.log(`Unhandled message type: ${message.type}`)
    }
  })

  return p2pEngine
}

// Example: Connect to peers and send messages
async function demonstrateP2PUsage() {
  const p2pEngine = await initializeP2P()

  try {
    // Discover and connect to peers
    console.log('Discovering and connecting to peers...')
    const connections = await p2pEngine.discoverAndConnect(3)
    console.log(`Connected to ${connections.length} peers`)

    // Send a ping message to first connection
    if (connections.length > 0) {
      const pingMessage = createPingMessage()
      await p2pEngine.sendMessage(connections[0].id, pingMessage)
      console.log('Sent PING message')
    }

    // Get network statistics
    const stats = p2pEngine.getNetworkStats()
    console.log('Network stats:', stats)

    // List all connections
    const allConnections = p2pEngine.getConnections()
    console.log(`Total active connections: ${allConnections.length}`)

    // Graceful shutdown
    await p2pEngine.shutdown()
    console.log('P2P engine shut down successfully')
  } catch (error) {
    console.error('P2P demonstration failed:', error)
    await p2pEngine.shutdown()
  }
}

// Example: Manual peer connection
async function connectToSpecificPeer() {
  const p2pEngine = await initializeP2P()

  try {
    // Connect to a specific peer
    const peerAddress = {
      host: '127.0.0.1', // localhost for testing
      port: 9735,
    }

    console.log(`Connecting to peer ${peerAddress.host}:${peerAddress.port}...`)
    const connection = await p2pEngine.connect(peerAddress)
    console.log(`Connected successfully! Connection ID: ${connection.id}`)

    // Send init message
    const initMessage = createInitMessage()
    await p2pEngine.sendMessage(connection.id, initMessage)
    console.log('Sent INIT message')

    // Wait a bit for responses
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Disconnect
    await p2pEngine.disconnect(connection.id)
    console.log('Disconnected from peer')
  } catch (error) {
    console.error('Peer connection failed:', error)
  } finally {
    await p2pEngine.shutdown()
  }
}

// Export for testing
export { initializeP2P, demonstrateP2PUsage, connectToSpecificPeer }
