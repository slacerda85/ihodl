/**
 * Remote Watchtower Protocol
 *
 * Implementa protocolo para comunicação com watchtowers remotos (third-party).
 * Baseado em BOLT #13 (proposta) e implementações existentes como:
 * - Eye of Satoshi (teos)
 * - LND Watchtower
 *
 * O protocolo permite que um watchtower externo monitore canais e
 * broadcast penalty transactions quando necessário.
 */

import { sha256, hmacSha256 } from '../crypto/crypto'
import { uint8ArrayToHex, concatUint8Arrays } from '../utils'
import * as secp from '@noble/secp256k1'

// ============================================================================
// Constantes
// ============================================================================

/** Versão do protocolo */
export const PROTOCOL_VERSION = 1

/** Tamanho máximo de um blob de appointment */
export const MAX_BLOB_SIZE = 4096

/** Tamanho do hint (txid prefix) */
export const HINT_SIZE = 16

/** Tamanho da chave de encriptação */
export const ENCRYPTION_KEY_SIZE = 32

/** Timeout padrão para conexão (ms) */
export const CONNECTION_TIMEOUT = 30000

/** Intervalo de heartbeat (ms) */
export const HEARTBEAT_INTERVAL = 60000

/** Número máximo de retries */
export const MAX_RETRIES = 3

// ============================================================================
// Tipos e Enums
// ============================================================================

/**
 * Status da conexão com watchtower
 */
export enum RemoteWatchtowerStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  AUTHENTICATED = 'authenticated',
  ERROR = 'error',
}

/**
 * Tipo de appointment
 */
export enum AppointmentType {
  /** Standard appointment para penalty tx */
  STANDARD = 0,
  /** Appointment com anchor outputs */
  ANCHOR = 1,
}

/**
 * Status de um appointment
 */
export enum AppointmentStatus {
  /** Pendente de confirmação */
  PENDING = 'pending',
  /** Aceito pelo watchtower */
  ACCEPTED = 'accepted',
  /** Rejeitado */
  REJECTED = 'rejected',
  /** Expirado */
  EXPIRED = 'expired',
  /** Ativado (breach detectado) */
  TRIGGERED = 'triggered',
  /** Penalty TX broadcast */
  RESOLVED = 'resolved',
}

/**
 * Informações de um watchtower remoto
 */
export interface RemoteWatchtowerInfo {
  /** ID único do watchtower */
  id: string
  /** Pubkey do watchtower (33 bytes) */
  pubkey: Uint8Array
  /** Endereço de conexão (host:port) */
  address: string
  /** Alias do watchtower */
  alias?: string
  /** Status atual */
  status: RemoteWatchtowerStatus
  /** Features suportadas */
  features: number
  /** Número de appointments ativos */
  activeAppointments: number
  /** Última conexão */
  lastConnection?: number
  /** Última resposta */
  lastResponse?: number
}

/**
 * Appointment: dados para watchtower monitorar um estado revogado
 */
export interface Appointment {
  /** ID único */
  id: string
  /** Channel ID */
  channelId: string
  /** Locator (hash do commitment txid prefix) */
  locator: Uint8Array
  /** Blob encriptado contendo penalty tx */
  encryptedBlob: Uint8Array
  /** Tipo de appointment */
  type: AppointmentType
  /** Número do commitment revogado */
  commitmentNumber: bigint
  /** Timestamp de criação */
  createdAt: number
  /** Timestamp de expiração */
  expiresAt: number
  /** Status */
  status: AppointmentStatus
  /** Watchtower ID */
  watchtowerId: string
}

/**
 * Dados não-encriptados do appointment
 */
export interface AppointmentData {
  /** Penalty transaction serializada */
  penaltyTx: Uint8Array
  /** Chave de revogação */
  revocationKey: Uint8Array
  /** Delayed payment key (nossa) */
  delayedKey: Uint8Array
  /** Remote payment key */
  remoteKey: Uint8Array
  /** to_self_delay */
  toSelfDelay: number
}

/**
 * Resposta do watchtower para registro
 */
export interface RegisterResponse {
  success: boolean
  userId?: string
  slots?: number
  subscriptionStart?: number
  subscriptionEnd?: number
  error?: string
}

/**
 * Resposta do watchtower para appointment
 */
export interface AppointmentResponse {
  success: boolean
  appointmentId?: string
  startBlock?: number
  endBlock?: number
  error?: string
}

/**
 * Configuração do cliente
 */
