// Base types for reducer pattern
type Reducer<S, A> = (state: S, action: A) => S

// Settings State
export type SettingsState = {
  colorMode: ColorMode
  maxBlockchainSizeGB: number
  userOverride?: boolean
  trampolineRoutingEnabled: boolean
}

export type ColorMode = 'light' | 'dark' | 'auto'

// Settings Actions
export type SettingsAction =
  | { type: 'SET_COLOR_MODE'; payload: ColorMode }
  | { type: 'SET_MAX_BLOCKCHAIN_SIZE'; payload: number }
  | { type: 'SET_TRAMPOLINE_ROUTING'; payload: boolean }

// Initial state
export const initialSettingsState: SettingsState = {
  colorMode: 'auto',
  maxBlockchainSizeGB: 1,
  trampolineRoutingEnabled: false,
}

// Reducer
export const settingsReducer: Reducer<SettingsState, SettingsAction> = (state, action) => {
  switch (action.type) {
    case 'SET_COLOR_MODE':
      return {
        ...state,
        colorMode: action.payload,
      }

    case 'SET_MAX_BLOCKCHAIN_SIZE':
      return {
        ...state,
        maxBlockchainSizeGB: action.payload,
      }

    case 'SET_TRAMPOLINE_ROUTING':
      return {
        ...state,
        trampolineRoutingEnabled: action.payload,
      }

    default:
      return state
  }
}

// Action creators
export const settingsActions = {
  setColorMode: (colorMode: ColorMode): SettingsAction => ({
    type: 'SET_COLOR_MODE',
    payload: colorMode,
  }),

  setMaxBlockchainSize: (size: number): SettingsAction => ({
    type: 'SET_MAX_BLOCKCHAIN_SIZE',
    payload: size,
  }),

  setTrampolineRouting: (enabled: boolean): SettingsAction => ({
    type: 'SET_TRAMPOLINE_ROUTING',
    payload: enabled,
  }),
}

// selectors
export const selectors = {
  selectColorMode: (state: SettingsState) => state.colorMode,
  selectMaxBlockchainSize: (state: SettingsState) => state.maxBlockchainSizeGB,
  selectTrampolineRoutingEnabled: (state: SettingsState) => state.trampolineRoutingEnabled,
}
