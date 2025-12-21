import secp256k1 from 'secp256k1'
import { hash256, hash160, uint8ArrayToHex } from '@/core/lib/crypto'
import { hexToUint8Array } from '../utils/utils'
import { createPublicKey, deriveChildKey, splitMasterKey } from '@/core/lib/key'
import { Utxo } from '@/core/models/transaction'
import { fromBech32, deriveAddress } from '../address'
import { connect, callElectrumMethod } from '../electrum'
import { getAllBech32Prefixes } from '@/config/network'
import {
  BuildTransactionParams,
  BuildTransactionResult,
  SignTransactionParams,
  SignTransactionResult,
  SendTransactionParams,
  SendTransactionResult,
} from './types'

/**
 * Sighash type constants
 */
const SIGHASH_ALL = 0x01
const SIGHASH_NONE = 0x02
const SIGHASH_SINGLE = 0x03
const SIGHASH_ANYONECANPAY = 0x80

/**
 * Simple Bitcoin transaction structure
 */
interface SimpleTransaction {
  version: number
  inputs: {
    txid: string
    vout: number
    scriptSig: Uint8Array
    sequence: number
    witness?: Uint8Array[]
  }[]
  outputs: {
    value: number
    scriptPubKey: Uint8Array
  }[]
  locktime: number
  witnesses: Uint8Array[][]
}

/**
 * Builds a Bitcoin transaction with the specified parameters
 * @param params - Transaction building parameters
 * @returns Transaction building result
 */
async function buildTransaction({
  recipientAddress,
  amount,
  feeRate,
  utxos,
  changeAddress,
  coinSelectionAlgorithm = CoinSelectionAlgorithm.BRANCH_AND_BOUND,
  avoidAddressReuse = false,
  consolidateSmallUtxos = false,
  enableRBF = false,
}: BuildTransactionParams): Promise<BuildTransactionResult> {
  try {
    // Validate input parameters

    if (amount <= 0) {
      throw new Error(`Amount must be positive, got: ${amount}`)
    }
    if (!Number.isInteger(feeRate) && feeRate !== Math.floor(feeRate)) {
      throw new Error(`Fee rate must be an integer, got: ${feeRate}`)
    }
    if (feeRate <= 0) {
      throw new Error(`Fee rate must be positive, got: ${feeRate}`)
    }
    // Filter UTXOs with sufficient confirmations
    const confirmedUtxos = utxos.filter(utxo => utxo.confirmations >= 2)
    console.log(`Filtered to ${confirmedUtxos.length} confirmed UTXOs`)

    if (confirmedUtxos.length === 0) {
      throw new Error('No confirmed UTXOs available')
    }

    // Select UTXOs using advanced coin selection algorithm
    console.log(`Using ${coinSelectionAlgorithm} coin selection algorithm`)
    const coinSelectionResult = selectCoinsAdvanced(confirmedUtxos, {
      targetAmount: amount,
      feeRate,
      algorithm: coinSelectionAlgorithm,
      avoidAddressReuse,
      consolidateSmallUtxos,
    })

    const selectedUtxos = coinSelectionResult.selectedUtxos
    console.log(
      `Selected ${selectedUtxos.length} UTXOs with efficiency: ${coinSelectionResult.efficiency.toFixed(3)}`,
    )
    console.log(
      `Estimated fee: ${coinSelectionResult.fee} sat, change: ${coinSelectionResult.changeAmount} sat`,
    )

    const totalInputAmountSat = coinSelectionResult.totalAmount

    if (totalInputAmountSat < amount + coinSelectionResult.fee) {
      throw new Error('Insufficient funds (including fees)')
    }

    // Use the calculated fee and change from coin selection
    const estimatedFeeSat = coinSelectionResult.fee
    let changeAmountSat = coinSelectionResult.changeAmount

    console.log(
      `Selected ${selectedUtxos.length} UTXOs with efficiency: ${coinSelectionResult.efficiency.toFixed(3)}`,
    )
    console.log(
      `Estimated fee: ${coinSelectionResult.fee} sat, change: ${coinSelectionResult.changeAmount} sat`,
    )

    if (changeAmountSat < 0) {
      throw new Error(
        `Insufficient funds after fee calculation. Needed: ${amount + estimatedFeeSat} sat, Available: ${totalInputAmountSat} sat`,
      )
    }

    // Create transaction
    let tx: SimpleTransaction
    if (enableRBF) {
      tx = createRBFTransaction([], [], 0)
    } else {
      tx = {
        version: 2,
        inputs: [],
        outputs: [],
        locktime: 0,
        witnesses: [],
      }
    }

    // Add inputs
    const inputs = []
    console.log(`Building transaction with ${selectedUtxos.length} selected UTXOs`)
    for (const utxo of selectedUtxos) {
      console.log(`Adding input: ${utxo.txid}:${utxo.vout} with amount ${utxo.amount} BTC`)
      tx.inputs.push({
        txid: utxo.txid,
        vout: utxo.vout,
        scriptSig: new Uint8Array(0), // Empty for SegWit
        sequence: enableRBF ? 0xfffffffe - 1 : 0xffffffff, // Enable RBF by setting sequence < 0xFFFFFFFF - 1
      })

      tx.witnesses.push([]) // Empty witness to be filled during signing

      inputs.push({
        txid: utxo.txid,
        vout: utxo.vout,
        amount: Math.round(utxo.amount * 100000000), // Convert BTC to satoshis
        address: utxo.address,
      })
    }
    console.log(`Transaction now has ${tx.inputs.length} inputs`)

    // Add outputs
    const outputs = []

    // Recipient output - include dust change if any
    let recipientAmount = amount
    if (changeAmountSat > 0 && changeAmountSat <= 546) {
      console.log(`Adding dust change ${changeAmountSat} sat to recipient`)
      recipientAmount += changeAmountSat
      changeAmountSat = 0
    }

    console.log(`Final recipient amount: ${recipientAmount} sat (${recipientAmount / 1e8} BTC)`)
    console.log(`Final change amount: ${changeAmountSat} sat (${changeAmountSat / 1e8} BTC)`)

    tx.outputs.push({
      value: recipientAmount,
      scriptPubKey: createScriptPubKey(recipientAddress),
    })

    // Validate that recipient amount is not dust
    if (recipientAmount <= 546) {
      throw new Error(
        `Recipient amount ${recipientAmount} satoshis is below dust threshold (546 satoshis)`,
      )
    }

    outputs.push({
      address: recipientAddress,
      amount: recipientAmount / 1e8, // Convert back to BTC for display
    })

    // Add change output if change amount is significant
    if (changeAmountSat > 546) {
      // 546 sat = dust threshold
      tx.outputs.push({
        value: changeAmountSat,
        scriptPubKey: createScriptPubKey(changeAddress),
      })
      outputs.push({
        address: changeAddress,
        amount: changeAmountSat / 1e8, // Convert back to BTC for display
      })
    }

    return {
      transaction: tx,
      inputs,
      outputs,
      fee: estimatedFeeSat,
      changeAmount: changeAmountSat > 546 ? changeAmountSat / 1e8 : 0,
    }
  } catch (error) {
    throw new Error(`Failed to build transaction: ${(error as Error).message}`)
  }
}

/**
 * Converts secp256k1 compact signature to DER format
 * @param compactSignature - 64-byte compact signature (r + s)
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

  // Calculate total length
  const totalLength = rEncoded.length + sEncoded.length
  const derSignature = new Uint8Array(2 + totalLength)

  // DER sequence header
  derSignature[0] = 0x30 // DER sequence
  derSignature[1] = totalLength

  // Add encoded r and s
  derSignature.set(rEncoded, 2)
  derSignature.set(sEncoded, 2 + rEncoded.length)

  return derSignature
}

/**
 * Creates a scriptPubKey for a Bitcoin address
 * @param address - Bitcoin address
 * @returns ScriptPubKey as Uint8Array
 */
function createScriptPubKey(address: string): Uint8Array {
  try {
    // For Bech32 addresses (P2WPKH)
    const bech32Prefixes = getAllBech32Prefixes().map(prefix => `${prefix}1`)
    if (bech32Prefixes.some(prefix => address.startsWith(prefix))) {
      const { version, data } = fromBech32(address)

      if (version !== 0) {
        throw new Error('Only witness version 0 is supported')
      }

      // P2WPKH script: OP_0 <20-byte-hash>
      const script = new Uint8Array(22)
      script[0] = 0x00 // OP_0
      script[1] = 0x14 // Push 20 bytes
      script.set(data, 2)
      return script
    }

    throw new Error('Unsupported address format')
  } catch (error) {
    throw new Error(`Failed to create scriptPubKey: ${(error as Error).message}`)
  }
}

