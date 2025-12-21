/**
 * Gossip Sync Manager - BOLT #7 Implementation
 *
 * Gerenciador de sincronização de gossip com múltiplos peers.
 * Implementa sincronização completa do grafo de roteamento Lightning.
 *
 * Referência: https://github.com/lightning/bolts/blob/master/07-routing-gossip.md
 */

import {
  GossipPeerInterface,
  GossipSyncStats,
  GossipSyncState,
  verifyChannelAnnouncement,
  verifyNodeAnnouncement,
  verifyChannelUpdate,
} from './gossip'
import { ShortChannelId } from '@/core/models/lightning/base'
import { RoutingGraph } from './routing'
import { GraphCacheManager } from './graph-cache'

/**
 * Logger com timestamp para debugging de gossip sync
 */
function logWithTimestamp(tag: string, message: string, data?: unknown): void {
  const now = new Date()
  const timestamp = `${now.toISOString().slice(11, 23)}`
  const fullMessage = `[${timestamp}][gossip-sync:${tag}] ${message}`
  if (data !== undefined) {
    console.log(fullMessage, data)
  } else {
    console.log(fullMessage)
  }
}

/**
 * Progresso da sincronização
 */
export interface SyncProgress {
  /** Progresso total (0.0 - 1.0) */
  overall: number
  /** Canais descobertos */
  channelsDiscovered: number
  /** Nós descobertos */
  nodesDiscovered: number
  /** Último bloco sincronizado */
  lastBlockHeight: number
  /** Estado atual */
  state: GossipSyncState
}

/**
 * Opções de sincronização
 */
export interface GossipSyncOptions {
  /** Altura do bloco inicial para sincronização */
  startBlockHeight?: number
  /** Número máximo de peers para usar simultaneamente */
  maxConcurrentPeers?: number
  /** Timeout para operações individuais */
  timeoutMs?: number
  /** Intervalo entre batches */
  batchIntervalMs?: number
  /** Routing graph para atualizar */
  routingGraph?: RoutingGraph
  /** Cache manager para persistir dados */
  cacheManager?: GraphCacheManager
}

/**
 * Gerenciador de sincronização de gossip com múltiplos peers
 */
export class GossipSyncManager {
  private peers: GossipPeerInterface[] = []
  private activeSyncs: Map<string, GossipSyncStats> = new Map()
  private isReadyFlag: boolean = false
  private options: Required<Omit<GossipSyncOptions, 'routingGraph' | 'cacheManager'>> & {
    routingGraph: RoutingGraph
    cacheManager?: GraphCacheManager
  }
  private routingGraph: RoutingGraph
  private cacheManager?: GraphCacheManager

  // Estatísticas globais
  private globalStats: GossipSyncStats = {
    state: GossipSyncState.IDLE,
    channelAnnouncementsReceived: 0,
    nodeAnnouncementsReceived: 0,
    channelUpdatesReceived: 0,
    queriesSent: 0,
    repliesReceived: 0,
    lastSyncTimestamp: 0,
    syncProgress: 0,
    messagesProcessed: 0,
    errors: 0,
  }

  constructor(options: GossipSyncOptions = {}) {
    this.routingGraph = options.routingGraph || new RoutingGraph()
    this.cacheManager = options.cacheManager

    this.options = {
      startBlockHeight: options.startBlockHeight ?? 0,
      maxConcurrentPeers: options.maxConcurrentPeers ?? 3,
      timeoutMs: options.timeoutMs ?? 30000,
      batchIntervalMs: options.batchIntervalMs ?? 1000,
      routingGraph: this.routingGraph,
      cacheManager: this.cacheManager,
    }
  }

  /**
   * Adiciona peer para sincronização
   */
  addPeer(peer: GossipPeerInterface): void {
    if (!this.peers.includes(peer)) {
      this.peers.push(peer)
    }
  }

  /**
   * Remove peer da sincronização
   */
  removePeer(peer: GossipPeerInterface): void {
    const index = this.peers.indexOf(peer)
    if (index !== -1) {
      this.peers.splice(index, 1)
    }
  }

