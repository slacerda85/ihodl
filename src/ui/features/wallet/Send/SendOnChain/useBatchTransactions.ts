/**
 * Hook para gerenciar transações em lote (batch transactions)
 */

import { useState, useCallback, useMemo } from 'react'

interface BatchTransaction {
  id: string
  recipient: string
  amount: number
  feeRate: number
  transaction?: any // bitcoinjs-lib Transaction
}

interface UseBatchTransactionsReturn {
  batchTransactions: BatchTransaction[]
  addToBatch: (transaction: Omit<BatchTransaction, 'id'>) => void
  removeFromBatch: (id: string) => void
  clearBatch: () => void
  updateBatchTransaction: (id: string, updates: Partial<BatchTransaction>) => void
  totalBatchAmount: number
  totalBatchFee: number
  batchCount: number
}

export function useBatchTransactions(): UseBatchTransactionsReturn {
  const [batchTransactions, setBatchTransactions] = useState<BatchTransaction[]>([])

  const addToBatch = useCallback((transaction: Omit<BatchTransaction, 'id'>) => {
    const newTransaction: BatchTransaction = {
      ...transaction,
      id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }
    setBatchTransactions(prev => [...prev, newTransaction])
  }, [])

  const removeFromBatch = useCallback((id: string) => {
    setBatchTransactions(prev => prev.filter(tx => tx.id !== id))
  }, [])

  const clearBatch = useCallback(() => {
    setBatchTransactions([])
  }, [])

  const updateBatchTransaction = useCallback((id: string, updates: Partial<BatchTransaction>) => {
    setBatchTransactions(prev => prev.map(tx => (tx.id === id ? { ...tx, ...updates } : tx)))
  }, [])

  const totalBatchAmount = useMemo(() => {
    return batchTransactions.reduce((total, tx) => total + tx.amount, 0)
  }, [batchTransactions])

  const totalBatchFee = useMemo(() => {
    return batchTransactions.reduce((total, tx) => total + (tx.feeRate || 0), 0)
  }, [batchTransactions])

  const batchCount = batchTransactions.length

  return {
    batchTransactions,
    addToBatch,
    removeFromBatch,
    clearBatch,
    updateBatchTransaction,
    totalBatchAmount,
    totalBatchFee,
    batchCount,
  }
}
