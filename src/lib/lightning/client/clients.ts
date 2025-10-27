// Factory functions for creating Lightning wallet providers

import type { LightningWalletProvider } from './types'
import { BreezWalletProvider } from './client'

// Factory function to create provider
export function createLightningWalletProvider(provider: string): LightningWalletProvider {
  switch (provider) {
    case 'breez':
      return new BreezWalletProvider()
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}
