import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { WorkerService } from '../ln-worker-service'

// Mocks for external dependencies to keep tests deterministic and offline
jest.mock('../../lib/electrum/client', () => ({
  __esModule: true,
  connect: jest.fn(async () => ({ socket: true })),
  getCurrentBlockHeight: jest.fn(async () => 750_000),
  close: jest.fn(async () => undefined),
}))

jest.mock('../ln-electrum-watcher-service', () => ({
  __esModule: true,
  createElectrumWatcherService: jest.fn(() => ({ start: jest.fn() })),
}))

jest.mock('../ln-channel-onchain-monitor-service', () => ({
  __esModule: true,
  createChannelOnChainMonitorService: jest.fn(() => ({ start: jest.fn() })),
}))

jest.mock('../ln-watchtower-service', () => ({
  __esModule: true,
  WatchtowerService: class {
    initialize = jest.fn(async () => undefined)
    destroy = jest.fn(() => undefined)
  },
}))

jest.mock('../ln-monitor-service', () => ({
  __esModule: true,
  LightningMonitorService: class {
    start = jest.fn(async () => undefined)
    stop = jest.fn(async () => undefined)
    getStatus = jest.fn(() => ({}))
    checkHTLCsNow = jest.fn(async () => undefined)
    checkChannelsNow = jest.fn(async () => undefined)
    syncWatchtowerNow = jest.fn(async () => undefined)
  },
}))

jest.mock('../ln-peer-service', () => ({
  __esModule: true,
  PeerConnectivityService: class {
    private peers = [{ nodeId: 'peer-1', address: '127.0.0.1', port: 9735, isConnected: true }]
    constructor() {}
    start = jest.fn(async () => undefined)
    stop = jest.fn(async () => undefined)
    reconnectAll = jest.fn(async () => undefined)
    addPeer = jest.fn()
    removePeer = jest.fn()
    getConnectedPeers = jest.fn(() => this.peers)
    getAllPeers = jest.fn(() => this.peers)
    getStatus = jest.fn(() => ({ totalPeers: this.peers.length }))
    on = jest.fn()
    off = jest.fn()
    removeAllListeners = jest.fn()
  },
}))

jest.mock('../ln-service', () => ({
  __esModule: true,
  default: class LightningService {
    initialize = jest.fn(async () => undefined)
    updateReadinessState = jest.fn()
    getBalance = jest.fn(async () => 0n)
    getChannels = jest.fn(async () => [])
    getInvoices = jest.fn(async () => [])
    getPayments = jest.fn(async () => [])
    getReadinessState = jest.fn(async () => ({
      isWalletLoaded: true,
      isTransportConnected: true,
      isPeerConnected: true,
      isGossipSynced: true,
      isWatcherRunning: true,
    }))
  },
}))

jest.mock('../wallet', () => ({
  __esModule: true,
  default: class WalletService {
    getActiveWalletId = jest.fn(() => 'wallet-1')
  },
}))

jest.mock('../errorRecovery', () => ({
  __esModule: true,
  createErrorRecoveryService: jest.fn(() => ({
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
  })),
}))

jest.mock('../ln-channel-reestablish-service', () => ({
  __esModule: true,
  default: class ChannelReestablishService {
    reestablishChannel = jest.fn(async () => ({ success: true }))
  },
}))

jest.mock('../../lib/lightning/gossip-sync', () => ({
  __esModule: true,
  GossipSyncManager: class {
    startSync = jest.fn(async () => undefined)
    getProgress = jest.fn(() => ({ overall: 1, nodesDiscovered: 1, channelsDiscovered: 1 }))
    sync = jest.fn(async () => undefined)
  },
}))

jest.mock('../../lib/lightning/graph-cache', () => ({
  __esModule: true,
  GraphCacheManager: class {
    loadGraph = jest.fn(() => undefined)
  },
}))

jest.mock('../ln-routing-service', () => ({
  __esModule: true,
  RoutingMode: { LOCAL: 'LOCAL' },
  getLightningRoutingService: jest.fn(() => ({
    initialize: jest.fn(async () => undefined),
    setRoutingMode: jest.fn(async () => undefined),
  })),
}))

