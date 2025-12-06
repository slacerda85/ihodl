// Re-exports from centralized app-provider (nova arquitetura)
export { useAuth, useIsAuthenticated } from '../app-provider'

// Legacy provider (deprecated - manter para compatibilidade)
export { default as AuthProvider } from './AuthProvider'

export { default as AuthScreen } from './AuthScreen'
export { default as InactivityOverlay } from './InactivityOverlay'
export * from './utils'
