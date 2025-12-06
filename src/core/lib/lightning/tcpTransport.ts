/**
 * BOLT #8: Native TCP Transport for Lightning Network
 *
 * Implementa transporte TCP nativo usando react-native-tcp-socket
 * com protocolo Noise_XK para handshake criptografado.
 *
 * Referência: https://github.com/lightning/bolts/blob/master/08-transport.md
 */

import TcpSocket from 'react-native-tcp-socket'
import { EventEmitter } from 'events'
import {
  generateKey,
  initializeHandshakeState,
  actOneSend,
  actTwoReceive,
  actThreeSend,
  encryptMessage,
  decryptMessage,
} from './transport'
import type { KeyPair, TransportKeys, HandshakeState } from '@/core/models/lightning/transport'
import { ACT_TWO_SIZE } from '@/core/models/lightning/transport'
import { uint8ArrayToHex, hexToUint8Array } from '../utils'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Timeout para handshake em ms */
const HANDSHAKE_TIMEOUT_MS = 30000

/** Timeout para conexão em ms */
const CONNECTION_TIMEOUT_MS = 10000

/** Tamanho máximo do buffer de recepção */
const MAX_RECEIVE_BUFFER = 65535 + 2 + 16 // max message + length + tag

/** Intervalo de ping em ms */
const PING_INTERVAL_MS = 30000

/** Porta padrão Lightning */
const DEFAULT_LIGHTNING_PORT = 9735

// ============================================================================
// TYPES
// ============================================================================

/**
 * Estado da conexão TCP
 */
export enum TcpConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  HANDSHAKING = 'HANDSHAKING',
  CONNECTED = 'CONNECTED',
  DISCONNECTING = 'DISCONNECTING',
  ERROR = 'ERROR',
}

/**
 * Fase do handshake
 */
export enum HandshakePhase {
  NONE = 'NONE',
  ACT_ONE_SENT = 'ACT_ONE_SENT',
  ACT_ONE_RECEIVED = 'ACT_ONE_RECEIVED',
  ACT_TWO_SENT = 'ACT_TWO_SENT',
  ACT_TWO_RECEIVED = 'ACT_TWO_RECEIVED',
  ACT_THREE_SENT = 'ACT_THREE_SENT',
  COMPLETE = 'COMPLETE',
}

/**
 * Evento de transporte TCP
 */
export type TcpTransportEvent =
  | { type: 'connecting'; host: string; port: number }
  | { type: 'connected'; remoteNodeId: string }
  | { type: 'disconnected'; reason?: string }
  | { type: 'message'; data: Uint8Array }
  | { type: 'error'; error: Error }
  | { type: 'handshakeComplete'; remoteNodeId: string }

/**
 * Configuração do transporte TCP
 */
export interface TcpTransportConfig {
  /** Keypair local (nodeId) */
  localKeyPair: KeyPair
  /** Timeout de conexão em ms */
  connectionTimeout?: number
  /** Timeout de handshake em ms */
  handshakeTimeout?: number
  /** Intervalo de ping em ms */
  pingInterval?: number
  /** Auto-reconectar em caso de desconexão */
  autoReconnect?: boolean
  /** Delay máximo de reconexão em ms */
  maxReconnectDelay?: number
}

/**
 * Estado interno da conexão
 */
interface ConnectionState {
  state: TcpConnectionState
  handshakePhase: HandshakePhase
  handshakeState: HandshakeState | null
  transportKeys: TransportKeys | null
  remoteNodeId: Uint8Array | null
  receiveBuffer: Uint8Array
  receiveBufferOffset: number
  lastPingSent: number
  lastPongReceived: number
  reconnectAttempts: number
}

/**
 * Listener de eventos
 */
export type TcpEventListener = (event: TcpTransportEvent) => void

// ============================================================================
// TCP TRANSPORT CLASS
// ============================================================================

