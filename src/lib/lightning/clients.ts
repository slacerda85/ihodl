import { LNDClient } from './lnd-client'
import { CLNClient } from './cln-client'
import { EclairClient } from './eclair-client'
import type { LightningClient, LightningClientConfig } from './types'

/**
 * Creates a Lightning client for the specified node type
 */
export function createLightningClient(config: LightningClientConfig): LightningClient {
  switch (config.type) {
    case 'lnd':
      return new LNDClient(config)
    case 'cln':
      return new CLNClient(config)
    case 'eclair':
      return new EclairClient(config)
    default:
      throw new Error(`Unsupported Lightning node type: ${config.type}`)
  }
}

/**
 * Authenticates with a Lightning node and returns a client
 */
export function authenticatedLightningClient(config: LightningClientConfig): LightningClient {
  // Validate configuration
  if (!config.url) {
    throw new Error('Lightning node URL is required')
  }

  if (!config.auth) {
    throw new Error('Lightning node authentication is required')
  }

  // For LND, we need either cert+macaroon or API key
  if (config.type === 'lnd') {
    if (!config.auth.cert || !config.auth.macaroon) {
      throw new Error('LND requires TLS certificate and macaroon for authentication')
    }
  }

  return createLightningClient(config)
}

/**
 * Creates an unauthenticated Lightning client (for wallet unlocker, etc.)
 */
export function unauthenticatedLightningClient(config: LightningClientConfig): LightningClient {
  // This would be used for operations that don't require authentication
  // like wallet unlocker in LND
  return createLightningClient(config)
}
