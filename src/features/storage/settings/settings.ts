import { ColorMode } from '@/models/settings'
import { Reducer } from '../types'

// Settings State
export type SettingsState = {
  colorMode: ColorMode
  maxBlockchainSizeGB: number
  userOverride?: boolean
}

// Settings Actions
export type SettingsAction =
  | { type: 'SET_COLOR_MODE'; payload: ColorMode }
  | { type: 'SET_MAX_BLOCKCHAIN_SIZE'; payload: number }

// Initial state
export const initialSettingsState: SettingsState = {
  colorMode: 'auto',
  maxBlockchainSizeGB: 1,
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
}
