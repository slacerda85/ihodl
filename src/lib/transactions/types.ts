export const MINIMUN_CONFIRMATIONS = 6

export interface UTXO {
  txid: string
  vout: number
  address: string
  amount: number
  blocktime: number
  confirmations: number
  isSpent: boolean
  scriptPubKey: ScriptPubKey
}

export type TxHistory = {
  receivingAddress: string
  changeAddress: string
  index: number
  txs: Tx[] // Transactions associated with the address
}

export type Tx = {
  in_active_chain: boolean
  hex: string
  txid: string
  hash: string
  size: number
  vsize: number
  weight: number
  version: number
  locktime: number
  vin: Vin[]
  vout: Vout[]
  blockhash: string
  confirmations?: number
  blocktime: number
  time: number
}

export type Vin = {
  txid: string
  vout: number
  scriptSig: {
    asm: string
    hex: string
  }
  sequence: number
  txinwitness?: string[]
}

export type Vout = {
  value: number
  n: number
  scriptPubKey: ScriptPubKey
}

export type ScriptPubKey = {
  asm: string
  hex: string
  reqSigs: number
  type: string
  address: string
  addresses?: string[]
}

export type TransactionType = 'received' | 'sent'
export type TransactionStatus = 'pending' | 'processing' | 'confirmed' | 'unknown'

export type WalletTransaction = {
  walletId: string
  txid: string
  date: string
  type: TransactionType
  fromAddress: string
  toAddress: string
  amount: number
  status: TransactionStatus
}

export type UIFriendlyTransaction = WalletTransaction & {
  fee: number | null
  confirmations: number | null
}

// Types for transaction building and signing
export interface BuildTransactionParams {
  recipientAddress: string
  amount: number // in satoshis
  feeRate: number // sat/vB
  utxos: UTXO[]
  changeAddress: string
  extendedKey: Uint8Array
  purpose?: number
  coinType?: number
  account?: number
}

export interface BuildTransactionResult {
  transaction: any // bitcoinjs-lib Transaction
  inputs: {
    txid: string
    vout: number
    amount: number
    address: string
  }[]
  outputs: {
    address: string
    amount: number
  }[]
  fee: number
  changeAmount: number
}

export interface SignTransactionParams {
  transaction: any // bitcoinjs-lib Transaction
  inputs: {
    txid: string
    vout: number
    amount: number
    address: string
  }[]
  extendedKey: Uint8Array
  purpose?: number
  coinType?: number
  account?: number
}

export interface SignTransactionResult {
  signedTransaction: any // bitcoinjs-lib Transaction
  txHex: string
  txid: string
}

export interface SendTransactionParams {
  signedTransaction: any // bitcoinjs-lib Transaction
  txHex: string
  getConnectionFn?: () => Promise<any>
}

export interface SendTransactionResult {
  txid: string
  success: boolean
  error?: string
}
