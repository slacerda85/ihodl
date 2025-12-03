export type Tx = {
  in_active_chain: boolean
  hex: string
  txid: string
  hash: string
  size: number
  vsize: number
  weight: number
  version: number
  locktime: number
  vin: Vin[]
  vout: Vout[]
  blockhash: string
  confirmations?: number
  blocktime: number
  time: number
  // SPV merkle proof to validate inclusion in a block
  height?: number
  proof?: MerkleProof
}

export type MerkleProof = {
  merkle: string[] // Array of sibling hashes from tx to root
  pos: number // Position of tx in Merkle tree
}

export type Vin = {
  txid: string
  vout: number
  scriptSig: {
    asm: string
    hex: string
  }
  sequence: number
  txinwitness?: string[]
}

export type Vout = {
  value: number
  n: number
  scriptPubKey: ScriptPubKey
}

export type ScriptPubKey = {
  asm: string
  hex: string
  reqSigs: number
  type: string
  address: string
  addresses?: string[]
}

export type Utxo = {
  txid: string
  vout: number
  address: string
  scriptPubKey: ScriptPubKey
  amount: number
  confirmations: number
  blocktime: number
  isSpent: boolean
}

// UI friendly tx
export type FriendlyTx = {
  txid: string
  date: string
  type: FriendlyTxType
  fromAddress: string
  toAddress: string
  amount: number
  status: FriendlyTxStatus
  fee: number | null
  confirmations: number
}

export type FriendlyTxType = 'received' | 'sent' | 'self'
export type FriendlyTxStatus = 'pending' | 'processing' | 'confirmed' | 'unknown'
