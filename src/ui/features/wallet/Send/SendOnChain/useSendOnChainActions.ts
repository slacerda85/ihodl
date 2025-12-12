/**
 * Hook para gerenciar ações de envio de transações on-chain
 */

import { useCallback } from 'react'
import { transactionService } from '@/core/services'
import { useSendOnChainState } from './useSendOnChainState'
import { useFeeRates } from './useFeeRates'
import { useBatchTransactions } from './useBatchTransactions'
import { useNetworkConnection } from '@/ui/features/app-provider/AppProvider'

interface UseSendOnChainActionsReturn {
  sendTransaction: () => Promise<void>
  sendBatchTransactions: () => Promise<void>
  buildTransaction: () => Promise<void>
  buildBatchTransaction: () => Promise<void>
  validateTransaction: () => boolean
}

export function useSendOnChainActions(): UseSendOnChainActionsReturn {
  const getConnection = useNetworkConnection()
  const state = useSendOnChainState()
  const { recipientAddress, amount, setSubmitting } = state

  const { feeRate } = useFeeRates()
  const { batchTransactions } = useBatchTransactions()

  const validateTransaction = useCallback(() => {
    if (!recipientAddress.trim()) {
      // setError('Recipient address is required')
      return false
    }

    if (!amount || amount <= 0) {
      // setError('Amount must be greater than 0')
      return false
    }

    if (!feeRate || feeRate <= 0) {
      // setError('Invalid fee rate')
      return false
    }

    return true
  }, [recipientAddress, amount, feeRate])

  const buildTransaction = useCallback(async () => {
    if (!validateTransaction()) return

    setSubmitting(true)
    // setError(null)

    try {
      console.log('[SendOnChain] Building transaction...')
      await getConnection()

      // TODO: Get UTXOs and change address from wallet service
      const utxos: any[] = []
      const changeAddress = ''

      await transactionService.buildTransaction({
        recipientAddress,
        amount: Math.floor(amount * 100000000), // Convert to satoshis
        feeRate,
        utxos,
        changeAddress,
      })

      // setTransaction(result.transaction)
      console.log('[SendOnChain] Transaction built successfully')
    } catch (error) {
      console.error('[SendOnChain] Failed to build transaction:', error)
      // setError(error instanceof Error ? error.message : 'Failed to build transaction')
    } finally {
      setSubmitting(false)
    }
  }, [validateTransaction, getConnection, feeRate, recipientAddress, amount, setSubmitting])

  const sendTransaction = useCallback(async () => {
    // if (!transaction) {
    //   setError('No transaction to send')
    //   return
    // }

    setSubmitting(true)
    // setError(null)

    try {
      console.log('[SendOnChain] Sending transaction...')
      await getConnection()

      // TODO: Get signed transaction and txHex
      const signedTransaction: any = null
      const txHex = ''

      const result = await transactionService.sendTransaction({
        signedTransaction,
        txHex,
      })

      // setSuccessMessage(`Transaction sent successfully! TXID: ${result.txid}`)
      // setTransaction(null)
      console.log('[SendOnChain] Transaction sent successfully:', result.txid)
    } catch (error) {
      console.error('[SendOnChain] Failed to send transaction:', error)
      // setError(error instanceof Error ? error.message : 'Failed to send transaction')
    } finally {
      setSubmitting(false)
    }
  }, [getConnection, setSubmitting])

  const buildBatchTransaction = useCallback(async () => {
    if (batchTransactions.length === 0) {
      // setError('No transactions in batch')
      return
    }

    setSubmitting(true)
    // setError(null)

    try {
      console.log('[SendOnChain] Building batch transaction...')
      await getConnection()

      // TODO: Get UTXOs and change address from wallet service
      const utxos: any[] = []
      const changeAddress = ''

      await transactionService.buildBatchTransaction({
        transactions: batchTransactions.map(tx => ({
          recipientAddress: tx.recipient,
          amount: tx.amount,
          feeRate: tx.feeRate,
        })),
        feeRate,
        utxos,
        changeAddress,
      })

      // setTransaction(result.transaction)
      console.log('[SendOnChain] Batch transaction built successfully')
    } catch (error) {
      console.error('[SendOnChain] Failed to build batch transaction:', error)
      // setError(error instanceof Error ? error.message : 'Failed to build batch transaction')
    } finally {
      setSubmitting(false)
    }
  }, [batchTransactions, feeRate, getConnection, setSubmitting])

  const sendBatchTransactions = useCallback(async () => {
    // if (!transaction) {
    //   setError('No batch transaction to send')
    //   return
    // }

    setSubmitting(true)
    // setError(null)

    try {
      console.log('[SendOnChain] Sending batch transaction...')
      await getConnection()

      // TODO: Get signed transaction and txHex
      const signedTransaction: any = null
      const txHex = ''

      const result = await transactionService.sendTransaction({
        signedTransaction,
        txHex,
      })

      // setSuccessMessage(`Batch transaction sent successfully! TXID: ${result.txid}`)
      // setTransaction(null)
      // clearBatch()
      console.log('[SendOnChain] Batch transaction sent successfully:', result.txid)
    } catch (error) {
      console.error('[SendOnChain] Failed to send batch transaction:', error)
      // setError(error instanceof Error ? error.message : 'Failed to send batch transaction')
    } finally {
      setSubmitting(false)
    }
  }, [getConnection, setSubmitting])

  return {
    sendTransaction,
    sendBatchTransactions,
    buildTransaction,
    buildBatchTransaction,
    validateTransaction,
  }
}
