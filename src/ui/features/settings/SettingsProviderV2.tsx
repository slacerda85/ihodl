/**
 * SettingsProviderV2 - Versão Otimizada
 *
 * PRINCÍPIOS:
 * 1. Settings persistidos no MMKV
 * 2. useSyncExternalStore para reatividade sem duplicação de estado
 * 3. Cache para evitar loop infinito no useSyncExternalStore
 * 4. Hooks específicos para cada tipo de dado
 *
 * MIGRAÇÃO:
 * - useSettings() → useSettingsActions() para actions
 * - useSettings().isDark → useIsDark() para tema
 * - useSettings().colorMode → useColorMode() para modo de cor
 */

import React, { createContext, useContext, ReactNode, useMemo, useSyncExternalStore } from 'react'
import { useColorScheme } from 'react-native'
import { MMKV } from 'react-native-mmkv'
import {
  SettingsState,
  SettingsAction,
  ColorMode,
  LightningSettings,
  LightningFeeConfig,
  LightningNetwork,
  initialSettingsState,
  settingsReducer,
  settingsActions,
} from './state'

// ==========================================
// STORAGE
// ==========================================

const storage = new MMKV()
const SETTINGS_STORAGE_KEY = 'settings-state'

function loadSettings(): SettingsState {
  try {
    const json = storage.getString(SETTINGS_STORAGE_KEY)
    if (json) {
      const parsed = JSON.parse(json)
      return { ...initialSettingsState, ...parsed }
    }
  } catch (error) {
    console.error('[SettingsStore] Error loading settings:', error)
  }
  return initialSettingsState
}

