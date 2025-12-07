import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import AdvancedFeeEstimation from './AdvancedFeeEstimation'

// Mock the network hook
jest.mock('@/ui/features/network/NetworkProvider', () => ({
  useNetwork: () => ({
    getConnection: jest.fn().mockResolvedValue({}),
  }),
}))

// Mock transaction service
jest.mock('@/core/services', () => ({
  transactionService: {
    getFeeRates: jest.fn().mockResolvedValue({
      slow: 1,
      normal: 2,
      fast: 5,
      urgent: 10,
    }),
  },
}))

// Mock the isDark hook
jest.mock('@/ui/features/app-provider', () => ({
  useIsDark: () => false,
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
