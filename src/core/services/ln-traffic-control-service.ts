/**
 * Lightning Traffic Control Service
 *
 * Controla quando o Lightning Network pode estabelecer conexões baseado em condições
 * como disponibilidade da carteira, internet e mecanismo de votação de desconexões.
 *
 * Inspirado no TrafficControl do Phoenix Wallet.
 */

import { EventEmitter } from 'eventemitter3'
import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo'
import { AppState, AppStateStatus } from 'react-native'

// ==========================================
// TIPOS
// ==========================================

/** Estado do TrafficControl */
export interface TrafficControlState {
  /** Carteira está disponível */
  walletIsAvailable: boolean
  /** Internet está disponível */
  internetIsAvailable: boolean
  /** Tipo de conexão de rede */
  networkType: NetInfoStateType
  /** Conexão é medida (celular) */
  isConnectionExpensive: boolean
  /** Contador de votos para desconexão (mecanismo de votação) */
  disconnectCount: number
  /** Última atualização do estado */
  lastUpdated: Date
}

/** Eventos emitidos pelo TrafficControl */
export interface TrafficControlEvents {
  stateChanged: (state: TrafficControlState) => void
  canConnectChanged: (canConnect: boolean) => void
  walletAvailabilityChanged: (available: boolean) => void
  internetAvailabilityChanged: (available: boolean) => void
}

/** Razões para incrementar/decrementar disconnectCount */
export enum DisconnectReason {
  APP_BACKGROUND = 'app_background',
  CONNECTION_ERROR = 'connection_error',
  NETWORK_UNAVAILABLE = 'network_unavailable',
  MANUAL_DISCONNECT = 'manual_disconnect',
}

export enum ConnectReason {
  APP_FOREGROUND = 'app_foreground',
  PAYMENT_IN_FLIGHT = 'payment_in_flight',
  PUSH_NOTIFICATION = 'push_notification',
  NETWORK_AVAILABLE = 'network_available',
  MANUAL_CONNECT = 'manual_connect',
}

// ==========================================
// SERVIÇO
// ==========================================

export class LightningTrafficControlService extends EventEmitter {
  private state: TrafficControlState = {
    walletIsAvailable: false,
    internetIsAvailable: false,
    networkType: NetInfoStateType.none,
    isConnectionExpensive: false,
    disconnectCount: 0,
    lastUpdated: new Date(),
  }

  private netInfoUnsubscribe?: () => void
  private appStateSubscription?: any

  constructor() {
    super()
    this.initialize()
  }

  // ==========================================
  // INICIALIZAÇÃO
  // ==========================================

  private async initialize(): Promise<void> {
    // Monitorar estado da rede
    this.netInfoUnsubscribe = NetInfo.addEventListener(state => {
      this.updateNetworkState(state)
    })

    // Monitorar estado do app (background/foreground)
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange.bind(this),
    )

