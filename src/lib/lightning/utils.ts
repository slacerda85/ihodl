/**
 * Creates a funding transaction for opening a Lightning channel
 * @param fundingAddress - The funding address (derived from Lightning wallet)
 * @param amount - Amount to fund the channel in satoshis
 * @param feeRate - Fee rate in sat/vbyte
 * @param utxos - Available UTXOs for funding
 * @returns Funding transaction details
 */
export function createFundingTransaction(
  fundingAddress: string,
  amount: number,
  feeRate: number = 1,
  utxos: {
    txid: string
    vout: number
    value: number
    scriptPubKey: string
  }[],
): {
  txid: string
  hex: string
  fee: number
  inputs: any[]
  outputs: any[]
} {
  // TODO: Implement funding transaction creation
  // This involves:
  // 1. Selecting appropriate UTXOs
  // 2. Creating the transaction with funding output
  // 3. Calculating fees
  // 4. Signing the transaction

  throw new Error('Funding transaction creation not yet implemented')
}

/**
 * Creates a commitment transaction for a Lightning channel
 * @param channelId - The channel ID
 * @param fundingTxid - The funding transaction ID
 * @param fundingVout - The funding output index
 * @param localBalance - Local balance in satoshis
 * @param remoteBalance - Remote balance in satoshis
 * @param localPubkey - Local node's public key
 * @param remotePubkey - Remote node's public key
 * @param commitmentNumber - Commitment number
 * @returns Commitment transaction details
 */
export function createCommitmentTransaction(
  channelId: string,
  fundingTxid: string,
  fundingVout: number,
  localBalance: number,
  remoteBalance: number,
  localPubkey: string,
  remotePubkey: string,
  commitmentNumber: number,
): {
  txid: string
  hex: string
  inputs: any[]
  outputs: any[]
} {
  // TODO: Implement commitment transaction creation
  // This involves:
  // 1. Creating the commitment transaction structure
  // 2. Adding HTLC outputs if any
  // 3. Adding to_local and to_remote outputs
  // 4. Signing with appropriate keys

  throw new Error('Commitment transaction creation not yet implemented')
}

/**
 * Creates an HTLC (Hash Time Lock Contract) transaction
 * @param paymentHash - The payment hash
 * @param amount - HTLC amount in satoshis
 * @param expiry - Expiry height or timestamp
 * @param revocationPubkey - Revocation public key
 * @param localDelayedPubkey - Local delayed public key
 * @param remoteHtlcPubkey - Remote HTLC public key
 * @returns HTLC transaction details
 */
export function createHtlcTransaction(
  paymentHash: string,
  amount: number,
  expiry: number,
  revocationPubkey: string,
  localDelayedPubkey: string,
  remoteHtlcPubkey: string,
): {
  txid: string
  hex: string
  inputs: any[]
  outputs: any[]
} {
  // TODO: Implement HTLC transaction creation
  // This involves:
  // 1. Creating HTLC script
  // 2. Setting up the hash lock and time lock
  // 3. Adding appropriate outputs

  throw new Error('HTLC transaction creation not yet implemented')
}

/**
 * Signs a Lightning transaction with the appropriate keys
 * @param transaction - The transaction to sign
 * @param privateKeys - Private keys for signing
 * @param sighashType - Sighash type (default SIGHASH_ALL)
 * @returns Signed transaction
 */
export function signLightningTransaction(
  transaction: any,
  privateKeys: Uint8Array[],
  sighashType: number = 0x01, // SIGHASH_ALL
): {
  txid: string
  hex: string
} {
  // TODO: Implement Lightning transaction signing
  // This involves:
  // 1. Creating sighash for each input
  // 2. Signing with appropriate private keys
  // 3. Combining signatures

  throw new Error('Lightning transaction signing not yet implemented')
}

/**
 * Validates a Lightning channel transaction
 * @param transaction - The transaction to validate
 * @param channelState - Current channel state
 * @returns Validation result
 */
export function validateChannelTransaction(
  transaction: any,
  channelState: {
    channelId: string
    localBalance: number
    remoteBalance: number
    commitmentNumber: number
  },
): {
  valid: boolean
  errors: string[]
} {
  // TODO: Implement channel transaction validation
  // This involves:
  // 1. Checking transaction structure
  // 2. Validating balances
  // 3. Checking signatures
  // 4. Verifying HTLCs

  throw new Error('Channel transaction validation not yet implemented')
}

