/**
 * Connection state model for Lightning Network peer connections.
 * Tracks the lifecycle and status of P2P connections following BOLT specifications.
 */

export interface ConnectionState {
  /** Current connection status */
  status: 'disconnected' | 'connecting' | 'handshaking' | 'init_sent' | 'established' | 'error'

  /** Unique identifier for the connected peer (pubkey or node ID) */
  peerId: string | null

  /** Negotiated features from BOLT #1 init message */
  features: Uint8Array | null

  /** Timestamp of last successful connection (Unix timestamp in milliseconds) */
  lastConnected: number | null

  /** Timestamp of last disconnection (Unix timestamp in milliseconds) */
  lastDisconnected: number | null

  /** Number of consecutive reconnection attempts */
  reconnectAttempts: number

  /** Last error message if status is 'error' */
  error: string | null
}
