/**
 * Pathfinding Implementation - BOLT #4/#7
 *
 * Implementa algoritmos de pathfinding para roteamento Lightning.
 * Usa Dijkstra's algorithm para encontrar rotas ótimas no grafo.
 *
 * Referência: https://github.com/lightning/bolts/blob/master/04-onion-routing.md
 */

import { RoutingGraph, RouteHop, PathfindResult, RoutingNode, RoutingChannel } from './routing'

/**
 * Interface simplificada para Route (conforme roadmap)
 */
export interface Route {
  hops: RouteHop[]
  totalFee: bigint
  totalCltv: number
}

/**
 * Interface para RoutingGraph (conforme roadmap)
 */
export interface RoutingGraphInterface {
  findRoute(
    sourceNodeId: Uint8Array,
    destinationNodeId: Uint8Array,
    amountMsat: bigint,
    maxFeeMsat?: bigint,
    maxCltvExpiry?: number,
  ): PathfindResult
}

/**
 * Encontra rota usando Dijkstra's algorithm
 *
 * Esta é uma função wrapper que adapta a interface do roadmap
 * para usar a implementação existente em RoutingGraph.
 *
 * @param graph - Grafo de roteamento
 * @param source - Node ID de origem
 * @param destination - Node ID de destino
 * @param amountMsat - Valor a enviar em millisatoshis
 * @param maxFee - Fee máxima permitida (opcional)
 * @param maxCltv - CLTV máximo permitido (opcional)
 * @returns Rota encontrada ou null
 */
export function findRoute(
  graph: RoutingGraphInterface,
  source: Uint8Array,
  destination: Uint8Array,
  amountMsat: bigint,
  maxFee: bigint = 10000n,
  maxCltv: number = 144 * 24, // ~24 hours
): Route | null {
  try {
    const result = graph.findRoute(source, destination, amountMsat, maxFee, maxCltv)

    if (!result.route) {
      console.warn('[pathfinding] No route found:', result.error)
      return null
    }

    // Converter PaymentRoute para Route (interface do roadmap)
    const route: Route = {
      hops: result.route.hops,
      totalFee: result.route.totalFeeMsat,
      totalCltv: result.route.totalCltvExpiry,
    }

    console.log(
      `[pathfinding] Found route: ${result.route.hops.length} hops, fee: ${route.totalFee}msat, cltv: ${route.totalCltv}`,
    )

    return route
  } catch (error) {
    console.error('[pathfinding] Error finding route:', error)
    return null
  }
}

/**
 * Cria uma nova instância de RoutingGraph
 */
export function createRoutingGraph(): RoutingGraph {
  return new RoutingGraph()
}

/**
 * Adiciona canal ao grafo
 */
export function addChannelToGraph(
  graph: RoutingGraph,
  channelId: string,
  nodeId1: Uint8Array,
  nodeId2: Uint8Array,
  capacityMsat: bigint,
  feeBaseMsat: number = 1000,
  feeProportionalMillionths: number = 100,
  cltvExpiryDelta: number = 144,
  htlcMinimumMsat: bigint = 1n,
  htlcMaximumMsat?: bigint,
): void {
  const channel: RoutingChannel = {
    shortChannelId: channelId as any, // TODO: proper ShortChannelId conversion
    nodeId1,
    nodeId2,
    capacity: capacityMsat,
    lastUpdate: Date.now(),
    feeBaseMsat,
    feeProportionalMillionths,
    cltvExpiryDelta,
    htlcMinimumMsat,
    htlcMaximumMsat,
  }
  graph.addChannel(channel)
}

/**
 * Adiciona nó ao grafo
 */
export function addNodeToGraph(
  graph: RoutingGraph,
  nodeId: Uint8Array,
  alias?: string,
  features?: Uint8Array,
): void {
  const node: RoutingNode = {
    nodeId,
    features,
    lastUpdate: Date.now(),
    addresses: [], // TODO: add address support
    alias,
  }
  graph.addNode(node)
}

/**
 * Remove canal do grafo (não implementado na RoutingGraph atual)
 */
export function removeChannelFromGraph(graph: RoutingGraph, channelId: string): void {
  // TODO: Implement removeChannel in RoutingGraph
  console.warn('[pathfinding] removeChannelFromGraph not implemented')
}

/**
 * Remove nó do grafo (não implementado na RoutingGraph atual)
 */
export function removeNodeFromGraph(graph: RoutingGraph, nodeId: Uint8Array): void {
  // TODO: Implement removeNode in RoutingGraph
  console.warn('[pathfinding] removeNodeFromGraph not implemented')
}

/**
 * Atualiza fees de um canal (não implementado na RoutingGraph atual)
 */
export function updateChannelFees(
  graph: RoutingGraph,
  channelId: string,
  feeBaseMsat: number,
  feeProportionalMillionths: number,
): void {
  // TODO: Implement updateChannelFees in RoutingGraph
  console.warn('[pathfinding] updateChannelFees not implemented')
}

/**
 * Obtém estatísticas do grafo
 */
export function getGraphStats(graph: RoutingGraph): {
  nodeCount: number
  channelCount: number
  totalCapacity: bigint
} {
  const stats = graph.getStats()
  return {
    nodeCount: stats.nodes,
    channelCount: stats.channels,
    totalCapacity: 0n, // TODO: track total capacity
  }
}

/**
 * Valida se uma rota é válida
 */
export function validateRoute(
  route: Route,
  amountMsat: bigint,
): { valid: boolean; error?: string } {
  try {
    if (!route || route.hops.length === 0) {
      return { valid: false, error: 'Empty route' }
    }

    let currentAmount = amountMsat

    for (let i = 0; i < route.hops.length; i++) {
      const hop = route.hops[i]

      // Verificar limites HTLC
      if (currentAmount < hop.htlcMinimumMsat) {
        return {
          valid: false,
          error: `Amount ${currentAmount} below minimum ${hop.htlcMinimumMsat} at hop ${i}`,
        }
      }

      if (hop.htlcMaximumMsat && currentAmount > hop.htlcMaximumMsat) {
        return {
          valid: false,
          error: `Amount ${currentAmount} above maximum ${hop.htlcMaximumMsat} at hop ${i}`,
        }
      }

      // Calcular fee para próximo hop
      const fee =
        BigInt(hop.feeBaseMsat) + (currentAmount * BigInt(hop.feeProportionalMillionths)) / 1000000n
      currentAmount += fee
    }

    return { valid: true }
  } catch (error) {
    return { valid: false, error: `Validation error: ${error}` }
  }
}

/**
 * Calcula custo total de uma rota
 */
export function calculateRouteCost(
  route: Route,
  amountMsat: bigint,
): {
  totalFee: bigint
  totalAmount: bigint
  totalCltv: number
} {
  return {
    totalFee: route.totalFee,
    totalAmount: amountMsat + route.totalFee,
    totalCltv: route.totalCltv,
  }
}
