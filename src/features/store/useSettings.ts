import { useStore } from './StoreProvider'
import { useColorScheme } from 'react-native'

// Settings hook
export const useSettings = () => {
  const { state, dispatch } = useStore()
  const colorScheme = useColorScheme()
  const effectiveColorMode =
    state.settings.colorMode === 'auto' ? (colorScheme ?? 'light') : state.settings.colorMode
  const isDark = effectiveColorMode === 'dark'

  return {
    // State
    colorMode: state.settings.colorMode,
    maxBlockchainSizeGB: state.settings.maxBlockchainSizeGB,
    userOverride: state.settings.userOverride,
    isDark,

    // Actions
    setColorMode: (colorMode: any) =>
      dispatch({ type: 'SETTINGS', action: { type: 'SET_COLOR_MODE', payload: colorMode } }),
    setMaxBlockchainSize: (size: number) =>
      dispatch({ type: 'SETTINGS', action: { type: 'SET_MAX_BLOCKCHAIN_SIZE', payload: size } }),
  }
}