/**
 * Creates a SegWit signature for a transaction input
 * @param tx - Transaction to sign
 * @param inputIndex - Index of the input to sign
 * @param privateKey - Private key for signing
 * @param amount - Amount of the input
 * @param sighashType - Sighash type (default SIGHASH_ALL)
 * @returns Signature as Uint8Array
 */
function createSegWitSignature(
  tx: SimpleTransaction,
  inputIndex: number,
  privateKey: Uint8Array,
  amount: number,
  sighashType: number = SIGHASH_ALL,
): Uint8Array {
  console.log(`createSegWitSignature called with amount: ${amount} (type: ${typeof amount})`)

  // Additional validation before calling createSighash
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error(`Amount must be a valid number, got: ${amount} (type: ${typeof amount})`)
  }

  if (!Number.isInteger(amount)) {
    // Check if it's a very small decimal that should be zero
    if (Math.abs(amount) < 1e-8) {
      throw new Error(`Amount is too small (close to zero), got: ${amount}`)
    }
    // Check if it's a decimal that should be an integer
    if (amount % 1 !== 0) {
      throw new Error(
        `Amount must be an integer for signature creation, got: ${amount} (decimal part: ${amount % 1})`,
      )
    }
  }

  if (amount <= 0) {
    throw new Error(`Amount must be positive for signature creation, got: ${amount}`)
  }

  // Check for unreasonably large amounts
  if (amount > 21000000 * 100000000) {
    throw new Error(`Amount exceeds maximum possible Bitcoin amount, got: ${amount}`)
  }

  const publicKey = createPublicKey(privateKey)

  // Create sighash for SegWit
  const sighash = createSighash(tx, inputIndex, amount, publicKey, sighashType)

  // Sign the sighash using ECDSA
  const { signature } = secp256k1.ecdsaSign(sighash, privateKey)

  // Convert signature to DER format
  const derSignature = compactSignatureToDER(signature)

  // Add sighash type
  const signatureWithType = new Uint8Array(derSignature.length + 1)
  signatureWithType.set(derSignature, 0)
  signatureWithType[derSignature.length] = sighashType

  return signatureWithType
}

/**
 * Verifies a SegWit signature for a transaction input
 * @param tx - Transaction to verify
 * @param inputIndex - Index of the input to verify
 * @param publicKey - Public key for verification
 * @param signature - Signature to verify (with sighash type)
 * @param amount - Amount of the input
 * @returns True if signature is valid
 */
function verifySegWitSignature(
  tx: SimpleTransaction,
  inputIndex: number,
  publicKey: Uint8Array,
  signature: Uint8Array,
  amount: number,
): boolean {
  try {
    // Extract sighash type from signature
    const sighashType = signature[signature.length - 1]
    const derSignature = signature.slice(0, -1)

    // Convert DER signature to compact format for secp256k1
    const compactSignature = derSignatureToCompact(derSignature)

    // Create sighash for verification
    const sighash = createSighash(tx, inputIndex, amount, publicKey, sighashType)

    // Verify the signature
    return secp256k1.ecdsaVerify(compactSignature, sighash, publicKey)
  } catch (error) {
    console.error('Signature verification failed:', error)
    return false
  }
}

/**
 * Converts DER signature to compact format (64 bytes: r + s)
 * @param derSignature - DER encoded signature
 * @returns Compact signature as Uint8Array
 */
function derSignatureToCompact(derSignature: Uint8Array): Uint8Array {
  // DER format: 0x30 [total_len] 0x02 [r_len] [r] 0x02 [s_len] [s]
  if (derSignature.length < 8 || derSignature[0] !== 0x30) {
    throw new Error('Invalid DER signature format')
  }

  let pos = 2 // Skip sequence header

  // Parse r
  if (derSignature[pos] !== 0x02) {
    throw new Error('Invalid r component in DER signature')
  }
  const rLen = derSignature[pos + 1]
  pos += 2
  const r = derSignature.slice(pos, pos + rLen)
  pos += rLen

  // Parse s
  if (derSignature[pos] !== 0x02) {
    throw new Error('Invalid s component in DER signature')
  }
  const sLen = derSignature[pos + 1]
  pos += 2
  const s = derSignature.slice(pos, pos + sLen)

  // Convert to 32-byte components (pad with zeros if needed)
  const r32 = new Uint8Array(32)
  const s32 = new Uint8Array(32)

  // Copy r (right-aligned)
  r32.set(r.slice(-32), 32 - Math.min(32, r.length))

  // Copy s (right-aligned)
  s32.set(s.slice(-32), 32 - Math.min(32, s.length))

  return new Uint8Array([...r32, ...s32])
}

/**
 * Creates a transaction with RBF (Replace-By-Fee) enabled
 * @param inputs - Transaction inputs
 * @param outputs - Transaction outputs
 * @param locktime - Locktime (default 0)
 * @returns RBF-enabled transaction
 */
function createRBFTransaction(
  inputs: SimpleTransaction['inputs'],
  outputs: SimpleTransaction['outputs'],
  locktime: number = 0,
): SimpleTransaction {
  // For RBF, set sequence numbers to less than 0xFFFFFFFF - 1
  // This allows the transaction to be replaced
  const rbfInputs = inputs.map(input => ({
    ...input,
    sequence: input.sequence < 0xfffffffe ? input.sequence : 0xfffffffe - 1,
  }))

  return {
    version: 2, // Version 2 for RBF support
    inputs: rbfInputs,
    outputs,
    locktime,
    witnesses: [], // Empty witnesses array
  }
}

/**
 * Checks if a transaction has RBF enabled
 * @param tx - Transaction to check
 * @returns True if RBF is enabled
 */
function isRBFEnabled(tx: SimpleTransaction): boolean {
  // RBF is enabled if any input has sequence < 0xFFFFFFFF - 1
  return tx.inputs.some(input => input.sequence < 0xfffffffe)
}

/**
 * Checks if a transaction can be RBF'd (fee bumped)
 * @param txHex - Transaction hex string
 * @returns True if the transaction can be replaced
 */
function canBumpFee(txHex: string): boolean {
  try {
    const tx = parseUnsignedTransaction(txHex)
    return isRBFEnabled(tx)
  } catch (error) {
    console.error('Error checking RBF capability:', error)
    return false
  }
}

/**
 * Creates a replacement transaction with higher fees (RBF)
 * Note: This is a simplified implementation. In practice, the original transaction
 * intent (recipients and amounts) should be stored when creating the transaction.
 * @param params - RBF fee bumping parameters
 * @returns Replacement transaction with higher fees
 */
async function bumpRBFFee(params: {
  originalTxHex: string
  newFeeRate: number
  utxos: Utxo[]
  changeAddress: string
  recipientAddress: string // Required: the original recipient
  amount: number // Required: the original amount
}): Promise<{
  replacementTransaction: any
  inputs: any
  outputs: any
  newFee: number
  changeAmount: number
  isRBFEnabled: boolean
}> {
  try {
    // Parse the original transaction
    const originalTx = parseUnsignedTransaction(params.originalTxHex)

    // Verify RBF is enabled
    if (!isRBFEnabled(originalTx)) {
      throw new Error('Transaction does not have RBF enabled')
    }

    // Build a replacement transaction with the same recipient and amount but higher fees
    const result = await buildTransaction({
      recipientAddress: params.recipientAddress,
      amount: params.amount,
      feeRate: params.newFeeRate,
      utxos: params.utxos,
      changeAddress: params.changeAddress,
      enableRBF: true,
    })

    return {
      replacementTransaction: result.transaction,
      inputs: result.inputs,
      outputs: result.outputs,
      newFee: result.fee,
      changeAmount: result.changeAmount,
      isRBFEnabled: true,
    }
  } catch (error) {
    console.error('Error bumping RBF fee:', error)
    throw error
  }
}

/**
 * Calculates the fee of a transaction
 * @param tx - Parsed transaction
 * @returns Fee in satoshis
 */
function calculateTransactionFee(tx: SimpleTransaction): number {
  // Simplified: assume inputs have value, but we don't have input values here
  // In practice, this would need input values from UTXOs
  // For now, return 0 as placeholder
  return 0
}

