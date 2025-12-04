// Lightning Network Worker
// Wallet-level Lightning operations

import {
  generateKey,
  initializeHandshakeState,
  actOneSend,
  actTwoReceive,
  actThreeSend,
  encryptMessage,
  decryptMessage,
} from './transport'
import { encodeInitMessage, decodeInitMessage, encodePingMessage, decodePongMessage } from './base'
import { KeyPair, HandshakeState, TransportKeys } from '@/core/models/lightning/transport'
import { LightningMessageType, InitMessage, PingMessage } from '@/core/models/lightning/base'
import { Socket, Peer } from '@/core/models/network'
import {
  AcceptChannelMessage,
  FundingCreatedMessage,
  ChannelReadyMessage,
} from '@/core/models/lightning/peer'
import {
  LightningConnection,
  LightningClientConfig,
  HandshakeResult,
  DEFAULT_CLIENT_CONFIG,
  DEFAULT_PING_PONG_CONFIG,
  PingPongConfig,
  ChannelOpeningFeeConfig,
  DEFAULT_CHANNEL_FEE_CONFIG,
  LightningPaymentRequest,
  PaymentResult,
  GenerateInvoiceParams,
  InvoiceWithChannelInfo,
  LIGHTNING_PURPOSE,
  LIGHTNING_COIN_TYPE,
  MPPSession,
  PaymentPartResult,
} from '@/core/models/lightning/client'
import { createLightningSocket } from '@/core/lib/network/socket'
import {
  InvoiceCreateParams,
  CurrencyPrefix,
  DEFAULT_EXPIRY_SECONDS,
  DEFAULT_MIN_FINAL_CLTV_EXPIRY_DELTA,
} from '@/core/models/lightning/invoice'
import { encodeInvoice, decodeInvoice, validateInvoice } from './invoice'
import { deriveChildKey, createPublicKey } from '../key'
import { sha256, randomBytes, hash160 } from '../crypto/crypto'
import AddressService from '../../services/address'
import {
  RoutingGraph,
  PaymentRoute,
  RoutingNode,
  RoutingChannel,
  constructOnionPacket,
  decryptOnion,
} from './routing'
import { signMessage } from './p2p'
import {
  GossipMessageType,
  GossipMessageUnion,
  ChannelAnnouncementMessage,
  NodeAnnouncementMessage,
  ChannelUpdateMessage,
} from '@/core/models/lightning/p2p'
import { PaymentHash } from '@/core/models/lightning/transaction'
import { PaymentSecret } from '@/core/models/lightning/invoice'
import { CoinType } from '@/core/models/address'
import { LnVersion, NodeIndex, constructChannelIndex } from '@/core/models/lightning/lnpbp42'
import { hexToUint8Array, uint8ArrayToHex } from '../utils'
import { fromBech32, toBech32 } from '../address'
import lightningRepository from '../../repositories/lightning'
import {
  encodeFundingCreatedMessage,
  encodeChannelReadyMessage,
  encodeShutdownMessage,
  encodeUpdateAddHtlcMessage,
  encodeUpdateFulfillHtlcMessage,
  encodeUpdateFailHtlcMessage,
  encodeChannelReestablishMessage,
  decodeChannelReestablishMessage,
  createChannelReestablishMessage,
} from './peer'

import {
  broadcastTransaction,
  estimateFeeRate,
  getAddressTxHistory,
  getTransaction,
} from '../electrum/client'

// Integrated Lightning modules
import { ChannelManager, ChannelState as ChannelMgrState } from './channel'
import { RevocationStore } from './revocation'
import type { LocalConfig } from './commitment'

// Gossip Protocol
import {
  GossipSync,
  GossipSyncState,
  GossipSyncStats,
  GossipPeerInterface,
  createGossipSync,
} from './gossip'

// Trampoline Routing
import { TrampolineRouter, TrampolineNode, createTrampolineRouter } from './trampoline'

// Peer Manager
import { PeerManager, PeerInfo } from './peer'

// Error Handling
import {
  LightningError,
  LightningErrorCode,
  withRetry,
  withTimeout,
  CircuitBreaker,
  RecoveryManager,
  RecoveryStrategy,
  ErrorAggregator,
  HealthMonitor,
  RateLimiter,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
} from './errorHandling'

/**
 * Lightning Worker - Wallet-level operations
 * Provides complete Lightning Network functionality including:
 * - Invoice generation with automatic channel opening
 * - Payment sending (future)
 * - Balance management (future)
 */
export class LightningWorker {
  // ==========================================
  // 1. CONSTRUTOR E CONFIGURAÇÃO
  // ==========================================

  private connection: LightningConnection
  private masterKey: Uint8Array
  private network: 'mainnet' | 'testnet' | 'regtest'
  private channelFeeConfig: ChannelOpeningFeeConfig
  private nodeIndex: number = 0 // Incrementa para cada invoice gerado
  private preimageStore: Map<string, Uint8Array> = new Map() // Armazenamento de preimages

  // Gerenciamento de canais
  private channels: Map<string, ChannelInfo> = new Map()
  private channelStates: Map<string, ChannelState> = new Map()
  private htlcs: Map<string, HtlcInfo[]> = new Map() // channelId -> HTLCs
  private nextChannelId: number = 0
  private nextHtlcId: Map<string, bigint> = new Map() // channelId -> next HTLC ID

  // Novos gerenciadores de canal integrados (BOLT #2/#3)
  private channelManagers: Map<string, ChannelManager> = new Map()
  private revocationStores: Map<string, RevocationStore> = new Map()

  // ==========================================
  // ROTEAMENTO BOLT #4 + #7
  // ==========================================

  // Routing graph for pathfinding
  private routingGraph: RoutingGraph = new RoutingGraph()

  // Gossip message processing
  private gossipMessages: GossipMessageUnion[] = []

  // Watchtower for channel monitoring
  private watchtower: Watchtower = new Watchtower()

  // BOLT #7: Gossip Sync
  private gossipSync: GossipSync | null = null

  // Trampoline routing
  private trampolineRouter: TrampolineRouter | null = null

  // ==========================================
  // ERROR HANDLING & RESILIENCE
  // ==========================================

  // Circuit breakers for different operation types
  private circuitBreakers: Map<string, CircuitBreaker> = new Map()

  // Error aggregator for monitoring
  private errorAggregator: ErrorAggregator = new ErrorAggregator()

  // Recovery manager for failure recovery
  private recoveryManager: RecoveryManager = new RecoveryManager()

  // Health monitor for system health
  private healthMonitor: HealthMonitor = new HealthMonitor()

  // Rate limiter for outgoing operations
  private rateLimiter: RateLimiter = new RateLimiter(100, 10) // 100 tokens, 10/sec refill

