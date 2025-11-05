// Tests for Lightning Channel Management
// Pure functions for channel state management

import {
  createChannel,
  transitionChannel,
  addHtlc,
  settleHtlc,
  cancelHtlc,
  updateBalances,
  createCommitmentTransaction,
  settleHtlcWithPreimage,
  initiateChannelClose,
  createClosingTransaction,
  timeoutHtlc,
  validateChannelState,
  canAcceptHtlc,
  getAvailableBalance,
  getPendingOutgoingAmount,
  getPendingIncomingAmount,
} from '../lib/lightning/channels'

describe('Channel State Management', () => {
  const mockChannel = createChannel(
    'test_channel',
    'peer123',
    '02local_funding_key',
    '02remote_funding_key',
    '03local_payment_key',
    '03remote_payment_key',
  )

  test('createChannel creates valid initial state', () => {
    expect(mockChannel.id).toBe('test_channel')
    expect(mockChannel.peerNodeId).toBe('peer123')
    expect(mockChannel.state).toBe('init')
    expect(mockChannel.localBalance).toBe(0)
    expect(mockChannel.remoteBalance).toBe(0)
    expect(mockChannel.pendingHtlcs).toEqual([])
  })

  test('transitionChannel handles state changes', () => {
    let channel = transitionChannel(mockChannel, 'funding_created', {
      fundingTxId: 'tx123',
      fundingOutputIndex: 0,
    })
    expect(channel.state).toBe('opening')
    expect(channel.fundingTxId).toBe('tx123')

    channel = transitionChannel(channel, 'funding_locked', { channelId: 'chan123' })
    expect(channel.state).toBe('open')
    expect(channel.channelId).toBe('chan123')
  })

  test('addHtlc adds HTLC to pending list', () => {
    const htlc = {
      id: 1,
      amount: 1000,
      paymentHash: 'hash123',
      cltvExpiry: 100000,
      onionRoutingPacket: new Uint8Array(32),
      direction: 'outgoing' as const,
    }

    const channel = addHtlc(mockChannel, htlc)
    expect(channel.pendingHtlcs).toHaveLength(1)
    expect(channel.pendingHtlcs[0].id).toBe(1)
    expect(channel.pendingHtlcs[0].state).toBe('offered')
  })

  test('settleHtlc changes HTLC state to settled', () => {
    const htlc = {
      id: 1,
      amount: 1000,
      paymentHash: 'hash123',
      cltvExpiry: 100000,
      onionRoutingPacket: new Uint8Array(32),
      direction: 'outgoing' as const,
    }

    let channel = addHtlc(mockChannel, htlc)
    channel = settleHtlc(channel, 1)

    expect(channel.pendingHtlcs[0].state).toBe('settled')
  })

  test('cancelHtlc changes HTLC state to cancelled', () => {
    const htlc = {
      id: 1,
      amount: 1000,
      paymentHash: 'hash123',
      cltvExpiry: 100000,
      onionRoutingPacket: new Uint8Array(32),
      direction: 'outgoing' as const,
    }

    let channel = addHtlc(mockChannel, htlc)
    channel = cancelHtlc(channel, 1)

    expect(channel.pendingHtlcs[0].state).toBe('cancelled')
  })

  test('updateBalances updates channel balances', () => {
    const channel = updateBalances(mockChannel, 50000, 50000)
    expect(channel.localBalance).toBe(50000)
    expect(channel.remoteBalance).toBe(50000)
  })
})

describe('Commitment Transactions', () => {
  const fundedChannel = {
    ...createChannel('test', 'peer', '02local', '02remote', '03local', '03remote'),
    state: 'open' as const,
    localBalance: 50000,
    remoteBalance: 50000,
    fundingTxId: 'funding_tx_123',
    fundingOutputIndex: 0,
    localCommitmentNumber: 0,
    remoteCommitmentNumber: 0,
    pendingHtlcs: [],
  }

  test('createCommitmentTransaction creates valid transaction', () => {
    const tx = createCommitmentTransaction(fundedChannel, true, 1000)

    expect(tx.version).toBe(2)
    expect(tx.fee).toBe(1000)
    expect(tx.inputs).toHaveLength(1)
    expect(tx.inputs[0].txid).toBe('funding_tx_123')
    expect(tx.outputs).toHaveLength(3) // local, remote, and fee outputs
  })

  test('createCommitmentTransaction includes HTLCs', () => {
    const channelWithHtlc = {
      ...fundedChannel,
      pendingHtlcs: [
        {
          id: 1,
          amount: 1000,
          paymentHash: 'hash123',
          cltvExpiry: 100000,
          onionRoutingPacket: new Uint8Array(32),
          direction: 'outgoing' as const,
          state: 'offered' as const,
        },
      ],
    }

    const tx = createCommitmentTransaction(channelWithHtlc, true, 1000)
    expect(tx.htlcs).toHaveLength(1)
    expect(tx.outputs.some((o: any) => o.type === 'htlc_remote')).toBe(true)
  })
})

