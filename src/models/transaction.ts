export const MINIMUN_CONFIRMATIONS = 6

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
  scriptPubKey: {
    asm: string
    hex: string
    reqSigs: number
    type: string
    address: string
  }
}