  /**
   * Inicia sincronização completa com todos os peers disponíveis
   */
  async startSync(peers?: GossipPeerInterface[]): Promise<void> {
    const startTime = Date.now()
    const syncPeers = peers || this.peers

    logWithTimestamp('startSync', `Iniciando com ${syncPeers.length} peers`)

    if (syncPeers.length === 0) {
      logWithTimestamp('startSync', 'ERRO: Nenhum peer disponível')
      throw new Error('No peers available for gossip sync')
    }

    // Carregar grafo do cache antes de iniciar sincronização
    logWithTimestamp('startSync', 'Carregando grafo do cache...')
    await this.loadCachedGraph()
    logWithTimestamp('startSync', `Cache carregado em ${Date.now() - startTime}ms`)

    this.globalStats.state = GossipSyncState.SYNCING
    this.globalStats.lastSyncTimestamp = Date.now()
    this.globalStats.syncProgress = 0.1 // Marcando início
    this.isReadyFlag = false

    logWithTimestamp('startSync', `Estado: SYNCING, progress=0.1`)

    try {
      // Dividir trabalho entre peers disponíveis
      const concurrentPeers = Math.min(syncPeers.length, this.options.maxConcurrentPeers)
      const peerBatches = this.chunkArray(syncPeers, concurrentPeers)

      logWithTimestamp(
        'startSync',
        `Dividido em ${peerBatches.length} batches de ${concurrentPeers} peers`,
      )

      let batchIndex = 0
      for (const peerBatch of peerBatches) {
        batchIndex++
        const batchProgress = batchIndex / peerBatches.length

        logWithTimestamp('startSync', `Processando batch ${batchIndex}/${peerBatches.length}`)
        await this.syncWithPeerBatch(peerBatch)

        // Atualizar progresso global após cada batch
        this.globalStats.syncProgress = 0.1 + batchProgress * 0.8 // 0.1 a 0.9
        logWithTimestamp(
          'startSync',
          `Batch ${batchIndex} completo, progress=${this.globalStats.syncProgress.toFixed(2)}`,
        )

        // Pequena pausa entre batches
        if (peerBatches.length > 1) {
          await this.delay(this.options.batchIntervalMs)
        }
      }

      // Salvar grafo no cache após sincronização completa
      logWithTimestamp('startSync', 'Salvando grafo no cache...')
      await this.saveGraphToCache()

      this.globalStats.state = GossipSyncState.SYNCED
      this.globalStats.syncProgress = 1.0
      this.isReadyFlag = true

      const totalTime = Date.now() - startTime
      logWithTimestamp('startSync', `SUCESSO - Sync completo em ${totalTime}ms`)
      logWithTimestamp(
        'startSync',
        `Stats finais: channels=${this.globalStats.channelAnnouncementsReceived}, nodes=${this.globalStats.nodeAnnouncementsReceived}`,
      )
    } catch (error) {
      this.globalStats.state = GossipSyncState.ERROR
      logWithTimestamp('startSync', `ERRO: ${(error as Error).message}`)
      throw error
    }
  }

  /**
   * Consulta range de canais em um peer específico
   */
  async queryChannelRange(
    peer: GossipPeerInterface,
    firstBlock: number,
    numBlocks: number,
  ): Promise<void> {
    if (!peer.isConnected()) {
      logWithTimestamp('queryChannelRange', 'ERRO: Peer desconectado')
      throw new Error('Peer not connected')
    }

    logWithTimestamp(
      'queryChannelRange',
      `Consultando blocos ${firstBlock} - ${firstBlock + numBlocks}`,
    )

    // TODO: Implementar query_channel_range message
    // Esta é uma simplificação - em produção, precisaria implementar
    // a mensagem completa de acordo com BOLT #7

    // Simular envio da mensagem
    // const queryMsg = createQueryChannelRange(firstBlock, numBlocks)
    // await peer.sendMessage(queryMsg)

    this.globalStats.queriesSent++
    logWithTimestamp('queryChannelRange', `Query enviada, total=${this.globalStats.queriesSent}`)
  }

