import { ElectrumPeer } from '@/lib/electrum'
import { updateTrustedPeers as updateTrustedPeersLib } from '@/lib/electrum'
import { Reducer } from '../types'
import type { AppAction, AppState } from '../storage'
import React from 'react'

// Electrum State
export type ElectrumState = {
  trustedPeers: ElectrumPeer[]
  lastPeerUpdate: number | null
  loadingPeers: boolean
}

// Electrum Actions
export type ElectrumAction =
  | { type: 'SET_TRUSTED_PEERS'; payload: ElectrumPeer[] }
  | { type: 'SET_LAST_PEER_UPDATE'; payload: number | null }
  | { type: 'SET_LOADING_PEERS'; payload: boolean }

// Initial state
export const initialElectrumState: ElectrumState = {
  trustedPeers: [],
  lastPeerUpdate: null,
  loadingPeers: false,
}

// Reducer
export const electrumReducer: Reducer<ElectrumState, ElectrumAction> = (state, action) => {
  switch (action.type) {
    case 'SET_TRUSTED_PEERS':
      return {
        ...state,
        trustedPeers: action.payload,
      }

    case 'SET_LAST_PEER_UPDATE':
      return {
        ...state,
        lastPeerUpdate: action.payload,
      }

    case 'SET_LOADING_PEERS':
      return {
        ...state,
        loadingPeers: action.payload,
      }

    default:
      return state
  }
}

// Action creators
export const electrumActions = {
  setTrustedPeers: (peers: ElectrumPeer[]): ElectrumAction => ({
    type: 'SET_TRUSTED_PEERS',
    payload: peers,
  }),

  setLastPeerUpdate: (timestamp: number | null): ElectrumAction => ({
    type: 'SET_LAST_PEER_UPDATE',
    payload: timestamp,
  }),

  setLoadingPeers: (loading: boolean): ElectrumAction => ({
    type: 'SET_LOADING_PEERS',
    payload: loading,
  }),

  // Async action to update trusted peers
  updateTrustedPeers: async (): Promise<ElectrumAction[]> => {
    const updateData = await updateTrustedPeersLib()

    if (updateData) {
      return [
        electrumActions.setTrustedPeers(updateData.trustedPeers),
        electrumActions.setLastPeerUpdate(updateData.lastPeerUpdate),
      ]
    }

    return []
  },
}

// Selectors
export const electrumSelectors = {
  getTrustedPeers: (state: ElectrumState) => state.trustedPeers,
  getLastPeerUpdate: (state: ElectrumState) => state.lastPeerUpdate,
  isLoadingPeers: (state: ElectrumState) => state.loadingPeers,
}

// Initialize Electrum peers on app startup
export const initializeElectrumPeers = async (
  dispatch: React.Dispatch<AppAction>,
  state: AppState,
) => {
  try {
    console.log('[initializeElectrumPeers] Initializing..')
    // Always update trusted peers (this will fetch new peers if needed and test them)
    const actions = await electrumActions.updateTrustedPeers()
    actions.forEach(action => dispatch({ type: 'ELECTRUM', action }))
  } catch (error) {
    console.error('[initializeElectrumPeers] Error initializing Electrum peers:', error)
    // Don't throw - we don't want to break app startup
  }
}
