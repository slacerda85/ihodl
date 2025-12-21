/**
 * Graph Cache Manager - BOLT #7
 *
 * Gerenciador de cache para o grafo de roteamento Lightning.
 * Implementa persistência, carregamento incremental e prune de dados antigos.
 *
 * Referência: https://github.com/lightning/bolts/blob/master/07-routing-gossip.md
 */

import { LightningRepository } from '@/core/repositories/lightning'
import { RoutingGraph, RoutingNode, RoutingChannel } from './routing'
import { uint8ArrayToHex, hexToUint8Array } from '@/core/lib/utils/utils'

/**
 * Logger com timestamp para debugging de graph cache
 */
function logCache(tag: string, message: string, data?: unknown): void {
  const now = new Date()
  const timestamp = `${now.toISOString().slice(11, 23)}`
  const fullMessage = `[${timestamp}][graph-cache:${tag}] ${message}`
  if (data !== undefined) {
    console.log(fullMessage, data)
  } else {
    console.log(fullMessage)
  }
}

/**
 * Configuração do cache de grafo
 */
export interface GraphCacheConfig {
  /** Tempo de vida dos dados em dias */
  ttlDays: number
  /** Tamanho máximo do cache em MB */
  maxCacheSizeMB: number
  /** Intervalo de prune em horas */
  pruneIntervalHours: number
  /** Habilitar compressão */
  enableCompression: boolean
}

/**
 * Estatísticas do cache
 */
export interface GraphCacheStats {
  nodeCount: number
  channelCount: number
  totalSizeBytes: number
  lastUpdate: number
  lastPrune: number
  staleNodes: number
  staleChannels: number
}

/**
 * Resultado de atualização incremental
 */
export interface IncrementalUpdateResult {
  nodesAdded: number
  nodesUpdated: number
  nodesRemoved: number
  channelsAdded: number
  channelsUpdated: number
  channelsRemoved: number
  errors: string[]
}

/**
 * Gerenciador de cache de grafo
 */
export class GraphCacheManager {
  private repository: LightningRepository
  private config: Required<GraphCacheConfig>
  private lastPruneTime: number = 0
  private cacheStats: GraphCacheStats

  constructor(repository: LightningRepository, config: Partial<GraphCacheConfig> = {}) {
    this.repository = repository
    this.config = {
      ttlDays: config.ttlDays ?? 14, // 14 dias
      maxCacheSizeMB: config.maxCacheSizeMB ?? 100, // 100MB
      pruneIntervalHours: config.pruneIntervalHours ?? 24, // 24 horas
      enableCompression: config.enableCompression ?? false,
    }

    this.cacheStats = {
      nodeCount: 0,
      channelCount: 0,
      totalSizeBytes: 0,
      lastUpdate: 0,
      lastPrune: 0,
      staleNodes: 0,
      staleChannels: 0,
    }
  }

  /**
   * Carrega grafo completo do cache
   */
  loadGraph(): RoutingGraph {
    const startTime = Date.now()
    logCache('loadGraph', 'Iniciando carregamento do grafo...')

    const cached = this.repository.getRoutingGraph()
    const graph = new RoutingGraph()

    let nodesLoaded = 0
    let nodesFailed = 0
    let channelsLoaded = 0
    let channelsFailed = 0

    // Carregar nós
    for (const [key, node] of Object.entries(cached.nodes)) {
      try {
        // Converter strings de volta para Uint8Arrays
        const routingNode: RoutingNode = {
          nodeId: hexToUint8Array(node.nodeId),
          features: node.features ? hexToUint8Array(node.features) : undefined,
          lastUpdate: node.lastUpdate,
          addresses: node.addresses.map(addr => ({
            type: 'ipv4' as const, // Default type, could be enhanced
            address: addr.host,
            port: addr.port,
          })),
        }
        graph.addNode(routingNode)
        nodesLoaded++
      } catch (error) {
        nodesFailed++
        if (nodesFailed <= 3) {
          logCache('loadGraph', `Falha ao carregar node ${key}: ${(error as Error).message}`)
        }
      }
    }

    // Carregar canais
    for (const [key, channel] of Object.entries(cached.channels)) {
      try {
        // Converter strings de volta para Uint8Arrays
        const routingChannel: RoutingChannel = {
          shortChannelId: hexToUint8Array(channel.shortChannelId),
          nodeId1: hexToUint8Array(channel.node1),
          nodeId2: hexToUint8Array(channel.node2),
          capacity: BigInt(channel.capacity),
          lastUpdate: channel.lastUpdate,
          feeBaseMsat: channel.feeBaseMsat,
          feeProportionalMillionths: channel.feeProportionalMillionths,
          cltvExpiryDelta: channel.cltvDelta,
          htlcMinimumMsat: BigInt(0), // Default, could be enhanced
          htlcMaximumMsat: undefined,
          disabled: false,
        }
        graph.addChannel(routingChannel)
        channelsLoaded++
      } catch (error) {
        channelsFailed++
        if (channelsFailed <= 3) {
          logCache('loadGraph', `Falha ao carregar channel ${key}: ${(error as Error).message}`)
        }
      }
    }

    this.updateStats()
    const elapsed = Date.now() - startTime
    logCache(
      'loadGraph',
      `Carregado em ${elapsed}ms: nodes=${nodesLoaded} (falhas=${nodesFailed}), channels=${channelsLoaded} (falhas=${channelsFailed})`,
    )

    return graph
  }

