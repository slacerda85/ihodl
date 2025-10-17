import { StateCreator } from 'zustand'
import { StoreState } from './useStorage'
import { ColorMode } from '@/models/settings'
type SettingsState = {
  colorMode: ColorMode
  maxBlockchainSizeGB: number
  userOverride?: boolean
}

type SettingsActions = {
  setColorMode: (colorMode: ColorMode) => void
  setMaxBlockchainSizeGB: (size: number) => void
}

export type SettingsStorage = SettingsState & SettingsActions

const createSettingsStorage: StateCreator<
  StoreState,
  [['zustand/persist', unknown]],
  [],
  SettingsState & SettingsActions
> = (set, get) => ({
  // state
  colorMode: 'auto',
  maxBlockchainSizeGB: 1,
  // actions
  setColorMode: colorMode => {
    set(() => ({ colorMode }))
  },
  setMaxBlockchainSizeGB: size => {
    set(() => ({ maxBlockchainSizeGB: size }))
  },
})

export default createSettingsStorage
