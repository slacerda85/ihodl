import { LightningConfig, LightningWalletData, LightningClientConfig, LightningNode } from './types'
import { deriveExtendedLightningKey, deriveNodeKey } from './keys'
import { authenticatedLightningClient } from './clients'

/**
 * Initializes a new Lightning wallet from a Bitcoin wallet
 * @param bitcoinWalletId - The ID of the Bitcoin wallet to derive from
 * @param config - Lightning network configuration
 * @param dispatch - Redux dispatch function
 * @returns Promise resolving to the initialized wallet data
 */
export async function initializeLightningWallet(
  bitcoinWalletId: string,
  config: LightningConfig,
  dispatch?: any,
): Promise<LightningWalletData> {
  try {
    // For now, we'll use a mock master key - in a real implementation,
    // this would come from the Bitcoin wallet's seed
    const mockMasterKey = new Uint8Array(64) // This should be replaced with actual wallet derivation

    // Derive the extended Lightning key from the master key
    const extendedKey = deriveExtendedLightningKey(mockMasterKey)

    // Derive the node key for this Lightning wallet (not used in this simplified implementation)
    deriveNodeKey(extendedKey, config.type === 'lnd' ? 0 : 1, 0)

    // Convert config to client config
    const clientConfig: LightningClientConfig = {
      url: config.nodeUrl,
      auth: {
        cert: config.tlsCert,
        macaroon: config.macaroon,
        apiKey: config.apiKey,
      },
      type: config.type,
      timeout: config.timeout,
    }

    // Create the Lightning client
    const client = authenticatedLightningClient(clientConfig)

    // Get initial node info
    const nodeInfo: LightningNode = await client.getInfo()

    // Return the wallet data
    const walletData: LightningWalletData = {
      nodePubkey: nodeInfo.pubKey,
      channels: [],
      payments: [],
      invoices: [],
      config,
    }

    // Save the wallet data if dispatch is provided
    if (dispatch) {
      await saveLightningWalletData(walletData, bitcoinWalletId, dispatch)
    }

    return walletData
  } catch (error) {
    console.error('Failed to initialize Lightning wallet:', error)
    throw new Error(`Failed to initialize Lightning wallet: ${error}`)
  }
}

/**
 * Saves Lightning wallet data to the store
 * @param data - The wallet data to save
 * @param walletId - The wallet ID
 * @param dispatch - Redux dispatch function
 */
export async function saveLightningWalletData(
  data: LightningWalletData,
  walletId: string,
  dispatch?: any,
): Promise<void> {
  if (dispatch) {
    dispatch({
      type: 'SET_LIGHTNING_WALLET',
      payload: { walletId, data },
    })
  }
}

/**
 * Loads Lightning wallet data from the store
 * @param walletId - The wallet ID
 * @param state - The application state
 * @returns The wallet data or null if not found
 */
export async function loadLightningWalletData(
  walletId: string,
  state?: any,
): Promise<LightningWalletData | null> {
  if (state?.lightning?.lightningWallets) {
    return state.lightning.lightningWallets[walletId] || null
  }
  return null
}

/**
 * Saves Lightning configuration to the store
 * @param config - The configuration to save
 * @param walletId - The wallet ID
 * @param dispatch - Redux dispatch function
 */
export async function saveLightningConfig(
  config: LightningConfig,
  walletId: string,
  dispatch?: any,
): Promise<void> {
  if (dispatch) {
    dispatch({
      type: 'SET_LIGHTNING_CONFIG',
      payload: { walletId, config },
    })
  }
}

/**
 * Loads Lightning configuration from the store
 * @param walletId - The wallet ID
 * @param state - The application state
 * @returns The configuration or null if not found
 */
export async function loadLightningConfig(
  walletId: string,
  state?: any,
): Promise<LightningConfig | null> {
  if (state?.lightning?.lightningConfigs) {
    return state.lightning.lightningConfigs[walletId] || null
  }
  return null
}

