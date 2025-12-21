/**
 * Lightning Transport Service
 *
 * Gerencia conexões de transporte para comunicação P2P Lightning.
 * Implementa camada de transporte sobre WebSocket ou TCP.
 */

import {
  encodeInitMessage,
  decodeInitMessage,
  createInitMessage,
  encodePingMessage,
  decodePongMessage,
  createPingMessage,
  encodeErrorMessage,
  createErrorMessage,
  negotiateFeatures,
  createFeatureVector,
  FEATURE_BITS,
} from '../lib/lightning/bolt1'
import type { InitMessage, PongMessage } from '../models/lightning/base'
import { uint8ArrayToHex, hexToUint8Array } from '../lib/utils/utils'
import { TcpTransport, TcpTransportEvent } from '@/core/lib/lightning/transport'

// ==========================================
// TYPES
// ==========================================

/** Status de conexão do transporte */
export type TransportStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

/** Evento de transporte */
export type TransportEvent =
  | { type: 'connected'; peerId: string }
  | { type: 'disconnected'; reason?: string }
  | { type: 'message'; data: Uint8Array }
  | { type: 'error'; error: Error }
  | { type: 'init'; message: InitMessage }
  | { type: 'pong'; message: PongMessage }

export interface InitNegotiationResult {
  remoteInit: InitMessage
  negotiatedFeatures: Uint8Array
}

/** Listener de eventos de transporte */
export type TransportEventListener = (event: TransportEvent) => void

/** Configuração do transporte */
export interface TransportConfig {
  /** Timeout de conexão em ms */
  connectionTimeout: number
  /** Intervalo de ping em ms */
  pingInterval: number
  /** Timeout de pong em ms */
  pongTimeout: number
  /** Features locais suportados */
  localFeatures: number[]
  /** Chain hash (mainnet/testnet) */
  chainHash?: Uint8Array
}

/** Estado interno do transporte */
interface TransportState {
  status: TransportStatus
  peerId: string | null
  socket: WebSocket | null
  negotiatedFeatures: Uint8Array | null
  lastPing: number
  lastPong: number
  pingTimer: ReturnType<typeof setInterval> | null
  error: Error | null
}

// ==========================================
// CONSTANTES
// ==========================================

const DEFAULT_CONFIG: TransportConfig = {
  connectionTimeout: 10000,
  pingInterval: 30000,
  pongTimeout: 5000,
  localFeatures: [
    FEATURE_BITS.OPTION_DATA_LOSS_PROTECT,
    FEATURE_BITS.VAR_ONION_OPTIN,
    FEATURE_BITS.PAYMENT_SECRET,
    FEATURE_BITS.BASIC_MPP,
  ],
}

// Bitcoin mainnet chain hash
const MAINNET_CHAIN_HASH = hexToUint8Array(
  '6fe28c0ab6f1b372c1a6a246ae63f74f931e8365e15a089c68d6190000000000',
)

const INIT_TIMEOUT_MS = 15000

// ==========================================
// TRANSPORT SERVICE
// ==========================================

/**
 * Serviço de transporte Lightning
 *
 * Gerencia conexões WebSocket para comunicação P2P
 */
export class LightningTransport {
  private state: TransportState = {
    status: 'disconnected',
    peerId: null,
    socket: null,
    negotiatedFeatures: null,
    lastPing: 0,
    lastPong: 0,
    pingTimer: null,
    error: null,
  }

  private config: TransportConfig
  private listeners: Set<TransportEventListener> = new Set()

