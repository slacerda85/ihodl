// Re-exports from centralized app-provider (nova arquitetura)
export {
  useAddresses,
  useBalance,
  useNextAddresses,
  useAddressesByType,
  useAddressLoading,
  useAddressStoreActions,
} from '../app-provider'

// Legacy provider (deprecated - manter para compatibilidade)
export { default as AddressProvider, useAddress } from './AddressProvider'

// Store centralizado (nova arquitetura)
export { addressStore, type AddressSnapshot, type AddressActions } from './store'