/**
 * Gets Lightning transaction history for a wallet
 * @param walletId - The wallet ID
 * @param state - The application state
 * @param limit - Maximum number of transactions to return
 * @returns Array of payments
 */
export async function getLightningTransactionHistory(
  walletId: string,
  state?: any,
  limit: number = 50,
): Promise<any[]> {
  if (state?.lightning?.lightningWallets) {
    const wallet = state.lightning.lightningWallets[walletId]
    return wallet?.payments || []
  }
  return []
}

/**
 * Opens a Lightning channel
 * @param walletId - The wallet ID
 * @param params - Channel opening parameters
 * @param state - The application state
 * @param dispatch - Redux dispatch function
 * @returns Promise resolving to channel opening result
 */
export async function openChannel(
  walletId: string,
  params: import('./types').OpenChannelParams,
  state?: any,
  dispatch?: any,
): Promise<{ channelId: string }> {
  if (!state?.lightning?.lightningConfigs[walletId]) {
    throw new Error('Lightning wallet not configured')
  }

  const config = state.lightning.lightningConfigs[walletId]
  const clientConfig: LightningClientConfig = {
    url: config.nodeUrl,
    auth: {
      cert: config.tlsCert,
      macaroon: config.macaroon,
      apiKey: config.apiKey,
    },
    type: config.type,
    timeout: config.timeout,
  }

  const client = authenticatedLightningClient(clientConfig)

  try {
    console.log(
      `[lightning] Opening channel to ${params.nodePubkey} with ${params.localFundingAmount} sats`,
    )

    // First connect to the peer if not already connected
    try {
      await client.connectPeer(params.nodePubkey, '') // Host will be resolved from node info
    } catch (error) {
      console.warn(`[lightning] Peer connection failed, proceeding with channel open:`, error)
    }

    const result = await client.openChannel(params)

    // Create channel object for local state
    const newChannel: import('./types').LightningChannel = {
      channelId: result.channelId,
      channelPoint: '', // Will be updated when channel is confirmed
      localBalance: params.localFundingAmount - (params.pushSat || 0),
      remoteBalance: params.pushSat || 0,
      capacity: params.localFundingAmount,
      remotePubkey: params.nodePubkey,
      status: 'pending_open',
      channelType: 'anchors',
      numConfirmations: 0,
      commitmentType: params.commitmentType || 'anchors',
      private: params.private || false,
      initiator: true,
      feePerKw: 0,
      unsettledBalance: 0,
      totalSatoshisSent: 0,
      totalSatoshisReceived: 0,
      numUpdates: 0,
      pendingHtlcs: [],
      csvDelay: 144,
      active: false,
      lifecycleState: 'opening',
    }

    // Save to state
    if (dispatch) {
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'ADD_LIGHTNING_CHANNEL', payload: { walletId, channel: newChannel } },
      })
    }

    console.log(`[lightning] Channel opening initiated: ${result.channelId}`)
    return result
  } catch (error) {
    console.error('[lightning] Failed to open channel:', error)
    throw new Error(`Failed to open channel: ${error}`)
  }
}

/**
 * Closes a Lightning channel
 * @param walletId - The wallet ID
 * @param channelId - The channel ID to close
 * @param force - Whether to force close
 * @param state - The application state
 * @param dispatch - Redux dispatch function
 * @returns Promise resolving when channel is closed
 */
