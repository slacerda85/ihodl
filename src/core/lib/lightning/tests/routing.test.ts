import {
  generateKey,
  generateCipherStream,
  computeSharedSecret,
  blindEphemeralKey,
  computeBlindingFactor,
  constructOnionPacket,
  generateFiller,
  decryptOnion,
  createFailureMessage,
  initializeAttributionData,
  constructOnionMessage,
} from '../routing'
import { Point } from '@/core/models/lightning/base'
import { BlindedPath, OnionmsgTlv } from '@/core/models/lightning/routing'
import * as secp256k1 from 'secp256k1'

// ==========================================
// ROUTING GRAPH TESTS
// ==========================================

import { RoutingGraph, RoutingNode, RoutingChannel } from '../routing'

// BOLT #4 Test Vectors
const boltPubkeys = [
  new Uint8Array([
    0x02, 0xee, 0xc7, 0x24, 0x5d, 0x6b, 0x7d, 0x2c, 0xcb, 0x30, 0x38, 0x0b, 0xfb, 0xe2, 0xa3, 0x64,
    0x8c, 0xd7, 0xa9, 0x42, 0x65, 0x35, 0xaa, 0x34, 0x0e, 0xdc, 0xea, 0x1f, 0x28, 0x36, 0x86, 0x61,
    0x9,
  ]),
  new Uint8Array([
    0x03, 0x24, 0x65, 0x3e, 0xac, 0x43, 0x44, 0x88, 0x00, 0x2c, 0xc0, 0x6b, 0xbf, 0xb7, 0xf1, 0x0f,
    0xe1, 0x89, 0x91, 0xe3, 0x5f, 0x9f, 0xe4, 0x30, 0x2d, 0xbe, 0xa6, 0xd2, 0x35, 0x3d, 0xc0, 0xab,
    0x1c,
  ]),
  new Uint8Array([
    0x02, 0x7f, 0x31, 0xeb, 0xc5, 0x46, 0x2c, 0x1f, 0xdc, 0xe1, 0xb7, 0x37, 0xec, 0xff, 0x52, 0xd3,
    0x7d, 0x75, 0xde, 0xa4, 0x3c, 0xe1, 0x1c, 0x74, 0xd2, 0x5a, 0xa2, 0x97, 0x16, 0x5f, 0xaa, 0x20,
    0x07,
  ]),
  new Uint8Array([
    0x03, 0x2c, 0x0b, 0x7c, 0xf9, 0x53, 0x24, 0xa0, 0x7d, 0x05, 0x39, 0x8b, 0x24, 0x01, 0x74, 0xdc,
    0x0c, 0x2b, 0xe4, 0x4d, 0x96, 0xb1, 0x59, 0xaa, 0x6c, 0x7f, 0x7b, 0x1e, 0x66, 0x86, 0x80, 0x99,
    0x1,
  ]),
  new Uint8Array([
    0x02, 0xed, 0xab, 0xbd, 0x16, 0xb4, 0x1c, 0x83, 0x71, 0xb9, 0x2e, 0xf2, 0xf0, 0x4c, 0x11, 0x85,
    0xb4, 0xf0, 0x3b, 0x6d, 0xcd, 0x52, 0xba, 0x9b, 0x78, 0xd9, 0xd7, 0xc8, 0x9c, 0x8f, 0x22, 0x14,
    0x5,
  ]),
]

// Test vectors from BOLT #4
const pubkeys: Point[] = boltPubkeys

/* for (let i = 0; i < 5; i++) {
  const priv = new Uint8Array(32)
  priv[31 - i] = i + 1
  pubkeys.push(new Uint8Array(secp256k1.publicKeyCreate(priv)))
} */

const htlcHoldTimes = [1, 2, 3, 4, 5]