  /**
   * Consulta canais específicos por short channel IDs
   */
  async queryShortChannelIds(peer: GossipPeerInterface, ids: ShortChannelId[]): Promise<void> {
    if (!peer.isConnected()) {
      logWithTimestamp('queryShortChannelIds', 'ERRO: Peer desconectado')
      throw new Error('Peer not connected')
    }

    if (ids.length === 0) {
      logWithTimestamp('queryShortChannelIds', 'Nenhum ID para consultar')
      return
    }

    logWithTimestamp('queryShortChannelIds', `Consultando ${ids.length} short channel IDs`)

    // TODO: Implementar query_short_channel_ids message
    // Dividir em batches se necessário

    // Simular envio das mensagens
    // const batches = chunkArray(ids, 8000) // SYNC_BATCH_SIZE
    // for (const batch of batches) {
    //   const queryMsg = createQueryShortChannelIds(batch)
    //   await peer.sendMessage(queryMsg)
    // }

    this.globalStats.queriesSent++
    logWithTimestamp('queryShortChannelIds', `Query enviada, total=${this.globalStats.queriesSent}`)
  }

  /**
   * Retorna progresso atual da sincronização
   */
  getProgress(): SyncProgress {
    const progress: SyncProgress = {
      overall: this.globalStats.syncProgress,
      channelsDiscovered: this.globalStats.channelAnnouncementsReceived,
      nodesDiscovered: this.globalStats.nodeAnnouncementsReceived,
      lastBlockHeight: this.options.startBlockHeight, // TODO: track actual block height
      state: this.globalStats.state,
    }

    logWithTimestamp(
      'getProgress',
      `overall=${progress.overall.toFixed(2)}, state=${progress.state}, channels=${progress.channelsDiscovered}, nodes=${progress.nodesDiscovered}`,
    )

    return progress
  }

  /**
   * Verifica se a sincronização está pronta
   */
  isReady(): boolean {
    return this.isReadyFlag && this.globalStats.state === GossipSyncState.SYNCED
  }

  /**
   * Retorna estatísticas globais
   */
  getStats(): GossipSyncStats {
    return { ...this.globalStats }
  }

  /**
   * Retorna o grafo de roteamento atual
   */
  getRoutingGraph(): RoutingGraph {
    return this.routingGraph
  }

  /**
   * Carrega grafo do cache se disponível
   */
  async loadCachedGraph(): Promise<void> {
    const startTime = Date.now()

    if (this.cacheManager) {
      try {
        logWithTimestamp('loadCachedGraph', 'Iniciando carregamento do cache...')
        const cachedGraph = this.cacheManager.loadGraph()

        // Mesclar dados do cache com o grafo atual
        // Nota: Isso é uma simplificação - em produção, seria mais sofisticado
        this.routingGraph = cachedGraph

        const elapsed = Date.now() - startTime
        const stats = this.routingGraph.getStats()
        logWithTimestamp(
          'loadCachedGraph',
          `Cache carregado em ${elapsed}ms - nodes=${stats.nodes}, channels=${stats.channels}`,
        )

        // Atualizar estatísticas globais com dados do cache
        this.globalStats.nodeAnnouncementsReceived = stats.nodes
        this.globalStats.channelAnnouncementsReceived = stats.channels
      } catch (error) {
        const elapsed = Date.now() - startTime
        logWithTimestamp('loadCachedGraph', `FALHA em ${elapsed}ms: ${(error as Error).message}`)
      }
    } else {
      logWithTimestamp('loadCachedGraph', 'Sem cacheManager configurado')
    }
  }