/**
 * Calculates the fee for a Lightning channel transaction
 * @param vbytes - Transaction size in vbytes
 * @param feeRate - Fee rate in sat/vbyte
 * @param dustLimit - Dust limit in satoshis
 * @returns Calculated fee
 */
export function calculateLightningFee(
  vbytes: number,
  feeRate: number,
  dustLimit: number = 546,
): number {
  const fee = Math.ceil(vbytes * feeRate)
  return Math.max(fee, dustLimit)
}

/**
 * Estimates the size of a commitment transaction in vbytes
 * @param numHtlcs - Number of HTLCs in the transaction
 * @param hasToLocal - Whether transaction has to_local output
 * @param hasToRemote - Whether transaction has to_remote output
 * @returns Estimated size in vbytes
 */
export function estimateCommitmentTxSize(
  numHtlcs: number = 0,
  hasToLocal: boolean = true,
  hasToRemote: boolean = true,
): number {
  // Base transaction size (version + locktime + input + outputs)
  let size = 4 + 4 + 41 + 1 // version, locktime, input, output count

  // Add to_local output if present
  if (hasToLocal) {
    size += 31 // P2WPKH output
  }

  // Add to_remote output if present
  if (hasToRemote) {
    size += 31 // P2WPKH output
  }

  // Add HTLC outputs
  size += numHtlcs * 43 // HTLC output size

  // Add witness data
  size += 1 + 1 // witness count + input witness count
  size += 73 // local signature
  size += 33 // local pubkey
  size += numHtlcs * 73 // HTLC signatures

  return Math.ceil(size)
}

/**
 * Validates Lightning channel parameters
 * @param params - Channel parameters to validate
 * @returns Validation result
 */
export function validateChannelParams(params: {
  fundingAmount: number
  pushAmount?: number
  dustLimit?: number
  channelReserve?: number
  htlcMinimum?: number
  feeRate?: number
  toSelfDelay?: number
  maxAcceptedHtlcs?: number
}): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Validate funding amount
  if (params.fundingAmount < 1000) {
    errors.push('Funding amount must be at least 1000 satoshis')
  }

  // Validate push amount
  if (params.pushAmount && params.pushAmount > params.fundingAmount) {
    errors.push('Push amount cannot exceed funding amount')
  }

  // Validate dust limit
  if (params.dustLimit && params.dustLimit < 546) {
    errors.push('Dust limit must be at least 546 satoshis')
  }

  // Validate channel reserve
  if (params.channelReserve && params.channelReserve < 0) {
    errors.push('Channel reserve cannot be negative')
  }

  // Validate HTLC minimum
  if (params.htlcMinimum && params.htlcMinimum < 1) {
    errors.push('HTLC minimum must be at least 1 satoshi')
  }

  // Validate fee rate
  if (params.feeRate && params.feeRate < 0) {
    errors.push('Fee rate cannot be negative')
  }

  // Validate to_self_delay
  if (params.toSelfDelay && (params.toSelfDelay < 144 || params.toSelfDelay > 2016)) {
    errors.push('to_self_delay must be between 144 and 2016 blocks')
  }

  // Validate max_accepted_htlcs
  if (params.maxAcceptedHtlcs && (params.maxAcceptedHtlcs < 1 || params.maxAcceptedHtlcs > 483)) {
    errors.push('max_accepted_htlcs must be between 1 and 483')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Generates a channel ID from funding transaction
 * @param fundingTxid - Funding transaction ID
 * @param fundingVout - Funding output index
 * @returns Channel ID as hex string
 */
export function generateChannelId(fundingTxid: string, fundingVout: number): string {
  // Channel ID is funding_txid + funding_vout (little endian)
  const txidBytes = Buffer.from(fundingTxid, 'hex').reverse()
  const voutBytes = Buffer.alloc(4)
  voutBytes.writeUInt32LE(fundingVout, 0)

  return Buffer.concat([txidBytes, voutBytes]).toString('hex')
}

/**
 * Parses a channel ID to extract funding transaction info
 * @param channelId - Channel ID as hex string
 * @returns Funding transaction info
 */
export function parseChannelId(channelId: string): {
  fundingTxid: string
  fundingVout: number
} {
  const channelIdBytes = Buffer.from(channelId, 'hex')

  if (channelIdBytes.length !== 36) {
    throw new Error('Invalid channel ID length')
  }

  const txidBytes = channelIdBytes.subarray(0, 32).reverse()
  const vout = channelIdBytes.readUInt32LE(32)

  return {
    fundingTxid: txidBytes.toString('hex'),
    fundingVout: vout,
  }
}
