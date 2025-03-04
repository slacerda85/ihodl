type Wallet = {
  mnemonic: string
  privateKey: Uint8Array
  chainCode: Uint8Array
}

type AccountPath = {
  purpose: number
  coinType: number
  accountIndex: number
  change: number
}

type Account = {
  wallet: Wallet
  accountPath: AccountPath
  balance: number
  transactions: Tx[]
}

type Tx = {
  txid: string
  vout: number
  value: number
  address: string
  confirmations: number
}