    // Verificar estado inicial da rede
    const netInfo = await NetInfo.fetch()
    this.updateNetworkState(netInfo)
  }

  // ==========================================
  // GETTERS
  // ==========================================

  /** Retorna o estado atual */
  getState(): TrafficControlState {
    return { ...this.state }
  }

  /** Verifica se pode conectar baseado nas condições */
  get canConnect(): boolean {
    return (
      this.state.walletIsAvailable &&
      this.state.internetIsAvailable &&
      this.state.disconnectCount <= 0
    )
  }

  /** Verifica se carteira está disponível */
  get walletIsAvailable(): boolean {
    return this.state.walletIsAvailable
  }

  /** Verifica se internet está disponível */
  get internetIsAvailable(): boolean {
    return this.state.internetIsAvailable
  }

  /** Retorna tipo de conexão de rede */
  get networkType(): NetInfoStateType {
    return this.state.networkType
  }

  /** Verifica se conexão é medida/cara */
  get isConnectionExpensive(): boolean {
    return this.state.isConnectionExpensive
  }

  /** Retorna contador de desconexões */
  get disconnectCount(): number {
    return this.state.disconnectCount
  }

  // ==========================================
  // CONTROLE DE CARTEIRA
  // ==========================================

  /** Define disponibilidade da carteira */
  setWalletAvailability(available: boolean): void {
    if (this.state.walletIsAvailable === available) return

    const previousCanConnect = this.canConnect
    this.state.walletIsAvailable = available
    this.state.lastUpdated = new Date()

    this.emit('walletAvailabilityChanged', available)
    this.emit('stateChanged', this.getState())

    if (previousCanConnect !== this.canConnect) {
      this.emit('canConnectChanged', this.canConnect)
    }
  }

  // ==========================================
  // CONTROLE DE INTERNET
  // ==========================================

  /** Atualiza estado da rede baseado no NetInfo */
  private updateNetworkState(state: NetInfoState): void {
    const isConnected = state.isConnected && state.isInternetReachable
    const networkType = state.type
    const isConnectionExpensive = state.details?.isConnectionExpensive ?? false

    // Verificar se algo mudou
    const hasChanged =
      this.state.internetIsAvailable !== (isConnected ?? false) ||
      this.state.networkType !== networkType ||
      this.state.isConnectionExpensive !== isConnectionExpensive

    if (!hasChanged) return

    const previousCanConnect = this.canConnect

    // Atualizar estado
    this.state.internetIsAvailable = isConnected ?? false
    this.state.networkType = networkType
    this.state.isConnectionExpensive = isConnectionExpensive
    this.state.lastUpdated = new Date()

    // Ajustar contador baseado na disponibilidade da rede
    if (!this.state.internetIsAvailable) {
      this.incrementDisconnectCount(DisconnectReason.NETWORK_UNAVAILABLE)
    } else {
      this.decrementDisconnectCount(ConnectReason.NETWORK_AVAILABLE)
    }

    // Emitir eventos
    this.emit('internetAvailabilityChanged', this.state.internetIsAvailable)
    this.emit('stateChanged', this.getState())

    if (previousCanConnect !== this.canConnect) {
      this.emit('canConnectChanged', this.canConnect)
    }

    console.log(
      `[TrafficControl] Network state updated: ${networkType}, connected: ${isConnected}, expensive: ${isConnectionExpensive}`,
    )
  }

  // ==========================================
  // MECANISMO DE VOTAÇÃO (DISCONNECT COUNT)
  // ==========================================

  /** Incrementa contador de desconexões */
  incrementDisconnectCount(reason: DisconnectReason): void {
    const previousCanConnect = this.canConnect
    this.state.disconnectCount++
    this.state.lastUpdated = new Date()

    console.log(
      `[TrafficControl] Disconnect count incremented to ${this.state.disconnectCount} (${reason})`,
    )

    this.emit('stateChanged', this.getState())

    if (previousCanConnect !== this.canConnect) {
      this.emit('canConnectChanged', this.canConnect)
    }
  }

  /** Decrementa contador de desconexões */
  decrementDisconnectCount(reason: ConnectReason): void {
    if (this.state.disconnectCount <= 0) return

    const previousCanConnect = this.canConnect
    this.state.disconnectCount--
    this.state.lastUpdated = new Date()

    console.log(
      `[TrafficControl] Disconnect count decremented to ${this.state.disconnectCount} (${reason})`,
    )

    this.emit('stateChanged', this.getState())

    if (previousCanConnect !== this.canConnect) {
      this.emit('canConnectChanged', this.canConnect)
    }
  }

  /** Reseta contador de desconexões */
  resetDisconnectCount(): void {
    if (this.state.disconnectCount === 0) return

    const previousCanConnect = this.canConnect
    this.state.disconnectCount = 0
    this.state.lastUpdated = new Date()

    console.log('[TrafficControl] Disconnect count reset to 0')

    this.emit('stateChanged', this.getState())

    if (previousCanConnect !== this.canConnect) {
      this.emit('canConnectChanged', this.canConnect)
    }
  }

  // ==========================================
  // HANDLERS DE EVENTOS
  // ==========================================

  /** Trata mudança de estado do app */
  private handleAppStateChange(nextAppState: AppStateStatus): void {
    if (nextAppState === 'background') {
      this.incrementDisconnectCount(DisconnectReason.APP_BACKGROUND)
    } else if (nextAppState === 'active') {
      this.decrementDisconnectCount(ConnectReason.APP_FOREGROUND)
    }
  }

  // ==========================================
  // CONTROLE MANUAL
  // ==========================================

  /** Força desconexão manual */
  disconnect(reason: DisconnectReason = DisconnectReason.MANUAL_DISCONNECT): void {
    this.incrementDisconnectCount(reason)
  }

  /** Força reconexão manual */
  connect(reason: ConnectReason = ConnectReason.MANUAL_CONNECT): void {
    this.decrementDisconnectCount(reason)
  }

  // ==========================================
  // LIMPEZA
  // ==========================================

  /** Limpa recursos */
  destroy(): void {
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe()
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove()
    }
    this.removeAllListeners()
  }
}

// ==========================================
// SINGLETON
// ==========================================

/** Instância singleton do TrafficControl */
let trafficControlInstance: LightningTrafficControlService | null = null

/** Obtém instância singleton do TrafficControl */
export function getTrafficControl(): LightningTrafficControlService {
  if (!trafficControlInstance) {
    trafficControlInstance = new LightningTrafficControlService()
  }
  return trafficControlInstance
}

/** Cria nova instância do TrafficControl (para testes) */
export function createTrafficControl(): LightningTrafficControlService {
  return new LightningTrafficControlService()
}