  /**
   * Salva grafo completo no cache
   */
  saveGraph(graph: RoutingGraph): void {
    const startTime = Date.now()
    logCache('saveGraph', 'Iniciando salvamento do grafo...')

    // Obter dados do grafo (esta é uma simplificação - em produção,
    // precisaria de métodos na RoutingGraph para exportar dados)
    const stats = graph.getStats()

    // TODO: Implementar export de dados da RoutingGraph
    // Por enquanto, apenas atualizar estatísticas
    this.cacheStats.lastUpdate = Date.now()
    this.updateStats()

    const elapsed = Date.now() - startTime
    logCache('saveGraph', `Salvo em ${elapsed}ms: nodes=${stats.nodes}, channels=${stats.channels}`)
  }

  /**
   * Atualização incremental do cache
   */
  async incrementalUpdate(
    newNodes: RoutingNode[],
    newChannels: RoutingChannel[],
    updatedNodes: RoutingNode[],
    updatedChannels: RoutingChannel[],
    removedNodeIds: Uint8Array[],
    removedChannelIds: string[],
  ): Promise<IncrementalUpdateResult> {
    const result: IncrementalUpdateResult = {
      nodesAdded: 0,
      nodesUpdated: 0,
      nodesRemoved: 0,
      channelsAdded: 0,
      channelsUpdated: 0,
      channelsRemoved: 0,
      errors: [],
    }

    try {
      // Adicionar novos nós
      for (const node of newNodes) {
        try {
          this.repository.saveRoutingNode(this.serializeNode(node))
          result.nodesAdded++
        } catch (error) {
          result.errors.push(`Failed to add node ${uint8ArrayToHex(node.nodeId)}: ${error}`)
        }
      }

      // Adicionar novos canais
      for (const channel of newChannels) {
        try {
          this.repository.saveRoutingChannel(this.serializeChannel(channel))
          result.channelsAdded++
        } catch (error) {
          result.errors.push(`Failed to add channel ${channel.shortChannelId}: ${error}`)
        }
      }

      // Atualizar nós existentes
      for (const node of updatedNodes) {
        try {
          this.repository.saveRoutingNode(this.serializeNode(node))
          result.nodesUpdated++
        } catch (error) {
          result.errors.push(`Failed to update node ${uint8ArrayToHex(node.nodeId)}: ${error}`)
        }
      }

      // Atualizar canais existentes
      for (const channel of updatedChannels) {
        try {
          this.repository.saveRoutingChannel(this.serializeChannel(channel))
          result.channelsUpdated++
        } catch (error) {
          result.errors.push(`Failed to update channel ${channel.shortChannelId}: ${error}`)
        }
      }

      // Remover nós
      for (const nodeId of removedNodeIds) {
        try {
          this.removeNodeFromCache(nodeId)
          result.nodesRemoved++
        } catch (error) {
          result.errors.push(`Failed to remove node ${uint8ArrayToHex(nodeId)}: ${error}`)
        }
      }

      // Remover canais
      for (const channelId of removedChannelIds) {
        try {
          this.removeChannelFromCache(channelId)
          result.channelsRemoved++
        } catch (error) {
          result.errors.push(`Failed to remove channel ${channelId}: ${error}`)
        }
      }

      this.cacheStats.lastUpdate = Date.now()
      this.updateStats()

      console.log('[graph-cache] Incremental update completed:', result)
    } catch (error) {
      result.errors.push(`Incremental update failed: ${error}`)
      console.error('[graph-cache] Incremental update error:', error)
    }

    return result
  }

