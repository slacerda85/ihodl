import { uint8ArrayToHex } from '../../utils'
import { encodeBech32NodeId, decodeBech32NodeId } from '../../address'
import { generateTestNodeId } from '../test-utils'
import {
  buildDnsQueryDomain,
  parseDnsReply,
  extractNodeIdFromVirtualHostname,
  validateDnsReply,
  getPeersFromDnsReply,
  createDefaultDnsSeedQuery,
  DnsQueryType,
} from '../dns'
import { DnsReply, DnsSrvRecord } from '@/core/models/lightning/dns'

// Derive test node ID from test mnemonic
const testNodeId = generateTestNodeId()
const testNodeIdHex = uint8ArrayToHex(testNodeId)
const testNodeIdBech32 = encodeBech32NodeId(testNodeId)

// Test Bech32 Node ID encoding/decoding
describe('Bech32 Node ID', () => {
  describe('encodeBech32NodeId and decodeBech32NodeId', () => {
    it('should encode and decode a valid node ID', () => {
      const encoded = encodeBech32NodeId(testNodeId)
      expect(encoded).toBe(testNodeIdBech32)
      const decoded = decodeBech32NodeId(encoded)
      expect(uint8ArrayToHex(decoded)).toBe(testNodeIdHex)
    })

    it('should throw on invalid length', () => {
      const invalidNodeId = new Uint8Array(32) // 32 bytes instead of 33
      expect(() => encodeBech32NodeId(invalidNodeId)).toThrow('Node ID must be 33 bytes')
    })

    it('should throw on invalid HRP', () => {
      expect(() => decodeBech32NodeId('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toThrow(
        'Invalid HRP for Lightning node ID',
      )
    })
  })
})

// Test DNS query building
describe('DNS Query Building', () => {
  describe('buildDnsQueryDomain', () => {
    it('should build domain with default conditions', () => {
      const query = createDefaultDnsSeedQuery('lseed.bitcoinstats.com', DnsQueryType.SRV)
      const domain = buildDnsQueryDomain(query)
      expect(domain).toBe('_nodes._tcp.lseed.bitcoinstats.com')
    })

    it('should build domain with custom conditions', () => {
      const query = {
        seedRootDomain: 'lseed.bitcoinstats.com',
        conditions: { r: 0, a: 2, n: 10 },
        queryType: DnsQueryType.SRV,
      }
      const domain = buildDnsQueryDomain(query)
      expect(domain).toBe('_nodes._tcp.a2.n10.lseed.bitcoinstats.com')
    })

    it('should build A query domain', () => {
      const query = createDefaultDnsSeedQuery('lseed.bitcoinstats.com', DnsQueryType.A)
      const domain = buildDnsQueryDomain(query)
      expect(domain).toBe('lseed.bitcoinstats.com')
    })
  })
})

// Test DNS reply parsing
describe('DNS Reply Parsing', () => {
  describe('parseDnsReply', () => {
    it('should parse SRV records', () => {
      const query = createDefaultDnsSeedQuery('lseed.bitcoinstats.com', DnsQueryType.SRV)
      const rawRecords = [
        {
          type: 'SRV',
          name: '_nodes._tcp.lseed.bitcoinstats.com',
          priority: 10,
          weight: 10,
          port: 9735,
          target: `${testNodeIdBech32}.lseed.bitcoinstats.com`,
          ttl: 60,
        },
      ]
      const reply = parseDnsReply(query, rawRecords)
      expect(reply.records).toHaveLength(1)
      expect(reply.records[0].type).toBe(DnsQueryType.SRV)
      expect((reply.records[0] as DnsSrvRecord).port).toBe(9735)
    })
  })
})

// Test node ID extraction
describe('Node ID Extraction', () => {
  describe('extractNodeIdFromVirtualHostname', () => {
    it('should extract node ID from virtual hostname', () => {
      const hostname = `${testNodeIdBech32}.lseed.bitcoinstats.com`
      const seedRootDomain = 'lseed.bitcoinstats.com'
      const nodeId = extractNodeIdFromVirtualHostname(hostname, seedRootDomain)
      expect(uint8ArrayToHex(nodeId)).toBe(testNodeIdHex)
    })

    it('should throw on invalid hostname', () => {
      const hostname = 'invalid.com'
      const seedRootDomain = 'lseed.bitcoinstats.com'
      expect(() => extractNodeIdFromVirtualHostname(hostname, seedRootDomain)).toThrow(
        'Invalid virtual hostname',
      )
    })
  })
})

// Test reply validation
describe('DNS Reply Validation', () => {
  describe('validateDnsReply', () => {
    it('should validate valid reply', () => {
      const query = createDefaultDnsSeedQuery('lseed.bitcoinstats.com', DnsQueryType.SRV)
      const reply: DnsReply = {
        query,
        records: [
          {
            type: DnsQueryType.SRV,
            domain: '_nodes._tcp.lseed.bitcoinstats.com',
            priority: 10,
            weight: 10,
            port: 9735,
            target: `${testNodeIdBech32}.lseed.bitcoinstats.com`,
            ttl: 60,
          },
        ],
      }
      expect(validateDnsReply(reply)).toBe(true)
    })

    it('should invalidate reply with low TTL', () => {
      const query = createDefaultDnsSeedQuery('lseed.bitcoinstats.com', DnsQueryType.SRV)
      const reply: DnsReply = {
        query,
        records: [
          {
            type: DnsQueryType.SRV,
            domain: '_nodes._tcp.lseed.bitcoinstats.com',
            priority: 10,
            weight: 10,
            port: 9735,
            target: `${testNodeIdBech32}.lseed.bitcoinstats.com`,
            ttl: 30, // Below MIN_TTL
          },
        ],
      }
      expect(validateDnsReply(reply)).toBe(false)
    })
  })
})

// Test peer extraction
describe('Peer Extraction', () => {
  describe('getPeersFromDnsReply', () => {
    it('should extract peers from SRV reply', () => {
      const query = createDefaultDnsSeedQuery('lseed.bitcoinstats.com', DnsQueryType.SRV)
      const reply: DnsReply = {
        query,
        records: [
          {
            type: DnsQueryType.SRV,
            domain: '_nodes._tcp.lseed.bitcoinstats.com',
            priority: 10,
            weight: 10,
            port: 9735,
            target: `${testNodeIdBech32}.lseed.bitcoinstats.com`,
            ttl: 60,
          },
        ],
      }
      const peers = getPeersFromDnsReply(reply)
      expect(peers).toHaveLength(1)
      expect(peers[0].port).toBe(9735)
      expect(uint8ArrayToHex(peers[0].nodeId!)).toBe(testNodeIdHex)
    })
  })
})
