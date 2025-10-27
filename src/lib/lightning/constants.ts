// Lightning Network constants
export const LIGHTNING_PURPOSE = 9735 // BIP-43 purpose for Lightning
export const LIGHTNING_CHAIN_BITCOIN = 0 // Bitcoin mainnet
export const LIGHTNING_CHAIN_TESTNET = 1 // Bitcoin testnet
export const LN_VER_BOLT = 0 // BOLT-defined Lightning channels
export const LN_VER_BIFROST = 1 // Bifrost channels

// Basepoint indices
export const BASEPOINT_FUNDING = 0
export const BASEPOINT_PAYMENT = 1
export const BASEPOINT_DELAYED = 2
export const BASEPOINT_REVOCATION = 3
export const BASEPOINT_HTLC = 5
export const BASEPOINT_PTLC = 6

// Lightning Service Providers (LSPs) for SPV wallets
export const LIGHTNING_SERVICE_PROVIDERS = {
  phoenix: {
    id: 'phoenix',
    name: 'Phoenix (ACINQ)',
    nodeUrl: 'https://api.phoenix.acinq.co',
    type: 'lnd' as const,
    authMethod: 'api' as const,
    description: 'LSP da ACINQ - atualmente indisponível para APIs públicas gratuitas',
    isAvailable: false, // Phoenix não oferece mais APIs públicas gratuitas
    timeout: 30000,
  },
  // Note: Most LSPs don't provide free public APIs for direct integration
  // Users need to run their own Lightning node or use custodial services
} as const

export type LSPId = keyof typeof LIGHTNING_SERVICE_PROVIDERS
export type LSPConfig = (typeof LIGHTNING_SERVICE_PROVIDERS)[LSPId]

// Default LSP configuration
export const DEFAULT_LSP: LSPId = 'phoenix'
