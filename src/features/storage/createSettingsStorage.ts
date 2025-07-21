import { StateCreator } from 'zustand'
import { StoreState } from './useStorage'
import { ColorMode } from '@/models/settings'
type SettingsState = {
  colorMode: ColorMode
  userOverride?: boolean
}

type SettingsActions = {
  setColorMode: (colorMode: ColorMode) => void
}

export type SettingsStorage = SettingsState & SettingsActions

const createSettingsStorage: StateCreator<
  StoreState,
  [['zustand/persist', unknown]],
  [],
  SettingsState & SettingsActions
> = (set, get) => ({
  // state
  colorMode: 'light',
  // actions
  setColorMode: colorMode => {
    set(() => ({ colorMode }))
  },
})

export default createSettingsStorage