  constructor(config: Partial<TransportConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ==========================================
  // PUBLIC API
  // ==========================================

  /**
   * Conecta a um peer Lightning via WebSocket
   *
   * @internal Este método deve ser usado apenas internamente pelo WorkerService.
   * Não chame diretamente de componentes de UI.
   *
   * @param peerId - ID do peer (nodeId@host:port)
   *
   * @see docs/lightning-worker-consolidation-plan.md - Fase 5.3
   */
  async connect(peerId: string): Promise<void> {
    if (this.state.status === 'connected' || this.state.status === 'connecting') {
      throw new Error('Already connected or connecting')
    }

    // Parse peer ID (formato: nodeId@host:port)
    const [nodeId, hostPort] = peerId.split('@')
    if (!nodeId || !hostPort) {
      throw new Error('Invalid peer ID format. Expected: nodeId@host:port')
    }

    const [host, portStr] = hostPort.split(':')
    const port = parseInt(portStr, 10) || 9735

    this.updateState({ status: 'connecting', peerId })

    try {
      await this.establishConnection(host, port, nodeId)
    } catch (error) {
      this.updateState({
        status: 'error',
        error: error instanceof Error ? error : new Error('Connection failed'),
      })
      throw error
    }
  }

  /**
   * Desconecta do peer atual
   *
   * @internal Este método deve ser usado apenas internamente pelo WorkerService.
   * Não chame diretamente de componentes de UI.
   *
   * @see docs/lightning-worker-consolidation-plan.md - Fase 5.3
   */
  async disconnect(): Promise<void> {
    if (this.state.pingTimer) {
      clearInterval(this.state.pingTimer)
    }

    if (this.state.socket) {
      this.state.socket.close()
    }

    this.updateState({
      status: 'disconnected',
      peerId: null,
      socket: null,
      negotiatedFeatures: null,
      pingTimer: null,
    })

    this.emit({ type: 'disconnected' })
  }

  /**
   * Envia um ping para o peer
   *
   * @internal Este método é gerenciado automaticamente pelo WorkerService.
   * Não chame diretamente de componentes de UI.
   *
   * @see docs/lightning-worker-consolidation-plan.md - Fase 5.3
   */
  async sendPing(): Promise<void> {
    if (this.state.status !== 'connected' || !this.state.socket) {
      throw new Error('Not connected')
    }

    const pingMsg = createPingMessage(16, 16)
    const encoded = encodePingMessage(pingMsg)

    this.state.socket.send(encoded)
    this.updateState({ lastPing: Date.now() })

    // Aguardar pong com timeout
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Pong timeout'))
      }, this.config.pongTimeout)

      const handler = (event: TransportEvent) => {
        if (event.type === 'pong') {
          clearTimeout(timeout)
          this.removeListener(handler)
          resolve()
        }
      }

