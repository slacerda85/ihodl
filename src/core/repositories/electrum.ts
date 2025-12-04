import { MMKV } from 'react-native-mmkv'

// Electrum peer format from network discovery
export type ElectrumPeer = [string, string, string[]] // [ip, hostname, features[]]

// Connection options for connecting to peers
export interface ElectrumConnectionOptions {
  host: string
  port: number
  rejectUnauthorized?: boolean
}

// Persisted peer with metadata
export interface PersistedElectrumPeer {
  host: string
  port: number
  lastConnected?: number
  lastHeight?: number
  failureCount?: number
}

const electrumStorage = new MMKV({
  id: 'electrum-storage',
})

const STORAGE_KEYS = {
  TRUSTED_PEERS: 'trustedPeers',
  LAST_PEER_UPDATE: 'lastPeerUpdate',
  LAST_CONNECTED_PEER: 'lastConnectedPeer',
  PEER_STATS: 'peerStats',
} as const

interface ElectrumRepositoryInterface {
  // Trusted Peers
  saveTrustedPeers(peers: ElectrumPeer[]): void
  getTrustedPeers(): ElectrumPeer[]
  clearTrustedPeers(): void

  // Last Peer Update timestamp
  setLastPeerUpdate(timestamp: number): void
  getLastPeerUpdate(): number | null

  // Last Connected Peer (for quick reconnection)
  setLastConnectedPeer(peer: PersistedElectrumPeer): void
  getLastConnectedPeer(): PersistedElectrumPeer | null

  // Peer Statistics (for smart peer selection)
  savePeerStats(host: string, stats: PersistedElectrumPeer): void
  getPeerStats(host: string): PersistedElectrumPeer | null
  getAllPeerStats(): Record<string, PersistedElectrumPeer>
  clearPeerStats(): void

  // Utility
  clearAll(): void
}

export class ElectrumRepository implements ElectrumRepositoryInterface {
  // ==========================================
  // TRUSTED PEERS
  // ==========================================

  saveTrustedPeers(peers: ElectrumPeer[]): void {
    try {
      electrumStorage.set(STORAGE_KEYS.TRUSTED_PEERS, JSON.stringify(peers))
      console.log(`[electrum-repo] Saved ${peers.length} trusted peers`)
    } catch (error) {
      console.error('[electrum-repo] Failed to save trusted peers:', error)
    }
  }

  getTrustedPeers(): ElectrumPeer[] {
    try {
      const data = electrumStorage.getString(STORAGE_KEYS.TRUSTED_PEERS)
      if (data) {
        const peers = JSON.parse(data) as ElectrumPeer[]
        return peers
      }
      return []
    } catch (error) {
      console.error('[electrum-repo] Failed to parse trusted peers:', error)
      electrumStorage.delete(STORAGE_KEYS.TRUSTED_PEERS)
      return []
    }
  }

  clearTrustedPeers(): void {
    electrumStorage.delete(STORAGE_KEYS.TRUSTED_PEERS)
  }

  // ==========================================
  // LAST PEER UPDATE
  // ==========================================

  setLastPeerUpdate(timestamp: number): void {
    try {
      electrumStorage.set(STORAGE_KEYS.LAST_PEER_UPDATE, timestamp)
    } catch (error) {
      console.error('[electrum-repo] Failed to save last peer update:', error)
    }
  }

  getLastPeerUpdate(): number | null {
    try {
      const timestamp = electrumStorage.getNumber(STORAGE_KEYS.LAST_PEER_UPDATE)
      return timestamp ?? null
    } catch (error) {
      console.error('[electrum-repo] Failed to get last peer update:', error)
      return null
    }
  }

  // ==========================================
  // LAST CONNECTED PEER
  // ==========================================

  setLastConnectedPeer(peer: PersistedElectrumPeer): void {
    try {
      electrumStorage.set(STORAGE_KEYS.LAST_CONNECTED_PEER, JSON.stringify(peer))
    } catch (error) {
      console.error('[electrum-repo] Failed to save last connected peer:', error)
    }
  }

  getLastConnectedPeer(): PersistedElectrumPeer | null {
    try {
      const data = electrumStorage.getString(STORAGE_KEYS.LAST_CONNECTED_PEER)
      if (data) {
        return JSON.parse(data) as PersistedElectrumPeer
      }
      return null
    } catch (error) {
      console.error('[electrum-repo] Failed to parse last connected peer:', error)
      return null
    }
  }

  // ==========================================
  // PEER STATISTICS
  // ==========================================

  savePeerStats(host: string, stats: PersistedElectrumPeer): void {
    try {
      const allStats = this.getAllPeerStats()
      allStats[host] = stats
      electrumStorage.set(STORAGE_KEYS.PEER_STATS, JSON.stringify(allStats))
    } catch (error) {
      console.error('[electrum-repo] Failed to save peer stats:', error)
    }
  }

  getPeerStats(host: string): PersistedElectrumPeer | null {
    const allStats = this.getAllPeerStats()
    return allStats[host] || null
  }

  getAllPeerStats(): Record<string, PersistedElectrumPeer> {
    try {
      const data = electrumStorage.getString(STORAGE_KEYS.PEER_STATS)
      if (data) {
        return JSON.parse(data)
      }
      return {}
    } catch (error) {
      console.error('[electrum-repo] Failed to parse peer stats:', error)
      electrumStorage.delete(STORAGE_KEYS.PEER_STATS)
      return {}
    }
  }

  clearPeerStats(): void {
    electrumStorage.delete(STORAGE_KEYS.PEER_STATS)
  }

  // ==========================================
  // UTILITY
  // ==========================================

  clearAll(): void {
    electrumStorage.clearAll()
    console.log('[electrum-repo] Cleared all electrum storage')
  }

  // ==========================================
  // HELPER: Convert ElectrumPeer to ConnectionOptions
  // ==========================================

  peersToConnectionOptions(peers: ElectrumPeer[]): ElectrumConnectionOptions[] {
    return peers
      .filter(peer => {
        const features = peer[2]
        // Filter peers with SSL (s) or TCP (t) support
        return features?.some(f => f.startsWith('s') || f.startsWith('t'))
      })
      .map(peer => {
        const host = peer[1] // Use hostname
        const features = peer[2]

        // Prefer SSL over TCP
        const sslFeature = features.find(f => f.startsWith('s'))
        const tcpFeature = features.find(f => f.startsWith('t'))

        // Extract port number
        let port = 50002 // Default SSL port
        if (sslFeature && sslFeature.length > 1) {
          port = parseInt(sslFeature.substring(1), 10)
        } else if (tcpFeature && tcpFeature.length > 1) {
          port = parseInt(tcpFeature.substring(1), 10)
        }

        return { host, port, rejectUnauthorized: false }
      })
  }

  // ==========================================
  // HELPER: Convert ConnectionOptions to ElectrumPeer format
  // ==========================================

  connectionOptionsToPeers(options: ElectrumConnectionOptions[]): ElectrumPeer[] {
    return options
      .filter(opt => opt.host && opt.port)
      .map(opt => [opt.host, opt.host, ['s', opt.port.toString()]])
  }
}

const electrumRepository = new ElectrumRepository()

export default electrumRepository
