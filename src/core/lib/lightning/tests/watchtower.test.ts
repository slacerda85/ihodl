/**
 * Watchtower Tests
 *
 * Testes unitários para o sistema Watchtower de monitoramento de canais.
 */

import {
  Watchtower,
  WatchtowerConfig,
  ChannelInfo,
  ChannelState,
  ChannelMonitorStatus,
  createWatchtower,
  deriveRevocationPubkey,
  deriveRevocationPrivkey,
} from '../watchtower'

// ==========================================
// HELPERS
// ==========================================

function createMockChannelInfo(overrides?: Partial<ChannelInfo>): ChannelInfo {
  return {
    channelId: 'test_channel_001',
    peerId: 'peer_001',
    state: ChannelState.NORMAL,
    localBalance: 500000n,
    remoteBalance: 500000n,
    capacity: 1000000n,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    ...overrides,
  }
}

function createMockRemotePubkey(): Uint8Array {
  const pubkey = new Uint8Array(33)
  pubkey[0] = 0x02
  for (let i = 1; i < 33; i++) {
    pubkey[i] = i
  }
  return pubkey
}

function createMockRevocationSecret(): Uint8Array {
  const secret = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    secret[i] = 255 - i
  }
  return secret
}

// ==========================================
// BASIC TESTS
// ==========================================

