import { CoinType, Purpose } from '@/lib/account'
import {
  createHardenedIndex,
  createPublicKey,
  deriveChildPrivateKey,
  splitRootExtendedKey,
} from '@/lib/key'
import { connect, getTransactions, callElectrumMethod, close } from '../electrum'
import { createSegwitAddress, fromBech32, generateAddresses, UsedAddress } from '../address'
import secp256k1 from 'secp256k1'
import { hash256, hash160, uint8ArrayToHex, hexToUint8Array } from '@/lib/crypto'
import { UTXO } from './types'
import {
  MINIMUN_CONFIRMATIONS,
  TxHistory,
  Tx,
  TransactionType,
  TransactionStatus,
  UIFriendlyTransaction,
} from './types'
import {
  BuildTransactionParams,
  BuildTransactionResult,
  SignTransactionParams,
  SignTransactionResult,
  SendTransactionParams,
  SendTransactionResult,
} from './types'
import { ElectrumPeer } from '@/lib/electrum'

interface GetTxHistoryParams {
  extendedKey: Uint8Array
  purpose?: Purpose
  coinType?: CoinType
  accountStartIndex?: number
  gapLimit?: number
  trustedPeers?: ElectrumPeer[]
  getConnectionFn?: () => Promise<any>
}

interface GetTxHistoryResponse {
  txHistory: TxHistory[]
}

/**
 * Derives the receiving and change extended keys from the root extended key
 * @param extendedKey - The root extended private key
 * @param purpose - The purpose index (default 84 for Native SegWit)
 * @param coinType - The coin type index (default 0 for Bitcoin)
 * @param accountStartIndex - The account index (default 0)
 * @returns Object containing receiving and change extended keys
 */
function deriveExtendedKeys(
  extendedKey: Uint8Array,
  purpose: number = 84,
  coinType: number = 0,
  accountStartIndex: number = 0,
): { receivingExtendedKey: Uint8Array; changeExtendedKey: Uint8Array } {
  // purpose
  const purposeIndex = createHardenedIndex(purpose)
  const purposeExtendedKey = deriveChildPrivateKey(extendedKey, purposeIndex)

  // coin type
  const coinTypeIndex = createHardenedIndex(coinType)
  const coinTypeExtendedKey = deriveChildPrivateKey(purposeExtendedKey, coinTypeIndex)

  // accountIndex
  const accountIndex = createHardenedIndex(accountStartIndex)
  const accountExtendedKey = deriveChildPrivateKey(coinTypeExtendedKey, accountIndex)

  // receiving (change 0)
  const receivingIndex = 0
  const receivingExtendedKey = deriveChildPrivateKey(accountExtendedKey, receivingIndex)

  // change (change 1)
  const changeIndex = 1
  const changeExtendedKey = deriveChildPrivateKey(accountExtendedKey, changeIndex)

  return { receivingExtendedKey, changeExtendedKey }
}

/**
 * Generates receiving addresses with their corresponding change addresses
 * @param receivingExtendedKey - The extended key for receiving addresses
 * @param changeExtendedKey - The extended key for change addresses
 * @param gapLimit - The gap limit for address generation
 * @returns Array of address objects with receiving and change addresses
 */
function generateReceivingAddresses(
  receivingExtendedKey: Uint8Array,
  changeExtendedKey: Uint8Array,
  gapLimit: number,
): { address: string; changeAddress: string; index: number }[] {
  return generateAddresses(receivingExtendedKey, changeExtendedKey, 0, gapLimit * 2).map(
    ({ address, changeAddress, index }) => ({
      address,
      changeAddress: changeAddress!,
      index,
    }),
  )
}

/**
 * Generates change addresses
 * @param changeExtendedKey - The extended key for change addresses
 * @param gapLimit - The gap limit for address generation
 * @returns Array of address objects with only change addresses
 */
function generateChangeAddresses(
  changeExtendedKey: Uint8Array,
  gapLimit: number,
): { address: string; index: number }[] {
  return generateAddresses(changeExtendedKey, undefined, 0, gapLimit * 2).map(
    ({ address, index }) => ({ address, index }),
  )
}

/**
 * Fetches transactions for a list of addresses in parallel
 * @param addresses - Array of addresses to fetch transactions for
 * @param socket - The Electrum socket connection
 * @returns Promise.allSettled results of transaction fetches
 */
