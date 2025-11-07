import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react'
import { lightningReducer, initialLightningState, LightningState, LightningAction } from './types'
import { MMKV } from 'react-native-mmkv'

const storage = new MMKV()
const LIGHTNING_STORAGE_KEY = 'lightning-state'

// Load initial state from storage
const loadPersistedLightningState = (): LightningState => {
  try {
    const persistedState = storage.getString(LIGHTNING_STORAGE_KEY)
    if (persistedState) {
      const parsed = JSON.parse(persistedState)
      // Merge with initial state to handle new properties
      return {
        ...initialLightningState,
        ...parsed,
        // Reset runtime states on app start
        isInitialized: false,
        isRunning: false,
        loadingState: false,
        isConnected: false,
        connectionErrors: [],
      }
    }
  } catch (error) {
    console.error('Error loading persisted lightning state:', error)
  }
  return initialLightningState
}

// Context
type LightningStateContextType = {
  state: LightningState
  dispatch: React.Dispatch<LightningAction>
}

const LightningStateContext = createContext<LightningStateContextType | undefined>(undefined)

// Provider
export const LightningStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(lightningReducer, loadPersistedLightningState())

  // Persist state changes
  useEffect(() => {
    try {
      // Create partial state for persistence (exclude runtime states)
      const stateToPersist = {
        channels: state.channels,
        invoices: state.invoices,
        payments: state.payments,
        nodes: state.nodes,
        lastGossipUpdate: state.lastGossipUpdate,
        isRoutingEnabled: state.isRoutingEnabled,
        trampolineEnabled: state.trampolineEnabled,
        maxRoutingFee: state.maxRoutingFee,
        maxRoutingHops: state.maxRoutingHops,
        lastConnectionAttempt: state.lastConnectionAttempt,
      }

      storage.set(LIGHTNING_STORAGE_KEY, JSON.stringify(stateToPersist))
    } catch (error) {
      console.error('Error persisting lightning state:', error)
    }
  }, [state])

  return (
    <LightningStateContext.Provider value={{ state, dispatch }}>
      {children}
    </LightningStateContext.Provider>
  )
}

export const useLightningState = (): LightningStateContextType => {
  const context = useContext(LightningStateContext)
  if (!context) {
    throw new Error('useLightningState must be used within a LightningStateProvider')
  }
  return context
}
