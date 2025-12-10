// Tests for Readiness State Management
import {
  ReadinessState,
  ReadinessLevel,
  getReadinessLevel,
  getReadinessDescription,
  getReadinessBlockers,
  isOperationAllowed,
  createInitialReadinessState,
} from '../readiness'

describe('Readiness State Management', () => {
  describe('ReadinessLevel enum', () => {
    it('should have correct enum values', () => {
      expect(ReadinessLevel.NOT_READY).toBe(0)
      expect(ReadinessLevel.CAN_RECEIVE).toBe(1)
      expect(ReadinessLevel.CAN_SEND).toBe(2)
      expect(ReadinessLevel.FULLY_READY).toBe(3)
    })
  })

  describe('getReadinessLevel', () => {
    it('should return NOT_READY when wallet is not loaded', () => {
      const state: ReadinessState = {
        isWalletLoaded: false,
        isTransportConnected: true,
        isPeerConnected: true,
        isChannelReestablished: true,
        isGossipSynced: true,
        isWatcherRunning: true,
      }
      expect(getReadinessLevel(state)).toBe(ReadinessLevel.NOT_READY)
    })

    it('should return CAN_RECEIVE when transport is connected', () => {
      const state: ReadinessState = {
        isWalletLoaded: true,
        isTransportConnected: true,
        isPeerConnected: false,
        isChannelReestablished: false,
        isGossipSynced: false,
        isWatcherRunning: false,
      }
      expect(getReadinessLevel(state)).toBe(ReadinessLevel.CAN_RECEIVE)
    })

    it('should return CAN_SEND when peer connected and gossip synced', () => {
      const state: ReadinessState = {
        isWalletLoaded: true,
        isTransportConnected: true,
        isPeerConnected: true,
        isChannelReestablished: false,
        isGossipSynced: true,
        isWatcherRunning: false,
      }
      expect(getReadinessLevel(state)).toBe(ReadinessLevel.CAN_SEND)
    })

    it('should return FULLY_READY when all conditions met', () => {
      const state: ReadinessState = {
        isWalletLoaded: true,
        isTransportConnected: true,
        isPeerConnected: true,
        isChannelReestablished: true,
        isGossipSynced: true,
        isWatcherRunning: true,
      }
      expect(getReadinessLevel(state)).toBe(ReadinessLevel.FULLY_READY)
    })
  })

  describe('getReadinessDescription', () => {
    it('should return correct descriptions', () => {
      expect(getReadinessDescription(ReadinessLevel.NOT_READY)).toBe('Sistema não está pronto')
      expect(getReadinessDescription(ReadinessLevel.CAN_RECEIVE)).toBe(
        'Pode receber pagamentos (gerar invoices)',
      )
      expect(getReadinessDescription(ReadinessLevel.CAN_SEND)).toBe(
        'Pode enviar e receber pagamentos',
      )
      expect(getReadinessDescription(ReadinessLevel.FULLY_READY)).toBe(
        'Todas as funcionalidades disponíveis',
      )
    })
  })

  describe('getReadinessBlockers', () => {
    it('should return all blockers when nothing is ready', () => {
      const state = createInitialReadinessState()
      const blockers = getReadinessBlockers(state)
      expect(blockers).toHaveLength(6)
      expect(blockers).toContain('Carteira não carregada')
      expect(blockers).toContain('Transporte não conectado')
      expect(blockers).toContain('Nenhum peer conectado')
      expect(blockers).toContain('Sincronização de gossip não completa')
      expect(blockers).toContain('Canais não reestabelecidos')
      expect(blockers).toContain('Watcher não está executando')
    })

    it('should return empty array when fully ready', () => {
      const state: ReadinessState = {
        isWalletLoaded: true,
        isTransportConnected: true,
        isPeerConnected: true,
        isChannelReestablished: true,
        isGossipSynced: true,
        isWatcherRunning: true,
      }
      const blockers = getReadinessBlockers(state)
      expect(blockers).toHaveLength(0)
    })
  })

  describe('isOperationAllowed', () => {
    it('should allow receive operation at CAN_RECEIVE level', () => {
      expect(isOperationAllowed(ReadinessLevel.CAN_RECEIVE, 'receive')).toBe(true)
      expect(isOperationAllowed(ReadinessLevel.CAN_RECEIVE, 'send')).toBe(false)
      expect(isOperationAllowed(ReadinessLevel.CAN_RECEIVE, 'channel_management')).toBe(false)
    })

    it('should allow send operation at CAN_SEND level', () => {
      expect(isOperationAllowed(ReadinessLevel.CAN_SEND, 'receive')).toBe(true)
      expect(isOperationAllowed(ReadinessLevel.CAN_SEND, 'send')).toBe(true)
      expect(isOperationAllowed(ReadinessLevel.CAN_SEND, 'channel_management')).toBe(false)
    })

    it('should allow all operations at FULLY_READY level', () => {
      expect(isOperationAllowed(ReadinessLevel.FULLY_READY, 'receive')).toBe(true)
      expect(isOperationAllowed(ReadinessLevel.FULLY_READY, 'send')).toBe(true)
      expect(isOperationAllowed(ReadinessLevel.FULLY_READY, 'channel_management')).toBe(true)
    })

    it('should not allow any operations at NOT_READY level', () => {
      expect(isOperationAllowed(ReadinessLevel.NOT_READY, 'receive')).toBe(false)
      expect(isOperationAllowed(ReadinessLevel.NOT_READY, 'send')).toBe(false)
      expect(isOperationAllowed(ReadinessLevel.NOT_READY, 'channel_management')).toBe(false)
    })
  })

  describe('createInitialReadinessState', () => {
    it('should create state with all properties false', () => {
      const state = createInitialReadinessState()
      expect(state.isWalletLoaded).toBe(false)
      expect(state.isTransportConnected).toBe(false)
      expect(state.isPeerConnected).toBe(false)
      expect(state.isChannelReestablished).toBe(false)
      expect(state.isGossipSynced).toBe(false)
      expect(state.isWatcherRunning).toBe(false)
    })
  })
})
