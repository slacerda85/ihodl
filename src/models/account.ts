// export type Account = Record<AccountProtocol, AccountType[]>
export type AccountType = OnchainAccountType | LightningAccountType
export type OnchainAccountType = 'bip44' | 'bip49' | 'bip84' | 'bip86'
export type LightningAccountType = 'lightning-node'
export type AccountProtocol = 'onchain' | 'lightning'
export type AccountPath = {
  [key in AccountType]: BIPAccountPath
}

export type BIPAccountPath = BIP44Path | BIP49Path | BIP84Path | BIP86Path | LightningNodePath

export type BIP44Path = "m/44'/0'/0'"
export type BIP49Path = "m/49'/0'/0'"
export type BIP84Path = "m/84'/0'/0'"
export type BIP86Path = "m/86'/0'/0'"
export type LightningNodePath = "m/86'/0'/0'"

export const accountPath: AccountPath = {
  bip44: "m/44'/0'/0'",
  bip49: "m/49'/0'/0'",
  bip84: "m/84'/0'/0'",
  bip86: "m/86'/0'/0'",
  'lightning-node': "m/86'/0'/0'",
}

export interface AccountData {
  extendedKey: Uint8Array
  // childIndex: number
  // parentFingerprint: number
  // depth: number
  // path: AccountPath[AccountType]
}

export interface AccountDataRaw {
  // For raw data, we use string to represent the byte arrays
  // privateKey: Record<string, string>
  // chainCode: Record<string, string>
  extendedKeyRaw: Record<string, string>
}

// bitcoin only
export type Purpose =
  | 44 // Legacy
  | 49 // P2SH SegWit
  | 84 // Native SegWit
  | 86 // Taproot

export type CoinType = 0 // Bitcoin

export type Account = {
  purpose: Purpose
  coinTypes: CoinType[]
  accountIndex?: number
}
