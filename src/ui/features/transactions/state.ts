import { Tx, UIFriendlyTransaction } from '@/lib/transactions/types'

// Base types for reducer pattern
type Reducer<S, A> = (state: S, action: A) => S

// Transactions State
export type TransactionsState = {
  /* refactored fields */
  loading: boolean
  history: TxHistory[]
  friendly: UIFriendlyTransaction[]
}

type TxHistory = {
  walletId: string
  receivingAddress: string
  changeAddress: string
  index: number
  used?: boolean
  txs?: Tx[] // Transactions associated with the address
  lastUpdated?: number
}

export const initialTransactionsState: TransactionsState = {
  loading: false,
  history: [],
  friendly: [],
}

// Transactions Actions
export type ActionType = 'setLoading' | 'setHistory' | 'setFriendly'

export type Actions = Action

type Action = Record<ActionType, (payload: any) => { type: ActionType; payload: typeof payload }>

export const actions: Actions = {
  setLoading: (payload: boolean) => ({ type: 'setLoading', payload }) as const,
  setHistory: (payload: TxHistory[]) => ({ type: 'setHistory', payload }) as const,
  setFriendly: (payload: UIFriendlyTransaction[]) => ({ type: 'setFriendly', payload }) as const,
}

const actionReducers: Record<ActionType, Reducer<TransactionsState, any>> = {
  setLoading: (state: TransactionsState, payload: boolean): TransactionsState => ({
    ...state,
    loading: payload,
  }),

  setHistory: (state: TransactionsState, payload: TxHistory[]): TransactionsState => ({
    ...state,
    history: [...state.history.filter(h => h.walletId !== payload[0]?.walletId), ...payload],
  }),

  setFriendly: (state: TransactionsState, payload: UIFriendlyTransaction[]): TransactionsState => ({
    ...state,
    friendly: [...state.friendly.filter(f => f.walletId !== payload[0]?.walletId), ...payload],
  }),
}

export const transactionsReducer: Reducer<
  TransactionsState,
  ReturnType<(typeof actions)[keyof typeof actions]>
> = (state, action) => {
  const { type, payload } = action
  const reducer = actionReducers[type]
  if (reducer) {
    return reducer(state, payload)
  } else {
    return state
  }
}
