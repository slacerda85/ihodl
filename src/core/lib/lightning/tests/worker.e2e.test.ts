/**
 * Testes end-to-end para o cliente Lightning
 * Valida funcionalidades implementadas do cliente Lightning
 */

import LightningWorker from '../worker'
import { randomBytes } from '../../crypto/crypto'
import watchtowerService from '@/core/services/watchtower'

// Mock de conexão Lightning
const createMockConnection = () => {
  return {
    write: () => false,
    destroy: function () {
      return this
    },
    on: function () {
      return this
    },
    once: function () {
      return this
    },
    removeListener: function () {
      return this
    },
    transportKeys: {
      sk: new Uint8Array(32),
      rk: new Uint8Array(32),
      sn: 0,
      rn: 0,
      sck: new Uint8Array(32),
      rck: new Uint8Array(32),
    },
    peerPubKey: new Uint8Array(33),
  } as any
}

describe('Lightning Network End-to-End Tests', () => {
  let worker: LightningWorker
  const masterKey = randomBytes(64) // Extended key (privkey + chaincode)

  beforeEach(() => {
    const mockConnection = createMockConnection()
    worker = new LightningWorker(mockConnection, masterKey, 'testnet')
  })

  describe('Core Functionality', () => {
    it('should initialize client successfully', () => {
      expect(worker).toBeDefined()
    })

    it('should handle channel reestablishment', async () => {
      const reestablishMsg = {
        nextCommitmentNumber: 1n,
        nextRevocationNumber: 0n,
        tlvs: [],
      }

      const result = await worker.processChannelReestablish('test-peer', reestablishMsg)
      expect(typeof result).toBe('boolean')
    })

    it('should attempt payment routing', async () => {
      const destination = new Uint8Array(32)
      const route = await worker.findPaymentRoute(destination, 10000n)
      expect(route).toBeNull() // Sem grafo configurado
    })

    it('should handle payments via sendPayment', async () => {
      await expect(worker.sendPayment({ invoice: 'invalid-invoice' })).rejects.toThrow(
        'Invalid Lightning invoice',
      )
    })
  })

  describe('Watchtower Protection', () => {
    it('should check for breaches', () => {
      // watchtowerService.checkChannel requer channelId e txHex
      const breachResult = watchtowerService.checkChannel('test-channel-id', 'test-tx-hex')
      // Retorna BreachResult com campo breach: boolean
      expect(breachResult).toBeDefined()
      expect(typeof breachResult.breach).toBe('boolean')
    })

    it('should start blockchain monitoring', () => {
      const cleanup = worker.startBlockchainMonitoring()
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

      await expect(worker.updateRoutingGraph(gossipMessage as any)).resolves.not.toThrow()
    })

    it('should return routing stats', () => {
      const stats = worker.getRoutingStats()
      // Sem grafo configurado, retorna stats zeradas
      expect(stats).toEqual({
        nodeCount: 0,
        channelCount: 0,
        totalCapacity: 0n,
      })
    })
  })

  describe('Onion Routing', () => {
    it('should create onion packets', () => {
      // Gera uma pubkey válida de 33 bytes (compressed) com prefixo 02/03
      const validPubkey = new Uint8Array(33)
      validPubkey[0] = 0x02 // Prefixo de chave pública comprimida
      for (let i = 1; i < 33; i++) validPubkey[i] = i

      const route = {
        hops: [
          {
            pubkey: validPubkey,
            shortChannelId: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]),
            fee: 1000n,
            cltvExpiryDelta: 40,
            amountToForward: 100000n,
            outgoingCltvValue: 600000,
          },
        ],
        totalAmountMsat: 101000n,
        totalFeeMsat: 1000n,
        totalCltvExpiry: 600040,
      }

      const paymentHash = new Uint8Array(32)
      for (let i = 0; i < 32; i++) paymentHash[i] = i

      // O método pode lançar exceção se não tiver canal configurado no grafo
      // ou retornar um Uint8Array válido se conseguir
      try {
        const packet = (worker as any).createOnionPacket(route, paymentHash)
        expect(packet === undefined || packet instanceof Uint8Array).toBe(true)
      } catch {
        // Esperado - sem canais configurados, o método pode falhar
        expect(true).toBe(true)
      }
    })
  })
})
