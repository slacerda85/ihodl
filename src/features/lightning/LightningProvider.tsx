import React, { createContext, useContext, useRef, useCallback, useEffect } from 'react'
import { useLightningState } from './LightningStateProvider'
import { useWallet } from '@/features/wallet'
import { lightningActions } from './types'
import { useBlockchain } from '@/features/blockchain'
import { LNTransport, LNPeerAddr } from '@/lib/lightning/lntransport'
import { GossipNetwork, GossipConfig } from '@/lib/lightning/gossip'
import { LNWallet } from '@/lib/lightning/lnwallet'

interface LightningContextType {
  // State
  isInitialized: boolean
  isRunning: boolean
  isConnected: boolean
  connectionErrors: any[]

  // Actions
  initializeLightning: () => Promise<void>
  connectToPeer: (peerAddress: string) => Promise<void>
  sendMessage: (peerAddress: string, message: Uint8Array) => Promise<void>
  createChannel: (
    peerAddress: string,
    fundingAmount: number,
    pushAmount?: number,
  ) => Promise<string>
  sendPayment: (invoice: string) => Promise<string>
  generateInvoice: (
    amountMsat?: number,
    description?: string,
    expirySeconds?: number,
  ) => Promise<any>
  getWalletInfo: () => any
  getChannels: () => any[]
  cleanup: () => void
}

const LightningContext = createContext<LightningContextType | null>(null)

export { LightningContext }

export function useLightningNetwork(): LightningContextType {
  const context = useContext(LightningContext)
  if (!context) {
    throw new Error('useLightningNetwork must be used within a LightningProvider')
  }
  return context
}

interface LightningProviderProps {
  children: React.ReactNode
}