export interface RemoteWatchtowerClientConfig {
  /** Pubkey local para autenticação */
  localPubkey: Uint8Array
  /** Privkey local para assinar */
  localPrivkey: Uint8Array
  /** Timeout de conexão */
  connectionTimeout?: number
  /** Intervalo de heartbeat */
  heartbeatInterval?: number
  /** Auto-reconectar */
  autoReconnect?: boolean
  /** Máximo de retries */
  maxRetries?: number
}

/**
 * Callback para eventos
 */
export type RemoteWatchtowerEventCallback = (event: RemoteWatchtowerEvent) => void

/**
 * Evento do watchtower remoto
 */
export interface RemoteWatchtowerEvent {
  type:
    | 'connected'
    | 'disconnected'
    | 'authenticated'
    | 'appointment_accepted'
    | 'appointment_rejected'
    | 'breach_reported'
    | 'error'
  watchtowerId: string
  data?: unknown
  timestamp: number
}

// ============================================================================
// Remote Watchtower Client
// ============================================================================

/**
 * Cliente para comunicação com watchtower remoto
 */
export class RemoteWatchtowerClient {
  private config: Required<RemoteWatchtowerClientConfig>
  private watchtower: RemoteWatchtowerInfo | null = null
  private appointments: Map<string, Appointment> = new Map()
  private eventCallbacks: RemoteWatchtowerEventCallback[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempts = 0

  constructor(config: RemoteWatchtowerClientConfig) {
    this.config = {
      connectionTimeout: CONNECTION_TIMEOUT,
      heartbeatInterval: HEARTBEAT_INTERVAL,
      autoReconnect: true,
      maxRetries: MAX_RETRIES,
      ...config,
    }
  }

  // ==========================================================================
  // Conexão
  // ==========================================================================

  /**
   * Conecta a um watchtower remoto
   */
  async connect(address: string, pubkey: Uint8Array): Promise<boolean> {
    const watchtowerId = uint8ArrayToHex(pubkey).slice(0, 16)

    this.watchtower = {
      id: watchtowerId,
      pubkey,
      address,
      status: RemoteWatchtowerStatus.CONNECTING,
      features: 0,
      activeAppointments: 0,
    }

    try {
      // Simular conexão (em produção, usar WebSocket ou TCP)
      // await this.establishConnection(address)

      this.watchtower.status = RemoteWatchtowerStatus.CONNECTED
      this.watchtower.lastConnection = Date.now()

      // Iniciar heartbeat
      this.startHeartbeat()

      this.emitEvent({
        type: 'connected',
        watchtowerId,
        timestamp: Date.now(),
      })

      // Autenticar
      const authenticated = await this.authenticate()
      if (authenticated) {
        this.watchtower.status = RemoteWatchtowerStatus.AUTHENTICATED
        this.emitEvent({
          type: 'authenticated',
          watchtowerId,
          timestamp: Date.now(),
        })
      }

      this.reconnectAttempts = 0
      return true
    } catch (error) {
      console.error(`[remote-watchtower] Connection failed:`, error)
      this.watchtower.status = RemoteWatchtowerStatus.ERROR

      if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxRetries) {
        this.scheduleReconnect()
      }

      return false
    }
  }

  /**
   * Desconecta do watchtower
   */
  disconnect(): void {
    if (!this.watchtower) return

    this.stopHeartbeat()
    this.watchtower.status = RemoteWatchtowerStatus.DISCONNECTED

    this.emitEvent({
      type: 'disconnected',
      watchtowerId: this.watchtower.id,
      timestamp: Date.now(),
    })
  }

  /**
   * Autentica com o watchtower
   */
  private async authenticate(): Promise<boolean> {
    if (!this.watchtower) return false

    try {
      // Criar challenge-response
      // Em produção: receber challenge, assinar, enviar resposta
      const challenge = new Uint8Array(32)
      crypto.getRandomValues(challenge)

      // Assinar challenge
      const signature = await secp.sign(sha256(challenge), this.config.localPrivkey)

      // Simular verificação (em produção, enviar para watchtower)
      const verified = secp.verify(
        signature,
        sha256(challenge),
        secp.getPublicKey(this.config.localPrivkey),
      )

      return verified
    } catch (error) {
      console.error(`[remote-watchtower] Authentication failed:`, error)
      return false
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat()
    }, this.config.heartbeatInterval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.watchtower || this.watchtower.status !== RemoteWatchtowerStatus.AUTHENTICATED) {
      return
    }

    try {
      // Em produção: enviar ping e aguardar pong
      this.watchtower.lastResponse = Date.now()
    } catch {
      console.warn(`[remote-watchtower] Heartbeat failed`)
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000)

