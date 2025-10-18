import { useStore } from './StoreProvider'

// Settings hook
export const useSettings = () => {
  const { state, dispatch } = useStore()
  return {
    // State
    colorMode: state.settings.colorMode,
    maxBlockchainSizeGB: state.settings.maxBlockchainSizeGB,
    userOverride: state.settings.userOverride,

    // Actions
    setColorMode: (colorMode: any) =>
      dispatch({ type: 'SETTINGS', action: { type: 'SET_COLOR_MODE', payload: colorMode } }),
    setMaxBlockchainSize: (size: number) =>
      dispatch({ type: 'SETTINGS', action: { type: 'SET_MAX_BLOCKCHAIN_SIZE', payload: size } }),
  }
}
