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

// UI friendly tx
export type FriendlyTx = {
  walletId: string
  txid: string
  date: string
  type: FriendlyTxType
  fromAddress: string
  toAddress: string
  amount: number
  status: FriendlyTxStatus
  fee: number | null
  confirmations: number
}

export type FriendlyTxType = 'received' | 'sent'
export type FriendlyTxStatus = 'pending' | 'processing' | 'confirmed' | 'unknown'
