import { useState, useCallback } from 'react'
import { useLightning } from './types'
import { Channel } from '@/lib/lightning/types'
import { estimateRoutingFee } from '@/lib/lightning'

export interface ChannelOpeningOptions {
  peerNodeId: string
  amount: number // Channel capacity in satoshis
  pushAmount?: number // Amount to push to peer
  targetPaymentAmount?: number // Amount we want to be able to send
  maxOnChainFee?: number // Maximum acceptable on-chain fee
  urgency?: 'low' | 'medium' | 'high' // How urgently we need this channel
}

export interface ChannelOpeningResult {
  success: boolean
  channel?: Channel
  onChainFee?: number
  error?: string
  estimatedTime?: number // Estimated time for channel to be usable
}

export interface LiquidityCheck {
  hasEnoughLiquidity: boolean
  currentCapacity: number
  requiredCapacity: number
  recommendedChannelSize: number
  estimatedOnChainFee: number
}

/**
 * Hook for automatic Lightning channel opening based on payment needs
 */
export function useLightningChannelOpener() {
  const { lightningState: networkState } = useLightning()

  const [isOpening, setIsOpening] = useState(false)
  const [lastOpeningResult, setLastOpeningResult] = useState<ChannelOpeningResult | null>(null)

  /**
   * Mock channel creation - in real implementation this would interact with LightningNetworkManager
   */
  const createChannel = useCallback(
    async (peerNodeId: string, amount: number, pushAmount: number = 0): Promise<string> => {
      // Generate a mock channel ID
      const channelId = `channel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      console.log(
        `[useLightningChannelOpener] Mock creating channel ${channelId} to ${peerNodeId} with ${amount} sats`,
      )

      // In a real implementation, this would:
      // 1. Call LightningNetworkManager to create the channel
      // 2. Wait for on-chain confirmation
      // 3. Update the lightning state with the new channel

      return channelId
    },
    [],
  )

  /**
   * Wait for channel confirmation (mock implementation)
   */
  const waitForChannelConfirmation = useCallback(async (channelId: string): Promise<Channel[]> => {
    // In a real implementation, this would wait for on-chain confirmation
    // For now, return mock channel data
    return [
      {
        channelId,
        fundingTxId: 'mock_funding_tx_' + Date.now(),
        fundingOutputIndex: 0,
        capacity: 100000,
        localBalance: 100000,
        remoteBalance: 0,
        status: 'pending' as const,
        peerId: 'mock_peer',
        channelPoint: 'mock_channel_point',
        localChannelReserve: 1000,
        remoteChannelReserve: 1000,
      },
    ]
  }, [])

  /**
   * Check if we have enough liquidity for a payment
   */
  const checkLiquidityForPayment = useCallback(
    async (paymentAmount: number, destination?: string): Promise<LiquidityCheck> => {
      try {
        // Get current total capacity
        const channels = Array.from(networkState.channels.values())
        const totalCapacity = channels.reduce(
          (sum: number, channel: Channel) => sum + channel.capacity,
          0,
        )

        // Estimate routing fee
        let routingFee: number
        if (destination) {
          const feeEstimate = await estimateRoutingFee(destination, paymentAmount)
          routingFee = feeEstimate.fee
        } else {
          routingFee = Math.floor(paymentAmount * 0.01) // 1% fallback
        }

        const totalRequired = paymentAmount + routingFee

        // Check if we have enough capacity
        const hasEnoughLiquidity = totalCapacity >= totalRequired

        // Calculate recommended channel size if needed
        let recommendedChannelSize: number
        if (hasEnoughLiquidity) {
          recommendedChannelSize = 0
        } else {
          recommendedChannelSize = Math.max(totalRequired * 2, 100000) // At least double the required amount, minimum 100k sats
        }

        // Estimate on-chain fee for channel opening (rough estimate)
        let estimatedOnChainFee: number
        if (recommendedChannelSize > 0) {
          estimatedOnChainFee = Math.floor(recommendedChannelSize * 0.0002) + 1000 // ~0.02% + base fee
        } else {
          estimatedOnChainFee = 0
        }

        return {
          hasEnoughLiquidity,
          currentCapacity: totalCapacity as number,
          requiredCapacity: totalRequired,
          recommendedChannelSize,
          estimatedOnChainFee,
        }
      } catch (error) {
        console.error('[useLightningChannelOpener] Error checking liquidity:', error)
        // Return conservative fallback
        return {
          hasEnoughLiquidity: false,
          currentCapacity: 0,
          requiredCapacity: paymentAmount,
          recommendedChannelSize: Math.max(paymentAmount * 2, 100000),
          estimatedOnChainFee: 2000, // Conservative estimate
        }
      }
    },
    [networkState.channels],
  )

  /**
   * Find a suitable peer for channel opening
   */
  const findSuitablePeer = useCallback(
    async (minCapacity: number): Promise<string | null> => {
      try {
        // Get known nodes from gossip network
        const nodes = Array.from(networkState.nodes.values())

        // Filter nodes that might be good peers (simplified logic)
        const suitablePeers = nodes
          .filter(node => {
            // Check if node has channels and is well-connected
            const nodeChannels = Array.from(networkState.channels.values()).filter(
              ch => ch.peerId === node.nodeId,
            )

            return nodeChannels.length > 0 // Has existing channels
          })
          .sort((a, b) => {
            // Prefer nodes with more channels (better connected)
            const aChannels = Array.from(networkState.channels.values()).filter(
              ch => ch.peerId === a.nodeId,
            ).length
            const bChannels = Array.from(networkState.channels.values()).filter(
              ch => ch.peerId === b.nodeId,
            ).length
            return bChannels - aChannels
          })

        if (suitablePeers.length > 0) {
          return suitablePeers[0].nodeId
        } else {
          return null
        }
      } catch (error) {
        console.error('[useLightningChannelOpener] Error finding suitable peer:', error)
        return null
      }
    },
    [networkState.nodes, networkState.channels],
  )

  /**
   * Open a channel automatically when needed for a payment
   */
  const openChannelForPayment = useCallback(
    async (
      paymentAmount: number,
      destination?: string,
      options: Partial<ChannelOpeningOptions> = {},
    ): Promise<ChannelOpeningResult> => {
      setIsOpening(true)
      setLastOpeningResult(null)

      try {
        // Check current liquidity
        const liquidityCheck = await checkLiquidityForPayment(paymentAmount, destination)

        if (liquidityCheck.hasEnoughLiquidity) {
          const result: ChannelOpeningResult = {
            success: true,
            error: 'Sufficient liquidity already available',
          }
          setLastOpeningResult(result)
          setIsOpening(false)
          return result
        }

        // Find a suitable peer for channel opening
        let peerNodeId: string | null
        if (options.peerNodeId) {
          peerNodeId = options.peerNodeId
        } else {
          peerNodeId = await findSuitablePeer(paymentAmount)
        }
        if (!peerNodeId) {
          const result: ChannelOpeningResult = {
            success: false,
            error: 'No suitable peer found for channel opening',
          }
          setLastOpeningResult(result)
          setIsOpening(false)
          return result
        }

        // Calculate channel parameters
        let channelSize: number
        if (options.amount) {
          channelSize = options.amount
        } else {
          channelSize = liquidityCheck.recommendedChannelSize
        }

        let pushAmount: number
        if (options.pushAmount) {
          pushAmount = options.pushAmount
        } else {
          pushAmount = 0
        }

        let maxFee: number
        if (options.maxOnChainFee) {
          maxFee = options.maxOnChainFee
        } else {
          maxFee = liquidityCheck.estimatedOnChainFee * 2
        }

        // Check if estimated fee is acceptable
        if (liquidityCheck.estimatedOnChainFee > maxFee) {
          const result: ChannelOpeningResult = {
            success: false,
            error: `Estimated on-chain fee (${liquidityCheck.estimatedOnChainFee} sats) exceeds maximum (${maxFee} sats)`,
          }
          setLastOpeningResult(result)
          setIsOpening(false)
          return result
        }

        console.log(
          `[useLightningChannelOpener] Opening channel to ${peerNodeId} with ${channelSize} sats capacity`,
        )

        // Open the channel
        const channelId = await createChannel(peerNodeId, channelSize, pushAmount)

        // Find the created channel
        const channels = await waitForChannelConfirmation(channelId)

        const result: ChannelOpeningResult = {
          success: true,
          channel: channels[0],
          onChainFee: liquidityCheck.estimatedOnChainFee,
          estimatedTime: 600, // ~10 minutes for channel to be usable
        }

        setLastOpeningResult(result)
        setIsOpening(false)
        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('[useLightningChannelOpener] Failed to open channel:', error)

        const result: ChannelOpeningResult = {
          success: false,
          error: errorMessage,
        }

        setLastOpeningResult(result)
        setIsOpening(false)
        return result
      }
    },
    [checkLiquidityForPayment, createChannel, findSuitablePeer, waitForChannelConfirmation],
  )

  /**
   * Open channel with specific parameters
   */
  const openChannelWithParams = useCallback(
    async (options: ChannelOpeningOptions): Promise<ChannelOpeningResult> => {
      setIsOpening(true)
      setLastOpeningResult(null)

      try {
        const peerNodeId = options.peerNodeId
        const amount = options.amount
        let pushAmount: number
        if (options.pushAmount !== undefined) {
          pushAmount = options.pushAmount
        } else {
          pushAmount = 0
        }
        const maxOnChainFee = options.maxOnChainFee

        // Estimate on-chain fee
        const estimatedFee = Math.floor(amount * 0.0002) + 1000

        if (maxOnChainFee) {
          if (estimatedFee > maxOnChainFee) {
            const result: ChannelOpeningResult = {
              success: false,
              error: `Estimated fee (${estimatedFee} sats) exceeds maximum (${maxOnChainFee} sats)`,
            }
            setLastOpeningResult(result)
            setIsOpening(false)
            return result
          }
        }

        console.log(
          `[useLightningChannelOpener] Opening channel to ${peerNodeId} with ${amount} sats`,
        )

        const channelId = await createChannel(peerNodeId, amount, pushAmount)
        const channels = await waitForChannelConfirmation(channelId)

        const result: ChannelOpeningResult = {
          success: true,
          channel: channels[0],
          onChainFee: estimatedFee,
          estimatedTime: 600,
        }

        setLastOpeningResult(result)
        setIsOpening(false)
        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('[useLightningChannelOpener] Failed to open channel:', error)

        const result: ChannelOpeningResult = {
          success: false,
          error: errorMessage,
        }

        setLastOpeningResult(result)
        setIsOpening(false)
        return result
      }
    },
    [createChannel, waitForChannelConfirmation],
  )

  /**
   * Get channel opening recommendations
   */
  const getChannelOpeningRecommendations = useCallback(
    async (
      paymentAmount: number,
    ): Promise<{
      shouldOpenChannel: boolean
      recommendedSize: number
      estimatedCost: number
      reason: string
    }> => {
      const liquidityCheck = await checkLiquidityForPayment(paymentAmount)

      if (liquidityCheck.hasEnoughLiquidity) {
        return {
          shouldOpenChannel: false,
          recommendedSize: 0,
          estimatedCost: 0,
          reason: 'Sufficient liquidity available',
        }
      }

      return {
        shouldOpenChannel: true,
        recommendedSize: liquidityCheck.recommendedChannelSize,
        estimatedCost: liquidityCheck.estimatedOnChainFee,
        reason: `Need ${liquidityCheck.recommendedChannelSize} sats capacity, currently have ${liquidityCheck.currentCapacity} sats`,
      }
    },
    [checkLiquidityForPayment],
  )

  return {
    // State
    isOpening,
    lastOpeningResult,

    // Actions
    checkLiquidityForPayment,
    openChannelForPayment,
    openChannelWithParams,
    findSuitablePeer,
    getChannelOpeningRecommendations,

    // Computed
    hasLastResult: !!lastOpeningResult,
    lastOpeningSuccessful: lastOpeningResult?.success || false,
  }
}
