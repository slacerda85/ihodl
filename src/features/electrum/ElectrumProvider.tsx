import React, {
  createContext,
  useContext,
  useReducer,
  ReactNode,
  useEffect,
  useRef,
  useMemo,
} from 'react'
import {
  electrumReducer,
  initialElectrumState,
  ElectrumState,
  ElectrumAction,
  electrumActions,
} from './types'
import { MMKV } from 'react-native-mmkv'
import { TLSSocket } from 'tls'
import * as electrumLib from '@/lib/electrum'

const storage = new MMKV()
const ELECTRUM_STORAGE_KEY = 'electrum-state'

// Load initial state from storage
const loadPersistedElectrumState = (): ElectrumState => {
  try {
    const persistedState = storage.getString(ELECTRUM_STORAGE_KEY)
    if (persistedState) {
      const parsed = JSON.parse(persistedState)
      // Merge with initial state to handle new properties
      return {
        ...initialElectrumState,
        ...parsed,
        // Reset loading states on app start
        loadingPeers: false,
      }
    }
  } catch (error) {
    console.error('Error loading persisted electrum state:', error)
  }
  return initialElectrumState
}

// Context
type ElectrumContextType = {
  state: ElectrumState
  dispatch: React.Dispatch<ElectrumAction>
  // Connection management
  connection: TLSSocket | null
  isConnected: boolean
  isConnecting: boolean
  connectionError: string | null
  getConnection: () => Promise<TLSSocket>
  // Electrum API
  electrum: Record<string, any>
}

const ElectrumContext = createContext<ElectrumContextType | undefined>(undefined)

// Provider
export const ElectrumProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(electrumReducer, loadPersistedElectrumState())
  const hasInitializedPeers = useRef(false)

  // Connection state
  const [connection, setConnection] = React.useState<TLSSocket | null>(null)
  const [isConnected, setIsConnected] = React.useState(false)
  const [isConnecting, setIsConnecting] = React.useState(false)
  const [connectionError, setConnectionError] = React.useState<string | null>(null)
  const connectionTimeoutRef = useRef<number | null>(null)
  const CONNECTION_TIMEOUT = 5 * 60 * 1000 // 5 minutes

  // Close connection
  const closeConnection = React.useCallback(() => {
    if (connection) {
      try {
        electrumLib.close(connection)
        setConnection(null)
        setIsConnected(false)
        setConnectionError(null)
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current)
          connectionTimeoutRef.current = null
        }
        console.log('[ElectrumProvider] Connection closed')
      } catch (error) {
        console.error('[ElectrumProvider] Error closing connection:', error)
      }
    }
  }, [connection])

  // Get or create connection
  const getConnection = React.useCallback(async (): Promise<TLSSocket> => {
    if (connection && isConnected) {
      // Reset timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current)
      }
      connectionTimeoutRef.current = setTimeout(() => {
        console.log('[ElectrumProvider] Connection timeout reached, closing connection')
        closeConnection()
      }, CONNECTION_TIMEOUT)
      return connection
    }

    if (isConnecting) {
      // Wait for existing connection attempt
      return new Promise((resolve, reject) => {
        const checkConnection = () => {
          if (isConnected && connection) {
            resolve(connection)
          } else if (connectionError) {
            reject(new Error(connectionError))
          } else {
            setTimeout(checkConnection, 100)
          }
        }
        checkConnection()
      })
    }

    setIsConnecting(true)
    setConnectionError(null)

    try {
      console.log('[ElectrumProvider] Establishing Electrum connection...')
      const socket = await electrumLib.connect()
      setConnection(socket)
      setIsConnected(true)
      setIsConnecting(false)

      // Set timeout to close connection
      connectionTimeoutRef.current = setTimeout(() => {
        console.log('[ElectrumProvider] Connection timeout reached, closing connection')
        closeConnection()
      }, CONNECTION_TIMEOUT)

      console.log('[ElectrumProvider] Electrum connection established')
      return socket
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown connection error'
      console.error('[ElectrumProvider] Failed to connect:', errorMessage)
      setConnectionError(errorMessage)
      setIsConnecting(false)
      throw error
    }
  }, [connection, isConnected, isConnecting, connectionError, closeConnection, CONNECTION_TIMEOUT])

  // Electrum API with shared connection
  const electrum = useMemo(
    () => ({
      ...electrumLib,
      // Overrides for functions that need socket
      getBalance: async (address: string) => {
        const socket = await getConnection()
        return electrumLib.getBalance(address, socket)
      },
      getTransactions: async (address: string, minConfirmations = 1) => {
        const socket = await getConnection()
        return electrumLib.getTransactions(address, socket, minConfirmations)
      },
      estimateFeeRate: async (targetBlocks = 6) => {
        const socket = await getConnection()
        return electrumLib.estimateFeeRate(targetBlocks, socket)
      },
      getRecommendedFeeRates: async () => {
        const socket = await getConnection()
        return electrumLib.getRecommendedFeeRates(socket)
      },
      broadcastTransaction: async (rawTxHex: string) => {
        const socket = await getConnection()
        return electrumLib.broadcastTransaction(rawTxHex, socket)
      },
      getMempoolTransactions: async (addresses: string[]) => {
        const socket = await getConnection()
        return electrumLib.getMempoolTransactions(addresses, socket)
      },
      getTransaction: async (tx_hash: string, verbose = false) => {
        const socket = await getConnection()
        return electrumLib.getTransaction(tx_hash, verbose, socket)
      },
      getBlockHash: async (height: number) => {
        const socket = await getConnection()
        return electrumLib.getBlockHash(height, socket)
      },
      getTransactionsMultipleAddresses: async (addresses: string[], minConfirmations = 1) => {
        const socket = await getConnection()
        return electrumLib.getTransactionsMultipleAddresses(addresses, socket, minConfirmations)
      },
      getAddressTxHistory: async (address: string) => {
        const socket = await getConnection()
        return electrumLib.getAddressTxHistory(address, socket)
      },
      callElectrumMethod: async (method: string, params: any[]) => {
        const socket = await getConnection()
        return electrumLib.callElectrumMethod(method as any, params, socket)
      },
    }),
    [getConnection],
  )

  // Initialize Electrum peers on app startup
  useEffect(() => {
    if (!hasInitializedPeers.current) {
      hasInitializedPeers.current = true
      // Initialize electrum peers
      const initPeers = async () => {
        try {
          console.log('[ElectrumProvider] Initializing peers..')
          const actions = await electrumActions.updateTrustedPeers()
          actions.forEach(action => dispatch(action))
        } catch (error) {
          console.error('[ElectrumProvider] Error initializing peers:', error)
        }
      }
      initPeers()
    }
  }, [dispatch])

  // Persist state changes
  useEffect(() => {
    try {
      // Create partial state for persistence (exclude loading states)
      const stateToPersist = {
        trustedPeers: state.trustedPeers,
        lastPeerUpdate: state.lastPeerUpdate,
      }

      storage.set(ELECTRUM_STORAGE_KEY, JSON.stringify(stateToPersist))
    } catch (error) {
      console.error('Error persisting electrum state:', error)
    }
  }, [state])

  return (
    <ElectrumContext.Provider
      value={{
        state,
        dispatch,
        connection,
        isConnected,
        isConnecting,
        connectionError,
        getConnection,
        electrum,
      }}
    >
      {children}
    </ElectrumContext.Provider>
  )
}

export const useElectrum = (): ElectrumContextType => {
  const context = useContext(ElectrumContext)
  if (!context) {
    throw new Error('useElectrum must be used within an ElectrumProvider')
  }
  return context
}
