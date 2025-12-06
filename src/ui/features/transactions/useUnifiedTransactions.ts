/**
 * Hook para Transações Unificadas
 *
 * Combina transações de múltiplos ativos (BTC on-chain, Lightning, RGB)
 * em uma lista unificada e ordenada com suporte a filtros.
 * Inclui transações pendentes da mempool.
 */

import { useMemo, useCallback, useState } from 'react'
import { transactionService } from '@/core/services'
import { useAddresses, useAddressLoading } from '@/ui/features/app-provider'
import { useLightningPayments, useLightningInvoices, useLightningActions } from '../lightning/hooks'
import { useMempoolTransactions, type MempoolTransaction } from './useMempoolTransactions'
import type { FriendlyTx } from '@/core/models/transaction'
import type { Payment, Invoice } from '../lightning/types'
import type {
  UnifiedTransaction,
  TransactionFilters,
  TransactionListItem,
  AssetType,
  UnifiedTransactionStatus,
  TransactionDirection,
} from './types'

// ==========================================
// TRANSFORMERS
// ==========================================

/**
 * Converte transação on-chain para formato unificado
 */
function transformOnchainTx(tx: FriendlyTx): UnifiedTransaction {
  const direction: TransactionDirection =
    tx.type === 'received' ? 'received' : tx.type === 'sent' ? 'sent' : 'self'

  // Mapear status on-chain
  let status: UnifiedTransactionStatus = 'pending'
  if (tx.status === 'confirmed') {
    status = 'confirmed'
  } else if (tx.status === 'pending' || tx.status === 'processing') {
    status = 'pending'
  }

  return {
    id: `onchain-${tx.txid}`,
    assetType: 'btc-onchain',
    direction,
    amount: tx.amount,
    status,
    createdAt: new Date(tx.date).getTime(),
    confirmedAt: status === 'confirmed' ? new Date(tx.date).getTime() : undefined,
    displayAddress: direction === 'received' ? tx.fromAddress : tx.toAddress,
    nativeId: tx.txid,
    fee: tx.fee ?? undefined,
    metadata: {
      type: 'btc-onchain',
      txid: tx.txid,
      confirmations: tx.confirmations ?? 0,
    },
  }
}

/**
 * Converte pagamento Lightning para formato unificado
 */
function transformLightningPayment(payment: Payment): UnifiedTransaction {
  let status: UnifiedTransactionStatus = 'pending'
  if (payment.status === 'succeeded') {
    status = 'confirmed'
  } else if (payment.status === 'failed') {
    status = 'failed'
  }

  return {
    id: `ln-payment-${payment.paymentHash}`,
    assetType: 'lightning',
    direction: payment.direction,
    amount: Number(payment.amount) / 1000, // msat para sat
    status,
    createdAt: payment.createdAt,
    confirmedAt: payment.resolvedAt,
    nativeId: payment.paymentHash,
    metadata: {
      type: 'lightning',
      paymentHash: payment.paymentHash,
      preimage: payment.preimage,
    },
  }
}

/**
 * Converte invoice Lightning paga para formato unificado
 */
function transformLightningInvoice(invoice: Invoice): UnifiedTransaction {
  let status: UnifiedTransactionStatus = 'pending'
  if (invoice.status === 'paid') {
    status = 'confirmed'
  } else if (invoice.status === 'expired') {
    status = 'expired'
  }

  return {
    id: `ln-invoice-${invoice.paymentHash}`,
    assetType: 'lightning',
    direction: 'received',
    amount: Number(invoice.amount) / 1000, // msat para sat
    status,
    createdAt: invoice.createdAt,
    description: invoice.description,
    nativeId: invoice.paymentHash,
    metadata: {
      type: 'lightning',
      paymentHash: invoice.paymentHash,
      invoice: invoice.invoice,
    },
  }
}

/**
 * Converte transação da mempool para formato unificado
 */