/**
 * Transporte TCP nativo para Lightning Network
 *
 * Implementa:
 * - Conexão TCP direta a nodes Lightning
 * - Handshake Noise_XK (BOLT #8)
 * - Encriptação/Decriptação de mensagens
 * - Key rotation automático
 * - Ping/Pong keepalive
 * - Reconexão automática
 */
export class TcpTransport extends EventEmitter {
  private socket: ReturnType<typeof TcpSocket.createConnection> | null = null
  private config: Required<TcpTransportConfig>
  private connectionState: ConnectionState
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private host: string = ''
  private port: number = DEFAULT_LIGHTNING_PORT
  private remoteStaticKey: Uint8Array | null = null

  constructor(config: TcpTransportConfig) {
    super()

    this.config = {
      localKeyPair: config.localKeyPair,
      connectionTimeout: config.connectionTimeout ?? CONNECTION_TIMEOUT_MS,
      handshakeTimeout: config.handshakeTimeout ?? HANDSHAKE_TIMEOUT_MS,
      pingInterval: config.pingInterval ?? PING_INTERVAL_MS,
      autoReconnect: config.autoReconnect ?? false,
      maxReconnectDelay: config.maxReconnectDelay ?? 60000,
    }

    this.connectionState = this.createInitialState()
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Conecta a um node Lightning
   *
   * @param nodeId - Node ID em hex (33 bytes compressed pubkey)
   * @param host - Endereço IP ou hostname
   * @param port - Porta (default: 9735)
   */
  async connect(
    nodeId: string,
    host: string,
    port: number = DEFAULT_LIGHTNING_PORT,
  ): Promise<void> {
    if (this.connectionState.state !== TcpConnectionState.DISCONNECTED) {
      throw new Error(`Cannot connect: current state is ${this.connectionState.state}`)
    }

    this.host = host
    this.port = port
    this.remoteStaticKey = hexToUint8Array(nodeId)

    if (this.remoteStaticKey.length !== 33) {
      throw new Error('Invalid node ID: must be 33 bytes compressed public key')
    }

    this.updateState({ state: TcpConnectionState.CONNECTING })
    this.emitEvent({ type: 'connecting', host, port })

    return new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        this.cleanup()
        const error = new Error('Connection timeout')
        this.updateState({ state: TcpConnectionState.ERROR })
        this.emitEvent({ type: 'error', error })
        reject(error)
      }, this.config.connectionTimeout)