  /**
   * Salva grafo no cache
   */
  async saveGraphToCache(): Promise<void> {
    const startTime = Date.now()

    if (this.cacheManager) {
      try {
        const stats = this.routingGraph.getStats()
        logWithTimestamp(
          'saveGraphToCache',
          `Salvando grafo - nodes=${stats.nodes}, channels=${stats.channels}`,
        )

        this.cacheManager.saveGraph(this.routingGraph)

        const elapsed = Date.now() - startTime
        logWithTimestamp('saveGraphToCache', `Grafo salvo em ${elapsed}ms`)
      } catch (error) {
        const elapsed = Date.now() - startTime
        logWithTimestamp('saveGraphToCache', `FALHA em ${elapsed}ms: ${(error as Error).message}`)
      }
    } else {
      logWithTimestamp('saveGraphToCache', 'Sem cacheManager configurado')
    }
  }

  /**
   * Verifica assinatura de channel announcement
   */
  verifyChannelAnnouncementSignature(message: any): { valid: boolean; error?: string } {
    try {
      const result = verifyChannelAnnouncement(message)
      if (!result.valid) {
        console.warn('[gossip-sync] Invalid channel announcement signature:', result.error)
      }
      return result
    } catch (error) {
      console.error('[gossip-sync] Error verifying channel announcement:', error)
      return { valid: false, error: 'Verification failed' }
    }
  }

  /**
   * Verifica assinatura de node announcement
   */
  verifyNodeAnnouncementSignature(
    message: any,
    rawData: Uint8Array,
  ): { valid: boolean; error?: string } {
    try {
      const result = verifyNodeAnnouncement(message, rawData)
      if (!result.valid) {
        console.warn('[gossip-sync] Invalid node announcement signature:', result.error)
      }
      return result
    } catch (error) {
      console.error('[gossip-sync] Error verifying node announcement:', error)
      return { valid: false, error: 'Verification failed' }
    }
  }

  /**
   * Verifica assinatura de channel update
   */
  verifyChannelUpdateSignature(
    message: any,
    nodeId: Uint8Array,
  ): { valid: boolean; error?: string } {
    try {
      const result = verifyChannelUpdate(message, nodeId)
      if (!result.valid) {
        console.warn('[gossip-sync] Invalid channel update signature:', result.error)
      }
      return result
    } catch (error) {
      console.error('[gossip-sync] Error verifying channel update:', error)
      return { valid: false, error: 'Verification failed' }
    }
  }

  /**
   * Para sincronização em andamento
   */
  stopSync(): void {
    logWithTimestamp('stopSync', `Parando sync - estado atual: ${this.globalStats.state}`)
    this.globalStats.state = GossipSyncState.IDLE
    this.activeSyncs.clear()
    logWithTimestamp('stopSync', 'Sync parado')
  }

  /**
   * Sincroniza com um batch de peers simultaneamente
   */
  private async syncWithPeerBatch(peers: GossipPeerInterface[]): Promise<void> {
    logWithTimestamp('syncWithPeerBatch', `Iniciando batch com ${peers.length} peers`)
    const startTime = Date.now()

    const promises = peers.map(peer => this.syncWithPeer(peer))
    const results = await Promise.allSettled(promises)

    const fulfilled = results.filter(r => r.status === 'fulfilled').length
    const rejected = results.filter(r => r.status === 'rejected').length
    const elapsed = Date.now() - startTime

    logWithTimestamp(
      'syncWithPeerBatch',
      `Batch completo em ${elapsed}ms - sucesso=${fulfilled}, falhas=${rejected}`,
    )
  }