/**
 * Calculates the effective fee rate for a transaction considering its children (CPFP)
 * @param parentFee - Fee of parent transaction
 * @param parentSize - Size of parent transaction
 * @param childFees - Fees of child transactions
 * @param childSizes - Sizes of child transactions
 * @returns Effective fee rate in sat/vB
 */
function calculateEffectiveFeeRate(
  parentFee: number,
  parentSize: number,
  childFees: number[] = [],
  childSizes: number[] = [],
): number {
  let totalFee = parentFee
  let totalSize = parentSize

  for (let i = 0; i < childFees.length; i++) {
    totalFee += childFees[i]
    totalSize += childSizes[i]
  }

  if (totalSize === 0) return 0
  return totalFee / totalSize
}

/**
 * Checks if CPFP can be used for a transaction (has unspent outputs)
 * @param txHex - Transaction hex
 * @param utxos - Available UTXOs
 * @returns True if CPFP can be used
 */
function canUseCPFP(txHex: string, utxos: Utxo[]): boolean {
  try {
    const tx = parseUnsignedTransaction(txHex)
    // Check if any output can be spent (simplified: assume all outputs are spendable if UTXOs available)
    return tx.outputs.length > 0 && utxos.length > 0
  } catch (error) {
    console.error('Error checking CPFP capability:', error)
    return false
  }
}

/**
 * Suggests a CPFP transaction to accelerate a parent transaction
 * @param params - CPFP suggestion parameters
 * @returns Suggested CPFP transaction details
 */
async function suggestCPFP(params: {
  parentTxHex: string
  targetFeeRate: number
  utxos: Utxo[]
  changeAddress: string
  recipientAddress?: string // Optional: where to send the CPFP output, defaults to change
}): Promise<{
  cpfpTransaction: any
  inputs: any
  outputs: any
  cpfpFee: number
  effectiveFeeRate: number
}> {
  try {
    const parentTx = parseUnsignedTransaction(params.parentTxHex)
    const parentFee = calculateTransactionFee(parentTx)
    const parentSize = estimateTransactionSize(parentTx.inputs.length, parentTx.outputs.length)
    const currentEffectiveRate = parentFee / parentSize

    if (params.targetFeeRate <= currentEffectiveRate) {
      throw new Error('Target fee rate must be higher than current effective rate')
    }

    // Calculate required additional fee
    const requiredTotalFee = params.targetFeeRate * parentSize
    const additionalFee = requiredTotalFee - parentFee

    // Build CPFP transaction spending from parent output
    // Simplified: assume first output is spendable
    const cpfpUtxo: Utxo = {
      txid: parentTx.inputs[0]?.txid || '00'.repeat(32), // Already a hex string
      vout: 0,
      address: '', // Will be derived from scriptPubKey
      scriptPubKey: {
        asm: '',
        hex: uint8ArrayToHex(parentTx.outputs[0]?.scriptPubKey || new Uint8Array()),
        reqSigs: 1,
        type: 'pubkeyhash',
        address: '',
      },
      amount: parentTx.outputs[0]?.value || 0,
      confirmations: 0, // Unconfirmed
      blocktime: 0,
      isSpent: false,
    }

    const cpfpAmount = Math.max(546, additionalFee + 1000) // Minimum output + fee buffer

    const result = await buildTransaction({
      recipientAddress: params.recipientAddress || params.changeAddress,
      amount: cpfpAmount,
      feeRate: params.targetFeeRate,
      utxos: [cpfpUtxo],
      changeAddress: params.changeAddress,
      enableRBF: true,
    })

    const newEffectiveRate = params.targetFeeRate // Approximation: effective rate equals target when CPFP is used

    return {
      cpfpTransaction: result.transaction,
      inputs: result.inputs,
      outputs: result.outputs,
      cpfpFee: result.fee,
      effectiveFeeRate: newEffectiveRate,
    }
  } catch (error) {
    console.error('Error suggesting CPFP:', error)
    throw error
  }
}

/**
 * Builds multiple transactions in a batch
 * @param batchParams - Array of transaction parameters
 * @returns Array of built transactions
 */
async function buildBatchTransactions(
  batchParams: {
    recipientAddress: string
    amount: number
    feeRate: number
    utxos: Utxo[]
    changeAddress: string
    coinSelectionAlgorithm?: CoinSelectionAlgorithm
    avoidAddressReuse?: boolean
    consolidateSmallUtxos?: boolean
    enableRBF?: boolean
  }[],
): Promise<{
  transactions: any[]
  totalFee: number
  totalSize: number
}> {
  const transactions: any[] = []
  let totalFee = 0
  let totalSize = 0

  for (const params of batchParams) {
    const result = await buildTransaction(params)
    transactions.push(result.transaction)
    totalFee += result.fee
    totalSize += estimateTransactionSize(result.inputs.length, result.outputs.length)
  }

  return {
    transactions,
    totalFee,
    totalSize,
  }
}

/**
 * Sends multiple transactions in a batch
 * @param batchParams - Array of send parameters
 * @returns Array of send results
 */
async function sendBatchTransactions(
  batchParams: {
    transaction: any
    connection: any
  }[],
): Promise<{
  results: any[]
  totalFee: number
}> {
  const results: any[] = []
  let totalFee = 0

  for (const params of batchParams) {
    const result = await sendTransaction({
      signedTransaction: params.transaction,
      txHex: '', // TODO: generate txHex from transaction
    })
    results.push(result)
    // Note: fee calculation would need to be added to sendTransaction result
  }

  return {
    results,
    totalFee,
  }
}

/**
 * Estimates transaction fee based on size and fee rate
 * @param txSize - Transaction size in bytes
 * @param feeRate - Fee rate in sat/vB
 * @returns Estimated fee in satoshis
 */
function estimateTransactionFee(txSize: number, feeRate: number): number {
  return Math.ceil(txSize * feeRate)
}

/**
 * Estimates optimal fee rate for target confirmation time
 * @param targetBlocks - Target blocks for confirmation (e.g., 1 for fast, 6 for normal)
 * @param currentFeeRates - Current fee rates from mempool
 * @returns Recommended fee rate in sat/vB
 */
function estimateOptimalFeeRate(
  targetBlocks: number,
  currentFeeRates: { slow: number; normal: number; fast: number; urgent: number },
): number {
  // Simple estimation based on target blocks
  if (targetBlocks <= 1) return currentFeeRates.urgent
  if (targetBlocks <= 3) return currentFeeRates.fast
  if (targetBlocks <= 6) return currentFeeRates.normal
  return currentFeeRates.slow
}

function parseUnsignedTransaction(txHex: string): SimpleTransaction {
  const decoded = decodeTransaction(txHex)
  return {
    version: decoded.version,
    inputs: decoded.inputs.map(input => ({
      txid: input.txid,
      vout: input.vout,
      scriptSig: hexToUint8Array(input.scriptSig),
      sequence: input.sequence,
    })),
    outputs: decoded.outputs.map(output => ({
      value: output.value,
      scriptPubKey: hexToUint8Array(output.scriptPubKey),
    })),
    locktime: decoded.locktime,
    witnesses: decoded.witnesses,
  }
}

/**
 * Creates a sighash for SegWit transaction
 * @param tx - Transaction
 * @param inputIndex - Input index
 * @param amount - Input amount
 * @param publicKey - Public key for the input being signed
 * @param sighashType - Sighash type (default SIGHASH_ALL)
 * @returns Sighash as Uint8Array
 */
