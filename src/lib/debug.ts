/**
 * Utilitário para debug e migração do novo sistema de transações
 * DEPRECATED: Sistema migrado para StoreProvider
 */

// import useStorage from '../features/storage/useStorage'

export function debugTxStorage() {
  console.log('=== Debug TX Storage ===')
  console.log('DEPRECATED: Sistema migrado para StoreProvider')
  console.log('Use useStore hook para acessar dados')
  console.log('========================')
}

export function clearAllTxData() {
  console.log('DEPRECATED: Sistema migrado para StoreProvider')
  console.log('Use StoreProvider para gerenciar estado')
}