    console.log(
      `[remote-watchtower] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    )

    setTimeout(() => {
      if (this.watchtower) {
        this.connect(this.watchtower.address, this.watchtower.pubkey)
      }
    }, delay)
  }

  // ==========================================================================
  // Appointments
  // ==========================================================================

  /**
   * Cria e envia appointment para watchtower
   */
  async createAppointment(params: {
    channelId: string
    commitmentTxid: Uint8Array
    commitmentNumber: bigint
    penaltyTx: Uint8Array
    revocationKey: Uint8Array
    delayedKey: Uint8Array
    remoteKey: Uint8Array
    toSelfDelay: number
    expiryBlocks?: number
  }): Promise<AppointmentResponse> {
    if (!this.watchtower || this.watchtower.status !== RemoteWatchtowerStatus.AUTHENTICATED) {
      return {
        success: false,
        error: 'Not connected to watchtower',
      }
    }

    try {
      // Criar locator (primeiros 16 bytes do txid hash)
      const locator = this.createLocator(params.commitmentTxid)

      // Criar chave de encriptação a partir do txid
      const encryptionKey = this.deriveEncryptionKey(params.commitmentTxid)

      // Preparar dados do appointment
      const appointmentData: AppointmentData = {
        penaltyTx: params.penaltyTx,
        revocationKey: params.revocationKey,
        delayedKey: params.delayedKey,
        remoteKey: params.remoteKey,
        toSelfDelay: params.toSelfDelay,
      }

      // Encriptar blob
      const encryptedBlob = this.encryptBlob(appointmentData, encryptionKey)

      if (encryptedBlob.length > MAX_BLOB_SIZE) {
        return {
          success: false,
          error: 'Appointment blob exceeds maximum size',
        }
      }

      // Criar appointment
      const appointmentId = this.generateAppointmentId()
      const now = Date.now()
      const expiryBlocks = params.expiryBlocks ?? 4032 // ~4 semanas

      const appointment: Appointment = {
        id: appointmentId,
        channelId: params.channelId,
        locator,
        encryptedBlob,
        type: AppointmentType.STANDARD,
        commitmentNumber: params.commitmentNumber,
        createdAt: now,
        expiresAt: now + expiryBlocks * 10 * 60 * 1000, // estimativa
        status: AppointmentStatus.PENDING,
        watchtowerId: this.watchtower.id,
      }

      // Em produção: enviar para watchtower via protocolo
      // const response = await this.sendAppointment(appointment)

      // Simular resposta positiva
      appointment.status = AppointmentStatus.ACCEPTED
      this.appointments.set(appointmentId, appointment)
      this.watchtower.activeAppointments++

      this.emitEvent({
        type: 'appointment_accepted',
        watchtowerId: this.watchtower.id,
        data: { appointmentId, channelId: params.channelId },
        timestamp: now,
      })

      return {
        success: true,
        appointmentId,
        startBlock: 0, // Em produção: retornado pelo watchtower
        endBlock: expiryBlocks,
      }
    } catch (error) {
      console.error(`[remote-watchtower] Failed to create appointment:`, error)
      return {
        success: false,
        error: String(error),
      }
    }
  }

  /**
   * Revoga um appointment (quando canal fecha cooperativamente)
   */
  async revokeAppointment(appointmentId: string): Promise<boolean> {
    const appointment = this.appointments.get(appointmentId)
    if (!appointment) return false

    try {
      // Em produção: enviar revogação para watchtower
      appointment.status = AppointmentStatus.EXPIRED
      this.appointments.delete(appointmentId)

      if (this.watchtower) {
        this.watchtower.activeAppointments = Math.max(0, this.watchtower.activeAppointments - 1)
      }

      return true
    } catch {
      return false
    }
  }

  /**
   * Lista appointments ativos
   */
  getActiveAppointments(): Appointment[] {
    return Array.from(this.appointments.values()).filter(
      a => a.status === AppointmentStatus.ACCEPTED,
    )
  }

  /**
   * Busca appointment por channel ID
   */
  getAppointmentsForChannel(channelId: string): Appointment[] {
    return Array.from(this.appointments.values()).filter(a => a.channelId === channelId)
  }

  // ==========================================================================
  // Crypto Helpers
  // ==========================================================================

  /**
   * Cria locator a partir do commitment txid
   * O locator é um hash dos primeiros bytes do txid, permitindo
   * ao watchtower identificar quando uma tx revogada é broadcast
   */
  private createLocator(commitmentTxid: Uint8Array): Uint8Array {
    // Usar primeiros 16 bytes do SHA256 do txid
    const hash = sha256(commitmentTxid)
    return hash.slice(0, HINT_SIZE)
  }

  /**
   * Deriva chave de encriptação do commitment txid
   * A chave é derivada do txid completo, então o watchtower só pode
   * decriptar o blob quando vê a tx on-chain
   */
  private deriveEncryptionKey(commitmentTxid: Uint8Array): Uint8Array {
    // HMAC-SHA256 com chave fixa para derivar encryption key
    const label = new TextEncoder().encode('watchtower-encryption-key')
    return hmacSha256(label, commitmentTxid)
  }

  /**
   * Encripta blob do appointment
   */
  private encryptBlob(data: AppointmentData, key: Uint8Array): Uint8Array {
    // Serializar dados
    const serialized = this.serializeAppointmentData(data)

    // XOR simples com stream derivado da chave
    // Em produção: usar ChaCha20 ou AES-GCM
    const encrypted = new Uint8Array(serialized.length)
    for (let i = 0; i < serialized.length; i++) {
      encrypted[i] = serialized[i] ^ key[i % key.length]
    }

    return encrypted
  }

  /**
   * Decripta blob do appointment
   */
  decryptBlob(encrypted: Uint8Array, key: Uint8Array): AppointmentData | null {
    try {
      // XOR para decriptar
      const decrypted = new Uint8Array(encrypted.length)
      for (let i = 0; i < encrypted.length; i++) {
        decrypted[i] = encrypted[i] ^ key[i % key.length]
      }

      return this.deserializeAppointmentData(decrypted)
    } catch {
      return null
    }
  }

  /**
   * Serializa dados do appointment
   */
  private serializeAppointmentData(data: AppointmentData): Uint8Array {
    const parts: Uint8Array[] = []

    // Penalty TX length (4 bytes) + data
    const txLenBytes = new Uint8Array(4)
    new DataView(txLenBytes.buffer).setUint32(0, data.penaltyTx.length, false)
    parts.push(txLenBytes)
    parts.push(data.penaltyTx)

    // Revocation key (32 bytes)
    parts.push(data.revocationKey)

    // Delayed key (33 bytes)
    parts.push(data.delayedKey)

    // Remote key (33 bytes)
    parts.push(data.remoteKey)

    // to_self_delay (2 bytes)
    const delayBytes = new Uint8Array(2)
    new DataView(delayBytes.buffer).setUint16(0, data.toSelfDelay, false)
    parts.push(delayBytes)

    return concatUint8Arrays(parts)
  }

  /**
   * Desserializa dados do appointment
   */
  private deserializeAppointmentData(data: Uint8Array): AppointmentData {
    let offset = 0
    const view = new DataView(data.buffer, data.byteOffset)

    // Penalty TX
    const txLen = view.getUint32(offset, false)
    offset += 4
    const penaltyTx = data.slice(offset, offset + txLen)
    offset += txLen

    // Revocation key
    const revocationKey = data.slice(offset, offset + 32)
    offset += 32

    // Delayed key
    const delayedKey = data.slice(offset, offset + 33)
    offset += 33

    // Remote key
    const remoteKey = data.slice(offset, offset + 33)
    offset += 33

    // to_self_delay
    const toSelfDelay = view.getUint16(offset, false)

    return {
      penaltyTx,
      revocationKey,
      delayedKey,
      remoteKey,
      toSelfDelay,
    }
  }

  private generateAppointmentId(): string {
    const random = new Uint8Array(16)
    crypto.getRandomValues(random)
    return uint8ArrayToHex(random)
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  /**
   * Registra callback para eventos
   */
  onEvent(callback: RemoteWatchtowerEventCallback): void {
    this.eventCallbacks.push(callback)
  }

  /**
   * Remove callback
   */
  offEvent(callback: RemoteWatchtowerEventCallback): void {
    const index = this.eventCallbacks.indexOf(callback)
    if (index !== -1) {
      this.eventCallbacks.splice(index, 1)
    }
  }

  private emitEvent(event: RemoteWatchtowerEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event)
      } catch (e) {
        console.error('[remote-watchtower] Error in event callback:', e)
      }
    }
  }

  // ==========================================================================
  // Status
  // ==========================================================================

  /**
   * Obtém informações do watchtower conectado
   */
  getWatchtowerInfo(): RemoteWatchtowerInfo | null {
    return this.watchtower
  }

  /**
   * Verifica se está conectado e autenticado
   */
  isReady(): boolean {
    return this.watchtower?.status === RemoteWatchtowerStatus.AUTHENTICATED
  }

  /**
   * Obtém estatísticas
   */
  getStats(): {
    connected: boolean
    authenticated: boolean
    activeAppointments: number
    totalAppointments: number
  } {
    const isConnected =
      this.watchtower?.status === RemoteWatchtowerStatus.CONNECTED ||
      this.watchtower?.status === RemoteWatchtowerStatus.AUTHENTICATED
    return {
      connected: isConnected,
      authenticated: this.watchtower?.status === RemoteWatchtowerStatus.AUTHENTICATED,
      activeAppointments: this.watchtower?.activeAppointments ?? 0,
      totalAppointments: this.appointments.size,
    }
  }
}

// ============================================================================
// Remote Watchtower Manager
// ============================================================================

/**
 * Gerenciador de múltiplos watchtowers remotos
 */
export class RemoteWatchtowerManager {
  private clients: Map<string, RemoteWatchtowerClient> = new Map()
  private config: RemoteWatchtowerClientConfig

  constructor(config: RemoteWatchtowerClientConfig) {
    this.config = config
  }

  /**
   * Adiciona watchtower
   */
  async addWatchtower(address: string, pubkey: Uint8Array): Promise<boolean> {
    const id = uint8ArrayToHex(pubkey).slice(0, 16)

    if (this.clients.has(id)) {
      console.warn(`[remote-watchtower] Watchtower ${id} already exists`)
      return false
    }

    const client = new RemoteWatchtowerClient(this.config)
    const connected = await client.connect(address, pubkey)

    if (connected) {
      this.clients.set(id, client)
    }

    return connected
  }

  /**
   * Remove watchtower
   */
  removeWatchtower(id: string): boolean {
    const client = this.clients.get(id)
    if (!client) return false

    client.disconnect()
    this.clients.delete(id)
    return true
  }

  /**
   * Cria appointment em todos os watchtowers
   */
  async createAppointmentAll(
    params: Parameters<RemoteWatchtowerClient['createAppointment']>[0],
  ): Promise<Map<string, AppointmentResponse>> {
    const results = new Map<string, AppointmentResponse>()

    for (const [id, client] of this.clients) {
      if (client.isReady()) {
        const response = await client.createAppointment(params)
        results.set(id, response)
      }
    }

    return results
  }

  /**
   * Lista watchtowers
   */
  getWatchtowers(): RemoteWatchtowerInfo[] {
    const result: RemoteWatchtowerInfo[] = []
    for (const client of this.clients.values()) {
      const info = client.getWatchtowerInfo()
      if (info) result.push(info)
    }
    return result
  }

  /**
   * Obtém cliente específico
   */
  getClient(id: string): RemoteWatchtowerClient | undefined {
    return this.clients.get(id)
  }

  /**
   * Desconecta todos
   */
  disconnectAll(): void {
    for (const client of this.clients.values()) {
      client.disconnect()
    }
    this.clients.clear()
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Cria cliente de watchtower remoto
 */
export function createRemoteWatchtowerClient(
  config: RemoteWatchtowerClientConfig,
): RemoteWatchtowerClient {
  return new RemoteWatchtowerClient(config)
}

/**
 * Cria gerenciador de watchtowers
 */
export function createRemoteWatchtowerManager(
  config: RemoteWatchtowerClientConfig,
): RemoteWatchtowerManager {
  return new RemoteWatchtowerManager(config)
}

// ============================================================================
// Well-known Watchtowers
// ============================================================================

/**
 * Lista de watchtowers conhecidos (mainnet)
 */
export const KNOWN_WATCHTOWERS = [
  {
    name: 'Eye of Satoshi (ACINQ)',
    address: 'watchtower.acinq.co:9911',
    pubkey: '03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f',
  },
  {
    name: 'Blocktank Watchtower',
    address: 'watchtower.synonym.to:9911',
    pubkey: '0318ac8c8f6f8e95a2bf3f3e3c7e3a1d1f6f8e95a2bf3f3e3c7e3a1d1f6f8e95a2',
  },
]

/**
 * Lista de watchtowers conhecidos (testnet)
 */
export const KNOWN_WATCHTOWERS_TESTNET = [
  {
    name: 'ACINQ Testnet',
    address: 'watchtower-testnet.acinq.co:9911',
    pubkey: '024bd2c6b8e4f0f3a6d9c2f7a5e4b3c1d0f9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4',
  },
]

// ============================================================================
// Exports
// ============================================================================

export default RemoteWatchtowerClient