jest.mock('../../repositories/lightning', () => ({
  __esModule: true,
  LightningRepository: jest.fn().mockImplementation(() => ({
    findAllChannels: jest.fn(() => ({
      'channel-1': { channelId: 'abcd', nodeId: 'node-1' },
    })),
    findAllPeers: jest.fn(() => []),
  })),
}))

const MASTER_KEY = new Uint8Array([1, 2, 3, 4])

describe('WorkerService initialization and lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('runs initialization phases in order and sets readiness flags', async () => {
    const service = new WorkerService()
    const calls: string[] = []

    jest.spyOn(service as any, 'loadPersistedState').mockImplementation(async () => {
      calls.push('loadPersistedState')
    })

    jest.spyOn(service as any, 'initializeCoreComponents').mockImplementation(async () => {
      calls.push('initializeCoreComponents')
      ;(service as any).setReadiness({
        walletLoaded: true,
        electrumReady: true,
        watcherRunning: true,
      })
      return { success: true }
    })

    jest.spyOn(service as any, 'syncLightningGraph').mockImplementation(async () => {
      calls.push('syncLightningGraph')
      ;(service as any).setReadiness({ gossipSynced: true })
      return { success: true }
    })

    jest.spyOn(service as any, 'establishPeerConnections').mockImplementation(async () => {
      calls.push('establishPeerConnections')
      ;(service as any).setReadiness({ peerConnected: true, transportConnected: true })
      return { success: true }
    })

    jest.spyOn(service as any, 'startMonitoringServices').mockImplementation(async () => {
      calls.push('startMonitoringServices')
    })

    jest.spyOn(service as any, 'startBackgroundGossipSync').mockImplementation(async () => {
      calls.push('startBackgroundGossipSync')
      ;(service as any).setReadiness({ gossipSynced: true })
    })

    jest.spyOn(service as any, 'saveInitState').mockImplementation(async () => {
      calls.push('saveInitState')
    })

    const result = await service.initialize(MASTER_KEY, 'wallet-a')

    expect(result.success).toBe(true)
    expect(calls).toEqual([
      'loadPersistedState',
      'initializeCoreComponents',
      'syncLightningGraph',
      'establishPeerConnections',
      'startMonitoringServices',
      'startBackgroundGossipSync',
      'saveInitState',
    ])

    const readiness = service.getReadiness()
    expect(readiness.walletLoaded).toBe(true)
    expect(readiness.electrumReady).toBe(true)
    expect(readiness.transportConnected).toBe(true)
    expect(readiness.peerConnected).toBe(true)
    expect(readiness.gossipSynced).toBe(true)
    expect(readiness.watcherRunning).toBe(true)
  })

  it('completes Electrum → peers → gossip pipeline and marks readiness', async () => {
    const service = new WorkerService()
    const result = await service.initialize(MASTER_KEY, 'wallet-b')

    expect(result.success).toBe(true)

    const readiness = service.getReadiness()
    expect(readiness.walletLoaded).toBe(true)
    expect(readiness.electrumReady).toBe(true)
    expect(readiness.transportConnected).toBe(true)
    expect(readiness.peerConnected).toBe(true)
    expect(readiness.gossipSynced).toBe(true)
    expect(readiness.watcherRunning).toBe(true)
    expect(readiness.channelsReestablished).toBe(true)

    const metrics = service.getMetrics()
    expect(metrics.electrumHeight).toBe(750_000)
    expect(metrics.connectedPeers).toBeGreaterThanOrEqual(1)
    expect(metrics.gossipCompleted).toBe(true)
  })

  it('restarts for wallet change, resetting state and reinitializing readiness', async () => {
    const service = new WorkerService()
    await service.initialize(MASTER_KEY, 'wallet-a')

    // Ensure readiness set from first init
    expect(service.getReadiness().walletLoaded).toBe(true)

    const result = await service.restartForWallet('wallet-b', MASTER_KEY)
    expect(result.success).toBe(true)

    const readiness = service.getReadiness()
    expect(readiness.walletLoaded).toBe(true)
    expect(readiness.electrumReady).toBe(true)
    expect(readiness.peerConnected).toBe(true)
    expect(readiness.gossipSynced).toBe(true)
  })
})
