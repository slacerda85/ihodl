import { Tx } from './transaction'

export type Block = {
  hash: string
  confirmations: number
  size: number
  strippedsize: number
  weight: number
  height: number
  version: number
  versionHex: string
  merkleroot: string
  tx: string[] | Tx[]
  time: number
  mediantime: number
  nonce: number
  bits: string
  difficulty: number
  chainwork: string
  nTx: number
  previousblockhash: string
  nextblockhash: string
}
