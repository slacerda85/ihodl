// Test Lightning Transport Layer
// Basic functionality test for React Native compatibility

import { LNTransport, LNPeerAddr } from './lntransport'
import { uint8ArrayFromHex } from '../utils'

describe('Lightning Transport', () => {
  const testPrivKey = uint8ArrayFromHex(
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  )
  const testPubKey = uint8ArrayFromHex('02' + 'a'.repeat(64))
  const testAddr = new LNPeerAddr('127.0.0.1', 9735, testPubKey)

  test('LNPeerAddr parsing', () => {
    const addrStr =
      '02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@127.0.0.1:9735'
    const addr = LNPeerAddr.fromString(addrStr)
    expect(addr.host).toBe('127.0.0.1')
    expect(addr.port).toBe(9735)
    expect(addr.pubkey).toEqual(testPubKey)
  })

  test('Transport initialization', () => {
    const transport = new LNTransport(testPrivKey, testAddr)
    expect(transport).toBeDefined()
  })

  test('Transport methods exist', () => {
    const transport = new LNTransport(testPrivKey, testAddr)
    expect(typeof transport.handshake).toBe('function')
    expect(typeof transport.send).toBe('function')
    expect(typeof transport.recv).toBe('function')
    expect(typeof transport.close).toBe('function')
  })

  test('Transport close', () => {
    const transport = new LNTransport(testPrivKey, testAddr)
    expect(() => transport.close()).not.toThrow()
  })

  // Note: Real handshake and send/recv tests would require actual TCP connections
  // and are better suited for integration tests or manual testing
})
