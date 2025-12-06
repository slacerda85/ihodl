/**
 * Hook para Transações da Mempool
 *
 * Busca transações pendentes na mempool que envolvem endereços da carteira.
 * Usado para detectar depósitos recebidos antes da confirmação.
 *
 * FUNCIONALIDADES:
 * - Busca transações pendentes na mempool via Electrum
 * - Polling periódico (configurável)
 * - Refresh manual
 * - Transforma Tx em FriendlyTx para exibição
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNetwork } from '@/ui/features/network/NetworkProvider'
import { useActiveWalletId } from '@/ui/features/app-provider'
import { addressService, transactionService } from '@/core/services'
import type { Tx } from '@/core/models/transaction'

// ==========================================
// TYPES
// ==========================================

export interface MempoolTransaction {
  /** Transaction ID */
  txid: string
  /** Valor em satoshis (positivo = recebido, negativo = enviado) */
  amount: number
  /** Direção da transação */
  direction: 'received' | 'sent' | 'self'
  /** Endereço de origem/destino para exibição */
  displayAddress: string
  /** Fee em satoshis (se disponível) */
  fee?: number
  /** Timestamp de quando foi detectada */
  detectedAt: number
  /** Dados brutos da transação */
  rawTx: Tx
}

export interface UseMempoolTransactionsResult {
  /** Transações pendentes na mempool */
  transactions: MempoolTransaction[]
  /** Está carregando */
  isLoading: boolean
  /** Erro, se houver */
  error: string | null
  /** Refresh manual */
  refresh: () => Promise<void>
  /** Última atualização (timestamp) */
  lastUpdated: number | null
}

// ==========================================
// CONSTANTS
// ==========================================

/** Intervalo de polling padrão (30 segundos) */
const DEFAULT_POLLING_INTERVAL = 30000

/** Limite de endereços para verificar na mempool */
const MEMPOOL_CHECK_GAP_LIMIT = 20

// ==========================================
// HELPERS
// ==========================================

/**
 * Transforma uma Tx da mempool em MempoolTransaction
 */
function transformMempoolTx(tx: Tx, walletAddresses: Set<string>): MempoolTransaction | null {
  try {
    // Calcular outputs da carteira
    let outputAmount = 0
    let externalAddress = ''

    // Somar valores dos outputs
    for (const vout of tx.vout || []) {
      const addresses = vout.scriptPubKey?.addresses || []
      const value = Math.round((vout.value || 0) * 100000000) // BTC para satoshis

      const isOurAddress = addresses.some(addr => walletAddresses.has(addr))

      if (isOurAddress) {
        outputAmount += value
      } else {
        // Guardar endereço externo para exibição
        if (addresses.length > 0 && !externalAddress) {
          externalAddress = addresses[0]
        }
      }
    }

    // Determinar direção e valor
    // Se temos outputs para nós, é provavelmente um recebimento
    if (outputAmount > 0) {
      return {
        txid: tx.txid,
        amount: outputAmount,
        direction: 'received',
        displayAddress: externalAddress || 'External',
        fee: undefined, // Fee não está disponível diretamente no tipo Tx
        detectedAt: Date.now(),
        rawTx: tx,
      }
    }

    return null
  } catch (error) {
    console.error('[useMempoolTransactions] Error transforming tx:', error)
    return null
  }
}

// ==========================================
// HOOK
// ==========================================

export function useMempoolTransactions(
  pollingInterval: number = DEFAULT_POLLING_INTERVAL,
): UseMempoolTransactionsResult {
  const { getConnection } = useNetwork()
  const activeWalletId = useActiveWalletId()

  const [transactions, setTransactions] = useState<MempoolTransaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isRefreshingRef = useRef(false)
  const refreshFnRef = useRef<(() => Promise<void>) | undefined>(undefined)

  const refresh = useCallback(async () => {
    if (!activeWalletId || isRefreshingRef.current) {
      return
    }

    isRefreshingRef.current = true
    setIsLoading(true)
    setError(null)

    try {
      // 1. Obter endereços para verificar na mempool
      const addressesToCheck = addressService.getAddressesForMempoolCheck(MEMPOOL_CHECK_GAP_LIMIT)

      if (addressesToCheck.length === 0) {
        setTransactions([])
        setLastUpdated(Date.now())
        return
      }

      // 2. Criar set de endereços da carteira para lookup rápido
      const walletAddressSet = new Set(addressesToCheck)

      // 3. Buscar transações da mempool
      const connection = await getConnection()
      const mempoolTxs = await transactionService.getMempoolTransactions(
        addressesToCheck,
        connection,
      )

      // 4. Transformar para formato de exibição
      const transformedTxs: MempoolTransaction[] = []
      for (const tx of mempoolTxs) {
        const transformed = transformMempoolTx(tx, walletAddressSet)
        if (transformed) {
          transformedTxs.push(transformed)
        }
      }

      // 5. Ordenar por timestamp de detecção (mais recente primeiro)
      transformedTxs.sort((a, b) => b.detectedAt - a.detectedAt)

      setTransactions(transformedTxs)
      setLastUpdated(Date.now())

      console.log(`[useMempoolTransactions] Found ${transformedTxs.length} mempool transactions`)
    } catch (err) {
      console.error('[useMempoolTransactions] Error fetching mempool:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch mempool transactions')
    } finally {
      setIsLoading(false)
      isRefreshingRef.current = false
    }
  }, [activeWalletId, getConnection])

  // Manter ref atualizada com a função refresh mais recente
  useEffect(() => {
    refreshFnRef.current = refresh
  }, [refresh])

  // Polling periódico - usa ref para evitar loop infinito
  useEffect(() => {
    if (!activeWalletId) {
      setTransactions([])
      return
    }

    // Refresh inicial (com delay para não bloquear UI)
    const initialTimeout = setTimeout(() => {
      refreshFnRef.current?.()
    }, 1000)

    // Configurar polling
    let intervalId: ReturnType<typeof setInterval> | null = null
    if (pollingInterval > 0) {
      intervalId = setInterval(() => {
        refreshFnRef.current?.()
      }, pollingInterval)
      pollingRef.current = intervalId
    }

    return () => {
      clearTimeout(initialTimeout)
      if (intervalId) {
        clearInterval(intervalId)
      }
      pollingRef.current = null
    }
  }, [activeWalletId, pollingInterval])

  // Limpar quando wallet muda
  useEffect(() => {
    setTransactions([])
    setLastUpdated(null)
    setError(null)
  }, [activeWalletId])

  return {
    transactions,
    isLoading,
    error,
    refresh,
    lastUpdated,
  }
}

export default useMempoolTransactions