describe('Watchtower', () => {
  let watchtower: Watchtower

  beforeEach(() => {
    watchtower = createWatchtower()
  })

  afterEach(() => {
    watchtower.stop()
  })

  describe('createWatchtower', () => {
    it('should create watchtower with default config', () => {
      const wt = createWatchtower()
      const stats = wt.getStats()
      expect(stats.monitoredChannels).toBe(0)
      expect(stats.isRunning).toBe(false)
    })

    it('should create watchtower with custom config', () => {
      const config: Partial<WatchtowerConfig> = {
        checkIntervalMs: 30000,
        maxStoredSecrets: 500,
      }
      const wt = createWatchtower(config)
      expect(wt).toBeInstanceOf(Watchtower)
    })
  })

  describe('lifecycle', () => {
    it('should start monitoring', () => {
      expect(watchtower.getStats().isRunning).toBe(false)
      watchtower.start()
      expect(watchtower.getStats().isRunning).toBe(true)
    })

    it('should stop monitoring', () => {
      watchtower.start()
      expect(watchtower.getStats().isRunning).toBe(true)
      watchtower.stop()
      expect(watchtower.getStats().isRunning).toBe(false)
    })

    it('should not start twice', () => {
      watchtower.start()
      watchtower.start() // Deve ignorar
      expect(watchtower.getStats().isRunning).toBe(true)
    })
  })

  describe('addChannel', () => {
    it('should add channel for monitoring', () => {
      const channelInfo = createMockChannelInfo()
      const remotePubkey = createMockRemotePubkey()

      watchtower.addChannel(channelInfo.channelId, channelInfo, remotePubkey)

      expect(watchtower.isChannelMonitored(channelInfo.channelId)).toBe(true)
      expect(watchtower.getStats().monitoredChannels).toBe(1)
    })

    it('should track multiple channels', () => {
      const remotePubkey = createMockRemotePubkey()

      watchtower.addChannel(
        'channel_1',
        createMockChannelInfo({ channelId: 'channel_1' }),
        remotePubkey,
      )
      watchtower.addChannel(
        'channel_2',
        createMockChannelInfo({ channelId: 'channel_2' }),
        remotePubkey,
      )
      watchtower.addChannel(
        'channel_3',
        createMockChannelInfo({ channelId: 'channel_3' }),
        remotePubkey,
      )

      expect(watchtower.getStats().monitoredChannels).toBe(3)
      expect(watchtower.getMonitoredChannels()).toHaveLength(3)
    })
  })

  describe('removeChannel', () => {
    it('should remove channel from monitoring', () => {
      const channelInfo = createMockChannelInfo()
      const remotePubkey = createMockRemotePubkey()

      watchtower.addChannel(channelInfo.channelId, channelInfo, remotePubkey)
      expect(watchtower.isChannelMonitored(channelInfo.channelId)).toBe(true)

      watchtower.removeChannel(channelInfo.channelId)
      expect(watchtower.isChannelMonitored(channelInfo.channelId)).toBe(false)
      expect(watchtower.getStats().monitoredChannels).toBe(0)
    })

    it('should not fail when removing non-existent channel', () => {
      expect(() => watchtower.removeChannel('non_existent')).not.toThrow()
    })
  })

  describe('getChannelInfo', () => {
    it('should return channel info for monitored channel', () => {
      const channelInfo = createMockChannelInfo()
      const remotePubkey = createMockRemotePubkey()

      watchtower.addChannel(channelInfo.channelId, channelInfo, remotePubkey)

      const info = watchtower.getChannelInfo(channelInfo.channelId)
      expect(info).toBeDefined()
      expect(info?.channelId).toBe(channelInfo.channelId)
      expect(info?.localBalance).toBe(channelInfo.localBalance)
      expect(info?.remoteBalance).toBe(channelInfo.remoteBalance)
    })

    it('should return undefined for non-monitored channel', () => {
      const info = watchtower.getChannelInfo('non_existent')
      expect(info).toBeUndefined()
    })
  })

  describe('updateChannelState', () => {
    it('should update channel commitment state', () => {
      const channelInfo = createMockChannelInfo()
      const remotePubkey = createMockRemotePubkey()
      const commitmentTx = new Uint8Array(100)
      const commitmentNumber = 5n

      watchtower.addChannel(channelInfo.channelId, channelInfo, remotePubkey)
      watchtower.updateChannelState(channelInfo.channelId, commitmentTx, commitmentNumber)

      const info = watchtower.getChannelInfo(channelInfo.channelId)
      expect(info?.commitmentNumber).toBe(commitmentNumber)
      expect(info?.lastCommitmentTx).toEqual(commitmentTx)
    })

    it('should warn when updating non-existent channel', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation()
      watchtower.updateChannelState('non_existent', new Uint8Array(10), 1n)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Channel non_existent not found'),
      )
      warnSpy.mockRestore()
    })
  })

  describe('storeRevocationSecret', () => {
    it('should store revocation secret', () => {
      const channelInfo = createMockChannelInfo()
      const remotePubkey = createMockRemotePubkey()
      const secret = createMockRevocationSecret()
      const commitmentNumber = 1n

      watchtower.addChannel(channelInfo.channelId, channelInfo, remotePubkey)
      watchtower.storeRevocationSecret(channelInfo.channelId, commitmentNumber, secret)

      expect(watchtower.getStats().totalSecretsStored).toBe(1)
    })

    it('should store multiple secrets', () => {
      const channelInfo = createMockChannelInfo()
      const remotePubkey = createMockRemotePubkey()

      watchtower.addChannel(channelInfo.channelId, channelInfo, remotePubkey)

      for (let i = 1n; i <= 10n; i++) {
        const secret = new Uint8Array(32)
        secret[0] = Number(i)
        watchtower.storeRevocationSecret(channelInfo.channelId, i, secret)
      }

      expect(watchtower.getStats().totalSecretsStored).toBe(10)
    })

    it('should limit stored secrets to max configured', () => {
      const wt = createWatchtower({ maxStoredSecrets: 3 })
      const channelInfo = createMockChannelInfo()
      const remotePubkey = createMockRemotePubkey()

      wt.addChannel(channelInfo.channelId, channelInfo, remotePubkey)

      // Adicionar 5 secrets (limite é 3)
      for (let i = 1n; i <= 5n; i++) {
        const secret = new Uint8Array(32)
        secret[0] = Number(i)
        wt.storeRevocationSecret(channelInfo.channelId, i, secret)
      }

      // Deve manter apenas 3
      expect(wt.getStats().totalSecretsStored).toBe(3)
    })
  })

  describe('checkForBreach', () => {
    it('should return no breach for non-monitored channel', () => {
      const result = watchtower.checkForBreach('non_existent', 'abcd1234')
      expect(result.breach).toBe(false)
      expect(result.reason).toBe('Channel not monitored')
    })

    it('should return no breach when no revocation secret exists', () => {
      const channelInfo = createMockChannelInfo()
      const remotePubkey = createMockRemotePubkey()

      watchtower.addChannel(channelInfo.channelId, channelInfo, remotePubkey)

      const result = watchtower.checkForBreach(channelInfo.channelId, 'normal_tx')
      expect(result.breach).toBe(false)
    })

    it('should detect breach when old commitment is broadcast', () => {
      const channelInfo = createMockChannelInfo()
      const remotePubkey = createMockRemotePubkey()
      const secret = createMockRevocationSecret()

      watchtower.addChannel(channelInfo.channelId, channelInfo, remotePubkey)
      watchtower.storeRevocationSecret(channelInfo.channelId, 1n, secret)

      // "breach" in txHex triggers breach detection in test mode
      const result = watchtower.checkForBreach(channelInfo.channelId, 'breach_tx_001')

      expect(result.breach).toBe(true)
      expect(result.reason).toBe('Old commitment transaction broadcast')
      expect(result.penaltyTx).toBeDefined()
      expect(result.commitmentNumber).toBe(1n)
      expect(watchtower.getStats().breachesDetected).toBe(1)
    })

    it('should update channel status on breach', () => {
      const channelInfo = createMockChannelInfo()
      const remotePubkey = createMockRemotePubkey()
      const secret = createMockRevocationSecret()

      watchtower.addChannel(channelInfo.channelId, channelInfo, remotePubkey)
      watchtower.storeRevocationSecret(channelInfo.channelId, 1n, secret)

      watchtower.checkForBreach(channelInfo.channelId, 'breach_tx')

      const info = watchtower.getChannelInfo(channelInfo.channelId)
      expect(info?.breachDetected).toBe(true)
      expect(info?.status).toBe(ChannelMonitorStatus.BREACH_DETECTED)
    })
  })

  describe('getStats', () => {
    it('should return accurate statistics', () => {
      const remotePubkey = createMockRemotePubkey()

      // Adicionar canais
      watchtower.addChannel(
        'channel_1',
        createMockChannelInfo({ channelId: 'channel_1' }),
        remotePubkey,
      )
      watchtower.addChannel(
        'channel_2',
        createMockChannelInfo({ channelId: 'channel_2' }),
        remotePubkey,
      )

      // Adicionar secrets
      watchtower.storeRevocationSecret('channel_1', 1n, createMockRevocationSecret())
      watchtower.storeRevocationSecret('channel_1', 2n, createMockRevocationSecret())

      const stats = watchtower.getStats()
      expect(stats.monitoredChannels).toBe(2)
      expect(stats.totalSecretsStored).toBe(2)
      expect(stats.breachesDetected).toBe(0)
    })
  })

  describe('getMonitoredChannels', () => {
    it('should return list of channel IDs', () => {
      const remotePubkey = createMockRemotePubkey()

      watchtower.addChannel(
        'channel_a',
        createMockChannelInfo({ channelId: 'channel_a' }),
        remotePubkey,
      )
      watchtower.addChannel(
        'channel_b',
        createMockChannelInfo({ channelId: 'channel_b' }),
        remotePubkey,
      )

      const channels = watchtower.getMonitoredChannels()
      expect(channels).toContain('channel_a')
      expect(channels).toContain('channel_b')
    })
  })

  describe('events', () => {
    it('should emit channel_added event', () => {
      const events: any[] = []
      watchtower.addEventListener(event => events.push(event))

      watchtower.addChannel(
        'test_channel',
        createMockChannelInfo({ channelId: 'test_channel' }),
        createMockRemotePubkey(),
      )

      const addedEvent = events.find(e => e.type === 'channel_added')
      expect(addedEvent).toBeDefined()
      expect(addedEvent.channelId).toBe('test_channel')
    })

    it('should emit channel_removed event', () => {
      const events: any[] = []
      watchtower.addEventListener(event => events.push(event))

      watchtower.addChannel(
        'test_channel',
        createMockChannelInfo({ channelId: 'test_channel' }),
        createMockRemotePubkey(),
      )
      watchtower.removeChannel('test_channel')

      const removedEvent = events.find(e => e.type === 'channel_removed')
      expect(removedEvent).toBeDefined()
      expect(removedEvent.channelId).toBe('test_channel')
    })

    it('should emit breach_detected event', () => {
      const events: any[] = []
      watchtower.addEventListener(event => events.push(event))

      watchtower.addChannel(
        'test_channel',
        createMockChannelInfo({ channelId: 'test_channel' }),
        createMockRemotePubkey(),
      )
      watchtower.storeRevocationSecret('test_channel', 1n, createMockRevocationSecret())
      watchtower.checkForBreach('test_channel', 'breach_tx')

      const breachEvent = events.find(e => e.type === 'breach_detected')
      expect(breachEvent).toBeDefined()
      expect(breachEvent.channelId).toBe('test_channel')
    })

    it('should unsubscribe from events', () => {
      const events: any[] = []
      const unsubscribe = watchtower.addEventListener(event => events.push(event))

      watchtower.addChannel(
        'channel_1',
        createMockChannelInfo({ channelId: 'channel_1' }),
        createMockRemotePubkey(),
      )

      unsubscribe()

      watchtower.addChannel(
        'channel_2',
        createMockChannelInfo({ channelId: 'channel_2' }),
        createMockRemotePubkey(),
      )

      // Só deve ter evento do channel_1
      expect(events.filter(e => e.type === 'channel_added')).toHaveLength(1)
    })

    it('should get event history', () => {
      watchtower.addChannel(
        'test_channel',
        createMockChannelInfo({ channelId: 'test_channel' }),
        createMockRemotePubkey(),
      )
      watchtower.removeChannel('test_channel')

      const events = watchtower.getEvents()
      expect(events.length).toBeGreaterThanOrEqual(2)
    })

    it('should clear events', () => {
      watchtower.addChannel(
        'test_channel',
        createMockChannelInfo({ channelId: 'test_channel' }),
        createMockRemotePubkey(),
      )

      expect(watchtower.getEvents().length).toBeGreaterThan(0)
      watchtower.clearEvents()
      expect(watchtower.getEvents()).toHaveLength(0)
    })
  })
})

