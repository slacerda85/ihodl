import { Tx } from './transaction'

export type AddressInfo = {
  receivingAddress: string
  changeAddress: string
  index: number
  txs: Tx[] // Transactions associated with the address
}
