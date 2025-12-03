// Socket Creation Utility
// Provides socket connection establishment for Lightning (TLS) and Electrum (TCP) clients

import TcpSocket from 'react-native-tcp-socket'
import { Peer } from '@/core/models/network'

export interface SocketConfig {
  host: string
  port: number
  timeout?: number
}

export interface SecureSocketConfig extends SocketConfig {
  ca?: string | Buffer | (string | Buffer)[]
  cert?: string | Buffer
  key?: string | Buffer
  rejectUnauthorized?: boolean
}

/**
 * Creates a TCP socket connection (non-TLS)
 * Used for Electrum protocol which uses plain TCP
 *
 * @param config - Configuration for the TCP connection
 * @returns Promise resolving to a Socket
 */
export function createTCPSocket(config: SocketConfig): Promise<TcpSocket.Socket> {
  const { host, port, timeout = 10000 } = config

  console.log(`[tcp-socket] Connecting to ${host}:${port}`)

  return new Promise((resolve, reject) => {
    // Create TCP connection using react-native-tcp-socket API
    const socket = TcpSocket.createConnection(
      {
        host,
        port,
      },
      () => {},
    )

    // Set timeout manually
    socket.setTimeout(timeout)

    const cleanup = () => {
      socket.removeListener('connect', onConnect)
      socket.removeListener('error', onError)
      socket.removeListener('timeout', onTimeout)
    }

    const onConnect = () => {
      cleanup()
      socket.setTimeout(0) // Disable timeout after successful connection
      console.log(`[tcp-socket] Connected to ${host}:${port}`)
      resolve(socket)
    }

    const onError = (err: Error) => {
      cleanup()
      console.warn(`[tcp-socket] Connection error to ${host}:${port}:`, err.message)
      reject(err)
    }

    const onTimeout = () => {
      cleanup()
      socket.destroy()
      console.warn(`[tcp-socket] Connection timeout to ${host}:${port}`)
      reject(new Error('TCP connection timeout'))
    }

    socket.on('connect', onConnect)
    socket.on('error', onError)
    socket.on('timeout', onTimeout)
  })
}

/**
 * Creates a secure TLS connection
 * Used for Lightning Network connections
 *
 * @param config - Configuration for the TLS connection
 * @returns Promise resolving to a secure TLSSocket
 */
export function createSecureTLSSocket(config: SecureSocketConfig): Promise<TcpSocket.TLSSocket> {
  const { host, port, timeout = 10000, ca, cert, key, rejectUnauthorized } = config

  console.log(`[tls-socket] Connecting to ${host}:${port}`)

  return new Promise((resolve, reject) => {
    // Create secure TLS connection using react-native-tcp-socket API
    const socket = TcpSocket.connectTLS({
      host,
      port,
      // Certificate validation (use in production)
      ...(ca && { ca }),
      ...(cert && key && { cert, key }),
      ...(rejectUnauthorized !== undefined && { rejectUnauthorized }),
    })

    // Set timeout manually since react-native-tcp-socket doesn't support timeout in options
    socket.setTimeout(timeout)

    const cleanup = () => {
      socket.removeListener('connect', onConnect)
      socket.removeListener('error', onError)
      socket.removeListener('timeout', onTimeout)
    }

    const onConnect = () => {
      cleanup()
      socket.setTimeout(0) // Disable timeout after successful connection
      console.log(`[tls-socket] TLS connected to ${host}:${port}`)
      resolve(socket)
    }

    const onError = (err: Error) => {
      cleanup()
      console.warn(`[tls-socket] TLS connection error to ${host}:${port}:`, err.message)
      reject(err)
    }

    const onTimeout = () => {
      cleanup()
      socket.destroy()
      console.warn(`[tls-socket] TLS connection timeout to ${host}:${port}`)
      reject(new Error('TLS connection timeout'))
    }

    socket.on('connect', onConnect)
    socket.on('error', onError)
    socket.on('timeout', onTimeout)
  })
}

/**
 * Creates a TCP socket for Electrum connections
 * Electrum typically uses SSL/TLS on port 50002
 *
 * @param config - Socket configuration with host and port
 * @param timeout - Connection timeout in milliseconds
 * @returns Promise resolving to a TLSSocket
 */
export function createElectrumSocket(
  config: { host: string; port: number },
  timeout: number = 10000,
): Promise<TcpSocket.TLSSocket> {
  console.log('[electrum-socket] Creating Electrum TLS connection')

  return createSecureTLSSocket({
    host: config.host,
    port: config.port,
    timeout,
    rejectUnauthorized: false, // Allow self-signed certificates like the old implementation
  })
}

/**
 * Creates a TCP socket for Lightning Network connections
 * BOLT #8 specifies TCP + Noise_XK handshake for encryption (NOT TLS)
 * The Noise handshake provides end-to-end encryption after connection
 *
 * @param peer - Lightning peer to connect to
 * @param timeout - Connection timeout in milliseconds
 * @returns Promise resolving to a TCP Socket
 */
export function createLightningSocket(
  peer: Peer,
  timeout: number = 10000,
): Promise<TcpSocket.Socket> {
  console.log(`[lightning-socket] Creating Lightning TCP connection to ${peer.host}:${peer.port}`)
  console.log('[lightning-socket] Note: Encryption provided by BOLT #8 Noise handshake, not TLS')

  return createTCPSocket({
    host: peer.host,
    port: peer.port,
    timeout,
  })
}

/**
 * Creates a secure TLS connection for Lightning Network with Tor/proxy
 * Use this only when connecting through Tor hidden services (.onion)
 * or when the node explicitly requires TLS (non-standard)
 *
 * @param peer - Lightning peer to connect to
 * @param ca - Certificate Authority certificate(s)
 * @param cert - Client certificate (optional)
 * @param key - Client private key (optional)
 * @param timeout - Connection timeout in milliseconds
 * @returns Promise resolving to a TLSSocket
 */
export function createLightningSocketWithTLS(
  peer: Peer,
  ca?: string | Buffer | (string | Buffer)[],
  cert?: string | Buffer,
  key?: string | Buffer,
  timeout: number = 10000,
): Promise<TcpSocket.TLSSocket> {
  console.log(`[lightning-socket] Creating Lightning TLS connection to ${peer.host}:${peer.port}`)

  return createSecureTLSSocket({
    host: peer.host,
    port: peer.port,
    timeout,
    ...(ca && { ca }),
    ...(cert && key && { cert, key }),
  })
}

/**
 * Validates if a socket is connected
 * Note: react-native-tcp-socket doesn't provide detailed connection info
 *
 * @param socket - Socket to validate
 * @returns boolean indicating if the socket exists and is not destroyed
 */
export function isSocketConnected(
  socket: TcpSocket.Socket | TcpSocket.TLSSocket | null | undefined,
): boolean {
  return socket !== null && socket !== undefined && !socket.destroyed
}

/**
 * Gets basic information about a socket
 * Note: react-native-tcp-socket provides limited info
 *
 * @param socket - Socket to inspect
 * @returns Object with basic connection details
 */
export function getSocketInfo(socket: TcpSocket.Socket | TcpSocket.TLSSocket): {
  connected: boolean
  type: string
} {
  return {
    connected: !socket.destroyed,
    type: 'TLSSocket' in socket.constructor ? 'TLS' : 'TCP',
  }
}
