/**
 * DNS Bootstrap Implementation (BOLT #10)
 *
 * Implementa descoberta de peers Lightning Network via DNS SRV records.
 * Baseado em https://github.com/lightning/bolts/blob/master/10-dns-bootstrap.md
 */

import { DnsQueryType, createDefaultDnsSeedQuery, parseDnsReply, getPeersFromDnsReply } from './dns'

// ==========================================
// TYPES
// ==========================================

/**
 * Lightning Network peer address
 */
export interface LNPeerAddr {
  host: string
  port: number
  nodeId?: Uint8Array
}

// ==========================================
// CONSTANTS
// ==========================================

/**
 * DNS seeds para Lightning Network
 * Baseado nos seeds conhecidos da comunidade Lightning
 */
export const LN_DNS_SEEDS = [
  'nodes.lightning.directory',
  'lseed.bitcoinstats.com',
  'lseed.darosior.ninja',
] as const

/**
 * Peers hardcoded como fallback quando DNS falha
 * Estes são peers públicos conhecidos que devem estar online
 */
export const FALLBACK_PEERS: LNPeerAddr[] = [
  {
    host: '3.33.236.230',
    port: 9735,
    nodeId: Uint8Array.from([
      0x03, 0x86, 0x4e, 0xf0, 0x25, 0xfd, 0xe8, 0xfb, 0x58, 0x7d, 0x98, 0x91, 0x86, 0xce, 0x6a,
      0x4a, 0x18, 0x68, 0x95, 0xee, 0x44, 0xa9, 0x26, 0xbf, 0xc3, 0x70, 0xe2, 0xc3, 0x66, 0x59,
      0x7a, 0x3f, 0x8f, 0x45,
    ]), // ACINQ
  },
  {
    host: '104.196.249.140',
    port: 9735,
    nodeId: Uint8Array.from([
      0x02, 0x2d, 0x30, 0x8e, 0x9c, 0x3f, 0x62, 0x4f, 0x4a, 0x0b, 0x8d, 0xb0, 0xf6, 0x8d, 0x8f,
      0x9e, 0x05, 0xa7, 0x2f, 0x8f, 0x7f, 0xe9, 0x5a, 0x38, 0x66, 0x40, 0x8b, 0x9d, 0x3b, 0xea,
      0x10, 0x8b, 0xd2,
    ]), // River Financial
  },
]

/**
 * Timeout para queries DNS (em milissegundos)
 */
const DNS_QUERY_TIMEOUT = 10000

// ==========================================
// DNS QUERY IMPLEMENTATION
// ==========================================

/**
 * Executa uma query DNS usando fetch API
 * Como não temos acesso direto a DNS no React Native,
 * usamos um serviço DNS over HTTPS (DoH)
 */
async function performDnsQuery(domain: string, type: DnsQueryType): Promise<any[]> {
  // Usar Google DNS over HTTPS como fallback
  // Em produção, pode ser necessário usar uma biblioteca nativa
  const dohUrl = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`

  try {
    const response = await fetch(dohUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/dns-json',
      },
      signal: AbortSignal.timeout(DNS_QUERY_TIMEOUT),
    })

    if (!response.ok) {
      throw new Error(`DNS query failed: ${response.status}`)
    }

    const data = await response.json()

    if (data.Status !== 0) {
      throw new Error(`DNS query error: ${data.Status}`)
    }

    return data.Answer || []
  } catch (error) {
    console.warn(`[DNS Bootstrap] Query failed for ${domain}:`, error)
    return []
  }
}

// ==========================================
// MAIN FUNCTION
// ==========================================

/**
 * Obtém peers bootstrap via DNS SRV lookup (BOLT #10)
 *
 * Faz query DNS SRV para múltiplos seeds do Lightning Network
 * e retorna lista de peer addresses para bootstrap inicial.
 *
 * @returns Promise<LNPeerAddr[]> Lista de peer addresses descobertos
 */
export async function getBootstrapPeers(): Promise<LNPeerAddr[]> {
  const allPeers: LNPeerAddr[] = []

  console.log('[DNS Bootstrap] Starting DNS SRV lookup for Lightning peers...')

  for (const seedDomain of LN_DNS_SEEDS) {
    try {
      console.log(`[DNS Bootstrap] Querying ${seedDomain}...`)

      // Criar query DNS SRV
      const query = createDefaultDnsSeedQuery(seedDomain, DnsQueryType.SRV)

      // Executar query DNS
      const rawRecords = await performDnsQuery(query.seedRootDomain, DnsQueryType.SRV)

      if (rawRecords.length === 0) {
        console.log(`[DNS Bootstrap] No SRV records found for ${seedDomain}`)
        continue
      }

      // Parse resposta DNS
      const reply = parseDnsReply(query, rawRecords)

      // Extrair peers da resposta
      const peers = getPeersFromDnsReply(reply)

      console.log(`[DNS Bootstrap] Found ${peers.length} peers from ${seedDomain}`)

      // Converter para formato LNPeerAddr
      const lnPeers: LNPeerAddr[] = peers.map(peer => ({
        host: peer.host,
        port: peer.port,
        nodeId: peer.nodeId,
      }))

      allPeers.push(...lnPeers)
    } catch (error) {
      console.warn(`[DNS Bootstrap] Failed to query ${seedDomain}:`, error)
      continue
    }
  }

  // Remover duplicatas baseado em nodeId
  const uniquePeers = allPeers.filter(
    (peer, index, self) =>
      peer.nodeId &&
      index ===
        self.findIndex(
          p => p.nodeId && peer.nodeId && Buffer.from(p.nodeId).equals(Buffer.from(peer.nodeId)),
        ),
  )

  console.log(`[DNS Bootstrap] Total unique peers discovered: ${uniquePeers.length}`)

  // Se não encontrou peers via DNS, usar fallback
  if (uniquePeers.length === 0) {
    console.log('[DNS Bootstrap] No peers found via DNS, using fallback peers')
    return FALLBACK_PEERS
  }

  return uniquePeers
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Converte LNPeerAddr para string de conexão
 */
export function peerAddrToString(peer: LNPeerAddr): string {
  return `${peer.host}:${peer.port}${peer.nodeId ? ` (${Buffer.from(peer.nodeId).toString('hex').slice(0, 8)}...)` : ''}`
}

/**
 * Valida se um peer address é válido
 */
export function isValidPeerAddr(peer: LNPeerAddr): boolean {
  if (!peer.host || !peer.port) {
    return false
  }

  // Validar host (IP ou domínio)
  const hostRegex = /^(([0-9]{1,3}\.){3}[0-9]{1,3}|([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+)$/
  if (!hostRegex.test(peer.host)) {
    return false
  }

  // Validar porta
  if (peer.port < 1 || peer.port > 65535) {
    return false
  }

  // Validar nodeId se presente (deve ser 33 bytes)
  if (peer.nodeId && peer.nodeId.length !== 33) {
    return false
  }

  return true
}
