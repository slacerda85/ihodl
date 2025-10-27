import { breezClient } from '@/lib/lightning/client'
import type { AppAction } from '../storage'
import React from 'react'

// Initialize Breez SDK when needed (lazy loading)
export const initializeBreezSDK = async (
  dispatch: React.Dispatch<AppAction>,
  mnemonic?: string,
) => {
  try {
    console.log('[StorageProvider] Initializing Breez SDK...')

    // Check if BreezClient is already connected
    if (breezClient.isConnected()) {
      console.log('[StorageProvider] Breez SDK already connected')
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'SET_BREEZ_CONNECTED', payload: true },
      })
      return
    }

    // Use provided mnemonic (required - no fallback to environment variable)
    const mnemonicToUse = mnemonic
    const apiKey = process.env.BREEZ_API_KEY

    if (!apiKey || !mnemonicToUse) {
      console.warn(
        '[StoreProvider] Breez SDK configuration missing - API key or mnemonic not provided',
      )
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'SET_BREEZ_CONNECTED', payload: false },
      })
      return
    }

    console.log('API key', apiKey)
    console.log('Mnemonic', mnemonicToUse ? '*****' : 'not found')

    // Connect to Breez SDK
    await breezClient.connect({
      mnemonic: mnemonicToUse,
      apiKey,
      network: 'regtest', // Use regtest for development
    })

    console.log('[StorageProvider] Breez SDK initialization completed')
    dispatch({
      type: 'LIGHTNING',
      action: { type: 'SET_BREEZ_CONNECTED', payload: true },
    })
  } catch (error) {
    console.error('[StoreProvider] Error initializing Breez SDK:', error)
    dispatch({
      type: 'LIGHTNING',
      action: { type: 'SET_BREEZ_CONNECTED', payload: false },
    })
    // Don't throw - we don't want to break app startup
  }
}