      this.addListener(handler)
    })
  }

  /**
   * Envia uma mensagem raw para o peer
   */
  sendMessage(data: Uint8Array): void {
    if (this.state.status !== 'connected' || !this.state.socket) {
      throw new Error('Not connected')
    }

    this.state.socket.send(data)
  }

  /**
   * Envia uma mensagem de erro e desconecta
   */
  async sendError(message: string, channelId?: Uint8Array): Promise<void> {
    if (this.state.socket) {
      const errorMsg = createErrorMessage(channelId ?? new Uint8Array(32), message)
      const encoded = encodeErrorMessage(errorMsg)
      this.state.socket.send(encoded)
    }

    await this.disconnect()
  }

  // ==========================================
  // GETTERS
  // ==========================================

  get status(): TransportStatus {
    return this.state.status
  }

  get isConnected(): boolean {
    return this.state.status === 'connected'
  }

  get peerId(): string | null {
    return this.state.peerId
  }

  get negotiatedFeatures(): Uint8Array | null {
    return this.state.negotiatedFeatures
  }

  get lastPing(): number {
    return this.state.lastPing
  }

  get lastPong(): number {
    return this.state.lastPong
  }

  // ==========================================
  // EVENT HANDLING
  // ==========================================

  addListener(listener: TransportEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  removeListener(listener: TransportEventListener): void {
    this.listeners.delete(listener)
  }

  private emit(event: TransportEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('[LightningTransport] Listener error:', error)
      }
    })
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  private updateState(partial: Partial<TransportState>): void {
    this.state = { ...this.state, ...partial }
  }

  private async establishConnection(host: string, port: number, nodeId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, this.config.connectionTimeout)

      try {
        // Nota: Em produção, usar conexão segura com Noise protocol
        // Por agora, simular com WebSocket (ou usar TCP nativo via bridge)
        const wsUrl = `wss://${host}:${port}`
        const socket = new WebSocket(wsUrl)

        socket.binaryType = 'arraybuffer'

        socket.onopen = () => {
          clearTimeout(timeout)
          this.handleSocketOpen(socket, nodeId)
          resolve()
        }

        socket.onmessage = event => {
          this.handleSocketMessage(event)
        }

        socket.onclose = event => {
          this.handleSocketClose(event)
        }

        socket.onerror = () => {
          clearTimeout(timeout)
          const error = new Error('WebSocket error')
          this.handleSocketError(error)
          reject(error)
        }

        this.updateState({ socket })
      } catch (error) {
        clearTimeout(timeout)
        reject(error)
      }
    })
  }

  private handleSocketOpen(socket: WebSocket, nodeId: string): void {
    console.log('[LightningTransport] Socket opened, sending init')

    // Criar e enviar mensagem init
    const localFeatures = createFeatureVector(this.config.localFeatures)
    const chainHashes = this.config.chainHash ? [this.config.chainHash] : [MAINNET_CHAIN_HASH]
    const initMsg = createInitMessage(localFeatures, chainHashes)
    const encoded = encodeInitMessage(initMsg)

    socket.send(encoded)
  }

  private handleSocketMessage(event: MessageEvent): void {
    const data = new Uint8Array(event.data)

    // Parse message type (primeiros 2 bytes)
    if (data.length < 2) {
      console.warn('[LightningTransport] Message too short')
      return
    }

    const msgType = (data[0] << 8) | data[1]

    try {
      switch (msgType) {
        case 16: // init
          this.handleInitMessage(data)
          break
        case 17: // error
          this.handleErrorMessage(data)
          break
        case 18: // ping
          this.handlePingMessage(data)
          break
        case 19: // pong
          this.handlePongMessage(data)
          break
        default:
          // Passar para listeners
          this.emit({ type: 'message', data })
      }
    } catch (error) {
      console.error('[LightningTransport] Message handling error:', error)
    }
  }

  private handleInitMessage(data: Uint8Array): void {
    try {
      const remoteInit = decodeInitMessage(data)
      const localFeatures = createFeatureVector(this.config.localFeatures)
      const negotiated = negotiateFeatures(localFeatures, remoteInit.features)

      if (!negotiated) {
        throw new Error('Feature negotiation failed')
      }

      this.updateState({
        status: 'connected',
        negotiatedFeatures: negotiated,
      })

      // Iniciar ping timer
      this.startPingTimer()

      this.emit({ type: 'init', message: remoteInit })
      this.emit({ type: 'connected', peerId: this.state.peerId! })

      console.log('[LightningTransport] Connected with features:', uint8ArrayToHex(negotiated))
    } catch (error) {
      console.error('[LightningTransport] Init message error:', error)
      this.disconnect()
    }
  }

  private handleErrorMessage(data: Uint8Array): void {
    // Parse error message
    console.error('[LightningTransport] Received error message')
    this.emit({ type: 'error', error: new Error('Peer sent error') })
    this.disconnect()
  }

  private handlePingMessage(data: Uint8Array): void {
    // Responder com pong
    if (data.length < 4) return

    const numPongBytes = (data[2] << 8) | data[3]
    const pongData = new Uint8Array(numPongBytes)

    // Construir pong message
    const pongMsg = new Uint8Array(4 + numPongBytes)
    pongMsg[0] = 0
    pongMsg[1] = 19 // pong type
    pongMsg[2] = (numPongBytes >> 8) & 0xff
    pongMsg[3] = numPongBytes & 0xff
    pongMsg.set(pongData, 4)

    this.state.socket?.send(pongMsg)
  }

  private handlePongMessage(data: Uint8Array): void {
    try {
      const pong = decodePongMessage(data)
      this.updateState({ lastPong: Date.now() })
      this.emit({ type: 'pong', message: pong })
    } catch (error) {
      console.error('[LightningTransport] Pong parse error:', error)
    }
  }

  private handleSocketClose(event: CloseEvent): void {
    console.log('[LightningTransport] Socket closed:', event.code, event.reason)

    if (this.state.pingTimer) {
      clearInterval(this.state.pingTimer)
    }

    this.updateState({
      status: 'disconnected',
      socket: null,
      pingTimer: null,
    })

    this.emit({ type: 'disconnected', reason: event.reason })
  }

  private handleSocketError(error: Error): void {
    console.error('[LightningTransport] Socket error:', error)
    this.updateState({ status: 'error', error })
    this.emit({ type: 'error', error })
  }

  private startPingTimer(): void {
    if (this.state.pingTimer) {
      clearInterval(this.state.pingTimer)
    }

    const timer = setInterval(() => {
      if (this.state.status === 'connected') {
        this.sendPing().catch(error => {
          console.error('[LightningTransport] Ping failed:', error)
        })
      }
    }, this.config.pingInterval)

    this.updateState({ pingTimer: timer })
  }
}