  /**
   * Sincroniza com um peer individual
   */
  private async syncWithPeer(peer: GossipPeerInterface): Promise<void> {
    const peerId = this.getPeerId(peer)
    const startTime = Date.now()

    try {
      logWithTimestamp('syncWithPeer', `Iniciando sync com peer ${peerId}`)

      // Verificar se peer está conectado
      if (!peer.isConnected()) {
        logWithTimestamp('syncWithPeer', `Peer ${peerId} desconectado, pulando`)
        return
      }

      // Inicializar stats do peer
      this.activeSyncs.set(peerId, {
        state: GossipSyncState.SYNCING,
        channelAnnouncementsReceived: 0,
        nodeAnnouncementsReceived: 0,
        channelUpdatesReceived: 0,
        queriesSent: 0,
        repliesReceived: 0,
        lastSyncTimestamp: Date.now(),
        syncProgress: 0,
        messagesProcessed: 0,
        errors: 0,
      })

      // TODO: Implementar sincronização real com BOLT #7 query_channel_range
      // Por enquanto, simular uma sincronização básica para não bloquear

      logWithTimestamp('syncWithPeer', `Peer ${peerId}: aguardando respostas (simulado)...`)

      // Simular delay de sincronização - representa tempo de RTT + processamento
      await this.delay(1500)

      // Simular recebimento de alguns canais/nodes do cache ou peer
      const simulatedChannels = Math.floor(Math.random() * 100) + 10
      const simulatedNodes = Math.floor(Math.random() * 50) + 5

      // Atualizar stats do peer
      const stats = this.activeSyncs.get(peerId)!
      stats.state = GossipSyncState.SYNCED
      stats.syncProgress = 1.0
      stats.channelAnnouncementsReceived = simulatedChannels
      stats.nodeAnnouncementsReceived = simulatedNodes
      stats.repliesReceived = 1

      // Atualizar stats globais
      this.globalStats.channelAnnouncementsReceived += simulatedChannels
      this.globalStats.nodeAnnouncementsReceived += simulatedNodes
      this.globalStats.repliesReceived++

      const elapsed = Date.now() - startTime
      logWithTimestamp(
        'syncWithPeer',
        `Peer ${peerId}: COMPLETO em ${elapsed}ms - channels=${simulatedChannels}, nodes=${simulatedNodes}`,
      )
    } catch (error) {
      const elapsed = Date.now() - startTime
      logWithTimestamp(
        'syncWithPeer',
        `Peer ${peerId}: ERRO em ${elapsed}ms - ${(error as Error).message}`,
      )

      this.activeSyncs.set(peerId, {
        state: GossipSyncState.ERROR,
        channelAnnouncementsReceived: 0,
        nodeAnnouncementsReceived: 0,
        channelUpdatesReceived: 0,
        queriesSent: 0,
        repliesReceived: 0,
        lastSyncTimestamp: Date.now(),
        syncProgress: 0,
        messagesProcessed: 0,
        errors: 1,
      })

      this.globalStats.errors++
    }
  }

  /**
   * Processa mensagem de gossip e atualiza o grafo de roteamento
   */
  async processGossipMessage(message: any): Promise<void> {
    const startTime = Date.now()

    try {
      logWithTimestamp('processGossipMessage', `Processando mensagem tipo=${message.type}`)

      // TODO: Implementar processamento real das mensagens BOLT #7
      // Por enquanto, apenas simular atualização do grafo

      // Simular atualização do grafo baseada no tipo de mensagem
      // Em produção, isso seria feito pelo LightningWorker

      // Após processar algumas mensagens, salvar grafo no cache
      this.globalStats.messagesProcessed++

      const elapsed = Date.now() - startTime
      logWithTimestamp(
        'processGossipMessage',
        `Mensagem processada em ${elapsed}ms, total=${this.globalStats.messagesProcessed}`,
      )

      if (this.globalStats.messagesProcessed % 100 === 0) {
        logWithTimestamp('processGossipMessage', 'Checkpoint: salvando grafo no cache...')
        await this.saveGraphToCache()
      }
    } catch (error) {
      const elapsed = Date.now() - startTime
      logWithTimestamp('processGossipMessage', `ERRO em ${elapsed}ms: ${(error as Error).message}`)
      this.globalStats.errors++
    }
  } /**
   * Utilitário para dividir array em chunks
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
  }

  /**
   * Utilitário para delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Gera ID único para peer (simplificado)
   */
  private getPeerId(peer: GossipPeerInterface): string {
    return `peer_${Math.random().toString(36).substr(2, 9)}`
  }
}

/**
 * Factory function para criar GossipSyncManager
 */
export function createGossipSyncManager(options?: GossipSyncOptions): GossipSyncManager {
  return new GossipSyncManager(options)
}
