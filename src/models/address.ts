import { Tx } from './transaction'

export type AddressInfo = {
  index: number
  address: string
  txs: Tx[] // Transactions associated with the address
}
