import { renderHook, act } from '@testing-library/react'
import { useLightning } from '../useLightning'
import { LightningWalletData, LightningConfig } from '@/lib/lightning'

// Mock do useStore
const mockDispatch = jest.fn()

jest.mock('../StoreProvider', () => ({
  useStore: () => ({
    state: {
      lightning: {
        lightningWallets: {},
        lightningConfigs: {},
        loadingLightningState: false,
        connectedNodes: {},
      },
    },
    dispatch: mockDispatch,
  }),
}))

describe('useLightning', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useLightning())

      expect(result.current.lightningWallets).toEqual({})
      expect(result.current.lightningConfigs).toEqual({})
      expect(result.current.loadingLightningState).toBe(false)
      expect(result.current.connectedNodes).toEqual({})
    })

    it('should provide action dispatchers', () => {
      const { result } = renderHook(() => useLightning())

      expect(typeof result.current.setLightningWallet).toBe('function')
      expect(typeof result.current.updateLightningWallet).toBe('function')
      expect(typeof result.current.deleteLightningWallet).toBe('function')
      expect(typeof result.current.setLightningConfig).toBe('function')
      expect(typeof result.current.updateLightningConfig).toBe('function')
      expect(typeof result.current.setLoadingLightning).toBe('function')
      expect(typeof result.current.setNodeConnection).toBe('function')
      expect(typeof result.current.addLightningChannel).toBe('function')
      expect(typeof result.current.updateLightningChannel).toBe('function')
      expect(typeof result.current.removeLightningChannel).toBe('function')
      expect(typeof result.current.addLightningPayment).toBe('function')
      expect(typeof result.current.updateLightningPayment).toBe('function')
      expect(typeof result.current.addLightningInvoice).toBe('function')
      expect(typeof result.current.updateLightningInvoice).toBe('function')
    })
  })

  describe('computed properties', () => {
    it('should return null for non-existent wallet', () => {
      const { result } = renderHook(() => useLightning())

      const wallet = result.current.getLightningWallet('non-existent')
      expect(wallet).toBeNull()
    })

    it('should return null for non-existent config', () => {
      const { result } = renderHook(() => useLightning())

      const config = result.current.getLightningConfig('non-existent')
      expect(config).toBeNull()
    })

    it('should return empty array for non-existent wallet channels', () => {
      const { result } = renderHook(() => useLightning())

      const channels = result.current.getLightningChannels('non-existent')
      expect(channels).toEqual([])
    })

    it('should return empty array for non-existent wallet payments', () => {
      const { result } = renderHook(() => useLightning())

      const payments = result.current.getLightningPayments('non-existent')
      expect(payments).toEqual([])
    })

    it('should return empty array for non-existent wallet invoices', () => {
      const { result } = renderHook(() => useLightning())

      const invoices = result.current.getLightningInvoices('non-existent')
      expect(invoices).toEqual([])
    })

    it('should return 0 balance for non-existent wallet', () => {
      const { result } = renderHook(() => useLightning())

      const balance = result.current.getLightningBalance('non-existent')
      expect(balance).toBe(0)
    })

    it('should return false for non-connected node', () => {
      const { result } = renderHook(() => useLightning())

      const isConnected = result.current.isNodeConnected('non-existent')
      expect(isConnected).toBe(false)
    })
  })

  describe('actions', () => {
    it('should dispatch setLightningWallet action', () => {
      const { result } = renderHook(() => useLightning())

      const mockWalletData: LightningWalletData = {
        nodePubkey: 'test-pubkey',
        channels: [],
        payments: [],
        invoices: [],
        config: {
          nodeUrl: 'localhost:9735',
          type: 'lnd',
          authMethod: 'tls',
          maxFeeLimit: 100000,
          defaultCltvExpiry: 144,
          timeoutSeconds: 30,
        },
      }

      act(() => {
        result.current.setLightningWallet('test-wallet', mockWalletData)
      })

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'LIGHTNING',
        action: {
          type: 'SET_LIGHTNING_WALLET',
          payload: { walletId: 'test-wallet', data: mockWalletData },
        },
      })
    })

    it('should dispatch updateLightningWallet action', () => {
      const { result } = renderHook(() => useLightning())

      const updates = { nodePubkey: 'updated-pubkey' }

      act(() => {
        result.current.updateLightningWallet('test-wallet', updates)
      })

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'LIGHTNING',
        action: {
          type: 'UPDATE_LIGHTNING_WALLET',
          payload: { walletId: 'test-wallet', updates },
        },
      })
    })

    it('should dispatch deleteLightningWallet action', () => {
      const { result } = renderHook(() => useLightning())

      act(() => {
        result.current.deleteLightningWallet('test-wallet')
      })

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'LIGHTNING',
        action: {
          type: 'DELETE_LIGHTNING_WALLET',
          payload: 'test-wallet',
        },
      })
    })

    it('should dispatch setLightningConfig action', () => {
      const { result } = renderHook(() => useLightning())

      const config: LightningConfig = {
        nodeUrl: 'localhost:9735',
        type: 'lnd',
        authMethod: 'tls',
        maxFeeLimit: 100000,
        defaultCltvExpiry: 144,
        timeoutSeconds: 30,
      }

      act(() => {
        result.current.setLightningConfig('test-wallet', config)
      })

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'LIGHTNING',
        action: {
          type: 'SET_LIGHTNING_CONFIG',
          payload: { walletId: 'test-wallet', config },
        },
      })
    })

    it('should dispatch setLoadingLightning action', () => {
      const { result } = renderHook(() => useLightning())

      act(() => {
        result.current.setLoadingLightning(true)
      })

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'LIGHTNING',
        action: {
          type: 'SET_LOADING_LIGHTNING',
          payload: true,
        },
      })
    })

    it('should dispatch setNodeConnection action', () => {
      const { result } = renderHook(() => useLightning())

      act(() => {
        result.current.setNodeConnection('test-wallet', true)
      })

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'LIGHTNING',
        action: {
          type: 'SET_NODE_CONNECTION',
          payload: { walletId: 'test-wallet', connected: true },
        },
      })
    })
  })

  describe('initializeLightningWallet', () => {
    it('should initialize lightning wallet for bitcoin wallet', async () => {
      const { result } = renderHook(() => useLightning())

      const config: LightningConfig = {
        nodeUrl: 'localhost:9735',
        type: 'lnd',
        authMethod: 'tls',
        maxFeeLimit: 100000,
        defaultCltvExpiry: 144,
        timeoutSeconds: 30,
      }

      await act(async () => {
        await result.current.initializeLightningWallet('bitcoin-wallet-1', config)
      })

      expect(mockDispatch).toHaveBeenCalledTimes(2)

      expect(mockDispatch).toHaveBeenNthCalledWith(1, {
        type: 'LIGHTNING',
        action: {
          type: 'SET_LIGHTNING_WALLET',
          payload: {
            walletId: 'bitcoin-wallet-1',
            data: {
              nodePubkey: '',
              channels: [],
              payments: [],
              invoices: [],
              config,
            },
          },
        },
      })

      expect(mockDispatch).toHaveBeenNthCalledWith(2, {
        type: 'LIGHTNING',
        action: {
          type: 'SET_LIGHTNING_CONFIG',
          payload: { walletId: 'bitcoin-wallet-1', config },
        },
      })
    })
  })
})
