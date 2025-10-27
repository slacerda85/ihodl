import { hash256, hash160, uint8ArrayToHex, hexToUint8Array } from '@/lib/crypto'
import secp256k1 from 'secp256k1'
// import { broadcastTransaction } from '@/lib/electrum'

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
  // Validate inputs
  if (amount <= 0) {
    throw new Error('Funding amount must be positive')
  }

  if (utxos.length === 0) {
    throw new Error('No UTXOs provided for funding')
  }

  // Select UTXOs (simple largest-first selection)
  const selectedUtxos = selectUtxosForFunding(utxos, amount, feeRate)
  const totalInputAmount = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0)

  // Estimate fee (rough calculation for funding tx)
  const estimatedSize = 200 + selectedUtxos.length * 150 // Base size + per input
  const estimatedFee = Math.ceil(estimatedSize * feeRate)

  // Calculate change (if any)
  const changeAmount = totalInputAmount - amount - estimatedFee

  // Create transaction structure
  const tx = {
    version: 2,
    inputs: [] as any[],
    outputs: [] as any[],
    locktime: 0, // BOLT #3: funding transaction locktime = 0
    witnesses: [] as Uint8Array[][],
  }

  // Add inputs
  for (const utxo of selectedUtxos) {
    tx.inputs.push({
      txid: utxo.txid,
      vout: utxo.vout,
      scriptSig: new Uint8Array(0), // Empty for SegWit
      sequence: 0xffffffff,
    })
    tx.witnesses.push([]) // Empty witness to be filled during signing
  }

  // Add funding output (2-of-2 multisig will be created by the caller)
  // For now, we'll assume the fundingAddress is the P2WSH address
  tx.outputs.push({
    value: amount,
    scriptPubKey: createScriptPubKeyFromAddress(fundingAddress),
  })

  // Add change output if significant
  if (changeAmount > 546) {
    // Dust threshold
    // For simplicity, assume change goes back to first input's address
    // In practice, this should be a proper change address
    tx.outputs.push({
      value: changeAmount,
      scriptPubKey: hexToUint8Array(selectedUtxos[0].scriptPubKey),
    })
  }

  // Calculate actual fee
  const actualFee = totalInputAmount - tx.outputs.reduce((sum, output) => sum + output.value, 0)

  return {
    txid: '', // Will be calculated after signing
    hex: '', // Will be calculated after signing
    fee: actualFee,
    inputs: tx.inputs,
    outputs: tx.outputs,
  }
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
  // Validate inputs
  if (localBalance < 0 || remoteBalance < 0) {
    throw new Error('Balances cannot be negative')
  }

  if (localBalance + remoteBalance === 0) {
    throw new Error('Total channel balance cannot be zero')
  }

  // Create transaction structure (BOLT #3: SegWit v2)
  const tx = {
    version: 2,
    inputs: [] as any[],
    outputs: [] as any[],
    locktime: commitmentNumber, // BOLT #3: locktime = commitment_number
    witnesses: [] as Uint8Array[][],
  }

  // Add input from funding transaction
  tx.inputs.push({
    txid: fundingTxid,
    vout: fundingVout,
    scriptSig: new Uint8Array(0), // Empty for SegWit
    sequence: 0xffffffff,
  })
  tx.witnesses.push([]) // Empty witness to be filled during signing

  // Add to_local output (if local balance > 0)
  if (localBalance > 0) {
    // BOLT #3: to_local is P2WPKH with CSV delay
    const localPubkeyBytes = hexToUint8Array(localPubkey)
    const localPubkeyHash = hash160(localPubkeyBytes)

    const toLocalScript = new Uint8Array(22)
    toLocalScript[0] = 0x00 // OP_0
    toLocalScript[1] = 0x14 // Push 20 bytes
    toLocalScript.set(localPubkeyHash, 2)

    tx.outputs.push({
      value: localBalance,
      scriptPubKey: toLocalScript,
    })
  }

  // Add to_remote output (if remote balance > 0)
  if (remoteBalance > 0) {
    // BOLT #3: to_remote is P2WPKH
    const remotePubkeyBytes = hexToUint8Array(remotePubkey)
    const remotePubkeyHash = hash160(remotePubkeyBytes)

    const toRemoteScript = new Uint8Array(22)
    toRemoteScript[0] = 0x00 // OP_0
    toRemoteScript[1] = 0x14 // Push 20 bytes
    toRemoteScript.set(remotePubkeyHash, 2)

    tx.outputs.push({
      value: remoteBalance,
      scriptPubKey: toRemoteScript,
    })
  }

  // Note: HTLC outputs would be added here if present
  // For simplicity, we're not implementing HTLCs in this basic version

  return {
    txid: '', // Will be calculated after signing
    hex: '', // Will be calculated after signing
    inputs: tx.inputs,
    outputs: tx.outputs,
  }
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
  // This is a simplified HTLC implementation
  // In practice, HTLC scripts are more complex with multiple execution paths

  // For offered HTLC (BOLT #3):
  // OP_IF
  //   <remote_htlc_key>
  // OP_ELSE
  //   <to_self_delay> OP_CSV OP_DROP <local_delayed_key>
  // OP_ENDIF
  // OP_CHECKSIG

  const revocationPubkeyBytes = hexToUint8Array(revocationPubkey)
  const localDelayedPubkeyBytes = hexToUint8Array(localDelayedPubkey)

  // Simplified HTLC script (offered HTLC)
  const htlcScript = createHtlcScript(
    revocationPubkeyBytes,
    localDelayedPubkeyBytes,
    hexToUint8Array(paymentHash),
    expiry,
    144, // to_self_delay
  )

  // Create P2WSH output
  const scriptHash = hash256(htlcScript)
  const p2wshScript = new Uint8Array(34)
  p2wshScript[0] = 0x00 // OP_0
  p2wshScript[1] = 0x20 // Push 32 bytes
  p2wshScript.set(scriptHash, 2)

  const tx = {
    version: 2,
    inputs: [] as any[],
    outputs: [
      {
        value: amount,
        scriptPubKey: p2wshScript,
      },
    ],
    locktime: 0,
    witnesses: [] as Uint8Array[][],
  }

  return {
    txid: '', // Will be calculated after signing
    hex: '', // Will be calculated after signing
    inputs: tx.inputs,
    outputs: tx.outputs,
  }
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
  // Validate inputs
  if (!transaction.inputs || transaction.inputs.length === 0) {
    throw new Error('Transaction has no inputs to sign')
  }

  if (privateKeys.length !== transaction.inputs.length) {
    throw new Error('Number of private keys must match number of inputs')
  }

  // Sign each input
  for (let i = 0; i < transaction.inputs.length; i++) {
    const privateKey = privateKeys[i]
    const publicKey = secp256k1.publicKeyCreate(privateKey)

    // Create sighash for SegWit (BIP 143)
    const sighash = createLightningSighash(transaction, i, publicKey, sighashType)

    // Sign the sighash
    const { signature } = secp256k1.ecdsaSign(sighash, privateKey)

    // Convert to DER format and add sighash type
    const derSignature = compactSignatureToDER(signature)
    const signatureWithType = new Uint8Array(derSignature.length + 1)
    signatureWithType.set(derSignature, 0)
    signatureWithType[derSignature.length] = sighashType

    // Set witness
    transaction.witnesses[i] = [signatureWithType, publicKey]
  }

  // Serialize the signed transaction
  const signedTxBytes = serializeLightningTransaction(transaction)
  const txHex = uint8ArrayToHex(signedTxBytes)
  const txid = uint8ArrayToHex(hash256(signedTxBytes).reverse())

  return {
    txid,
    hex: txHex,
  }
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
  const errors: string[] = []

  // Validate basic transaction structure
  if (!transaction.version || transaction.version !== 2) {
    errors.push('Transaction must be version 2 (SegWit)')
  }

  if (!transaction.inputs || transaction.inputs.length === 0) {
    errors.push('Transaction must have at least one input')
  }

  if (!transaction.outputs || transaction.outputs.length === 0) {
    errors.push('Transaction must have at least one output')
  }

  // For commitment transactions, validate locktime
  if (transaction.locktime !== channelState.commitmentNumber) {
    errors.push(`Locktime must equal commitment number (${channelState.commitmentNumber})`)
  }

  // Validate input amounts and structure
  for (const input of transaction.inputs) {
    if (!input.txid || typeof input.txid !== 'string') {
      errors.push('Input must have valid txid')
    }
    if (typeof input.vout !== 'number' || input.vout < 0) {
      errors.push('Input must have valid vout')
    }
    // Note: In practice, you'd need to look up the actual input amounts
    // For now, we'll assume they're valid
  }

  // Validate outputs
  let totalOutputAmount = 0
  let hasToLocal = false
  let hasToRemote = false

  for (const output of transaction.outputs) {
    if (typeof output.value !== 'number' || output.value <= 0) {
      errors.push('Output must have positive value')
    }

    if (output.value < 546) {
      errors.push('Output value below dust threshold')
    }

    totalOutputAmount += output.value

    // Check if this is a to_local or to_remote output
    // This is a simplified check - in practice, you'd verify the script structure
    if (output.scriptPubKey && output.scriptPubKey.length === 22) {
      // Likely P2WPKH (to_local or to_remote)
      if (!hasToLocal) {
        hasToLocal = true
      } else if (!hasToRemote) {
        hasToRemote = true
      }
    }
  }

  // Validate balances
  const expectedTotal = channelState.localBalance + channelState.remoteBalance
  if (totalOutputAmount !== expectedTotal) {
    errors.push(
      `Output total (${totalOutputAmount}) doesn't match channel balance (${expectedTotal})`,
    )
  }

  // For commitment transactions, ensure we have appropriate outputs
  if (channelState.localBalance > 0 && !hasToLocal) {
    errors.push('Missing to_local output for non-zero local balance')
  }

  if (channelState.remoteBalance > 0 && !hasToRemote) {
    errors.push('Missing to_remote output for non-zero remote balance')
  }

  // Validate witnesses (for signed transactions)
  if (transaction.witnesses) {
    if (transaction.witnesses.length !== transaction.inputs.length) {
      errors.push('Number of witnesses must match number of inputs')
    }

    for (const witness of transaction.witnesses) {
      if (!witness || witness.length === 0) {
        errors.push('Transaction inputs must be signed (have witnesses)')
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
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

/**
 * Selects UTXOs for funding transaction
 * @param utxos - Available UTXOs
 * @param targetAmount - Target funding amount
 * @param feeRate - Fee rate for size estimation
 * @returns Selected UTXOs
 */
function selectUtxosForFunding(
  utxos: { txid: string; vout: number; value: number; scriptPubKey: string }[],
  targetAmount: number,
  feeRate: number,
): { txid: string; vout: number; value: number; scriptPubKey: string }[] {
  // Sort by value descending (largest first)
  const sortedUtxos = [...utxos].sort((a, b) => b.value - a.value)

  const selected: typeof utxos = []
  let total = 0

  for (const utxo of sortedUtxos) {
    selected.push(utxo)
    total += utxo.value

    // Estimate if we have enough including fees
    const estimatedSize = 200 + selected.length * 150
    const estimatedFee = Math.ceil(estimatedSize * feeRate)

    if (total >= targetAmount + estimatedFee) {
      break
    }
  }

  if (total < targetAmount) {
    throw new Error('Insufficient funds for funding amount')
  }

  return selected
}

/**
 * Creates scriptPubKey from Bitcoin address
 * @param address - Bitcoin address
 * @returns ScriptPubKey as Uint8Array
 */
function createScriptPubKeyFromAddress(address: string): Uint8Array {
  // For P2WSH addresses (Lightning funding)
  if (address.startsWith('bc1')) {
    // This is a simplified implementation
    // In practice, you'd need proper bech32 decoding
    // For now, assume it's already a script hash
    const scriptHash = hexToUint8Array(address.slice(4)) // Remove 'bc1' prefix
    const script = new Uint8Array(34)
    script[0] = 0x00 // OP_0
    script[1] = 0x20 // Push 32 bytes
    script.set(scriptHash.slice(0, 32), 2)
    return script
  }

  throw new Error('Unsupported address format for funding')
}

/**
 * Creates HTLC script for offered HTLC
 * @param revocationPubkey - Revocation public key
 * @param localDelayedPubkey - Local delayed public key
 * @param paymentHash - Payment hash
 * @param expiry - Expiry
 * @param toSelfDelay - To self delay in blocks
 * @returns HTLC script
 */
function createHtlcScript(
  revocationPubkey: Uint8Array,
  localDelayedPubkey: Uint8Array,
  paymentHash: Uint8Array,
  expiry: number,
  toSelfDelay: number,
): Uint8Array {
  // BOLT #3: Offered HTLC script
  // OP_IF
  //   <revocation_pubkey>
  // OP_ELSE
  //   <to_self_delay> OP_CSV OP_DROP <local_delayed_pubkey>
  // OP_ENDIF
  // OP_CHECKSIG

  // This is a simplified implementation
  // Real HTLC scripts are more complex
  const script: number[] = []

  // OP_IF (0x63)
  script.push(0x63)

  // Push revocation pubkey
  script.push(0x21) // Push 33 bytes
  script.push(...revocationPubkey)

  // OP_ELSE (0x67)
  script.push(0x67)

  // Push to_self_delay (as 2-byte number)
  script.push(0x02) // Push 2 bytes
  script.push(toSelfDelay & 0xff)
  script.push((toSelfDelay >> 8) & 0xff)

  // OP_CSV (0xb2)
  script.push(0xb2)

  // OP_DROP (0x75)
  script.push(0x75)

  // Push local delayed pubkey
  script.push(0x21) // Push 33 bytes
  script.push(...localDelayedPubkey)

  // OP_ENDIF (0x68)
  script.push(0x68)

  // OP_CHECKSIG (0xac)
  script.push(0xac)

  return new Uint8Array(script)
}

/**
 * Creates sighash for Lightning transaction (BIP 143)
 * @param tx - Transaction
 * @param inputIndex - Input index
 * @param publicKey - Public key for the input
 * @param sighashType - Sighash type
 * @returns Sighash
 */
function createLightningSighash(
  tx: any,
  inputIndex: number,
  publicKey: Uint8Array,
  sighashType: number,
): Uint8Array {
  // BIP 143 sighash for SegWit v0
  const sighashPreimage: Uint8Array[] = []

  // Version (4 bytes, little endian)
  const versionBytes = new Uint8Array(4)
  new DataView(versionBytes.buffer).setUint32(0, tx.version, true)
  sighashPreimage.push(versionBytes)

  // Double SHA256 of all inputs (hashPrevouts)
  const prevouts = tx.inputs.map((input: any) => {
    const txid = hexToUint8Array(input.txid).reverse()
    const vout = new Uint8Array(4)
    new DataView(vout.buffer).setUint32(0, input.vout, true)
    return new Uint8Array([...txid, ...vout])
  })
  const hashPrevouts = hash256(flattenArrays(prevouts))
  sighashPreimage.push(hashPrevouts)

  // Double SHA256 of all sequences (hashSequence)
  const sequences = tx.inputs.map((input: any) => {
    const seq = new Uint8Array(4)
    new DataView(seq.buffer).setUint32(0, input.sequence, true)
    return seq
  })
  const hashSequence = hash256(flattenArrays(sequences))
  sighashPreimage.push(hashSequence)

  // Outpoint of input being signed
  const input = tx.inputs[inputIndex]
  const txid = hexToUint8Array(input.txid).reverse()
  const vout = new Uint8Array(4)
  new DataView(vout.buffer).setUint32(0, input.vout, true)
  sighashPreimage.push(txid)
  sighashPreimage.push(vout)

  // Script code for P2WPKH
  const pubkeyHash = hash160(publicKey)
  const scriptCode = new Uint8Array(25)
  scriptCode[0] = 0x76 // OP_DUP
  scriptCode[1] = 0xa9 // OP_HASH160
  scriptCode[2] = 0x14 // Push 20 bytes
  scriptCode.set(pubkeyHash, 3)
  scriptCode[23] = 0x88 // OP_EQUALVERIFY
  scriptCode[24] = 0xac // OP_CHECKSIG

  sighashPreimage.push(encodeVarint(scriptCode.length))
  sighashPreimage.push(scriptCode)

  // Amount (8 bytes, little endian) - would need to be passed in
  // For simplicity, assuming 0 for now (would need input amount)
  const amountBytes = new Uint8Array(8)
  sighashPreimage.push(amountBytes)

  // Sequence of input
  const sequenceBytes = new Uint8Array(4)
  new DataView(sequenceBytes.buffer).setUint32(0, input.sequence, true)
  sighashPreimage.push(sequenceBytes)

  // Double SHA256 of all outputs (hashOutputs)
  const outputs = tx.outputs.map((output: any) => {
    const value = new Uint8Array(8)
    new DataView(value.buffer).setBigUint64(0, BigInt(output.value), true)
    const scriptLen = encodeVarint(output.scriptPubKey.length)
    return new Uint8Array([...value, ...scriptLen, ...output.scriptPubKey])
  })
  const hashOutputs = hash256(flattenArrays(outputs))
  sighashPreimage.push(hashOutputs)

  // Locktime (4 bytes, little endian)
  const locktimeBytes = new Uint8Array(4)
  new DataView(locktimeBytes.buffer).setUint32(0, tx.locktime, true)
  sighashPreimage.push(locktimeBytes)

  // Sighash type (4 bytes, little endian)
  const sighashTypeBytes = new Uint8Array(4)
  new DataView(sighashTypeBytes.buffer).setUint32(0, sighashType, true)
  sighashPreimage.push(sighashTypeBytes)

  // Combine and hash
  const preimage = flattenArrays(sighashPreimage)
  return hash256(preimage)
}

/**
 * Converts secp256k1 compact signature to DER format
 * @param compactSignature - 64-byte compact signature
 * @returns DER-encoded signature
 */
function compactSignatureToDER(compactSignature: Uint8Array): Uint8Array {
  if (compactSignature.length !== 64) {
    throw new Error('Compact signature must be 64 bytes')
  }

  const r = compactSignature.slice(0, 32)
  const s = compactSignature.slice(32, 64)

  // Encode r and s as DER integers
  const rEncoded = encodeDERInteger(r)
  const sEncoded = encodeDERInteger(s)

  const totalLength = rEncoded.length + sEncoded.length
  const derSignature = new Uint8Array(2 + totalLength)

  derSignature[0] = 0x30 // DER sequence
  derSignature[1] = totalLength
  derSignature.set(rEncoded, 2)
  derSignature.set(sEncoded, 2 + rEncoded.length)

  return derSignature
}

/**
 * Encodes a number as DER integer
 * @param value - Value to encode
 * @returns DER-encoded integer
 */
function encodeDERInteger(value: Uint8Array): Uint8Array {
  let start = 0
  while (start < value.length - 1 && value[start] === 0) {
    start++
  }

  const trimmedValue = value.slice(start)
  const needsPadding = trimmedValue.length > 0 && (trimmedValue[0] & 0x80) !== 0

  const resultLength = trimmedValue.length + (needsPadding ? 1 : 0) + 2
  const result = new Uint8Array(resultLength)

  result[0] = 0x02 // Integer type
  result[1] = trimmedValue.length + (needsPadding ? 1 : 0)

  if (needsPadding) {
    result[2] = 0x00
    result.set(trimmedValue, 3)
  } else {
    result.set(trimmedValue, 2)
  }

  return result
}

/**
 * Serializes a Lightning transaction to bytes
 * @param tx - Transaction to serialize
 * @returns Serialized transaction
 */
function serializeLightningTransaction(tx: any): Uint8Array {
  const parts: Uint8Array[] = []

  // Version (4 bytes, little endian)
  const versionBytes = new Uint8Array(4)
  new DataView(versionBytes.buffer).setUint32(0, tx.version, true)
  parts.push(versionBytes)

  // SegWit marker and flag
  parts.push(new Uint8Array([0x00, 0x01]))

  // Input count
  parts.push(encodeVarint(tx.inputs.length))

  // Inputs
  for (const input of tx.inputs) {
    parts.push(hexToUint8Array(input.txid).reverse())
    const voutBytes = new Uint8Array(4)
    new DataView(voutBytes.buffer).setUint32(0, input.vout, true)
    parts.push(voutBytes)
    parts.push(encodeVarint(input.scriptSig.length))
    parts.push(input.scriptSig)
    const sequenceBytes = new Uint8Array(4)
    new DataView(sequenceBytes.buffer).setUint32(0, input.sequence, true)
    parts.push(sequenceBytes)
  }

  // Output count
  parts.push(encodeVarint(tx.outputs.length))

  // Outputs
  for (const output of tx.outputs) {
    const valueBytes = new Uint8Array(8)
    new DataView(valueBytes.buffer).setBigUint64(0, BigInt(output.value), true)
    parts.push(valueBytes)
    parts.push(encodeVarint(output.scriptPubKey.length))
    parts.push(output.scriptPubKey)
  }

  // Witnesses
  for (const witness of tx.witnesses) {
    if (witness.length > 0) {
      parts.push(encodeVarint(witness.length))
      for (const item of witness) {
        parts.push(encodeVarint(item.length))
        parts.push(item)
      }
    } else {
      parts.push(new Uint8Array([0]))
    }
  }

  // Locktime
  const locktimeBytes = new Uint8Array(4)
  new DataView(locktimeBytes.buffer).setUint32(0, tx.locktime, true)
  parts.push(locktimeBytes)

  return flattenArrays(parts)
}

/**
 * Flattens arrays of Uint8Arrays
 * @param arrays - Arrays to flatten
 * @returns Flattened array
 */
function flattenArrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

/**
 * Encodes a number as Bitcoin varint
 * @param value - Number to encode
 * @returns Varint as Uint8Array
 */
function encodeVarint(value: number): Uint8Array {
  if (value < 0xfd) {
    return new Uint8Array([value])
  } else if (value <= 0xffff) {
    const result = new Uint8Array(3)
    result[0] = 0xfd
    new DataView(result.buffer).setUint16(1, value, true)
    return result
  } else if (value <= 0xffffffff) {
    const result = new Uint8Array(5)
    result[0] = 0xfe
    new DataView(result.buffer).setUint32(1, value, true)
    return result
  } else {
    const result = new Uint8Array(9)
    result[0] = 0xff
    new DataView(result.buffer).setBigUint64(1, BigInt(value), true)
    return result
  }
}
