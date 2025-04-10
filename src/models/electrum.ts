// Define Electrum method types for type safety
export type ElectrumMethod =
  // Server methods
  | 'server.banner'
  | 'server.donation_address'
  | 'server.features'
  | 'server.peers.subscribe'
  | 'server.ping'
  | 'server.version'

  // Blockchain methods
  | 'blockchain.block.header'
  | 'blockchain.block.headers'
  | 'blockchain.estimatefee'
  | 'blockchain.headers.subscribe'
  | 'blockchain.relayfee'
  | 'blockchain.scripthash.get_balance'
  | 'blockchain.scripthash.get_history'
  | 'blockchain.scripthash.get_mempool'
  | 'blockchain.scripthash.listunspent'
  | 'blockchain.scripthash.subscribe'
  | 'blockchain.transaction.broadcast'
  | 'blockchain.transaction.get'
  | 'blockchain.transaction.get_merkle'
  | 'blockchain.transaction.id_from_pos'

  // Mempool methods
  | 'mempool.get_fee_histogram'

  // Deprecated methods included for backward compatibility
  | 'blockchain.address.get_balance'
  | 'blockchain.address.get_history'
  | 'blockchain.address.get_mempool'
  | 'blockchain.address.listunspent'
  | 'blockchain.address.subscribe'
  | 'blockchain.block.get_chunk'
  | 'blockchain.block.get_header'
  | 'blockchain.numblocks.subscribe'
  | 'blockchain.utxo.get_address'

// Response structure from Electrum
export interface ElectrumResponse<T> {
  result: T
  error: null | {
    code: number
    message: string
  }
  id: string
}

export type GetHistoryResult = {
  tx_hash: string
  height: number
}

export interface ScriptSig {
  asm: string
  hex: string
}

export interface Vin {
  scriptSig: ScriptSig
  sequence: number
  txid: string
  vout: number
  // Additional fields might exist for coinbase transactions
  coinbase?: string
  witness?: string[]
}

export interface ScriptPubKey {
  addresses: string[]
  asm: string
  hex: string
  reqSigs: number
  type: string // 'pubkeyhash', 'scripthash', 'multisig', etc.
}

export interface Vout {
  n: number
  scriptPubKey: ScriptPubKey
  value: number // BTC amount
}

export interface GetTransactionResult {
  blockhash: string
  blocktime: number
  confirmations: number
  hash: string
  hex: string
  locktime: number
  size: number
  time: number
  txid: string
  version: number
  vin: Vin[]
  vout: Vout[]
  // Additional fields that might be present in some responses
  weight?: number
  vsize?: number
  fee?: number
  valueIn?: number
  valueOut?: number
}