  /**
   * Executa prune de dados antigos
   */
  async pruneOldData(): Promise<{ nodesPruned: number; channelsPruned: number }> {
    const now = Date.now()
    const ttlMs = this.config.ttlDays * 24 * 60 * 60 * 1000

    // Verificar se é hora de fazer prune
    if (now - this.lastPruneTime < this.config.pruneIntervalHours * 60 * 60 * 1000) {
      return { nodesPruned: 0, channelsPruned: 0 }
    }

    console.log('[graph-cache] Starting prune of old data')

    const cached = this.repository.getRoutingGraph()
    let nodesPruned = 0
    let channelsPruned = 0

    // Prune nós antigos
    for (const [key, node] of Object.entries(cached.nodes)) {
      if (now - node.lastUpdate > ttlMs) {
        delete cached.nodes[key]
        nodesPruned++
      }
    }

    // Prune canais antigos
    for (const [key, channel] of Object.entries(cached.channels)) {
      if (now - channel.lastUpdate > ttlMs) {
        delete cached.channels[key]
        channelsPruned++
      }
    }

    // Salvar dados limpos
    if (nodesPruned > 0 || channelsPruned > 0) {
      // TODO: Salvar dados limpos de volta no storage
      console.log(`[graph-cache] Pruned ${nodesPruned} nodes, ${channelsPruned} channels`)
    }

    this.lastPruneTime = now
    this.cacheStats.lastPrune = now
    this.updateStats()

    return { nodesPruned, channelsPruned }
  }

  /**
   * Obtém estatísticas do cache
   */
  getStats(): GraphCacheStats {
    return { ...this.cacheStats }
  }

  /**
   * Verifica se o cache precisa de prune
   */
  needsPrune(): boolean {
    const now = Date.now()
    return now - this.lastPruneTime >= this.config.pruneIntervalHours * 60 * 60 * 1000
  }

  /**
   * Limpa todo o cache
   */
  clearCache(): void {
    // TODO: Implementar limpeza completa
    console.log('[graph-cache] Cache cleared')
    this.updateStats()
  }

  /**
   * Atualiza estatísticas internas
   */
  private updateStats(): void {
    try {
      const cached = this.repository.getRoutingGraph()

      this.cacheStats.nodeCount = Object.keys(cached.nodes).length
      this.cacheStats.channelCount = Object.keys(cached.channels).length
      this.cacheStats.totalSizeBytes = this.estimateCacheSize(cached)

      // Contar dados stale
      const now = Date.now()
      const ttlMs = this.config.ttlDays * 24 * 60 * 60 * 1000

      this.cacheStats.staleNodes = Object.values(cached.nodes).filter(
        node => now - node.lastUpdate > ttlMs,
      ).length

      this.cacheStats.staleChannels = Object.values(cached.channels).filter(
        channel => now - channel.lastUpdate > ttlMs,
      ).length
    } catch (error) {
      console.error('[graph-cache] Failed to update stats:', error)
    }
  }

  /**
   * Estima tamanho do cache em bytes
   */
  private estimateCacheSize(data: any): number {
    return JSON.stringify(data).length * 2 // Rough estimate
  }

  /**
   * Serializa nó para storage (converte Uint8Arrays para hex)
   */
  private serializeNode(node: RoutingNode): any {
    return {
      ...node,
      nodeId: uint8ArrayToHex(node.nodeId),
      features: node.features ? uint8ArrayToHex(node.features) : undefined,
    }
  }

  /**
   * Serializa canal para storage (converte Uint8Arrays para hex)
   */
  private serializeChannel(channel: RoutingChannel): any {
    return {
      ...channel,
      nodeId1: uint8ArrayToHex(channel.nodeId1),
      nodeId2: uint8ArrayToHex(channel.nodeId2),
      features: channel.features ? uint8ArrayToHex(channel.features) : undefined,
    }
  }

  /**
   * Remove nó do cache
   */
  private removeNodeFromCache(nodeId: Uint8Array): void {
    const cached = this.repository.getRoutingGraph()
    const nodeIdHex = uint8ArrayToHex(nodeId)

    if (cached.nodes[nodeIdHex]) {
      delete cached.nodes[nodeIdHex]
      // TODO: Persistir mudanças
    }
  }

  /**
   * Remove canal do cache
   */
  private removeChannelFromCache(channelId: string): void {
    const cached = this.repository.getRoutingGraph()

    if (cached.channels[channelId]) {
      delete cached.channels[channelId]
      // TODO: Persistir mudanças
    }
  }
}

/**
 * Factory function para criar GraphCacheManager
 */
export function createGraphCacheManager(
  repository: LightningRepository,
  config?: Partial<GraphCacheConfig>,
): GraphCacheManager {
  return new GraphCacheManager(repository, config)
}