function transformMempoolTx(tx: MempoolTransaction): UnifiedTransaction {
  return {
    id: `mempool-${tx.txid}`,
    assetType: 'btc-onchain',
    direction: tx.direction,
    amount: tx.amount,
    status: 'pending',
    createdAt: tx.detectedAt,
    displayAddress: tx.displayAddress,
    nativeId: tx.txid,
    fee: tx.fee,
    isMempool: true, // Flag para identificar que veio da mempool
    metadata: {
      type: 'btc-onchain',
      txid: tx.txid,
      confirmations: 0,
    },
  }
}

// ==========================================
// FILTER LOGIC
// ==========================================

/**
 * Aplica filtros à lista de transações
 */
function applyFilters(
  transactions: UnifiedTransaction[],
  filters: TransactionFilters,
): UnifiedTransaction[] {
  return transactions.filter(tx => {
    // Filtro por ativo
    if (filters.assets.length > 0 && !filters.assets.includes(tx.assetType)) {
      return false
    }

    // Filtro por status
    if (filters.statuses.length > 0 && !filters.statuses.includes(tx.status)) {
      return false
    }

    // Filtro por direção
    if (filters.direction && tx.direction !== filters.direction) {
      return false
    }

    // Filtro por data
    if (filters.dateFrom && tx.createdAt < filters.dateFrom) {
      return false
    }
    if (filters.dateTo && tx.createdAt > filters.dateTo) {
      return false
    }

    // Filtro por texto
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase()
      const searchable = [tx.nativeId, tx.displayAddress, tx.description, tx.assetType]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!searchable.includes(query)) {
        return false
      }
    }

    return true
  })
}

/**
 * Agrupa transações por data para exibição
 */
function groupByDate(transactions: UnifiedTransaction[]): TransactionListItem[] {
  const grouped: Record<string, UnifiedTransaction[]> = {}

  for (const tx of transactions) {
    const dateKey = new Date(tx.createdAt).toISOString().split('T')[0]
    if (!grouped[dateKey]) {
      grouped[dateKey] = []
    }
    grouped[dateKey].push(tx)
  }

  // Ordenar datas (mais recente primeiro)
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const result: TransactionListItem[] = []

  for (const dateKey of sortedDates) {
    // Formatar data para exibição
    const displayDate = new Date(dateKey + 'T00:00:00').toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })

    result.push({
      type: 'date-header',
      date: dateKey,
      displayDate,
    })

    // Ordenar transações do dia por hora (mais recente primeiro)
    const dayTransactions = grouped[dateKey].sort((a, b) => b.createdAt - a.createdAt)

    for (const tx of dayTransactions) {
      result.push({
        type: 'transaction',
        transaction: tx,
      })
    }
  }

  return result
}

// ==========================================
// MAIN HOOK
// ==========================================

export interface UseUnifiedTransactionsResult {
  /** Lista de itens para exibição (com headers de data) */
  listItems: TransactionListItem[]
  /** Lista de transações filtradas (sem headers) */
  transactions: UnifiedTransaction[]
  /** Total de transações (sem filtros) */
  totalCount: number
  /** Está carregando dados */
  isLoading: boolean
  /** Filtros atuais */
  filters: TransactionFilters
  /** Atualizar filtros */
  setFilters: (filters: TransactionFilters) => void
  /** Toggle ativo específico */
  toggleAsset: (asset: AssetType) => void
  /** Limpar todos os filtros */
  clearFilters: () => void
  /** Atualizar dados */
  refresh: () => Promise<void>
  /** Está atualizando */
  isRefreshing: boolean
  /** Ativos disponíveis com contagem */
  assetCounts: Record<AssetType, number>
  /** Número de transações pendentes na mempool */
  mempoolCount: number
  /** Está carregando mempool */
  isMempoolLoading: boolean
}

/**
 * Hook principal para transações unificadas
 */
