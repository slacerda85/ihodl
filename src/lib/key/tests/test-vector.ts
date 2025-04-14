export type Chain = {
  pubKey: string
  privKey: string
  address?: string
}

export type Chains = Record<string, Chain>

export type TestVector = {
  mnemonic?: string
  seed?: string
  chains: Chains
}