export function LightningProvider({ children }: LightningProviderProps) {
  const { state: lightningState, dispatch: lightningDispatch } = useLightningState()
  const { activeWalletId, wallets } = useWallet()
  const { blockchainClient } = useBlockchain()

  // Shared refs across all hook instances
  const transportRef = useRef<LNTransport | null>(null)
  const gossipNetworkRef = useRef<GossipNetwork | null>(null)
  const walletRef = useRef<LNWallet | null>(null)
  const peerTransportsRef = useRef<Map<string, LNTransport>>(new Map())

  // State refs
  const isInitializedRef = useRef(false)
  const isRunningRef = useRef(false)

  // Helper function to dispatch Lightning actions
  const dispatchLightning = useCallback(
    (action: any) => {
      lightningDispatch(action)
    },
    [lightningDispatch],
  )

  // Get Lightning account from wallet
  const getLightningAccount = useCallback(() => {
    const activeWallet = wallets.find(w => w.walletId === activeWalletId)
    if (!activeWallet?.accounts) return null

    return activeWallet.accounts.find(acc => acc.purpose === 9735) || null
  }, [activeWalletId, wallets])

  // Initialize Gossip Network
  const initializeGossipNetwork = useCallback(async () => {
    if (gossipNetworkRef.current) return

    // Extract values outside try/catch for React Compiler optimization
    const maxPeers = lightningState.maxRoutingHops || 10
    const gossipTimeout = 30000
    const staleDataTimeout = 24 * 60 * 60 * 1000 // 24 hours

    try {
      console.log('[LightningNetwork] Initializing Gossip Network...')

      // Create gossip configuration
      const gossipConfig: GossipConfig = {
        maxPeers,
        gossipTimeout,
        staleDataTimeout,
        knownPeers: [], // Will be populated from known nodes
      }

      gossipNetworkRef.current = new GossipNetwork(gossipConfig)
      console.log('[LightningNetwork] Gossip Network initialized')
    } catch (error) {
      console.error('[LightningNetwork] Failed to initialize gossip network:', error)
      throw error
    }
  }, [lightningState.maxRoutingHops])

  // Initialize Lightning Wallet
  const initializeWallet = useCallback(async () => {
    if (walletRef.current) return

    const lightningAccount = getLightningAccount()
    if (!lightningAccount?.lightning?.derivedKeys?.nodeKey) {
      throw new Error('No Lightning node key available')
    }

    // Use shared blockchain client from context
    if (!blockchainClient) {
      throw new Error('Blockchain client not available')
    }

    try {
      console.log('[LightningNetwork] Initializing Lightning Wallet...')

      const walletConfig = {
        nodeId: lightningAccount.lightning.derivedKeys.nodeKey.nodeId,
        nodePrivateKey: lightningAccount.lightning.derivedKeys.nodeKey.privateKey,
        nodePublicKey: lightningAccount.lightning.derivedKeys.nodeKey.publicKey,
        maxChannels: 10,
        autoReconnect: true,
        blockchainClient,
      }

      walletRef.current = new LNWallet(walletConfig)
      await walletRef.current.initialize()

      console.log('[LightningNetwork] Lightning Wallet initialized')
    } catch (error) {
      console.error('[LightningNetwork] Failed to initialize wallet:', error)
      throw error
    }
  }, [getLightningAccount, blockchainClient])

  // Initialize Lightning Transport
  const initializeTransport = useCallback(async () => {
    if (transportRef.current) return

    const lightningAccount = getLightningAccount()
    if (!lightningAccount?.lightning?.derivedKeys?.nodeKey) {
      throw new Error('No Lightning node key available')
    }

    try {
      console.log('[LightningNetwork] Initializing Lightning Transport...')

      const nodePrivateKey = lightningAccount.lightning.derivedKeys.nodeKey.privateKey
      const nodeId = lightningAccount.lightning.derivedKeys.nodeKey.publicKey

      // Create local transport instance
      const localAddr = new LNPeerAddr('127.0.0.1', 9735, nodeId)
      transportRef.current = new LNTransport(nodePrivateKey, localAddr)

      console.log('[LightningNetwork] Lightning Transport initialized')
    } catch (error) {
      console.error('[LightningNetwork] Failed to initialize transport:', error)
      throw error
    }
  }, [getLightningAccount])

  // Start Gossip Network operations
  const startGossipNetwork = useCallback(async () => {
    if (!gossipNetworkRef.current) return

    try {
      console.log('[LightningNetwork] Starting Gossip Network...')
      await gossipNetworkRef.current.start()

      console.log('[LightningNetwork] Gossip Network started')
    } catch (error) {
      console.error('[LightningNetwork] Failed to start gossip network:', error)
      throw error
    }
  }, [])

  // Start Wallet operations
  const startWallet = useCallback(async () => {
    if (!walletRef.current) return

    try {
      console.log('[LightningNetwork] Starting Lightning Wallet...')
      await walletRef.current.start()
      console.log('[LightningNetwork] Lightning Wallet started')
    } catch (error) {
      console.error('[LightningNetwork] Failed to start wallet:', error)
      throw error
    }
  }, [])

  // Connect to known peers from gossip network
  const connectToKnownPeers = useCallback(async () => {
    // TODO: Implement peer discovery from gossip network
    console.log('[LightningNetwork] Connecting to known peers...')
  }, [])

  // Start network operations (connect to peers, process messages, etc.)
  const startNetworkOperations = useCallback(async () => {
    if (isRunningRef.current) return

    try {
      console.log('[LightningNetwork] Starting network operations...')

      // Start gossip network
      if (lightningState.isRoutingEnabled) {
        await startGossipNetwork()
      }

      // Start wallet
      await startWallet()

      // Connect to known peers
      await connectToKnownPeers()

      // Mark as connected and running
      dispatchLightning(lightningActions.setConnected(true))
      isRunningRef.current = true

      console.log('[LightningNetwork] Network operations started')
    } catch (error) {
      console.error('[LightningNetwork] Failed to start network operations:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      dispatchLightning(
        lightningActions.addConnectionError(`Network operations failed: ${errorMessage}`),
      )
    }
  }, [
    lightningState.isRoutingEnabled,
    startGossipNetwork,
    startWallet,
    connectToKnownPeers,
    dispatchLightning,
  ])

  // Initialize Lightning Network client
  const initializeLightning = useCallback(async () => {
    if (isInitializedRef.current || lightningState.isInitialized) {
      return
    }

    const lightningAccount = getLightningAccount()
    if (!lightningAccount?.lightning?.derivedKeys?.nodeKey) {
      console.log('[LightningNetwork] No Lightning node key found')
      return
    }

    try {
      console.log('[LightningNetwork] Initializing Lightning client...')

      // Initialize all components
      await initializeTransport()
      await initializeGossipNetwork()
      await initializeWallet()

      // Mark as initialized
      dispatchLightning(lightningActions.setLightningInitialized(true))
      dispatchLightning(lightningActions.setLightningRunning(true))
      isInitializedRef.current = true

      console.log('[LightningNetwork] Lightning client initialized successfully')

      // Start network operations
      startNetworkOperations()
    } catch (error) {
      console.error('[LightningNetwork] Failed to initialize Lightning client:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      dispatchLightning(
        lightningActions.addConnectionError(`Initialization failed: ${errorMessage}`),
      )
    }
  }, [
    lightningState.isInitialized,
    getLightningAccount,
    initializeTransport,
    initializeGossipNetwork,
    initializeWallet,
    dispatchLightning,
    startNetworkOperations,
  ])

  // Connect to a specific peer
  const connectToPeer = useCallback(
    async (peerAddress: string) => {
      const lightningAccount = getLightningAccount()
      if (!lightningAccount?.lightning?.derivedKeys?.nodeKey) {
        throw new Error('No Lightning node key available')
      }

      try {
        console.log(`[LightningNetwork] Connecting to peer: ${peerAddress}`)

        const peerAddr = LNPeerAddr.fromString(peerAddress)
        const peerKey = peerAddr.toString()

        // Check if already connected
        if (peerTransportsRef.current.has(peerKey)) {
          console.log(`[LightningNetwork] Already connected to peer: ${peerAddress}`)
          return
        }

        // Create new transport for this peer
        const peerTransport = new LNTransport(
          lightningAccount.lightning.derivedKeys.nodeKey.privateKey,
          peerAddr,
        )

        // Attempt handshake
        await peerTransport.handshake()

        // Store the connection
        peerTransportsRef.current.set(peerKey, peerTransport)

        console.log(`[LightningNetwork] Successfully connected to peer: ${peerAddress}`)
      } catch (error) {
        console.error(`[LightningNetwork] Failed to connect to peer ${peerAddress}:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        dispatchLightning(
          lightningActions.addConnectionError(
            `Connection to ${peerAddress} failed: ${errorMessage}`,
          ),
        )
        throw error
      }
    },
    [getLightningAccount, dispatchLightning],
  )

  // Send a message to a specific peer
  const sendMessage = useCallback(async (peerAddress: string, message: Uint8Array) => {
    const peerTransport = peerTransportsRef.current.get(peerAddress)
    if (!peerTransport) {
      throw new Error(`Not connected to peer: ${peerAddress}`)
    }

    try {
      await peerTransport.send(message)
    } catch (error) {
      console.error(`[LightningNetwork] Failed to send message to ${peerAddress}:`, error)
      throw error
    }
  }, [])

  // Create a new channel
  const createChannel = useCallback(
    async (peerAddress: string, fundingAmount: number, pushAmount: number = 0) => {
      if (!walletRef.current) {
        throw new Error('Lightning wallet not initialized')
      }

      try {
        console.log(
          `[LightningNetwork] Creating channel with ${peerAddress}, amount: ${fundingAmount}`,
        )

        const peerAddr = LNPeerAddr.fromString(peerAddress)
        const channelId = await walletRef.current.createChannel(peerAddr, fundingAmount, pushAmount)

        console.log(`[LightningNetwork] Channel created: ${channelId}`)
        return channelId
      } catch (error) {
        console.error('[LightningNetwork] Failed to create channel:', error)
        throw error
      }
    },
    [],
  )

  // Send a payment
  const sendPayment = useCallback(async (invoice: string) => {
    if (!walletRef.current) {
      throw new Error('Lightning wallet not initialized')
    }

    try {
      console.log(`[LightningNetwork] Sending payment for invoice: ${invoice}`)

      const paymentId = await walletRef.current.sendPayment(invoice)

      console.log(`[LightningNetwork] Payment sent: ${paymentId}`)
      return paymentId
    } catch (error) {
      console.error('[LightningNetwork] Failed to send payment:', error)
      throw error
    }
  }, [])

  // Generate an invoice
  const generateInvoice = useCallback(
    async (amountMsat?: number, description?: string, expirySeconds: number = 3600) => {
      if (!walletRef.current) {
        throw new Error('Lightning wallet not initialized')
      }

      try {
        console.log(`[LightningNetwork] Generating invoice for ${amountMsat} msat`)

        const invoice = await walletRef.current.generateInvoice(
          amountMsat,
          description,
          expirySeconds,
        )

        console.log(`[LightningNetwork] Invoice generated: ${invoice.bolt11}`)
        return invoice
      } catch (error) {
        console.error('[LightningNetwork] Failed to generate invoice:', error)
        throw error
      }
    },
    [],
  )

  // Get wallet information
  const getWalletInfo = useCallback(() => {
    if (!walletRef.current) {
      throw new Error('Lightning wallet not initialized')
    }

    return walletRef.current.getBalance()
  }, [])

  // Get channels
  const getChannels = useCallback(() => {
    if (!walletRef.current) return []

    return walletRef.current.getChannels()
  }, [])

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    console.log('[LightningNetwork] Cleaning up...')

    // Close all peer connections
    for (const [, transport] of peerTransportsRef.current) {
      transport.close()
    }
    peerTransportsRef.current.clear()

    // Close main transport
    if (transportRef.current) {
      transportRef.current.close()
      transportRef.current = null
    }

    // Stop gossip network
    if (gossipNetworkRef.current) {
      gossipNetworkRef.current.stop()
      gossipNetworkRef.current = null
    }

    // Stop wallet
    if (walletRef.current) {
      walletRef.current.stop()
      walletRef.current = null
    }

    dispatchLightning(lightningActions.setLightningRunning(false))
    dispatchLightning(lightningActions.setConnected(false))
    isInitializedRef.current = false
    isRunningRef.current = false
  }, [dispatchLightning])

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  const contextValue: LightningContextType = {
    // State
    isInitialized: lightningState.isInitialized,
    isRunning: lightningState.isRunning,
    isConnected: lightningState.isConnected,
    connectionErrors: lightningState.connectionErrors,

    // Actions
    initializeLightning,
    connectToPeer,
    sendMessage,
    createChannel,
    sendPayment,
    generateInvoice,
    getWalletInfo,
    getChannels,
    cleanup,
  }

  return <LightningContext.Provider value={contextValue}>{children}</LightningContext.Provider>
}
