/**
 * Hook para gerenciar o estado principal do SendOnChain
 */

import { useState, useRef } from 'react'

export type FeeRateType = 'slow' | 'normal' | 'fast' | 'urgent'

export type CoinSelectionAlgorithm =
  | 'largest_first'
  | 'smallest_first'
  | 'branch_and_bound'
  | 'random'
  | 'privacy_focused'

export type SighashType = 'ALL' | 'NONE' | 'SINGLE' | 'ANYONECANPAY'

export interface BatchTransaction {
  id: string
  recipientAddress: string
  amount: number
  memo?: string
}

export interface SendOnChainState {
  // Basic transaction state
  submitting: boolean
  recipientAddress: string
  amountInput: string
  amount: number
  memo: string

  // Fee rates state
  feeRates: {
    slow: number
    normal: number
    fast: number
    urgent: number
  } | null
  selectedFeeRate: FeeRateType

  // Batch transactions state
  isBatchMode: boolean
  batchTransactions: BatchTransaction[]

  // Advanced options state
  coinSelectionAlgorithm: CoinSelectionAlgorithm
  avoidAddressReuse: boolean
  consolidateSmallUtxos: boolean
  enableRBF: boolean
  sighashType: SighashType
  enableCPFP: boolean
  cpfpTargetFeeRate: number
}

export interface SendOnChainStateActions {
  setSubmitting: (submitting: boolean) => void
  setRecipientAddress: (address: string) => void
  setAmountInput: (input: string) => void
  setAmount: (amount: number) => void
  setMemo: (memo: string) => void
  setFeeRates: (rates: SendOnChainState['feeRates']) => void
  setSelectedFeeRate: (rate: FeeRateType) => void
  setIsBatchMode: (isBatch: boolean) => void
  setBatchTransactions: (transactions: BatchTransaction[]) => void
  setCoinSelectionAlgorithm: (algorithm: CoinSelectionAlgorithm) => void
  setAvoidAddressReuse: (avoid: boolean) => void
  setConsolidateSmallUtxos: (consolidate: boolean) => void
  setEnableRBF: (enable: boolean) => void
  setSighashType: (type: SighashType) => void
  setEnableCPFP: (enable: boolean) => void
  setCpfpTargetFeeRate: (rate: number) => void
}

const initialState: SendOnChainState = {
  submitting: false,
  recipientAddress: '',
  amountInput: '',
  amount: 0,
  memo: '',
  feeRates: null,
  selectedFeeRate: 'normal',
  isBatchMode: false,
  batchTransactions: [],
  coinSelectionAlgorithm: 'branch_and_bound',
  avoidAddressReuse: false,
  consolidateSmallUtxos: false,
  enableRBF: false,
  sighashType: 'ALL',
  enableCPFP: false,
  cpfpTargetFeeRate: 10,
}

export function useSendOnChainState(): SendOnChainState & SendOnChainStateActions {
  const [state, setState] = useState<SendOnChainState>(initialState)

  // Refs para evitar múltiplas chamadas
  const feeRatesFetchedRef = useRef(false)

  const actions: SendOnChainStateActions = {
    setSubmitting: submitting => setState(prev => ({ ...prev, submitting })),
    setRecipientAddress: address => setState(prev => ({ ...prev, recipientAddress: address })),
    setAmountInput: input => setState(prev => ({ ...prev, amountInput: input })),
    setAmount: amount => setState(prev => ({ ...prev, amount })),
    setMemo: memo => setState(prev => ({ ...prev, memo })),
    setFeeRates: rates => setState(prev => ({ ...prev, feeRates: rates })),
    setSelectedFeeRate: rate => setState(prev => ({ ...prev, selectedFeeRate: rate })),
    setIsBatchMode: isBatch => setState(prev => ({ ...prev, isBatchMode: isBatch })),
    setBatchTransactions: transactions =>
      setState(prev => ({ ...prev, batchTransactions: transactions })),
    setCoinSelectionAlgorithm: algorithm =>
      setState(prev => ({ ...prev, coinSelectionAlgorithm: algorithm })),
    setAvoidAddressReuse: avoid => setState(prev => ({ ...prev, avoidAddressReuse: avoid })),
    setConsolidateSmallUtxos: consolidate =>
      setState(prev => ({ ...prev, consolidateSmallUtxos: consolidate })),
    setEnableRBF: enable => setState(prev => ({ ...prev, enableRBF: enable })),
    setSighashType: type => setState(prev => ({ ...prev, sighashType: type })),
    setEnableCPFP: enable => setState(prev => ({ ...prev, enableCPFP: enable })),
    setCpfpTargetFeeRate: rate => setState(prev => ({ ...prev, cpfpTargetFeeRate: rate })),
  }

  return {
    ...state,
    ...actions,
    // Adicionar a ref para uso externo se necessário
    feeRatesFetchedRef,
  } as SendOnChainState &
    SendOnChainStateActions & { feeRatesFetchedRef: React.MutableRefObject<boolean> }
}
