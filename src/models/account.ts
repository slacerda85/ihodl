// bitcoin only
export type Purpose =
  | 44 // Legacy
  | 49 // P2SH SegWit
  | 84 // Native SegWit
  | 86 // Taproot
  | 9735 // Lightning

export type CoinType = 0 // Bitcoin

export type LightningAccountType = 'node' | 'channel' | 'funding_wallet'

export type LightningDerivedKeys = {
  nodeKey?: {
    privateKey: Uint8Array
    publicKey: Uint8Array
    nodeId: string
  }
  fundingKeys?: {
    privateKey: Uint8Array
    publicKey: Uint8Array
    address: string
  }
  channelKeys?: {
    channelId: string
    fundingPrivateKey: Uint8Array
    paymentPrivateKey: Uint8Array
    delayedPrivateKey: Uint8Array
    revocationPrivateKey: Uint8Array
    htlcPrivateKey: Uint8Array
    ptlcPrivateKey: Uint8Array
    perCommitmentPrivateKey: Uint8Array
  }
}

export type Account = {
  purpose: Purpose
  coinType: CoinType
  accountIndex: number
  // Lightning-specific fields (optional, only used when purpose === 9735)
  lightning?: {
    type: LightningAccountType
    chain: number // 0 for Bitcoin mainnet, 1 for testnet
    lnVer: number // 0 for BOLT, 1 for Bifrost
    nodeIndex?: number // For node accounts
    channelId?: string // For channel accounts
    caseIndex?: number // For funding wallet accounts
    derivedKeys?: LightningDerivedKeys // Derived keys from seed
  }
}