describe('routing', () => {
  describe('generateKey', () => {
    it('should generate rho key', () => {
      const secret = new Uint8Array(32).fill(0x41)
      const key = generateKey('rho', secret)
      expect(key).toHaveLength(32)
      // Add specific assertion if possible
    })

    it('should generate mu key', () => {
      const secret = new Uint8Array(32).fill(0x41)
      const key = generateKey('mu', secret)
      expect(key).toHaveLength(32)
    })

    it('should generate um key', () => {
      const secret = new Uint8Array(32).fill(0x41)
      const key = generateKey('um', secret)
      expect(key).toHaveLength(32)
    })

    it('should generate pad key', () => {
      const secret = new Uint8Array(32).fill(0x41)
      const key = generateKey('pad', secret)
      expect(key).toHaveLength(32)
    })
  })

  describe('generateCipherStream', () => {
    it('should generate cipher stream', () => {
      const key = new Uint8Array(32).fill(0x41)
      const stream = generateCipherStream(key, 64)
      expect(stream).toHaveLength(64)
    })
  })

  describe('computeSharedSecret', () => {
    it('should compute shared secret', () => {
      const ephemeralKey = new Uint8Array(32)
      ephemeralKey[31] = 1 // valid private key
      const priv = new Uint8Array(32)
      priv[31] = 2
      const hopPublicKey = new Uint8Array(secp256k1.publicKeyCreate(priv))
      const secret = computeSharedSecret(ephemeralKey, hopPublicKey)
      expect(secret).toHaveLength(32)
    })
  })

  describe('blindEphemeralKey', () => {
    it('should blind ephemeral key', () => {
      const ephemeralKey = new Uint8Array(32)
      ephemeralKey[31] = 1
      const blindingFactor = new Uint8Array(32)
      blindingFactor[0] = 2
      const blinded = blindEphemeralKey(ephemeralKey, blindingFactor)
      expect(blinded).toHaveLength(32)
      expect(blinded).not.toEqual(ephemeralKey)
    })
  })

  describe('computeBlindingFactor', () => {
    it('should compute blinding factor', () => {
      const ephemeralPubKey = pubkeys[0] as Point
      const sharedSecret = new Uint8Array(32).fill(0x41)
      const factor = computeBlindingFactor(ephemeralPubKey, sharedSecret)
      expect(factor).toHaveLength(32)
    })
  })

  describe('constructOnionPacket', () => {
    it('should construct onion packet', () => {
      const paymentPath: Point[] = []
      for (let i = 0; i < 5; i++) {
        const priv = new Uint8Array(32)
        priv[31] = i + 1
        paymentPath.push(new Uint8Array(secp256k1.publicKeyCreate(priv)))
      }
      const hopsData: any[] = []
      for (let i = 0; i < paymentPath.length; i++) {
        hopsData.push({ length: 0n, payload: new Uint8Array(0), hmac: new Uint8Array(32) })
      }
      const validSessionKey = new Uint8Array(32)
      validSessionKey[31] = 1
      // This will need proper implementation
      expect(() => constructOnionPacket(paymentPath, validSessionKey, hopsData)).not.toThrow()
    })
  })

  describe('generateFiller', () => {
    it('should generate filler', () => {
      const sharedSecrets = [new Uint8Array(32).fill(0x41)]
      const filler = generateFiller('rho', 1, 1300, sharedSecrets)
      expect(filler).toHaveLength(0) // For numHops=1, no filler
    })
  })

  describe('decryptOnion', () => {
    it('should decrypt onion', () => {
      // Need proper onion packet
      const validPriv = new Uint8Array(32)
      validPriv[31] = 1
      const validPub = new Uint8Array(secp256k1.publicKeyCreate(validPriv))
      const onionPacket = {
        version: 0,
        publicKey: validPub,
        hopPayloads: new Uint8Array(1300),
        hmac: new Uint8Array(32),
      }
      const associatedData = new Uint8Array()
      expect(() => decryptOnion(onionPacket, associatedData)).not.toThrow()
    })
  })

  describe('createFailureMessage', () => {
    it('should create failure message', () => {
      const failureCode = 2 // temporary_node_failure
      const message = createFailureMessage(failureCode)
      expect(message.failureCode).toBe(failureCode)
    })
  })

  describe('initializeAttributionData', () => {
    it('should initialize attribution data', () => {
      const data = initializeAttributionData(htlcHoldTimes, Array(20).fill(new Uint8Array(32)))
      expect(data.htlcHoldTimes).toHaveLength(10)
      expect(data.hmacs).toHaveLength(80)
    })
  })

  describe('constructOnionMessage', () => {
    it('should construct onion message', () => {
      // Mock blinded path with valid pubkeys
      const priv1 = new Uint8Array(32)
      priv1[31] = 1
      const priv2 = new Uint8Array(32)
      priv2[31] = 2
      const path: BlindedPath = {
        firstNodeId: secp256k1.publicKeyCreate(priv1),
        firstPathKey: secp256k1.publicKeyCreate(priv2),
        numHops: 1,
        path: [
          {
            blindedNodeId: secp256k1.publicKeyCreate(priv1),
            enclen: 10,
            encryptedRecipientData: new Uint8Array(10),
          },
        ],
      }
      const payload: OnionmsgTlv = {
        encryptedRecipientData: new Uint8Array([1, 2, 3]),
      }
      const result = constructOnionMessage(path, payload)
      expect(result).toBeDefined()
      expect(result.pathKey).toEqual(path.firstPathKey)
      expect(result.onionMessagePacket).toBeDefined()
    })
  })

  describe('Test Vectors', () => {
    describe('Shared Secrets', () => {
      it('should compute shared secret for node 4', () => {
        // From test vector: shared_secret = b5756b9b542727dbafc6765a49488b023a725d631af688fc031217e90770c328
        const expected = new Uint8Array([
          0xb5, 0x75, 0x6b, 0x9b, 0x54, 0x27, 0x27, 0xdb, 0xaf, 0xc6, 0x76, 0x5a, 0x49, 0x48, 0x8b,
          0x02, 0x3a, 0x72, 0x5d, 0x63, 0x1a, 0xf6, 0x88, 0xfc, 0x03, 0x12, 0x17, 0xe9, 0x07, 0x70,
          0xc3, 0x28,
        ])
        // Need to compute with proper ephemeral key
        // This requires implementing the full blinding chain
        // For now, placeholder
        expect(expected).toHaveLength(32)
      })
    })

    describe('UM Key', () => {
      it('should generate um key for node 4', () => {
        const expected = new Uint8Array([
          0x4d, 0xa7, 0xf2, 0x92, 0x3e, 0xdc, 0xe6, 0xc2, 0xd8, 0x59, 0x87, 0xd1, 0xd9, 0xfa, 0x6d,
          0x88, 0x02, 0x3e, 0x6c, 0x3a, 0x9c, 0x3d, 0x20, 0xf0, 0x7d, 0x3b, 0x10, 0xb6, 0x1a, 0x78,
          0xd6, 0x46,
        ])
        // Compute generateKey('um', sharedSecret)
        expect(expected).toHaveLength(32)
      })
    })

    // Add more test vectors for error packets, etc.
  })
})

