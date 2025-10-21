/**
 * P2P Peer Discovery Module
 * Discovers and manages Lightning Network peers
 */

import { IPeerDiscovery, PeerAddress } from './types'
import { SEED_NODES } from './constants'

export class PeerDiscovery implements IPeerDiscovery {
  private knownPeers: Map<string, PeerAddress> = new Map()
  private seedPeers: PeerAddress[] = SEED_NODES.map(node => ({
    host: node.host,
    port: node.port,
  }))

  constructor() {
    // Initialize with seed nodes
    this.seedPeers.forEach(peer => {
      const key = `${peer.host}:${peer.port}`
      this.knownPeers.set(key, peer)
    })
  }

  /**
   * Discover new peers in the network
   * This is a simplified implementation - in production, this would:
   * 1. Query DNS seeds
   * 2. Use peer exchange from connected peers
   * 3. Query gossip network
   * 4. Use hardcoded seed nodes
   */
  async discoverPeers(): Promise<PeerAddress[]> {
    const discoveredPeers: PeerAddress[] = []

    try {
      // For now, just return seed nodes that we're not already connected to
      // In a real implementation, this would actively discover new peers

      // Simulate discovering some additional peers
      // This would come from actual network queries in production
      const additionalPeers: PeerAddress[] = [
        { host: '1.2.3.4', port: 9735 },
        { host: '5.6.7.8', port: 9735 },
        { host: '9.10.11.12', port: 9735 },
      ]

      // Filter out peers we already know
      for (const peer of [...this.seedPeers, ...additionalPeers]) {
        const key = `${peer.host}:${peer.port}`
        if (!this.knownPeers.has(key)) {
          discoveredPeers.push(peer)
          this.knownPeers.set(key, peer)
        }
      }

      console.log(`Discovered ${discoveredPeers.length} new peers`)
      return discoveredPeers
    } catch (error) {
      console.error('Error discovering peers:', error)
      return []
    }
  }

  /**
   * Add a peer to the known peers list
   */
  addKnownPeer(peer: PeerAddress): void {
    const key = `${peer.host}:${peer.port}`
    this.knownPeers.set(key, peer)
    console.log(`Added known peer: ${key}`)
  }

  /**
   * Remove a peer from the known peers list
   */
  removeKnownPeer(peerAddress: string): void {
    if (this.knownPeers.has(peerAddress)) {
      this.knownPeers.delete(peerAddress)
      console.log(`Removed known peer: ${peerAddress}`)
    }
  }

  /**
   * Get all known peers
   */
  getKnownPeers(): PeerAddress[] {
    return Array.from(this.knownPeers.values())
  }

  /**
   * Get a random selection of peers for connection attempts
   */
  getRandomPeers(count: number = 5): PeerAddress[] {
    const allPeers = this.getKnownPeers()
    const shuffled = allPeers.sort(() => 0.5 - Math.random())
    return shuffled.slice(0, Math.min(count, allPeers.length))
  }

  /**
   * Check if a peer is known
   */
  isKnownPeer(host: string, port: number): boolean {
    const key = `${host}:${port}`
    return this.knownPeers.has(key)
  }

  /**
   * Get peer count
   */
  getPeerCount(): number {
    return this.knownPeers.size
  }

  /**
   * Clear all known peers except seed nodes
   */
  clearPeers(): void {
    this.knownPeers.clear()
    // Re-add seed nodes
    this.seedPeers.forEach(peer => {
      const key = `${peer.host}:${peer.port}`
      this.knownPeers.set(key, peer)
    })
    console.log('Cleared peers, keeping only seed nodes')
  }

  /**
   * Get peers by region (simplified - would use IP geolocation in production)
   */
  getPeersByRegion(region?: string): PeerAddress[] {
    // Simplified implementation - in production, this would use IP geolocation
    // to return peers from specific regions for better connectivity
    return this.getKnownPeers()
  }

  /**
   * Update peer information (e.g., last seen, capabilities)
   */
  updatePeerInfo(host: string, port: number, updates: Partial<PeerAddress>): void {
    const key = `${host}:${port}`
    const existingPeer = this.knownPeers.get(key)

    if (existingPeer) {
      const updatedPeer = { ...existingPeer, ...updates }
      this.knownPeers.set(key, updatedPeer)
    }
  }

  /**
   * Get peer statistics
   */
  getPeerStats(): {
    totalPeers: number
    seedPeers: number
    discoveredPeers: number
  } {
    const totalPeers = this.knownPeers.size
    const seedPeers = this.seedPeers.length
    const discoveredPeers = totalPeers - seedPeers

    return {
      totalPeers,
      seedPeers,
      discoveredPeers,
    }
  }
}
