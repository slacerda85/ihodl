// Network Socket Utilities
// Secure TLS socket creation and management

export {
  createTCPSocket,
  createSecureTLSSocket,
  createElectrumSocket,
  createProductionLightningSocket,
  isSocketConnected,
  getSocketInfo,
  type SocketConfig,
  type SecureSocketConfig,
} from './socket'