// ==========================================
// REVOCATION KEY DERIVATION TESTS
// ==========================================

describe('Revocation Key Derivation', () => {
  describe('deriveRevocationPubkey', () => {
    it('should derive revocation pubkey from basepoint and per-commitment point', () => {
      const revocationBasepoint = new Uint8Array(33)
      revocationBasepoint[0] = 0x02
      for (let i = 1; i < 33; i++) revocationBasepoint[i] = i

      const perCommitmentPoint = new Uint8Array(33)
      perCommitmentPoint[0] = 0x03
      for (let i = 1; i < 33; i++) perCommitmentPoint[i] = 255 - i

      const revocationPubkey = deriveRevocationPubkey(revocationBasepoint, perCommitmentPoint)

      expect(revocationPubkey).toBeInstanceOf(Uint8Array)
      expect(revocationPubkey.length).toBe(32) // SHA256 output
    })

    it('should produce different outputs for different inputs', () => {
      const basepoint1 = new Uint8Array(33).fill(1)
      const basepoint2 = new Uint8Array(33).fill(2)
      const point = new Uint8Array(33).fill(3)

      const key1 = deriveRevocationPubkey(basepoint1, point)
      const key2 = deriveRevocationPubkey(basepoint2, point)

      expect(key1).not.toEqual(key2)
    })
  })

  describe('deriveRevocationPrivkey', () => {
    it('should derive revocation privkey from secrets', () => {
      const basepointSecret = new Uint8Array(32)
      for (let i = 0; i < 32; i++) basepointSecret[i] = i

      const perCommitmentSecret = new Uint8Array(32)
      for (let i = 0; i < 32; i++) perCommitmentSecret[i] = 255 - i

      const revocationPrivkey = deriveRevocationPrivkey(basepointSecret, perCommitmentSecret)

      expect(revocationPrivkey).toBeInstanceOf(Uint8Array)
      expect(revocationPrivkey.length).toBe(32) // Private key
    })
  })
})

