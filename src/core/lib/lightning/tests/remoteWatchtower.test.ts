/**
 * Remote Watchtower Tests
 *
 * Testes unitários para o protocolo Remote Watchtower (BOLT #13 proposto)
 * - RemoteWatchtowerClient: Cliente para conectar a watchtowers externos
 * - RemoteWatchtowerManager: Gerenciador de múltiplos watchtowers
 */

import {
  RemoteWatchtowerClient,
  RemoteWatchtowerManager,
  RemoteWatchtowerStatus,
  AppointmentStatus,
  AppointmentType,
  KNOWN_WATCHTOWERS,
  KNOWN_WATCHTOWERS_TESTNET,
  PROTOCOL_VERSION,
  MAX_BLOB_SIZE,
  HINT_SIZE,
  ENCRYPTION_KEY_SIZE,
  CONNECTION_TIMEOUT,
  HEARTBEAT_INTERVAL,
  MAX_RETRIES,
  createRemoteWatchtowerClient,
  createRemoteWatchtowerManager,
  type RemoteWatchtowerClientConfig,
} from '../remoteWatchtower'
import { uint8ArrayToHex } from '@/core/lib/utils/utils'

// ==========================================
// HELPERS
// ==========================================

function createMockPubkey(seed: number = 0x02): Uint8Array {
  const pubkey = new Uint8Array(33)
  pubkey[0] = seed
  for (let i = 1; i < 33; i++) {
    pubkey[i] = (i + seed) % 256
  }
  return pubkey
}

function createMockPrivkey(): Uint8Array {
  const privkey = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    privkey[i] = i + 1
  }
  return privkey
}

function createMockClientConfig(): RemoteWatchtowerClientConfig {
  return {
    localPubkey: createMockPubkey(0x02),
    localPrivkey: createMockPrivkey(),
    connectionTimeout: CONNECTION_TIMEOUT,
    heartbeatInterval: HEARTBEAT_INTERVAL,
    autoReconnect: false,
    maxRetries: MAX_RETRIES,
  }
}

// ==========================================
// CONSTANTS TESTS
// ==========================================

describe('remoteWatchtower constants', () => {
  it('should have correct protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(1)
  })

  it('should have correct max blob size', () => {
    expect(MAX_BLOB_SIZE).toBe(4096)
  })

  it('should have correct hint size', () => {
    expect(HINT_SIZE).toBe(16)
  })

  it('should have correct encryption key size', () => {
    expect(ENCRYPTION_KEY_SIZE).toBe(32)
  })

  it('should have correct timeouts', () => {
    expect(CONNECTION_TIMEOUT).toBe(30000)
    expect(HEARTBEAT_INTERVAL).toBe(60000)
    expect(MAX_RETRIES).toBe(3)
  })
})

// ==========================================
// ENUMS TESTS
// ==========================================

describe('RemoteWatchtowerStatus', () => {
  it('should have all status values', () => {
    expect(RemoteWatchtowerStatus.DISCONNECTED).toBe('disconnected')
    expect(RemoteWatchtowerStatus.CONNECTING).toBe('connecting')
    expect(RemoteWatchtowerStatus.CONNECTED).toBe('connected')
    expect(RemoteWatchtowerStatus.AUTHENTICATED).toBe('authenticated')
    expect(RemoteWatchtowerStatus.ERROR).toBe('error')
  })
})

describe('AppointmentStatus', () => {
  it('should have all status values', () => {
    expect(AppointmentStatus.PENDING).toBe('pending')
    expect(AppointmentStatus.ACCEPTED).toBe('accepted')
    expect(AppointmentStatus.REJECTED).toBe('rejected')
    expect(AppointmentStatus.EXPIRED).toBe('expired')
    expect(AppointmentStatus.TRIGGERED).toBe('triggered')
    expect(AppointmentStatus.RESOLVED).toBe('resolved')
  })
})

