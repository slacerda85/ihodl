// Blockchain state and reducer
export interface BlockchainState {
  isSyncing: boolean
  lastSyncedHeight: number | null
  currentHeight: number | null
  syncProgress: number
}

export type BlockchainAction =
  | { type: 'SET_SYNCING'; payload: boolean }
  | { type: 'SET_LAST_SYNCED_HEIGHT'; payload: number | null }
  | { type: 'SET_CURRENT_HEIGHT'; payload: number | null }
  | { type: 'SET_SYNC_PROGRESS'; payload: number }

export const initialBlockchainState: BlockchainState = {
  isSyncing: false,
  lastSyncedHeight: null,
  currentHeight: null,
  syncProgress: 0,
}

export const blockchainReducer = (
  state: BlockchainState,
  action: BlockchainAction,
): BlockchainState => {
  switch (action.type) {
    case 'SET_SYNCING':
      return {
        ...state,
        isSyncing: action.payload,
      }
    case 'SET_LAST_SYNCED_HEIGHT':
      return {
        ...state,
        lastSyncedHeight: action.payload,
      }
    case 'SET_CURRENT_HEIGHT':
      return {
        ...state,
        currentHeight: action.payload,
      }
    case 'SET_SYNC_PROGRESS':
      return {
        ...state,
        syncProgress: action.payload,
      }
    default:
      return state
  }
}
