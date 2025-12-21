import { WorkerService } from '../ln-worker-service'

describe('WorkerService readiness gates', () => {
  const baseReady = {
    isWalletLoaded: true,
    isElectrumReady: true,
    isTransportConnected: true,
    isPeerConnected: true,
    isChannelReestablished: true,
    isGossipSynced: true,
    isWatcherRunning: true,
  }

  test('canSendPayment fails without wallet', () => {
    const worker = new WorkerService()
    const result = worker.canSendPayment()
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('Wallet not loaded')
  })

  test('canSendPayment requires electrum readiness', () => {
    const worker = new WorkerService()
    worker.updateReadinessState({ ...baseReady, isElectrumReady: false })
    const result = worker.canSendPayment()
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('Electrum not ready')
  })

  test('canSendPayment requires peer and channels', () => {
    const worker = new WorkerService()
    worker.updateReadinessState({
      ...baseReady,
      isWalletLoaded: true,
      isTransportConnected: true,
      isPeerConnected: false,
    })
    const result = worker.canSendPayment()
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('No peer connected')
  })

  test('canSendPayment requires routing (gossip or transport)', () => {
    const worker = new WorkerService()
    worker.updateReadinessState({
      ...baseReady,
      isWalletLoaded: true,
      isTransportConnected: false,
      isPeerConnected: true,
      isChannelReestablished: true,
      isGossipSynced: false,
    })
    const result = worker.canSendPayment()
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('Routing not ready')
  })

  test('canSendPayment passes when all gates satisfied', () => {
    const worker = new WorkerService()
    worker.updateReadinessState({ ...baseReady })
    const result = worker.canSendPayment()
    expect(result.ok).toBe(true)
  })

  test('canReceivePayment requires wallet and electrum', () => {
    const worker = new WorkerService()
    let result = worker.canReceivePayment()
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('Wallet not loaded')

    worker.updateReadinessState({ isWalletLoaded: true })
    result = worker.canReceivePayment()
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('Electrum not ready')
  })

  test('canReceivePayment passes with peer or channels', () => {
    const worker = new WorkerService()
    worker.updateReadinessState({ ...baseReady, isGossipSynced: false })
    let result = worker.canReceivePayment()
    expect(result.ok).toBe(true)

    // Peer disconnected but channels reestablished should still allow receive
    worker.updateReadinessState({ isPeerConnected: false, isChannelReestablished: true })
    result = worker.canReceivePayment()
    expect(result.ok).toBe(true)
  })
})
