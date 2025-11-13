import { Tx } from '../transactions'

// bitcoin only
export type Purpose =
  | 44 // Legacy
  | 49 // P2SH SegWit
  | 84 // Native SegWit
  | 86 // Taproot
  | 9735 // Lightning

export type CoinType = 0 // Bitcoin

export type Account = {
  purpose: Purpose
  coinType: CoinType
  account: number
  change: number
  index: number
  // lightning?: LightningAccountData
}

export type AccountDetails = Account & {
  address: string
  txs: Tx[]
}

export interface KeyVersion {
  private: Uint8Array
  public: Uint8Array
}

export type KeyVersionType = 'bip32' | 'bip49' | 'bip84'

export type NetworkType = 'mainnet' | 'testnet' | 'regtest'

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

export type LightningAccountData = {
  type: LightningAccountType
  derivedKeys?: LightningDerivedKeys
  chain?: number
  lnVer?: number
  caseIndex?: number
}
