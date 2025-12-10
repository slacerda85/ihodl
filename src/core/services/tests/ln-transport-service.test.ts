import { EventEmitter } from 'events'
import { performInitExchange } from '../ln-transport-service'
import {
  createInitMessage,
  encodeInitMessage,
  createFeatureVector,
  FEATURE_BITS,
  createPingMessage,
  encodePingMessage,
  CHAIN_HASHES,
} from '@/core/lib/lightning/bolt1'
import type { TcpTransportEvent } from '@/core/lib/lightning/tcpTransport'

class FakeTcpTransport extends EventEmitter {
  public sent: Uint8Array[] = []

  sendMessage(data: Uint8Array): void {
    this.sent.push(data)
  }

  // Align with TcpTransport API used by performInitExchange
  addListener(event: 'transport', listener: (event: TcpTransportEvent) => void): this {
    return super.addListener(event, listener)
  }

  removeListener(event: 'transport', listener: (event: TcpTransportEvent) => void): this {
    return super.removeListener(event, listener)
  }
}

const defaultFeatures = createFeatureVector([
  FEATURE_BITS.OPTION_DATA_LOSS_PROTECT,
  FEATURE_BITS.VAR_ONION_OPTIN,
  FEATURE_BITS.PAYMENT_SECRET,
  FEATURE_BITS.BASIC_MPP,
])

function buildRemoteInit(): Uint8Array {
  const init = createInitMessage(defaultFeatures, [CHAIN_HASHES.MAINNET])
  return encodeInitMessage(init)
}

describe('performInitExchange', () => {
  test('negotiates features after sending local init', async () => {
    const transport = new FakeTcpTransport()

    const promise = performInitExchange(transport)

    // Should have sent local init immediately
    expect(transport.sent.length).toBe(1)
    const firstMsgType = (transport.sent[0][0] << 8) | transport.sent[0][1]
    expect(firstMsgType).toBe(16) // init

    // Simulate remote init
    const remoteInit = buildRemoteInit()
    transport.emit('transport', { type: 'message', data: remoteInit } as TcpTransportEvent)

    const result = await promise
    expect(result.negotiatedFeatures).toBeInstanceOf(Uint8Array)
    expect(result.negotiatedFeatures.length).toBeGreaterThan(0)
  })

  test('responds to ping with pong before init completes', async () => {
    const transport = new FakeTcpTransport()
    const promise = performInitExchange(transport)

    // Send ping before init
    const pingMsg = encodePingMessage(createPingMessage(2, 2))
    transport.emit('transport', { type: 'message', data: pingMsg } as TcpTransportEvent)

    // Should have sent a pong in response
    const pongSent = transport.sent.find(msg => ((msg[0] << 8) | msg[1]) === 19)
    expect(pongSent).toBeDefined()

    // Finish with init to resolve
    transport.emit('transport', { type: 'message', data: buildRemoteInit() } as TcpTransportEvent)
    await expect(promise).resolves.toBeDefined()
  })
})