function createSighash(
  tx: SimpleTransaction,
  inputIndex: number,
  amount: number,
  publicKey: Uint8Array,
  sighashType: number = SIGHASH_ALL,
): Uint8Array {
  // Validate amount is an integer and within valid range
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error(
      `Amount must be a valid number for sighash calculation, got: ${amount} (type: ${typeof amount})`,
    )
  }

  if (!Number.isInteger(amount)) {
    throw new Error(`Amount must be an integer (satoshis) for sighash calculation, got: ${amount}`)
  }

  if (amount <= 0) {
    throw new Error(`Amount must be positive for sighash calculation, got: ${amount}`)
  }

  // Additional validation: amount should be within reasonable Bitcoin limits
  if (amount > 21000000 * 100000000) {
    // More than total Bitcoin supply in satoshis
    throw new Error(`Amount exceeds maximum possible Bitcoin amount, got: ${amount}`)
  }

  // Extract base sighash type (remove ANYONECANPAY flag)
  const baseSighashType = sighashType & 0x1f
  const anyoneCanPay = (sighashType & SIGHASH_ANYONECANPAY) !== 0

  const sighashPreimage: Uint8Array[] = []

  // Version (4 bytes, little endian)
  const versionBytes = new Uint8Array(4)
  new DataView(versionBytes.buffer).setUint32(0, tx.version, true)
  sighashPreimage.push(versionBytes)

  // Hash of all inputs (hashPrevouts)
  let hashPrevouts: Uint8Array
  if (anyoneCanPay) {
    // For ANYONECANPAY, hashPrevouts is all zeros
    hashPrevouts = new Uint8Array(32)
  } else {
    const prevouts = tx.inputs.map(input => {
      const txid = hexToUint8Array(input.txid).reverse()
      const vout = new Uint8Array(4)
      new DataView(vout.buffer).setUint32(0, input.vout, true)
      return new Uint8Array([...txid, ...vout])
    })
    hashPrevouts = hash256(flattenArrays(prevouts))
  }
  sighashPreimage.push(hashPrevouts)

  // Hash of all sequences (hashSequence)
  let hashSequence: Uint8Array
  if (anyoneCanPay || baseSighashType === SIGHASH_SINGLE || baseSighashType === SIGHASH_NONE) {
    // For ANYONECANPAY, SINGLE, or NONE, hashSequence is all zeros
    hashSequence = new Uint8Array(32)
  } else {
    const sequences = tx.inputs.map(input => {
      const seq = new Uint8Array(4)
      new DataView(seq.buffer).setUint32(0, input.sequence, true)
      return seq
    })
    hashSequence = hash256(flattenArrays(sequences))
  }
  sighashPreimage.push(hashSequence)

  // Outpoint of the input being signed
  const input = tx.inputs[inputIndex]
  const txid = hexToUint8Array(input.txid).reverse()
  const vout = new Uint8Array(4)
  new DataView(vout.buffer).setUint32(0, input.vout, true)
  sighashPreimage.push(txid)
  sighashPreimage.push(vout)

  // Script code for P2WPKH (BIP 143)
  // scriptCode = OP_DUP OP_HASH160 <20-byte-pubkey-hash> OP_EQUALVERIFY OP_CHECKSIG
  const pubkeyHash = hash160(publicKey) // RIPEMD-160(SHA-256(pubkey))
  const scriptCode = new Uint8Array(25)
  scriptCode[0] = 0x76 // OP_DUP
  scriptCode[1] = 0xa9 // OP_HASH160
  scriptCode[2] = 0x14 // Push 20 bytes
  scriptCode.set(pubkeyHash, 3) // 20-byte pubkey hash
  scriptCode[23] = 0x88 // OP_EQUALVERIFY
  scriptCode[24] = 0xac // OP_CHECKSIG

  sighashPreimage.push(encodeVarint(scriptCode.length))
  sighashPreimage.push(scriptCode)

  // Amount (8 bytes, little endian)
  const amountBytes = new Uint8Array(8)
  new DataView(amountBytes.buffer).setBigUint64(0, BigInt(amount), true)
  sighashPreimage.push(amountBytes)

  // Sequence of the input
  const sequenceBytes = new Uint8Array(4)
  new DataView(sequenceBytes.buffer).setUint32(0, input.sequence, true)
  sighashPreimage.push(sequenceBytes)

  // Hash of all outputs (hashOutputs)
  let hashOutputs: Uint8Array
  if (baseSighashType === SIGHASH_NONE) {
    // For SIGHASH_NONE, hashOutputs is all zeros
    hashOutputs = new Uint8Array(32)
  } else if (baseSighashType === SIGHASH_SINGLE) {
    // For SIGHASH_SINGLE, hash only the corresponding output
    if (inputIndex >= tx.outputs.length) {
      // If no corresponding output, hashOutputs is all zeros
      hashOutputs = new Uint8Array(32)
    } else {
      const output = tx.outputs[inputIndex]
      const value = new Uint8Array(8)
      new DataView(value.buffer).setBigUint64(0, BigInt(output.value), true)
      const scriptLen = encodeVarint(output.scriptPubKey.length)
      const outputBytes = new Uint8Array([...value, ...scriptLen, ...output.scriptPubKey])
      hashOutputs = hash256(outputBytes)
    }
  } else {
    // For SIGHASH_ALL (and ANYONECANPAY variants), hash all outputs
    const outputs = tx.outputs.map(output => {
      const value = new Uint8Array(8)
      new DataView(value.buffer).setBigUint64(0, BigInt(output.value), true)
      const scriptLen = encodeVarint(output.scriptPubKey.length)
      return new Uint8Array([...value, ...scriptLen, ...output.scriptPubKey])
    })
    hashOutputs = hash256(flattenArrays(outputs))
  }
  sighashPreimage.push(hashOutputs)

  // Locktime (4 bytes, little endian)
  const locktimeBytes = new Uint8Array(4)
  new DataView(locktimeBytes.buffer).setUint32(0, tx.locktime, true)
  sighashPreimage.push(locktimeBytes)

  // Sighash type (4 bytes, little endian)
  const sighashTypeBytes = new Uint8Array(4)
  new DataView(sighashTypeBytes.buffer).setUint32(0, sighashType, true)
  sighashPreimage.push(sighashTypeBytes)

  // Combine all parts and hash
  const preimage = flattenArrays(sighashPreimage)
  return hash256(preimage)
}

/**
 * Decodes a Bitcoin transaction from hex and validates its structure
 * @param txHex - Transaction hex string
 * @returns Decoded transaction information
 */
function decodeTransaction(txHex: string): {
  version: number
  inputs: {
    txid: string
    vout: number
    scriptSig: string
    sequence: number
  }[]
  outputs: {
    value: number
    scriptPubKey: string
  }[]
  locktime: number
  witnesses: Uint8Array[][]
  txid: string
  weight: number
  vsize: number
} {
  try {
    console.log('Decoding transaction for validation...')
    console.log('Transaction hex length:', txHex.length)

    if (!txHex || txHex.length === 0) {
      throw new Error('Transaction hex is empty')
    }

    // Convert hex to bytes
    const txBytes = hexToUint8Array(txHex)
    console.log('Transaction bytes length:', txBytes.length)

    let offset = 0

    // Version (4 bytes, little endian)
    if (offset + 4 > txBytes.length) {
      throw new Error('Transaction too short for version')
    }
    const version = new DataView(txBytes.buffer, offset, 4).getUint32(0, true)
    offset += 4
    console.log('Version:', version)

    // Check for SegWit marker and flag (0x00 0x01)
    if (offset + 2 <= txBytes.length && txBytes[offset] === 0x00 && txBytes[offset + 1] === 0x01) {
      offset += 2 // Skip marker and flag
      console.log('Detected SegWit transaction')
    }

    // Input count (varint)
    const inputCountResult = decodeVarint(txBytes, offset)
    const inputCount = inputCountResult.value
    offset = inputCountResult.newOffset
    console.log('Input count:', inputCount)

    if (inputCount === 0) {
      throw new Error('Transaction has no inputs')
    }

    // Parse inputs
    const inputs = []
    for (let i = 0; i < inputCount; i++) {
      if (offset + 32 > txBytes.length) {
        throw new Error(`Input ${i}: Transaction too short for txid`)
      }
      const txid = uint8ArrayToHex(txBytes.slice(offset, offset + 32).reverse())
      offset += 32

      if (offset + 4 > txBytes.length) {
        throw new Error(`Input ${i}: Transaction too short for vout`)
      }
      const vout = new DataView(txBytes.buffer, offset, 4).getUint32(0, true)
      offset += 4

      // ScriptSig length (varint)
      const scriptSigLenResult = decodeVarint(txBytes, offset)
      const scriptSigLen = scriptSigLenResult.value
      offset = scriptSigLenResult.newOffset

      if (offset + scriptSigLen > txBytes.length) {
        throw new Error(`Input ${i}: Transaction too short for scriptSig`)
      }
      const scriptSig = uint8ArrayToHex(txBytes.slice(offset, offset + scriptSigLen))
      offset += scriptSigLen

      if (offset + 4 > txBytes.length) {
        throw new Error(`Input ${i}: Transaction too short for sequence`)
      }
      const sequence = new DataView(txBytes.buffer, offset, 4).getUint32(0, true)
      offset += 4

      inputs.push({ txid, vout, scriptSig, sequence })
      console.log(`Input ${i}: ${txid}:${vout}, scriptSig: ${scriptSig.length} bytes`)
    }

    // Output count (varint)
    const outputCountResult = decodeVarint(txBytes, offset)
    const outputCount = outputCountResult.value
    offset = outputCountResult.newOffset
    console.log('Output count:', outputCount)

    if (outputCount === 0) {
      throw new Error('Transaction has no outputs')
    }

    // Parse outputs
    const outputs = []
    for (let i = 0; i < outputCount; i++) {
      if (offset + 8 > txBytes.length) {
        throw new Error(`Output ${i}: Transaction too short for value`)
      }
      const value = Number(new DataView(txBytes.buffer, offset, 8).getBigUint64(0, true))
      offset += 8

      // ScriptPubKey length (varint)
      const scriptPubKeyLenResult = decodeVarint(txBytes, offset)
      const scriptPubKeyLen = scriptPubKeyLenResult.value
      offset = scriptPubKeyLenResult.newOffset

      if (offset + scriptPubKeyLen > txBytes.length) {
        throw new Error(`Output ${i}: Transaction too short for scriptPubKey`)
      }
      const scriptPubKey = uint8ArrayToHex(txBytes.slice(offset, offset + scriptPubKeyLen))
      offset += scriptPubKeyLen

      outputs.push({ value, scriptPubKey })
      console.log(`Output ${i}: ${value} satoshis, scriptPubKey: ${scriptPubKey.length} bytes`)
    }

    // Witnesses (for SegWit) - simplified parsing
    const witnesses = []
    for (let i = 0; i < inputCount; i++) {
      // For SegWit, we expect witness data after outputs
      // This is a simplified implementation
      witnesses.push([])
    }

    // Locktime (4 bytes, little endian)
    if (offset + 4 > txBytes.length) {
      throw new Error('Transaction too short for locktime')
    }
    const locktime = new DataView(txBytes.buffer, offset, 4).getUint32(0, true)
    offset += 4
    console.log('Locktime:', locktime)

    // Calculate txid
    const txid = uint8ArrayToHex(hash256(txBytes).reverse())

    // Calculate weight and vsize (simplified)
    const weight = txBytes.length * 4 // Simplified weight calculation
    const vsize = Math.ceil(weight / 4)

    console.log('Decoded transaction successfully')
    console.log(`TXID: ${txid}`)
    console.log(`Weight: ${weight}, vSize: ${vsize}`)

    return {
      version,
      inputs,
      outputs,
      locktime,
      witnesses,
      txid,
      weight,
      vsize,
    }
  } catch (error) {
    console.error('Failed to decode transaction:', error)
    throw new Error(`Transaction decode failed: ${(error as Error).message}`)
  }
}

