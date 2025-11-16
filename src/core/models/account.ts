import { Tx } from './tx'

// bitcoin specific types and constants

export const enum Purpose {
  BIP44 = 0x8000002c, // Legacy (P2PKH)
  BIP49 = 0x80000031, // Nested SegWit (P2SH-P2WPKH)
  BIP84 = 0x80000054, // Native SegWit (P2WPKH) BIP84
  BIP86 = 0x80000056, // Taproot (P2TR)
}

export const enum CoinType {
  Bitcoin = 0x80000000,
  Testnet = 0x80000001,
  Litecoin = 0x80000002,
  Ethereum = 0x8000003c, // Note: Ethereum usa SLIP-44, mas adaptável
}

export const enum AccountIndex {
  Main = 0x80000000,
}

export const enum Change {
  Receiving = 0,
  Change = 1,
}

// Tipos atualizados
export type Account = {
  purpose: Purpose
  coinType: CoinType
  accountIndex: AccountIndex
}

export type AccountPath = Account & {
  change: Change
  addressIndex: number
}

export type AccountDetails = Account & {
  change: Change
  addressIndex: number
  address: string
  txs: Tx[]
}

export type WalletAccount = AccountDetails & {
  walletId: string
}