// ==========================================
// INTEGRATION TESTS
// ==========================================

describe('Watchtower Integration', () => {
  let watchtower: Watchtower

  beforeEach(() => {
    watchtower = createWatchtower({
      checkIntervalMs: 100, // Intervalo curto para testes
    })
  })

  afterEach(() => {
    watchtower.stop()
  })

  it('should handle full channel lifecycle', () => {
    const channelInfo = createMockChannelInfo()
    const remotePubkey = createMockRemotePubkey()

    // 1. Adicionar canal
    watchtower.addChannel(channelInfo.channelId, channelInfo, remotePubkey)
    expect(watchtower.isChannelMonitored(channelInfo.channelId)).toBe(true)

    // 2. Atualizar estado
    for (let i = 1n; i <= 5n; i++) {
      const commitmentTx = new Uint8Array(100)
      commitmentTx[0] = Number(i)
      watchtower.updateChannelState(channelInfo.channelId, commitmentTx, i)

      // Armazenar secret do commitment anterior
      if (i > 1n) {
        const secret = new Uint8Array(32)
        secret[0] = Number(i - 1n)
        watchtower.storeRevocationSecret(channelInfo.channelId, i - 1n, secret)
      }
    }

    const info = watchtower.getChannelInfo(channelInfo.channelId)
    expect(info?.commitmentNumber).toBe(5n)
    expect(watchtower.getStats().totalSecretsStored).toBe(4) // commitments 1-4

    // 3. Remover canal
    watchtower.removeChannel(channelInfo.channelId)
    expect(watchtower.isChannelMonitored(channelInfo.channelId)).toBe(false)
    expect(watchtower.getStats().totalSecretsStored).toBe(0)
  })

  it('should call onBreachDetected callback', () => {
    const onBreachDetected = jest.fn()
    const wt = createWatchtower({ onBreachDetected })

    const channelInfo = createMockChannelInfo()
    wt.addChannel(channelInfo.channelId, channelInfo, createMockRemotePubkey())
    wt.storeRevocationSecret(channelInfo.channelId, 1n, createMockRevocationSecret())

    wt.checkForBreach(channelInfo.channelId, 'breach_tx')

    expect(onBreachDetected).toHaveBeenCalledWith(
      channelInfo.channelId,
      expect.objectContaining({
        breach: true,
        commitmentNumber: 1n,
      }),
    )
  })

  it('should handle concurrent operations', () => {
    const remotePubkey = createMockRemotePubkey()

    // Adicionar múltiplos canais simultaneamente
    const channelIds = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5']
    for (const id of channelIds) {
      watchtower.addChannel(id, createMockChannelInfo({ channelId: id }), remotePubkey)
    }

    expect(watchtower.getStats().monitoredChannels).toBe(5)

    // Armazenar secrets em todos
    for (const id of channelIds) {
      watchtower.storeRevocationSecret(id, 1n, createMockRevocationSecret())
    }

    expect(watchtower.getStats().totalSecretsStored).toBe(5)

    // Remover alguns
    watchtower.removeChannel('ch2')
    watchtower.removeChannel('ch4')

    expect(watchtower.getStats().monitoredChannels).toBe(3)
    expect(watchtower.getStats().totalSecretsStored).toBe(3)
  })
})
