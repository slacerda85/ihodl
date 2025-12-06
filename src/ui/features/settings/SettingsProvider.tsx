import React, {
  createContext,
  useContext,
  useReducer,
  ReactNode,
  useEffect,
  Dispatch,
  useMemo,
} from 'react'
import {
  settingsReducer,
  initialSettingsState,
  SettingsState,
  SettingsAction,
  settingsActions,
} from './state'
import { MMKV } from 'react-native-mmkv'
import { useColorScheme } from 'react-native'

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
type SettingsContextType = SettingsState & {
  isDark: boolean
  dispatch: Dispatch<SettingsAction>
  actions: typeof settingsActions
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

// Provider
export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(settingsReducer, loadPersistedSettingsState())
  const colorScheme = useColorScheme()
  const isDark =
    state.colorMode === 'dark' || (state.colorMode === 'auto' && colorScheme === 'dark')
  const actions = settingsActions

  // Persist state changes
  useEffect(() => {
    try {
      storage.set(SETTINGS_STORAGE_KEY, JSON.stringify(state))
    } catch (error) {
      console.error('Error persisting settings state:', error)
    }
  }, [state])

  const value = useMemo(
    () => ({
      ...state,
      isDark,
      dispatch,
      actions,
    }),
    [state, isDark, dispatch, actions],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

// Hook that provides settings with derived values
export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
