import { MMKV } from 'react-native-mmkv'

const storage = new MMKV()

// Clear persisted state (useful for testing and reset functionality)
export const clearPersistedState = () => {
  try {
    // Clear all persisted states from MMKV
    storage.delete('wallet-state')
    storage.delete('settings-state')
    // Note: Other features now handle their own persistence
    console.log('[StorageProvider] Persisted states cleared')
  } catch (error) {
    console.error('Error clearing persisted state:', error)
  }
}
