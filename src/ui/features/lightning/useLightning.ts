// Custom hook para operações Lightning
// Simplifica o uso do LightningClient em componentes React

import { useState, useCallback } from 'react'
import { useNetwork } from '../network/NetworkProvider'
import {
  GenerateInvoiceParams,
  InvoiceWithChannelInfo,
  PaymentResult,
  LightningPaymentRequest,
} from '@/core/models/lightning/client'

export interface UseLightningResult {
  generateInvoice: (
    params: GenerateInvoiceParams,
    masterKey: Uint8Array,
    network?: 'mainnet' | 'testnet' | 'regtest',
  ) => Promise<InvoiceWithChannelInfo>
  sendPayment: (
    request: LightningPaymentRequest,
    masterKey: Uint8Array,
    network?: 'mainnet' | 'testnet' | 'regtest',
  ) => Promise<PaymentResult>
  getBalance: (
    masterKey: Uint8Array,
    network?: 'mainnet' | 'testnet' | 'regtest',
  ) => Promise<bigint>
  isLoading: boolean
  error: Error | null
}

/**
 * Hook para operações Lightning Network
 * Gerencia estado de loading e erro automaticamente
 */
export function useLightning(): UseLightningResult {
  const { getLightningClient } = useNetwork()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const generateInvoice = useCallback(
    async (
      params: GenerateInvoiceParams,
      masterKey: Uint8Array,
      network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
    ): Promise<InvoiceWithChannelInfo> => {
      setIsLoading(true)
      setError(null)
      try {
        const client = await getLightningClient(masterKey, network)
        const invoice = await client.generateInvoice(params)
        return invoice
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to generate invoice')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [getLightningClient],
  )

  const sendPayment = useCallback(
    async (
      request: LightningPaymentRequest,
      masterKey: Uint8Array,
      network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
    ): Promise<PaymentResult> => {
      setIsLoading(true)
      setError(null)
      try {
        const client = await getLightningClient(masterKey, network)
        const result = await client.sendPayment(request)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to send payment')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [getLightningClient],
  )

  const getBalance = useCallback(
    async (
      masterKey: Uint8Array,
      network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
    ): Promise<bigint> => {
      setIsLoading(true)
      setError(null)
      try {
        const client = await getLightningClient(masterKey, network)
        const balance = await client.getBalance()
        return balance
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get balance')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [getLightningClient],
  )

  return {
    generateInvoice,
    sendPayment,
    getBalance,
    isLoading,
    error,
  }
}