      try {
        this.socket = TcpSocket.createConnection(
          {
            host,
            port,
          },
          () => {
            clearTimeout(connectionTimeout)
            this.onSocketConnect()
              .then(resolve)
              .catch(err => {
                this.cleanup()
                reject(err)
              })
          },
        )

        this.setupSocketListeners()
      } catch (error) {
        clearTimeout(connectionTimeout)
        this.cleanup()
        const err = error instanceof Error ? error : new Error('Connection failed')
        this.updateState({ state: TcpConnectionState.ERROR })
        this.emitEvent({ type: 'error', error: err })
        reject(err)
      }
    })
  }

  /**
   * Desconecta do node
   */
  async disconnect(): Promise<void> {
    if (this.connectionState.state === TcpConnectionState.DISCONNECTED) {
      return
    }

    this.updateState({ state: TcpConnectionState.DISCONNECTING })
    this.cleanup()
    this.updateState(this.createInitialState())
    this.emitEvent({ type: 'disconnected', reason: 'User requested disconnect' })
  }

  /**
   * Envia uma mensagem Lightning encriptada
   */
  sendMessage(message: Uint8Array): void {
    if (this.connectionState.state !== TcpConnectionState.CONNECTED) {
      throw new Error('Not connected')
    }

    if (!this.connectionState.transportKeys) {
      throw new Error('Transport keys not established')
    }

    const { encrypted, newKeys } = encryptMessage(this.connectionState.transportKeys, message)
    this.updateState({ transportKeys: newKeys })

    this.socketWrite(encrypted)
  }

  /**
   * Retorna o estado atual da conexão
   */
  getState(): TcpConnectionState {
    return this.connectionState.state
  }

  /**
   * Retorna se está conectado
   */
  isConnected(): boolean {
    return this.connectionState.state === TcpConnectionState.CONNECTED
  }

  /**
   * Retorna o node ID remoto
   */
  getRemoteNodeId(): string | null {
    return this.connectionState.remoteNodeId
      ? uint8ArrayToHex(this.connectionState.remoteNodeId)
      : null
  }

  /**
   * Adiciona listener de eventos
   */
  addListener(event: 'transport', listener: TcpEventListener): this {
    return super.addListener(event, listener)
  }

  // ============================================================================
  // SOCKET HANDLERS
  // ============================================================================

  private setupSocketListeners(): void {
    if (!this.socket) return

    this.socket.on('data', (data: Buffer | string) => {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
      this.onSocketData(bytes)
    })

    this.socket.on('error', (error: Error) => {
      this.onSocketError(error)
    })

    this.socket.on('close', (hadError: boolean) => {
      this.onSocketClose(hadError)
    })

    this.socket.on('timeout', () => {
      this.onSocketTimeout()
    })
  }

  private async onSocketConnect(): Promise<void> {
    console.log('[TcpTransport] Socket connected, starting handshake')

    this.updateState({
      state: TcpConnectionState.HANDSHAKING,
      handshakePhase: HandshakePhase.NONE,
    })

    // Iniciar handshake como initiator
    await this.initiateHandshake()
  }

  private onSocketData(data: Uint8Array): void {
    // Adicionar ao buffer de recepção
    this.appendToReceiveBuffer(data)

    // Processar dados baseado no estado
    if (this.connectionState.state === TcpConnectionState.HANDSHAKING) {
      this.processHandshakeData()
    } else if (this.connectionState.state === TcpConnectionState.CONNECTED) {
      this.processEncryptedMessages()
    }
  }

  private onSocketError(error: Error): void {
    console.error('[TcpTransport] Socket error:', error.message)
    this.updateState({ state: TcpConnectionState.ERROR })
    this.emitEvent({ type: 'error', error })
    this.cleanup()
    this.scheduleReconnect()
  }

  private onSocketClose(hadError: boolean): void {
    console.log('[TcpTransport] Socket closed, hadError:', hadError)

    if (this.connectionState.state !== TcpConnectionState.DISCONNECTING) {
      this.emitEvent({ type: 'disconnected', reason: hadError ? 'Error' : 'Remote closed' })
    }

    this.cleanup()
    this.updateState(this.createInitialState())
    this.scheduleReconnect()
  }

  private onSocketTimeout(): void {
    console.log('[TcpTransport] Socket timeout')
    this.emitEvent({ type: 'error', error: new Error('Socket timeout') })
    this.socket?.destroy()
  }

  // ============================================================================
  // HANDSHAKE (BOLT #8)
  // ============================================================================

  private async initiateHandshake(): Promise<void> {
    if (!this.remoteStaticKey) {
      throw new Error('Remote static key not set')
    }

    // Inicializar estado do handshake
    const handshakeState = initializeHandshakeState(this.remoteStaticKey, this.config.localKeyPair)
    this.updateState({ handshakeState })

    // Act One: Initiator -> Responder
    const ephemeralKey = generateKey()
    const actOneResult = actOneSend(handshakeState, this.remoteStaticKey, ephemeralKey)

    this.updateState({
      handshakeState: { ...actOneResult.newState, e: ephemeralKey },
      handshakePhase: HandshakePhase.ACT_ONE_SENT,
    })

    console.log('[TcpTransport] Sending Act One')
    this.socketWrite(actOneResult.message)
  }

  private processHandshakeData(): void {
    const { handshakePhase, receiveBufferOffset } = this.connectionState

    switch (handshakePhase) {
      case HandshakePhase.ACT_ONE_SENT:
        // Esperando Act Two
        if (receiveBufferOffset >= ACT_TWO_SIZE) {
          this.processActTwo()
        }
        break

      case HandshakePhase.ACT_TWO_RECEIVED:
        // Não esperamos dados após enviar Act Three como initiator
        break

      default:
        console.warn('[TcpTransport] Unexpected handshake data in phase:', handshakePhase)
    }
  }

  private processActTwo(): void {
    const actTwoData = this.consumeFromBuffer(ACT_TWO_SIZE)
    if (!actTwoData) return

    console.log('[TcpTransport] Processing Act Two')

    const handshakeState = this.connectionState.handshakeState
    const ephemeralKey = handshakeState?.e

    if (!handshakeState || !ephemeralKey) {
      this.failHandshake('Invalid handshake state for Act Two')
      return
    }

    const result = actTwoReceive(handshakeState, actTwoData, ephemeralKey)

    if ('error' in result) {
      this.failHandshake(`Act Two failed: ${result.error}`)
      return
    }

    this.updateState({
      handshakeState: result.newState,
      handshakePhase: HandshakePhase.ACT_TWO_RECEIVED,
    })

    // Extrair remote ephemeral key do Act Two
    const remoteEphemeral = actTwoData.subarray(1, 34)

    // Act Three: Initiator -> Responder
    this.sendActThree(result.newState, remoteEphemeral)
  }

  private sendActThree(handshakeState: HandshakeState, remoteEphemeral: Uint8Array): void {
    console.log('[TcpTransport] Sending Act Three')

    const actThreeResult = actThreeSend(handshakeState, this.config.localKeyPair, remoteEphemeral)

    this.socketWrite(actThreeResult.message)

    // Handshake completo
    this.updateState({
      handshakePhase: HandshakePhase.COMPLETE,
      transportKeys: actThreeResult.keys,
      state: TcpConnectionState.CONNECTED,
      remoteNodeId: this.remoteStaticKey,
    })

    console.log('[TcpTransport] Handshake complete')

    const remoteNodeId = this.remoteStaticKey ? uint8ArrayToHex(this.remoteStaticKey) : ''
    this.emitEvent({ type: 'handshakeComplete', remoteNodeId })
    this.emitEvent({ type: 'connected', remoteNodeId })

    // Iniciar ping keepalive
    this.startPingTimer()
  }

  private failHandshake(reason: string): void {
    console.error('[TcpTransport] Handshake failed:', reason)
    this.updateState({ state: TcpConnectionState.ERROR })
    this.emitEvent({ type: 'error', error: new Error(reason) })
    this.cleanup()
  }

  // ============================================================================
  // MESSAGE PROCESSING
  // ============================================================================

  private processEncryptedMessages(): void {
    // Processar mensagens enquanto houver dados suficientes
    while (this.connectionState.receiveBufferOffset >= 18) {
      // Mínimo: 2 (length) + 16 (tag)
      const result = this.tryDecryptMessage()

      if (!result) {
        break // Dados insuficientes
      }

      if ('error' in result) {
        console.error('[TcpTransport] Decrypt error:', result.error)
        this.emitEvent({ type: 'error', error: new Error(result.error) })
        break
      }

      // Emitir mensagem decriptada
      this.emitEvent({ type: 'message', data: result.message })
    }
  }

  private tryDecryptMessage():
    | { message: Uint8Array; newKeys: TransportKeys }
    | { error: string }
    | null {
    if (!this.connectionState.transportKeys) {
      return { error: 'No transport keys' }
    }

    const buffer = this.connectionState.receiveBuffer.subarray(
      0,
      this.connectionState.receiveBufferOffset,
    )

    // Tentar decriptar
    const result = decryptMessage(this.connectionState.transportKeys, buffer)

    if ('error' in result) {
      // Verificar se é erro de dados insuficientes
      if (result.error.includes('too short') || result.error.includes('incomplete')) {
        return null // Aguardar mais dados
      }
      return result
    }

    // Calcular quantos bytes foram consumidos
    // encrypted length (18) + message length + tag (16)
    const view = new DataView(buffer.buffer, buffer.byteOffset)
    const messageLen = view.getUint16(0, false) // big-endian após decriptar length
    const consumed = 18 + messageLen + 16

    // Remover bytes processados do buffer
    this.consumeFromBuffer(consumed)

    // Atualizar transport keys
    this.updateState({ transportKeys: result.newKeys })

    return result
  }

  // ============================================================================
  // PING/PONG KEEPALIVE
  // ============================================================================

  private startPingTimer(): void {
    this.stopPingTimer()

    this.pingTimer = setInterval(() => {
      this.sendPing()
    }, this.config.pingInterval)
  }

  private stopPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private sendPing(): void {
    if (this.connectionState.state !== TcpConnectionState.CONNECTED) {
      return
    }

    // Ping message: type (2) + num_pong_bytes (2) + ignored (byteslen)
    const numPongBytes = 4
    const bytesLen = 4
    const pingMsg = new Uint8Array(2 + 2 + 2 + bytesLen)
    const view = new DataView(pingMsg.buffer)

    view.setUint16(0, 18, false) // ping type
    view.setUint16(2, numPongBytes, false)
    view.setUint16(4, bytesLen, false)
    // bytesLen bytes of ignored data (zeros)

    this.sendMessage(pingMsg)
    this.updateState({ lastPingSent: Date.now() })
  }

  // ============================================================================
  // BUFFER MANAGEMENT
  // ============================================================================

  private appendToReceiveBuffer(data: Uint8Array): void {
    const { receiveBuffer, receiveBufferOffset } = this.connectionState

    // Verificar se precisa expandir o buffer
    if (receiveBufferOffset + data.length > receiveBuffer.length) {
      // Criar novo buffer maior
      const newSize = Math.min(
        MAX_RECEIVE_BUFFER,
        Math.max(receiveBuffer.length * 2, receiveBufferOffset + data.length),
      )
      const newBuffer = new Uint8Array(newSize)
      newBuffer.set(receiveBuffer.subarray(0, receiveBufferOffset))
      this.updateState({ receiveBuffer: newBuffer })
    }

    this.connectionState.receiveBuffer.set(data, receiveBufferOffset)
    this.updateState({ receiveBufferOffset: receiveBufferOffset + data.length })
  }

  private consumeFromBuffer(length: number): Uint8Array | null {
    const { receiveBuffer, receiveBufferOffset } = this.connectionState

    if (receiveBufferOffset < length) {
      return null
    }

    const consumed = receiveBuffer.slice(0, length)

    // Mover dados restantes para o início
    const remaining = receiveBuffer.subarray(length, receiveBufferOffset)
    receiveBuffer.set(remaining, 0)
    this.updateState({ receiveBufferOffset: receiveBufferOffset - length })

    return consumed
  }

  // ============================================================================
  // RECONNECTION
  // ============================================================================

  private scheduleReconnect(): void {
    if (!this.config.autoReconnect || !this.remoteStaticKey) {
      return
    }

    const delay = Math.min(
      1000 * Math.pow(2, this.connectionState.reconnectAttempts),
      this.config.maxReconnectDelay,
    )

    console.log(`[TcpTransport] Scheduling reconnect in ${delay}ms`)

    this.reconnectTimer = setTimeout(() => {
      this.updateState({ reconnectAttempts: this.connectionState.reconnectAttempts + 1 })
      this.connect(uint8ArrayToHex(this.remoteStaticKey!), this.host, this.port).catch(error => {
        console.error('[TcpTransport] Reconnect failed:', error)
      })
    }, delay)
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private socketWrite(data: Uint8Array): void {
    if (!this.socket) {
      throw new Error('Socket not connected')
    }

    // Converter Uint8Array para Buffer para react-native-tcp-socket
    const buffer = Buffer.from(data)
    this.socket.write(buffer)
  }

  private cleanup(): void {
    this.stopPingTimer()

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.destroy()
      this.socket = null
    }
  }

  private createInitialState(): ConnectionState {
    return {
      state: TcpConnectionState.DISCONNECTED,
      handshakePhase: HandshakePhase.NONE,
      handshakeState: null,
      transportKeys: null,
      remoteNodeId: null,
      receiveBuffer: new Uint8Array(4096),
      receiveBufferOffset: 0,
      lastPingSent: 0,
      lastPongReceived: 0,
      reconnectAttempts: 0,
    }
  }

  private updateState(partial: Partial<ConnectionState>): void {
    this.connectionState = { ...this.connectionState, ...partial }
  }

  private emitEvent(event: TcpTransportEvent): void {
    this.emit('transport', event)
  }
}

