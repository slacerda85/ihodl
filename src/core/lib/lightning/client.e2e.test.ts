/**
 * Testes end-to-end para o cliente Lightning
 * Valida funcionalidades implementadas do cliente Lightning
 */

import { describe, it, expect } from '@jest/globals'
import LightningClient from './client'

describe('Lightning Network End-to-End Tests', () => {
  let client: LightningClient

  beforeEach(() => {
    client = new LightningClient(
      new Uint8Array(32), // nodeKey
      9735, // port
      'localhost', // host
    )
  })

  describe('Core Functionality', () => {
    it('should initialize client successfully', () => {
      expect(client).toBeDefined()
    })

    it('should handle channel reestablishment', async () => {
      const reestablishMsg = {
        nextCommitmentNumber: 1n,
        nextRevocationNumber: 0n,
        tlvs: [],
      }

      const result = await client.handleChannelReestablish('test-peer', reestablishMsg)
      expect(typeof result).toBe('boolean')
    })

    it('should attempt payment routing', async () => {
      const destination = new Uint8Array(32)
      const route = await client.findPaymentRoute(destination, 10000n)
      expect(route).toBeNull() // Sem grafo configurado
    })

    it('should handle routed payments', async () => {
      const result = await client.sendRoutedPayment('invalid-invoice')
      expect(result.success).toBe(false)
    })
  })

  describe('Watchtower Protection', () => {
    it('should check for breaches', async () => {
      const breaches = await client.checkAllChannelsForBreach('test-tx')
      expect(Array.isArray(breaches)).toBe(true)
    })

    it('should start blockchain monitoring', () => {
      const cleanup = client.startBlockchainMonitoring()
      expect(typeof cleanup).toBe('function')
      cleanup()
    })
  })

  describe('Gossip Protocol', () => {
    it('should process gossip messages', async () => {
      const gossipMessage = {
        type: 256,
        nodeId1: new Uint8Array(32),
        nodeId2: new Uint8Array(32),
        shortChannelId: new Uint8Array(8),
        capacity: 1000000n,
        features: new Uint8Array(2),
        nodeSignature1: new Uint8Array(64),
        nodeSignature2: new Uint8Array(64),
        bitcoinSignature1: new Uint8Array(64),
        bitcoinSignature2: new Uint8Array(64),
      }

      await expect(client.updateRoutingGraph(gossipMessage as any)).resolves.not.toThrow()
    })

    it('should return routing stats', () => {
      const stats = client.getRoutingStats()
      expect(stats).toBeNull()
    })
  })

  describe('Onion Routing', () => {
    it('should create onion packets', () => {
      const route = {
        hops: [
          {
            pubkey: new Uint8Array(32),
            shortChannelId: new Uint8Array(8),
            fee: 1000n,
            cltvExpiryDelta: 40,
          },
        ],
        totalAmountMsat: 101000n,
        totalFeeMsat: 1000n,
        totalCltvExpiry: 100,
      }

      const paymentHash = new Uint8Array(32)
      const packet = (client as any).createOnionPacket(route, paymentHash)

      expect(packet).toBeDefined()
      expect(packet instanceof Uint8Array).toBe(true)
    })
  })
})
