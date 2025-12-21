// BOLT #10: DNS Bootstrap and Assisted Node Location
// Implementation based on https://github.com/lightning/bolts/blob/master/10-dns-bootstrap.md

import {
  DnsQueryType,
  DnsSeedQuery,
  DnsRecord,
  DnsARecord,
  DnsAaaaRecord,
  DnsSrvRecord,
  DnsReply,
  VirtualHostname,
  DEFAULT_REALM,
  DEFAULT_ADDRESS_TYPES,
  DEFAULT_NUM_RECORDS,
  DEFAULT_PORT,
  MIN_TTL,
} from '@/core/models/lightning/dns'
import { decodeBech32NodeId } from '@/core/lib/address'

// Re-export for tests
export { DnsQueryType }

// Build DNS query domain from conditions
export function buildDnsQueryDomain(query: DnsSeedQuery): string {
  const conditions = query.conditions
  const parts: string[] = []

  // Add conditions in order: from right to left (seed root domain)
  if (conditions.r !== undefined && conditions.r !== DEFAULT_REALM) {
    parts.push(`r${conditions.r}`)
  }
  if (conditions.a !== undefined && conditions.a !== DEFAULT_ADDRESS_TYPES) {
    parts.push(`a${conditions.a}`)
  }
  if (conditions.l !== undefined) {
    parts.push(`l${conditions.l}`)
  }
  if (conditions.n !== undefined && conditions.n !== DEFAULT_NUM_RECORDS) {
    parts.push(`n${conditions.n}`)
  }

  // For SRV queries, add _nodes._tcp. prefix
  const prefix = query.queryType === DnsQueryType.SRV ? '_nodes._tcp.' : ''
  const domain =
    parts.length > 0 ? `${parts.join('.')}.${query.seedRootDomain}` : query.seedRootDomain

  return prefix + domain
}

// Parse DNS reply records
export function parseDnsReply(query: DnsSeedQuery, rawRecords: any[]): DnsReply {
  const records: DnsRecord[] = []

  for (const raw of rawRecords) {
    if (query.queryType === DnsQueryType.A && raw.type === 'A') {
      records.push({
        type: DnsQueryType.A,
        domain: raw.name,
        ip: raw.data,
        ttl: raw.ttl,
      } as DnsARecord)
    } else if (query.queryType === DnsQueryType.AAAA && raw.type === 'AAAA') {
      records.push({
        type: DnsQueryType.AAAA,
        domain: raw.name,
        ip: raw.data,
        ttl: raw.ttl,
      } as DnsAaaaRecord)
    } else if (query.queryType === DnsQueryType.SRV && raw.type === 'SRV') {
      records.push({
        type: DnsQueryType.SRV,
        domain: raw.name,
        priority: raw.priority,
        weight: raw.weight,
        port: raw.port,
        target: raw.target,
        ttl: raw.ttl,
      } as DnsSrvRecord)
    }
  }

  return {
    query,
    records,
  }
}

// Extract node_id from virtual hostname
export function extractNodeIdFromVirtualHostname(
  hostname: VirtualHostname,
  seedRootDomain: string,
): Uint8Array {
  if (!hostname.endsWith(`.${seedRootDomain}`)) {
    throw new Error('Invalid virtual hostname')
  }
  const nodeIdBech32 = hostname.slice(0, -seedRootDomain.length - 1)
  return decodeBech32NodeId(nodeIdBech32)
}

// Validate DNS reply according to BOLT #10
export function validateDnsReply(reply: DnsReply): boolean {
  // Check TTL
  for (const record of reply.records) {
    if (record.ttl < MIN_TTL) {
      return false
    }
  }

  // For A/AAAA queries, check default port assumption
  if (reply.query.queryType === DnsQueryType.A || reply.query.queryType === DnsQueryType.AAAA) {
    // Assume default port 9735
  }

  // For SRV, ports may vary
  if (reply.query.queryType === DnsQueryType.SRV) {
    for (const record of reply.records) {
      if (record.type === DnsQueryType.SRV && record.port < 1) {
        return false
      }
    }
  }

  return true
}

// Get peers from DNS reply
export function getPeersFromDnsReply(
  reply: DnsReply,
): { host: string; port: number; nodeId?: Uint8Array }[] {
  const peers: { host: string; port: number; nodeId?: Uint8Array }[] = []

  if (reply.query.queryType === DnsQueryType.A || reply.query.queryType === DnsQueryType.AAAA) {
    for (const record of reply.records) {
      if (record.type === DnsQueryType.A || record.type === DnsQueryType.AAAA) {
        const nodeId = extractNodeIdFromVirtualHostname(
          record.domain as VirtualHostname,
          reply.query.seedRootDomain,
        )
        peers.push({
          host: record.ip,
          port: DEFAULT_PORT,
          nodeId,
        })
      }
    }
  } else if (reply.query.queryType === DnsQueryType.SRV) {
    for (const record of reply.records) {
      if (record.type === DnsQueryType.SRV) {
        const nodeId = extractNodeIdFromVirtualHostname(record.target, reply.query.seedRootDomain)
        peers.push({
          host: record.target,
          port: record.port,
          nodeId,
        })
      }
    }
  }

  return peers
}

// Create default DNS seed query
export function createDefaultDnsSeedQuery(
  seedRootDomain: string,
  queryType: DnsQueryType,
): DnsSeedQuery {
  return {
    seedRootDomain,
    conditions: {
      r: DEFAULT_REALM,
      a: DEFAULT_ADDRESS_TYPES,
      n: DEFAULT_NUM_RECORDS,
    },
    queryType,
  }
}

// Create node-specific query
export function createNodeDnsSeedQuery(
  seedRootDomain: string,
  nodeId: string,
  queryType: DnsQueryType,
): DnsSeedQuery {
  return {
    seedRootDomain,
    conditions: {
      r: DEFAULT_REALM,
      a: DEFAULT_ADDRESS_TYPES,
      l: nodeId,
      n: 1,
    },
    queryType,
  }
}
