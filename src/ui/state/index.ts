/**
 * State Module - Barrel Export
 *
 * Exporta todos os tipos e hooks de estado da aplicação.
 */

// Types
export * from './types'

// Provider e Hooks
export {
  StateProvider,
  useAppState,
  // Auth
  useAuth,
  useIsAuthenticated,
  // Connection
  useConnection,
  useIsConnected,
  // Loading
  useLoading,
  useIsAnyLoading,
  // Error
  useError,
  useHasErrors,
  // Combined
  useAsyncOperation,
} from './StateProvider'
