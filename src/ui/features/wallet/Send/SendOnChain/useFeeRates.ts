/**
 * Hook para gerenciar o fetch e estado das taxas de fee
 */

import { useEffect, useCallback, useRef, useState } from 'react'
import { useNetwork } from '../../../network/NetworkProvider'
import { transactionService } from '@/core/services'

interface FeeRates {
  slow: number
  normal: number
  fast: number
  urgent: number
}

interface UseFeeRatesReturn {
  feeRates: FeeRates | null
  selectedFeeRate: 'slow' | 'normal' | 'fast' | 'urgent'
  feeRate: number
  setFeeRates: (rates: FeeRates | null) => void
  setSelectedFeeRate: (rate: 'slow' | 'normal' | 'fast' | 'urgent') => void
  fetchRecommendedFeeRates: () => Promise<void>
}

export function useFeeRates(): UseFeeRatesReturn {
  const { getConnection } = useNetwork()
  const [feeRates, setFeeRates] = useState<FeeRates | null>(null)
  const [selectedFeeRate, setSelectedFeeRate] = useState<'slow' | 'normal' | 'fast' | 'urgent'>(
    'normal',
  )

  // Refs para evitar múltiplas chamadas
  const feeRatesFetchedRef = useRef(false)

  // Function to fetch recommended fee rates from network
  const fetchRecommendedFeeRates = useCallback(async () => {
    if (feeRatesFetchedRef.current) return
    feeRatesFetchedRef.current = true
    setSelectedFeeRate('normal')

    try {
      console.log('[SendOnChain] Fetching recommended fee rates from network...')
      const connection = await getConnection()
      const rates = await transactionService.getFeeRates(connection)
      setFeeRates(rates)

      console.log('[SendOnChain] Fee rates updated:', rates)
    } catch (error) {
      console.error('[SendOnChain] Failed to fetch fee rates:', error)
      const fallbackRates = { slow: 1, normal: 2, fast: 5, urgent: 10 }
      setFeeRates(fallbackRates)
      setSelectedFeeRate('normal')
    }
  }, [getConnection])

  // Effect to fetch fee rates quando componente monta
  useEffect(() => {
    ;(async () => {
      await fetchRecommendedFeeRates()
    })()
  }, [fetchRecommendedFeeRates])

  // Fee rate efetivo derivado (sem state duplicado)
  const feeRate = feeRates ? feeRates[selectedFeeRate] : 1 // fallback

  return {
    feeRates,
    selectedFeeRate,
    feeRate,
    setFeeRates,
    setSelectedFeeRate,
    fetchRecommendedFeeRates,
  }
}