/**
 * Decodes a Bitcoin varint from bytes
 * @param bytes - Byte array
 * @param offset - Current offset
 * @returns Decoded value and new offset
 */
function decodeVarint(bytes: Uint8Array, offset: number): { value: number; newOffset: number } {
  if (offset >= bytes.length) {
    throw new Error('Unexpected end of data')
  }

  const firstByte = bytes[offset]
  offset++

  if (firstByte < 0xfd) {
    return { value: firstByte, newOffset: offset }
  } else if (firstByte === 0xfd) {
    if (offset + 2 > bytes.length) {
      throw new Error('Unexpected end of data for 2-byte varint')
    }
    const value = new DataView(bytes.buffer, offset, 2).getUint16(0, true)
    return { value, newOffset: offset + 2 }
  } else if (firstByte === 0xfe) {
    if (offset + 4 > bytes.length) {
      throw new Error('Unexpected end of data for 4-byte varint')
    }
    const value = new DataView(bytes.buffer, offset, 4).getUint32(0, true)
    return { value, newOffset: offset + 4 }
  } else if (firstByte === 0xff) {
    if (offset + 8 > bytes.length) {
      throw new Error('Unexpected end of data for 8-byte varint')
    }
    const value = Number(new DataView(bytes.buffer, offset, 8).getBigUint64(0, true))
    return { value, newOffset: offset + 8 }
  }

  throw new Error('Invalid varint')
}

/**
 * Encodes a number as DER integer
 * @param value - Value to encode
 * @returns DER-encoded integer
 */
function encodeDERInteger(value: Uint8Array): Uint8Array {
  // Remove leading zeros
  let start = 0
  while (start < value.length - 1 && value[start] === 0) {
    start++
  }

  const trimmedValue = value.slice(start)

  // Check if the first byte has the high bit set (negative in two's complement)
  // If so, we need to add a leading 0x00 byte to make it positive
  const needsPadding = trimmedValue.length > 0 && (trimmedValue[0] & 0x80) !== 0

  const resultLength = trimmedValue.length + (needsPadding ? 1 : 0) + 2
  const result = new Uint8Array(resultLength)

  result[0] = 0x02 // Integer type
  result[1] = trimmedValue.length + (needsPadding ? 1 : 0) // Length

  if (needsPadding) {
    result[2] = 0x00 // Padding byte for positive numbers
    result.set(trimmedValue, 3)
  } else {
    result.set(trimmedValue, 2)
  }

  return result
}

/**
 * Encodes a number as a Bitcoin varint
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

/**
 * Estimates transaction size in vBytes (virtual bytes)
 * @param inputCount - Number of inputs
 * @param outputCount - Number of outputs
 * @returns Estimated transaction size in vBytes
 */
function estimateTransactionSize(inputCount: number, outputCount: number): number {
  // SegWit transaction size calculation
  // Non-witness data
  let nonWitnessSize = 0

  // Version (4) + locktime (4)
  nonWitnessSize += 8

  // Input count varint
  nonWitnessSize += encodeVarint(inputCount).length

  // Inputs: each input is ~41 bytes (36 outpoint + 1 script len + 4 sequence)
  nonWitnessSize += inputCount * 41

  // Output count varint
  nonWitnessSize += encodeVarint(outputCount).length

  // Outputs: each output is ~31 bytes (8 value + 1 script len + ~22 script)
  nonWitnessSize += outputCount * 31

  // Witness data (SegWit)
  let witnessSize = 0

  // For each input: witness stack items (1) + sig (73) + pubkey (33) + lengths (2)
  witnessSize += inputCount * (1 + 1 + 73 + 1 + 33)

  // Total weight = nonWitnessSize * 4 + witnessSize
  // vBytes = weight / 4
  const totalWeight = nonWitnessSize * 4 + witnessSize
  const vBytes = Math.ceil(totalWeight / 4)

  console.log(
    `Estimated tx size: ${vBytes} vBytes (${nonWitnessSize} non-witness + ${witnessSize} witness bytes)`,
  )
  return vBytes
}

/**
 * Finds the address index for a given address by scanning through possible derivation paths
 * @param accountKey - Account extended key
 * @param targetAddress - Target address to find
 * @param gapLimit - Maximum gap of unused addresses to scan (default 20)
 * @returns Object with address type and index, or null if not found
 */
async function findAddressIndex(
  accountKey: Uint8Array,
  targetAddress: string,
  gapLimit: number = 20,
): Promise<{ type: 'receiving' | 'change'; index: number } | null> {
  // Check receiving addresses (external chain, index 0)
  const receivingExtendedKey = deriveChildKey(accountKey, 0)

  for (let i = 0; i < gapLimit * 2; i++) {
    const address = deriveAddress(receivingExtendedKey, i)

    if (address === targetAddress) {
      return { type: 'receiving', index: i }
    }
  }

  // Check change addresses (internal chain, index 1)
  const changeExtendedKey = deriveChildKey(accountKey, 1)

  for (let i = 0; i < gapLimit * 2; i++) {
    const address = deriveAddress(changeExtendedKey, i)

    if (address === targetAddress) {
      return { type: 'change', index: i }
    }
  }

  return null
}

/**
 * Flattens an array of Uint8Arrays into a single Uint8Array
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
 * Coin selection algorithm options
 */
enum CoinSelectionAlgorithm {
  LARGEST_FIRST = 'largest_first',
  SMALLEST_FIRST = 'smallest_first',
  BRANCH_AND_BOUND = 'branch_and_bound',
  RANDOM = 'random',
  PRIVACY_FOCUSED = 'privacy_focused',
}

/**
 * Coin selection options
 */
interface CoinSelectionOptions {
  algorithm?: CoinSelectionAlgorithm
  targetAmount: number
  feeRate: number // sat/vB
  dustThreshold?: number // Minimum UTXO value to avoid dust
  maxInputs?: number // Maximum number of inputs
  avoidAddressReuse?: boolean // Prefer UTXOs from different addresses
  consolidateSmallUtxos?: boolean // Consolidate small UTXOs when beneficial
}

