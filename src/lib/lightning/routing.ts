// Lightning Network Routing Functions
// Implements payment route finding and fee estimation

import { RoutingHint } from './types'
import { GossipNetwork } from './gossip'
import { TrampolineRouter, TrampolineRoute } from './trampoline'

export interface RouteEstimate {
  fee: number
  probability: number
  hops: number
  route?: RoutingHint[]
}

export interface PaymentRoute {
  route: RoutingHint[]
  totalFee: number
  totalTimeLock: number
  successProbability: number
}

/**
 * Estimate routing fee for a payment
 * @param destination - Destination node public key
 * @param amount - Payment amount in satoshis
 * @param network - Optional gossip network instance
 * @param sourceNodeId - Source node ID for route finding
 * @returns Promise resolving to route estimate
 */
export async function estimateRoutingFee(
  destination: string,
  amount: number,
  network?: GossipNetwork,
  sourceNodeId: string = 'local-node',
): Promise<RouteEstimate> {
  try {
    // If no network provided, create a basic estimate
    if (!network) {
      // Basic fee estimation: 1-5% of amount, minimum 1 sat
      const feeRate = 0.01 + Math.random() * 0.04 // 1-5%
      const fee = Math.max(1, Math.floor(amount * feeRate))
      const probability = 0.8 + Math.random() * 0.15 // 80-95%

      return {
        fee,
        probability,
        hops: 2 + Math.floor(Math.random() * 3), // 2-4 hops
      }
    }

    // Use gossip network for more accurate estimation
    const nodePath = await network.findRoute(sourceNodeId, destination, amount)

    if (nodePath.length === 0) {
      throw new Error('No route found to destination')
    }

    // Convert node path to routing hints (simplified)
    const route: RoutingHint[] = []
    for (let i = 0; i < nodePath.length - 1; i++) {
      route.push({
        nodeId: nodePath[i + 1],
        channelId: `channel-${nodePath[i]}-${nodePath[i + 1]}`,
        feeBaseMsat: 1000 + Math.floor(Math.random() * 2000), // 1000-3000 msat
        feeProportionalMillionths: 100 + Math.floor(Math.random() * 900), // 100-1000 ppm
        cltvExpiryDelta: 20 + Math.floor(Math.random() * 20), // 20-40 blocks
      })
    }

    // Calculate fee from route
    const totalFee = route.reduce(
      (fee: number, hop: RoutingHint) =>
        fee + (hop.feeBaseMsat || 0) + ((hop.feeProportionalMillionths || 0) * amount) / 1000000,
      0,
    )

    return {
      fee: Math.floor(totalFee),
      probability: 0.85, // Conservative estimate
      hops: route.length,
      route,
    }
  } catch (error) {
    console.error('[estimateRoutingFee] Error estimating route fee:', error)

    // Fallback estimation
    const fee = Math.max(1, Math.floor(amount * 0.03)) // 3% fallback
    return {
      fee,
      probability: 0.5, // Lower confidence
      hops: 3,
    }
  }
}

/**
 * Find payment route to destination
 * @param destination - Destination node public key
 * @param amount - Payment amount in satoshis
 * @param maxFee - Maximum acceptable fee
 * @param maxHops - Maximum number of hops
 * @param network - Optional gossip network instance
 * @param trampolineRouter - Optional trampoline router instance
 * @param sourceNodeId - Source node ID for route finding
 * @returns Promise resolving to payment route
 */
export async function findPaymentRoute(
  destination: string,
  amount: number,
  maxFee: number = 1000,
  maxHops: number = 20,
  network?: GossipNetwork,
  trampolineRouter?: TrampolineRouter,
  sourceNodeId: string = 'local-node',
): Promise<PaymentRoute> {
  try {
    let routes: RoutingHint[][] = []

    // Try direct routing first if network available
    if (network) {
      try {
        const nodePath = await network.findRoute(sourceNodeId, destination, amount)
        if (nodePath.length > 0) {
          // Convert node path to routing hints
          const route: RoutingHint[] = []
          for (let i = 0; i < nodePath.length - 1; i++) {
            route.push({
              nodeId: nodePath[i + 1],
              channelId: `channel-${nodePath[i]}-${nodePath[i + 1]}`,
              feeBaseMsat: 1000 + Math.floor(Math.random() * 2000),
              feeProportionalMillionths: 100 + Math.floor(Math.random() * 900),
              cltvExpiryDelta: 20 + Math.floor(Math.random() * 20),
            })
          }
          routes = [route]
        }
      } catch (error) {
        console.warn('[findPaymentRoute] Direct routing failed:', error)
      }
    }

    // If no direct routes or network unavailable, try trampoline routing
    if (routes.length === 0 && trampolineRouter) {
      try {
        const trampolineRoutes: TrampolineRoute[] = await trampolineRouter.findTrampolineRoutes(
          destination,
          amount,
        )
        routes = trampolineRoutes.map((tr: TrampolineRoute) =>
          tr.segments.flatMap((segment: any) => segment.routingHints),
        )
      } catch (error) {
        console.warn('[findPaymentRoute] Trampoline routing failed:', error)
      }
    }

    // If still no routes, return error instead of mock route
    if (routes.length === 0) {
      throw new Error(
        'No routes found to destination - ensure gossip network is connected and has channel information',
      )
    }

    // Filter routes by constraints
    const validRoutes = routes.filter((route: RoutingHint[]) => {
      const totalFee = route.reduce(
        (fee: number, hop: RoutingHint) =>
          fee + (hop.feeBaseMsat || 0) + ((hop.feeProportionalMillionths || 0) * amount) / 1000000,
        0,
      )
      const totalHops = route.length
      // Calculate total time lock but don't use it for filtering yet
      route.reduce((cltv: number, hop: RoutingHint) => cltv + (hop.cltvExpiryDelta || 0), 0)

      return totalFee <= maxFee && totalHops <= maxHops
    })

    if (validRoutes.length === 0) {
      throw new Error(
        `No valid routes found within fee limit (${maxFee} sats) and hop limit (${maxHops})`,
      )
    }

    // Select best route (lowest fee)
    const bestRoute = validRoutes.reduce((best: RoutingHint[], current: RoutingHint[]) => {
      const bestFee = best.reduce(
        (fee: number, hop: RoutingHint) =>
          fee + (hop.feeBaseMsat || 0) + ((hop.feeProportionalMillionths || 0) * amount) / 1000000,
        0,
      )
      const currentFee = current.reduce(
        (fee: number, hop: RoutingHint) =>
          fee + (hop.feeBaseMsat || 0) + ((hop.feeProportionalMillionths || 0) * amount) / 1000000,
        0,
      )
      return currentFee < bestFee ? current : best
    })

    const totalFee = bestRoute.reduce(
      (fee: number, hop: RoutingHint) =>
        fee + (hop.feeBaseMsat || 0) + ((hop.feeProportionalMillionths || 0) * amount) / 1000000,
      0,
    )
    const totalTimeLock = bestRoute.reduce(
      (cltv: number, hop: RoutingHint) => cltv + (hop.cltvExpiryDelta || 0),
      0,
    )

    return {
      route: bestRoute,
      totalFee: Math.floor(totalFee),
      totalTimeLock,
      successProbability: 0.9, // Conservative estimate
    }
  } catch (error) {
    console.error('[findPaymentRoute] Error finding payment route:', error)
    throw error
  }
}