// ==========================================
// TCP-BASED INIT NEGOTIATION (BOLT #1)
// ==========================================

/**
 * Executa troca de mensagens init (BOLT #1) sobre um TcpTransport já conectado (BOLT #8 concluído).
 * Envia init local, espera init remoto, negocia features e retorna o resultado.
 */
export async function performInitExchange(
  transport: TcpTransport,
  config: Partial<TransportConfig> = {},
): Promise<InitNegotiationResult> {
  const { localFeatures, chainHash, connectionTimeout } = { ...DEFAULT_CONFIG, ...config }

  const localFeatureVector = createFeatureVector(localFeatures)
  const chainHashes = chainHash ? [chainHash] : [MAINNET_CHAIN_HASH]
  const initMsg = createInitMessage(localFeatureVector, chainHashes)
  const encodedInit = encodeInitMessage(initMsg)

  // Enviar init apenas quando transporte estiver pronto (handshake completo)
  try {
    transport.sendMessage(encodedInit)
  } catch (error) {
    throw new Error('Transport not ready for init exchange')
  }

  return new Promise<InitNegotiationResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Init exchange timed out'))
    }, connectionTimeout ?? INIT_TIMEOUT_MS)

    const cleanup = () => {
      clearTimeout(timeout)
      transport.removeListener('transport', onTransportEvent)
    }

    const onTransportEvent = (event: TcpTransportEvent) => {
      if (event.type === 'message') {
        handleMessage(event.data)
      } else if (event.type === 'disconnected' || event.type === 'error') {
        cleanup()
        reject(new Error('Transport closed before init completed'))
      }
    }

    const handleMessage = (data: Uint8Array) => {
      if (data.length < 2) return
      const msgType = (data[0] << 8) | data[1]

      switch (msgType) {
        case 16: {
          try {
            const remoteInit = decodeInitMessage(data)
            const negotiated = negotiateFeatures(localFeatureVector, remoteInit.features)
            if (!negotiated) {
              throw new Error('Feature negotiation failed')
            }

            cleanup()
            resolve({ remoteInit, negotiatedFeatures: negotiated })
          } catch (error) {
            cleanup()
            reject(error instanceof Error ? error : new Error('Init decode failed'))
          }
          break
        }
        case 18: {
          // ping → responder com pong
          respondPong(data)
          break
        }
        case 19: {
          // pong → ignorar (keepalive)
          break
        }
        default:
          // Ignorar outras mensagens até completar init
          break
      }
    }

    const respondPong = (pingData: Uint8Array) => {
      if (pingData.length < 4) return
      const numPongBytes = (pingData[2] << 8) | pingData[3]
      const pongMsg = new Uint8Array(4 + numPongBytes)
      pongMsg[0] = 0
      pongMsg[1] = 19 // pong type
      pongMsg[2] = (numPongBytes >> 8) & 0xff
      pongMsg[3] = numPongBytes & 0xff
      transport.sendMessage(pongMsg)
    }

    transport.addListener('transport', onTransportEvent)
  })
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let transportInstance: LightningTransport | null = null

/**
 * Obtém a instância singleton do transporte
 */
export function getTransport(config?: Partial<TransportConfig>): LightningTransport {
  if (!transportInstance) {
    transportInstance = new LightningTransport(config)
  }
  return transportInstance
}

/**
 * Reseta a instância do transporte (para testes)
 */
export function resetTransport(): void {
  if (transportInstance) {
    transportInstance.disconnect()
    transportInstance = null
  }
}

export default LightningTransport
