// BOLT #1: Readiness State Management
// Defines the readiness levels for Lightning Network operations

/**
 * Readiness State Interface
 * Tracks the initialization status of all Lightning components
 */
export interface ReadinessState {
  /** Wallet is loaded and available */
  isWalletLoaded: boolean

  /** Transport layer is connected and ready */
  isTransportConnected: boolean

  /** At least one peer is connected */
  isPeerConnected: boolean

  /** All channels have been reestablished after reconnection */
  isChannelReestablished: boolean

  /** Gossip sync is complete (for full gossip mode) or trampoline is ready */
  isGossipSynced: boolean

  /** Blockchain watcher is running and monitoring channels */
  isWatcherRunning: boolean
}

/**
 * Readiness Levels
 * Defines what operations are allowed at each readiness level
 */
export enum ReadinessLevel {
  /** System not ready for any operations */
  NOT_READY = 0,

  /** Can receive payments (generate invoices) */
  CAN_RECEIVE = 1,

  /** Can send payments (full routing capability) */
  CAN_SEND = 2,

  /** All functionalities available */
  FULLY_READY = 3,
}

/**
 * Get the current readiness level based on the readiness state
 * @param state Current readiness state
 * @returns The highest readiness level that can be achieved
 */
export function getReadinessLevel(state: ReadinessState): ReadinessLevel {
  // Must have wallet loaded for any operations
  if (!state.isWalletLoaded) {
    return ReadinessLevel.NOT_READY
  }

  // Can receive payments if transport is connected
  if (state.isTransportConnected) {
    // Can send payments if peer connected and gossip synced
    if (state.isPeerConnected && state.isGossipSynced) {
      // Fully ready if channels reestablished and watcher running
      if (state.isChannelReestablished && state.isWatcherRunning) {
        return ReadinessLevel.FULLY_READY
      }
      // Can still send payments even if watcher not running yet
      return ReadinessLevel.CAN_SEND
    }

    // Can receive payments even without peers (for invoices)
    return ReadinessLevel.CAN_RECEIVE
  }

  return ReadinessLevel.NOT_READY
}

/**
 * Get a human-readable description of what operations are allowed
 * @param level Readiness level
 * @returns Description string
 */
export function getReadinessDescription(level: ReadinessLevel): string {
  switch (level) {
    case ReadinessLevel.NOT_READY:
      return 'Sistema não está pronto'
    case ReadinessLevel.CAN_RECEIVE:
      return 'Pode receber pagamentos (gerar invoices)'
    case ReadinessLevel.CAN_SEND:
      return 'Pode enviar e receber pagamentos'
    case ReadinessLevel.FULLY_READY:
      return 'Todas as funcionalidades disponíveis'
    default:
      return 'Estado desconhecido'
  }
}

/**
 * Get detailed reasons why certain operations are not allowed
 * @param state Current readiness state
 * @returns Array of blocking reasons
 */
export function getReadinessBlockers(state: ReadinessState): string[] {
  const blockers: string[] = []

  if (!state.isWalletLoaded) {
    blockers.push('Carteira não carregada')
  }

  if (!state.isTransportConnected) {
    blockers.push('Transporte não conectado')
  }

  if (!state.isPeerConnected) {
    blockers.push('Nenhum peer conectado')
  }

  if (!state.isGossipSynced) {
    blockers.push('Sincronização de gossip não completa')
  }

  if (!state.isChannelReestablished) {
    blockers.push('Canais não reestabelecidos')
  }

  if (!state.isWatcherRunning) {
    blockers.push('Watcher não está executando')
  }

  return blockers
}

/**
 * Check if a specific operation is allowed at the current readiness level
 * @param level Current readiness level
 * @param operation Operation to check
 * @returns True if operation is allowed
 */
export function isOperationAllowed(
  level: ReadinessLevel,
  operation: 'receive' | 'send' | 'channel_management',
): boolean {
  switch (operation) {
    case 'receive':
      return level >= ReadinessLevel.CAN_RECEIVE
    case 'send':
      return level >= ReadinessLevel.CAN_SEND
    case 'channel_management':
      return level >= ReadinessLevel.FULLY_READY
    default:
      return false
  }
}

/**
 * Create an initial readiness state (all false)
 * @returns Initial readiness state
 */
export function createInitialReadinessState(): ReadinessState {
  return {
    isWalletLoaded: false,
    isTransportConnected: false,
    isPeerConnected: false,
    isChannelReestablished: false,
    isGossipSynced: false,
    isWatcherRunning: false,
  }
}
