import { Tx } from './transaction'

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

export const GAP_LIMIT = 20

export type DerivationPath = {
  purpose: Purpose
  coinType: CoinType
  accountIndex: AccountIndex
  change: Change
  addressIndex: number
}
export type AddressCollection = {
  walletId: string
  addresses: AddressDetails[]
  nextReceiveIndex: number // Próximo índice disponível para change=0
  nextChangeIndex: number // Próximo índice disponível para change=1
  gapLimit: number // Limite de gap para scanning (ex: 20)
}

export type AddressDetails = {
  derivationPath: DerivationPath
  address: string
  txs: Tx[]
}

// Script opcodes and constants
export const OP_0 = 0x00
export const P2WPKH_VERSION = 0x00
export const HASH160_LENGTH = 0x14 // 20 bytes
