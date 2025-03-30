export type AddressType = OnchainAddressType | LightningAddressType
export type OnchainAddressType = 'bip44' | 'bip49' | 'bip84' | 'bip86'
export type LightningAddressType = 'lightning-node'
export type WalletProtocol = 'onchain' | 'lightning'

export type AddressTypePath = {
  [key in AddressType]: string
}

export const addressTypePath: AddressTypePath = {
  bip44: "m/44'/0'/0'",
  bip49: "m/49'/0'/0'",
  bip84: "m/84'/0'/0'",
  bip86: "m/86'/0'/0'",
  'lightning-node': "m/86'/0'/0'",
}