export function useUnifiedTransactions(): UseUnifiedTransactionsResult {
  // State
  const [filters, setFilters] = useState<TransactionFilters>({
    assets: [],
    statuses: [],
    direction: null,
  })
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Data sources
  const addresses = useAddresses()
  const addressLoading = useAddressLoading()
  const lightningPayments = useLightningPayments()
  const lightningInvoices = useLightningInvoices()
  const { refreshPayments, refreshInvoices } = useLightningActions()

  // Mempool transactions (polling every 30s)
  const {
    transactions: mempoolTxs,
    isLoading: isMempoolLoading,
    refresh: refreshMempool,
  } = useMempoolTransactions()

  // Loading state - também considera o loading do addressStore (ex: ao mudar de carteira)
  const isLoading = addresses === null || addressLoading

  // Set of confirmed txids to avoid duplicates with mempool
  const confirmedTxIds = useMemo((): Set<string> => {
    const txIds = new Set<string>()
    if (addresses) {
      const onchainTxs = transactionService.getFriendlyTxs(addresses)
      for (const tx of onchainTxs) {
        txIds.add(tx.txid)
      }
    }
    return txIds
  }, [addresses])

  // Transform and merge transactions
  const allTransactions = useMemo((): UnifiedTransaction[] => {
    const result: UnifiedTransaction[] = []

    // On-chain transactions (confirmed)
    if (addresses) {
      const onchainTxs = transactionService.getFriendlyTxs(addresses)
      for (const tx of onchainTxs) {
        result.push(transformOnchainTx(tx))
      }
    }

    // Mempool transactions (pendentes, não duplicadas)
    for (const tx of mempoolTxs) {
      // Só adicionar se não está nas confirmadas
      if (!confirmedTxIds.has(tx.txid)) {
        result.push(transformMempoolTx(tx))
      }
    }

    // Lightning payments (sent)
    for (const payment of lightningPayments) {
      result.push(transformLightningPayment(payment))
    }

    // Lightning invoices (received, only paid ones)
    for (const invoice of lightningInvoices) {
      if (invoice.status === 'paid') {
        result.push(transformLightningInvoice(invoice))
      }
    }

    // Sort by date (most recent first)
    result.sort((a, b) => b.createdAt - a.createdAt)

    return result
  }, [addresses, lightningPayments, lightningInvoices, mempoolTxs, confirmedTxIds])

  // Mempool count (transações pendentes não duplicadas)
  const mempoolCount = useMemo(() => {
    return mempoolTxs.filter(tx => !confirmedTxIds.has(tx.txid)).length
  }, [mempoolTxs, confirmedTxIds])

  // Asset counts
  const assetCounts = useMemo((): Record<AssetType, number> => {
    const counts: Record<AssetType, number> = {
      'btc-onchain': 0,
      lightning: 0,
      rgb: 0,
    }

    for (const tx of allTransactions) {
      counts[tx.assetType]++
    }

    return counts
  }, [allTransactions])

  // Apply filters
  const filteredTransactions = useMemo(() => {
    return applyFilters(allTransactions, filters)
  }, [allTransactions, filters])

  // Group by date
  const listItems = useMemo(() => {
    return groupByDate(filteredTransactions)
  }, [filteredTransactions])

  // Actions
  const toggleAsset = useCallback((asset: AssetType) => {
    setFilters(prev => {
      const newAssets = prev.assets.includes(asset)
        ? prev.assets.filter(a => a !== asset)
        : [...prev.assets, asset]
      return { ...prev, assets: newAssets }
    })
  }, [])

  const clearFilters = useCallback(() => {
    setFilters({
      assets: [],
      statuses: [],
      direction: null,
    })
  }, [])

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([refreshPayments(), refreshInvoices(), refreshMempool()])
      // TODO: Refresh on-chain transactions via address provider
    } finally {
      setIsRefreshing(false)
    }
  }, [refreshPayments, refreshInvoices, refreshMempool])

  return {
    listItems,
    transactions: filteredTransactions,
    totalCount: allTransactions.length,
    isLoading,
    filters,
    setFilters,
    toggleAsset,
    clearFilters,
    refresh,
    isRefreshing,
    assetCounts,
    mempoolCount,
    isMempoolLoading,
  }
}

export default useUnifiedTransactions