/**
 * Coin selection result
 */
interface CoinSelectionResult {
  selectedUtxos: Utxo[]
  totalAmount: number
  fee: number
  changeAmount: number
  efficiency: number // Ratio of target to total selected
  privacyScore: number // Score based on address diversity
}

/**
 * Advanced coin selection with multiple algorithms
 * @param utxos - Available UTXOs
 * @param options - Selection options
 * @returns Selection result with metadata
 */
function selectCoinsAdvanced(utxos: Utxo[], options: CoinSelectionOptions): CoinSelectionResult {
  const {
    algorithm = CoinSelectionAlgorithm.BRANCH_AND_BOUND,
    targetAmount,
    feeRate,
    dustThreshold = 546, // 546 sat = 0.00000546 BTC
    maxInputs = 50,
    avoidAddressReuse = false,
    consolidateSmallUtxos = false,
  } = options

  console.log(
    `Advanced coin selection: ${algorithm}, target: ${targetAmount} sat, feeRate: ${feeRate} sat/vB`,
  )

  // Filter out dust UTXOs unless we're consolidating
  let availableUtxos = utxos.filter(utxo => utxo.amount >= dustThreshold)
  if (consolidateSmallUtxos) {
    availableUtxos = utxos // Include dust for consolidation
  }

  let result: CoinSelectionResult

  switch (algorithm) {
    case CoinSelectionAlgorithm.BRANCH_AND_BOUND:
      result = selectCoinsBnB(availableUtxos, targetAmount, feeRate, maxInputs)
      break
    case CoinSelectionAlgorithm.LARGEST_FIRST:
      result = selectCoinsLargestFirst(availableUtxos, targetAmount, feeRate, maxInputs)
      break
    case CoinSelectionAlgorithm.SMALLEST_FIRST:
      result = selectCoinsSmallestFirst(availableUtxos, targetAmount, feeRate, maxInputs)
      break
    case CoinSelectionAlgorithm.RANDOM:
      result = selectCoinsRandom(availableUtxos, targetAmount, feeRate, maxInputs)
      break
    case CoinSelectionAlgorithm.PRIVACY_FOCUSED:
      result = selectCoinsPrivacyFocused(
        availableUtxos,
        targetAmount,
        feeRate,
        maxInputs,
        avoidAddressReuse,
      )
      break
    default:
      result = selectCoinsLargestFirst(availableUtxos, targetAmount, feeRate, maxInputs)
  }

  // Calculate privacy score
  result.privacyScore = calculatePrivacyScore(result.selectedUtxos)

  return result
}

/**
 * Branch and Bound coin selection (optimal for exact matches)
 * Improved implementation with proper bounds and fee consideration
 */
function selectCoinsBnB(
  utxos: Utxo[],
  targetAmount: number,
  feeRate: number,
  maxInputs: number,
): CoinSelectionResult {
  // Sort by amount ascending for BnB (required for effective bounds)
  const sortedUtxos = [...utxos].sort((a, b) => a.amount - b.amount)

  // Pre-calculate transaction size estimates for different input counts
  const baseTxSize = 10 + 34 * 2 // overhead + 2 outputs
  const inputSizeIncrement = 148 // ~148 vB per input

  // Track best solution found
  let bestSelection: Utxo[] = []
  let bestCost = Infinity // Total cost (waste + fees)

  function calculateCost(selection: Utxo[], target: number): number {
    const totalInput = selection.reduce((sum, utxo) => sum + utxo.amount, 0)
    const inputCount = selection.length
    const txSize = baseTxSize + inputCount * inputSizeIncrement
    const fee = Math.ceil((txSize * feeRate) / 1000)

    // Cost is the difference between what we spend and what we need to spend
    // Lower cost is better (less waste)
    const waste = Math.max(0, totalInput - target - fee)
    return waste
  }

  function search(index: number, currentSelection: Utxo[], currentSum: number): void {
    // Check input count limit
    if (currentSelection.length > maxInputs) return

    // Calculate current cost and compare with best
    if (currentSum >= targetAmount) {
      const cost = calculateCost(currentSelection, targetAmount)
      if (cost < bestCost) {
        bestSelection = [...currentSelection]
        bestCost = cost
      }
      // Continue searching for potentially better solutions
      // (don't return here as BnB explores all possibilities)
    }

    // Upper bound pruning: if current cost already exceeds best, stop exploring
    const currentCost = calculateCost(currentSelection, targetAmount)
    if (currentCost >= bestCost) return

    // Lower bound pruning: calculate minimum possible additional cost
    // If adding all remaining UTXOs still gives worse cost, prune
    const remainingUtxos = sortedUtxos.slice(index)
    const maxAdditionalInputs = Math.min(remainingUtxos.length, maxInputs - currentSelection.length)

    if (maxAdditionalInputs > 0) {
      const hypotheticalSelection = [
        ...currentSelection,
        ...remainingUtxos.slice(0, maxAdditionalInputs),
      ]
      const hypotheticalCost = calculateCost(hypotheticalSelection, targetAmount)
      if (hypotheticalCost >= bestCost) return
    }

    // Recursively explore adding each subsequent UTXO
    for (let i = index; i < sortedUtxos.length; i++) {
      // Optimization: skip UTXOs that are too large if we already have enough
      if (currentSum + sortedUtxos[i].amount > targetAmount * 2) continue

      currentSelection.push(sortedUtxos[i])
      search(i + 1, currentSelection, currentSum + sortedUtxos[i].amount)
      currentSelection.pop()

      // Early termination if we've found a very good solution
      if (bestCost === 0) break
    }
  }

  // Start the search
  search(0, [], 0)

  // If no solution found with BnB, fall back to largest first
  if (bestSelection.length === 0) {
    console.log('BnB found no solution, falling back to largest first')
    return selectCoinsLargestFirst(utxos, targetAmount, feeRate, maxInputs)
  }

  console.log(`BnB found solution with ${bestSelection.length} inputs, cost: ${bestCost}`)
  return calculateSelectionResult(bestSelection, targetAmount, feeRate)
}

/**
 * Largest first coin selection
 */
function selectCoinsLargestFirst(
  utxos: Utxo[],
  targetAmount: number,
  feeRate: number,
  maxInputs: number,
): CoinSelectionResult {
  const sortedUtxos = [...utxos].sort((a, b) => b.amount - a.amount)
  const selected: Utxo[] = []
  let total = 0

  for (const utxo of sortedUtxos) {
    if (selected.length >= maxInputs) break
    selected.push(utxo)
    total += utxo.amount
    if (total >= targetAmount) break
  }

  return calculateSelectionResult(selected, targetAmount, feeRate)
}

/**
 * Smallest first coin selection (for consolidation)
 */
function selectCoinsSmallestFirst(
  utxos: Utxo[],
  targetAmount: number,
  feeRate: number,
  maxInputs: number,
): CoinSelectionResult {
  const sortedUtxos = [...utxos].sort((a, b) => a.amount - b.amount)
  const selected: Utxo[] = []
  let total = 0

  for (const utxo of sortedUtxos) {
    if (selected.length >= maxInputs) break
    selected.push(utxo)
    total += utxo.amount
    if (total >= targetAmount) break
  }

  return calculateSelectionResult(selected, targetAmount, feeRate)
}

/**
 * Random coin selection (for privacy)
 */
function selectCoinsRandom(
  utxos: Utxo[],
  targetAmount: number,
  feeRate: number,
  maxInputs: number,
): CoinSelectionResult {
  const shuffled = [...utxos].sort(() => Math.random() - 0.5)
  const selected: Utxo[] = []
  let total = 0

  for (const utxo of shuffled) {
    if (selected.length >= maxInputs) break
    selected.push(utxo)
    total += utxo.amount
    if (total >= targetAmount) break
  }

  return calculateSelectionResult(selected, targetAmount, feeRate)
}

/**
 * Privacy-focused coin selection
 * Prioritizes address diversity and avoids common input heuristics
 */