describe('HTLC Settlement', () => {
  const channelWithHtlc = {
    ...createChannel('test', 'peer', '02local', '02remote', '03local', '03remote'),
    state: 'open' as const,
    localBalance: 50000,
    remoteBalance: 50000,
    pendingHtlcs: [
      {
        id: 1,
        amount: 1000,
        paymentHash: 'hash123',
        cltvExpiry: 100000,
        onionRoutingPacket: new Uint8Array(32),
        direction: 'incoming' as const,
        state: 'offered' as const,
      },
    ],
  }

  test('settleHtlcWithPreimage updates balances correctly', () => {
    const preimage = 'preimage12345678901234567890123456789012hash123' // Contains 'hash123'
    const settledChannel = settleHtlcWithPreimage(channelWithHtlc, 1, preimage)

    // Incoming HTLC settlement: local balance increases, remote decreases
    expect(settledChannel.localBalance).toBe(51000)
    expect(settledChannel.remoteBalance).toBe(49000)
    expect(settledChannel.pendingHtlcs[0].state).toBe('settled')
    expect(settledChannel.pendingHtlcs[0].preimage).toBe(preimage)
  })

  test('timeoutHtlc updates balances for timeout', () => {
    const timedOutChannel = timeoutHtlc(channelWithHtlc, 1)

    // Incoming HTLC timeout: remote balance increases (gets money back)
    expect(timedOutChannel.remoteBalance).toBe(51000)
    expect(timedOutChannel.pendingHtlcs[0].state).toBe('cancelled')
  })
})

describe('Channel Closing', () => {
  const openChannel = {
    ...createChannel('test', 'peer', '02local', '02remote', '03local', '03remote'),
    state: 'open' as const,
    localBalance: 50000,
    remoteBalance: 50000,
    fundingTxId: 'funding_tx_123',
    fundingOutputIndex: 0,
  }

  test('initiateChannelClose changes state to closing', () => {
    const closingChannel = initiateChannelClose(openChannel, 'local')
    expect(closingChannel.state).toBe('closing')
    expect(closingChannel.closeInitiator).toBe('local')
  })

  test('createClosingTransaction creates valid closing transaction', () => {
    const closingTx = createClosingTransaction(openChannel, 1000, 1000)

    expect(closingTx.version).toBe(2)
    expect(closingTx.localFee).toBe(1000)
    expect(closingTx.remoteFee).toBe(1000)
    expect(closingTx.outputs).toHaveLength(2) // local and remote outputs
    expect(closingTx.outputs[0].value).toBe(49000) // 50000 - 1000
    expect(closingTx.outputs[1].value).toBe(49000) // 50000 - 1000
  })
})

describe('Channel Validation', () => {
  const validChannel = {
    ...createChannel('test', 'peer', '02local', '02remote', '03local', '03remote'),
    state: 'open' as const,
    localBalance: 50000,
    remoteBalance: 50000,
    pendingHtlcs: [],
  }

  test('validateChannelState returns valid for correct state', () => {
    const validation = validateChannelState(validChannel)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toEqual([])
  })

  test('validateChannelState detects negative balances', () => {
    const invalidChannel = { ...validChannel, localBalance: -1000 }
    const validation = validateChannelState(invalidChannel)
    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('Local balance cannot be negative')
  })

  test('canAcceptHtlc validates HTLC acceptance', () => {
    expect(canAcceptHtlc(validChannel, 1000, 101144)).toBe(true) // Valid CLTV
    expect(canAcceptHtlc(validChannel, 100000, 101144)).toBe(false) // Insufficient balance
    expect(canAcceptHtlc(validChannel, 1000, 100100)).toBe(false) // CLTV too soon
  })
})

describe('Balance Calculations', () => {
  const channelWithHtlcs = {
    ...createChannel('test', 'peer', '02local', '02remote', '03local', '03remote'),
    state: 'open' as const,
    localBalance: 50000,
    remoteBalance: 50000,
    pendingHtlcs: [
      {
        id: 1,
        amount: 1000,
        paymentHash: 'hash1',
        cltvExpiry: 100000,
        onionRoutingPacket: new Uint8Array(32),
        direction: 'outgoing' as const,
        state: 'offered' as const,
      },
      {
        id: 2,
        amount: 2000,
        paymentHash: 'hash2',
        cltvExpiry: 100000,
        onionRoutingPacket: new Uint8Array(32),
        direction: 'incoming' as const,
        state: 'offered' as const,
      },
    ],
  }

  test('getAvailableBalance calculates correct available balance', () => {
    expect(getAvailableBalance(channelWithHtlcs, 'local')).toBe(49000) // 50000 - 1000 outgoing
    expect(getAvailableBalance(channelWithHtlcs, 'remote')).toBe(48000) // 50000 - 2000 incoming
  })

  test('getPendingOutgoingAmount sums outgoing HTLCs', () => {
    expect(getPendingOutgoingAmount(channelWithHtlcs)).toBe(1000)
  })

  test('getPendingIncomingAmount sums incoming HTLCs', () => {
    expect(getPendingIncomingAmount(channelWithHtlcs)).toBe(2000)
  })
})