// ============================================================================
// TCP SERVER (for incoming connections)
// ============================================================================

/**
 * Servidor TCP para aceitar conexões Lightning
 */
export class TcpServer extends EventEmitter {
  private server: ReturnType<typeof TcpSocket.createServer> | null = null
  private config: Required<TcpTransportConfig>
  private connections: Map<string, TcpTransport> = new Map()

  constructor(config: TcpTransportConfig) {
    super()
    this.config = {
      localKeyPair: config.localKeyPair,
      connectionTimeout: config.connectionTimeout ?? CONNECTION_TIMEOUT_MS,
      handshakeTimeout: config.handshakeTimeout ?? HANDSHAKE_TIMEOUT_MS,
      pingInterval: config.pingInterval ?? PING_INTERVAL_MS,
      autoReconnect: false, // Servidor não faz auto-reconnect
      maxReconnectDelay: 0,
    }
  }

  /**
   * Inicia o servidor na porta especificada
   */
  async listen(port: number = DEFAULT_LIGHTNING_PORT, host: string = '0.0.0.0'): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = TcpSocket.createServer(socket => {
          this.handleIncomingConnection(socket)
        })

        this.server.on('error', (error: Error) => {
          console.error('[TcpServer] Server error:', error)
          this.emit('error', error)
        })