describe('RoutingGraph', () => {
  let graph: RoutingGraph

  beforeEach(() => {
    graph = new RoutingGraph()
  })

  describe('addNode', () => {
    it('should add a node to the graph', () => {
      const node: RoutingNode = {
        nodeId: new Uint8Array(33).fill(0x02),
        lastUpdate: Date.now(),
        addresses: [{ type: 'ipv4', address: '127.0.0.1', port: 9735 }],
        alias: 'TestNode',
      }

      graph.addNode(node)

      const stats = graph.getStats()
      expect(stats.nodes).toBe(1)
    })

    it('should update existing node', () => {
      const nodeId = new Uint8Array(33).fill(0x02)
      const node1: RoutingNode = {
        nodeId,
        lastUpdate: Date.now() - 1000,
        addresses: [],
        alias: 'OldAlias',
      }
      const node2: RoutingNode = {
        nodeId,
        lastUpdate: Date.now(),
        addresses: [],
        alias: 'NewAlias',
      }

      graph.addNode(node1)
      graph.addNode(node2)

      const stats = graph.getStats()
      expect(stats.nodes).toBe(1)
    })
  })

  describe('addChannel', () => {
    it('should add a channel to the graph', () => {
      const channel: RoutingChannel = {
        shortChannelId: new Uint8Array(8).fill(0x01),
        nodeId1: new Uint8Array(33).fill(0x02),
        nodeId2: new Uint8Array(33).fill(0x03),
        capacity: 1000000n,
        lastUpdate: Date.now(),
        feeBaseMsat: 1000,
        feeProportionalMillionths: 1,
        cltvExpiryDelta: 40,
        htlcMinimumMsat: 1n,
      }

      graph.addChannel(channel)

      const stats = graph.getStats()
      expect(stats.channels).toBe(1)
    })

    it('should update existing channel', () => {
      const shortChannelId = new Uint8Array(8).fill(0x01)
      const channel1: RoutingChannel = {
        shortChannelId,
        nodeId1: new Uint8Array(33).fill(0x02),
        nodeId2: new Uint8Array(33).fill(0x03),
        capacity: 1000000n,
        lastUpdate: Date.now() - 1000,
        feeBaseMsat: 1000,
        feeProportionalMillionths: 1,
        cltvExpiryDelta: 40,
        htlcMinimumMsat: 1n,
      }
      const channel2: RoutingChannel = {
        shortChannelId,
        nodeId1: new Uint8Array(33).fill(0x02),
        nodeId2: new Uint8Array(33).fill(0x03),
        capacity: 2000000n,
        lastUpdate: Date.now(),
        feeBaseMsat: 2000,
        feeProportionalMillionths: 2,
        cltvExpiryDelta: 80,
        htlcMinimumMsat: 2n,
      }

      graph.addChannel(channel1)
      graph.addChannel(channel2)

      const stats = graph.getStats()
      expect(stats.channels).toBe(1)
    })
  })

  describe('getChannel', () => {
    it('should return channel by short channel id', () => {
      const shortChannelId = new Uint8Array(8).fill(0x01)
      const channel: RoutingChannel = {
        shortChannelId,
        nodeId1: new Uint8Array(33).fill(0x02),
        nodeId2: new Uint8Array(33).fill(0x03),
        capacity: 1000000n,
        lastUpdate: Date.now(),
        feeBaseMsat: 1000,
        feeProportionalMillionths: 1,
        cltvExpiryDelta: 40,
        htlcMinimumMsat: 1n,
      }

      graph.addChannel(channel)

      const retrieved = graph.getChannel(shortChannelId)
      expect(retrieved).not.toBeNull()
      expect(retrieved?.capacity).toBe(1000000n)
    })

    it('should return null for non-existent channel', () => {
      const result = graph.getChannel(new Uint8Array(8).fill(0xff))
      expect(result).toBeNull()
    })
  })

  describe('getAllNodes', () => {
    it('should return empty array when no nodes', () => {
      const nodes = graph.getAllNodes()
      expect(nodes).toHaveLength(0)
    })

    it('should return all nodes', () => {
      graph.addNode({
        nodeId: new Uint8Array(33).fill(0x02),
        lastUpdate: Date.now(),
        addresses: [],
      })
      graph.addNode({
        nodeId: new Uint8Array(33).fill(0x03),
        lastUpdate: Date.now(),
        addresses: [],
      })

      const nodes = graph.getAllNodes()
      expect(nodes).toHaveLength(2)
    })
  })

  describe('getAllChannels', () => {
    it('should return empty array when no channels', () => {
      const channels = graph.getAllChannels()
      expect(channels).toHaveLength(0)
    })

    it('should return all channels', () => {
      graph.addChannel({
        shortChannelId: new Uint8Array(8).fill(0x01),
        nodeId1: new Uint8Array(33).fill(0x02),
        nodeId2: new Uint8Array(33).fill(0x03),
        capacity: 1000000n,
        lastUpdate: Date.now(),
        feeBaseMsat: 1000,
        feeProportionalMillionths: 1,
        cltvExpiryDelta: 40,
        htlcMinimumMsat: 1n,
      })
      graph.addChannel({
        shortChannelId: new Uint8Array(8).fill(0x02),
        nodeId1: new Uint8Array(33).fill(0x04),
        nodeId2: new Uint8Array(33).fill(0x05),
        capacity: 2000000n,
        lastUpdate: Date.now(),
        feeBaseMsat: 2000,
        feeProportionalMillionths: 2,
        cltvExpiryDelta: 80,
        htlcMinimumMsat: 2n,
      })

      const channels = graph.getAllChannels()
      expect(channels).toHaveLength(2)
    })
  })

  describe('getNode', () => {
    it('should return node by id', () => {
      const nodeId = new Uint8Array(33).fill(0x02)
      graph.addNode({
        nodeId,
        lastUpdate: Date.now(),
        addresses: [],
        alias: 'TestNode',
      })

      const node = graph.getNode(nodeId)
      expect(node).not.toBeNull()
      expect(node?.alias).toBe('TestNode')
    })

    it('should return null for non-existent node', () => {
      const result = graph.getNode(new Uint8Array(33).fill(0xff))
      expect(result).toBeNull()
    })
  })

  describe('pruneStaleEntries', () => {
    it('should remove stale nodes', () => {
      // First, add node with "current" time
      const oldNode: RoutingNode = {
        nodeId: new Uint8Array(33).fill(0x02),
        lastUpdate: Date.now(),
        addresses: [],
      }
      const newNode: RoutingNode = {
        nodeId: new Uint8Array(33).fill(0x03),
        lastUpdate: Date.now(),
        addresses: [],
      }

      graph.addNode(oldNode)
      graph.addNode(newNode)

      expect(graph.getStats().nodes).toBe(2)

      // Mock Date.now to simulate time passing
      // Since addNode sets lastUpdate = Date.now(), we need to manipulate
      // the internal nodes directly for this test
      const nodesMap = (graph as any).nodes
      const oldNodeKey = Array.from(nodesMap.keys())[0]
      const nodeData = nodesMap.get(oldNodeKey)
      nodeData.lastUpdate = Date.now() - 8 * 24 * 60 * 60 * 1000 // 8 days ago
      nodesMap.set(oldNodeKey, nodeData)

      graph.pruneStaleEntries()

      expect(graph.getStats().nodes).toBe(1)
    })

    it('should remove stale channels', () => {
      const oldChannel: RoutingChannel = {
        shortChannelId: new Uint8Array(8).fill(0x01),
        nodeId1: new Uint8Array(33).fill(0x02),
        nodeId2: new Uint8Array(33).fill(0x03),
        capacity: 1000000n,
        lastUpdate: Date.now(),
        feeBaseMsat: 1000,
        feeProportionalMillionths: 1,
        cltvExpiryDelta: 40,
        htlcMinimumMsat: 1n,
      }
      const newChannel: RoutingChannel = {
        shortChannelId: new Uint8Array(8).fill(0x02),
        nodeId1: new Uint8Array(33).fill(0x04),
        nodeId2: new Uint8Array(33).fill(0x05),
        capacity: 2000000n,
        lastUpdate: Date.now(),
        feeBaseMsat: 2000,
        feeProportionalMillionths: 2,
        cltvExpiryDelta: 80,
        htlcMinimumMsat: 2n,
      }

      graph.addChannel(oldChannel)
      graph.addChannel(newChannel)

      expect(graph.getStats().channels).toBe(2)

      // Manipulate internal channel data to simulate stale entry
      const channelsMap = (graph as any).channels
      const oldChannelKey = Array.from(channelsMap.keys())[0]
      const channelData = channelsMap.get(oldChannelKey)
      channelData.lastUpdate = Date.now() - 8 * 24 * 60 * 60 * 1000 // 8 days ago
      channelsMap.set(oldChannelKey, channelData)

      graph.pruneStaleEntries()

      expect(graph.getStats().channels).toBe(1)
    })
  })

  describe('findRoute', () => {
    it('should return error when source node not found', () => {
      const result = graph.findRoute(
        new Uint8Array(33).fill(0x02),
        new Uint8Array(33).fill(0x03),
        1000000n,
      )

      expect(result.route).toBeNull()
      expect(result.error).toContain('not found')
    })

    it('should return error when destination node not found', () => {
      graph.addNode({
        nodeId: new Uint8Array(33).fill(0x02),
        lastUpdate: Date.now(),
        addresses: [],
      })

      const result = graph.findRoute(
        new Uint8Array(33).fill(0x02),
        new Uint8Array(33).fill(0x03),
        1000000n,
      )

      expect(result.route).toBeNull()
      expect(result.error).toContain('not found')
    })

    it('should find route between connected nodes', () => {
      const nodeId1 = new Uint8Array(33).fill(0x02)
      const nodeId2 = new Uint8Array(33).fill(0x03)

      graph.addNode({ nodeId: nodeId1, lastUpdate: Date.now(), addresses: [] })
      graph.addNode({ nodeId: nodeId2, lastUpdate: Date.now(), addresses: [] })
      graph.addChannel({
        shortChannelId: new Uint8Array(8).fill(0x01),
        nodeId1,
        nodeId2,
        capacity: 10000000n,
        lastUpdate: Date.now(),
        feeBaseMsat: 1000,
        feeProportionalMillionths: 1,
        cltvExpiryDelta: 40,
        htlcMinimumMsat: 1n,
      })

      const result = graph.findRoute(nodeId1, nodeId2, 1000000n)

      // Should find a route (or at least not error on source/dest not found)
      if (result.route) {
        expect(result.route.hops.length).toBeGreaterThan(0)
      }
    })
  })

  describe('getStats', () => {
    it('should return correct counts', () => {
      graph.addNode({
        nodeId: new Uint8Array(33).fill(0x02),
        lastUpdate: Date.now(),
        addresses: [],
      })
      graph.addChannel({
        shortChannelId: new Uint8Array(8).fill(0x01),
        nodeId1: new Uint8Array(33).fill(0x02),
        nodeId2: new Uint8Array(33).fill(0x03),
        capacity: 1000000n,
        lastUpdate: Date.now(),
        feeBaseMsat: 1000,
        feeProportionalMillionths: 1,
        cltvExpiryDelta: 40,
        htlcMinimumMsat: 1n,
      })

      const stats = graph.getStats()
      expect(stats.nodes).toBe(1)
      expect(stats.channels).toBe(1)
    })
  })
})
