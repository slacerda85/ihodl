import { AddressInfo } from './address'

// bitcoin only
export type Purpose =
  | 44 // Legacy
  | 49 // P2SH SegWit
  | 84 // Native SegWit
  | 86 // Taproot

export type CoinType = 0 // Bitcoin

export type AccountToAdd = {
  purpose: Purpose
  coinTypes: CoinType[]
  accountIndex?: number
}

export type Account = {
  purpose: Purpose
  coinType: CoinType
  accountIndex: number
  addressInfo: AddressInfo[]
}
