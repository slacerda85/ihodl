import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'

// Import component after mocks are set up
import AdvancedFeeEstimation from './AdvancedFeeEstimation'

// Mock the core services (must be before component import)
jest.mock('@/core/services', () => ({
  walletService: {
    getAllWallets: jest.fn().mockReturnValue([]),
    getActiveWalletId: jest.fn().mockReturnValue(null),
    createWallet: jest.fn(),
    deleteWallet: jest.fn(),
    toggleActiveWallet: jest.fn(),
    editWallet: jest.fn(),
    getMasterKey: jest.fn(),
  },
  transactionService: {
    getFeeRates: jest.fn().mockResolvedValue({
      slow: 1,
      normal: 2,
      fast: 5,
      urgent: 10,
    }),
  },
}))

// Mock the wallet store (to prevent initialization errors)
jest.mock('@/ui/features/wallet/store', () => ({
  walletStore: {
    wallets: [],
    activeWalletId: null,
    activeWallet: null,
    createWallet: jest.fn(),
    deleteWallet: jest.fn(),
    toggleActiveWallet: jest.fn(),
    editWallet: jest.fn(),
    getMasterKey: jest.fn(),
  },
  useWalletStore: () => ({
    wallets: [],
    activeWalletId: null,
    activeWallet: null,
  }),
}))

// Mock the app-provider module completely
const mockGetConnection = jest.fn().mockResolvedValue({})

jest.mock('@/ui/features/app-provider', () => ({
  __esModule: true,
  useNetworkConnection: () => mockGetConnection,
  useIsDark: () => false,
  useAppContext: () => ({
    network: { getConnection: mockGetConnection },
    isConnected: true,
  }),
}))

jest.mock('@/ui/features/app-provider/AppProvider', () => ({
  __esModule: true,
  useNetworkConnection: () => mockGetConnection,
  useIsDark: () => false,
  useAppContext: () => ({
    network: { getConnection: mockGetConnection },
    isConnected: true,
  }),
}))

describe('AdvancedFeeEstimation', () => {
  const mockOnFeeRateChange = jest.fn()

  const defaultProps = {
    selectedFeeRate: 'normal' as const,
    onFeeRateChange: mockOnFeeRateChange,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders fee estimation options correctly', async () => {
    const { getByText } = render(<AdvancedFeeEstimation {...defaultProps} />)

    await waitFor(() => {
      expect(getByText('Fee Estimation')).toBeTruthy()
      expect(getByText('Normal')).toBeTruthy()
      expect(getByText('2 sat/vB')).toBeTruthy()
      expect(getByText('~1 hour')).toBeTruthy()
    })
  })

  it('calls onFeeRateChange when fee option is pressed', async () => {
    const { getByText } = render(<AdvancedFeeEstimation {...defaultProps} />)

    await waitFor(() => {
      const fastOption = getByText('Fast')
      fireEvent.press(fastOption)
      expect(mockOnFeeRateChange).toHaveBeenCalledWith('fast')
    })
  })

  it('shows loading state initially', () => {
    const { getByText } = render(<AdvancedFeeEstimation {...defaultProps} />)

    expect(getByText('Loading fee estimation...')).toBeTruthy()
  })

  it('toggles details view when details button is pressed', async () => {
    const { getByText, queryByText } = render(<AdvancedFeeEstimation {...defaultProps} />)

    await waitFor(() => {
      expect(getByText('Show Details')).toBeTruthy()
    })

    // Initially details should not be visible
    expect(queryByText('Network Conditions')).toBeNull()

    // Press show details
    fireEvent.press(getByText('Show Details'))

    await waitFor(() => {
      expect(getByText('Network Conditions')).toBeTruthy()
      expect(getByText('Hide Details')).toBeTruthy()
    })
  })

  it('displays network statistics in details view', async () => {
    const { getByText } = render(<AdvancedFeeEstimation {...defaultProps} />)

    await waitFor(() => {
      fireEvent.press(getByText('Show Details'))
    })

    await waitFor(() => {
      expect(getByText('Current Block Height')).toBeTruthy()
      expect(getByText('Mempool Size')).toBeTruthy()
      expect(getByText('Recommended Fee')).toBeTruthy()
    })
  })
})