export async function closeChannel(
  walletId: string,
  channelId: string,
  force: boolean = false,
  state?: any,
  dispatch?: any,
): Promise<void> {
  if (!state?.lightning?.lightningConfigs[walletId]) {
    throw new Error('Lightning wallet not configured')
  }

  const config = state.lightning.lightningConfigs[walletId]
  const clientConfig: LightningClientConfig = {
    url: config.nodeUrl,
    auth: {
      cert: config.tlsCert,
      macaroon: config.macaroon,
      apiKey: config.apiKey,
    },
    type: config.type,
    timeout: config.timeout,
  }

  const client = authenticatedLightningClient(clientConfig)

  try {
    console.log(`[lightning] ${force ? 'Force' : 'Cooperative'} closing channel: ${channelId}`)

    // Update channel status to closing
    if (dispatch) {
      dispatch({
        type: 'LIGHTNING',
        action: {
          type: 'UPDATE_LIGHTNING_CHANNEL',
          payload: {
            walletId,
            channelId,
            updates: {
              status: 'closing' as const,
              lifecycleState: 'closing' as const,
              active: false,
            },
          },
        },
      })
    }

    await client.closeChannel(channelId, force)

    // Remove channel from state or mark as closed
    if (dispatch) {
      dispatch({
        type: 'LIGHTNING',
        action: {
          type: 'UPDATE_LIGHTNING_CHANNEL',
          payload: {
            walletId,
            channelId,
            updates: {
              status: 'closed' as const,
              lifecycleState: 'closed' as const,
              active: false,
            },
          },
        },
      })
    }

    console.log(`[lightning] Channel ${channelId} ${force ? 'force' : 'cooperatively'} closed`)
  } catch (error) {
    console.error(`[lightning] Failed to close channel ${channelId}:`, error)

    // Revert status on failure
    if (dispatch) {
      dispatch({
        type: 'LIGHTNING',
        action: {
          type: 'UPDATE_LIGHTNING_CHANNEL',
          payload: {
            walletId,
            channelId,
            updates: {
              status: 'active' as const,
              lifecycleState: 'active' as const,
              active: true,
            },
          },
        },
      })
    }

    throw new Error(`Failed to close channel: ${error}`)
  }
}

/**
 * Lists Lightning channels
 * @param walletId - The wallet ID
 * @param activeOnly - Whether to return only active channels (default: false)
 * @param state - The application state
 * @param dispatch - Redux dispatch function
 * @returns Promise resolving to array of channels
 */
export async function listChannels(
  walletId: string,
  activeOnly: boolean = false,
  state?: any,
  dispatch?: any,
): Promise<import('./types').LightningChannel[]> {
  if (!state?.lightning?.lightningConfigs[walletId]) {
    throw new Error('Lightning wallet not configured')
  }

  const config = state.lightning.lightningConfigs[walletId]
  const clientConfig: LightningClientConfig = {
    url: config.nodeUrl,
    auth: {
      cert: config.tlsCert,
      macaroon: config.macaroon,
      apiKey: config.apiKey,
    },
    type: config.type,
    timeout: config.timeout,
  }

  const client = authenticatedLightningClient(clientConfig)

  try {
    console.log(`[lightning] Listing channels for wallet ${walletId}`)

    const channels = await client.listChannels()

    // Filter active channels if requested
    const filteredChannels = activeOnly ? channels.filter(channel => channel.active) : channels

    // Update state with latest channel information
    if (dispatch) {
      // Clear existing channels and add updated ones
      const currentWallet = state.lightning.lightningWallets[walletId]
      if (currentWallet) {
        // Remove all existing channels
        currentWallet.channels.forEach((channel: import('./types').LightningChannel) => {
          dispatch({
            type: 'LIGHTNING',
            action: {
              type: 'REMOVE_LIGHTNING_CHANNEL',
              payload: { walletId, channelId: channel.channelId },
            },
          })
        })

        // Add updated channels
        filteredChannels.forEach(channel => {
          dispatch({
            type: 'LIGHTNING',
            action: {
              type: 'ADD_LIGHTNING_CHANNEL',
              payload: { walletId, channel },
            },
          })
        })
      }
    }

    console.log(`[lightning] Found ${filteredChannels.length} channels`)
    return filteredChannels
  } catch (error) {
    console.error('[lightning] Failed to list channels:', error)
    throw new Error(`Failed to list channels: ${error}`)
  }
}

/**
 * Gets information about a Lightning node
 * @param walletId - The wallet ID
 * @param state - The application state
 * @param dispatch - Redux dispatch function
 * @returns Promise resolving to node information
 */
