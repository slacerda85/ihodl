// Re-exports from centralized app-provider (nova arquitetura)
export { useWallets, useActiveWallet, useActiveWalletId, useWalletActions } from '../app-provider'

// Legacy provider (deprecated - manter para compatibilidade)
export { default as WalletProvider, useWallet } from './WalletProvider'

// Store centralizado (nova arquitetura)
export { walletStore, type WalletSnapshot, type WalletActions } from './store'
