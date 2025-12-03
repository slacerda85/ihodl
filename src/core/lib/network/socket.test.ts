/**
 * @jest-environment node
 */

// Mock completo do react-native-tcp-socket para ambiente de testes
import TcpSocket from 'react-native-tcp-socket'
import {
  createElectrumSocket,
  createLightningSocket,
  isSocketConnected,
  getSocketInfo,
} from './socket'

jest.mock('react-native-tcp-socket', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const EventEmitter = require('events')

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class MockSocket extends EventEmitter {
    destroyed = false
    connecting = false

    setTimeout(timeout: number) {
      setTimeout(() => {
        if (this.connecting) {
          this.emit('timeout')
        }
      }, timeout)
    }

    destroy() {
      this.destroyed = true
      this.emit('close')
    }
  }

  return {
    createConnection: (options: any, callback?: Function) => {
      const socket = new MockSocket()
      socket.connecting = true

      setImmediate(() => {
        // Simula erro de conexão para hosts inválidos
        if (options.host.includes('invalid')) {
          socket.emit('error', new Error('getaddrinfo ENOTFOUND'))
        }
      })

      if (callback) {
        socket.once('connect', callback)
      }

      return socket
    },

    connectTLS: (options: any) => {
      const socket = new MockSocket()
      socket.connecting = true

      setImmediate(() => {
        // Simula erro de conexão para hosts inválidos
        if (options.host.includes('invalid')) {
          socket.emit('error', new Error('getaddrinfo ENOTFOUND'))
        }
      })

      return socket
    },

    Socket: MockSocket,
    TLSSocket: MockSocket,
  }
})

describe('Socket Utilities', () => {
  let sockets: (TcpSocket.Socket | TcpSocket.TLSSocket)[] = []

  afterEach(() => {
    // Cleanup: destroy all sockets created during tests
    sockets.forEach(socket => {
      if (socket && !socket.destroyed) {
        socket.destroy()
      }
    })
    sockets = []
  })

  describe('createElectrumSocket', () => {
    it('should create a TCP socket and reject on timeout', async () => {
      const config = { host: '240.0.0.1', port: 50002 } // Endereço não roteável

      await expect(createElectrumSocket(config, 1000)).rejects.toThrow('TLS connection timeout')
    }, 10000)

    it('should create a TCP socket and reject on connection error', async () => {
      const config = { host: 'invalid-host-that-does-not-exist.local', port: 50002 }

      await expect(createElectrumSocket(config, 5000)).rejects.toThrow()
    }, 10000)
  })

  describe('createLightningSocket', () => {
    it('should create a TLS socket and reject on timeout', async () => {
      const peer = { host: '240.0.0.1', port: 9735, pubkey: 'test' }

      await expect(createLightningSocket(peer, 1000)).rejects.toThrow('TLS connection timeout')
    }, 10000)

    it('should create a TLS socket and reject on connection error', async () => {
      const peer = { host: 'invalid-host-that-does-not-exist.local', port: 9735, pubkey: 'test' }

      await expect(createLightningSocket(peer, 5000)).rejects.toThrow()
    }, 10000)
  })

  describe('isSocketConnected', () => {
    it('should return false for null socket', () => {
      expect(isSocketConnected(null)).toBe(false)
    })

    it('should return false for destroyed socket', () => {
      const socket = TcpSocket.createConnection({ host: '127.0.0.1', port: 9999 }, () => {})
      socket.destroy()
      expect(isSocketConnected(socket)).toBe(false)
    })
  })

  describe('getSocketInfo', () => {
    it('should return socket information', () => {
      const socket = TcpSocket.createConnection({ host: '127.0.0.1', port: 9999 }, () => {})
      sockets.push(socket)

      const info = getSocketInfo(socket)
      expect(info.connected).toBeDefined()
      expect(info.type).toBeDefined()
    })
  })
})
