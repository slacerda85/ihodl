import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { settingsReducer, initialSettingsState, SettingsState, SettingsAction } from './types'
import { MMKV } from 'react-native-mmkv'

const storage = new MMKV()
const SETTINGS_STORAGE_KEY = 'settings-state'

// Load initial state from storage
const loadPersistedSettingsState = (): SettingsState => {
  try {
    const persistedState = storage.getString(SETTINGS_STORAGE_KEY)
    if (persistedState) {
      const parsed = JSON.parse(persistedState)
      // Merge with initial state to handle new properties
      return {
        ...initialSettingsState,
        ...parsed,
      }
    }
  } catch (error) {
    console.error('Error loading persisted settings state:', error)
  }
  return initialSettingsState
}

// Context
type SettingsContextType = {
  state: SettingsState
  dispatch: React.Dispatch<SettingsAction>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

// Provider
export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(settingsReducer, loadPersistedSettingsState())

  // Persist state changes
  useEffect(() => {
    try {
      storage.set(SETTINGS_STORAGE_KEY, JSON.stringify(state))
    } catch (error) {
      console.error('Error persisting settings state:', error)
    }
  }, [state])

  return <SettingsContext.Provider value={{ state, dispatch }}>{children}</SettingsContext.Provider>
}

// Hook that provides settings with derived values
export const useSettings = () => {
  const { state, dispatch } = useContext(SettingsContext)!
  const colorScheme = useColorScheme()
  const effectiveColorMode = state.colorMode === 'auto' ? colorScheme : state.colorMode
  const isDark = effectiveColorMode === 'dark'

  return {
    // State
    colorMode: state.colorMode,
    maxBlockchainSizeGB: state.maxBlockchainSizeGB,
    trampolineRoutingEnabled: state.trampolineRoutingEnabled,
    userOverride: state.userOverride,
    isDark,

    // Actions
    setColorMode: (colorMode: any) => dispatch({ type: 'SET_COLOR_MODE', payload: colorMode }),
    setMaxBlockchainSize: (size: number) =>
      dispatch({ type: 'SET_MAX_BLOCKCHAIN_SIZE', payload: size }),
    setTrampolineRouting: (enabled: boolean) =>
      dispatch({ type: 'SET_TRAMPOLINE_ROUTING', payload: enabled }),
  }
}