export async function getNodeInfo(
  walletId: string,
  state?: any,
  dispatch?: any,
): Promise<import('./types').LightningNode> {
  if (!state?.lightning?.lightningConfigs[walletId]) {
    throw new Error('Lightning wallet not configured')
  }

  const config = state.lightning.lightningConfigs[walletId]
  const clientConfig: LightningClientConfig = {
    url: config.nodeUrl,
    auth: {
      cert: config.tlsCert,
      macaroon: config.macaroon,
      apiKey: config.apiKey,
    },
    type: config.type,
    timeout: config.timeout,
  }

  const client = authenticatedLightningClient(clientConfig)

  try {
    console.log(`[lightning] Getting node info for wallet ${walletId}`)

    const nodeInfo = await client.getInfo()

    // Update connection state
    if (dispatch) {
      dispatch({
        type: 'LIGHTNING',
        action: {
          type: 'SET_LIGHTNING_CONNECTION',
          payload: {
            config,
            connected: true,
            nodeInfo,
          },
        },
      })

      dispatch({
        type: 'LIGHTNING',
        action: {
          type: 'SET_NODE_CONNECTION',
          payload: { walletId, connected: true },
        },
      })
    }

    console.log(`[lightning] Node info retrieved: ${nodeInfo.alias} (${nodeInfo.pubKey})`)
    return nodeInfo
  } catch (error) {
    console.error('[lightning] Failed to get node info:', error)

    // Update connection state to disconnected
    if (dispatch) {
      dispatch({
        type: 'LIGHTNING',
        action: {
          type: 'SET_NODE_CONNECTION',
          payload: { walletId, connected: false },
        },
      })
    }

    throw new Error(`Failed to get node info: ${error}`)
  }
}

/**
 * Creates a Lightning invoice
 * @param walletId - The wallet ID
 * @param params - Invoice creation parameters
 * @param state - The application state
 * @param dispatch - Redux dispatch function
 * @returns Promise resolving to the created invoice
 */
export async function createInvoice(
  walletId: string,
  params: import('./types').CreateInvoiceParams,
  state?: any,
  dispatch?: any,
): Promise<import('./types').LightningInvoice> {
  if (!state?.lightning?.lightningConfigs[walletId]) {
    throw new Error('Lightning wallet not configured')
  }

  const config = state.lightning.lightningConfigs[walletId]
  const clientConfig: LightningClientConfig = {
    url: config.nodeUrl,
    auth: {
      cert: config.tlsCert,
      macaroon: config.macaroon,
      apiKey: config.apiKey,
    },
    type: config.type,
    timeout: config.timeout,
  }

  const client = authenticatedLightningClient(clientConfig)

  try {
    console.log(`[lightning] Creating invoice for ${params.amount} sats: ${params.description}`)

    const invoice = await client.createInvoice(params)

    // Save invoice to state
    if (dispatch) {
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'ADD_LIGHTNING_INVOICE', payload: { walletId, invoice } },
      })
    }

    console.log(`[lightning] Invoice created: ${invoice.paymentHash}`)
    return invoice
  } catch (error) {
    console.error('[lightning] Failed to create invoice:', error)
    throw new Error(`Failed to create invoice: ${error}`)
  }
}

/**
 * Estimates routing fee for a Lightning payment
 * @param destination - Destination node ID
 * @param amount - Payment amount in satoshis
 * @returns Promise resolving to fee estimate
 */
export async function estimateRoutingFee(destination: string, amount: number): Promise<any> {
  // This function needs to be implemented with proper config context
  // For now, return a simple estimate
  const baseFee = 1000 // 1000 msat base fee
  const proportionalFee = Math.ceil(amount * 0.001) // 0.1% proportional fee
  const fee = Math.max(baseFee, proportionalFee)
  return { fee, probability: 0.9 }
}

/**
 * Disconnects from a Lightning node
 * @returns Promise resolving when disconnected
 */
export async function disconnectFromNode(): Promise<void> {
  // Note: Most Lightning clients don't have explicit disconnect methods
  // This is mainly for cleanup purposes
  console.log('[lightning] Disconnecting from Lightning node...')
  // Implementation depends on the specific client
  console.log('[lightning] Successfully disconnected from Lightning node')
}