async function fetchTransactionsForAddresses(
  addresses: string[],
  socket: any,
): Promise<PromiseSettledResult<Tx[]>[]> {
  console.log(`[transactions] Checking ${addresses.length} addresses in parallel...`)
  return await Promise.allSettled(addresses.map(address => getTransactions(address, socket)))
}

/**
 * Processes the results of transaction fetches and builds TxHistory
 * @param results - The settled results from Promise.allSettled
 * @param addresses - The address data array
 * @param type - The type of addresses ('receiving' or 'change')
 * @param gapLimit - The gap limit for unused addresses
 * @returns Array of TxHistory objects
 */
function processTransactionResults(
  results: PromiseSettledResult<Tx[]>[],
  addresses: { address: string; changeAddress?: string; index: number }[],
  type: 'receiving' | 'change',
  gapLimit: number,
): TxHistory[] {
  const txHistory: TxHistory[] = []
  let consecutiveUnused = 0

  for (let i = 0; i < results.length && consecutiveUnused < gapLimit; i++) {
    const result = results[i]
    const addressData = addresses[i]

    if (result.status === 'fulfilled') {
      const transactions = result.value
      if (transactions.length > 0) {
        if (type === 'receiving') {
          txHistory.push({
            receivingAddress: addressData.address,
            changeAddress: addressData.changeAddress!,
            index: addressData.index,
            txs: transactions,
          })
        } else {
          txHistory.push({
            receivingAddress: '',
            changeAddress: addressData.address,
            index: addressData.index,
            txs: transactions,
          })
        }
        consecutiveUnused = 0
      } else {
        consecutiveUnused++
      }
    } else {
      console.warn(
        `[transactions] Failed to check ${type} address ${addressData.address}:`,
        result.reason,
      )
      consecutiveUnused++
    }
  }

  return txHistory
}

/**
 * Discovers addresses and txs based on account parameters.
 * @param extendedKey - The extended private key (bip32) to derive from.
 * @param purpose - The purpose of the account (default is 84 for Native SegWit).
 * @param coinType - The coin type of the account. Default is 0 (Bitcoin).
 * @param accountStartIndex - The starting account index (default is 0).
 * @param gapLimit - The gap limit for unused addresses (default is 20).
 * @returns An object containing the tx history.
 */
export async function getTxHistory({
  extendedKey,
  purpose = 84,
  coinType = 0,
  accountStartIndex = 0,
  gapLimit = 20,
  trustedPeers,
  getConnectionFn,
}: GetTxHistoryParams): Promise<GetTxHistoryResponse> {
  let socket: any = null
  let shouldCloseSocket = false

  try {
    const txHistory: TxHistory[] = []

    // Derive extended keys
    const { receivingExtendedKey, changeExtendedKey } = deriveExtendedKeys(
      extendedKey,
      purpose,
      coinType,
      accountStartIndex,
    )

    // connect to electrum server
    if (getConnectionFn) {
      socket = await getConnectionFn()
    } else {
      socket = await connect()
      shouldCloseSocket = true
    }
    console.log('[transactions] Established persistent Electrum connection for transaction history')

    // Generate receiving addresses
    console.log('[transactions] Generating receiving addresses...')
    const receivingAddresses = generateReceivingAddresses(
      receivingExtendedKey,
      changeExtendedKey,
      gapLimit,
    )

    // Fetch transactions for receiving addresses
    const receivingResults = await fetchTransactionsForAddresses(
      receivingAddresses.map(({ address }) => address),
      socket,
    )

    // Process receiving results
    const receivingTxHistory = processTransactionResults(
      receivingResults,
      receivingAddresses,
      'receiving',
      gapLimit,
    )

    // Generate change addresses
    console.log('[transactions] Generating change addresses...')
    const changeAddresses = generateChangeAddresses(changeExtendedKey, gapLimit)

    // Fetch transactions for change addresses
    const changeResults = await fetchTransactionsForAddresses(
      changeAddresses.map(({ address }) => address),
      socket,
    )

    // Process change results
    const changeTxHistory = processTransactionResults(
      changeResults,
      changeAddresses.map(({ address, index }) => ({ address, index })),
      'change',
      gapLimit,
    )

    txHistory.push(...receivingTxHistory, ...changeTxHistory)

    return { txHistory }
  } catch (error) {
    throw new Error(`Failed to discover accounts: ${(error as Error).message}`)
  } finally {
    if (shouldCloseSocket && socket) {
      socket.end()
    }
  }
}