        this.server.listen({ port, host }, () => {
          console.log(`[TcpServer] Listening on ${host}:${port}`)
          resolve()
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Para o servidor
   */
  async close(): Promise<void> {
    // Fechar todas as conexões
    for (const transport of this.connections.values()) {
      await transport.disconnect()
    }
    this.connections.clear()

    // Fechar servidor
    if (this.server) {
      this.server.close()
      this.server = null
    }
  }

  /**
   * Retorna lista de conexões ativas
   */
  getConnections(): Map<string, TcpTransport> {
    return new Map(this.connections)
  }

  private handleIncomingConnection(socket: ReturnType<typeof TcpSocket.createConnection>): void {
    console.log('[TcpServer] Incoming connection')

    // Para conexões de entrada, precisamos implementar o responder side do handshake
    // Isso requer criar um TcpTransport em modo responder
    // Por enquanto, apenas logamos - implementação completa requer mais trabalho

    // TODO: Implementar responder handshake
    // 1. Receber Act One
    // 2. Enviar Act Two
    // 3. Receber Act Three
    // 4. Estabelecer conexão encriptada

    socket.on('data', (data: Buffer | string) => {
      console.log('[TcpServer] Received data from incoming connection')
    })

    socket.on('close', () => {
      console.log('[TcpServer] Incoming connection closed')
    })
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Cria um transporte TCP para conectar a um node Lightning
 */
export function createTcpTransport(localKeyPair: KeyPair): TcpTransport {
  return new TcpTransport({ localKeyPair })
}

/**
 * Cria um servidor TCP para aceitar conexões Lightning
 */
export function createTcpServer(localKeyPair: KeyPair): TcpServer {
  return new TcpServer({ localKeyPair })
}

/**
 * Converte um peerId (nodeId@host:port) para parâmetros de conexão
 */
export function parsePeerId(peerId: string): { nodeId: string; host: string; port: number } {
  const [nodeId, hostPort] = peerId.split('@')
  if (!nodeId || !hostPort) {
    throw new Error('Invalid peer ID format. Expected: nodeId@host:port')
  }

  const [host, portStr] = hostPort.split(':')
  const port = parseInt(portStr, 10) || DEFAULT_LIGHTNING_PORT

  return { nodeId, host, port }
}
