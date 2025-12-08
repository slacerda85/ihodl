/**
 * Network Store
 *
 * Store singleton com pub/sub para gerenciamento de conexões de rede.
 * Separado do provider para permitir composição no AppProvider.
 *
 * PRINCÍPIOS:
 * 1. Gerencia conexões Electrum e Lightning Worker
 * 2. Cache para evitar loop infinito no useSyncExternalStore
 * 3. Notifica subscribers quando conexões mudam
 * 4. Conexões são efêmeras (não persistidas)
 */

import { Connection } from '@/core/models/network'
import { LightningWorker } from '@/core/lib/lightning/worker'
import networkService from '@/core/services/network'

// ==========================================
// TYPES
// ==========================================

export interface NetworkStoreState {
  /** Status da conexão Electrum */
  electrumConnected: boolean
  /** Status do Lightning Worker */
  lightningWorkerReady: boolean
  /** Última tentativa de conexão */
  lastConnectionAttempt: number
  /** Último erro de conexão */
  lastError?: string
}

export interface NetworkStoreActions {
  /** Obtém conexão Electrum saudável */
  getConnection(): Promise<Connection>
  /** Obtém Lightning Worker saudável */
  getLightningWorker(
    masterKey: Uint8Array,
    network?: 'mainnet' | 'testnet' | 'regtest',
  ): Promise<LightningWorker>
  /** Força reconexão */
  reconnect(): Promise<void>
  /** Fecha todas as conexões */
  closeConnections(): Promise<void>
}

// ==========================================
// STORE CLASS
// ==========================================

class NetworkStore {
  private subscribers = new Set<() => void>()

  // Cache para snapshots - evita loop infinito no useSyncExternalStore
  private cachedState: NetworkStoreState = {
    electrumConnected: false,
    lightningWorkerReady: false,
    lastConnectionAttempt: 0,
  }

  // Refs para conexões (como no NetworkProvider original)
  private connectionRef: Connection | null = null
  private lightningWorkerRef: LightningWorker | null = null

  constructor() {
    // Estado inicial - conexões começam desconectadas
    this.refreshCache()
  }

  private refreshCache = (): void => {
    // Estado baseado nas refs atuais
    this.cachedState = {
      electrumConnected: this.connectionRef !== null && !this.connectionRef.destroyed,
      lightningWorkerReady: this.lightningWorkerRef !== null,
      lastConnectionAttempt: Date.now(),
    }
  }

  private notify = (): void => {
    this.refreshCache()
    this.subscribers.forEach(callback => callback())
  }

  // ==========================================
  // SUBSCRIPTION
  // ==========================================

  subscribe = (callback: () => void): (() => void) => {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  // ==========================================
  // SNAPSHOTS (para useSyncExternalStore)
  // ==========================================

  getSnapshot = (): NetworkStoreState => {
    return this.cachedState
  }

  // ==========================================
  // CONNECTION MANAGEMENT
  // ==========================================

  /**
   * Verifica se uma conexão está saudável
   */
  private isConnectionHealthy(connection: Connection): boolean {
    return !connection.destroyed
  }

  /**
   * Obtém conexão Electrum saudável
   */
  async getConnection(): Promise<Connection> {
    try {
      // Verificar se a conexão existe e está saudável
      if (
        !this.connectionRef ||
        this.connectionRef.destroyed ||
        !this.isConnectionHealthy(this.connectionRef)
      ) {
        // Se não estiver saudável, conectar novamente
        const connection = await networkService.connect()
        this.connectionRef = connection

        // Configurar listener de erro
        if (this.connectionRef.listenerCount('error') === 0) {
          this.connectionRef.on('error', err => {
            console.warn('[NetworkStore] Connection error:', err.message)
            this.connectionRef?.destroy()
            this.connectionRef = null
            this.cachedState.lastError = err.message
            this.notify()
          })
        }
      }

      this.cachedState.lastError = undefined
      this.notify()
      return this.connectionRef
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      this.cachedState.lastError = message
      this.notify()
      throw error
    }
  }

  /**
   * Obtém Lightning Worker saudável
   */
  async getLightningWorker(
    masterKey: Uint8Array,
    network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
  ): Promise<LightningWorker> {
    try {
      // Verificar se já existe um worker ativo
      if (this.lightningWorkerRef) {
        // Verificar se a conexão ainda está saudável
        const connection = (this.lightningWorkerRef as any).connection
        if (connection && !connection.destroyed && this.isConnectionHealthy(connection)) {
          return this.lightningWorkerRef
        }
        // Se não estiver saudável, fechar o worker antigo
        await this.lightningWorkerRef.close()
        this.lightningWorkerRef = null
      }

      // Criar novo worker Lightning
      const worker = await networkService.createLightningWorker(masterKey, network)
      this.lightningWorkerRef = worker

      // Configurar listener de erro
      const connection = (worker as any).connection
      if (connection && connection.listenerCount('error') === 0) {
        connection.on('error', (err: Error) => {
          console.warn('[NetworkStore] Lightning connection error:', err.message)
          this.lightningWorkerRef = null
          this.cachedState.lastError = err.message
          this.notify()
        })
      }

      this.cachedState.lastError = undefined
      this.notify()
      return worker
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lightning worker creation failed'
      this.cachedState.lastError = message
      this.notify()
      throw error
    }
  }

  /**
   * Força reconexão de todas as conexões
   */
  async reconnect(): Promise<void> {
    try {
      // Fechar conexões existentes
      if (this.connectionRef) {
        this.connectionRef.destroy()
        this.connectionRef = null
      }
      if (this.lightningWorkerRef) {
        await this.lightningWorkerRef.close()
        this.lightningWorkerRef = null
      }

      // Forçar refresh do cache
      this.cachedState.lastError = undefined
      this.notify()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reconnection failed'
      this.cachedState.lastError = message
      this.notify()
      throw error
    }
  }

  /**
   * Fecha todas as conexões
   */
  async closeConnections(): Promise<void> {
    try {
      if (this.connectionRef) {
        this.connectionRef.destroy()
        this.connectionRef = null
      }
      if (this.lightningWorkerRef) {
        await this.lightningWorkerRef.close()
        this.lightningWorkerRef = null
      }

      this.cachedState.lastError = undefined
      this.notify()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Close connections failed'
      this.cachedState.lastError = message
      this.notify()
      throw error
    }
  }

  // ==========================================
  // ACTIONS OBJECT (para context)
  // ==========================================

  get actions(): NetworkStoreActions {
    return {
      getConnection: this.getConnection.bind(this),
      getLightningWorker: this.getLightningWorker.bind(this),
      reconnect: this.reconnect.bind(this),
      closeConnections: this.closeConnections.bind(this),
    }
  }
}

// ==========================================
// SINGLETON EXPORT
// ==========================================

export const networkStore = new NetworkStore()