export async function getFriendlyTransactions(
  txHistory: TxHistory[],
  params: GetTxHistoryParams,
): Promise<UIFriendlyTransaction[]> {
  const allTxs = new Map<string, Tx>()
  const ourAddresses = new Set<string>()

  txHistory.forEach(history => {
    if (history.receivingAddress) ourAddresses.add(history.receivingAddress)
    if (history.changeAddress) ourAddresses.add(history.changeAddress)
    history.txs.forEach(tx => {
      allTxs.set(tx.txid, tx)
    })
  })

  const friendlyTxs: UIFriendlyTransaction[] = []

  allTxs.forEach((tx, txid) => {
    let ourInputsValue = 0
    let totalInputsValue = 0
    const ourInputAddresses: string[] = []
    const nonOurInputAddresses: string[] = []

    tx.vin.forEach(vin => {
      const prevTx = allTxs.get(vin.txid)
      if (prevTx) {
        const prevVout = prevTx.vout[vin.vout]
        if (prevVout && prevVout.scriptPubKey.address) {
          totalInputsValue += prevVout.value
          const prevAddr = prevVout.scriptPubKey.address
          if (ourAddresses.has(prevAddr)) {
            ourInputsValue += prevVout.value
            ourInputAddresses.push(prevAddr)
          } else {
            nonOurInputAddresses.push(prevAddr)
          }
        }
      }
    })

    let ourOutputsValue = 0
    const ourOutputAddresses: string[] = []
    const toAddresses: string[] = []
    let nonOurOutputsValue = 0

    tx.vout.forEach(vout => {
      const addr = vout.scriptPubKey.address
      if (addr) {
        if (ourAddresses.has(addr)) {
          ourOutputsValue += vout.value
          ourOutputAddresses.push(addr)
        } else {
          nonOurOutputsValue += vout.value
          toAddresses.push(addr)
        }
      }
    })

    const net = ourOutputsValue - ourInputsValue
    let type: TransactionType = net >= 0 ? 'received' : 'sent'
    let amount = Math.abs(net)
    if (ourInputsValue > 0 && ourOutputsValue > 0 && net === 0) {
      type = 'sent' // Self-transfer, treat as sent.
    }

    const fromAddress =
      ourInputsValue > 0 ? ourInputAddresses[0] || '' : nonOurInputAddresses[0] || 'Unknown'

    const toAddress =
      ourInputsValue > 0
        ? toAddresses[0] || ourOutputAddresses[0] || ''
        : ourOutputAddresses[0] || ''

    let fee: number | null = null
    if (ourInputsValue > 0) {
      const totalOutputsValue = ourOutputsValue + nonOurOutputsValue
      fee = totalInputsValue - totalOutputsValue
    }

    const confirmations = tx.confirmations ?? 0
    const status = getTransactionStatus(tx, MINIMUN_CONFIRMATIONS)
    const date = new Date(tx.time * 1000).toISOString()

    friendlyTxs.push({
      txid,
      date,
      type,
      fromAddress,
      toAddress,
      amount,
      status,
      fee,
      confirmations,
    })
  })

  // Sort by date descending (most recent first).
  friendlyTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return friendlyTxs
}

function isConfirmed(tx: Tx, minConfirmations: number): boolean {
  return (tx.confirmations ?? 0) >= minConfirmations
}

function isPending(tx: Tx): boolean {
  return (tx.confirmations ?? 0) < 1
}

function isProcessing(tx: Tx): boolean {
  return (tx.confirmations ?? 0) > 0 && (tx.confirmations ?? 0) < 3
}

function getTransactionStatus(tx: Tx, minConfirmations: number): TransactionStatus {
  if (isConfirmed(tx, minConfirmations)) {
    return 'confirmed'
  } else if (isPending(tx)) {
    return 'pending'
  } else if (isProcessing(tx)) {
    return 'processing'
  }
  return 'unknown'
}

/**
 * Creates a scriptPubKey for a Bitcoin address
 * @param address - Bitcoin address
 * @returns ScriptPubKey as Uint8Array
 */
