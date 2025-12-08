// Re-exports from centralized app-provider (nova arquitetura)
export {
  useAddresses,
  useBalance,
  useNextAddresses,
  useAddressesByType,
  useAddressLoading,
  useAddressStoreActions,
} from '../app-provider'

// Store centralizado (nova arquitetura)
export { addressStore } from './store'