function saveSettings(state: SettingsState): void {
  try {
    storage.set(SETTINGS_STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('[SettingsStore] Error saving settings:', error)
  }
}

// ==========================================
// STORE
// ==========================================

/**
 * Store singleton com pub/sub para settings.
 * Cache para evitar loop infinito no useSyncExternalStore.
 */
class SettingsStore {
  private subscribers = new Set<() => void>()
  private cachedState: SettingsState

  constructor() {
    this.cachedState = loadSettings()
  }

  subscribe = (callback: () => void): (() => void) => {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  private notify = (): void => {
    this.subscribers.forEach(callback => callback())
  }

  dispatch = (action: SettingsAction): void => {
    this.cachedState = settingsReducer(this.cachedState, action)
    saveSettings(this.cachedState)
    this.notify()
  }

  // Snapshot retorna referência cacheada
  getSnapshot = (): SettingsState => {
    return this.cachedState
  }

  // Getters específicos para selectors otimizados
  getColorMode = (): ColorMode => this.cachedState.colorMode
  getLightningSettings = (): LightningSettings => this.cachedState.lightning
  getMaxBlockchainSize = (): number => this.cachedState.maxBlockchainSizeGB
  getTrampolineRoutingEnabled = (): boolean => this.cachedState.trampolineRoutingEnabled
}

const settingsStore = new SettingsStore()

// ==========================================
// CONTEXT
// ==========================================

type SettingsContextType = {
  dispatch: (action: SettingsAction) => void
  actions: typeof settingsActions
  subscribe: (callback: () => void) => () => void
  getSnapshot: () => SettingsState
  getColorMode: () => ColorMode
  getLightningSettings: () => LightningSettings
}

const SettingsContext = createContext<SettingsContextType | null>(null)

// ==========================================
// PROVIDER
// ==========================================

interface SettingsProviderProps {
  children: ReactNode
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const contextValue = useMemo<SettingsContextType>(
    () => ({
      dispatch: settingsStore.dispatch,
      actions: settingsActions,
      subscribe: settingsStore.subscribe,
      getSnapshot: settingsStore.getSnapshot,
      getColorMode: settingsStore.getColorMode,
      getLightningSettings: settingsStore.getLightningSettings,
    }),
    [],
  )

  return <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>
}

// ==========================================
// HOOKS BASE
// ==========================================

function useSettingsContext(): SettingsContextType {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettingsContext must be used within SettingsProvider')
  }
  return context
}

// ==========================================
// HOOKS REATIVOS (useSyncExternalStore)
// ==========================================

/**
 * Hook reativo para todo o estado de settings
 * USE COM MODERAÇÃO - prefira hooks específicos
 */
export function useSettingsState(): SettingsState {
  const { subscribe, getSnapshot } = useSettingsContext()
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Hook reativo para colorMode
 */
export function useColorMode(): ColorMode {
  const { subscribe, getColorMode } = useSettingsContext()
  return useSyncExternalStore(subscribe, getColorMode, getColorMode)
}

/**
 * Hook reativo para isDark (derivado de colorMode + sistema)
 * Este é o mais usado na aplicação
 */
export function useIsDark(): boolean {
  const colorMode = useColorMode()
  const systemColorScheme = useColorScheme()
  return colorMode === 'dark' || (colorMode === 'auto' && systemColorScheme === 'dark')
}

/**
 * Hook reativo para o modo de cor ativo (resolvido)
 * Retorna 'light' ou 'dark' (nunca 'auto')
 *
 * Útil para estilização com tema como chave:
 * @example
 * const colorMode = useActiveColorMode()
 * const styles = { light: { bg: '#fff' }, dark: { bg: '#000' } }
 * return <View style={styles[colorMode]} />
 */
export function useActiveColorMode(): 'light' | 'dark' {
  const colorMode = useColorMode()
  const systemColorScheme = useColorScheme()

  if (colorMode === 'auto') {
    return systemColorScheme === 'light' ? 'light' : 'dark'
  }
  return colorMode
}

/**
 * Hook reativo para settings de Lightning
 */
export function useLightningSettings(): LightningSettings {
  const { subscribe, getLightningSettings } = useSettingsContext()
  return useSyncExternalStore(subscribe, getLightningSettings, getLightningSettings)
}

// ==========================================
// HOOKS DE ACTIONS
// ==========================================

/**
 * Hook para dispatch e action creators
 * Não causa re-render por si só
 */
export function useSettingsActions() {
  const { dispatch, actions } = useSettingsContext()

  return useMemo(
    () => ({
      setColorMode: (mode: ColorMode) => dispatch(actions.setColorMode(mode)),
      setMaxBlockchainSize: (size: number) => dispatch(actions.setMaxBlockchainSize(size)),
      setTrampolineRouting: (enabled: boolean) => dispatch(actions.setTrampolineRouting(enabled)),
      setLightningNetwork: (network: LightningNetwork) =>
        dispatch(actions.setLightningNetwork(network)),
      setZeroConfEnabled: (enabled: boolean) => dispatch(actions.setZeroConfEnabled(enabled)),
      setMppEnabled: (enabled: boolean) => dispatch(actions.setMppEnabled(enabled)),
      setLightningFeeConfig: (config: Partial<LightningFeeConfig>) =>
        dispatch(actions.setLightningFeeConfig(config)),
      setAutoChannelManagement: (enabled: boolean) =>
        dispatch(actions.setAutoChannelManagement(enabled)),
      setMaxHtlcCount: (count: number) => dispatch(actions.setMaxHtlcCount(count)),
      setDefaultCltvExpiry: (expiry: number) => dispatch(actions.setDefaultCltvExpiry(expiry)),
    }),
    [dispatch, actions],
  )
}

// ==========================================
// BACKWARD COMPATIBILITY
// ==========================================

/**
 * Hook de compatibilidade com API anterior
 *
 * DEPRECATED: Prefira usar hooks específicos:
 * - useIsDark() para tema
 * - useColorMode() para modo de cor
 * - useSettingsActions() para actions
 * - useLightningSettings() para configurações Lightning
 */
export function useSettings() {
  const state = useSettingsState()
  const colorMode = useColorMode()
  const systemColorScheme = useColorScheme()
  const { dispatch, actions } = useSettingsContext()

  const isDark = colorMode === 'dark' || (colorMode === 'auto' && systemColorScheme === 'dark')

  return {
    ...state,
    isDark,
    dispatch,
    actions,
  }
}