describe('AppointmentType', () => {
  it('should have all type values', () => {
    expect(AppointmentType.STANDARD).toBe(0)
    expect(AppointmentType.ANCHOR).toBe(1)
  })
})

// ==========================================
// REMOTE WATCHTOWER CLIENT TESTS
// ==========================================

describe('RemoteWatchtowerClient', () => {
  let client: RemoteWatchtowerClient

  beforeEach(() => {
    client = new RemoteWatchtowerClient(createMockClientConfig())
  })

  afterEach(() => {
    client.disconnect()
  })

  describe('initialization', () => {
    it('should create client with default configuration', () => {
      expect(client).toBeInstanceOf(RemoteWatchtowerClient)
    })

    it('should have no watchtower info initially', () => {
      const info = client.getWatchtowerInfo()
      expect(info).toBeNull()
    })

    it('should not be ready initially', () => {
      expect(client.isReady()).toBe(false)
    })
  })

  describe('connection', () => {
    it('should attempt to connect to watchtower', async () => {
      const address = 'watchtower.test:9911'
      const pubkey = createMockPubkey(0x05)

      const result = await client.connect(address, pubkey)

      // Connection should succeed (mocked)
      expect(result).toBe(true)
    })

    it('should update watchtower info after connection', async () => {
      const address = 'watchtower.test:9911'
      const pubkey = createMockPubkey(0x05)

      await client.connect(address, pubkey)

      const info = client.getWatchtowerInfo()
      expect(info).not.toBeNull()
      expect(info!.address).toBe(address)
      expect(uint8ArrayToHex(info!.pubkey)).toBe(uint8ArrayToHex(pubkey))
    })

    it('should set status to authenticated after successful connection', async () => {
      await client.connect('watchtower.test:9911', createMockPubkey(0x05))

      const info = client.getWatchtowerInfo()
      expect(info?.status).toBe(RemoteWatchtowerStatus.AUTHENTICATED)
    })
  })

  describe('disconnect', () => {
    it('should disconnect from watchtower', async () => {
      await client.connect('watchtower.test:9911', createMockPubkey(0x05))

      client.disconnect()

      const info = client.getWatchtowerInfo()
      expect(info?.status).toBe(RemoteWatchtowerStatus.DISCONNECTED)
    })
  })

  describe('createAppointment', () => {
    beforeEach(async () => {
      await client.connect('watchtower.test:9911', createMockPubkey(0x05))
    })

    it('should create appointment successfully', async () => {
      const response = await client.createAppointment({
        channelId: 'channel-001',
        commitmentTxid: new Uint8Array(32).fill(0xab),
        commitmentNumber: 1n,
        penaltyTx: new Uint8Array(256).fill(0xcd),
        revocationKey: new Uint8Array(32).fill(0xef),
        delayedKey: createMockPubkey(0x03),
        remoteKey: createMockPubkey(0x04),
        toSelfDelay: 144,
      })

      expect(response.success).toBe(true)
      expect(response.appointmentId).toBeDefined()
    })

    it('should fail when not connected', async () => {
      client.disconnect()

      const response = await client.createAppointment({
        channelId: 'channel-001',
        commitmentTxid: new Uint8Array(32).fill(0xab),
        commitmentNumber: 1n,
        penaltyTx: new Uint8Array(256).fill(0xcd),
        revocationKey: new Uint8Array(32).fill(0xef),
        delayedKey: createMockPubkey(0x03),
        remoteKey: createMockPubkey(0x04),
        toSelfDelay: 144,
      })

      expect(response.success).toBe(false)
      expect(response.error).toContain('Not connected')
    })

    it('should fail when blob exceeds max size', async () => {
      // Create a very large penalty tx
      const response = await client.createAppointment({
        channelId: 'channel-001',
        commitmentTxid: new Uint8Array(32).fill(0xab),
        commitmentNumber: 1n,
        penaltyTx: new Uint8Array(MAX_BLOB_SIZE + 1000).fill(0xcd),
        revocationKey: new Uint8Array(32).fill(0xef),
        delayedKey: createMockPubkey(0x03),
        remoteKey: createMockPubkey(0x04),
        toSelfDelay: 144,
      })

      expect(response.success).toBe(false)
      expect(response.error).toContain('exceeds maximum size')
    })
  })

  describe('revokeAppointment', () => {
    it('should revoke existing appointment', async () => {
      await client.connect('watchtower.test:9911', createMockPubkey(0x05))

      const createResponse = await client.createAppointment({
        channelId: 'channel-001',
        commitmentTxid: new Uint8Array(32).fill(0xab),
        commitmentNumber: 1n,
        penaltyTx: new Uint8Array(256).fill(0xcd),
        revocationKey: new Uint8Array(32).fill(0xef),
        delayedKey: createMockPubkey(0x03),
        remoteKey: createMockPubkey(0x04),
        toSelfDelay: 144,
      })

      const result = await client.revokeAppointment(createResponse.appointmentId!)

      expect(result).toBe(true)
    })

    it('should return false for non-existent appointment', async () => {
      await client.connect('watchtower.test:9911', createMockPubkey(0x05))

      const result = await client.revokeAppointment('non-existent-id')

      expect(result).toBe(false)
    })
  })

  describe('getActiveAppointments', () => {
    it('should return empty array initially', async () => {
      await client.connect('watchtower.test:9911', createMockPubkey(0x05))

      const appointments = client.getActiveAppointments()

      expect(appointments).toEqual([])
    })

    it('should return created appointments', async () => {
      await client.connect('watchtower.test:9911', createMockPubkey(0x05))

      await client.createAppointment({
        channelId: 'channel-001',
        commitmentTxid: new Uint8Array(32).fill(0xab),
        commitmentNumber: 1n,
        penaltyTx: new Uint8Array(256).fill(0xcd),
        revocationKey: new Uint8Array(32).fill(0xef),
        delayedKey: createMockPubkey(0x03),
        remoteKey: createMockPubkey(0x04),
        toSelfDelay: 144,
      })

      const appointments = client.getActiveAppointments()

      expect(appointments.length).toBe(1)
      expect(appointments[0].channelId).toBe('channel-001')
    })
  })

  describe('getAppointmentsForChannel', () => {
    it('should filter appointments by channel', async () => {
      await client.connect('watchtower.test:9911', createMockPubkey(0x05))

      await client.createAppointment({
        channelId: 'channel-001',
        commitmentTxid: new Uint8Array(32).fill(0x01),
        commitmentNumber: 1n,
        penaltyTx: new Uint8Array(256).fill(0xcd),
        revocationKey: new Uint8Array(32).fill(0xef),
        delayedKey: createMockPubkey(0x03),
        remoteKey: createMockPubkey(0x04),
        toSelfDelay: 144,
      })

      await client.createAppointment({
        channelId: 'channel-002',
        commitmentTxid: new Uint8Array(32).fill(0x02),
        commitmentNumber: 1n,
        penaltyTx: new Uint8Array(256).fill(0xcd),
        revocationKey: new Uint8Array(32).fill(0xef),
        delayedKey: createMockPubkey(0x03),
        remoteKey: createMockPubkey(0x04),
        toSelfDelay: 144,
      })

      const channel1Appts = client.getAppointmentsForChannel('channel-001')
      const channel2Appts = client.getAppointmentsForChannel('channel-002')

      expect(channel1Appts.length).toBe(1)
      expect(channel2Appts.length).toBe(1)
    })
  })

  describe('eventemitter3', () => {
    it('should emit connected event', async () => {
      const events: unknown[] = []
      client.onEvent(event => events.push(event))

      await client.connect('watchtower.test:9911', createMockPubkey(0x05))

      expect(events.length).toBeGreaterThan(0)
      expect(events.some((e: unknown) => (e as { type: string }).type === 'connected')).toBe(true)
    })

    it('should emit disconnected event', async () => {
      const events: unknown[] = []
      client.onEvent(event => events.push(event))

      await client.connect('watchtower.test:9911', createMockPubkey(0x05))
      client.disconnect()

      expect(events.some((e: unknown) => (e as { type: string }).type === 'disconnected')).toBe(
        true,
      )
    })

    it('should emit appointment_accepted event', async () => {
      const events: unknown[] = []
      client.onEvent(event => events.push(event))

      await client.connect('watchtower.test:9911', createMockPubkey(0x05))
      await client.createAppointment({
        channelId: 'channel-001',
        commitmentTxid: new Uint8Array(32).fill(0xab),
        commitmentNumber: 1n,
        penaltyTx: new Uint8Array(256).fill(0xcd),
        revocationKey: new Uint8Array(32).fill(0xef),
        delayedKey: createMockPubkey(0x03),
        remoteKey: createMockPubkey(0x04),
        toSelfDelay: 144,
      })

      expect(
        events.some((e: unknown) => (e as { type: string }).type === 'appointment_accepted'),
      ).toBe(true)
    })

    it('should remove event callback with offEvent', async () => {
      const events: unknown[] = []
      const callback = (event: unknown) => events.push(event)

      client.onEvent(callback)
      client.offEvent(callback)

      await client.connect('watchtower.test:9911', createMockPubkey(0x05))

      expect(events.length).toBe(0)
    })
  })

  describe('getStats', () => {
    it('should return correct stats when not connected', () => {
      const stats = client.getStats()

      expect(stats.connected).toBe(false)
      expect(stats.authenticated).toBe(false)
      expect(stats.activeAppointments).toBe(0)
      expect(stats.totalAppointments).toBe(0)
    })

    it('should return correct stats when connected', async () => {
      await client.connect('watchtower.test:9911', createMockPubkey(0x05))

      await client.createAppointment({
        channelId: 'channel-001',
        commitmentTxid: new Uint8Array(32).fill(0xab),
        commitmentNumber: 1n,
        penaltyTx: new Uint8Array(256).fill(0xcd),
        revocationKey: new Uint8Array(32).fill(0xef),
        delayedKey: createMockPubkey(0x03),
        remoteKey: createMockPubkey(0x04),
        toSelfDelay: 144,
      })

      const stats = client.getStats()

      expect(stats.connected).toBe(true)
      expect(stats.authenticated).toBe(true)
      expect(stats.activeAppointments).toBe(1)
      expect(stats.totalAppointments).toBe(1)
    })
  })
})