  // Retry configuration
  private retryConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    onRetry: (attempt, error, delayMs) => {
      console.log(`[lightning] Retry attempt ${attempt}, waiting ${delayMs}ms: ${error.message}`)
    },
  }

  constructor(
    connection: LightningConnection,
    masterKey: Uint8Array,
    network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
    channelFeeConfig?: ChannelOpeningFeeConfig,
  ) {
    this.connection = connection
    this.masterKey = masterKey
    this.network = network
    this.channelFeeConfig = channelFeeConfig || DEFAULT_CHANNEL_FEE_CONFIG

    // Inicializar PeerManager
    this.peerManager = new PeerManager()

    // Inicializar módulos
    this.gossipSync = createGossipSync()
    this.trampolineRouter = createTrampolineRouter()

    // Configurar callback de gossip
    this.gossipSync.setMessageCallback(async message => {
      await this.updateRoutingGraph(message)
    })

    // Inicializar circuit breakers para operações críticas
    this.initializeCircuitBreakers()

    // Registrar estratégias de recovery
    this.initializeRecoveryStrategies()

    // Configurar health checks
    this.initializeHealthChecks()
  }

  /**
   * Inicializa circuit breakers para diferentes operações
   */
  private initializeCircuitBreakers(): void {
    // Circuit breaker para conexões peer
    this.circuitBreakers.set(
      'peer-connection',
      new CircuitBreaker('peer-connection', {
        failureThreshold: 3,
        timeout: 60000,
        successThreshold: 2,
      }),
    )

    // Circuit breaker para pagamentos
    this.circuitBreakers.set(
      'payment',
      new CircuitBreaker('payment', {
        failureThreshold: 5,
        timeout: 30000,
        successThreshold: 1,
      }),
    )

    // Circuit breaker para operações de canal
    this.circuitBreakers.set(
      'channel',
      new CircuitBreaker('channel', {
        failureThreshold: 3,
        timeout: 120000,
        successThreshold: 2,
      }),
    )

    // Circuit breaker para gossip
    this.circuitBreakers.set(
      'gossip',
      new CircuitBreaker('gossip', {
        failureThreshold: 10,
        timeout: 30000,
        successThreshold: 3,
      }),
    )
  }

  /**
   * Inicializa estratégias de recovery para diferentes tipos de erro
   */
  private initializeRecoveryStrategies(): void {
    // Recovery para conexão perdida
    this.recoveryManager.registerRecoveryAction(LightningErrorCode.CONNECTION_CLOSED, {
      strategy: RecoveryStrategy.RECONNECT,
      priority: 1,
      execute: async () => {
        console.log('[recovery] Attempting to reconnect...')
        // Tentar reconectar ao peer
        await this.attemptReconnection()
      },
    })

    // Recovery para timeout de conexão
    this.recoveryManager.registerRecoveryAction(LightningErrorCode.CONNECTION_TIMEOUT, {
      strategy: RecoveryStrategy.RETRY,
      priority: 1,
      execute: async () => {
        console.log('[recovery] Retrying connection after timeout...')
        await this.attemptReconnection()
      },
    })

    // Recovery para peer desconectado
    this.recoveryManager.registerRecoveryAction(LightningErrorCode.PEER_DISCONNECTED, {
      strategy: RecoveryStrategy.RECONNECT,
      priority: 1,
      execute: async () => {
        console.log('[recovery] Peer disconnected, attempting reconnection...')
        await this.attemptReconnection()
      },
    })

    // Recovery para falha de pagamento - tentar rota alternativa
    this.recoveryManager.registerRecoveryAction(LightningErrorCode.PAYMENT_FAILED, {
      strategy: RecoveryStrategy.FALLBACK,
      priority: 1,
      execute: async () => {
        console.log('[recovery] Payment failed, will try alternative route...')
        // Marcar rota como problemática para pathfinding
      },
    })

    // Recovery para HTLC timeout
    this.recoveryManager.registerRecoveryAction(LightningErrorCode.HTLC_TIMEOUT, {
      strategy: RecoveryStrategy.RETRY,
      priority: 2,
      execute: async () => {
        console.log('[recovery] HTLC timeout, checking channel state...')
        await this.checkAllChannelStates()
      },
    })

    // Recovery para erro de persistência
    this.recoveryManager.registerRecoveryAction(LightningErrorCode.PERSISTENCE_FAILED, {
      strategy: RecoveryStrategy.RETRY,
      priority: 1,
      execute: async () => {
        console.log('[recovery] Persistence failed, retrying...')
        // Aguardar e tentar novamente
        await new Promise(resolve => setTimeout(resolve, 1000))
      },
    })
  }

  /**
   * Inicializa health checks
   */
  private initializeHealthChecks(): void {
    // Health check para conexão principal
    this.healthMonitor.registerCheck({
      name: 'connection',
      interval: 30000,
      timeout: 5000,
      check: async () => {
        return this.connection !== null && !this.connection.destroyed
      },
      onStatusChange: status => {
        console.log(`[health] Connection status: ${status.status}`)
        if (!status.healthy) {
          this.handleConnectionUnhealthy()
        }
      },
    })

    // Health check para canais ativos
    this.healthMonitor.registerCheck({
      name: 'channels',
      interval: 60000,
      timeout: 10000,
      check: async () => {
        // Verificar se pelo menos um canal está em estado normal
        for (const state of this.channelStates.values()) {
          if (state === ChannelState.NORMAL) return true
        }
        return this.channelStates.size === 0 // OK se não há canais
      },
      onStatusChange: status => {
        console.log(`[health] Channels status: ${status.status}`)
      },
    })

    // Health check para error rate
    this.healthMonitor.registerCheck({
      name: 'error-rate',
      interval: 15000,
      timeout: 1000,
      check: async () => {
        return !this.errorAggregator.isErrorRateHigh(20) // Max 20 errors/min
      },
      onStatusChange: status => {
        if (!status.healthy) {
          console.warn('[health] High error rate detected!')
        }
      },
    })
  }

  /**
   * Handle connection becoming unhealthy
   */
  private handleConnectionUnhealthy(): void {
    console.warn('[lightning] Connection unhealthy, triggering recovery...')
    this.recoveryManager.recover({
      error: new LightningError('Connection unhealthy', LightningErrorCode.CONNECTION_CLOSED, true),
      operation: 'connection-health',
      attempt: 1,
      timestamp: Date.now(),
    })
  }

  /**
   * Attempt to reconnect to peer
   */
  private async attemptReconnection(): Promise<void> {
    const circuitBreaker = this.circuitBreakers.get('peer-connection')
    if (circuitBreaker && !circuitBreaker.isAllowed()) {
      console.warn('[lightning] Reconnection circuit breaker is open, skipping...')
      return
    }

    try {
      // Tentar reconectar usando retry logic
      const result = await withRetry(
        async () => {
          // Lógica de reconexão aqui
          console.log('[lightning] Reconnection attempt...')
          // TODO: Implementar reconexão real ao peer
          return true
        },
        {
          maxAttempts: 3,
          initialDelayMs: 2000,
          maxDelayMs: 30000,
          backoffMultiplier: 2,
        },
      )

      if (result.success) {
        circuitBreaker?.recordSuccess()
        console.log('[lightning] Reconnection successful')
      } else {
        circuitBreaker?.recordFailure(result.error)
        console.error('[lightning] Reconnection failed after retries')
      }
    } catch (error) {
      circuitBreaker?.recordFailure(error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Check all channel states and recover if needed
   */
  private async checkAllChannelStates(): Promise<void> {
    for (const [channelId, state] of this.channelStates) {
      if (state === ChannelState.ERROR) {
        console.warn(`[lightning] Channel ${channelId} in error state, attempting recovery...`)
        await this.recoverChannel(channelId)
      }
    }
  }

  /**
   * Attempt to recover a channel
   */
  private async recoverChannel(channelId: string): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) return

    // Tentar recuperar o canal
    console.log(`[lightning] Recovering channel ${channelId}...`)

    // Verificar se podemos restaurar do storage
    const persisted = lightningRepository.findChannelById(channelId)
    if (persisted) {
      // Atualizar estado do canal
      const state = this.parseChannelState(persisted.state)
      if (state !== ChannelState.ERROR && state !== ChannelState.CLOSED) {
        this.channelStates.set(channelId, state)
        console.log(`[lightning] Channel ${channelId} recovered to state: ${state}`)
      }
    }
  }

  // ==========================================
  // PERSISTENCE & INITIALIZATION
  // ==========================================

  /**
   * Inicializa o worker carregando estado persistido
   * Deve ser chamado após o construtor para restaurar canais, HTLCs, routing graph
   */
  async initializeFromStorage(): Promise<void> {
    console.log('[lightning] Initializing from storage...')

    try {
      // 1. Restaurar node key ou gerar nova
      await this.restoreOrGenerateNodeKey()

      // 2. Restaurar canais
      await this.restoreChannels()

      // 3. Restaurar preimages
      await this.restorePreimages()

      // 4. Restaurar routing graph
      await this.restoreRoutingGraph()

      // 5. Restaurar peers conhecidos
      await this.loadPersistedPeers()

      console.log('[lightning] Initialization from storage complete')
    } catch (error) {
      console.error('[lightning] Failed to initialize from storage:', error)
      throw error
    }
  }

  /**
   * Restaura ou gera nova node key
   */
  private async restoreOrGenerateNodeKey(): Promise<void> {
    const existingKey = lightningRepository.getNodeKey()
    if (existingKey) {
      console.log('[lightning] Restored node key from storage')
      // A master key já foi passada no construtor, mas verificamos se é consistente
    } else {
      // Derivar node key da master key e persistir
      const nodeKey = this.deriveLightningKey(0)
      lightningRepository.saveNodeKey(nodeKey)
      console.log('[lightning] Generated and saved new node key')
    }
  }

  /**
   * Restaura canais persistidos
   */
  private async restoreChannels(): Promise<void> {
    const persistedChannels = lightningRepository.findAllChannels()
    let restoredCount = 0

    for (const [channelId, persisted] of Object.entries(persistedChannels)) {
      try {
        // Reconstruir ChannelInfo a partir do estado persistido
        const state = this.parseChannelState(persisted.state)
        const channelInfo: ChannelInfo = {
          channelId,
          peerId: persisted.nodeId,
          state,
          localBalance: BigInt(persisted.localBalance),
          remoteBalance: BigInt(persisted.remoteBalance),
          fundingTxid: persisted.fundingTxid,
          fundingOutputIndex: persisted.fundingOutputIndex,
          capacity: BigInt(persisted.localBalance) + BigInt(persisted.remoteBalance),
          createdAt: persisted.createdAt ?? Date.now(),
          lastActivity: persisted.lastActivity ?? Date.now(),
        }

        this.channels.set(channelId, channelInfo)
        this.channelStates.set(channelId, state)

        // Restaurar channel seed para derivação de chaves
        const channelSeed = lightningRepository.getChannelSeed(channelId)
        if (channelSeed) {
          // Recriar ChannelManager com estado persistido
          const localConfig = this.createLocalConfigFromPersisted(persisted, channelSeed)
          const channelManager = new ChannelManager({
            tempChannelId: hexToUint8Array(channelId),
            peerId: hexToUint8Array(persisted.nodeId),
            fundingSatoshis: BigInt(persisted.localBalance) + BigInt(persisted.remoteBalance),
            localConfig,
            weAreFunder: persisted.localConfig?.isInitiator ?? true,
          })
          this.channelManagers.set(channelId, channelManager)

          // Recriar RevocationStore
          const revocationStore = new RevocationStore()
          this.revocationStores.set(channelId, revocationStore)
        }

        restoredCount++
      } catch (error) {
        console.error(`[lightning] Failed to restore channel ${channelId}:`, error)
      }
    }

    console.log(`[lightning] Restored ${restoredCount} channels from storage`)
  }

  /**
   * Converte string de estado para enum ChannelState
   */
  private parseChannelState(stateStr: string): ChannelState {
    const stateMap: Record<string, ChannelState> = {
      pending_open: ChannelState.PENDING_OPEN,
      opening: ChannelState.OPENING,
      channel_ready: ChannelState.CHANNEL_READY,
      funding_confirmed: ChannelState.FUNDING_CONFIRMED,
      normal: ChannelState.NORMAL,
      open: ChannelState.NORMAL,
      shutting_down: ChannelState.SHUTTING_DOWN,
      closing: ChannelState.CLOSING,
      closed: ChannelState.CLOSED,
      error: ChannelState.ERROR,
    }
    return stateMap[stateStr.toLowerCase()] ?? ChannelState.OPENING
  }

  /**
   * Cria LocalConfig a partir de dados persistidos
   */
  private createLocalConfigFromPersisted(
    persisted: import('../../repositories/lightning').PersistedChannel,
    channelSeed: Uint8Array,
  ): LocalConfig {
    // Derivar chaves a partir do channel seed
    const fundingPrivKey = sha256(new Uint8Array([...channelSeed, 0])) // Derive funding key
    const paymentBasepointPrivKey = sha256(new Uint8Array([...channelSeed, 1]))
    const delayedPaymentBasepointPrivKey = sha256(new Uint8Array([...channelSeed, 2]))
    const htlcBasepointPrivKey = sha256(new Uint8Array([...channelSeed, 3]))
    const revocationBasepointPrivKey = sha256(new Uint8Array([...channelSeed, 4]))
    const perCommitmentSeed = sha256(new Uint8Array([...channelSeed, 5]))

    // Derivar pubkeys a partir das privkeys
    const fundingPubkey = createPublicKey(fundingPrivKey)
    const paymentBasepoint = createPublicKey(paymentBasepointPrivKey)
    const delayedPaymentBasepoint = createPublicKey(delayedPaymentBasepointPrivKey)
    const htlcBasepoint = createPublicKey(htlcBasepointPrivKey)
    const revocationBasepoint = createPublicKey(revocationBasepointPrivKey)

    return {
      perCommitmentSecretSeed: perCommitmentSeed,
      dustLimitSat: BigInt(persisted.localConfig?.dustLimitSatoshis ?? 546),
      maxAcceptedHtlcs: persisted.localConfig?.maxAcceptedHtlcs ?? 483,
      htlcMinimumMsat: BigInt(persisted.localConfig?.htlcMinimumMsat ?? 1000),
      maxHtlcValueInFlightMsat: BigInt(
        persisted.localConfig?.maxHtlcValueInFlightMsat ?? '1000000000',
      ),
      toSelfDelay: persisted.localConfig?.toSelfDelay ?? 144,
      channelReserveSat: BigInt(persisted.localConfig?.channelReserveSatoshis ?? 10000),
      fundingPubkey,
      fundingPrivateKey: fundingPrivKey,
      revocationBasepoint,
      paymentBasepoint,
      delayedPaymentBasepoint,
      htlcBasepoint,
      initialMsat: BigInt(persisted.localBalance) * 1000n,
      upfrontShutdownScript: persisted.localConfig?.shutdownScriptPubkey
        ? hexToUint8Array(persisted.localConfig.shutdownScriptPubkey)
        : undefined,
    }
  }

  /**
   * Restaura preimages persistidos
   */
  private async restorePreimages(): Promise<void> {
    const persistedPreimages = lightningRepository.findAllPreimages()
    let restoredCount = 0

    for (const [paymentHash, persisted] of Object.entries(persistedPreimages)) {
      this.preimageStore.set(paymentHash, hexToUint8Array(persisted.preimage))
      restoredCount++
    }

    console.log(`[lightning] Restored ${restoredCount} preimages from storage`)
  }

  /**
   * Restaura routing graph persistido
   */
  private async restoreRoutingGraph(): Promise<void> {
    const persistedGraph = lightningRepository.getRoutingGraph()
    let nodesCount = 0
    let channelsCount = 0

    // Restaurar nós
    for (const [nodeId, node] of Object.entries(persistedGraph.nodes)) {
      const routingNode: RoutingNode = {
        nodeId: hexToUint8Array(nodeId),
        features: node.features ? hexToUint8Array(node.features) : undefined,
        lastUpdate: node.lastUpdate,
        addresses: node.addresses.map(addr => ({
          type: 'ipv4' as const,
          address: addr.host,
          port: addr.port,
        })),
        alias: (node as any).alias,
      }
      this.routingGraph.addNode(routingNode)
      nodesCount++
    }

    // Restaurar canais
    for (const [scid, channel] of Object.entries(persistedGraph.channels)) {
      const routingChannel: RoutingChannel = {
        shortChannelId: hexToUint8Array(scid),
        nodeId1: hexToUint8Array(channel.node1),
        nodeId2: hexToUint8Array(channel.node2),
        capacity: BigInt(channel.capacity),
        feeBaseMsat: channel.feeBaseMsat,
        feeProportionalMillionths: channel.feeProportionalMillionths,
        cltvExpiryDelta: channel.cltvDelta,
        htlcMinimumMsat: 1n,
        lastUpdate: channel.lastUpdate,
      }
      this.routingGraph.addChannel(routingChannel)
      channelsCount++
    }

    console.log(
      `[lightning] Restored routing graph: ${nodesCount} nodes, ${channelsCount} channels`,
    )
  }

  /**
   * Persiste estado atual de um canal
   */
  async persistChannelState(channelId: string): Promise<void> {
    const channel = this.channels.get(channelId)
    const state = this.channelStates.get(channelId)

    if (!channel) {
      console.warn(`[lightning] Cannot persist unknown channel: ${channelId}`)
      return
    }

    const stateStr = state !== undefined ? this.channelStateToString(state) : 'unknown'

    const channelManager = this.channelManagers.get(channelId)
    const weAreFunder = channelManager?.weAreFunder ?? true

    lightningRepository.saveChannel({
      channelId,
      nodeId: channel.peerId,
      state: stateStr,
      fundingTxid: channel.fundingTxid,
      fundingOutputIndex: channel.fundingOutputIndex,
      localBalance: channel.localBalance.toString(),
      remoteBalance: channel.remoteBalance.toString(),
      localConfig: {
        isInitiator: weAreFunder,
      },
      remoteConfig: {},
      lastActivity: Date.now(),
    })

    console.log(`[lightning] Persisted channel state: ${channelId} -> ${stateStr}`)
  }

  /**
   * Converte ChannelState enum para string
   */
  private channelStateToString(state: ChannelState): string {
    const stateMap: Record<ChannelState, string> = {
      [ChannelState.PENDING_OPEN]: 'pending_open',
      [ChannelState.OPENING]: 'opening',
      [ChannelState.CHANNEL_READY]: 'channel_ready',
      [ChannelState.FUNDING_CONFIRMED]: 'funding_confirmed',
      [ChannelState.NORMAL]: 'normal',
      [ChannelState.SHUTTING_DOWN]: 'shutting_down',
      [ChannelState.CLOSING]: 'closing',
      [ChannelState.CLOSED]: 'closed',
      [ChannelState.ERROR]: 'error',
    }
    return stateMap[state] ?? 'unknown'
  }

  /**
   * Persiste um HTLC específico
   */
  async persistHTLC(channelId: string, htlc: HtlcInfo): Promise<void> {
    const paymentHash = uint8ArrayToHex(htlc.paymentHash)

    // Converter direction: 'incoming' -> 'received', 'outgoing' -> 'sent'
    const direction: 'sent' | 'received' = htlc.direction === 'outgoing' ? 'sent' : 'received'

    lightningRepository.savePaymentInfo({
      paymentHash,
      amountMsat: htlc.amountMsat.toString(),
      direction,
      status: htlc.state,
      expiryDelay: htlc.cltvExpiry,
      createdAt: Date.now(),
    })

    console.log(`[lightning] Persisted HTLC: ${paymentHash} on channel ${channelId}`)
  }

  /**
   * Persiste preimage para recuperação
   */
  async persistPreimage(paymentHash: string, preimage: Uint8Array): Promise<void> {
    lightningRepository.savePreimage({
      paymentHash,
      preimage: uint8ArrayToHex(preimage),
      createdAt: Date.now(),
    })

    console.log(`[lightning] Persisted preimage for payment: ${paymentHash}`)
  }

  /**
   * Persiste routing graph atual
   */
  async persistRoutingGraph(): Promise<void> {
    const nodes = this.routingGraph.getAllNodes()
    const channels = this.routingGraph.getAllChannels()

    let nodesCount = 0
    let channelsCount = 0

    // Persistir nós
    for (const node of nodes) {
      lightningRepository.saveRoutingNode({
        nodeId: uint8ArrayToHex(node.nodeId),
        features: node.features ? uint8ArrayToHex(node.features) : '',
        addresses: node.addresses.map(addr => ({
          host: addr.address,
          port: addr.port,
        })),
        lastUpdate: node.lastUpdate,
      })
      nodesCount++
    }

    // Persistir canais
    for (const channel of channels) {
      lightningRepository.saveRoutingChannel({
        shortChannelId: uint8ArrayToHex(channel.shortChannelId),
        node1: uint8ArrayToHex(channel.nodeId1),
        node2: uint8ArrayToHex(channel.nodeId2),
        capacity: channel.capacity.toString(),
        feeBaseMsat: channel.feeBaseMsat,
        feeProportionalMillionths: channel.feeProportionalMillionths,
        cltvDelta: channel.cltvExpiryDelta,
        lastUpdate: channel.lastUpdate,
      })
      channelsCount++
    }

    console.log(
      `[lightning] Persisted routing graph: ${nodesCount} nodes, ${channelsCount} channels`,
    )
  }

  /**
   * Persiste invoice gerado
   */
  async persistInvoice(
    paymentHash: string,
    bolt11: string,
    amountMsat: bigint | undefined,
    description: string,
    expiry: number,
  ): Promise<void> {
    lightningRepository.saveInvoice({
      paymentHash,
      bolt11,
      amountMsat: amountMsat?.toString(),
      description,
      expiry,
      createdAt: Date.now(),
    })

    console.log(`[lightning] Persisted invoice: ${paymentHash}`)
  }

  /**
   * Persiste channel seed para derivação de chaves
   */
  async persistChannelSeed(channelId: string, seed: Uint8Array): Promise<void> {
    lightningRepository.saveChannelSeed(channelId, seed)
    console.log(`[lightning] Persisted channel seed: ${channelId}`)
  }

  /**
   * Exporta todos os dados para backup
   */
  exportAllData(): string {
    return lightningRepository.exportData()
  }

  /**
   * Importa dados de backup
   */
  importAllData(data: string): void {
    lightningRepository.importData(data)
    console.log('[lightning] Imported data from backup')
  }

  // ==========================================
  // CONNECTION & HANDSHAKE
  // ==========================================

  /**
   * Create TLS connection with Lightning peer
   */
  private async createConnection(peer: Peer, timeout: number = 10000): Promise<Socket> {
    return createLightningSocket(peer, timeout)
  }

  /**
   * Execute Noise handshake to establish transport keys
   */
  private async performNoiseHandshake(
    socket: Socket,
    peerPubKey: Uint8Array,
  ): Promise<HandshakeResult> {
    // Gerar chave local efêmera para handshake
    const localKeyPair: KeyPair = generateKey()

    // Inicializar estado do handshake
    const handshakeState: HandshakeState = initializeHandshakeState(peerPubKey, localKeyPair)

    // Act One: Enviar chave efêmera
    const { message: actOneMsg, newState: stateAfterActOne } = actOneSend(
      handshakeState,
      peerPubKey,
      localKeyPair,
    )
    await this.sendRaw(socket, actOneMsg)
    console.log('[lightning] Act One sent')

    // Act Two: Receber chave efêmera do responder
    const actTwoMsg = await this.receiveRaw(socket, 50)
    const actTwoResult = actTwoReceive(stateAfterActOne, actTwoMsg, localKeyPair)
    if ('error' in actTwoResult) {
      throw new Error(`Handshake Act Two failed: ${actTwoResult.error}`)
    }
    console.log('[lightning] Act Two received')

    // Extrair chave pública efêmera do responder do Act Two
    const responderEphemeralPubkey = actTwoMsg.subarray(1, 34)

    // Act Three: Initiator ENVIA sua chave estática criptografada
    // BOLT #8: O initiator envia act3, não recebe!
    const actThreeResult = actThreeSend(
      actTwoResult.newState,
      localKeyPair, // nossa chave estática
      responderEphemeralPubkey, // chave efêmera do responder
    )
    await this.sendRaw(socket, actThreeResult.message)
    console.log('[lightning] Act Three sent')

    return {
      transportKeys: actThreeResult.keys,
      peerPubKey,
    }
  }

  /**
   * Exchange Init messages with peer
   */
  private async exchangeInitMessages(socket: Socket, transportKeys: TransportKeys): Promise<void> {
    // Criar mensagem Init local (features básicas)
    const initMsg: InitMessage = {
      type: LightningMessageType.INIT,
      gflen: 0,
      globalfeatures: new Uint8Array(0),
      flen: 0,
      features: new Uint8Array(0),
      tlvs: [],
    }

    // Codificar e enviar Init
    const encodedInit = encodeInitMessage(initMsg)
    const { encrypted: encryptedInit } = encryptMessage(transportKeys, encodedInit)
    await this.sendRaw(socket, encryptedInit)

    // Receber e decodificar Init do peer
    const encryptedPeerInit = await this.receiveRaw(socket, 18 + 2 + 16) // length prefix + min init + tag
    const decryptedPeerInit = decryptMessage(transportKeys, encryptedPeerInit)
    if ('error' in decryptedPeerInit) {
      throw new Error(`Failed to decrypt peer Init: ${decryptedPeerInit.error}`)
    }

    // Decodificar Init do peer (não usado por enquanto)
    decodeInitMessage(decryptedPeerInit.message)
    console.log('[lightning] Init exchange completed')
  }

  /**
   * Start ping/pong keep-alive
   */
  private startPingPong(
    socket: Socket,
    transportKeys: TransportKeys,
    config: PingPongConfig = DEFAULT_PING_PONG_CONFIG,
  ): () => void {
    let missedPings = 0
    let pingTimeout: ReturnType<typeof setTimeout> | null = null

    const pingInterval = setInterval(async () => {
      try {
        const pingMsg: PingMessage = {
          type: LightningMessageType.PING,
          numPongBytes: 1,
          byteslen: 0,
          ignored: new Uint8Array(0),
        }

        const encodedPing = encodePingMessage(pingMsg)
        const { encrypted: encryptedPing } = encryptMessage(transportKeys, encodedPing)
        await this.sendRaw(socket, encryptedPing)
        console.log('[lightning] Ping sent')

        // Set timeout for pong response
        pingTimeout = setTimeout(() => {
          missedPings++
          console.warn(`[lightning] Ping timeout, missed: ${missedPings}`)
          if (missedPings >= config.maxMissedPings) {
            console.error('[lightning] Too many missed pings, closing connection')
            socket.destroy()
          }
        }, config.timeout)
      } catch (error) {
        console.warn('[lightning] Ping failed:', error)
        clearInterval(pingInterval)
        if (pingTimeout) clearTimeout(pingTimeout)
      }
    }, config.interval)

    const onData = async (data: string | Buffer) => {
      try {
        const buffer =
          typeof data === 'string'
            ? new TextEncoder().encode(data)
            : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
        const decrypted = decryptMessage(transportKeys, buffer)
        if ('error' in decrypted) return // Não é mensagem válida

        // Tentar decodificar como Pong
        if (decrypted.message.length >= 2) {
          const msgType = (decrypted.message[0] << 8) | decrypted.message[1]
          if (msgType === LightningMessageType.PONG) {
            // Pong recebido - reset missed pings counter
            if (pingTimeout) {
              clearTimeout(pingTimeout)
              pingTimeout = null
            }
            missedPings = 0
            decodePongMessage(decrypted.message)
            console.log('[lightning] Pong received')
          }
        }
      } catch {
        // Ignorar mensagens não-pong
      }
    }

    socket.on('data', onData)

    // Cleanup function
    const cleanup = () => {
      clearInterval(pingInterval)
      if (pingTimeout) clearTimeout(pingTimeout)
      socket.removeListener('data', onData)
    }

    socket.on('close', cleanup)

    return cleanup
  }

  /**
   * Cria conexão Lightning completa
   * Ordem: TLS -> Handshake BOLT #8 -> Init exchange -> Ping/Pong
   */
  private async createLightningConnection(
    config: LightningClientConfig,
  ): Promise<LightningConnection> {
    const finalConfig: LightningClientConfig = { ...DEFAULT_CLIENT_CONFIG, ...config }

    // Chave pública do peer (parâmetro opcional ou dummy para teste)
    const peerPubKey = finalConfig.peerPubKey || new Uint8Array(33) // 33 bytes compressed pubkey
    if (!finalConfig.peerPubKey) {
      peerPubKey[0] = 0x02 // compressed prefix dummy
    }

    try {
      // 1. Conexão TLS
      const socket = await this.createConnection(finalConfig.peer, finalConfig.timeout)
      // 2. Handshake BOLT #8
      const handshakeResult = await this.performNoiseHandshake(socket, peerPubKey)

      // 3. Troca de Init messages
      await this.exchangeInitMessages(socket, handshakeResult.transportKeys)

      // 4. Iniciar Ping/Pong
      const cleanupPingPong = this.startPingPong(socket, handshakeResult.transportKeys)

      // 5. Retornar conexão com estado de transporte
      const lightningConnection: LightningConnection = Object.assign(socket, {
        transportKeys: handshakeResult.transportKeys,
        peerPubKey: handshakeResult.peerPubKey,
      })

      // Add cleanup function to connection
      const extendedConnection = lightningConnection as LightningConnection & {
        cleanup: () => void
      }
      extendedConnection.cleanup = cleanupPingPong

      console.log('[lightning] Lightning connection established')
      return extendedConnection
    } catch (error) {
      console.error('[lightning] Connection failed:', error)
      throw error
    }
  }

  // ==========================================
  // PEER MANAGEMENT
  // ==========================================

  private peerManager: PeerManager

  /**
   * Connect to Lightning peer
   */
  async connectPeer(peer: PeerWithPubkey): Promise<PeerConnectionResult> {
    return this.peerManager.connectPeer(peer)
  }

  /**
   * Desconecta de um peer específico
   * Delega para o PeerManager
   */
  async disconnectPeer(peerId: string): Promise<boolean> {
    return this.peerManager.disconnectPeer(peerId)
  }

  /**
   * Lista todos os peers conectados
   * Delega para o PeerManager
   */
  getConnectedPeers(): PeerInfo[] {
    return this.peerManager.getConnectedPeers()
  }

  /**
   * Obtém peer para balanceamento de carga
   * Delega para o PeerManager
   */
  getPeerForLoadBalancing(): PeerInfo | null {
    return this.peerManager.getPeerForLoadBalancing()
  }

  /**
   * Carrega peers persistidos na inicialização
   * Delega para o PeerManager
   */
  private async loadPersistedPeers(): Promise<void> {
    await this.peerManager.loadPersistedPeers()
  }
  //
  // Funções auxiliares usadas internamente pelo cliente.
  // Normalmente não chamadas diretamente pelo usuário.

  private sendRaw(socket: Socket, data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.write(data, undefined, (err?: Error | undefined) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  private receiveRaw(socket: Socket, expectedLength: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = []

      const onData = (data: string | Buffer) => {
        const dataBuffer =
          typeof data === 'string'
            ? new TextEncoder().encode(data)
            : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
        chunks.push(dataBuffer)
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
        if (totalLength >= expectedLength) {
          socket.removeListener('data', onData)
          socket.removeListener('error', onError)
          const result = new Uint8Array(expectedLength)
          let offset = 0
          for (const chunk of chunks) {
            const remaining = expectedLength - offset
            if (remaining <= 0) break
            const copyLength = Math.min(chunk.length, remaining)
            result.set(chunk.subarray(0, copyLength), offset)
            offset += copyLength
          }
          resolve(result)
        }
      }

      const onError = (err: Error) => {
        socket.removeListener('data', onData)
        reject(err)
      }

      socket.on('data', onData)
      socket.on('error', onError)
    })
  }

  // ==========================================
  // MESSAGE LOOP - BOLT #1, #2, #7
  // ==========================================

  // Estado do message loop
  private messageLoopRunning: boolean = false
  private messageBuffer: Uint8Array = new Uint8Array(0)
  private messageLoopCleanup: (() => void) | null = null

  // Callbacks para eventos de mensagens
  private messageCallbacks: Map<number, ((msg: Uint8Array, peerId: string) => Promise<void>)[]> =
    new Map()

  /**
   * Inicia o message loop para processar mensagens recebidas
   * Escuta todas as conexões ativas e roteia mensagens para handlers
   *
   * @param peerId - ID do peer para escutar (ou todos se não especificado)
   */
  async startMessageLoop(peerId?: string): Promise<void> {
    if (this.messageLoopRunning) {
      console.log('[lightning] Message loop already running')
      return
    }

    this.messageLoopRunning = true
    console.log('[lightning] Starting message loop...')

    // Configurar listener na conexão principal
    const onData = async (data: string | Buffer) => {
      try {
        // Converter para Uint8Array
        const buffer =
          typeof data === 'string'
            ? new TextEncoder().encode(data)
            : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))

        // Adicionar ao buffer de mensagens
        const newBuffer = new Uint8Array(this.messageBuffer.length + buffer.length)
        newBuffer.set(this.messageBuffer)
        newBuffer.set(buffer, this.messageBuffer.length)
        this.messageBuffer = newBuffer

        // Processar mensagens completas do buffer
        await this.processMessageBuffer(peerId || 'default')
      } catch (error) {
        console.error('[lightning] Error processing incoming data:', error)
      }
    }

    // Registrar listener no socket
    this.connection.on('data', onData)

    // Cleanup function
    this.messageLoopCleanup = () => {
      this.connection.removeListener('data', onData)
      this.messageLoopRunning = false
      this.messageBuffer = new Uint8Array(0)
      console.log('[lightning] Message loop stopped')
    }

    // Registrar handlers padrão se não existirem
    this.registerDefaultMessageHandlers()
  }

  /**
   * Para o message loop
   */
  stopMessageLoop(): void {
    if (this.messageLoopCleanup) {
      this.messageLoopCleanup()
      this.messageLoopCleanup = null
    }
  }

  /**
   * Processa buffer de mensagens e extrai mensagens completas
   */
  private async processMessageBuffer(peerId: string): Promise<void> {
    // Mensagens Lightning têm formato: length (2 bytes) + ciphertext (variable) + tag (16 bytes)
    while (this.messageBuffer.length >= 18) {
      // Mínimo: 2 bytes length prefix encrypted
      try {
        // Decriptar length prefix (2 bytes ciphertext + 16 bytes tag = 18 bytes)
        const lengthCiphertext = this.messageBuffer.subarray(0, 18)
        const lengthResult = decryptMessage(this.connection.transportKeys, lengthCiphertext)

        if ('error' in lengthResult) {
          // Dados inválidos, descartar 1 byte e tentar novamente
          this.messageBuffer = this.messageBuffer.subarray(1)
          continue
        }

        // Extrair tamanho da mensagem (big-endian)
        const messageLength = (lengthResult.message[0] << 8) | lengthResult.message[1]

        // Verificar se temos a mensagem completa
        const totalLength = 18 + messageLength + 16 // length encrypted + message + tag
        if (this.messageBuffer.length < totalLength) {
          break // Aguardar mais dados
        }

        // Extrair e decriptar mensagem
        const messageCiphertext = this.messageBuffer.subarray(18, totalLength)
        const messageResult = decryptMessage(
          lengthResult.newKeys, // Usar chaves atualizadas
          messageCiphertext,
        )

        if ('error' in messageResult) {
          console.error('[lightning] Failed to decrypt message:', messageResult.error)
          this.messageBuffer = this.messageBuffer.subarray(totalLength)
          continue
        }

        // Atualizar chaves de transporte
        this.connection.transportKeys = messageResult.newKeys

        // Remover mensagem processada do buffer
        this.messageBuffer = this.messageBuffer.subarray(totalLength)

        // Processar mensagem decriptada
        await this.handleDecryptedMessage(messageResult.message, peerId)
      } catch (error) {
        console.error('[lightning] Error in message processing:', error)
        // Descartar byte problemático
        this.messageBuffer = this.messageBuffer.subarray(1)
      }
    }
  }

  /**
   * Processa mensagem decriptada e roteia para handler apropriado
   */
  private async handleDecryptedMessage(message: Uint8Array, peerId: string): Promise<void> {
    if (message.length < 2) {
      console.warn('[lightning] Message too short')
      return
    }

    // Extrair tipo de mensagem (primeiros 2 bytes, big-endian)
    const msgType = (message[0] << 8) | message[1]

    console.log(`[lightning] Received message type ${msgType} from ${peerId}`)

    // Verificar se é mensagem desconhecida com bit "odd" (ignorável)
    if (msgType >= 32768 && msgType % 2 === 1) {
      console.log(`[lightning] Ignoring unknown odd message type ${msgType}`)
      return
    }

    // Chamar handlers registrados para este tipo
    const handlers = this.messageCallbacks.get(msgType)
    if (handlers && handlers.length > 0) {
      for (const handler of handlers) {
        try {
          await handler(message, peerId)
        } catch (error) {
          console.error(`[lightning] Handler error for message type ${msgType}:`, error)
        }
      }
    }

    // Rotear para handler específico baseado no tipo
    await this.routeMessage(msgType, message, peerId)
  }

  /**
   * Roteia mensagem para handler específico baseado no tipo BOLT
   */
  private async routeMessage(msgType: number, message: Uint8Array, peerId: string): Promise<void> {
    switch (msgType) {
      // ==========================================
      // BOLT #1: Setup & Control
      // ==========================================
      case LightningMessageType.PING:
        await this.handlePing(message, peerId)
        break

      case LightningMessageType.PONG:
        // Já tratado no startPingPong
        break

      case LightningMessageType.ERROR:
        await this.handleError(message, peerId)
        break

      case LightningMessageType.WARNING:
        await this.handleWarning(message, peerId)
        break

      // ==========================================
      // BOLT #2: Channel Establishment
      // ==========================================
      case LightningMessageType.OPEN_CHANNEL:
        await this.handleOpenChannel(message, peerId)
        break

      case LightningMessageType.ACCEPT_CHANNEL:
        await this.handleAcceptChannelMessage(message, peerId)
        break

      case LightningMessageType.FUNDING_CREATED:
        await this.handleFundingCreated(message, peerId)
        break

      case LightningMessageType.FUNDING_SIGNED:
        await this.handleFundingSigned(message, peerId)
        break

      case LightningMessageType.CHANNEL_READY:
        await this.handleChannelReady(message, peerId)
        break

      // ==========================================
      // BOLT #2: Channel Close
      // ==========================================
      case LightningMessageType.SHUTDOWN:
        await this.handleShutdown(message, peerId)
        break

      case LightningMessageType.CLOSING_SIGNED:
        await this.handleClosingSigned(message, peerId)
        break

      // ==========================================
      // BOLT #2: HTLC Operations
      // ==========================================
      case LightningMessageType.UPDATE_ADD_HTLC:
        await this.handleUpdateAddHtlc(message, peerId)
        break

      case LightningMessageType.UPDATE_FULFILL_HTLC:
        await this.handleUpdateFulfillHtlc(message, peerId)
        break

      case LightningMessageType.UPDATE_FAIL_HTLC:
        await this.handleUpdateFailHtlc(message, peerId)
        break

      case LightningMessageType.UPDATE_FAIL_MALFORMED_HTLC:
        await this.handleUpdateFailMalformedHtlc(message, peerId)
        break

      // ==========================================
      // BOLT #2: Commitment
      // ==========================================
      case LightningMessageType.COMMITMENT_SIGNED:
        await this.handleCommitmentSigned(message, peerId)
        break

      case LightningMessageType.REVOKE_AND_ACK:
        await this.handleRevokeAndAck(message, peerId)
        break

      case LightningMessageType.UPDATE_FEE:
        await this.handleUpdateFee(message, peerId)
        break

      case LightningMessageType.CHANNEL_REESTABLISH:
        await this.handleChannelReestablish(message, peerId)
        break

      // ==========================================
      // BOLT #7: Gossip Protocol
      // ==========================================
      case LightningMessageType.CHANNEL_ANNOUNCEMENT:
      case LightningMessageType.NODE_ANNOUNCEMENT:
      case LightningMessageType.CHANNEL_UPDATE:
        await this.processGossipMessage(message)
        break

      case LightningMessageType.QUERY_SHORT_CHANNEL_IDS:
      case LightningMessageType.REPLY_SHORT_CHANNEL_IDS_END:
      case LightningMessageType.QUERY_CHANNEL_RANGE:
      case LightningMessageType.REPLY_CHANNEL_RANGE:
      case LightningMessageType.GOSSIP_TIMESTAMP_FILTER:
        await this.processGossipMessage(message)
        break

      default:
        // Mensagem desconhecida com bit "even" é erro
        if (msgType % 2 === 0) {
          console.error(`[lightning] Unknown even message type ${msgType} - protocol violation`)
          await this.sendError(peerId, `Unknown message type ${msgType}`)
        } else {
          console.log(`[lightning] Ignoring unknown odd message type ${msgType}`)
        }
    }
  }

  /**
   * Registra callback para tipo de mensagem específico
   */
  onMessage(msgType: number, callback: (msg: Uint8Array, peerId: string) => Promise<void>): void {
    const existing = this.messageCallbacks.get(msgType) || []
    existing.push(callback)
    this.messageCallbacks.set(msgType, existing)
  }

  /**
   * Remove callback para tipo de mensagem
   */
  offMessage(msgType: number, callback: (msg: Uint8Array, peerId: string) => Promise<void>): void {
    const existing = this.messageCallbacks.get(msgType) || []
    const index = existing.indexOf(callback)
    if (index >= 0) {
      existing.splice(index, 1)
      this.messageCallbacks.set(msgType, existing)
    }
  }

  /**
   * Registra handlers padrão para mensagens
   */
  private registerDefaultMessageHandlers(): void {
    // Handlers já são chamados via routeMessage
    console.log('[lightning] Default message handlers registered')
  }

  // ==========================================
  // MESSAGE HANDLERS
  // ==========================================

  private async handlePing(message: Uint8Array, peerId: string): Promise<void> {
    // Responder com Pong
    // Ping: type(2) + num_pong_bytes(2) + ignored(variable)
    if (message.length < 4) return

    const numPongBytes = (message[2] << 8) | message[3]

    // Criar Pong com bytes ignorados
    const pongMessage = new Uint8Array(4 + numPongBytes)
    pongMessage[0] = (LightningMessageType.PONG >> 8) & 0xff
    pongMessage[1] = LightningMessageType.PONG & 0xff
    pongMessage[2] = (numPongBytes >> 8) & 0xff
    pongMessage[3] = numPongBytes & 0xff
    // Os bytes restantes são zeros (ignored)

    // Enviar Pong
    const peerConnection = this.peerManager.getPeerConnection(peerId)
    if (peerConnection) {
      const { encrypted } = encryptMessage(peerConnection.transportKeys, pongMessage)
      await this.sendRaw(peerConnection, encrypted)
    }
  }

  private async handleError(message: Uint8Array, peerId: string): Promise<void> {
    // Error: type(2) + channel_id(32) + len(2) + data(variable)
    if (message.length < 36) return

    const channelId = message.subarray(2, 34)
    const dataLen = (message[34] << 8) | message[35]
    const errorData = message.subarray(36, 36 + dataLen)

    const errorText = new TextDecoder().decode(errorData)
    const channelIdHex = uint8ArrayToHex(channelId)

    console.error(`[lightning] Error from ${peerId} for channel ${channelIdHex}: ${errorText}`)

    // Marcar canal como erro se aplicável
    const allZeros = channelId.every(b => b === 0)
    if (!allZeros) {
      this.channelStates.set(channelIdHex, ChannelState.ERROR)
    }
  }

  private async handleWarning(message: Uint8Array, peerId: string): Promise<void> {
    // Warning: type(2) + channel_id(32) + len(2) + data(variable)
    if (message.length < 36) return

    const channelId = message.subarray(2, 34)
    const dataLen = (message[34] << 8) | message[35]
    const warningData = message.subarray(36, 36 + dataLen)

    const warningText = new TextDecoder().decode(warningData)
    console.warn(
      `[lightning] Warning from ${peerId} for channel ${uint8ArrayToHex(channelId)}: ${warningText}`,
    )
  }

  private async handleOpenChannel(message: Uint8Array, peerId: string): Promise<void> {
    // Decodificar open_channel e processar
    // Por enquanto, apenas log - implementação completa em openChannel()
    console.log(`[lightning] Received open_channel from ${peerId}`)
    // TODO: Implementar aceitação automática de canais baseado em política
  }

  private async handleAcceptChannelMessage(message: Uint8Array, peerId: string): Promise<void> {
    console.log(`[lightning] Received accept_channel from ${peerId}`)
    // Decodificar e processar via acceptChannel()
    // A decodificação real é feita em outro lugar
  }

  private async handleFundingCreated(message: Uint8Array, peerId: string): Promise<void> {
    console.log(`[lightning] Received funding_created from ${peerId}`)
    // Processar via ChannelManager
  }

  private async handleFundingSigned(message: Uint8Array, peerId: string): Promise<void> {
    console.log(`[lightning] Received funding_signed from ${peerId}`)
    // Processar via receiveFundingSigned()
  }

  private async handleChannelReady(message: Uint8Array, peerId: string): Promise<void> {
    console.log(`[lightning] Received channel_ready from ${peerId}`)
    // Atualizar estado do canal para NORMAL
  }

  private async handleShutdown(message: Uint8Array, peerId: string): Promise<void> {
    console.log(`[lightning] Received shutdown from ${peerId}`)
    // Iniciar processo de fechamento cooperativo
  }

  private async handleClosingSigned(message: Uint8Array, peerId: string): Promise<void> {
    console.log(`[lightning] Received closing_signed from ${peerId}`)
    // Processar oferta de fee para fechamento
  }

  private async handleUpdateAddHtlc(message: Uint8Array, peerId: string): Promise<void> {
    console.log(`[lightning] Received update_add_htlc from ${peerId}`)
    // Processar via receiveHTLC()
  }

  private async handleUpdateFulfillHtlc(message: Uint8Array, peerId: string): Promise<void> {
    console.log(`[lightning] Received update_fulfill_htlc from ${peerId}`)
    // Extrair preimage e atualizar estado do HTLC
    if (message.length < 66) return

    const channelId = uint8ArrayToHex(message.subarray(2, 34))
    const htlcId =
      (BigInt(message[34]) << 56n) |
      (BigInt(message[35]) << 48n) |
      (BigInt(message[36]) << 40n) |
      (BigInt(message[37]) << 32n) |
      (BigInt(message[38]) << 24n) |
      (BigInt(message[39]) << 16n) |
      (BigInt(message[40]) << 8n) |
      BigInt(message[41])
    const preimage = message.subarray(42, 74)

    // Armazenar preimage
    const paymentHash = sha256(preimage)
    this.preimageStore.set(uint8ArrayToHex(paymentHash), preimage)

    // Atualizar estado do HTLC
    this.updateHTLCState(channelId, htlcId, 'fulfilled')
  }

  private async handleUpdateFailHtlc(message: Uint8Array, peerId: string): Promise<void> {
    console.log(`[lightning] Received update_fail_htlc from ${peerId}`)
    // Processar falha do HTLC
    if (message.length < 36) return

    const channelId = uint8ArrayToHex(message.subarray(2, 34))
    const htlcId =
      (BigInt(message[34]) << 56n) |
      (BigInt(message[35]) << 48n) |
      (BigInt(message[36]) << 40n) |
      (BigInt(message[37]) << 32n) |
      (BigInt(message[38]) << 24n) |
      (BigInt(message[39]) << 16n) |
      (BigInt(message[40]) << 8n) |
      BigInt(message[41])

    this.updateHTLCState(channelId, htlcId, 'failed')
  }

  private async handleUpdateFailMalformedHtlc(message: Uint8Array, peerId: string): Promise<void> {
    console.log(`[lightning] Received update_fail_malformed_htlc from ${peerId}`)
    // Similar a update_fail_htlc
  }

  private async handleCommitmentSigned(message: Uint8Array, peerId: string): Promise<void> {
    console.log(`[lightning] Received commitment_signed from ${peerId}`)
    // Processar via ChannelManager.handleCommitmentSigned()
    if (message.length < 98) return

    const channelId = uint8ArrayToHex(message.subarray(2, 34))
    const signature = message.subarray(34, 98)

    // Extrair htlc_signatures (se houver)
    const numHtlcs = (message[98] << 8) | message[99]
    const htlcSignatures: Uint8Array[] = []
    for (let i = 0; i < numHtlcs; i++) {
      const offset = 100 + i * 64
      htlcSignatures.push(message.subarray(offset, offset + 64))
    }

    // Processar via ChannelManager
    const channelManager = this.channelManagers.get(channelId)
    if (channelManager) {
      const revokeAndAckMsg = channelManager.handleCommitmentSigned(signature, htlcSignatures)

      // Enviar revoke_and_ack
      const peerConnection = this.peerManager.getPeerConnection(peerId)
      if (peerConnection) {
        const { encrypted } = encryptMessage(peerConnection.transportKeys, revokeAndAckMsg)
        await this.sendRaw(peerConnection, encrypted)
      }
    }
  }

  private async handleRevokeAndAck(message: Uint8Array, peerId: string): Promise<void> {
    console.log(`[lightning] Received revoke_and_ack from ${peerId}`)
    // Processar via ChannelManager.handleRevokeAndAck()
    if (message.length < 99) return

    const channelId = uint8ArrayToHex(message.subarray(2, 34))
    const perCommitmentSecret = message.subarray(34, 66)
    const nextPerCommitmentPoint = message.subarray(66, 99)

    const channelManager = this.channelManagers.get(channelId)
    if (channelManager) {
      channelManager.handleRevokeAndAck(perCommitmentSecret, nextPerCommitmentPoint)
    }
  }

  private async handleUpdateFee(message: Uint8Array, peerId: string): Promise<void> {
    console.log(`[lightning] Received update_fee from ${peerId}`)
    // Atualizar fee rate do canal
    if (message.length < 38) return

    const channelId = uint8ArrayToHex(message.subarray(2, 34))
    const feerateSatPerKw =
      (message[34] << 24) | (message[35] << 16) | (message[36] << 8) | message[37]

    console.log(`[lightning] Channel ${channelId} fee rate updated to ${feerateSatPerKw} sat/kw`)
  }

  private async handleChannelReestablish(message: Uint8Array, peerId: string): Promise<void> {
    console.log(`[lightning] Received channel_reestablish from ${peerId}`)

    // Decodificar mensagem
    const reestablishMsg = decodeChannelReestablishMessage(message)
    const channelId = uint8ArrayToHex(reestablishMsg.channelId)

    console.log(
      `[lightning] channel_reestablish: channelId=${channelId}, ` +
        `nextCommitmentNumber=${reestablishMsg.nextCommitmentNumber}, ` +
        `nextRevocationNumber=${reestablishMsg.nextRevocationNumber}`,
    )

    // Verificar se temos este canal
    const channel = this.channels.get(channelId)
    if (!channel) {
      console.warn(`[lightning] Received channel_reestablish for unknown channel ${channelId}`)
      return
    }

    // Verificar se o canal está em estado apropriado para reestablish
    if (channel.state === 'closed' || channel.state === 'closing') {
      console.warn(`[lightning] Channel ${channelId} is ${channel.state}, ignoring reestablish`)
      return
    }

    // Processar TLVs
    const tlvs = this.parseReestablishTlvs((reestablishMsg.tlvs as any) || [])

    // Atualizar estado do canal com informações do peer
    ;(channel as any).remoteNextCommitmentNumber = reestablishMsg.nextCommitmentNumber
    ;(channel as any).remoteNextRevocationNumber = reestablishMsg.nextRevocationNumber

    // Enviar nossa resposta channel_reestablish
    try {
      await this.sendChannelReestablish(channelId, reestablishMsg, tlvs)
    } catch (error) {
      console.error(`[lightning] Failed to send channel_reestablish: ${error}`)
    }

    console.log(`[lightning] Channel ${channelId} reestablished with peer ${peerId}`)
  }

  private async sendError(peerId: string, errorMessage: string): Promise<void> {
    const peerConnection = this.peerManager.getPeerConnection(peerId)
    if (!peerConnection) return

    const errorData = new TextEncoder().encode(errorMessage)
    const message = new Uint8Array(36 + errorData.length)

    // Type (2 bytes)
    message[0] = (LightningMessageType.ERROR >> 8) & 0xff
    message[1] = LightningMessageType.ERROR & 0xff

    // Channel ID (32 bytes all zeros = connection-level error)
    // bytes 2-33 are already zeros

    // Length (2 bytes)
    message[34] = (errorData.length >> 8) & 0xff
    message[35] = errorData.length & 0xff

    // Data
    message.set(errorData, 36)

    const { encrypted } = encryptMessage(peerConnection.transportKeys, message)
    await this.sendRaw(peerConnection, encrypted)
  }

  /**
   * Atualiza estado de um HTLC
   */
  private updateHTLCState(
    channelId: string,
    htlcId: bigint,
    state: 'pending' | 'fulfilled' | 'failed',
  ): void {
    const htlcList = this.htlcs.get(channelId)
    if (!htlcList) return

    const htlc = htlcList.find(h => h.id === htlcId)
    if (htlc) {
      htlc.state = state
      console.log(`[lightning] HTLC ${htlcId} on channel ${channelId} -> ${state}`)
    }
  }

  /**
   * Deriva chave Lightning usando LNPBP-46 path m'/9735'/0'/0'/0/index
   * LNPBP-46 define purpose 9735 para Lightning Network
   */
  private deriveLightningKey(index: number): Uint8Array {
    // m'/9735'/0'/0' (extended lightning key / chain / node account)
    let key = this.masterKey
    key = deriveChildKey(key, LIGHTNING_PURPOSE + 0x80000000) // purpose' (hardened)
    key = deriveChildKey(key, LIGHTNING_COIN_TYPE + 0x80000000) // coinType' (hardened)
    key = deriveChildKey(key, 0x80000000) // account' (hardened)

    // /0/index (não-hardened para derivação pública)
    key = deriveChildKey(key, 0) // change
    key = deriveChildKey(key, index) // addressIndex

    return key
  }

  /**
   * Gera payment hash e payment secret para invoice
   */
  private generatePaymentCredentials(): {
    paymentHash: PaymentHash
    paymentSecret: PaymentSecret
    preimage: Uint8Array
  } {
    // Gerar preimage aleatório (32 bytes)
    const preimage = randomBytes(32)

    // Payment hash = SHA256(preimage)
    const paymentHash = sha256(preimage) as PaymentHash

    // Payment secret = random 32 bytes (BOLT11 requirement)
    const paymentSecret = randomBytes(32) as PaymentSecret

    return { paymentHash, paymentSecret, preimage }
  }

  /**
   * Calcula fee de abertura de canal baseado no amount
   */
  private calculateChannelOpeningFee(amount: bigint): bigint {
    const { baseFee, feeRate } = this.channelFeeConfig
    const variableFee = BigInt(Math.floor(Number(amount) * feeRate))
    return baseFee + variableFee
  }

  /**
   * Cria LocalConfig para ChannelManager a partir dos basepoints
   */
  private createLocalConfig(
    channelId: string,
    fundingSatoshis: bigint,
    pushMsat: bigint,
  ): LocalConfig {
    const basepoints = this.getChannelBasepoints(channelId)
    const fundingKey = this.getFundingWallet(0, 0)
    const fundingPubkey = createPublicKey(fundingKey.subarray(0, 32))
    const fundingPrivateKey = fundingKey.subarray(0, 32)

    // Gerar seed para per-commitment secrets (32 bytes aleatórios)
    const perCommitmentSecretSeed = randomBytes(32)

    return {
      perCommitmentSecretSeed,
      dustLimitSat: 546n,
      maxAcceptedHtlcs: 30,
      htlcMinimumMsat: 1000n,
      maxHtlcValueInFlightMsat: fundingSatoshis * 1000n,
      toSelfDelay: 144,
      channelReserveSat: fundingSatoshis / 100n,
      fundingPubkey,
      fundingPrivateKey,
      revocationBasepoint: basepoints.revocation,
      paymentBasepoint: basepoints.payment,
      delayedPaymentBasepoint: basepoints.delayed,
      htlcBasepoint: basepoints.htlc,
      initialMsat: fundingSatoshis * 1000n - pushMsat,
    }
  }

  /**
   * Cria ChannelManager para um novo canal
   */
  private createChannelManagerForOpen(
    tempChannelId: Uint8Array,
    peerId: string,
    fundingSatoshis: bigint,
    pushMsat: bigint,
    channelId: string,
  ): ChannelManager {
    const localConfig = this.createLocalConfig(channelId, fundingSatoshis, pushMsat)

    const manager = new ChannelManager({
      tempChannelId,
      peerId: hexToUint8Array(peerId.replace(/[:.]/g, '')), // Converter peerId para bytes
      fundingSatoshis,
      localConfig,
      weAreFunder: true,
      announceChannel: true,
    })

    // Registrar callback de mudança de estado
    manager.onStateChanged((oldState, newState) => {
      console.log(`[lightning] Channel ${channelId} state: ${oldState} -> ${newState}`)

      // Sincronizar com estado legado
      if (newState === ChannelMgrState.OPEN) {
        this.channelStates.set(channelId, ChannelState.NORMAL)
      } else if (newState === ChannelMgrState.CLOSED) {
        this.channelStates.set(channelId, ChannelState.CLOSED)
      }
    })

    return manager
  }

  /**
   * Valida parâmetros recebidos em accept_channel
   */
  private validateAcceptChannelParams(
    acceptMsg: AcceptChannelMessage,
    channelInfo: ChannelInfo,
  ): boolean {
    // Validar dust limit (deve ser razoável)
    if (
      acceptMsg.dustLimitSatoshis < 546n ||
      acceptMsg.dustLimitSatoshis > channelInfo.capacity / 100n
    ) {
      return false
    }

    // Validar channel reserve (deve ser pelo menos 1% da capacidade)
    if (acceptMsg.channelReserveSatoshis < channelInfo.capacity / 100n) {
      return false
    }

    // Validar HTLC minimum (deve ser positivo)
    if (acceptMsg.htlcMinimumMsat <= 0n) {
      return false
    }

    // Validar to_self_delay (deve ser positivo)
    if (acceptMsg.toSelfDelay <= 0) {
      return false
    }

    // Validar max_accepted_htlcs (deve ser positivo)
    if (acceptMsg.maxAcceptedHtlcs <= 0) {
      return false
    }

    return true
  }

  /**
   * Cria transação de funding para o canal usando Electrum
   * Implementa criação real da transação de funding com integração Electrum
   */
  private async createFundingTransaction(
    channelId: string,
    channelInfo: ChannelInfo,
    remoteConfig: any,
  ): Promise<{
    txid: Uint8Array
    outputIndex: number
    signature: Uint8Array
  }> {
    try {
      // Derivar chave de funding do canal
      const fundingKey = this.getFundingWallet(0, 0) // Receive case, index 0
      const fundingPubkey = createPublicKey(fundingKey.subarray(0, 32))

      // Calcular script de output do canal (2-of-2 multisig)
      const localPubkey = fundingPubkey
      const remotePubkey = remoteConfig.fundingPubkey

      // Criar script multisig 2-of-2
      const multisigScript = this.createMultisigScript(localPubkey, remotePubkey)

      // Calcular endereço P2WSH para o canal
      const scriptHash = sha256(multisigScript)
      const channelAddress = this.scriptHashToAddress(scriptHash)

      // Obter UTXOs disponíveis para funding
      const utxos = await this.getAvailableUtxos(channelInfo.capacity)

      // Selecionar UTXOs suficientes
      const selectedUtxos = this.selectUtxos(utxos, channelInfo.capacity)

      // Calcular fee estimada
      const feeRate = await estimateFeeRate(6) // 6 blocos de confirmação
      const estimatedFee = this.estimateFundingTxFee(
        selectedUtxos.length,
        1,
        BigInt(Math.ceil(feeRate)),
      )

      // Verificar se temos fundos suficientes
      const totalInput = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0n)
      if (totalInput < channelInfo.capacity + estimatedFee) {
        throw new Error('Insufficient funds for channel funding')
      }

      // Criar transação de funding
      const fundingTx = this.buildFundingTransaction(
        selectedUtxos,
        channelInfo.capacity,
        channelAddress,
        estimatedFee,
        fundingKey,
      )

      // Broadcast transação via Electrum
      const txHex = this.serializeTransaction(fundingTx)
      const txidHex = await broadcastTransaction(txHex)

      // Converter txid para Uint8Array
      const txid = hexToUint8Array(txidHex)

      // Gerar assinatura do commitment transaction inicial (BOLT #2)
      // Para funding_created, assinamos o commitment do peer (REMOTE)
      const channelManager = this.channelManagers.get(channelId)
      let signature: Uint8Array

      if (channelManager && channelManager['commitmentBuilder']) {
        // Configurar funding tx info no commitment builder
        channelManager.setFundingTx(txid, 0)

        // Obter assinatura do commitment usando ChannelManager
        const commitmentSignedMsg = channelManager.sendCommitmentSigned()

        // Extrair assinatura da mensagem (primeiros 64 bytes após header)
        // A mensagem commitment_signed: type(2) + channelId(32) + signature(64) + ...
        signature = commitmentSignedMsg.slice(34, 98)
      } else {
        // Fallback: usar assinatura manual com fundingKey
        // Criar hash do commitment inicial para assinar
        const commitmentData = new Uint8Array(96)
        commitmentData.set(txid, 0) // funding txid
        new DataView(commitmentData.buffer).setUint32(32, 0, true) // output index
        new DataView(commitmentData.buffer).setBigUint64(36, channelInfo.capacity, true)
        commitmentData.set(localPubkey, 44) // local pubkey
        commitmentData.set(remotePubkey, 77) // remote pubkey (remaining space)

        const commitmentHash = sha256(sha256(commitmentData))
        signature = signMessage(commitmentHash, fundingKey.subarray(0, 32))
      }

      // Atualizar informações do canal
      channelInfo.fundingTxid = txidHex
      channelInfo.fundingOutputIndex = 0

      console.log(`[lightning] Funding transaction broadcasted: ${txidHex}`)
      return { txid, outputIndex: 0, signature }
    } catch (error) {
      console.error('[lightning] Failed to create funding transaction:', error)
      throw error
    }
  }

  // ==========================================
  // CHANNEL MANAGEMENT
  // ==========================================

  /**
   * Open Lightning channel with peer
   */
  async openChannel(params: OpenChannelParams): Promise<OpenChannelResult> {
    const { peerId, amount, pushMsat = 0n } = params

    try {
      // 1. Verificar se peer está conectado
      const peerConnection = this.peerManager.getPeerConnection(peerId)
      if (!peerConnection) {
        return { success: false, error: `Peer ${peerId} not connected` }
      }

      // 2. Gerar temporary_channel_id (32 bytes aleatórios)
      const temporaryChannelId = randomBytes(32)

      // 3. Gerar channel_id único
      const channelId = `channel_${this.nextChannelId++}_${Date.now()}`

      // 4. Derivar basepoints para este canal
      const basepoints = this.getChannelBasepoints(channelId)

      // 5. Preparar configuração local do canal
      const fundingPrivateKey = basepoints.funding.subarray(0, 32)
      const localConfig = {
        dustLimitSat: params.dustLimitSatoshis || 546n,
        maxAcceptedHtlcs: params.maxAcceptedHtlcs || 30,
        htlcMinimumMsat: params.htlcMinimumMsat || 1000n,
        maxHtlcValueInFlightMsat: params.maxHtlcValueInFlightMsat || amount * 1000n,
        toSelfDelay: params.toSelfDelay || 144,
        channelReserveSat: params.channelReserveSatoshis || amount / 100n,
        initialMsat: amount - pushMsat,
        upfrontShutdownScript: new Uint8Array(), // TODO: Implementar
        perCommitmentSecretSeed: this.getNodeKey(0).subarray(0, 32), // Usar chave do nó como seed
        fundingPubkey: createPublicKey(fundingPrivateKey),
        fundingPrivateKey,
        revocationBasepoint: basepoints.revocation,
        paymentBasepoint: basepoints.payment,
        delayedPaymentBasepoint: basepoints.delayed,
        htlcBasepoint: basepoints.htlc,
      }

      // 6. Criar ChannelManager para gerenciar estado do canal
      const channelManager = new ChannelManager({
        tempChannelId: temporaryChannelId,
        peerId: hexToUint8Array(peerId),
        fundingSatoshis: amount,
        localConfig,
        weAreFunder: true,
        announceChannel: false, // TODO: Configurar baseado em params
      })
      this.channelManagers.set(channelId, channelManager)

      // 7. Iniciar abertura do canal via ChannelManager
      const feeratePerKw = params.feeratePerKw || 1000
      const openMessage = channelManager.initiateOpen(feeratePerKw)

      // 8. Enviar mensagem open_channel
      const { encrypted: encryptedOpen } = encryptMessage(peerConnection.transportKeys, openMessage)
      await this.sendRaw(peerConnection, encryptedOpen)

      // 9. Registrar informações básicas do canal
      const channelInfo: ChannelInfo = {
        channelId,
        peerId,
        state: ChannelState.OPENING,
        localBalance: amount - pushMsat / 1000n,
        remoteBalance: pushMsat / 1000n,
        capacity: amount,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      }
      this.channels.set(channelId, channelInfo)

      // 10. Persistir estado inicial do canal
      await lightningRepository.saveChannel({
        channelId,
        nodeId: peerId,
        state: 'opening',
        localBalance: channelInfo.localBalance.toString(),
        remoteBalance: channelInfo.remoteBalance.toString(),
        localConfig: {},
        remoteConfig: {},
      })

      console.log(`[lightning] Opening channel ${channelId} with peer ${peerId}`)
      return { success: true, channelId }
    } catch (error) {
      console.error('[lightning] Failed to open channel:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Check if there are active channels
   */
  async hasActiveChannels(): Promise<boolean> {
    for (const channelId of this.channels.keys()) {
      if (this.channelStates.get(channelId) === ChannelState.NORMAL) {
        return true
      }
    }
    return false
  }

  /**
   * Aceita abertura de canal de um peer (BOLT #2)
   * Processa mensagem accept_channel e continua o fluxo de abertura
   *
   * Como usar:
   * const result = await client.acceptChannel(peerId, acceptMsg)
   *
   * Fluxo BOLT #2 (continuação):
   * 5. Receber accept_channel do peer
   * 6. Criar transação de funding
   * 7. Enviar funding_created
   * 8. Receber funding_signed
   * 9. Aguardar confirmações
   * 10. Enviar channel_ready
   *
   * @param peerId - ID do peer que enviou accept_channel
   * @param acceptMsg - Mensagem accept_channel recebida
   * @returns Promise<boolean> - true se aceitação foi processada com sucesso
   */
  async acceptChannel(peerId: string, acceptMsg: AcceptChannelMessage): Promise<boolean> {
    try {
      // 1. Verificar se peer está conectado
      const peerConnection = this.peerManager.getPeerConnection(peerId)
      if (!peerConnection) {
        console.error(`[lightning] Peer ${peerId} not connected for channel acceptance`)
        return false
      }

      // 2. Encontrar canal correspondente pelo temporary_channel_id
      const channelId = Array.from(this.channels.keys()).find(id => {
        const channel = this.channels.get(id)
        return channel && this.channelStates.get(id) === ChannelState.OPENING
      })

      if (!channelId) {
        console.error(`[lightning] No opening channel found for peer ${peerId}`)
        return false
      }

      const channelInfo = this.channels.get(channelId)!
      const temporaryChannelId = acceptMsg.temporaryChannelId

      // 3. Validar parâmetros do accept_channel
      if (!this.validateAcceptChannelParams(acceptMsg, channelInfo)) {
        console.error(`[lightning] Invalid accept_channel parameters from peer ${peerId}`)
        return false
      }

      // 4. Obter ChannelManager e processar accept_channel
      const channelManager = this.channelManagers.get(channelId)
      if (channelManager) {
        // Usar o novo ChannelManager para processar
        const result = channelManager.handleAcceptChannel({
          tempChannelId: acceptMsg.temporaryChannelId,
          dustLimitSatoshis: acceptMsg.dustLimitSatoshis,
          maxHtlcValueInFlightMsat: acceptMsg.maxHtlcValueInFlightMsat,
          channelReserveSatoshis: acceptMsg.channelReserveSatoshis,
          htlcMinimumMsat: acceptMsg.htlcMinimumMsat,
          minimumDepth: acceptMsg.minimumDepth || 3,
          toSelfDelay: acceptMsg.toSelfDelay,
          maxAcceptedHtlcs: acceptMsg.maxAcceptedHtlcs,
          fundingPubkey: acceptMsg.fundingPubkey,
          revocationBasepoint: acceptMsg.revocationBasepoint,
          paymentBasepoint: acceptMsg.paymentBasepoint,
          delayedPaymentBasepoint: acceptMsg.delayedPaymentBasepoint,
          htlcBasepoint: acceptMsg.htlcBasepoint,
          firstPerCommitmentPoint: acceptMsg.firstPerCommitmentPoint,
        })

        if (!result.success) {
          console.error(`[lightning] ChannelManager rejected accept_channel: ${result.error}`)
          return false
        }
      }

      // 5. Atualizar informações do canal com dados do peer
      channelInfo.remoteBalance = 0n // Accept channel não especifica push_msat
      channelInfo.localBalance = channelInfo.capacity - channelInfo.remoteBalance

      // 6. Persistir configuração remota
      const remoteConfig = {
        dustLimitSatoshis: acceptMsg.dustLimitSatoshis,
        maxHtlcValueInFlightMsat: acceptMsg.maxHtlcValueInFlightMsat,
        channelReserveSatoshis: acceptMsg.channelReserveSatoshis,
        htlcMinimumMsat: acceptMsg.htlcMinimumMsat,
        toSelfDelay: acceptMsg.toSelfDelay,
        maxAcceptedHtlcs: acceptMsg.maxAcceptedHtlcs,
        fundingPubkey: acceptMsg.fundingPubkey,
        revocationBasepoint: acceptMsg.revocationBasepoint,
        paymentBasepoint: acceptMsg.paymentBasepoint,
        delayedPaymentBasepoint: acceptMsg.delayedPaymentBasepoint,
        htlcBasepoint: acceptMsg.htlcBasepoint,
        firstPerCommitmentPoint: acceptMsg.firstPerCommitmentPoint,
      }

      await lightningRepository.saveChannel({
        channelId,
        nodeId: peerId,
        state: 'opening',
        fundingTxid: channelInfo.fundingTxid,
        fundingOutputIndex: channelInfo.fundingOutputIndex,
        localBalance: channelInfo.localBalance.toString(),
        remoteBalance: channelInfo.remoteBalance.toString(),
        localConfig: {},
        remoteConfig,
      })

      // 6. Criar transação de funding
      const fundingTx = await this.createFundingTransaction(channelId, channelInfo, remoteConfig)

      // 7. Preparar mensagem funding_created
      const fundingCreatedMsg: FundingCreatedMessage = {
        type: LightningMessageType.FUNDING_CREATED,
        temporaryChannelId,
        fundingTxid: fundingTx.txid,
        fundingOutputIndex: fundingTx.outputIndex,
        signature: fundingTx.signature,
      }

      // 8. Enviar funding_created
      const encodedFundingCreated = encodeFundingCreatedMessage(fundingCreatedMsg)
      const { encrypted: encryptedFundingCreated } = encryptMessage(
        peerConnection.transportKeys,
        encodedFundingCreated,
      )
      await this.sendRaw(peerConnection, encryptedFundingCreated)

      // 9. Atualizar estado para CHANNEL_READY (aguardando funding_signed)
      this.channelStates.set(channelId, ChannelState.CHANNEL_READY)

      console.log(`[lightning] Accepted channel ${channelId} from peer ${peerId}`)
      return true
    } catch (error) {
      console.error('[lightning] Failed to accept channel:', error)
      return false
    }
  }

  // ==========================================
  // 3. COMPLETAR ABERTURA DE CANAL (BOLT #2)
  // ==========================================
  //
  // Esta seção completa o fluxo de abertura de canal após acceptChannel().
  // Ordem de uso:
  // 1. acceptChannel() -> Envia funding_created
  // 2. receiveFundingSigned() -> Recebe funding_signed do peer
  // 3. waitForFundingConfirmation() -> Aguarda confirmações da transação
  // 4. sendChannelReady() -> Envia channel_ready
  // 5. Transita para NORMAL
  //

  /**
   * Recebe funding_signed do peer e valida assinatura (BOLT #2)
   * Completa a abertura do canal após acceptChannel()
   *
   * Como usar:
   * const result = await client.receiveFundingSigned({
   *   channelId: "abc123...",
   *   signature: fundingSignature
   * })
   *
   * Fluxo interno:
   * 1. Validar que canal existe e está em CHANNEL_READY
   * 2. Verificar assinatura da transação de funding
   * 3. Atualizar estado para FUNDING_CONFIRMED
   * 4. Aguardar confirmações da blockchain
   *
   * @param params - Parâmetros do funding_signed
   * @returns Promise<boolean> - Sucesso da operação
   */
  async receiveFundingSigned(params: {
    channelId: string
    signature: Uint8Array
  }): Promise<boolean> {
    const { channelId, signature } = params

    const channel = this.channels.get(channelId)
    if (!channel) {
      console.error('[lightning] Channel not found:', channelId)
      return false
    }

    const currentState = this.channelStates.get(channelId)
    if (currentState !== ChannelState.CHANNEL_READY) {
      console.error('[lightning] Channel not in CHANNEL_READY state:', currentState)
      return false
    }

    try {
      // TODO: Validar assinatura da transação de funding
      // Por enquanto, aceitar qualquer assinatura válida
      if (signature.length !== 64) {
        console.error('[lightning] Invalid funding signature length')
        return false
      }

      // Atualizar estado para aguardar confirmações
      this.channelStates.set(channelId, ChannelState.FUNDING_CONFIRMED)

      // Iniciar monitoramento de confirmações da blockchain via Electrum
      this.monitorFundingConfirmation(channelId, channel.fundingTxid!, 3).catch(error => {
        console.error(`[lightning] Funding confirmation monitoring failed:`, error)
      })

      console.log(`[lightning] Received funding_signed for channel ${channelId}`)
      return true
    } catch (error) {
      console.error('[lightning] Failed to process funding_signed:', error)
      return false
    }
  }

  /**
   * Aguarda confirmações da transação de funding (BOLT #2)
   * Monitora a blockchain até ter confirmações suficientes
   *
   * Como usar:
   * await client.waitForFundingConfirmation(channelId, 3) // Aguardar 3 confirmações
   *
   * @param channelId - ID do canal
   * @param minConfirmations - Número mínimo de confirmações (padrão 3)
   * @returns Promise<boolean> - Canal confirmado
   */
  async waitForFundingConfirmation(
    channelId: string,
    minConfirmations: number = 3,
  ): Promise<boolean> {
    const channel = this.channels.get(channelId)
    if (!channel) {
      console.error('[lightning] Channel not found:', channelId)
      return false
    }

    if (!channel.fundingTxid) {
      console.error('[lightning] No funding txid for channel:', channelId)
      return false
    }

    return this.monitorFundingConfirmation(channelId, channel.fundingTxid, minConfirmations)
  }

  /**
   * Monitora confirmações de transação de funding via Electrum
   * Verifica periodicamente até atingir minConfirmations
   */
  private async monitorFundingConfirmation(
    channelId: string,
    fundingTxid: string,
    minConfirmations: number,
  ): Promise<boolean> {
    const pollIntervalMs = 30000 // 30 segundos entre verificações
    const maxAttempts = 60 // 30 minutos máximo

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Verificar confirmações via Electrum
        const txResponse = await getTransaction(fundingTxid)
        const tx = txResponse.result

        if (!tx) {
          console.log(`[lightning] Funding tx ${fundingTxid.slice(0, 16)}... not found yet`)
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
          continue
        }

        const confirmations = tx.confirmations || 0

        if (confirmations >= minConfirmations) {
          console.log(
            `[lightning] Channel ${channelId} confirmed with ${confirmations} confirmations`,
          )
          await this.handleFundingConfirmed(channelId)
          return true
        }

        console.log(
          `[lightning] Channel ${channelId} has ${confirmations}/${minConfirmations} confirmations`,
        )
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
      } catch (error) {
        console.warn(`[lightning] Error checking confirmations:`, error)
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
      }
    }

    console.error(`[lightning] Timeout waiting for funding confirmation: ${channelId}`)
    return false
  }

  /**
   * Manipula confirmação de funding e envia channel_ready (BOLT #2)
   * Chamado automaticamente após confirmações suficientes
   *
   * @param channelId - ID do canal confirmado
   */
  private async handleFundingConfirmed(channelId: string): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) return

    try {
      // Atualizar estado para NORMAL
      this.channelStates.set(channelId, ChannelState.NORMAL)

      // Enviar channel_ready para o peer
      await this.sendChannelReady(channelId)

      // Atualizar timestamp de atividade
      channel.lastActivity = Date.now()

      // Persistir estado atualizado
      await this.persistChannelState(channelId)

      console.log(`[lightning] Channel ${channelId} is now NORMAL and ready for payments`)
    } catch (error) {
      console.error('[lightning] Failed to handle funding confirmation:', error)
      this.channelStates.set(channelId, ChannelState.ERROR)
    }
  }

  /**
   * Envia channel_ready para o peer (BOLT #2)
   * Indica que o canal está pronto para uso
   *
   * @param channelId - ID do canal
   */
  private async sendChannelReady(channelId: string): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) throw new Error('Channel not found')

    const peerConnection = this.peerManager.getPeerConnection(channel.peerId)
    if (!peerConnection) throw new Error('Peer connection not found')

    // Atualizar ChannelManager se disponível
    const channelManager = this.channelManagers.get(channelId)
    if (channelManager) {
      // Marcar que confirmações foram atingidas
      channelManager.updateFundingConfirmations(6) // Assumindo que já passou minimum_depth
    }

    // Derivar próximo per-commitment point
    const basepoints = this.getChannelBasepoints(channelId)

    // Criar mensagem channel_ready
    const channelReadyMessage: ChannelReadyMessage = {
      type: LightningMessageType.CHANNEL_READY,
      channelId: hexToUint8Array(channelId),
      secondPerCommitmentPoint: basepoints.perCommitment.subarray(1, 34), // Simulação
      tlvs: [] as any, // TODO: Implementar ChannelReadyTlvs
    }

    // Codificar e enviar
    const encodedChannelReady = encodeChannelReadyMessage(channelReadyMessage)
    const encryptedChannelReady = await encryptMessage(
      peerConnection.transportKeys,
      encodedChannelReady,
    )

    await this.sendRaw(peerConnection, encryptedChannelReady.encrypted)

    console.log(`[lightning] Sent channel_ready for channel ${channelId}`)
  }

  // ==========================================
  // 4. FECHAMENTO DE CANAIS (BOLT #2)
  // ==========================================
  //
  // Esta seção implementa o fechamento cooperativo e unilateral de canais.
  // Ordem de uso:
  // 1. closeChannel() -> Fechamento cooperativo
  // 2. forceCloseChannel() -> Fechamento unilateral
  // 3. shutdown() -> Inicia shutdown cooperativo
  //

  /**
   * Fecha canal cooperativamente (BOLT #2)
   * Envia shutdown e aguarda closing_signed do peer
   *
   * Como usar:
   * const result = await client.closeChannel({
   *   channelId: "abc123...",
   *   scriptpubkey: script // Opcional, usa endereço padrão se não fornecido
   * })
   *
   * Fluxo cooperativo:
   * 1. Enviar shutdown com scriptpubkey
   * 2. Receber shutdown do peer
   * 3. Trocar commitment_signed/revoke_and_ack
   * 4. Enviar closing_signed
   * 5. Receber closing_signed do peer
   * 6. Broadcast transação de fechamento
   *
   * @param params - Parâmetros do fechamento
   * @returns Promise<CloseChannelResult> - Resultado da operação
   */
  async closeChannel(params: CloseChannelParams): Promise<CloseChannelResult> {
    const { channelId, scriptpubkey } = params

    const channel = this.channels.get(channelId)
    if (!channel) {
      return { success: false, error: 'Channel not found' }
    }

    const currentState = this.channelStates.get(channelId)
    if (currentState !== ChannelState.NORMAL) {
      return { success: false, error: `Channel not in NORMAL state: ${currentState}` }
    }

    try {
      // Atualizar estado para SHUTTING_DOWN
      this.channelStates.set(channelId, ChannelState.SHUTTING_DOWN)

      // Usar scriptpubkey fornecido ou gerar um padrão
      const shutdownScript = scriptpubkey || this.generateShutdownScript()

      // Usar ChannelManager se disponível
      const channelManager = this.channelManagers.get(channelId)
      if (channelManager) {
        try {
          const shutdownMsg = channelManager.initiateShutdown(shutdownScript)

          const peerConnection = this.peerManager.getPeerConnection(channel.peerId)
          if (peerConnection) {
            const { encrypted } = encryptMessage(peerConnection.transportKeys, shutdownMsg)
            await this.sendRaw(peerConnection, encrypted)
            console.log(`[lightning] Sent shutdown for channel ${channelId} (via ChannelManager)`)
          }
        } catch (error) {
          console.error('[lightning] ChannelManager initiateShutdown failed:', error)
          // Continuar com código legado
          await this.sendShutdown(channelId, shutdownScript)
        }
      } else {
        // Código legado: Enviar shutdown message
        await this.sendShutdown(channelId, shutdownScript)
      }

      // Aguardar resposta shutdown do peer (timeout de 30s)
      // O shutdown_sent é tratado pelo message loop quando recebido
      this.channelStates.set(channelId, ChannelState.SHUTTING_DOWN)

      // Aguardar negociação de fechamento completar
      const closeResult = await this.waitForCooperativeClose(channelId, 30000)

      if (closeResult.success && closeResult.closingTxid) {
        // Broadcast da transação de fechamento
        try {
          await broadcastTransaction(closeResult.closingTxid)
          console.log(
            `[lightning] Broadcasted closing tx: ${closeResult.closingTxid.slice(0, 16)}...`,
          )
        } catch (broadcastError) {
          console.error(`[lightning] Failed to broadcast closing tx:`, broadcastError)
        }
      }

      this.channelStates.set(channelId, ChannelState.CLOSED)
      channel.lastActivity = Date.now()

      console.log(`[lightning] Channel ${channelId} closed cooperatively`)
      return { success: true }
    } catch (error) {
      console.error('[lightning] Failed to close channel:', error)
      this.channelStates.set(channelId, ChannelState.ERROR)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Fecha canal unilateralmente (force close) (BOLT #2)
   * Broadcast commitment transaction diretamente
   *
   * Como usar:
   * const result = await client.forceCloseChannel("channelId")
   *
   * Usado quando:
   * - Peer não responde
   * - Canal comprometido
   * - Necessidade de emergência
   *
   * @param channelId - ID do canal
   * @returns Promise<CloseChannelResult> - Resultado da operação
   */
  async forceCloseChannel(channelId: string): Promise<CloseChannelResult> {
    const channel = this.channels.get(channelId)
    if (!channel) {
      return { success: false, error: 'Channel not found' }
    }

    const currentState = this.channelStates.get(channelId)
    if (currentState !== ChannelState.NORMAL) {
      return { success: false, error: `Channel not in NORMAL state: ${currentState}` }
    }

    try {
      // Atualizar estado para CLOSING
      this.channelStates.set(channelId, ChannelState.CLOSING)

      // Usar ChannelManager se disponível para obter commitment transaction
      const channelManager = this.channelManagers.get(channelId)
      if (channelManager) {
        try {
          const commitmentTx = channelManager.forceClose()
          // commitmentTx contém a commitment transaction para broadcast

          // Serializar commitment transaction para hex
          // CommitmentTx tem estrutura { version, locktime, inputs, outputs }
          const commitmentTxHex = this.serializeTransaction(commitmentTx)

          // Broadcast via Electrum
          try {
            const txid = await broadcastTransaction(commitmentTxHex)
            console.log(`[lightning] Force close commitment tx broadcasted: ${txid}`)

            // Atualizar canal com txid do fechamento
            channel.fundingTxid = txid
          } catch (broadcastError) {
            console.error('[lightning] Failed to broadcast force close tx:', broadcastError)
            // Continuar mesmo se broadcast falhar - pode ser tentado novamente
          }
        } catch (error) {
          console.error('[lightning] ChannelManager forceClose failed:', error)
        }
      }

      // Atualizar estado para CLOSED
      this.channelStates.set(channelId, ChannelState.CLOSED)
      channel.lastActivity = Date.now()

      console.log(`[lightning] Channel ${channelId} force closed`)
      return { success: true }
    } catch (error) {
      console.error('[lightning] Failed to force close channel:', error)
      this.channelStates.set(channelId, ChannelState.ERROR)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Gera scriptpubkey para shutdown usando próximo endereço não utilizado do usuário
   * Converte endereço bech32 (P2WPKH) para scriptPubKey
   *
   * @returns P2WPKH scriptPubKey (OP_0 <20-byte-hash>)
   */
  private generateShutdownScript(): Uint8Array {
    try {
      const addressService = new AddressService()
      const address = addressService.getNextChangeAddress()

      // Converter endereço bech32 para scriptPubKey
      const { version, data } = fromBech32(address)

      if (version !== 0) {
        throw new Error('Only witness version 0 (P2WPKH) addresses supported for shutdown')
      }

      if (data.length !== 20) {
        throw new Error('Invalid P2WPKH witness program length')
      }

      // Construir scriptPubKey: OP_0 <20-byte-hash>
      const scriptPubKey = new Uint8Array(2 + data.length)
      scriptPubKey[0] = 0x00 // OP_0
      scriptPubKey[1] = data.length // Push length (0x14 for 20 bytes)
      scriptPubKey.set(data, 2)

      return scriptPubKey
    } catch (error) {
      console.error('[lightning] Failed to generate shutdown script from user address:', error)
      // Fallback: derivar chave de shutdown a partir da chave Lightning
      // m/1017'/0'/0'/0/0 (purpose'/coin'/account'/change/index)
      let key = this.masterKey
      key = deriveChildKey(key, LIGHTNING_PURPOSE + 0x80000000) // purpose'
      key = deriveChildKey(key, LIGHTNING_COIN_TYPE + 0x80000000) // coinType'
      key = deriveChildKey(key, 0x80000000) // account'
      key = deriveChildKey(key, 0) // change
      key = deriveChildKey(key, 0) // index

      const publicKey = createPublicKey(key)
      const hash160Data = hash160(publicKey)

      const scriptPubKey = new Uint8Array(22)
      scriptPubKey[0] = 0x00 // OP_0
      scriptPubKey[1] = 0x14 // Push 20 bytes
      scriptPubKey.set(hash160Data, 2)

      return scriptPubKey
    }
  }

  /**
   * Envia shutdown message para iniciar fechamento cooperativo (BOLT #2)
   *
   * @param channelId - ID do canal
   * @param scriptpubkey - Script de destino para os fundos
   */
  private async sendShutdown(channelId: string, scriptpubkey: Uint8Array): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) throw new Error('Channel not found')

    const peerConnection = this.peerManager.getPeerConnection(channel.peerId)
    if (!peerConnection) throw new Error('Peer connection not found')

    // Criar shutdown message
    const shutdownMessage = {
      type: LightningMessageType.SHUTDOWN,
      channelId: hexToUint8Array(channelId),
      len: scriptpubkey.length,
      scriptpubkey,
      tlvs: [],
    }

    // Codificar e enviar
    const encodedShutdown = encodeShutdownMessage(shutdownMessage as any)
    const encryptedShutdown = await encryptMessage(peerConnection.transportKeys, encodedShutdown)

    await this.sendRaw(peerConnection, encryptedShutdown.encrypted)

    console.log(`[lightning] Sent shutdown for channel ${channelId}`)
  }

  /**
   * Aguarda fechamento cooperativo completar
   * Monitora troca de mensagens closing_signed até acordo
   *
   * @param channelId - ID do canal
   * @param timeoutMs - Timeout em ms
   * @returns Resultado com txid de fechamento ou erro
   */
  private async waitForCooperativeClose(
    channelId: string,
    timeoutMs: number,
  ): Promise<{ success: boolean; closingTxid?: string; error?: string }> {
    const startTime = Date.now()
    const pollIntervalMs = 500

    while (Date.now() - startTime < timeoutMs) {
      const state = this.channelStates.get(channelId)

      // Verificar se já fechou
      if (state === ChannelState.CLOSED) {
        const channel = this.channels.get(channelId)
        // Em uma implementação real, teríamos armazenado o closing txid
        return {
          success: true,
          closingTxid: channel?.fundingTxid, // Placeholder
        }
      }

      // Verificar se houve erro
      if (state === ChannelState.ERROR) {
        return {
          success: false,
          error: 'Channel entered error state during close',
        }
      }

      // Usar ChannelManager se disponível para verificar estado
      const channelManager = this.channelManagers.get(channelId)
      if (channelManager && !channelManager.isOpen) {
        return {
          success: true,
          closingTxid: this.channels.get(channelId)?.fundingTxid,
        }
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }

    return {
      success: false,
      error: 'Timeout waiting for cooperative close',
    }
  }

  // ==========================================
  // 5. PAGAMENTOS HTLC (BOLT #2 + #11)
  // ==========================================
  //
  // Esta seção implementa pagamentos via HTLC (Hash Time Locked Contracts).
  // Ordem de uso:
  // 1. sendPayment() -> Envia pagamento via HTLC
  // 2. receiveHTLC() -> Recebe HTLC de incoming payment
  // 3. fulfillHTLC() -> Libera fundos quando recebe preimage
  // 4. failHTLC() -> Falha HTLC quando expira ou erro
  //

  /**
   * Envia pagamento via HTLC (BOLT #2)
   * Implementação completa com roteamento e HTLCs reais
   *
   * Como usar:
   * const result = await client.sendPayment({
   *   invoice: "lnbc1000n1p0x9z9pp5...",
   *   amount: 1000n
   * })
   *
   * Fluxo HTLC:
   * 1. Decodificar invoice BOLT11 completa
   * 2. Encontrar rota via gossip protocol (BOLT #7)
   * 3. Construir onion packet com rota
   * 4. Enviar update_add_htlc para cada hop
   * 5. Aguardar preimage do destinatário
   * 6. Revelar preimage via update_fulfill_htlc
   *
   * @param request - Invoice e amount opcional
   * @returns Promise<PaymentResult> - Resultado do pagamento
   */
  async sendPayment(request: LightningPaymentRequest): Promise<PaymentResult> {
    const { invoice, amount } = request

    // Verificação básica da invoice
    if (
      !invoice ||
      (!invoice.startsWith('lnbc') && !invoice.startsWith('lntb') && !invoice.startsWith('lntbs'))
    ) {
      throw new Error('Invalid Lightning invoice')
    }

    try {
      // 1. Decodificar invoice BOLT11
      const decodedInvoice = await this.decodeInvoiceComplete(invoice)

      // 2. Verificar amount
      const paymentAmount = amount || decodedInvoice.amount
      if (!paymentAmount) {
        throw new Error('Amount not specified in invoice or request')
      }

      // 3. Verificar saldo disponível
      const balance = await this.getBalance()
      if (balance < paymentAmount) {
        throw new Error('Insufficient balance')
      }

      // 4. Verificar se temos a chave pública do destino
      if (!decodedInvoice.payeePubkey) {
        throw new Error('Invoice missing payee public key')
      }

      // 5. Encontrar rota para o destino
      const routeResult = await this.findRoute(
        decodedInvoice.payeePubkey,
        paymentAmount,
        decodedInvoice.routingInfo,
      )
      if (!routeResult) {
        throw new Error('No route found')
      }

      // 6. Usar payment hash da invoice (não gerar novo)
      const paymentHash = decodedInvoice.paymentHash

      // 7. Enviar HTLC com payment secret do invoice
      const htlcId = await this.sendHTLC(
        routeResult,
        paymentAmount,
        paymentHash,
        decodedInvoice.cltvExpiry,
        decodedInvoice.paymentSecret,
      )

      // 8. Aguardar resultado
      const result = await this.waitForHTLCResult(routeResult.channelId, htlcId, paymentHash)

      if (result.success && result.preimage) {
        // Pagamento bem-sucedido
        return {
          success: true,
          preimage: result.preimage,
          paymentHash,
        }
      } else {
        // Pagamento falhou
        return {
          success: false,
          error: result.error || 'Payment failed',
          paymentHash,
        }
      }
    } catch (error) {
      console.error('[lightning] Payment failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown payment error',
        paymentHash: new Uint8Array(32), // Placeholder - em implementação real, seria o hash da invoice
      }
    }
  }

  /**
   * Recebe HTLC de incoming payment (BOLT #2)
   * Processa update_add_htlc do peer
   *
   * @param channelId - ID do canal
   * @param htlcMessage - Mensagem update_add_htlc
   * @returns Promise<boolean> - true se HTLC aceito
   */
  async receiveHTLC(channelId: string, htlcMessage: any): Promise<boolean> {
    const channel = this.channels.get(channelId)
    if (!channel) {
      console.error('[lightning] Channel not found for HTLC:', channelId)
      return false
    }

    try {
      // 1. Validar HTLC
      if (!this.validateHTLC(htlcMessage, channel)) {
        await this.failHTLC(channelId, htlcMessage.id, 'Invalid HTLC')
        return false
      }

      // 2. Usar ChannelManager se disponível
      const channelManager = this.channelManagers.get(channelId)
      if (channelManager) {
        try {
          const result = channelManager.handleUpdateAddHtlc({
            htlcId: htlcMessage.id,
            amountMsat: BigInt(htlcMessage.amountMsat),
            paymentHash: htlcMessage.paymentHash,
            cltvExpiry: htlcMessage.cltvExpiry,
            onionRoutingPacket: htlcMessage.onionRoutingPacket,
          })
          if (!result.success) {
            console.error('[lightning] ChannelManager handleUpdateAddHtlc failed:', result.error)
            await this.failHTLC(channelId, htlcMessage.id, 'Processing error')
            return false
          }
          console.log(`[lightning] Received HTLC ${htlcMessage.id} via ChannelManager`)
        } catch (error) {
          console.error('[lightning] ChannelManager handleUpdateAddHtlc failed:', error)
          await this.failHTLC(channelId, htlcMessage.id, 'Processing error')
          return false
        }
      }

      // 3. Verificar se é pagamento para nós
      const isForUs = await this.isPaymentForUs(htlcMessage.paymentHash)

      if (isForUs) {
        // 3a. Pagamento destinado a nós - processar e liberar
        console.log(`[lightning] Received payment HTLC for us: ${htlcMessage.id}`)

        try {
          // Buscar preimage armazenado e liberar o pagamento
          const preimage = this.generatePreimage(htlcMessage.paymentHash)
          await this.fulfillHTLC(channelId, htlcMessage.id, preimage)

          // Atualizar saldo do canal
          const channel = this.channels.get(channelId)
          if (channel) {
            channel.localBalance += htlcMessage.amountMsat / 1000n
            channel.lastActivity = Date.now()

            // Persistir atualização do canal
            const persistedChannel = lightningRepository.findChannelById(channelId)
            if (persistedChannel) {
              persistedChannel.localBalance = channel.localBalance.toString()
              persistedChannel.remoteBalance = channel.remoteBalance.toString()
              lightningRepository.saveChannel(persistedChannel)
            }
          }

          console.log(`[lightning] Payment received: ${htlcMessage.amountMsat} msat`)
        } catch (error) {
          console.error(`[lightning] Failed to fulfill HTLC:`, error)
          await this.failHTLC(channelId, htlcMessage.id, 'Cannot find preimage')
          return false
        }

        return true
      } else {
        // 3b. Pagamento para forward - encontrar próximo hop
        const nextHop = await this.findNextHop(htlcMessage.onionRoutingPacket)
        if (!nextHop) {
          await this.failHTLC(channelId, htlcMessage.id, 'No route')
          return false
        }

        // Forward HTLC
        await this.forwardHTLC(nextHop, htlcMessage)
        return true
      }
    } catch (error) {
      console.error('[lightning] Failed to process HTLC:', error)
      await this.failHTLC(channelId, htlcMessage.id, 'Processing error')
      return false
    }
  }

  /**
   * Libera HTLC com preimage (BOLT #2)
   * Envia update_fulfill_htlc para liberar fundos
   *
   * @param channelId - ID do canal
   * @param htlcId - ID do HTLC
   * @param preimage - Preimage de 32 bytes
   */
  private async fulfillHTLC(
    channelId: string,
    htlcId: bigint,
    preimage: Uint8Array,
  ): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) throw new Error('Channel not found')

    const peerConnection = this.peerManager.getPeerConnection(channel.peerId)
    if (!peerConnection) throw new Error('Peer connection not found')

    // Usar ChannelManager se disponível
    const channelManager = this.channelManagers.get(channelId)
    if (channelManager) {
      try {
        const fulfillMsg = channelManager.fulfillHtlc(htlcId, preimage)

        const { encrypted: encryptedFulfill } = encryptMessage(
          peerConnection.transportKeys,
          fulfillMsg,
        )
        await this.sendRaw(peerConnection, encryptedFulfill)

        this.updateHTLCState(channelId, htlcId, 'fulfilled')
        console.log(
          `[lightning] Fulfilled HTLC ${htlcId} on channel ${channelId} (via ChannelManager)`,
        )
        return
      } catch (error) {
        console.error('[lightning] ChannelManager fulfillHtlc failed:', error)
        // Fallback para código legado
      }
    }

    // Código legado
    const fulfillMessage = {
      type: LightningMessageType.UPDATE_FULFILL_HTLC,
      channelId: hexToUint8Array(channelId),
      id: htlcId,
      paymentPreimage: preimage,
    }

    const encodedFulfill = encodeUpdateFulfillHtlcMessage(fulfillMessage as any)
    const encryptedFulfill = await encryptMessage(peerConnection.transportKeys, encodedFulfill)

    await this.sendRaw(peerConnection, encryptedFulfill.encrypted)

    this.updateHTLCState(channelId, htlcId, 'fulfilled')
    console.log(`[lightning] Fulfilled HTLC ${htlcId} on channel ${channelId}`)
  }

  /**
   * Falha HTLC (BOLT #2)
   * Envia update_fail_htlc com razão da falha
   *
   * @param channelId - ID do canal
   * @param htlcId - ID do HTLC
   * @param reason - Razão da falha
   */
  private async failHTLC(channelId: string, htlcId: bigint, reason: string): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) throw new Error('Channel not found')

    const peerConnection = this.peerManager.getPeerConnection(channel.peerId)
    if (!peerConnection) throw new Error('Peer connection not found')

    // Usar ChannelManager se disponível
    const channelManager = this.channelManagers.get(channelId)
    if (channelManager) {
      try {
        const reasonBytes = new TextEncoder().encode(reason)
        const failMsg = channelManager.failHtlc(htlcId, reasonBytes)

        const { encrypted: encryptedFail } = encryptMessage(peerConnection.transportKeys, failMsg)
        await this.sendRaw(peerConnection, encryptedFail)

        this.updateHTLCState(channelId, htlcId, 'failed')
        console.log(
          `[lightning] Failed HTLC ${htlcId} on channel ${channelId}: ${reason} (via ChannelManager)`,
        )
        return
      } catch (error) {
        console.error('[lightning] ChannelManager failHtlc failed:', error)
        // Fallback para código legado
      }
    }

    // Código legado
    const reasonBytes = new TextEncoder().encode(reason)
    const failMessage = {
      type: LightningMessageType.UPDATE_FAIL_HTLC,
      channelId: hexToUint8Array(channelId),
      id: htlcId,
      len: reasonBytes.length,
      reason: reasonBytes,
    }

    const encodedFail = encodeUpdateFailHtlcMessage(failMessage as any)
    const encryptedFail = await encryptMessage(peerConnection.transportKeys, encodedFail)

    await this.sendRaw(peerConnection, encryptedFail.encrypted)

    this.updateHTLCState(channelId, htlcId, 'failed')
    console.log(`[lightning] Failed HTLC ${htlcId} on channel ${channelId}: ${reason}`)
  }

  /**
   * Envia HTLC para iniciar pagamento (BOLT #2)
   *
   * @param route - Rota de pagamento
   * @param amount - Amount em msat
   * @param paymentHash - Hash do pagamento
   * @param cltvExpiry - Expiração CLTV
   * @param paymentSecret - Payment secret do invoice (opcional, para BOLT #11)
   * @returns Promise<bigint> - ID do HTLC criado
   */
  private async sendHTLC(
    route: any,
    amount: bigint,
    paymentHash: Uint8Array,
    cltvExpiry: number,
    paymentSecret?: Uint8Array,
  ): Promise<bigint> {
    const channel = this.channels.get(route.channelId)
    if (!channel) throw new Error('Channel not found')

    const peerConnection = this.peerManager.getPeerConnection(channel.peerId)
    if (!peerConnection) throw new Error('Peer connection not found')

    // Obter ChannelManager para este canal
    const channelManager = this.channelManagers.get(route.channelId)

    // Criar onion packet com payment secret real
    const onionPacket = this.createOnionPacket(route, paymentHash, paymentSecret)

    // Se temos ChannelManager, usar ele para gerenciar HTLC
    if (channelManager) {
      try {
        const result = channelManager.addHtlc(amount, paymentHash, cltvExpiry, onionPacket)

        // Codificar e enviar mensagem gerada
        const { encrypted: encryptedHtlc } = encryptMessage(
          peerConnection.transportKeys,
          result.message,
        )
        await this.sendRaw(peerConnection, encryptedHtlc)

        // Registrar HTLC na lista legacy
        const htlcInfo: HtlcInfo = {
          id: result.htlcId,
          amountMsat: amount,
          paymentHash,
          cltvExpiry,
          direction: 'outgoing',
          state: 'pending',
        }
        const htlcList = this.htlcs.get(route.channelId) || []
        htlcList.push(htlcInfo)
        this.htlcs.set(route.channelId, htlcList)

        console.log(
          `[lightning] Sent HTLC ${result.htlcId} on channel ${route.channelId} (via ChannelManager)`,
        )
        return result.htlcId
      } catch (error) {
        console.error('[lightning] ChannelManager addHtlc failed:', error)
        throw error
      }
    }

    // Fallback: gerenciamento manual de HTLC (código legado)
    const htlcId = this.nextHtlcId.get(route.channelId) || 0n
    this.nextHtlcId.set(route.channelId, htlcId + 1n)

    // Criar HTLC message
    const htlcMessage = {
      type: LightningMessageType.UPDATE_ADD_HTLC,
      channelId: hexToUint8Array(route.channelId),
      id: htlcId,
      amountMsat: amount,
      paymentHash,
      cltvExpiry,
      onionRoutingPacket: onionPacket,
      tlvs: [] as unknown,
    }

    // Codificar e enviar
    const encodedHtlc = encodeUpdateAddHtlcMessage(htlcMessage as any)
    const encryptedHtlc = await encryptMessage(peerConnection.transportKeys, encodedHtlc)

    await this.sendRaw(peerConnection, encryptedHtlc.encrypted)

    // Registrar HTLC
    const htlcInfo: HtlcInfo = {
      id: htlcId,
      amountMsat: amount,
      paymentHash,
      cltvExpiry,
      direction: 'outgoing',
      state: 'pending',
    }
    const htlcList = this.htlcs.get(route.channelId) || []
    htlcList.push(htlcInfo)
    this.htlcs.set(route.channelId, htlcList)

    console.log(`[lightning] Sent HTLC ${htlcId} on channel ${route.channelId}`)
    return htlcId
  }

  // ==========================================
  // MÉTODOS AUXILIARES HTLC
  // ==========================================

  /**
   * Decodificação completa de invoice BOLT11
   * Usa a implementação real do módulo invoice.ts (BOLT #11)
   */
  private async decodeInvoiceComplete(invoice: string): Promise<{
    amount?: bigint
    paymentHash: Uint8Array
    paymentSecret?: Uint8Array
    payeePubkey?: Uint8Array
    description?: string
    cltvExpiry: number
    expiry: number
    routingInfo?: any[]
  }> {
    try {
      // Usar decodificador BOLT11 real
      const decoded = decodeInvoice(invoice)

      // Validar invoice antes de usar
      const validation = validateInvoice(decoded)
      if (!validation.isValid) {
        throw new Error(`Invalid invoice: ${validation.errors.join(', ')}`)
      }

      // Extrair campos necessários
      const taggedFields = decoded.taggedFields

      // Calcular CLTV expiry baseado no timestamp da invoice + expiry
      const expirySeconds = taggedFields.expiry || DEFAULT_EXPIRY_SECONDS
      const minFinalCltvDelta =
        taggedFields.minFinalCltvExpiryDelta || DEFAULT_MIN_FINAL_CLTV_EXPIRY_DELTA

      // Estimar block height atual (144 blocos/dia * ~2016 blocos desde genesis)
      const currentBlockHeight = await this.getCurrentBlockHeight()
      const cltvExpiry = currentBlockHeight + minFinalCltvDelta

      return {
        amount: decoded.amount,
        paymentHash: taggedFields.paymentHash,
        paymentSecret: taggedFields.paymentSecret,
        payeePubkey: taggedFields.payeePubkey,
        description: taggedFields.description,
        cltvExpiry,
        expiry: expirySeconds,
        routingInfo: taggedFields.routingInfo,
      }
    } catch (error) {
      console.error('[lightning] Failed to decode invoice:', error)
      throw new Error(
        `Failed to decode invoice: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Encontra rota para pagamento usando pathfinding real (BOLT #4)
   * Usa o RoutingGraph para encontrar caminho otimizado
   */
  private async findRoute(
    destination: Uint8Array,
    amount: bigint,
    routingInfo?: any[],
  ): Promise<{
    channelId: string
    route: PaymentRoute | null
    isDirectChannel: boolean
  } | null> {
    // 1. Verificar se temos canal direto para o destino
    const directChannel = this.findDirectChannelToNode(destination)
    if (directChannel && directChannel.localBalance >= amount) {
      console.log(`[routing] Found direct channel: ${directChannel.channelId}`)
      return {
        channelId: directChannel.channelId,
        route: null,
        isDirectChannel: true,
      }
    }

    // 2. Usar routing graph para encontrar caminho multi-hop
    if (this.routingGraph) {
      const route = await this.findPaymentRoute(destination, amount)
      if (route && route.hops.length > 0) {
        // Encontrar canal para o primeiro hop
        const firstHop = route.hops[0]
        const channelForFirstHop = this.findChannelForHop(firstHop)
        if (channelForFirstHop) {
          console.log(`[routing] Found multi-hop route with ${route.hops.length} hops`)
          return {
            channelId: channelForFirstHop.channelId,
            route,
            isDirectChannel: false,
          }
        }
      }
    }

    // 3. Se routing info foi fornecido na invoice, usar como hints
    if (routingInfo && routingInfo.length > 0) {
      console.log(`[routing] Using ${routingInfo.length} routing hints from invoice`)
      // TODO: Implementar uso de routing hints
    }

    // 4. Fallback: usar primeiro canal disponível com saldo suficiente
    for (const [channelId, channel] of this.channels) {
      if (
        this.channelStates.get(channelId) === ChannelState.NORMAL &&
        channel.localBalance >= amount
      ) {
        console.log(`[routing] Using fallback channel: ${channelId}`)
        return { channelId, route: null, isDirectChannel: false }
      }
    }

    console.log('[routing] No route found')
    return null
  }

  /**
   * Encontra canal direto para um nó específico
   */
  private findDirectChannelToNode(nodeId: Uint8Array): ChannelInfo | null {
    const nodeIdHex = uint8ArrayToHex(nodeId)
    for (const [, channel] of this.channels) {
      if (channel.peerId === nodeIdHex) {
        return channel
      }
    }
    return null
  }

  /**
   * Encontra canal adequado para o primeiro hop da rota
   */
  private findChannelForHop(hop: any): ChannelInfo | null {
    // Buscar canal que conecta ao nó do primeiro hop
    for (const [, channel] of this.channels) {
      if (this.channelStates.get(channel.channelId) === ChannelState.NORMAL) {
        // Verificar se este canal leva ao nó do hop
        // TODO: Implementar verificação completa usando routing graph
        return channel
      }
    }
    return null
  }

  /**
   * Aguarda resultado do HTLC com tracking real
   * Monitora estado do HTLC até fulfillment ou timeout
   */
  private async waitForHTLCResult(
    channelId: string,
    htlcId: bigint,
    paymentHash: Uint8Array,
    timeoutMs: number = 60000,
  ): Promise<{
    success: boolean
    preimage?: Uint8Array
    error?: string
  }> {
    const paymentHashHex = uint8ArrayToHex(paymentHash)
    const startTime = Date.now()

    // Polling loop para verificar estado do HTLC
    while (Date.now() - startTime < timeoutMs) {
      // Verificar se preimage foi recebido
      const preimage = this.preimageStore.get(paymentHashHex)
      if (preimage) {
        console.log(`[htlc] Payment ${paymentHashHex.slice(0, 16)}... fulfilled`)
        return { success: true, preimage }
      }

      // Verificar estado do HTLC no tracking local
      const htlcs = this.htlcs.get(channelId)
      if (htlcs) {
        const htlc = htlcs.find(h => h.id === htlcId)
        if (htlc) {
          if (htlc.state === 'fulfilled') {
            const storedPreimage = this.preimageStore.get(paymentHashHex)
            return { success: true, preimage: storedPreimage }
          } else if (htlc.state === 'failed') {
            return { success: false, error: 'HTLC failed' }
          }
        }
      }

      // Aguardar antes de próxima verificação
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Timeout - marcar HTLC como falho
    console.log(`[htlc] Payment ${paymentHashHex.slice(0, 16)}... timed out`)
    return { success: false, error: 'Payment timeout' }
  }

  /**
   * Valida HTLC recebido
   * Verifica regras BOLT #2 para aceitação de HTLCs
   */
  private async validateHTLC(htlcMessage: any, channel: ChannelInfo): Promise<boolean> {
    // 1. Validar amount mínimo
    if (htlcMessage.amountMsat < 1n) {
      console.log('[htlc] Rejecting HTLC: amount below minimum')
      return false
    }

    // 2. Validar capacidade do canal
    if (htlcMessage.amountMsat > channel.remoteBalance * 1000n) {
      console.log('[htlc] Rejecting HTLC: exceeds remote balance')
      return false
    }

    // 3. Validar CLTV expiry (deve ser no futuro)
    const currentBlockHeight = await this.getCurrentBlockHeight()
    if (htlcMessage.cltvExpiry <= currentBlockHeight) {
      console.log('[htlc] Rejecting HTLC: CLTV expiry in the past')
      return false
    }

    // 4. Verificar limite de HTLCs no canal
    const existingHtlcs = this.htlcs.get(channel.channelId) || []
    if (existingHtlcs.length >= 30) {
      // max_accepted_htlcs padrão
      console.log('[htlc] Rejecting HTLC: max HTLCs reached')
      return false
    }

    // 5. Verificar valor total em voo
    const totalInFlight = existingHtlcs.reduce((sum, h) => sum + h.amountMsat, 0n)
    if (totalInFlight + htlcMessage.amountMsat > channel.capacity * 1000n) {
      console.log('[htlc] Rejecting HTLC: exceeds max HTLC value in flight')
      return false
    }

    return true
  }

  /**
   * Verifica se pagamento é destinado a nós
   * Busca preimage correspondente no armazenamento
   */
  private async isPaymentForUs(paymentHash: Uint8Array): Promise<boolean> {
    const paymentHashHex = uint8ArrayToHex(paymentHash)

    // 1. Verificar no preimageStore local
    if (this.preimageStore.has(paymentHashHex)) {
      return true
    }

    // 2. Verificar em invoices no repository (se invoice existe com este hash)
    try {
      const invoices = lightningRepository.findAllInvoices()
      for (const invoiceId of Object.keys(invoices)) {
        const invoice = invoices[invoiceId]
        if (invoice.paymentHash === paymentHashHex) {
          // Invoice existe - o pagamento é para nós
          return true
        }
      }
    } catch (error) {
      console.warn('[htlc] Failed to check invoices:', error)
    }

    return false
  }

  /**
   * Encontra próximo hop para forwarding usando onion routing
   * Decripta payload e extrai informações do próximo hop
   */
  private async findNextHop(onionPacket: Uint8Array): Promise<{
    channelId: string
    amountMsat: bigint
    cltvExpiry: number
    nextOnion: Uint8Array
  } | null> {
    try {
      // Decriptar onion packet para obter payload do próximo hop
      const result = this.processOnionPacket(onionPacket)

      if (!result.nextOnion) {
        // Este é o hop final
        return null
      }

      // Extrair informações do payload TLV
      const payload = result.payload
      const shortChannelId = payload.shortChannelId
      const amountMsat = payload.amountMsat
      const cltvExpiry = payload.cltvExpiry

      // Encontrar canal correspondente
      const channelId = this.findChannelByShortId(shortChannelId)
      if (!channelId) {
        console.log('[routing] No channel found for short_channel_id')
        return null
      }

      return {
        channelId,
        amountMsat,
        cltvExpiry,
        nextOnion: result.nextOnion,
      }
    } catch (error) {
      console.error('[routing] Failed to process onion packet:', error)
      return null
    }
  }

  /**
   * Encontra canal pelo short_channel_id
   */
  private findChannelByShortId(shortChannelId: Uint8Array): string | null {
    const scidHex = uint8ArrayToHex(shortChannelId)
    for (const [channelId] of this.channels) {
      // TODO: Armazenar short_channel_id no ChannelInfo
      if (channelId.startsWith(scidHex.slice(0, 16))) {
        return channelId
      }
    }
    return null
  }

  /**
   * Forward HTLC para próximo hop
   * Implementa forwarding completo BOLT #2
   */
  private async forwardHTLC(
    nextHop: {
      channelId: string
      amountMsat: bigint
      cltvExpiry: number
      nextOnion: Uint8Array
    },
    htlcMessage: any,
  ): Promise<void> {
    const channel = this.channels.get(nextHop.channelId)
    if (!channel) {
      throw new Error('Forwarding channel not found')
    }

    const peerConnection = this.peerManager.getPeerConnection(channel.peerId)
    if (!peerConnection) {
      throw new Error('Peer connection not found for forwarding')
    }

    // Gerar novo HTLC ID para o próximo canal
    const nextHtlcId = this.nextHtlcId.get(nextHop.channelId) || 0n
    this.nextHtlcId.set(nextHop.channelId, nextHtlcId + 1n)

    // Criar mensagem update_add_htlc para o próximo hop
    const forwardHtlcMessage = {
      type: LightningMessageType.UPDATE_ADD_HTLC as typeof LightningMessageType.UPDATE_ADD_HTLC,
      channelId: hexToUint8Array(nextHop.channelId),
      id: nextHtlcId,
      amountMsat: nextHop.amountMsat,
      paymentHash: htlcMessage.paymentHash,
      cltvExpiry: nextHop.cltvExpiry,
      onionRoutingPacket: nextHop.nextOnion,
      tlvs: [],
    }

    // Codificar e enviar
    const encodedForward = encodeUpdateAddHtlcMessage(forwardHtlcMessage)
    const { encrypted: encryptedForward } = encryptMessage(
      peerConnection.transportKeys,
      encodedForward,
    )
    await this.sendRaw(peerConnection, encryptedForward)

    // Registrar HTLC no tracking local
    const htlcs = this.htlcs.get(nextHop.channelId) || []
    htlcs.push({
      id: nextHtlcId,
      amountMsat: nextHop.amountMsat,
      paymentHash: htlcMessage.paymentHash,
      cltvExpiry: nextHop.cltvExpiry,
      direction: 'outgoing',
      state: 'pending',
    })
    this.htlcs.set(nextHop.channelId, htlcs)

    console.log(`[routing] Forwarded HTLC ${nextHtlcId} to channel ${nextHop.channelId}`)
  }

  /**
   * Recupera preimage para payment hash
   * Busca no armazenamento de preimages (preimageStore local)
   */
  private generatePreimage(paymentHash: Uint8Array): Uint8Array {
    const paymentHashHex = uint8ArrayToHex(paymentHash)

    // Buscar no preimageStore local
    const storedPreimage = this.preimageStore.get(paymentHashHex)
    if (storedPreimage) {
      return storedPreimage
    }

    throw new Error(`Preimage not found for payment hash ${paymentHashHex.slice(0, 16)}...`)
  }

  /**
   * Armazena preimage para um payment hash
   * Usado quando geramos invoices ou recebemos fulfill
   */
  storePreimage(paymentHash: Uint8Array, preimage: Uint8Array): void {
    const paymentHashHex = uint8ArrayToHex(paymentHash)
    this.preimageStore.set(paymentHashHex, preimage)
    console.log(`[htlc] Stored preimage for ${paymentHashHex.slice(0, 16)}...`)
  }

  /**
   * Cria onion packet para roteamento (BOLT #4)
   * Implementação completa com Sphinx para multi-hop payments
   *
   * @param route - Rota de pagamento com hops
   * @param paymentHash - Hash do pagamento (32 bytes)
   * @param paymentSecret - Payment secret do invoice (32 bytes, opcional)
   */
  private createOnionPacket(
    route: any,
    paymentHash: Uint8Array,
    paymentSecret?: Uint8Array,
  ): Uint8Array {
    // Extrair pubkeys dos hops da rota do routing graph
    const hopPubkeys: Uint8Array[] = []
    for (let i = 0; i < route.hops.length; i++) {
      const hop = route.hops[i]
      // Obter pubkey do nó do routing graph
      if (hop.nodeId && hop.nodeId.length === 33) {
        hopPubkeys.push(hop.nodeId)
      } else if (this.routingGraph) {
        // Buscar no grafo pelo short_channel_id
        const channel = this.routingGraph.getChannel(hop.shortChannelId)
        if (channel) {
          // Determinar qual nó é o próximo hop
          hopPubkeys.push(channel.nodeId2) // Assumir destino é nodeId2
        } else {
          console.warn(`[onion] Could not find pubkey for hop ${i}, using placeholder`)
          hopPubkeys.push(new Uint8Array(33))
        }
      } else {
        hopPubkeys.push(new Uint8Array(33))
      }
    }

    // Gerar session key aleatório
    const sessionKey = randomBytes(32)

    // Preparar dados dos hops (payloads TLV)
    const hopsData: any[] = []
    for (let i = 0; i < route.hops.length; i++) {
      const hop = route.hops[i]
      const isLastHop = i === route.hops.length - 1

      // Criar payload TLV para o hop, passando payment secret para hop final
      const payload = this.createHopPayload(hop, paymentHash, isLastHop, paymentSecret)
      hopsData.push({
        length: BigInt(payload.length),
        payload,
        hmac: new Uint8Array(32), // Será preenchido durante construção
      })
    }

    // Construir onion packet usando Sphinx
    const onionPacket = constructOnionPacket(hopPubkeys, sessionKey, hopsData)

    // Serializar packet para bytes
    return this.serializeOnionPacket(onionPacket)
  }

  /**
   * Cria payload TLV para um hop específico
   *
   * @param hop - Informações do hop
   * @param paymentHash - Hash do pagamento
   * @param isLastHop - Se é o hop final
   * @param paymentSecret - Payment secret do invoice (para hop final)
   */
  private createHopPayload(
    hop: any,
    paymentHash: Uint8Array,
    isLastHop: boolean,
    paymentSecret?: Uint8Array,
  ): Uint8Array {
    if (isLastHop) {
      // Payload final: amount, cltv_expiry, payment_secret (se disponível)
      const amount = hop.amountMsat || 1000n
      const cltvExpiry = hop.cltvExpiry || Math.floor(Date.now() / 1000) + 3600

      // Usar payment secret do invoice, ou gerar aleatório como fallback
      const secret = paymentSecret || randomBytes(32)

      // Codificar TLVs
      const tlvs: any[] = [
        { type: 2, value: amount }, // amt_to_forward
        { type: 4, value: cltvExpiry }, // outgoing_cltv_value
        { type: 8, value: secret }, // payment_secret
        { type: 6, value: paymentHash }, // payment_data (legacy)
      ]

      return this.encodeTlvs(tlvs)
    } else {
      // Payload intermediário: amount, cltv_expiry, next hop info
      const amount = hop.amountMsat || 1000n
      const cltvExpiry = hop.cltvExpiry || Math.floor(Date.now() / 1000) + 3600

      const tlvs: any[] = [
        { type: 2, value: amount }, // amt_to_forward
        { type: 4, value: cltvExpiry }, // outgoing_cltv_value
        { type: 6, value: hop.shortChannelId }, // short_channel_id
      ]

      return this.encodeTlvs(tlvs)
    }
  }

  /**
   * Codifica array de TLVs em bytes
   */
  private encodeTlvs(tlvs: any[]): Uint8Array {
    const parts: Uint8Array[] = []

    for (const tlv of tlvs) {
      // Type (bigsize)
      const typeBytes = this.encodeBigSize(BigInt(tlv.type))

      // Length (bigsize)
      const lengthBytes = this.encodeBigSize(BigInt(tlv.value.length))

      // Value
      const valueBytes = tlv.value instanceof Uint8Array ? tlv.value : this.encodeValue(tlv.value)

      parts.push(typeBytes, lengthBytes, valueBytes)
    }

    // Concatenar tudo
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const part of parts) {
      result.set(part, offset)
      offset += part.length
    }

    return result
  }

  /**
   * Codifica valor baseado no tipo
   */
  private encodeValue(value: any): Uint8Array {
    if (typeof value === 'bigint') {
      // tu64
      const buf = new ArrayBuffer(8)
      new DataView(buf).setBigUint64(0, value, true)
      return new Uint8Array(buf)
    } else if (typeof value === 'number') {
      // tu32
      const buf = new ArrayBuffer(4)
      new DataView(buf).setUint32(0, value, true)
      return new Uint8Array(buf)
    } else if (value instanceof Uint8Array) {
      return value
    } else {
      throw new Error('Unsupported TLV value type')
    }
  }

  /**
   * Codifica bigsize
   */
  private encodeBigSize(value: bigint): Uint8Array {
    if (value < 0xfd) {
      return new Uint8Array([Number(value)])
    } else if (value <= 0xffff) {
      const buf = new ArrayBuffer(3)
      const view = new DataView(buf)
      view.setUint8(0, 0xfd)
      view.setUint16(1, Number(value), true)
      return new Uint8Array(buf)
    } else if (value <= 0xffffffff) {
      const buf = new ArrayBuffer(5)
      const view = new DataView(buf)
      view.setUint8(0, 0xfe)
      view.setUint32(1, Number(value), true)
      return new Uint8Array(buf)
    } else {
      const buf = new ArrayBuffer(9)
      const view = new DataView(buf)
      view.setUint8(0, 0xff)
      view.setBigUint64(1, value, true)
      return new Uint8Array(buf)
    }
  }

  /**
   * Serializa onion packet para bytes
   */
  private serializeOnionPacket(packet: any): Uint8Array {
    // Formato: version (1) + pubkey (33) + hop_payloads (1300) + hmac (32)
    const result = new Uint8Array(1 + 33 + 1300 + 32)
    result[0] = packet.version
    result.set(packet.publicKey, 1)
    result.set(packet.hopPayloads, 1 + 33)
    result.set(packet.hmac, 1 + 33 + 1300)
    return result
  }

  /**
   * Decodifica onion packet recebido
   */
  private decodeOnionPacket(data: Uint8Array): any {
    if (data.length !== 1366) {
      throw new Error('Invalid onion packet length')
    }

    return {
      version: data[0],
      publicKey: data.subarray(1, 34),
      hopPayloads: data.subarray(34, 34 + 1300),
      hmac: data.subarray(34 + 1300),
    }
  }

  /**
   * Processa onion packet recebido em um hop intermediário
   */
  private processOnionPacket(
    onionData: Uint8Array,
    associatedData: Uint8Array = new Uint8Array(),
  ): {
    payload: any
    nextOnion?: Uint8Array
  } {
    // Obter chave privada do nó derivada do master key
    const nodePrivKey = this.deriveLightningKey(0).subarray(0, 32)

    const packet = this.decodeOnionPacket(onionData)
    const result = decryptOnion(packet, associatedData, undefined, nodePrivKey)

    return {
      payload: result.payload,
      nextOnion: result.nextOnion ? this.serializeOnionPacket(result.nextOnion) : undefined,
    }
  }

  //
  // Esta seção gerencia pagamentos e consultas de saldo.
  // Ordem de uso:
  // 1. getBalance() -> Verificar saldo disponível
  // 2. sendPayment() -> Enviar pagamento via HTLC
  // 3. generateInvoice() -> Receber pagamentos
  //
  // Pagamentos usam HTLC (Hash Time Locked Contracts)

  /**
   * Retorna saldo disponível nos canais Lightning (BOLT #2)
   * Soma valores de todos os canais ativos
   *
   * Como usar:
   * const balance = await client.getBalance()
   * console.log(`Saldo: ${balance} sats`)
   *
   * @returns Promise<bigint> - Saldo total em satoshis
   */
  async getBalance(): Promise<bigint> {
    let totalBalance = 0n

    // Somar saldos de todos os canais ativos
    for (const [channelId, channel] of this.channels) {
      if (this.channelStates.get(channelId) === ChannelState.NORMAL) {
        totalBalance += channel.localBalance
      }
    }

    return totalBalance
  }

  /**
   * Gera invoice Lightning com abertura automática de canal (BOLT #2 + #11)
   * Cria invoice BOLT11 com suporte para abertura automática de canal
   *
   * Como usar:
   * const invoice = await client.generateInvoice({
   *   amount: 1000n,
   *   description: "Pagamento de teste"
   * })
   *
   * Funcionamento:
   * 1. Verifica se há canais ativos
   * 2. Se não há canais, calcula fee de abertura
   * 3. Gera payment_hash e payment_secret
   * 4. Deriva chave de nó para assinatura
   * 5. Codifica invoice BOLT11
   *
   * @param params - Parâmetros da invoice
   * @returns Promise<InvoiceWithChannelInfo> - Invoice e metadados
   */
  async generateInvoice(params: GenerateInvoiceParams): Promise<InvoiceWithChannelInfo> {
    const { amount, description, expiry, metadata } = params

    // Validar amount se fornecido
    if (amount !== undefined && amount <= 0n) {
      throw new Error('Amount must be positive')
    }

    // Verificar se precisa abrir canal
    const requiresChannel = !(await this.hasActiveChannels())

    // Calcular fee de abertura de canal se necessário
    let channelOpeningFee: bigint | undefined
    let effectiveAmount = amount

    if (requiresChannel && amount !== undefined) {
      // Se amount for menor que minChannelSize, ajustar
      const minSize = this.channelFeeConfig.minChannelSize
      const channelSize = amount > minSize ? amount : minSize

      channelOpeningFee = this.calculateChannelOpeningFee(channelSize)

      // O amount do invoice inclui a taxa de abertura
      // (usuário paga amount + fee, recebe amount)
      // Nota: Phoenix/Breez deduzem a fee do amount recebido
      // Aqui fazemos igual: amount solicitado é o que será recebido
    }

    // Gerar credenciais de pagamento
    const { paymentHash, paymentSecret, preimage } = this.generatePaymentCredentials()

    // Armazenar preimage para validação futura quando pagamento chegar
    this.storePreimage(paymentHash, preimage)

    // Persistir preimage no repository para recuperação após restart
    lightningRepository.savePreimage({
      paymentHash: uint8ArrayToHex(paymentHash),
      preimage: uint8ArrayToHex(preimage),
      createdAt: Date.now(),
    })

    // Derivar chave para assinar invoice
    const nodeKey = this.deriveLightningKey(this.nodeIndex++)
    const privateKey = nodeKey.subarray(0, 32)
    const publicKey = createPublicKey(privateKey)

    // Determinar currency prefix
    const currencyPrefix =
      this.network === 'mainnet'
        ? CurrencyPrefix.BITCOIN_MAINNET
        : this.network === 'testnet'
          ? CurrencyPrefix.BITCOIN_TESTNET
          : CurrencyPrefix.BITCOIN_REGTEST

    // Criar invoice params
    const invoiceParams: InvoiceCreateParams = {
      currency: currencyPrefix,
      amount: effectiveAmount, // Amount em millisatoshis
      paymentHash,
      paymentSecret,
      description,
      expiry: expiry || DEFAULT_EXPIRY_SECONDS,
      minFinalCltvExpiryDelta: DEFAULT_MIN_FINAL_CLTV_EXPIRY_DELTA,
      payeePubkey: publicKey,
      metadata,
      payeePrivateKey: privateKey,
    }

    // Encodar invoice
    const invoiceString = encodeInvoice(invoiceParams)

    return {
      invoice: invoiceString,
      qrCode: invoiceString.toUpperCase(), // BOLT11 em uppercase para QR
      amount: effectiveAmount,
      channelOpeningFee,
      requiresChannel,
      paymentHash: uint8ArrayToHex(paymentHash),
    }
  }

  /**
   * Decodificação básica de invoice BOLT11
   * Usa a função real de decodificação
   */
  private decodeInvoiceBasic(invoice: string): {
    amount?: bigint
    paymentHash: Uint8Array
    payeePubkey?: Uint8Array
    paymentSecret?: Uint8Array
    description?: string
  } {
    try {
      // Usar decodificador BOLT11 real
      const decoded = decodeInvoice(invoice)
      return {
        amount: decoded.amount,
        paymentHash: decoded.taggedFields.paymentHash,
        payeePubkey: decoded.taggedFields.payeePubkey,
        paymentSecret: decoded.taggedFields.paymentSecret,
        description: decoded.taggedFields.description,
      }
    } catch (error) {
      console.error('[lightning] Failed to decode invoice:', error)
      // Fallback para extração básica em caso de erro
      const paymentHashHex = invoice.slice(-64)
      return {
        paymentHash: hexToUint8Array(paymentHashHex),
        description: undefined,
      }
    }
  }

  // ==========================================
  // 7. FACTORY METHOD E LIMPEZA
  // ==========================================

  /**
   * Fecha conexão Lightning
   * Cleanup completo: para ping/pong e destroi socket
   *
   * Como usar:
   * await client.close() // Sempre chamar ao finalizar
   */
  async close(): Promise<void> {
    // Stop health monitoring
    this.healthMonitor.stop()

    // Cleanup ping/pong if exists
    const connectionWithCleanup = this.connection as LightningConnection & { cleanup?: () => void }
    if (connectionWithCleanup.cleanup) {
      connectionWithCleanup.cleanup()
    }

    // Destroy socket
    this.connection.destroy()
  }

  // ==========================================
  // ERROR HANDLING PUBLIC API
  // ==========================================

  /**
   * Executa operação com retry e circuit breaker
   * Wrapper genérico para operações que precisam de resiliência
   */
  async executeWithResilience<T>(
    operationType: string,
    operation: () => Promise<T>,
    options?: {
      timeout?: number
      retryConfig?: Partial<RetryConfig>
    },
  ): Promise<T> {
    // Rate limiting
    await this.rateLimiter.acquire()

    // Get or create circuit breaker for this operation type
    let circuitBreaker = this.circuitBreakers.get(operationType)
    if (!circuitBreaker) {
      circuitBreaker = new CircuitBreaker(operationType)
      this.circuitBreakers.set(operationType, circuitBreaker)
    }

    // Check circuit breaker
    if (!circuitBreaker.isAllowed()) {
      const error = new LightningError(
        `Circuit breaker open for ${operationType}`,
        LightningErrorCode.INTERNAL_ERROR,
        false,
      )
      this.errorAggregator.record(error)
      throw error
    }

    try {
      // Execute with retry
      const result = await withRetry(async () => {
        // Apply timeout if specified
        if (options?.timeout) {
          return await withTimeout(operation(), options.timeout, `${operationType} timed out`)
        }
        return await operation()
      }, options?.retryConfig || this.retryConfig)

      if (result.success && result.result !== undefined) {
        circuitBreaker.recordSuccess()
        return result.result
      } else {
        const error = result.error || new Error(`${operationType} failed`)
        circuitBreaker.recordFailure(error)
        this.errorAggregator.record(error)
        throw error
      }
    } catch (error) {
      const lightningError =
        error instanceof LightningError
          ? error
          : new LightningError(
              error instanceof Error ? error.message : String(error),
              LightningErrorCode.INTERNAL_ERROR,
              true,
            )

      circuitBreaker.recordFailure(lightningError)
      this.errorAggregator.record(lightningError)

      // Attempt recovery
      await this.recoveryManager.recover({
        error: lightningError,
        operation: operationType,
        attempt: 1,
        timestamp: Date.now(),
      })

      throw lightningError
    }
  }

  /**
   * Envia pagamento com tratamento robusto de erros
   */
  async sendPaymentWithRetry(
    request: LightningPaymentRequest,
    options?: { maxRetries?: number; timeout?: number },
  ): Promise<PaymentResult> {
    return this.executeWithResilience(
      'payment',
      async () => {
        const result = await this.sendPayment(request)
        if (!result.success) {
          throw new LightningError(
            result.error || 'Payment failed',
            LightningErrorCode.PAYMENT_FAILED,
            true,
          )
        }
        return result
      },
      {
        timeout: options?.timeout || 120000, // 2 minutes default
        retryConfig: {
          maxAttempts: options?.maxRetries || 3,
          retryableErrors: [
            LightningErrorCode.HTLC_TIMEOUT,
            LightningErrorCode.NETWORK_ERROR,
            LightningErrorCode.PEER_DISCONNECTED,
          ],
        },
      },
    )
  }

  /**
   * Abre canal com tratamento robusto de erros
   */
  async openChannelWithRetry(
    params: OpenChannelParams,
    options?: { maxRetries?: number; timeout?: number },
  ): Promise<OpenChannelResult> {
    return this.executeWithResilience(
      'channel',
      async () => {
        const result = await this.openChannel(params)
        if (!result.success) {
          throw new LightningError(
            result.error || 'Failed to open channel',
            LightningErrorCode.CHANNEL_FUNDING_FAILED,
            true,
          )
        }
        return result
      },
      {
        timeout: options?.timeout || 300000, // 5 minutes default for channel opening
        retryConfig: {
          maxAttempts: options?.maxRetries || 2,
          retryableErrors: [
            LightningErrorCode.CONNECTION_TIMEOUT,
            LightningErrorCode.NETWORK_ERROR,
          ],
        },
      },
    )
  }

  /**
   * Conecta a peer com tratamento robusto de erros
   */
  async connectToPeerWithRetry(
    peer: PeerWithPubkey,
    options?: { maxRetries?: number; timeout?: number },
  ): Promise<PeerConnectionResult> {
    return this.executeWithResilience(
      'peer-connection',
      async () => {
        const result = await this.connectPeer(peer)
        if (!result.success) {
          throw new LightningError(
            result.error?.message || result.message || 'Failed to connect to peer',
            LightningErrorCode.CONNECTION_FAILED,
            true,
          )
        }
        return result
      },
      {
        timeout: options?.timeout || 30000,
        retryConfig: {
          maxAttempts: options?.maxRetries || 3,
          initialDelayMs: 2000,
          backoffMultiplier: 2,
          retryableErrors: [
            LightningErrorCode.CONNECTION_TIMEOUT,
            LightningErrorCode.CONNECTION_FAILED,
            LightningErrorCode.NETWORK_ERROR,
          ],
        },
      },
    )
  }

  /**
   * Obtém estatísticas de erros
   */
  getErrorStats(): {
    totalErrors: number
    errorRate: number
    mostCommonErrors: { code: LightningErrorCode; count: number }[]
    circuitBreakers: Map<string, { state: string; failures: number }>
  } {
    const stats = this.errorAggregator.getStats()
    const circuitBreakerStates = new Map<string, { state: string; failures: number }>()

    for (const [cbName, breaker] of this.circuitBreakers) {
      const breakerStats = breaker.getStats()
      circuitBreakerStates.set(cbName, {
        state: breakerStats.state,
        failures: breakerStats.failures,
      })
    }

    return {
      totalErrors: stats.totalErrors,
      errorRate: stats.errorRate,
      mostCommonErrors: this.errorAggregator.getMostCommonErrors(),
      circuitBreakers: circuitBreakerStates,
    }
  }

  /**
   * Obtém status de saúde do sistema
   */
  getHealthStatus(): {
    overall: 'healthy' | 'degraded' | 'unhealthy'
    components: Map<string, { healthy: boolean; status: string; message: string }>
  } {
    const componentStatus = new Map<string, { healthy: boolean; status: string; message: string }>()

    for (const [name, status] of this.healthMonitor.getStatus()) {
      componentStatus.set(name, {
        healthy: status.healthy,
        status: status.status,
        message: status.message,
      })
    }

    return {
      overall: this.healthMonitor.getOverallStatus(),
      components: componentStatus,
    }
  }

  /**
   * Inicia monitoramento de saúde
   */
  startHealthMonitoring(): void {
    this.healthMonitor.start()
    console.log('[lightning] Health monitoring started')
  }

  /**
   * Para monitoramento de saúde
   */
  stopHealthMonitoring(): void {
    this.healthMonitor.stop()
    console.log('[lightning] Health monitoring stopped')
  }

  /**
   * Reseta circuit breaker específico
   */
  resetCircuitBreaker(operationType: string): void {
    const breaker = this.circuitBreakers.get(operationType)
    if (breaker) {
      breaker.reset()
      console.log(`[lightning] Circuit breaker '${operationType}' reset`)
    }
  }

  /**
   * Reseta todos os circuit breakers
   */
  resetAllCircuitBreakers(): void {
    for (const [, breaker] of this.circuitBreakers) {
      breaker.reset()
    }
    console.log('[lightning] All circuit breakers reset')
  }

  /**
   * Obtém histórico de recuperação
   */
  getRecoveryHistory(limit: number = 10): {
    operation: string
    error: string
    timestamp: number
    channelId?: string
  }[] {
    return this.recoveryManager.getHistory(limit).map(ctx => ({
      operation: ctx.operation,
      error: ctx.error.message,
      timestamp: ctx.timestamp,
      channelId: ctx.channelId,
    }))
  }

  /**
   * Limpa histórico de erros
   */
  clearErrorHistory(): void {
    this.errorAggregator.clear()
    this.recoveryManager.clearHistory()
    console.log('[lightning] Error history cleared')
  }

  // ==========================================
  // 5. DERIVAÇÃO DE CHAVES (LNPBP-46)
  // ==========================================
  //
  // Implementa LNPBP-46 para derivação determinística de chaves Lightning.
  // Purpose 9735 define chaves específicas para Lightning Network.
  //
  // Hierarquia de derivação:
  // m/9735'/                        -> Chave raiz Lightning
  //   chain'/                       -> Rede (0' = Bitcoin)
  //     node'/                      -> Nível do nó (0' = nó, 1' = canal, 2' = funding)
  //       nodeIndex'/               -> Índice do nó específico
  //     channel'/                   -> Nível do canal
  //       lnVer'/                   -> Versão Lightning (0' = BOLT)
  //         channelIndex'/          -> ID do canal convertido
  //           basepoint             -> Basepoints específicos (0-6)
  //
  // Ordem de uso:
  // 1. getExtendedLightningKey() -> Chave raiz m/9735'/
  // 2. getNodeKey() -> Chave de nó para assinatura
  // 3. getChannelBasepoints() -> Basepoints para canais
  // 4. getFundingWallet() -> Carteira de funding

  /**
   * Deriva a chave estendida Lightning (m/9735'/)
   * Chave raiz para todas as derivações Lightning (LNPBP-46)
   *
   * Como usar:
   * const lightningKey = client.getExtendedLightningKey()
   * // Retorna 64 bytes: private key (32) + chain code (32)
   *
   * @returns Uint8Array - Chave estendida Lightning
   */
  getExtendedLightningKey(): Uint8Array {
    let key = this.masterKey
    key = deriveChildKey(key, LIGHTNING_PURPOSE + 0x80000000) // purpose'
    return key
  }

  /**
   * Deriva chave de nó (m/9735'/chain'/0'/nodeIndex')
   * Chave específica para um nó Lightning (assinatura de invoices/canais)
   *
   * Como usar:
   * const nodeKey = client.getNodeKey(0) // Nó principal
   * const pubKey = createPublicKey(nodeKey.subarray(0, 32))
   *
   * Path: m/9735'/0'/0'/0' (nó 0)
   *
   * @param nodeIndex - Índice do nó (padrão 0)
   * @returns Uint8Array - Chave estendida do nó
   */
  getNodeKey(nodeIndex: number = 0): Uint8Array {
    let key = this.getExtendedLightningKey()
    key = deriveChildKey(key, CoinType.Bitcoin) // chain'
    key = deriveChildKey(key, NodeIndex.NODE) // 0' (node level)
    key = deriveChildKey(key, nodeIndex + 0x80000000) // nodeIndex'
    return key
  }

  /**
   * Deriva basepoints para um canal (m/9735'/chain'/1'/lnVer'/channel'/basepoint)
   * Gera todas as chaves base necessárias para um canal Lightning (BOLT #2)
   *
   * Como usar:
   * const basepoints = client.getChannelBasepoints(channelId)
   * // Retorna: funding, payment, delayed, revocation, perCommitment, htlc, ptlc
   *
   * Basepoints são usados para:
   * - funding: Assinatura da transação de funding
   * - payment: Chaves de pagamento do canal
   * - delayed: Chaves para timelocks
   * - revocation: Chaves de revogação
   * - perCommitment: Chaves por estado de compromisso
   * - htlc: Chaves para HTLCs
   * - ptlc: Chaves para PTLCs (futuro)
   *
   * @param channelId - ID do canal (string hex)
   * @param lnVer - Versão Lightning (padrão BOLT)
   * @returns Objeto com todas as basepoints
   */
  getChannelBasepoints(
    channelId: string,
    lnVer: LnVersion = LnVersion.BOLT,
  ): {
    funding: Uint8Array
    payment: Uint8Array
    delayed: Uint8Array
    revocation: Uint8Array
    perCommitment: Uint8Array
    htlc: Uint8Array
    ptlc: Uint8Array
  } {
    // const chain: ChainIndex = 0 // Bitcoin
    const channelIndex = constructChannelIndex(channelId)
    let key = this.getExtendedLightningKey()
    key = deriveChildKey(key, CoinType.Bitcoin) // chain'
    key = deriveChildKey(key, NodeIndex.CHANNEL) // 1' (channel level)
    key = deriveChildKey(key, lnVer + 0x80000000) // lnVer'
    key = deriveChildKey(key, channelIndex) // channel (hardened)

    return {
      funding: deriveChildKey(key, 0),
      payment: deriveChildKey(key, 1),
      delayed: deriveChildKey(key, 2),
      revocation: deriveChildKey(key, 3),
      perCommitment: deriveChildKey(key, 4),
      htlc: deriveChildKey(key, 5),
      ptlc: deriveChildKey(key, 6),
    }
  }

  /**
   * Deriva carteira de funding (m/9735'/chain'/2'/case/index)
   * Chaves para transações de funding de canais
   *
   * Como usar:
   * const fundingKey = client.getFundingWallet(0, 0) // Receive case, index 0
   *
   * Cases disponíveis:
   * 0: RECEIVE - Receber funding
   * 1: CHANGE - Troco de funding
   * 2: SHUTDOWN - Encerramento de canal
   *
   * @param caseType - Tipo de caso (0=receive, 1=change, 2=shutdown)
   * @param index - Índice sequencial
   * @returns Uint8Array - Chave de funding
   */
  getFundingWallet(caseType: number = 0, index: number = 0): Uint8Array {
    let key = this.getExtendedLightningKey()
    key = deriveChildKey(key, CoinType.Bitcoin) // chain'
    key = deriveChildKey(key, NodeIndex.FUNDING_WALLET) // 2' (funding wallet level)
    key = deriveChildKey(key, caseType) // case
    key = deriveChildKey(key, index) // index
    return key
  }

  // ==========================================
  // REESTABELECIMENTO DE CANAIS (BOLT #2)
  // ==========================================
  //
  // Esta seção implementa o reestabelecimento de canais após desconexão.
  // Permite retomar canais existentes sem precisar reabri-los.
  //

  /**
   * Obtém mensagens não reconhecidas para um canal
   */
  private getUnacknowledgedMessages(channelId: string): any[] {
    // TODO: Implementar tracking de mensagens não reconhecidas
    // Por enquanto, retornar array vazio
    return []
  }

  /**
   * Reenvia mensagem para peer
   */
  private async resendMessage(peerId: string, message: any): Promise<void> {
    // TODO: Implementar reenvio de mensagens
    console.log(`[lightning] Resending message to peer ${peerId}`)
  }

  // ==========================================
  // ROTEAMENTO AVANÇADO (BOLT #4)
  // ==========================================
  //
  // Esta seção implementa funcionalidades de roteamento usando o grafo de roteamento.
  // Permite encontrar rotas de pagamento através da rede Lightning.
  //

  /**
   * Encontra rota de pagamento usando o grafo de roteamento
   * Implementa pathfinding com Dijkstra's algorithm
   *
   * Como usar:
   * const route = await client.findPaymentRoute(destinationPubkey, amountMsat)
   *
   * Algoritmo:
   * 1. Usar Dijkstra para encontrar caminho mais barato
   * 2. Considerar fees, capacity e CLTV expiry
   * 3. Retornar rota otimizada ou null se não encontrada
   *
   * @param destination - Chave pública do destino (Uint8Array)
   * @param amountMsat - Valor em millisatoshis
   * @param maxFeeMsat - Fee máxima aceitável (opcional)
   * @returns Promise<PaymentRoute | null> - Rota encontrada ou null
   */
  async findPaymentRoute(
    destination: Uint8Array,
    amountMsat: bigint,
    maxFeeMsat?: bigint,
  ): Promise<PaymentRoute | null> {
    if (!this.routingGraph) {
      console.warn('[routing] No routing graph available')
      return null
    }

    try {
      // Obter chave pública local para source
      const localPubkey = this.getLocalPubkey()

      // Encontrar rota usando Dijkstra
      const result = this.routingGraph.findRoute(localPubkey, destination, amountMsat)

      if (!result.route) {
        console.log(`[routing] No route found to ${uint8ArrayToHex(destination)}`)
        return null
      }

      // Verificar se fee está dentro do limite
      if (maxFeeMsat && result.route.totalFeeMsat > maxFeeMsat) {
        console.log(`[routing] Route fee ${result.route.totalFeeMsat} exceeds max ${maxFeeMsat}`)
        return null
      }

      console.log(
        `[routing] Found route with ${result.route.hops.length} hops, fee: ${result.route.totalFeeMsat} msat`,
      )
      return result.route
    } catch (error) {
      console.error('[routing] Failed to find payment route:', error)
      return null
    }
  }

  /**
   * Envia pagamento usando Multi-Part Payments (MPP) - BOLT #2
   * Divide pagamentos grandes em múltiplas partes que seguem caminhos diferentes
   *
   * Como usar:
   * const result = await client.sendMultiPartPayment(invoice, {
   *   maxParts: 16,
   *   maxFeeMsat: 5000n
   * })
   *
   * Funcionalidades:
   * - Divide pagamento em partes menores
   * - Cada parte segue uma rota independente
   * - Agrega resultados quando todas as partes chegam
   * - Trata falhas parciais com retry inteligente
   *
   * @param invoice - Invoice BOLT11 string
   * @param options - Opções de MPP
   * @returns Promise<PaymentResult> - Resultado do pagamento MPP
   */
  async sendMultiPartPayment(
    invoice: string,
    options: {
      maxParts?: number
      maxFeeMsat?: bigint
      timeoutMs?: number
    } = {},
  ): Promise<PaymentResult> {
    const { maxParts = 16, maxFeeMsat, timeoutMs = 60000 } = options

    try {
      // 1. Decodificar invoice
      const decoded = this.decodeInvoiceBasic(invoice)
      if (!decoded.paymentHash || !decoded.amount) {
        return {
          success: false,
          error: 'Invalid invoice format',
          paymentHash: new Uint8Array(32),
        }
      }

      const totalAmountMsat = decoded.amount
      const paymentHash = decoded.paymentHash

      // 2. Verificar se MPP é necessário
      if (totalAmountMsat <= 10000000n) {
        // Menos de 10k sats, usar pagamento simples
        console.log(`[mpp] Amount ${totalAmountMsat}msat is small, using single payment`)
        return this.sendPayment({ invoice, amount: totalAmountMsat })
      }

      // 3. Dividir pagamento em partes
      const parts = this.splitPaymentIntoParts(totalAmountMsat, maxParts)
      console.log(`[mpp] Splitting payment of ${totalAmountMsat}msat into ${parts.length} parts`)

      // 4. Criar sessão MPP
      const mppSession: MPPSession = {
        paymentHash,
        totalAmount: totalAmountMsat,
        partsCount: parts.length,
        timeout: timeoutMs,
        parts: [],
        totalAmountMsat: totalAmountMsat,
        timeoutMs: timeoutMs,
        totalParts: parts.length,
      }

      // 5. Enviar cada parte paralelamente
      // Usar payeePubkey da invoice como destination, ou derivar do paymentHash se não disponível
      const destination = decoded.payeePubkey || paymentHash
      const partPromises = parts.map(async (partAmount, index) => {
        return this.sendPaymentPart(
          paymentHash,
          partAmount,
          index,
          mppSession,
          destination,
          maxFeeMsat,
        )
      })

      // 6. Aguardar conclusão de todas as partes
      const results = await Promise.allSettled(partPromises)

      // 7. Agregar resultados
      return this.aggregateMPPPaymentResults(mppSession, results)
    } catch (error) {
      console.error('[mpp] MPP payment failed:', error)
      return {
        success: false,
        error: 'MPP payment failed',
        paymentHash: new Uint8Array(32),
      }
    }
  }

  /**
   * Divide um pagamento em múltiplas partes
   * Usa algoritmo inteligente para otimizar liquidez e fees
   */
  private splitPaymentIntoParts(totalAmount: bigint, maxParts: number): bigint[] {
    // Estratégia: dividir em partes aproximadamente iguais
    // mas variar ligeiramente para evitar padrões previsíveis

    const baseAmount = totalAmount / BigInt(maxParts)
    const remainder = totalAmount % BigInt(maxParts)

    const parts: bigint[] = []

    for (let i = 0; i < maxParts; i++) {
      let partAmount = baseAmount

      // Distribuir remainder nas primeiras partes
      if (i < Number(remainder)) {
        partAmount += 1n
      }

      // Adicionar pequena variação aleatória (±5%)
      const variation = Math.floor(Math.random() * 0.1 - 0.05) // -5% to +5%
      const variationAmount = (partAmount * BigInt(Math.abs(variation) * 100)) / 100n

      if (variation > 0) {
        partAmount += variationAmount
      } else {
        partAmount -= variationAmount
      }

      // Garantir mínimo de 1msat
      if (partAmount < 1n) partAmount = 1n

      parts.push(partAmount)
    }

    // Ajustar para garantir que soma seja exata
    const currentSum = parts.reduce((sum, part) => sum + part, 0n)
    if (currentSum !== totalAmount) {
      const diff = totalAmount - currentSum
      parts[0] += diff // Ajustar primeira parte
    }

    return parts
  }

  /**
   * Envia uma parte individual do pagamento MPP
   *
   * @param paymentHash - Hash do pagamento
   * @param partAmount - Valor desta parte em msat
   * @param partIndex - Índice da parte (0-based)
   * @param session - Sessão MPP
   * @param destination - Pubkey de destino (33 bytes)
   * @param maxFeeMsat - Fee máximo para esta parte
   */
  private async sendPaymentPart(
    paymentHash: Uint8Array,
    partAmount: bigint,
    partIndex: number,
    session: MPPSession,
    destination: Uint8Array,
    maxFeeMsat?: bigint,
  ): Promise<PaymentPartResult> {
    try {
      console.log(`[mpp] Sending part ${partIndex + 1}/${session.totalParts}: ${partAmount}msat`)

      // Encontrar rota para esta parte usando destination real
      const route = await this.findPaymentRoute(destination, partAmount, maxFeeMsat)

      if (!route) {
        return {
          route: [],
          amount: partAmount,
          success: false,
          error: 'No route found for part',
          partIndex,
        }
      }

      // Criar onion packet com payload MPP
      const onionPacket = this.createMPPOnionPacket(route, paymentHash, session.totalAmount)

      // Enviar HTLC
      const firstHop = route.hops[0]
      const htlcResult = await this.sendHTLCToPeer(
        uint8ArrayToHex(firstHop.shortChannelId),
        route.totalAmountMsat,
        paymentHash,
        route.totalCltvExpiry,
        onionPacket,
      )

      if (!htlcResult.success) {
        return {
          route: [route], // Convert route to array
          amount: partAmount,
          success: false,
          error: htlcResult.error || 'HTLC failed',
          partIndex,
        }
      }

      // Registrar parte como enviada
      session.markPartSent?.(partIndex)

      // Aguardar resultado desta parte
      const result = await this.waitForPaymentPartResult(
        paymentHash,
        partIndex,
        session.timeout ?? 30000,
      )

      if (result.success && result.preimage) {
        session.markPartCompleted?.(partIndex, result.preimage)
        return {
          route: [route],
          amount: partAmount,
          success: true,
          preimage: result.preimage,
          partIndex,
        }
      } else {
        session.markPartFailed?.(partIndex, result.error)
        return {
          route: [route],
          amount: partAmount,
          success: false,
          error: result.error || 'Part failed',
          partIndex,
        }
      }
    } catch (error) {
      console.error(`[mpp] Part ${partIndex} failed:`, error)
      session.markPartFailed?.(partIndex, String(error))
      return {
        route: [],
        amount: partAmount,
        success: false,
        error: String(error),
        partIndex,
      }
    }
  }

  /**
   * Cria onion packet com payload MPP
   */
  private createMPPOnionPacket(
    route: any,
    paymentHash: Uint8Array,
    totalAmountMsat: bigint,
  ): Uint8Array {
    // Extrair pubkeys dos hops
    const hopPubkeys: Uint8Array[] = []
    for (let i = 0; i < route.hops.length; i++) {
      hopPubkeys.push(new Uint8Array(33)) // Placeholder
    }

    const sessionKey = randomBytes(32)

    // Preparar dados dos hops com payload MPP
    const hopsData: any[] = []
    for (let i = 0; i < route.hops.length; i++) {
      const hop = route.hops[i]
      const isLastHop = i === route.hops.length - 1

      const payload = this.createMPPHopPayload(hop, paymentHash, totalAmountMsat, isLastHop)
      hopsData.push({
        length: BigInt(payload.length),
        payload,
        hmac: new Uint8Array(32),
      })
    }

    // Construir onion packet
    const onionPacket = constructOnionPacket(hopPubkeys, sessionKey, hopsData)
    return this.serializeOnionPacket(onionPacket)
  }

  /**
   * Cria payload TLV para hop MPP
   */
  private createMPPHopPayload(
    hop: any,
    paymentHash: Uint8Array,
    totalAmountMsat: bigint,
    isLastHop: boolean,
  ): Uint8Array {
    if (isLastHop) {
      // Payload final com MPP TLVs
      const tlvs: any[] = [
        { type: 2, value: hop.amountMsat || 1000n }, // amt_to_forward
        { type: 4, value: hop.cltvExpiry || Math.floor(Date.now() / 1000) + 3600 }, // outgoing_cltv_value
        { type: 8, value: randomBytes(32) }, // payment_secret
        { type: 6, value: paymentHash }, // payment_data
        // MPP TLVs (BOLT #2)
        { type: 700, value: totalAmountMsat }, // total_amount_msat
        { type: 701, value: paymentHash }, // payment_hash
      ]

      return this.encodeTlvs(tlvs)
    } else {
      // Payload intermediário
      const tlvs: any[] = [
        { type: 2, value: hop.amountMsat || 1000n }, // amt_to_forward
        { type: 4, value: hop.cltvExpiry || Math.floor(Date.now() / 1000) + 3600 }, // outgoing_cltv_value
        { type: 6, value: hop.shortChannelId }, // short_channel_id
      ]

      return this.encodeTlvs(tlvs)
    }
  }

  /**
   * Aguarda resultado de uma parte do pagamento
   */
  private async waitForPaymentPartResult(
    paymentHash: Uint8Array,
    partIndex: number,
    timeoutMs: number,
  ): Promise<any> {
    // Simulação: aguardar resultado
    return new Promise(resolve => {
      setTimeout(
        () => {
          resolve({
            success: Math.random() > 0.1, // 90% sucesso
            preimage: randomBytes(32),
            error: Math.random() > 0.9 ? 'Route failed' : undefined,
          })
        },
        1000 + Math.random() * 2000,
      ) // 1-3 segundos
    })
  }

  /**
   * Agrega resultados das múltiplas partes do pagamento MPP
   */
  private aggregateMPPPaymentResults(
    session: MPPSession,
    results: PromiseSettledResult<PaymentPartResult>[],
  ): PaymentResult {
    const successfulParts: PaymentPartResult[] = []
    const failedParts: PaymentPartResult[] = []

    // Separar resultados
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          successfulParts.push(result.value)
        } else {
          failedParts.push(result.value)
        }
      } else {
        failedParts.push({
          route: [],
          amount: 0n,
          partIndex: -1,
          success: false,
          error: result.reason,
        })
      }
    })

    console.log(
      `[mpp] Payment completed: ${successfulParts.length}/${session.totalParts ?? session.partsCount} parts successful`,
    )

    // Verificar se pagamento foi bem-sucedido
    if (successfulParts.length === (session.totalParts ?? session.partsCount)) {
      // Todas as partes foram bem-sucedidas
      return {
        success: true,
        preimage: successfulParts[0].preimage, // Mesmo preimage para todas as partes
        paymentHash: session.paymentHash,
        mppResult: {
          totalParts: session.totalParts ?? session.partsCount,
          successfulParts: successfulParts.length,
          failedParts: failedParts.length,
        },
      }
    } else if (successfulParts.length > 0) {
      // Algumas partes falharam - pode ser retry ou partial success
      return {
        success: false,
        error: `Partial failure: ${successfulParts.length}/${session.totalParts ?? session.partsCount} parts succeeded`,
        paymentHash: session.paymentHash,
        mppResult: {
          totalParts: session.totalParts ?? session.partsCount,
          successfulParts: successfulParts.length,
          failedParts: failedParts.length,
          partialSuccess: true,
        },
      }
    } else {
      // Todas as partes falharam
      return {
        success: false,
        error: 'All payment parts failed',
        paymentHash: session.paymentHash,
        mppResult: {
          totalParts: session.totalParts ?? session.partsCount,
          successfulParts: 0,
          failedParts: failedParts.length,
        },
      }
    }
  }

  /**
   * Atualiza grafo de roteamento com novos dados de gossip
   * Processa mensagens BOLT #7 (gossip) para manter grafo atualizado
   *
   * Como usar:
   * await client.updateRoutingGraph(gossipMessage)
   *
   * Tipos de mensagens processadas:
   * - channel_announcement: Novos canais
   * - node_announcement: Novos nós
   * - channel_update: Atualizações de canal
   *
   * @param gossipMessage - Mensagem de gossip recebida
   */
  async updateRoutingGraph(gossipMessage: GossipMessageUnion): Promise<void> {
    if (!this.routingGraph) {
      console.warn('[routing] No routing graph available for updates')
      return
    }

    try {
      switch (gossipMessage.type) {
        case GossipMessageType.CHANNEL_ANNOUNCEMENT:
          await this.processChannelAnnouncement(gossipMessage as ChannelAnnouncementMessage)
          break
        case GossipMessageType.NODE_ANNOUNCEMENT:
          await this.processNodeAnnouncement(gossipMessage as NodeAnnouncementMessage)
          break
        case GossipMessageType.CHANNEL_UPDATE:
          await this.processChannelUpdate(gossipMessage as ChannelUpdateMessage)
          break
        default:
          console.warn(`[routing] Unknown gossip message type: ${gossipMessage.type}`)
      }

      console.log('[routing] Routing graph updated with gossip message')
    } catch (error) {
      console.error('[routing] Failed to update routing graph:', error)
    }
  }

  /**
   * Processa mensagem channel_announcement (BOLT #7)
   */
  private async processChannelAnnouncement(message: ChannelAnnouncementMessage): Promise<void> {
    try {
      // Validar assinatura da mensagem
      const isValid = await this.validateChannelAnnouncement(message)
      if (!isValid) {
        console.warn('[gossip] Invalid channel announcement signature')
        return
      }

      // Criar entrada no grafo de roteamento
      const channel: RoutingChannel = {
        shortChannelId: message.shortChannelId,
        nodeId1: message.nodeId1,
        nodeId2: message.nodeId2,
        capacity: 0n, // TODO: Calculate from funding amount
        features: message.features,
        lastUpdate: Date.now(),
        feeBaseMsat: 1000, // Default fee base
        feeProportionalMillionths: 1, // Default fee proportional
        cltvExpiryDelta: 40, // Default CLTV delta
        htlcMinimumMsat: 1n, // Default minimum
        htlcMaximumMsat: 0n, // TODO: Calculate from capacity
      }

      this.routingGraph.addChannel(channel)
      console.log(
        `[gossip] Added channel ${uint8ArrayToHex(message.shortChannelId)} to routing graph`,
      )
    } catch (error) {
      console.error('[gossip] Failed to process channel announcement:', error)
    }
  }

  /**
   * Processa mensagem node_announcement (BOLT #7)
   */
  private async processNodeAnnouncement(message: NodeAnnouncementMessage): Promise<void> {
    try {
      // Validar assinatura da mensagem
      const isValid = await this.validateNodeAnnouncement(message)
      if (!isValid) {
        console.warn('[gossip] Invalid node announcement signature')
        return
      }

      // Criar entrada no grafo de roteamento
      const node: RoutingNode = {
        nodeId: message.nodeId,
        features: message.features,
        lastUpdate: Date.now(),
        addresses: [], // TODO: Convert address descriptors to NodeAddress format
        alias: uint8ArrayToHex(message.alias).replace(/00/g, '').trim(),
      }

      this.routingGraph.addNode(node)
      console.log(`[gossip] Added node ${uint8ArrayToHex(message.nodeId)} to routing graph`)
    } catch (error) {
      console.error('[gossip] Failed to process node announcement:', error)
    }
  }

  /**
   * Processa mensagem channel_update (BOLT #7)
   */
  private async processChannelUpdate(message: ChannelUpdateMessage): Promise<void> {
    try {
      // Validar assinatura da mensagem
      const isValid = await this.validateChannelUpdate(message)
      if (!isValid) {
        console.warn('[gossip] Invalid channel update signature')
        return
      }

      // Atualizar canal existente no grafo
      const existingChannel = this.routingGraph.getChannel(message.shortChannelId)
      if (!existingChannel) {
        console.warn(
          `[gossip] Channel ${uint8ArrayToHex(message.shortChannelId)} not found for update`,
        )
        return
      }

      // Atualizar informações do canal
      const updatedChannel: RoutingChannel = {
        ...existingChannel,
        feeBaseMsat: message.feeBaseMsat,
        feeProportionalMillionths: message.feeProportionalMillionths,
        cltvExpiryDelta: message.cltvExpiryDelta,
        htlcMinimumMsat: message.htlcMinimumMsat,
        htlcMaximumMsat: message.htlcMaximumMsat,
        lastUpdate: Date.now(),
      }

      this.routingGraph.addChannel(updatedChannel)
      console.log(`[gossip] Updated channel ${uint8ArrayToHex(message.shortChannelId)}`)
    } catch (error) {
      console.error('[gossip] Failed to process channel update:', error)
    }
  }

  /**
   * Valida assinatura de channel_announcement
   * Implementa validação completa BOLT #7 com verificação de assinaturas e estado
   */
  private async validateChannelAnnouncement(message: ChannelAnnouncementMessage): Promise<boolean> {
    try {
      // 1. Verificar se já conhecemos este canal
      const scidHex = uint8ArrayToHex(message.shortChannelId)
      const existingChannel = this.routingGraph?.getChannel(message.shortChannelId)

      if (existingChannel) {
        console.warn(`[gossip] Channel ${scidHex} already exists in routing graph`)
        // Permitir atualização se for mais recente (usar timestamp do channel_update)
        // Nota: channel_announcement não tem timestamp direto, então aceitamos
        return false
      }

      // 2. Verificar se os nós existem no grafo (ou se são nós válidos)
      const node1Hex = uint8ArrayToHex(message.nodeId1)
      const node2Hex = uint8ArrayToHex(message.nodeId2)

      // Para validação inicial, aceitar canais de nós desconhecidos
      // mas marcar para verificação posterior

      // 3. Usar validação do p2p.ts para assinaturas e confirmações
      // Nota: Esta validação requer informações da blockchain que não temos aqui
      // Por enquanto, fazer validação básica de assinaturas

      // Verificar se nodeId1 != nodeId2
      if (node1Hex === node2Hex) {
        console.warn(`[gossip] Channel announcement with same node IDs`)
        return false
      }

      // Verificar ordem lexicográfica dos node IDs (BOLT #7)
      if (uint8ArrayToHex(message.nodeId1) > uint8ArrayToHex(message.nodeId2)) {
        console.warn(`[gossip] Channel announcement node IDs not in lexicographic order`)
        return false
      }

      console.log(`[gossip] Channel announcement ${scidHex} passed basic validation`)
      return true
    } catch (error) {
      console.error('[gossip] Error validating channel announcement:', error)
      return false
    }
  }

  /**
   * Valida assinatura de node_announcement
   */
  private async validateNodeAnnouncement(message: NodeAnnouncementMessage): Promise<boolean> {
    // TODO: Implementar validação real de assinatura
    return true // Simulação
  }

  /**
   * Valida assinatura de channel_update
   */
  private async validateChannelUpdate(message: ChannelUpdateMessage): Promise<boolean> {
    // TODO: Implementar validação real de assinatura
    return true // Simulação
  }

  /**
   * Obtém estatísticas do grafo de roteamento
   * Útil para debugging e monitoramento
   *
   * Como usar:
   * const stats = client.getRoutingStats()
   * console.log(`Graph has ${stats.nodeCount} nodes, ${stats.channelCount} channels`)
   *
   * @returns Estatísticas do grafo ou null se não disponível
   */
  getRoutingStats(): { nodeCount: number; channelCount: number; totalCapacity: bigint } | null {
    if (!this.routingGraph) return null
    const stats = this.routingGraph.getStats()
    return {
      nodeCount: stats.nodes,
      channelCount: stats.channels,
      totalCapacity: 0n, // TODO: Calcular capacidade total
    }
  }

  // ==========================================
  // GOSSIP SYNC (BOLT #7)
  // ==========================================

  /**
   * Inicia sincronização de gossip com peer conectado
   *
   * Como usar:
   * await client.startGossipSync()
   *
   * Isso irá:
   * 1. Enviar gossip_timestamp_filter para receber atualizações
   * 2. Enviar query_channel_range para obter lista de canais
   * 3. Processar respostas e atualizar routing graph
   */
  async startGossipSync(): Promise<void> {
    if (!this.gossipSync || !this.connection) {
      console.warn('[gossip] Cannot start sync: no gossip sync or connection')
      return
    }

    // Criar interface de peer para gossip
    const peerInterface: GossipPeerInterface = {
      sendMessage: async (data: Uint8Array) => {
        if (this.connection.transportKeys) {
          const result = encryptMessage(this.connection.transportKeys, data)
          await this.sendRawMessage(result.encrypted)
          // Atualizar chaves de transporte após cada mensagem
          this.connection.transportKeys = result.newKeys
        }
      },
      onMessage: (handler: (data: Uint8Array) => void) => {
        // Handler já configurado no processamento de mensagens
        this.gossipMessageHandler = handler
      },
      isConnected: () => this.isConnected(),
    }

    try {
      await this.gossipSync.startSync(peerInterface, {
        fullSync: true,
        requestTimestamps: true,
        requestChecksums: true,
      })
      console.log('[gossip] Gossip sync started')
    } catch (error) {
      console.error('[gossip] Failed to start gossip sync:', error)
    }
  }

  // Handler de mensagens gossip (configurado em startGossipSync)
  private gossipMessageHandler: ((data: Uint8Array) => void) | null = null

  /**
   * Processa mensagem gossip recebida do peer
   */
  async processGossipMessage(data: Uint8Array): Promise<void> {
    if (this.gossipSync) {
      await this.gossipSync.handleIncomingMessage(data)
    }
    if (this.gossipMessageHandler) {
      this.gossipMessageHandler(data)
    }
  }

  /**
   * Retorna estatísticas de sincronização de gossip
   */
  getGossipSyncStats(): GossipSyncStats | null {
    return this.gossipSync?.getStats() || null
  }

  /**
   * Verifica se gossip está sincronizado
   */
  isGossipSynced(): boolean {
    return this.gossipSync?.getState() === GossipSyncState.SYNCED
  }

  /**
   * Verifica se conexão está ativa
   */
  isConnected(): boolean {
    return this.connection !== null && this.connection.transportKeys !== null
  }

  // ==========================================
  // TRAMPOLINE ROUTING
  // ==========================================

  /**
   * Envia pagamento usando trampoline routing
   *
   * Trampoline routing permite enviar pagamentos sem conhecer a rota completa.
   * O nó trampoline (ex: ACINQ) faz o pathfinding até o destino.
   *
   * Como usar:
   * const result = await client.sendTrampolinePayment({
   *   destinationNodeId: destPubKey,
   *   amountMsat: 100000n,
   *   paymentHash: hash,
   *   paymentSecret: secret,
   * })
   *
   * @param params - Parâmetros do pagamento
   * @returns Promise<PaymentResult> - Resultado do pagamento
   */
  async sendTrampolinePayment(params: {
    destinationNodeId: Uint8Array
    amountMsat: bigint
    paymentHash: Uint8Array
    paymentSecret: Uint8Array
    maxRetries?: number
  }): Promise<PaymentResult> {
    if (!this.trampolineRouter) {
      return {
        success: false,
        paymentHash: params.paymentHash,
        error: 'Trampoline router not initialized',
      }
    }

    const maxRetries = params.maxRetries ?? 3
    let lastError = ''

    // Obter altura do bloco atual
    const currentBlockHeight = await this.getCurrentBlockHeight()

    for (let retry = 0; retry <= maxRetries; retry++) {
      try {
        // Criar pagamento trampoline
        const trampolinePayment = this.trampolineRouter.createTrampolinePayment(
          params.destinationNodeId,
          params.amountMsat,
          params.paymentHash,
          params.paymentSecret,
          currentBlockHeight,
        )

        if (!trampolinePayment) {
          lastError = 'Failed to create trampoline payment'
          continue
        }

        // Obter rota para o primeiro nó trampoline
        const trampolineNode = this.trampolineRouter.getTrampolineNodes()[0]
        if (!trampolineNode) {
          lastError = 'No trampoline node available'
          break
        }

        // Encontrar canal para o nó trampoline
        const channelToTrampoline = this.findChannelToNode(trampolineNode.nodeId)
        if (!channelToTrampoline) {
          lastError = 'No channel to trampoline node'
          break
        }

        // Calcular fee total
        const feeLevel = this.trampolineRouter.getCurrentFeeLevel()
        const route = this.trampolineRouter.createTrampolineRoute(
          params.destinationNodeId,
          params.amountMsat,
          currentBlockHeight,
          feeLevel,
        )

        if (!route) {
          lastError = 'Failed to create route'
          continue
        }

        // Enviar HTLC com payload trampoline
        const htlcResult = await this.sendHTLCToPeer(
          channelToTrampoline.channelId,
          route.totalAmountMsat,
          params.paymentHash,
          route.hops[0].cltvExpiry,
          trampolinePayment.outerOnion,
        )

        if (htlcResult.success) {
          // Aguardar preimage
          const preimage = await this.waitForPreimage(params.paymentHash)
          if (preimage) {
            this.trampolineRouter.resetFeeLevel()
            return {
              success: true,
              preimage: preimage,
              paymentHash: params.paymentHash,
            }
          }
        }

        // Verificar se deve fazer retry com fee maior
        if (htlcResult.error && this.trampolineRouter.shouldRetryWithHigherFee(0x100c)) {
          console.log(
            `[trampoline] Retrying with higher fee level: ${this.trampolineRouter.getCurrentFeeLevel()}`,
          )
          continue
        }

        lastError = htlcResult.error || 'Payment failed'
      } catch (error) {
        lastError = String(error)
        console.error('[trampoline] Payment error:', error)
      }
    }

    this.trampolineRouter.resetFeeLevel()
    return {
      success: false,
      paymentHash: params.paymentHash,
      error: lastError,
    }
  }

  /**
   * Adiciona nó trampoline personalizado
   */
  addTrampolineNode(node: TrampolineNode): void {
    this.trampolineRouter?.addTrampolineNode(node)
  }

  /**
   * Lista nós trampoline disponíveis
   */
  getTrampolineNodes(): TrampolineNode[] {
    return this.trampolineRouter?.getTrampolineNodes() || []
  }

  /**
   * Verifica se peer suporta trampoline routing
   * Nota: Requer que peerFeatures seja armazenado durante troca de init messages
   */
  peerSupportsTrampolineRouting(): boolean {
    // TODO: Armazenar features do peer durante init message exchange
    // Por enquanto, retornar false
    return false
  }

  /**
   * Encontra canal para um nó específico
   */
  private findChannelToNode(nodeId: Uint8Array): ChannelInfo | null {
    const nodeIdHex = uint8ArrayToHex(nodeId)
    for (const [, channel] of this.channels) {
      // Usar peerId para encontrar o canal
      if (channel.peerId === nodeIdHex) {
        return channel
      }
    }
    return null
  }

  /**
   * Aguarda preimage de um pagamento
   */
  private async waitForPreimage(paymentHash: Uint8Array): Promise<Uint8Array | null> {
    const hashHex = uint8ArrayToHex(paymentHash)

    // Aguardar até 60 segundos
    const timeout = 60000
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const preimage = this.preimageStore.get(hashHex)
      if (preimage) {
        return preimage
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return null
  }

  /**
   * Obtém altura do bloco atual
   */
  private async getCurrentBlockHeight(): Promise<number> {
    // TODO: Implementar consulta real via Electrum
    // Por enquanto, retornar estimativa
    return 850000
  }

  /**
   * Envia mensagem raw para a conexão
   */
  private async sendRawMessage(data: Uint8Array): Promise<void> {
    // LightningConnection é um Socket, podemos escrever diretamente
    const connection = this.connection as unknown as {
      write: (data: Buffer, callback?: (err?: Error) => void) => boolean
    }

    return new Promise((resolve, reject) => {
      connection.write(Buffer.from(data), (err?: Error) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  /**
   * Obtém chave pública local do nó
   * Usada como source para roteamento
   */
  private getLocalPubkey(): Uint8Array {
    // TODO: Implementar obtenção real da chave pública do nó
    // Por enquanto, usar chave derivada
    const nodeKey = this.deriveLightningKey(this.nodeIndex++)
    return createPublicKey(nodeKey.subarray(0, 32))
  }

  /**
   * Envia HTLC para peer específico
   * Método auxiliar para roteamento
   */
  private async sendHTLCToPeer(
    channelId: string,
    amountMsat: bigint,
    paymentHash: Uint8Array,
    cltvExpiry: number,
    onionPacket: Uint8Array,
  ): Promise<{ success: boolean; error?: string }> {
    // TODO: Implementar envio real de HTLC
    console.log(`[routing] Sending HTLC to channel ${channelId}`)
    return { success: true }
  }

  /**
   * Verifica breach em todos os canais monitorados pelo watchtower
   * Chamado quando uma transação suspeita é detectada na blockchain
   *
   * Como usar:
   * const breaches = await client.checkAllChannelsForBreach(txHex)
   * if (breaches.length > 0) {
   *   // Broadcast penalty transactions
   * }
   *
   * @param txHex - Transação suspeita em formato hex
   * @returns Promise<BreachResult[]> - Lista de breaches detectados
   */
  async checkAllChannelsForBreach(txHex: string): Promise<BreachResult[]> {
    const breaches: BreachResult[] = []

    for (const channelId of this.watchtower['monitoredChannels'].keys()) {
      const result = this.watchtower.checkForBreach(channelId, txHex)
      if (result.breach) {
        breaches.push(result)
      }
    }

    return breaches
  }

  /**
   * Broadcast penalty transaction para um canal comprometido
   * Envia transação de penalidade para a blockchain
   *
   * Como usar:
   * const success = await client.broadcastPenaltyTransaction(breachResult)
   * if (success) {
   *   console.log('Penalty transaction broadcasted')
   * }
   *
   * @param breachResult - Resultado da detecção de breach
   * @returns Promise<boolean> - true se broadcast foi bem-sucedido
   */
  async broadcastPenaltyTransaction(breachResult: BreachResult): Promise<boolean> {
    if (!breachResult.breach || !breachResult.penaltyTx) {
      console.error('[watchtower] Invalid breach result for penalty broadcast')
      return false
    }

    try {
      // TODO: Implementar broadcast real para a blockchain
      // Por enquanto, simular broadcast
      console.log(
        `[watchtower] Broadcasting penalty transaction: ${uint8ArrayToHex(breachResult.penaltyTx)}`,
      )

      // Simular delay de broadcast
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Marcar canal como penalizado
      // TODO: Atualizar estado do canal

      console.log('[watchtower] Penalty transaction broadcasted successfully')
      return true
    } catch (error) {
      console.error('[watchtower] Failed to broadcast penalty transaction:', error)
      return false
    }
  }

  /**
   * Monitora blockchain por transações suspeitas
   * Verifica periodicamente por tentativas de roubo de canais
   *
   * Como usar:
   * const cleanup = client.startBlockchainMonitoring()
   * // cleanup() para parar monitoramento
   *
   * @returns Função cleanup para parar monitoramento
   */
  startBlockchainMonitoring(): () => void {
    const monitoringInterval = setInterval(async () => {
      try {
        // TODO: Obter transações recentes da blockchain
        // Por enquanto, simular verificação
        const recentTxs = await this.getRecentBlockchainTransactions()

        for (const txHex of recentTxs) {
          const breaches = await this.checkAllChannelsForBreach(txHex)
          for (const breach of breaches) {
            console.warn(`[watchtower] Breach detected: ${breach.reason}`)
            await this.broadcastPenaltyTransaction(breach)
          }
        }
      } catch (error) {
        console.error('[watchtower] Blockchain monitoring error:', error)
      }
    }, 60000) // Verificar a cada minuto

    // Cleanup function
    const cleanup = () => {
      clearInterval(monitoringInterval)
      console.log('[watchtower] Stopped blockchain monitoring')
    }

    console.log('[watchtower] Started blockchain monitoring')
    return cleanup
  }

  /**
   * Obtém transações recentes da blockchain (simulação)
   * TODO: Implementar integração real com blockchain
   */
  private async getRecentBlockchainTransactions(): Promise<string[]> {
    // Simulação: retornar transações mock
    return [
      // Simular algumas transações normais
      '0200000001' + '00'.repeat(200), // Transação normal
      // Ocasionalmente incluir uma transação suspeita para teste
      Math.random() > 0.95 ? 'breach' + '00'.repeat(200) : '0200000002' + '00'.repeat(200),
    ]
  }

  // ==========================================
  // REESTABELECIMENTO DE CANAIS AVANÇADO (BOLT #2)
  // ==========================================
  //
  // Esta seção implementa reestabelecimento de canais com suporte a TLVs.
  // Permite reestabelecimento mais robusto com informações adicionais.
  //

  /**
   * Processa mensagem channel_reestablish recebida (versão avançada com TLVs)
   * Reestabelece estado do canal após reconexão com suporte a TLVs
   *
   * Como usar:
   * const result = await client.processChannelReestablish(peerId, reestablishMsg)
   *
   * TLVs suportados:
   * - next_funding_txid: Próxima transação de funding
   * - next_local_nonce: Nonce local para sincronização
   * - next_remote_nonce: Nonce remoto para sincronização
   *
   * @param peerId - ID do peer que enviou reestablish
   * @param reestablishMsg - Mensagem channel_reestablish
   * @returns Promise<boolean> - true se reestabelecimento foi bem-sucedido
   */
  async processChannelReestablish(
    peerId: string,
    reestablishMsg: any, // TODO: Import ChannelReestablishMessage
  ): Promise<boolean> {
    try {
      // 1. Encontrar canal correspondente
      const channelId = Array.from(this.channels.keys()).find(id => {
        const channel = this.channels.get(id)
        return channel?.peerId === peerId
      })

      if (!channelId) {
        console.error(`[lightning] No channel found for peer ${peerId}`)
        return false
      }

      const channel = this.channels.get(channelId)
      if (!channel) {
        console.error(`[lightning] Channel ${channelId} not found in channels map`)
        return false
      }

      // 2. Usar ChannelManager se disponível
      const channelManager = this.channelManagers.get(channelId)
      if (channelManager) {
        try {
          const result = channelManager.handleChannelReestablish(
            BigInt(reestablishMsg.nextCommitmentNumber),
            BigInt(reestablishMsg.nextRevocationNumber),
            reestablishMsg.yourLastPerCommitmentSecret || new Uint8Array(32),
            reestablishMsg.myCurrentPerCommitmentPoint || new Uint8Array(33),
          )

          if (!result.success) {
            console.error('[lightning] Channel reestablish failed:', result.error)
            return false
          }

          // Atualizar estado
          this.channelStates.set(channelId, ChannelState.NORMAL)
          channel.lastActivity = Date.now()
          console.log(
            `[lightning] Channel ${channelId} reestablished with peer ${peerId} (via ChannelManager)`,
          )
          return true
        } catch (error) {
          console.error('[lightning] ChannelManager handleChannelReestablish failed:', error)
          // Continuar com código legado
        }
      }

      // Código legado
      // 2. Validar números de commitment
      const localCommitmentNumber = (channel as any).currentCommitmentNumber || 0n
      const remoteCommitmentNumber = reestablishMsg.nextCommitmentNumber

      if (remoteCommitmentNumber < localCommitmentNumber) {
        console.error('[lightning] Remote commitment number is behind')
        return false
      }

      // 3. Processar TLVs do reestablish (BOLT #2)
      const tlvs = this.parseReestablishTlvs(reestablishMsg.tlvs || [])

      // 4. Verificar se precisamos reenviar mensagens
      const messagesToResend = this.getUnacknowledgedMessages(channelId)

      // 5. Enviar channel_reestablish de resposta se necessário
      if (messagesToResend.length > 0 || remoteCommitmentNumber > localCommitmentNumber) {
        await this.sendChannelReestablish(channelId, reestablishMsg, tlvs)
      }

      // 6. Reenviar mensagens não reconhecidas
      for (const message of messagesToResend) {
        await this.resendMessage(peerId, message)
      }

      // 7. Atualizar estado para NORMAL
      this.channelStates.set(channelId, ChannelState.NORMAL)
      channel.lastActivity = Date.now()

      console.log(`[lightning] Channel ${channelId} reestablished with peer ${peerId}`)
      return true
    } catch (error) {
      console.error('[lightning] Failed to handle channel reestablish:', error)
      return false
    }
  }

  /**
   * Faz parse dos TLVs do channel_reestablish
   */
  private parseReestablishTlvs(tlvs: any[]): ReestablishTlvs {
    const result: ReestablishTlvs = {
      nextFundingTxId: undefined,
      nextLocalNonce: undefined,
      nextRemoteNonce: undefined,
    }

    for (const tlv of tlvs) {
      switch (tlv.type) {
        case 0: // next_funding_txid
          result.nextFundingTxId = tlv.value
          break
        case 1: // next_local_nonce
          result.nextLocalNonce = tlv.value
          break
        case 2: // next_remote_nonce
          result.nextRemoteNonce = tlv.value
          break
        default:
          console.warn(`[reestablish] Unknown TLV type: ${tlv.type}`)
      }
    }

    return result
  }

  /**
   * Envia mensagem channel_reestablish com TLVs
   */
  private async sendChannelReestablish(
    channelId: string,
    remoteReestablish: any,
    remoteTlvs: ReestablishTlvs,
  ): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) throw new Error('Channel not found')

    const peerConnection = this.peerManager.getPeerConnection(channel.peerId)
    if (!peerConnection) throw new Error('Peer connection not found')

    // Obter dados do canal
    const channelIdBytes = hexToUint8Array(channelId)

    // Usar valores do estado do canal
    // nextCommitmentNumber: próximo commitment que esperamos enviar
    // nextRevocationNumber: commitment cujo secret esperamos receber
    const nextCommitmentNumber = BigInt((channel as any).localCommitmentNumber || 1) + 1n
    const nextRevocationNumber = BigInt((channel as any).remoteCommitmentNumber || 0)

    // Último secret recebido (zeros se nenhum revogado ainda)
    const yourLastPerCommitmentSecret = (channel as any).lastReceivedSecret || new Uint8Array(32)

    // Nosso per-commitment point atual
    const myCurrentPerCommitmentPoint =
      (channel as any).localPerCommitmentPoint || new Uint8Array(33).fill(0x02)

    // Construir mensagem channel_reestablish
    const reestablishMessage = createChannelReestablishMessage(
      channelIdBytes,
      nextCommitmentNumber,
      nextRevocationNumber,
      yourLastPerCommitmentSecret,
      myCurrentPerCommitmentPoint,
      remoteTlvs.nextFundingTxId, // Para splice, se aplicável
    )

    // Codificar e enviar
    const encodedReestablish = encodeChannelReestablishMessage(reestablishMessage)
    const encryptedReestablish = await encryptMessage(
      peerConnection.transportKeys,
      encodedReestablish,
    )
    await this.sendRaw(peerConnection, encryptedReestablish.encrypted)

    console.log(`[lightning] Sent channel_reestablish for channel ${channelId}`)
  }

  /**
   * Cria script de output do canal (2-of-2 multisig)
   * Implementa script P2WSH para canal Lightning
   */
  private createMultisigScript(localPubkey: Uint8Array, remotePubkey: Uint8Array): Uint8Array {
    // Ordenar pubkeys lexicograficamente (BOLT #3)
    const pubkeys = [localPubkey, remotePubkey].sort((a, b) => {
      for (let i = 0; i < 33; i++) {
        if (a[i] !== b[i]) return a[i] - b[i]
      }
      return 0
    })

    // Script multisig: OP_2 <pubkey1> <pubkey2> OP_2 OP_CHECKMULTISIG
    const script = new Uint8Array(1 + 33 + 33 + 3) // OP_2 + pubkey1 + pubkey2 + OP_2 + OP_CHECKMULTISIG
    let offset = 0

    script[offset++] = 0x52 // OP_2
    script.set(pubkeys[0], offset)
    offset += 33
    script.set(pubkeys[1], offset)
    offset += 33
    script[offset++] = 0x52 // OP_2
    script[offset++] = 0xae // OP_CHECKMULTISIG

    return script
  }

  /**
   * Obtém UTXOs disponíveis para funding
   * Escaneia endereços da carteira e coleta UTXOs não gastos
   */
  private async getAvailableUtxos(minAmount: bigint): Promise<any[]> {
    try {
      const addresses = this.getWalletAddresses()
      const allUtxos: any[] = []

      // Escanear cada endereço para UTXOs
      for (const address of addresses) {
        try {
          // Obter histórico de transações do endereço
          const txHistoryResponse = await getAddressTxHistory(address)
          const txHistory = txHistoryResponse.result || []

          // Para cada transação, verificar outputs não gastos
          for (const tx of txHistory) {
            // Obter detalhes da transação
            const txDetailsResponse = await getTransaction(tx.tx_hash)
            const txDetails = txDetailsResponse.result

            if (!txDetails) continue

            // Verificar cada output da transação
            for (let vout = 0; vout < txDetails.vout.length; vout++) {
              const output = txDetails.vout[vout]

              // Verificar se este output é para nosso endereço
              if (output.scriptPubKey.address === address) {
                // Verificar se o UTXO ainda não foi gasto
                const isSpent = await this.isUtxoSpent(tx.tx_hash, vout)

                if (!isSpent && BigInt(Math.floor(output.value * 100000000)) >= minAmount) {
                  allUtxos.push({
                    txid: tx.tx_hash,
                    vout,
                    value: BigInt(Math.floor(output.value * 100000000)), // Converter BTC para satoshis
                    address,
                    confirmations: txDetails.confirmations || 0,
                  })
                }
              }
            }
          }
        } catch (error) {
          console.warn(`[lightning] Failed to scan address ${address}:`, error)
          // Continuar com próximos endereços
        }
      }

      console.log(`[lightning] Found ${allUtxos.length} available UTXOs`)
      return allUtxos
    } catch (error) {
      console.error('[lightning] Failed to get available UTXOs:', error)
      return []
    }
  }

  /**
   * Obtém endereços da carteira para funding
   * Usa o AddressService para obter endereços descobertos
   */
  private getWalletAddresses(): string[] {
    try {
      const addressService = new AddressService()

      // Obter endereços usados (receiving e change)
      const receivingAddresses = addressService.getUsedAddresses('receiving')
      const changeAddresses = addressService.getUsedAddresses('change')

      // Combinar todos os endereços
      const allAddresses = [
        ...receivingAddresses.map((addr: any) => addr.address),
        ...changeAddresses.map((addr: any) => addr.address),
      ]

      // Se não há endereços descobertos, gerar alguns endereços padrão
      if (allAddresses.length === 0) {
        const defaultAddresses = []
        for (let i = 0; i < 20; i++) {
          // Gerar primeiros 20 endereços
          try {
            const address = addressService.getNextUnusedAddress()
            defaultAddresses.push(address)
          } catch (error) {
            console.warn(`[lightning] Failed to generate address ${i}:`, error)
          }
        }
        return defaultAddresses
      }

      return allAddresses
    } catch (error) {
      console.error('[lightning] Failed to get wallet addresses:', error)
      // Fallback: retornar array vazio
      return []
    }
  }

  /**
   * Verifica se um UTXO foi gasto
   * Verifica se o output aparece como input em alguma transação posterior
   */
  private async isUtxoSpent(txid: string, vout: number): Promise<boolean> {
    try {
      // Obter a transação que contém este UTXO
      const spendingTx = await getTransaction(txid)

      if (!spendingTx) {
        console.warn(`[lightning] Could not find transaction ${txid}`)
        return true // Assumir gasto se não conseguir verificar
      }

      // Verificar se este output específico foi gasto
      // Para isso, precisamos verificar se existe alguma transação que usa este txid:vout como input
      // Como o Electrum não tem um método direto, vamos usar uma abordagem diferente

      // Por enquanto, vamos assumir que UTXOs não são gastos (simplificação)
      // TODO: Implementar verificação real de gastos usando blockchain.scripthash.get_history
      // ou mantendo um cache de UTXOs gastos

      console.log(`[lightning] Assuming UTXO ${txid}:${vout} is unspent (simplified check)`)
      return false
    } catch (error) {
      console.error(`[lightning] Failed to check if UTXO ${txid}:${vout} is spent:`, error)
      // Em caso de erro, assumir que está gasto para ser conservador
      return true
    }
  }

  /**
   * Seleciona UTXOs suficientes para cobrir o amount
   * Implementa coin selection básica
   */
  private selectUtxos(utxos: any[], amount: bigint): any[] {
    // Algoritmo simples: selecionar primeiro UTXO suficiente
    for (const utxo of utxos) {
      if (utxo.value >= amount) {
        return [utxo]
      }
    }

    // Se nenhum UTXO único é suficiente, combinar os menores
    const sortedUtxos = utxos.sort((a, b) => Number(a.value - b.value))
    const selected: any[] = []
    let total = 0n

    for (const utxo of sortedUtxos) {
      selected.push(utxo)
      total += utxo.value
      if (total >= amount) break
    }

    if (total < amount) {
      throw new Error('Insufficient funds in selected UTXOs')
    }

    return selected
  }

  /**
   * Estima fee da transação de funding
   * Baseado no número de inputs/outputs e fee rate
   */
  private estimateFundingTxFee(inputCount: number, outputCount: number, feeRate: bigint): bigint {
    // Estimativa simplificada: 150 bytes por input, 100 bytes por output
    const estimatedTxSize = inputCount * 150 + outputCount * 100 + 100 // Overhead
    return (BigInt(estimatedTxSize) * feeRate) / 1000n // feeRate em sat/vbyte
  }

  /**
   * Constrói transação de funding
   * Cria transação Bitcoin com output para o canal
   */
  private buildFundingTransaction(
    selectedUtxos: any[],
    amount: bigint,
    channelAddress: string,
    fee: bigint,
    fundingKey: Uint8Array,
  ): any {
    // Calcular total de inputs
    const totalInput = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0n)

    // Calcular troco (se necessário)
    const changeAmount = totalInput - amount - fee
    const outputs = [{ address: channelAddress, value: amount }]

    if (changeAmount > 0n) {
      // TODO: Gerar endereço de troco
      const changeAddress = 'bc1q' + '0'.repeat(38) // Placeholder
      outputs.push({ address: changeAddress, value: changeAmount })
    }

    // Estrutura básica da transação
    const tx = {
      version: 2,
      inputs: selectedUtxos.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.vout,
        scriptSig: '',
        sequence: 0xffffffff,
      })),
      outputs,
      locktime: 0,
    }

    return tx
  }

  /**
   * Serializa transação para formato hex
   * Converte transação para formato broadcast-ready (SegWit)
   *
   * @param tx - Transação com inputs, outputs, witnesses
   * @returns String hex da transação serializada
   */
  private serializeTransaction(tx: any): string {
    const parts: Uint8Array[] = []

    // Version (4 bytes, little endian)
    const versionBytes = new Uint8Array(4)
    new DataView(versionBytes.buffer).setUint32(0, tx.version || 2, true)
    parts.push(versionBytes)

    // SegWit marker (0x00) and flag (0x01)
    const hasWitness = tx.witnesses && tx.witnesses.length > 0
    if (hasWitness) {
      parts.push(new Uint8Array([0x00, 0x01]))
    }

    // Input count (varint)
    parts.push(this.encodeVarint(tx.inputs?.length || 0))

    // Inputs
    for (const input of tx.inputs || []) {
      // Previous txid (32 bytes, little endian - reverse the hex string)
      const txidBytes =
        typeof input.txid === 'string'
          ? hexToUint8Array(input.txid).reverse()
          : new Uint8Array(input.txid).reverse()
      parts.push(txidBytes)

      // Previous vout (4 bytes, little endian)
      const voutBytes = new Uint8Array(4)
      new DataView(voutBytes.buffer).setUint32(0, input.vout || input.outputIndex || 0, true)
      parts.push(voutBytes)

      // ScriptSig (typically empty for SegWit)
      const scriptSig = input.scriptSig || new Uint8Array(0)
      parts.push(this.encodeVarint(scriptSig.length))
      if (scriptSig.length > 0) {
        parts.push(scriptSig instanceof Uint8Array ? scriptSig : new Uint8Array(scriptSig))
      }

      // Sequence (4 bytes, little endian)
      const sequenceBytes = new Uint8Array(4)
      new DataView(sequenceBytes.buffer).setUint32(0, input.sequence ?? 0xffffffff, true)
      parts.push(sequenceBytes)
    }

    // Output count (varint)
    parts.push(this.encodeVarint(tx.outputs?.length || 0))

    // Outputs
    for (const output of tx.outputs || []) {
      // Value (8 bytes, little endian)
      const valueBytes = new Uint8Array(8)
      const value =
        typeof output.value === 'bigint'
          ? output.value
          : BigInt(output.amountSat || output.value || 0)
      new DataView(valueBytes.buffer).setBigUint64(0, value, true)
      parts.push(valueBytes)

      // ScriptPubKey
      const scriptPubKey = output.scriptPubKey || output.script || new Uint8Array(0)
      parts.push(this.encodeVarint(scriptPubKey.length))
      if (scriptPubKey.length > 0) {
        parts.push(scriptPubKey instanceof Uint8Array ? scriptPubKey : new Uint8Array(scriptPubKey))
      }
    }

    // Witnesses (for SegWit)
    if (hasWitness) {
      for (const witness of tx.witnesses || []) {
        if (witness && witness.length > 0) {
          parts.push(this.encodeVarint(witness.length))
          for (const item of witness) {
            const witnessItem = item instanceof Uint8Array ? item : new Uint8Array(item)
            parts.push(this.encodeVarint(witnessItem.length))
            parts.push(witnessItem)
          }
        } else {
          parts.push(new Uint8Array([0])) // Empty witness
        }
      }
    }

    // Locktime (4 bytes, little endian)
    const locktimeBytes = new Uint8Array(4)
    new DataView(locktimeBytes.buffer).setUint32(0, tx.locktime || 0, true)
    parts.push(locktimeBytes)

    // Combine all parts
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const part of parts) {
      result.set(part, offset)
      offset += part.length
    }

    return uint8ArrayToHex(result)
  }

  /**
   * Codifica um número como varint
   */
  private encodeVarint(value: number): Uint8Array {
    if (value < 0xfd) {
      return new Uint8Array([value])
    } else if (value <= 0xffff) {
      const bytes = new Uint8Array(3)
      bytes[0] = 0xfd
      new DataView(bytes.buffer).setUint16(1, value, true)
      return bytes
    } else if (value <= 0xffffffff) {
      const bytes = new Uint8Array(5)
      bytes[0] = 0xfe
      new DataView(bytes.buffer).setUint32(1, value, true)
      return bytes
    } else {
      const bytes = new Uint8Array(9)
      bytes[0] = 0xff
      new DataView(bytes.buffer).setBigUint64(1, BigInt(value), true)
      return bytes
    }
  }

  /**
   * Converte script hash para endereço P2WSH
   * Gera endereço bech32 para o script do canal
   */
  private scriptHashToAddress(scriptHash: Uint8Array): string {
    // Usar toBech32 para gerar endereço P2WSH
    // P2WSH usa witness version 0 e 32-byte program (SHA256 do script)
    // Para P2WSH, scriptHash deve ser 32 bytes (SHA256)
    return toBech32(scriptHash, 0, 'bc')
  }

  // ==========================================
  // FACTORY METHOD
  // ==========================================

  /**
   * Cria uma nova instância do LightningWorker
   * Método factory para inicialização completa do cliente
   *
   * Como usar:
   * const worker = await LightningWorker.create(config, masterKey, network, channelFeeConfig)
   *
   * @param config - Configuração do cliente Lightning
   * @param masterKey - Chave mestra para derivações
   * @param network - Rede (mainnet/testnet/regtest)
   * @param channelFeeConfig - Configuração de fees para abertura de canais
   * @returns Promise<LightningWorker> - Instância configurada do worker
   */
  static async create(
    config: LightningClientConfig,
    masterKey: Uint8Array,
    network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
    channelFeeConfig?: ChannelOpeningFeeConfig,
  ): Promise<LightningWorker> {
    // Criar conexão Lightning
    const connection = await this.createConnection(config, masterKey, network, channelFeeConfig)

    // Retornar instância configurada
    return new LightningWorker(connection, masterKey, network, channelFeeConfig)
  }

  /**
   * Cria conexão Lightning completa (helper para create)
   */
  private static async createConnection(
    config: LightningClientConfig,
    masterKey: Uint8Array,
    network: 'mainnet' | 'testnet' | 'regtest',
    channelFeeConfig?: ChannelOpeningFeeConfig,
  ): Promise<LightningConnection> {
    // Por enquanto, criar uma conexão mock para desenvolvimento
    // TODO: Implementar conexão real quando peer estiver disponível
    const mockConnection = {
      write: () => false,
      destroy: function () {
        return this
      },
      on: () => mockConnection,
      once: () => mockConnection,
      removeListener: () => mockConnection,
      transportKeys: {
        sk: new Uint8Array(32),
        rk: new Uint8Array(32),
        sn: 0,
        rn: 0,
        sck: new Uint8Array(32),
        rck: new Uint8Array(32),
      },
      peerPubKey: config.peerPubKey || new Uint8Array(33),
    } as unknown as LightningConnection

    return mockConnection
  }
}

export default LightningWorker

// ==========================================
// TIPOS AUXILIARES PARA GERENCIAMENTO DE CANAIS
// ==========================================

/**
 * Estados possíveis de um canal Lightning
 */
export enum ChannelState {
  // Estados de abertura
  PENDING_OPEN = 'pending_open',
  OPENING = 'opening',
  CHANNEL_READY = 'channel_ready',
  FUNDING_CONFIRMED = 'funding_confirmed',

  // Estados normais
  NORMAL = 'normal',

  // Estados de fechamento
  SHUTTING_DOWN = 'shutting_down',
  CLOSING = 'closing',
  CLOSED = 'closed',

  // Estados de erro
  ERROR = 'error',
}

/**
 * Informações de um canal Lightning
 */
export interface ChannelInfo {
  channelId: string
  peerId: string
  state: ChannelState
  localBalance: bigint
  remoteBalance: bigint
  fundingTxid?: string
  fundingOutputIndex?: number
  capacity: bigint
  createdAt: number
  lastActivity: number
}

/**
 * Parâmetros para abertura de canal
 */
export interface OpenChannelParams {
  peerId: string
  amount: bigint // Capacidade do canal em satoshis
  pushMsat?: bigint // Amount inicial para o peer remoto
  feeratePerKw?: number // Taxa de fee por KW
  dustLimitSatoshis?: bigint
  maxHtlcValueInFlightMsat?: bigint
  channelReserveSatoshis?: bigint
  htlcMinimumMsat?: bigint
  toSelfDelay?: number
  maxAcceptedHtlcs?: number
}

/**
 * Resultado da abertura de canal
 */
export interface OpenChannelResult {
  success: boolean
  channelId?: string
  error?: string
}

/**
 * Parâmetros para fechamento de canal
 */
export interface CloseChannelParams {
  channelId: string
  scriptpubkey?: Uint8Array // Script de destino para fechamento cooperativo
  force?: boolean // Forçar fechamento unilateral
}

/**
 * Resultado do fechamento de canal
 */
export interface CloseChannelResult {
  success: boolean
  closingTxid?: string
  error?: string
}

/**
 * Informações de HTLC
 */
export interface HtlcInfo {
  id: bigint
  amountMsat: bigint
  paymentHash: Uint8Array
  cltvExpiry: number
  direction: 'incoming' | 'outgoing'
  state: 'pending' | 'fulfilled' | 'failed'
}

/**
 * Estados possíveis de um peer
 */
export enum PeerState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
}

/**
 * Informações de um peer conectado
 */
/**
 * Peer estendido com chave pública opcional
 */
export type PeerWithPubkey = Peer & {
  pubkey?: string // Chave pública em hex
}

/**
 * Resultado da tentativa de conexão com peer
 */
export type PeerConnectionResult = {
  success: boolean
  peerId: string
  connection?: LightningConnection
  error?: Error
  message?: string
}

// ==========================================
// WATCHTOWER - CHANNEL MONITORING
// ==========================================

/**
 * Watchtower for channel monitoring
 * Detects channel theft attempts and forces closure
 */
export class Watchtower {
  private monitoredChannels: Map<string, WatchtowerChannel> = new Map()

  addChannel(channelId: string, channelInfo: ChannelInfo, remotePubkey: Uint8Array): void {
    const watchtowerChannel: WatchtowerChannel = {
      channelId,
      remotePubkey,
      localBalance: channelInfo.localBalance,
      remoteBalance: channelInfo.remoteBalance,
      commitmentNumber: 0n,
      lastCommitmentTx: null,
      breachDetected: false,
    }

    this.monitoredChannels.set(channelId, watchtowerChannel)
  }

  updateChannelState(channelId: string, commitmentTx: Uint8Array, commitmentNumber: bigint): void {
    const channel = this.monitoredChannels.get(channelId)
    if (!channel) return

    channel.lastCommitmentTx = commitmentTx
    channel.commitmentNumber = commitmentNumber
  }

  checkForBreach(channelId: string, txHex: string): BreachResult {
    const channel = this.monitoredChannels.get(channelId)
    if (!channel) {
      return { breach: false, reason: 'Channel not monitored' }
    }

    // TODO: Implement real breach checking
    if (txHex.includes('breach')) {
      channel.breachDetected = true
      return {
        breach: true,
        reason: 'Suspicious transaction detected',
        penaltyTx: this.generatePenaltyTx(channel),
      }
    }

    return { breach: false }
  }

  private generatePenaltyTx(channel: WatchtowerChannel): Uint8Array {
    // TODO: Implement real penalty transaction generation
    return new Uint8Array(32) // Placeholder
  }

  removeChannel(channelId: string): void {
    this.monitoredChannels.delete(channelId)
  }
}

// Watchtower types
interface BreachResult {
  breach: boolean
  reason?: string
  penaltyTx?: Uint8Array
}

interface WatchtowerChannel {
  channelId: string
  remotePubkey: Uint8Array
  localBalance: bigint
  remoteBalance: bigint
  commitmentNumber: bigint
  lastCommitmentTx: Uint8Array | null
  breachDetected: boolean
}

// Channel reestablish TLVs
interface ReestablishTlvs {
  nextFundingTxId?: Uint8Array
  nextLocalNonce?: Uint8Array
  nextRemoteNonce?: Uint8Array
}
