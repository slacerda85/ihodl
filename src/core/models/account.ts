import { Tx } from './tx'

// bip 44 account model
export type Account = {
  purpose: number
  coinType: number
  accountIndex: number
}

export type AccountPath = Account & {
  change: number
  addressIndex: number
}

// extended account model with address
export type AccountDetails = Account & {
  change: number
  addressIndex: number
  address: string
  txs: Tx[]
}