// ==========================================
// REMOTE WATCHTOWER MANAGER TESTS
// ==========================================

describe('RemoteWatchtowerManager', () => {
  let manager: RemoteWatchtowerManager

  beforeEach(() => {
    manager = new RemoteWatchtowerManager(createMockClientConfig())
  })

  afterEach(() => {
    manager.disconnectAll()
  })

  describe('addWatchtower', () => {
    it('should add watchtower successfully', async () => {
      const result = await manager.addWatchtower('watchtower.test:9911', createMockPubkey(0x05))

      expect(result).toBe(true)
    })

    it('should not add duplicate watchtower', async () => {
      const pubkey = createMockPubkey(0x05)

      await manager.addWatchtower('watchtower.test:9911', pubkey)
      const result = await manager.addWatchtower('watchtower.test:9912', pubkey)

      expect(result).toBe(false)
    })
  })

  describe('removeWatchtower', () => {
    it('should remove existing watchtower', async () => {
      const pubkey = createMockPubkey(0x05)
      const id = uint8ArrayToHex(pubkey).slice(0, 16)

      await manager.addWatchtower('watchtower.test:9911', pubkey)
      const result = manager.removeWatchtower(id)

      expect(result).toBe(true)
      expect(manager.getWatchtowers().length).toBe(0)
    })

    it('should return false for non-existent watchtower', () => {
      const result = manager.removeWatchtower('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('getWatchtowers', () => {
    it('should return empty list initially', () => {
      const watchtowers = manager.getWatchtowers()

      expect(watchtowers).toEqual([])
    })

    it('should return added watchtowers', async () => {
      await manager.addWatchtower('wt1.test:9911', createMockPubkey(0x05))
      await manager.addWatchtower('wt2.test:9911', createMockPubkey(0x06))

      const watchtowers = manager.getWatchtowers()

      expect(watchtowers.length).toBe(2)
    })
  })

  describe('getClient', () => {
    it('should return client by ID', async () => {
      const pubkey = createMockPubkey(0x05)
      const id = uint8ArrayToHex(pubkey).slice(0, 16)

      await manager.addWatchtower('watchtower.test:9911', pubkey)
      const client = manager.getClient(id)

      expect(client).toBeInstanceOf(RemoteWatchtowerClient)
    })

    it('should return undefined for non-existent client', () => {
      const client = manager.getClient('non-existent')

      expect(client).toBeUndefined()
    })
  })

  describe('createAppointmentAll', () => {
    it('should create appointments on all watchtowers', async () => {
      await manager.addWatchtower('wt1.test:9911', createMockPubkey(0x05))
      await manager.addWatchtower('wt2.test:9911', createMockPubkey(0x06))

      const results = await manager.createAppointmentAll({
        channelId: 'channel-001',
        commitmentTxid: new Uint8Array(32).fill(0xab),
        commitmentNumber: 1n,
        penaltyTx: new Uint8Array(256).fill(0xcd),
        revocationKey: new Uint8Array(32).fill(0xef),
        delayedKey: createMockPubkey(0x03),
        remoteKey: createMockPubkey(0x04),
        toSelfDelay: 144,
      })

      expect(results.size).toBe(2)
      for (const [, response] of results) {
        expect(response.success).toBe(true)
      }
    })
  })

  describe('disconnectAll', () => {
    it('should disconnect all watchtowers', async () => {
      await manager.addWatchtower('wt1.test:9911', createMockPubkey(0x05))
      await manager.addWatchtower('wt2.test:9911', createMockPubkey(0x06))

      manager.disconnectAll()

      expect(manager.getWatchtowers().length).toBe(0)
    })
  })
})

// ==========================================
// FACTORY FUNCTIONS TESTS
// ==========================================

describe('Factory Functions', () => {
  describe('createRemoteWatchtowerClient', () => {
    it('should create client instance', () => {
      const client = createRemoteWatchtowerClient(createMockClientConfig())

      expect(client).toBeInstanceOf(RemoteWatchtowerClient)
    })
  })

  describe('createRemoteWatchtowerManager', () => {
    it('should create manager instance', () => {
      const manager = createRemoteWatchtowerManager(createMockClientConfig())

      expect(manager).toBeInstanceOf(RemoteWatchtowerManager)
    })
  })
})

// ==========================================
// KNOWN WATCHTOWERS TESTS
// ==========================================

describe('Known Watchtowers', () => {
  describe('KNOWN_WATCHTOWERS', () => {
    it('should have mainnet watchtowers', () => {
      expect(KNOWN_WATCHTOWERS.length).toBeGreaterThan(0)
    })

    it('should have correct structure', () => {
      for (const wt of KNOWN_WATCHTOWERS) {
        expect(wt).toHaveProperty('name')
        expect(wt).toHaveProperty('address')
        expect(wt).toHaveProperty('pubkey')
        expect(typeof wt.name).toBe('string')
        expect(typeof wt.address).toBe('string')
        expect(typeof wt.pubkey).toBe('string')
      }
    })
  })

  describe('KNOWN_WATCHTOWERS_TESTNET', () => {
    it('should have testnet watchtowers', () => {
      expect(KNOWN_WATCHTOWERS_TESTNET.length).toBeGreaterThan(0)
    })

    it('should have correct structure', () => {
      for (const wt of KNOWN_WATCHTOWERS_TESTNET) {
        expect(wt).toHaveProperty('name')
        expect(wt).toHaveProperty('address')
        expect(wt).toHaveProperty('pubkey')
      }
    })
  })
})