function selectCoinsPrivacyFocused(
  utxos: Utxo[],
  targetAmount: number,
  feeRate: number,
  maxInputs: number,
  avoidAddressReuse: boolean,
): CoinSelectionResult {
  // Group UTXOs by address
  const addressGroups = new Map<string, Utxo[]>()
  for (const utxo of utxos) {
    const address = utxo.address
    if (!addressGroups.has(address)) {
      addressGroups.set(address, [])
    }
    addressGroups.get(address)!.push(utxo)
  }

  let candidates: Utxo[] = []

  if (avoidAddressReuse) {
    // Prioritize addresses with fewer UTXOs to maximize address diversity
    const sortedGroups = Array.from(addressGroups.entries()).sort(
      (a, b) => a[1].length - b[1].length,
    )

    // Take at most one UTXO per address, preferring smaller amounts
    for (const [, groupUtxos] of sortedGroups) {
      const sortedByAmount = groupUtxos.sort((a, b) => a.amount - b.amount)
      candidates.push(sortedByAmount[0]) // Take smallest UTXO from each address
    }
  } else {
    // Allow address reuse but prefer diverse amounts
    candidates = [...utxos]
  }

  // Sort by amount diversity (avoid clustering similar amounts)
  candidates.sort((a, b) => {
    // Prefer amounts that are different from each other
    const aDiff = Math.abs(a.amount - targetAmount)
    const bDiff = Math.abs(b.amount - targetAmount)
    return aDiff - bDiff
  })

  // Select UTXOs using a mixed strategy
  const selected: Utxo[] = []
  let total = 0
  const usedAddresses = new Set<string>()

  for (const candidate of candidates) {
    if (selected.length >= maxInputs) break

    // Skip if we already used this address and avoiding reuse
    if (avoidAddressReuse && usedAddresses.has(candidate.address)) continue

    selected.push(candidate)
    total += candidate.amount
    usedAddresses.add(candidate.address)

    // Stop if we have enough (with some buffer for fees)
    const estimatedFee = Math.ceil(((selected.length * 148 + 100) * feeRate) / 1000)
    if (total >= targetAmount + estimatedFee) break
  }

  return calculateSelectionResult(selected, targetAmount, feeRate)
}

/**
 * Calculate selection result with fees and efficiency
 * Improved fee calculation with more accurate transaction size estimation
 */
function calculateSelectionResult(
  selectedUtxos: Utxo[],
  targetAmount: number,
  feeRate: number,
): CoinSelectionResult {
  const totalAmount = selectedUtxos.reduce((sum, utxo) => sum + utxo.amount, 0)

  // More accurate transaction size calculation
  // Base transaction: version (4) + locktime (4) + input/output count varints
  let txSize = 4 + 4 + 1 + 1 // version, locktime, vin count, vout count

  // Add input sizes (more accurate breakdown)
  for (let i = 0; i < selectedUtxos.length; i++) {
    // prevout hash (32) + prevout index (4) + script length (1) + sequence (4)
    // For P2WPKH/P2TR inputs, scriptSig is empty, witness is separate
    txSize += 32 + 4 + 1 + 4
    // Witness: stack items count (1) + signature (64-65) + pubkey (32-33)
    txSize += 1 + 65 + 33
  }

  // Add output sizes (recipient + change if any)
  const hasChange = totalAmount > targetAmount
  const outputCount = hasChange ? 2 : 1

  for (let i = 0; i < outputCount; i++) {
    // value (8) + script length varint (1) + script (22-34 bytes for addresses)
    txSize += 8 + 1 + 25 // average script size
  }

  // SegWit marker and flag add 2 bytes
  txSize += 2

  // Calculate fee (convert from sat/vB to total sats)
  const fee = Math.ceil((txSize * feeRate) / 1000)

  // Recalculate change after accurate fee
  const changeAmount = Math.max(0, totalAmount - targetAmount - fee)

  // If change would be dust, add it to fee instead
  const dustThreshold = 546
  let finalFee = fee
  let finalChangeAmount = changeAmount

  if (changeAmount > 0 && changeAmount < dustThreshold) {
    finalFee += changeAmount
    finalChangeAmount = 0
  }

  const efficiency = targetAmount / (targetAmount + finalFee)

  return {
    selectedUtxos,
    totalAmount,
    fee: finalFee,
    changeAmount: finalChangeAmount,
    efficiency,
    privacyScore: 0, // Will be calculated separately
  }
}

/**
 * Calculate privacy score based on address diversity
 */
function calculatePrivacyScore(selectedUtxos: Utxo[]): number {
  if (selectedUtxos.length === 0) return 0

  const addresses = new Set(selectedUtxos.map(utxo => utxo.address))
  const addressDiversity = addresses.size / selectedUtxos.length

  // Additional factors could include:
  // - Age diversity of UTXOs
  // - Amount clustering
  // - Previous transaction patterns

  return addressDiversity
}

/**
 * Selects UTXOs for transaction using largest-first algorithm
 * @param utxos - Available UTXOs
 * @param targetAmount - Target amount in satoshis
 * @returns Selected UTXOs
 */
function selectUtxos(utxos: Utxo[], targetAmount: number): Utxo[] {
  console.log(`Selecting UTXOs for target amount: ${targetAmount} BTC`)
  console.log(`Available UTXOs: ${utxos.length}`)

  // Sort UTXOs by amount descending
  const sortedUtxos = [...utxos].sort((a, b) => b.amount - a.amount)

  const selected = []
  let total = 0

  for (const utxo of sortedUtxos) {
    console.log(`Considering UTXO: ${utxo.txid}:${utxo.vout} with ${utxo.amount} BTC`)
    selected.push(utxo)
    total += utxo.amount
    console.log(`Total so far: ${total} BTC, target: ${targetAmount} BTC`)
    if (total >= targetAmount) {
      console.log(`Target reached with ${selected.length} UTXOs`)
      break
    }
  }

  console.log(`Selected ${selected.length} UTXOs with total ${total} BTC`)
  return selected
}

/**
 * Sends a signed transaction to the Bitcoin network
 * @param params - Transaction sending parameters
 * @returns Transaction sending result
 */
async function sendTransaction({
  signedTransaction,
  txHex,
  getConnectionFn,
}: SendTransactionParams): Promise<SendTransactionResult> {
  let socket: any
  let shouldCloseSocket = false

  try {
    console.log('Broadcasting transaction:', txHex.substring(0, 100) + '...')
    console.log('Transaction hex length:', txHex.length)
    console.log('Signed transaction inputs:', (signedTransaction as any).inputs?.length || 0)
    console.log('Signed transaction outputs:', (signedTransaction as any).outputs?.length || 0)

    if (!txHex || txHex.length === 0) {
      throw new Error('Transaction hex is empty')
    }

    if ((signedTransaction as any).inputs?.length === 0) {
      throw new Error('Transaction has no inputs')
    }

    console.log('Testing transaction decode before broadcast...')
    const testResult = testTransactionDecode(txHex)

    if (!testResult.success) {
      console.error('Transaction decode test failed:', testResult.error)
      return {
        txid: '',
        success: false,
        error: `Transaction validation failed: ${testResult.error}`,
      }
    }

    if (testResult.warnings && testResult.warnings.length > 0) {
      console.warn('Transaction warnings:', testResult.warnings)
    }

    console.log('Transaction validation passed, proceeding with broadcast...')

    // Connect to Electrum server
    if (getConnectionFn) {
      socket = await getConnectionFn()
    } else {
      socket = await connect()
      shouldCloseSocket = true
    }

    // Broadcast the transaction using Electrum's blockchain.transaction.broadcast method
    const response = await callElectrumMethod<string>(
      'blockchain.transaction.broadcast',
      [txHex],
      socket,
    )

    // The response.result contains the transaction ID if successful
    const txid = response.result || ''

    console.log('Transaction broadcasted successfully, txid:', txid)

    return {
      txid,
      success: true,
    }
  } catch (error) {
    console.error('Failed to broadcast transaction:', error)
    return {
      txid: '',
      success: false,
      error: (error as Error).message,
    }
  } finally {
    if (shouldCloseSocket && socket) {
      socket.end()
    }
  }
}

/**
 * Serializes a transaction to bytes
 * @param tx - Transaction to serialize
 * @returns Serialized transaction as Uint8Array
 */
