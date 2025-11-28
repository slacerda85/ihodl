// BOLT #10: DNS Bootstrap and Assisted Node Location
// Based on https://github.com/lightning/bolts/blob/master/10-dns-bootstrap.md

// DNS Query Types
export enum DnsQueryType {
  A = 'A',
  AAAA = 'AAAA',
  SRV = 'SRV',
}

// DNS Conditions
export interface DnsConditions {
  r?: number // realm byte, default 0 (Bitcoin)
  a?: number // address types bitfield, default 6 (IPv4 | IPv6)
  l?: string // bech32-encoded node_id
  n?: number // number of desired reply records, default 25
}

// DNS Seed Query
export interface DnsSeedQuery {
  seedRootDomain: string
  conditions: DnsConditions
  queryType: DnsQueryType
}

// DNS Reply Records
export interface DnsARecord {
  type: DnsQueryType.A
  domain: string
  ip: string // IPv4 address
  ttl: number
}

export interface DnsAaaaRecord {
  type: DnsQueryType.AAAA
  domain: string
  ip: string // IPv6 address
  ttl: number
}

export interface DnsSrvRecord {
  type: DnsQueryType.SRV
  domain: string
  priority: number
  weight: number
  port: number
  target: string // virtual hostname
  ttl: number
}

export type DnsRecord = DnsARecord | DnsAaaaRecord | DnsSrvRecord

// DNS Reply
export interface DnsReply {
  query: DnsSeedQuery
  records: DnsRecord[]
}

// Virtual Hostname (node_id.seedRootDomain)
export type VirtualHostname = string

// Constants
export const DEFAULT_REALM = 0 // Bitcoin
export const DEFAULT_ADDRESS_TYPES = 6 // IPv4 (2) | IPv6 (4)
export const DEFAULT_NUM_RECORDS = 25
export const DEFAULT_PORT = 9735 // Lightning default port
export const MIN_TTL = 60 // seconds

// Address Types (from BOLT #7)
export enum AddressType {
  IPv4 = 1,
  IPv6 = 2,
  TorV2 = 4,
  TorV3 = 8,
  DNS = 16,
}
