export const MINIMUN_CONFIRMATIONS = 6

export type TxHistory = {
  receivingAddress: string
  changeAddress: string
  index: number
  txs: Tx[] // Transactions associated with the address
}

export type UTXO = {
  txid: string
  vout: number
  address: string
  amount: number
  confirmations: number
  scriptPubKey: ScriptPubKey
  redeemScript?: string
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

type ScriptPubKey = {
  asm: string
  hex: string
  reqSigs: number
  type: string
  address: string
}

export type TransactionType = 'received' | 'sent'
export type TransactionStatus = 'pending' | 'processing' | 'confirmed' | 'unknown'

export type WalletTransaction = {
  txid: string
  date: string
  type: TransactionType
  fromAddress: string
  toAddress: string
  amount: number
  status: TransactionStatus
}