function serializeTransaction(tx: SimpleTransaction): Uint8Array {
  const parts: Uint8Array[] = []

  // Version (4 bytes, little endian)
  const versionBytes = new Uint8Array(4)
  new DataView(versionBytes.buffer).setUint32(0, tx.version, true)
  parts.push(versionBytes)

  // SegWit marker (0x00) and flag (0x01)
  parts.push(new Uint8Array([0x00, 0x01]))

  // Input count (varint)
  parts.push(encodeVarint(tx.inputs.length))

  // Inputs
  for (const input of tx.inputs) {
    // Previous txid (32 bytes, little endian)
    parts.push(hexToUint8Array(input.txid).reverse())

    // Previous vout (4 bytes, little endian)
    const voutBytes = new Uint8Array(4)
    new DataView(voutBytes.buffer).setUint32(0, input.vout, true)
    parts.push(voutBytes)

    // ScriptSig length (varint)
    parts.push(encodeVarint(input.scriptSig.length))

    // ScriptSig
    parts.push(input.scriptSig)

    // Sequence (4 bytes, little endian)
    const sequenceBytes = new Uint8Array(4)
    new DataView(sequenceBytes.buffer).setUint32(0, input.sequence, true)
    parts.push(sequenceBytes)
  }

  // Output count (varint)
  parts.push(encodeVarint(tx.outputs.length))

  // Outputs
  for (const output of tx.outputs) {
    // Value (8 bytes, little endian)
    const valueBytes = new Uint8Array(8)
    new DataView(valueBytes.buffer).setBigUint64(0, BigInt(output.value), true)
    parts.push(valueBytes)

    // ScriptPubKey length (varint)
    parts.push(encodeVarint(output.scriptPubKey.length))

    // ScriptPubKey
    parts.push(output.scriptPubKey)
  }

  // Witnesses (for SegWit)
  for (const witness of tx.witnesses) {
    if (witness.length > 0) {
      parts.push(encodeVarint(witness.length))
      for (const item of witness) {
        parts.push(encodeVarint(item.length))
        parts.push(item)
      }
    } else {
      parts.push(new Uint8Array([0])) // Empty witness
    }
  }

  // Locktime (4 bytes, little endian)
  const locktimeBytes = new Uint8Array(4)
  new DataView(locktimeBytes.buffer).setUint32(0, tx.locktime, true)
  parts.push(locktimeBytes)

  // Combine all parts
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }

  return result
}

/**
 * Signs a Bitcoin transaction
 * @param params - Transaction signing parameters
 * @returns Signed transaction result
 */
async function signTransaction({
  transaction,
  inputs,
  accountKey,
}: SignTransactionParams): Promise<SignTransactionResult> {
  try {
    console.log(`Signing transaction with ${inputs.length} inputs`)
    console.log(`Transaction has ${transaction.inputs.length} inputs before signing`)

    if (inputs.length === 0) {
      throw new Error('No inputs provided for signing')
    }

    if (transaction.inputs.length === 0) {
      throw new Error('Transaction has no inputs to sign')
    }

    // Validate inputs - ensure amounts are in satoshis and integers
    for (const input of inputs) {
      if (!Number.isInteger(input.amount)) {
        throw new Error(
          `Input amount must be an integer (satoshis), got: ${input.amount} (type: ${typeof input.amount})`,
        )
      }
      if (input.amount <= 0) {
        throw new Error(`Input amount must be positive, got: ${input.amount}`)
      }
      // Additional validation for reasonable Bitcoin amounts
      if (input.amount > 21000000 * 100000000) {
        throw new Error(
          `Input amount exceeds maximum possible Bitcoin amount, got: ${input.amount}`,
        )
      }
    }

    // Validate transaction values - ensure values are in satoshis and integers
    for (const output of transaction.outputs) {
      if (!Number.isInteger(output.value)) {
        throw new Error(`Output value must be an integer (satoshis), got: ${output.value}`)
      }
      if (output.value <= 0) {
        throw new Error(`Output value must be positive, got: ${output.value}`)
      }
    }

    if (!Number.isInteger(transaction.version)) {
      throw new Error(`Transaction version must be an integer, got: ${transaction.version}`)
    }

    if (!Number.isInteger(transaction.locktime)) {
      throw new Error(`Transaction locktime must be an integer, got: ${transaction.locktime}`)
    }

    // Sign each input
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]

      // Find the derivation path for this address
      const addressInfo = await findAddressIndex(accountKey, input.address)

      if (addressInfo === null) {
        throw new Error(`Could not find derivation path for address ${input.address}`)
      }

      // Derive the private key for this address based on type (receiving or change)
      const chainIndex = addressInfo.type === 'receiving' ? 0 : 1
      const chainExtendedKey = deriveChildKey(accountKey, chainIndex)
      const addressExtendedKey = deriveChildKey(chainExtendedKey, addressInfo.index)
      const { privateKey } = splitMasterKey(addressExtendedKey)

      // Create signature for SegWit input
      const signature = createSegWitSignature(transaction, i, privateKey, input.amount)

      // Add witness
      ;(transaction as SimpleTransaction).witnesses[i] = [signature, createPublicKey(privateKey)]
    }

    // Serialize the signed transaction
    const signedTxBytes = serializeTransaction(transaction as SimpleTransaction)
    const txHex = uint8ArrayToHex(signedTxBytes)
    const txid = uint8ArrayToHex(hash256(signedTxBytes).reverse())

    console.log(`Signed transaction hex length: ${txHex.length}`)
    console.log(`Signed transaction has ${transaction.inputs.length} inputs`)
    console.log(`Signed transaction has ${transaction.outputs.length} outputs`)

    return {
      signedTransaction: transaction,
      txHex,
      txid,
    }
  } catch (error) {
    throw new Error(`Failed to sign transaction: ${(error as Error).message}`)
  }
}

/**
 * Test function to decode and validate a transaction before broadcasting
 * @param txHex - Transaction hex string to test
 * @returns Validation result with decoded information
 */
function testTransactionDecode(txHex: string): {
  success: boolean
  decodedTx?: any
  error?: string
  warnings?: string[]
} {
  try {
    console.log('Testing transaction decode...')
    console.log('Transaction hex length:', txHex.length)

    const decodedTx = decodeTransaction(txHex)

    const warnings: string[] = []

    // Validate basic structure
    if (decodedTx.inputs.length === 0) {
      return {
        success: false,
        error: 'Transaction has no inputs',
      }
    }

    if (decodedTx.outputs.length === 0) {
      return {
        success: false,
        error: 'Transaction has no outputs',
      }
    }

    // Check for potential issues
    if (decodedTx.inputs.length > 100) {
      warnings.push('High number of inputs may cause issues')
    }

    if (decodedTx.outputs.length > 100) {
      warnings.push('High number of outputs may cause issues')
    }

    // Check input values
    for (let i = 0; i < decodedTx.inputs.length; i++) {
      const input = decodedTx.inputs[i]
      if (!input.txid || input.txid.length !== 64) {
        return {
          success: false,
          error: `Input ${i} has invalid txid: ${input.txid}`,
        }
      }
      if (input.vout < 0 || input.vout > 0xffffffff) {
        return {
          success: false,
          error: `Input ${i} has invalid vout: ${input.vout}`,
        }
      }
    }

    // Check output values
    for (let i = 0; i < decodedTx.outputs.length; i++) {
      const output = decodedTx.outputs[i]
      if (output.value <= 0) {
        return {
          success: false,
          error: `Output ${i} has invalid amount: ${output.value}`,
        }
      }
      if (output.value > 21000000 * 100000000) {
        return {
          success: false,
          error: `Output ${i} amount exceeds maximum Bitcoin supply: ${output.value}`,
        }
      }
    }

    console.log('✅ Transaction decode test passed')
    console.log(`Summary: ${decodedTx.inputs.length} inputs, ${decodedTx.outputs.length} outputs`)
    console.log(`TXID: ${decodedTx.txid}`)

    return {
      success: true,
      decodedTx,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  } catch (error) {
    console.error('❌ Transaction decode test failed:', error)
    return {
      success: false,
      error: (error as Error).message,
    }
  }
}

export {
  buildBatchTransactions,
  buildTransaction,
  bumpRBFFee,
  calculateEffectiveFeeRate,
  calculateSelectionResult,
  canBumpFee,
  canUseCPFP,
  CoinSelectionAlgorithm,
  createRBFTransaction,
  createSegWitSignature,
  createSighash,
  decodeTransaction,
  deriveAddress,
  estimateOptimalFeeRate,
  estimateTransactionFee,
  estimateTransactionSize,
  flattenArrays,
  isRBFEnabled,
  parseUnsignedTransaction,
  SIGHASH_ALL,
  SIGHASH_NONE,
  SIGHASH_SINGLE,
  SIGHASH_ANYONECANPAY,
  selectCoinsAdvanced,
  selectUtxos,
  sendBatchTransactions,
  sendTransaction,
  signTransaction,
  suggestCPFP,
  testTransactionDecode,
  verifySegWitSignature,
}

export { CoinSelectionAlgorithm as CoinSelectionAlgorithmType }
export type { CoinSelectionOptions, CoinSelectionResult }