function createScriptPubKey(address: string): Uint8Array {
  try {
    // For Bech32 addresses (P2WPKH)
    if (address.startsWith('bc1')) {
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
 * Builds a Bitcoin transaction with the specified parameters
 * @param params - Transaction building parameters
 * @returns Transaction building result
 */
export async function buildTransaction({
  recipientAddress,
  amount,
  feeRate,
  utxos,
  changeAddress,
  extendedKey,
  purpose = 84,
  coinType = 0,
  accountIndex = 0,
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

    // Select UTXOs using a simple selection algorithm (largest first)
    const targetAmountBtc = amount / 1e8
    console.log(`Selecting UTXOs for target amount: ${targetAmountBtc} BTC`)
    const selectedUtxos = selectUtxos(confirmedUtxos, targetAmountBtc) // Convert amount to BTC for UTXO selection
    console.log(`Selected ${selectedUtxos.length} UTXOs`)
    const totalInputAmountBtc = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0)
    const totalInputAmountSat = Math.round(totalInputAmountBtc * 1e8)

    if (totalInputAmountSat < amount) {
      throw new Error('Insufficient funds')
    }

    // Estimate transaction size for fee calculation
    const estimatedTxSize = estimateTransactionSize(selectedUtxos.length, 2) // 2 outputs: recipient + change
    const estimatedFeeSat = Math.ceil(estimatedTxSize * feeRate)
    console.log('Estimated transaction size (bytes):', estimatedTxSize)
    console.log('Estimated fee (satoshis):', estimatedFeeSat)

    // Calculate change amount in satoshis
    let changeAmountSat = totalInputAmountSat - amount - estimatedFeeSat

    if (changeAmountSat < 0) {
      throw new Error(
        `Insufficient funds after fee calculation. Needed: ${amount + estimatedFeeSat} sat, Available: ${totalInputAmountSat} sat`,
      )
    }

    // Create transaction
    const tx: SimpleTransaction = {
      version: 2,
      inputs: [],
      outputs: [],
      locktime: 0,
      witnesses: [],
    }

    // Add inputs
    const inputs = []
    console.log(`Building transaction with ${selectedUtxos.length} selected UTXOs`)
    for (const utxo of selectedUtxos) {
      console.log(`Adding input: ${utxo.txid}:${utxo.vout} with amount ${utxo.value} BTC`)
      tx.inputs.push({
        txid: utxo.txid,
        vout: utxo.vout,
        scriptSig: new Uint8Array(0), // Empty for SegWit
        sequence: 0xffffffff,
      })

      tx.witnesses.push([]) // Empty witness to be filled during signing

      inputs.push({
        txid: utxo.txid,
        vout: utxo.vout,
        amount: Math.round(utxo.value * 100000000), // Convert BTC to satoshis
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
 * Signs a Bitcoin transaction
 * @param params - Transaction signing parameters
 * @returns Signed transaction result
 */
export async function signTransaction({
  transaction,
  inputs,
  extendedKey,
  purpose = 84,
  coinType = 0,
  accountIndex = 0,
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
    // Derive the account extended key
    const purposeIndex = createHardenedIndex(purpose)
    const purposeExtendedKey = deriveChildPrivateKey(extendedKey, purposeIndex)

    const coinTypeIndex = createHardenedIndex(coinType)
    const coinTypeExtendedKey = deriveChildPrivateKey(purposeExtendedKey, coinTypeIndex)

    const accountIndexHardened = createHardenedIndex(accountIndex)
    const accountExtendedKey = deriveChildPrivateKey(coinTypeExtendedKey, accountIndexHardened)

    // Sign each input
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]

      // Find the derivation path for this address
      const addressInfo = await findAddressIndex(accountExtendedKey, input.address)

      if (addressInfo === null) {
        throw new Error(`Could not find derivation path for address ${input.address}`)
      }

      // Derive the private key for this address based on type (receiving or change)
      const chainIndex = addressInfo.type === 'receiving' ? 0 : 1
      const chainExtendedKey = deriveChildPrivateKey(accountExtendedKey, chainIndex)
      const addressExtendedKey = deriveChildPrivateKey(chainExtendedKey, addressInfo.index)
      const { privateKey } = splitRootExtendedKey(addressExtendedKey)

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
 * Creates a SegWit signature for a transaction input
 * @param tx - Transaction to sign
 * @param inputIndex - Index of the input to sign
 * @param privateKey - Private key for signing
 * @param amount - Amount of the input
 * @returns Signature as Uint8Array
 */
function createSegWitSignature(
  tx: SimpleTransaction,
  inputIndex: number,
  privateKey: Uint8Array,
  amount: number,
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
  const sighash = createSighash(tx, inputIndex, amount, publicKey)

  // Sign the sighash using ECDSA
  const { signature } = secp256k1.ecdsaSign(sighash, privateKey)

  // Convert signature to DER format
  const derSignature = compactSignatureToDER(signature)

  // Add sighash type (SIGHASH_ALL = 0x01)
  const signatureWithType = new Uint8Array(derSignature.length + 1)
  signatureWithType.set(derSignature, 0)
  signatureWithType[derSignature.length] = 0x01

  return signatureWithType
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
 * Creates a sighash for SegWit transaction
 * @param tx - Transaction
 * @param inputIndex - Input index
 * @param amount - Input amount
 * @param publicKey - Public key for the input being signed
 * @returns Sighash as Uint8Array
 */
function createSighash(
  tx: SimpleTransaction,
  inputIndex: number,
  amount: number,
  publicKey: Uint8Array,
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
  const sighashPreimage: Uint8Array[] = []

  // Version (4 bytes, little endian)
  const versionBytes = new Uint8Array(4)
  new DataView(versionBytes.buffer).setUint32(0, tx.version, true)
  sighashPreimage.push(versionBytes)

  // Hash of all inputs (hashPrevouts)
  const prevouts = tx.inputs.map(input => {
    const txid = hexToUint8Array(input.txid).reverse()
    const vout = new Uint8Array(4)
    new DataView(vout.buffer).setUint32(0, input.vout, true)
    return new Uint8Array([...txid, ...vout])
  })

  const hashPrevouts = hash256(flattenArrays(prevouts))
  sighashPreimage.push(hashPrevouts)

  // Hash of all sequences (hashSequence)
  const sequences = tx.inputs.map(input => {
    const seq = new Uint8Array(4)
    new DataView(seq.buffer).setUint32(0, input.sequence, true)
    return seq
  })

  const hashSequence = hash256(flattenArrays(sequences))
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
  const outputs = tx.outputs.map(output => {
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
  const sighashType = new Uint8Array(4)
  new DataView(sighashType.buffer).setUint32(0, 0x01, true) // SIGHASH_ALL
  sighashPreimage.push(sighashType)

  // Combine all parts and hash
  const preimage = flattenArrays(sighashPreimage)
  return hash256(preimage)
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
 * Test function to decode and validate a transaction before broadcasting
 * @param txHex - Transaction hex string to test
 * @returns Validation result with decoded information
 */
export function testTransactionDecode(txHex: string): {
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

/**
 * Sends a signed transaction to the Bitcoin network
 * @param params - Transaction sending parameters
 * @returns Transaction sending result
 */
export async function sendTransaction({
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
 * Selects UTXOs for transaction using largest-first algorithm
 * @param utxos - Available UTXOs
 * @param targetAmount - Target amount in satoshis
 * @returns Selected UTXOs
 */
function selectUtxos(utxos: UTXO[], targetAmount: number): UTXO[] {
  console.log(`Selecting UTXOs for target amount: ${targetAmount} BTC`)
  console.log(`Available UTXOs: ${utxos.length}`)

  // Sort UTXOs by amount descending
  const sortedUtxos = [...utxos].sort((a, b) => b.value - a.value)

  const selected = []
  let total = 0

  for (const utxo of sortedUtxos) {
    console.log(`Considering UTXO: ${utxo.txid}:${utxo.vout} with ${utxo.value} BTC`)
    selected.push(utxo)
    total += utxo.value
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
 * @param accountExtendedKey - Account extended key
 * @param targetAddress - Target address to find
 * @param gapLimit - Maximum gap of unused addresses to scan (default 20)
 * @returns Object with address type and index, or null if not found
 */
async function findAddressIndex(
  accountExtendedKey: Uint8Array,
  targetAddress: string,
  gapLimit: number = 20,
): Promise<{ type: 'receiving' | 'change'; index: number } | null> {
  // Check receiving addresses (external chain, index 0)
  const receivingExtendedKey = deriveChildPrivateKey(accountExtendedKey, 0)

  for (let i = 0; i < gapLimit * 2; i++) {
    const addressExtendedKey = deriveChildPrivateKey(receivingExtendedKey, i)
    const { privateKey } = splitRootExtendedKey(addressExtendedKey)
    const publicKey = createPublicKey(privateKey)
    const address = createSegwitAddress(publicKey)

    if (address === targetAddress) {
      return { type: 'receiving', index: i }
    }
  }

  // Check change addresses (internal chain, index 1)
  const changeExtendedKey = deriveChildPrivateKey(accountExtendedKey, 1)

  for (let i = 0; i < gapLimit * 2; i++) {
    const addressExtendedKey = deriveChildPrivateKey(changeExtendedKey, i)
    const { privateKey } = splitRootExtendedKey(addressExtendedKey)
    const publicKey = createPublicKey(privateKey)
    const address = createSegwitAddress(publicKey)

    if (address === targetAddress) {
      return { type: 'change', index: i }
    }
  }

  return null
}

/**
 * Processes txHistory to extract transactions and addresses
 * @param txHistory - Array of TxHistory
 * @returns Object with allTransactions, allAddresses, uniqueTransactions, uniqueAddresses
 */
export function processTxHistory(txHistory: TxHistory[]) {
  // Extract all transactions and addresses
  const allTransactions: any[] = []
  const allAddresses: string[] = []

  for (const addressData of txHistory) {
    allAddresses.push(addressData.receivingAddress, addressData.changeAddress)
    allTransactions.push(...addressData.txs)
  }

  // Remove duplicate transactions
  const uniqueTransactions = Array.from(new Map(allTransactions.map(tx => [tx.txid, tx])).values())

  const uniqueAddresses = [...new Set(allAddresses)]

  return {
    allTransactions,
    allAddresses,
    uniqueTransactions,
    uniqueAddresses,
  }
}

/**
 * Calculates address cache from txHistory
 * @param txHistory - Array of TxHistory
 * @returns Object with usedReceivingAddresses, usedChangeAddresses
 */
export function calculateAddressCache(txHistory: TxHistory[]) {
  const usedReceivingAddresses: UsedAddress[] = txHistory
    .filter(h => h.receivingAddress && h.txs.length > 0)
    .map(h => ({
      address: h.receivingAddress,
      index: h.index,
      type: 'receiving' as const,
      transactions: h.txs,
    }))

  const usedChangeAddresses: UsedAddress[] = txHistory
    .filter(h => h.changeAddress && h.txs.length > 0)
    .map(h => ({
      address: h.changeAddress,
      index: h.index,
      type: 'change' as const,
      transactions: h.txs,
    }))

  return {
    usedReceivingAddresses,
    usedChangeAddresses,
  }
}

/**
 * Finds the next unused receiving address
 * @param rootExtendedKey - Root extended key
 * @param usedAddresses - Set of used addresses
 * @returns Next unused address or empty string if not found
 */
export function findNextUnusedAddress(
  rootExtendedKey: Uint8Array,
  usedAddresses: Set<string>,
): string {
  const purposeIndex = createHardenedIndex(84)
  const purposeExtendedKey = deriveChildPrivateKey(rootExtendedKey, purposeIndex)
  const coinTypeIndex = createHardenedIndex(0)
  const coinTypeExtendedKey = deriveChildPrivateKey(purposeExtendedKey, coinTypeIndex)
  const accountIndex = createHardenedIndex(0)
  const accountExtendedKey = deriveChildPrivateKey(coinTypeExtendedKey, accountIndex)
  const receivingExtendedKey = deriveChildPrivateKey(accountExtendedKey, 0)

  let index = 0
  const maxCheck = 100
  while (index < maxCheck) {
    const addressIndexExtendedKey = deriveChildPrivateKey(receivingExtendedKey, index)
    const { privateKey } = splitRootExtendedKey(addressIndexExtendedKey)
    const publicKey = createPublicKey(privateKey)
    const address = createSegwitAddress(publicKey)
    if (!usedAddresses.has(address)) {
      return address
    }
    index++
  }
  return ''
}
