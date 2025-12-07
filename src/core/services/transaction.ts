import { Connection } from '../models/network'
import { FriendlyTx, MerkleProof, Tx, Utxo } from '../models/transaction'
import {
  getTransactions,
  getTransaction,
  getBlockHash,
  getBlockHeader,
  getMerkleProof,
  getRecommendedFeeRates,
  getMempoolTransactions,
} from '@/core/lib/electrum'
// import { sha256 } from '@noble/hashes/sha2.js'
import { hexToUint8Array, uint8ArrayToHex, concatUint8Arrays } from '../lib/utils'
import { AddressDetails, Change } from '../models/address'
import {
  buildBatchTransactions,
  buildTransaction,
  signTransaction,
  sendTransaction,
  selectCoinsAdvanced,
  bumpRBFFee,
  canBumpFee,
  calculateEffectiveFeeRate,
  canUseCPFP,
  suggestCPFP,
  sendBatchTransactions,
  estimateTransactionFee,
  estimateOptimalFeeRate,
  buildBatchTransaction,
} from '../lib/transactions'
import { createP2TRAddress } from '../lib/address'
import SeedService from './seed'
import KeyService from './key'
import TransactionRepository from '../repositories/transactions'
import { hash256 } from '../lib/crypto'
import { createEntropy } from '../lib/crypto'

// Lazy import to avoid circular dependency
type WalletServiceType = import('./wallet').default

function getWalletService(): WalletServiceType {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return new (require('./wallet').default)()
}

interface TransactionServiceInterface {
  deduplicateTxs(txs: Tx[]): Tx[]
  getTransactions(address: string, connection: Connection): Promise<Tx[]>
  getTransaction(txid: string, connection: Connection): Promise<Tx | null>
  getUtxos(addresses: string[], txs: Tx[]): Utxo[]
  buildTransaction({
    recipientAddress,
    amount,
    feeRate,
    changeAddress,
    utxos,
  }: {
    recipientAddress: string
    amount: number
    feeRate: number
    changeAddress: string
    utxos: Utxo[]
  }): Promise<{
    transaction: any
    inputs: any
    outputs: any
    fee: number
    changeAmount: number
  }>
  verifyTransaction(
    tx: Tx,
    connection: Connection,
  ): Promise<{
    valid: boolean
    proof?: MerkleProof
  }>
  getFriendlyTxs(addresses: AddressDetails[]): FriendlyTx[]
  calculateBalance(addresses: AddressDetails[]): { balance: number; utxos: Utxo[] }
  getFeeRates(connection: Connection): Promise<{
    slow: number
    normal: number
    fast: number
    urgent: number
  }>
  savePendingTransaction(params: {
    txid: string
    walletId: string
    recipientAddress: string
    amount: number
    fee: number
    txHex: string
    memo?: string
  }): Promise<void>
  readPendingTransactions(): Tx[]
  deletePendingTransaction(txid: string): void
  getMempoolTransactions(addresses: string[], connection?: Connection): Promise<Tx[]>
  // Advanced coin selection
  selectCoinsAdvanced(
    utxos: Utxo[],
    options: {
      targetAmount: number
      feeRate: number
      algorithm?:
        | 'largest_first'
        | 'smallest_first'
        | 'branch_and_bound'
        | 'random'
        | 'privacy_focused'
      dustThreshold?: number
      maxInputs?: number
      avoidAddressReuse?: boolean
      consolidateSmallUtxos?: boolean
    },
  ): {
    selectedUtxos: Utxo[]
    totalAmount: number
    fee: number
    changeAmount: number
    efficiency: number
    privacyScore: number
  }
  // Taproot address generation
  generateTaprootAddress(internalKey?: Uint8Array): string
  // RBF transaction building
  buildRBFTransaction(params: {
    recipientAddress: string
    amount: number
    feeRate: number
    utxos: Utxo[]
    changeAddress: string
  }): Promise<{
    transaction: any
    inputs: any
    outputs: any
    fee: number
    changeAmount: number
    isRBFEnabled: boolean
  }>
  // RBF fee bumping
  bumpRBFFee(params: {
    originalTxHex: string
    newFeeRate: number
    utxos: Utxo[]
    changeAddress: string
    recipientAddress: string
    amount: number
  }): Promise<{
    replacementTransaction: any
    inputs: any
    outputs: any
    newFee: number
    changeAmount: number
    isRBFEnabled: boolean
  }>
  // Check if transaction can be RBF'd
  canBumpFee(txHex: string): boolean
  // CPFP effective fee rate calculation
  calculateEffectiveFeeRate(
    parentFee: number,
    parentSize: number,
    childFees?: number[],
    childSizes?: number[],
  ): number
  // Check if CPFP can be used
  canUseCPFP(txHex: string, utxos: Utxo[]): boolean
  // Suggest CPFP transaction
  suggestCPFP(params: {
    parentTxHex: string
    targetFeeRate: number
    utxos: Utxo[]
    changeAddress: string
    recipientAddress?: string
  }): Promise<{
    cpfpTransaction: any
    inputs: any
    outputs: any
    cpfpFee: number
    effectiveFeeRate: number
  }>
  // Batch transaction building
  buildBatchTransactions(
    batchParams: {
      recipientAddress: string
      amount: number
      feeRate: number
      utxos: Utxo[]
      changeAddress: string
      coinSelectionAlgorithm?: any
      avoidAddressReuse?: boolean
      consolidateSmallUtxos?: boolean
      enableRBF?: boolean
    }[],
  ): Promise<{
    transactions: any[]
    totalFee: number
    totalSize: number
  }>
  // Single batch transaction building (combines multiple outputs in one tx)
  buildBatchTransaction(params: {
    transactions: Array<{
      recipientAddress: string
      amount: number
    }>
    feeRate: number
    utxos: Utxo[]
    changeAddress: string
    coinSelectionAlgorithm?: any
    avoidAddressReuse?: boolean
    consolidateSmallUtxos?: boolean
    enableRBF?: boolean
  }): Promise<{
    transaction: any
    inputs: any
    outputs: any
    fee: number
    changeAmount: number
  }>
  // Batch transaction sending
  sendBatchTransactions(
    batchParams: {
      transaction: any
      connection: any
    }[],
  ): Promise<{
    results: any[]
    totalFee: number
  }>
  // Fee estimation
  estimateTransactionFee(txSize: number, feeRate: number): number
  // Optimal fee rate estimation
  estimateOptimalFeeRate(
    targetBlocks: number,
    currentFeeRates: { slow: number; normal: number; fast: number; urgent: number },
  ): number
}

export default class TransactionService implements TransactionServiceInterface {
  deduplicateTxs(txs: Tx[]): Tx[] {
    const txMap: Record<string, Tx> = {}
    for (const tx of txs) {
      if (!txMap[tx.txid] || (tx.confirmations || 0) > (txMap[tx.txid].confirmations || 0)) {
        txMap[tx.txid] = tx
      }
    }
    return Object.values(txMap)
  }

  private deduplicateAddresses(addresses: string[]): string[] {
    return Array.from(new Set(addresses))
  }

  async getTransactions(address: string, connection: Connection): Promise<Tx[]> {
    // fetch
    const transactions = await getTransactions(address, connection)
    // validate
    const validatedTransactions: Tx[] = []
    for (const tx of transactions) {
      const verification = await this.verifyTransaction(tx, connection)
      if (verification.valid) {
        // attach proof
        tx.proof = verification.proof
        validatedTransactions.push(tx)
      } else {
        console.warn(`Transaction ${tx.txid} failed verification and will be excluded.`)
      }
    }
    return validatedTransactions
  }

  async getTransaction(txid: string, connection: Connection): Promise<Tx | null> {
    try {
      const { result: tx } = await getTransaction(txid, true, connection)
      const verification = await this.verifyTransaction(tx, connection)
      if (verification.valid) {
        tx.proof = verification.proof
        return tx
      }
      return null
    } catch (error) {
      console.error(`Error fetching transaction ${txid}:`, error)
      return null
    }
  }

  getUtxos(addresses: string[], txs: Tx[]): Utxo[] {
    // first, deduplicate txs by txid selecting the one with most confirmations
    const uniqueTxs = this.deduplicateTxs(txs)
    // deduplicate addresses
    const uniqueAddresses = this.deduplicateAddresses(addresses)

    // extract UTXOs
    const utxos: Utxo[] = []
    for (const tx of uniqueTxs) {
      const spentOutpoints = new Set(tx.vin.map(vin => `${vin.txid}:${vin.vout}`))
      tx.vout.forEach(vout => {
        const outpoint = `${tx.txid}:${vout.n}`
        if (uniqueAddresses.includes(vout.scriptPubKey.address) && !spentOutpoints.has(outpoint)) {
          utxos.push({
            txid: tx.txid,
            vout: vout.n,
            address: vout.scriptPubKey.address,
            scriptPubKey: vout.scriptPubKey,
            amount: vout.value, // convert BTC to sats
            confirmations: tx.confirmations || 0,
            blocktime: tx.blocktime,
            isSpent: false,
          })
        }
      })
    }

    // subtract spent UTXOs
    const unspentUtxos = utxos.filter(utxo => {
      return !txs.some(tx => tx.vin.some(vin => vin.txid === utxo.txid && vin.vout === utxo.vout))
    })

    return unspentUtxos
  }

  async buildTransaction({
    recipientAddress,
    amount,
    feeRate,
    utxos,
    changeAddress,
    coinSelectionAlgorithm,
    avoidAddressReuse,
    consolidateSmallUtxos,
    enableRBF,
  }: {
    recipientAddress: string
    amount: number
    feeRate: number
    utxos: Utxo[]
    changeAddress: string
    coinSelectionAlgorithm?:
      | 'largest_first'
      | 'smallest_first'
      | 'branch_and_bound'
      | 'random'
      | 'privacy_focused'
    avoidAddressReuse?: boolean
    consolidateSmallUtxos?: boolean
    enableRBF?: boolean
  }): Promise<{
    transaction: any
    inputs: any
    outputs: any
    fee: number
    changeAmount: number
  }> {
    const transaction = await buildTransaction({
      recipientAddress,
      amount,
      feeRate,
      utxos,
      changeAddress,
      coinSelectionAlgorithm: coinSelectionAlgorithm as any,
      avoidAddressReuse,
      consolidateSmallUtxos,
      enableRBF,
    })

    return transaction
  }

  async buildBatchTransaction({
    transactions,
    feeRate,
    utxos,
    changeAddress,
    coinSelectionAlgorithm,
    avoidAddressReuse,
    consolidateSmallUtxos,
    enableRBF,
  }: {
    transactions: Array<{
      recipientAddress: string
      amount: number
    }>
    feeRate: number
    utxos: Utxo[]
    changeAddress: string
    coinSelectionAlgorithm?:
      | 'largest_first'
      | 'smallest_first'
      | 'branch_and_bound'
      | 'random'
      | 'privacy_focused'
    avoidAddressReuse?: boolean
    consolidateSmallUtxos?: boolean
    enableRBF?: boolean
  }): Promise<{
    transaction: any
    inputs: any
    outputs: any
    fee: number
    changeAmount: number
  }> {
    const transaction = await buildBatchTransaction({
      transactions,
      feeRate,
      utxos,
      changeAddress,
      coinSelectionAlgorithm: coinSelectionAlgorithm as any,
      avoidAddressReuse,
      consolidateSmallUtxos,
      enableRBF,
    })

    return transaction
  }

  async verifyTransaction(
    tx: Tx,
    connection: Connection,
  ): Promise<{
    valid: boolean
    proof?: MerkleProof
  }> {
    const height = tx.height
    if (!height || height <= 0) {
      console.log('Transaction not confirmed')
      return { valid: false }
    }

    try {
      // Get the block header hex
      const headerResponse = await getBlockHeader(height, connection)
      const headerHex = headerResponse.result
      if (!headerHex || headerHex.length !== 160) {
        console.log('Block header not found or invalid')
        return { valid: false }
      }

      // Get the block hash
      const blockHashResponse = await getBlockHash(height, connection)
      const blockHash = blockHashResponse.result

      // Compute the block hash from the header
      const headerBytes = hexToUint8Array(headerHex)
      const computedBlockHash = uint8ArrayToHex(hash256(headerBytes))

      // Verify the header is correct
      if (computedBlockHash !== blockHash) {
        console.log('Block header hash mismatch')
        return { valid: false }
      }

      // Extract Merkle root from header (bytes 36-67, chars 72-135)
      const merkleRoot = headerHex.slice(72, 136)

      // Get the Merkle proof
      const merkleResponse = await getMerkleProof(tx.txid, height, connection)
      const merkle = merkleResponse.result
      if (!merkle || !merkle.merkle) {
        console.log('Merkle proof not found')
        return { valid: false }
      }

      // Compute the Merkle root from the proof
      const computedRoot = this.computeMerkleRoot(merkle.merkle, tx.txid, merkle.pos)

      // Compare with the block's Merkle root
      const isValid = computedRoot === merkleRoot
      if (!isValid) {
        console.log('Merkle root mismatch')
        return { valid: false }
      }

      return {
        valid: true,
        proof: {
          merkle: merkle.merkle,
          pos: merkle.pos,
        },
      }
    } catch (error) {
      console.error('Error verifying transaction:', error)
      return { valid: false }
    }
  }

  private computeMerkleRoot(merkleBranch: string[], txHash: string, leafPos: number): string {
    // txHash is big-endian hex, convert to little-endian bytes (as per Bitcoin/Electrum convention)
    let h = hexToUint8Array(txHash).reverse()
    let index = leafPos

    // Process each level of the Merkle branch, starting from the leaf
    for (const item of merkleBranch) {
      // item is big-endian hex, convert to little-endian bytes
      const itemBytes = hexToUint8Array(item).reverse()
      let inner: Uint8Array
      // Determine pairing order based on the position index
      // If index is odd, pair item (sibling) first, then h (current hash)
      // If index is even, pair h first, then item
      if (index & 1) {
        inner = concatUint8Arrays([itemBytes, h])
      } else {
        inner = concatUint8Arrays([h, itemBytes])
      }
      // Compute double SHA256 hash for the inner node
      h = hash256(inner)
      // Move to the next level in the tree
      index >>= 1
    }

    // Return the final Merkle root as little-endian hex
    return uint8ArrayToHex(h)
  }

  private reverseHexBytes(hex: string): string {
    return hex.match(/.{2}/g)?.reverse().join('') || ''
  }

  getFriendlyTxs(addresses: AddressDetails[]): FriendlyTx[] {
    const utxoKeys = this.collectUtxoKeys(addresses)
    const allTxs = this.collectAllTxs(addresses)
    const uniqueTxs = this.deduplicateTxs(allTxs)
    const { receiving: receivingAddresses, change: changeAddresses } =
      this.collectAddresses(addresses)
    return uniqueTxs.map(tx =>
      this.calculateTxDetails(tx, utxoKeys, receivingAddresses, changeAddresses, uniqueTxs),
    )
  }

  calculateBalance(addresses: AddressDetails[]): { balance: number; utxos: Utxo[] } {
    const allAddresses = addresses.map(addr => addr.address)
    const allTxs = this.collectAllTxs(addresses)
    const utxos = this.getUtxos(allAddresses, allTxs)
    const balance = utxos.reduce((sum, utxo) => sum + utxo.amount, 0)
    return { balance, utxos }
  }

  private collectUtxoKeys(addresses: AddressDetails[]): Set<string> {
    const utxoKeys = new Set<string>()
    for (const addrDetail of addresses) {
      for (const tx of addrDetail.txs) {
        for (const vout of tx.vout) {
          if (vout.scriptPubKey.address === addrDetail.address) {
            utxoKeys.add(`${tx.txid}:${vout.n}`)
          }
        }
      }
    }
    return utxoKeys
  }

  private collectAllTxs(addresses: AddressDetails[]): Tx[] {
    const allTxs: Tx[] = []
    for (const addrDetail of addresses) {
      allTxs.push(...addrDetail.txs)
    }
    return allTxs
  }

  private collectAddresses(addresses: AddressDetails[]): {
    receiving: Set<string>
    change: Set<string>
  } {
    const receiving = new Set<string>()
    const change = new Set<string>()
    for (const addrDetail of addresses) {
      if (addrDetail.derivationPath.change === Change.Receiving) {
        receiving.add(addrDetail.address)
      } else if (addrDetail.derivationPath.change === Change.Change) {
        change.add(addrDetail.address)
      }
    }
    return { receiving, change }
  }

  private calculateTxDetails(
    tx: Tx,
    utxoKeys: Set<string>,
    receivingAddresses: Set<string>,
    changeAddresses: Set<string>,
    uniqueTxs: Tx[],
  ): FriendlyTx {
    let totalReceived = 0
    let totalSent = 0
    let fromAddress = ''
    let toAddress = ''
    const outputTotal = tx.vout.reduce((sum, vout) => sum + vout.value, 0)

    // total received in receiving addresses
    for (const vout of tx.vout) {
      if (receivingAddresses.has(vout.scriptPubKey.address)) {
        totalReceived += vout.value
        toAddress = vout.scriptPubKey.address
      }
    }

    // total sent from our utxos
    for (const vin of tx.vin) {
      const utxoKey = `${vin.txid}:${vin.vout}`
      if (utxoKeys.has(utxoKey)) {
        const spentTx = uniqueTxs.find(t => t.txid === vin.txid)
        if (spentTx) {
          const spentVout = spentTx.vout.find(v => v.n === vin.vout)
          if (spentVout) {
            totalSent += spentVout.value
            fromAddress = spentVout.scriptPubKey.address
            toAddress = spentVout.scriptPubKey.address
          }
        }
      }
    }

    const fee = totalSent > 0 ? totalSent - outputTotal : null

    let type: FriendlyTx['type']
    let amount: number
    let status: FriendlyTx['status']

    if (totalReceived > 0 && totalSent === 0) {
      type = 'received'
      amount = totalReceived
      status = 'confirmed'
    } else if (totalSent > 0 && totalReceived === 0) {
      type = 'sent'
      amount = outputTotal // amount sent to recipients
      status = 'confirmed'
      // Define toAddress as the first external output
      for (const vout of tx.vout) {
        if (
          !receivingAddresses.has(vout.scriptPubKey.address) &&
          !changeAddresses.has(vout.scriptPubKey.address)
        ) {
          toAddress = vout.scriptPubKey.address
          break
        }
      }
    } else if (totalSent > 0 && totalReceived > 0) {
      type = 'self'
      amount = totalReceived // net received
      status = 'confirmed'
    } else {
      type = 'sent'
      amount = 0
      status = tx.confirmations && tx.confirmations > 0 ? 'confirmed' : 'pending'
    }

    const date = tx.time ? new Date(tx.time * 1000).toISOString() : ''

    return {
      txid: tx.txid,
      date,
      type,
      fromAddress,
      toAddress,
      amount,
      status,
      fee,
      confirmations: tx.confirmations || 0,
    }
  }

  async signTransaction({ transaction, inputs }: { transaction: any; inputs: any }): Promise<{
    signedTransaction: any
    txHex: string
  }> {
    const walletService = getWalletService()
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for signing transaction')
    }
    const seedService = new SeedService()
    const seed = seedService.getSeed(walletId)
    const keyService = new KeyService()
    const accountKey = keyService.deriveAccountKey(seed)

    return await signTransaction({
      transaction,
      inputs,
      accountKey,
    })
  }

  async sendTransaction({
    signedTransaction,
    txHex,
  }: {
    signedTransaction: any
    txHex: string
  }): Promise<{
    success: boolean
    txid?: string
    error?: string
  }> {
    return await sendTransaction({
      signedTransaction,
      txHex,
    })
  }

  async savePendingTransaction({
    txid,
    recipientAddress,
    amount,
    fee,
    txHex,
    memo,
  }: {
    txid: string
    recipientAddress: string
    amount: number
    fee: number
    txHex: string
    memo?: string
  }): Promise<void> {
    const pendingTx: Tx = {
      txid,
      hash: txid,
      hex: txHex,
      confirmations: 0,
      height: 0,
      time: Math.floor(Date.now() / 1000),
      in_active_chain: false,
      size: txHex.length / 2,
      vsize: txHex.length / 2,
      weight: (txHex.length / 2) * 4,
      version: 2,
      locktime: 0,
      blockhash: '',
      blocktime: 0,
      vin: [], // Não temos inputs detalhados aqui
      vout: [
        {
          n: 0,
          value: amount,
          scriptPubKey: {
            asm: '',
            hex: '',
            reqSigs: 1,
            type: 'scripthash',
            address: recipientAddress,
          },
        },
      ],
    }
    const walletService = getWalletService()
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for saving pending transaction')
    }
    const transactionRepository = TransactionRepository
    transactionRepository.savePendingTransaction(walletId, pendingTx)
  }

  readPendingTransactions(): Tx[] {
    const walletService = getWalletService()
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for reading pending transactions')
    }
    const transactionRepository = TransactionRepository
    return transactionRepository.readPendingTransactions(walletId)
  }

  deletePendingTransaction(txid: string): void {
    const walletService = getWalletService()
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for deleting pending transaction')
    }
    const transactionRepository = TransactionRepository
    transactionRepository.deletePendingTransaction(walletId, txid)
  }

  async getFeeRates(connection: Connection): Promise<{
    slow: number
    normal: number
    fast: number
    urgent: number
  }> {
    const feeRate = await getRecommendedFeeRates(connection)
    return feeRate
  }

  /**
   * Busca transações pendentes na mempool para uma lista de endereços.
   * Usado para detectar depósitos recebidos que ainda não foram confirmados.
   * @param addresses Lista de endereços para verificar na mempool
   * @param connection Conexão Electrum opcional (será criada se não fornecida)
   * @returns Lista de transações pendentes na mempool
   */
  async getMempoolTransactions(addresses: string[], connection?: Connection): Promise<Tx[]> {
    try {
      console.log(`[TransactionService] Checking mempool for ${addresses.length} addresses`)
      const mempoolTxs = await getMempoolTransactions(addresses, connection)

      // Deduplicar transações da mempool
      const deduplicated = this.deduplicateTxs(mempoolTxs)
      console.log(`[TransactionService] Found ${deduplicated.length} mempool transactions`)

      return deduplicated
    } catch (error) {
      console.error('[TransactionService] Error fetching mempool transactions:', error)
      return []
    }
  }

  /**
   * Seleção avançada de coins com múltiplos algoritmos
   */
  selectCoinsAdvanced(
    utxos: Utxo[],
    options: {
      targetAmount: number
      feeRate: number
      algorithm?:
        | 'largest_first'
        | 'smallest_first'
        | 'branch_and_bound'
        | 'random'
        | 'privacy_focused'
      dustThreshold?: number
      maxInputs?: number
      avoidAddressReuse?: boolean
      consolidateSmallUtxos?: boolean
    },
  ): {
    selectedUtxos: Utxo[]
    totalAmount: number
    fee: number
    changeAmount: number
    efficiency: number
    privacyScore: number
  } {
    return selectCoinsAdvanced(utxos, {
      targetAmount: options.targetAmount,
      feeRate: options.feeRate,
      algorithm: options.algorithm as any,
      dustThreshold: options.dustThreshold,
      maxInputs: options.maxInputs,
      avoidAddressReuse: options.avoidAddressReuse,
      consolidateSmallUtxos: options.consolidateSmallUtxos,
    })
  }

  /**
   * Gera um endereço Taproot
   */
  generateTaprootAddress(internalKey?: Uint8Array): string {
    if (!internalKey) {
      // Gera uma chave aleatória usando a função existente
      const randomKey = createEntropy(32)
      return createP2TRAddress(randomKey)
    }
    return createP2TRAddress(internalKey)
  }

  /**
   * Constrói uma transação com RBF (Replace-By-Fee) habilitado
   */
  async buildRBFTransaction(params: {
    recipientAddress: string
    amount: number
    feeRate: number
    utxos: Utxo[]
    changeAddress: string
  }): Promise<{
    transaction: any
    inputs: any
    outputs: any
    fee: number
    changeAmount: number
    isRBFEnabled: boolean
  }> {
    const result = await buildTransaction({
      recipientAddress: params.recipientAddress,
      amount: params.amount,
      feeRate: params.feeRate,
      utxos: params.utxos,
      changeAddress: params.changeAddress,
      enableRBF: true,
    })

    return {
      ...result,
      isRBFEnabled: true,
    }
  }

  /**
   * Aumenta a taxa de uma transação RBF existente
   */
  async bumpRBFFee(params: {
    originalTxHex: string
    newFeeRate: number
    utxos: Utxo[]
    changeAddress: string
    recipientAddress: string
    amount: number
  }): Promise<{
    replacementTransaction: any
    inputs: any
    outputs: any
    newFee: number
    changeAmount: number
    isRBFEnabled: boolean
  }> {
    return await bumpRBFFee({
      originalTxHex: params.originalTxHex,
      newFeeRate: params.newFeeRate,
      utxos: params.utxos,
      changeAddress: params.changeAddress,
      recipientAddress: params.recipientAddress,
      amount: params.amount,
    })
  }

  /**
   * Verifica se uma transação pode ter sua taxa aumentada (RBF)
   */
  canBumpFee(txHex: string): boolean {
    return canBumpFee(txHex)
  }

  /**
   * Calcula a taxa efetiva de uma transação considerando filhos (CPFP)
   */
  calculateEffectiveFeeRate(
    parentFee: number,
    parentSize: number,
    childFees: number[] = [],
    childSizes: number[] = [],
  ): number {
    return calculateEffectiveFeeRate(parentFee, parentSize, childFees, childSizes)
  }

  /**
   * Verifica se CPFP pode ser usado para uma transação
   */
  canUseCPFP(txHex: string, utxos: Utxo[]): boolean {
    return canUseCPFP(txHex, utxos)
  }

  /**
   * Sugere uma transação CPFP para acelerar uma transação pai
   */
  async suggestCPFP(params: {
    parentTxHex: string
    targetFeeRate: number
    utxos: Utxo[]
    changeAddress: string
    recipientAddress?: string
  }): Promise<{
    cpfpTransaction: any
    inputs: any
    outputs: any
    cpfpFee: number
    effectiveFeeRate: number
  }> {
    return await suggestCPFP(params)
  }

  /**
   * Constrói múltiplas transações em lote
   */
  async buildBatchTransactions(
    batchParams: {
      recipientAddress: string
      amount: number
      feeRate: number
      utxos: Utxo[]
      changeAddress: string
      coinSelectionAlgorithm?: any
      avoidAddressReuse?: boolean
      consolidateSmallUtxos?: boolean
      enableRBF?: boolean
    }[],
  ): Promise<{
    transactions: any[]
    totalFee: number
    totalSize: number
  }> {
    return await buildBatchTransactions(batchParams)
  }

  /**
   * Envia múltiplas transações em lote
   */
  async sendBatchTransactions(
    batchParams: {
      transaction: any
      connection: any
    }[],
  ): Promise<{
    results: any[]
    totalFee: number
  }> {
    return await sendBatchTransactions(batchParams)
  }

  /**
   * Estima taxa de transação baseada no tamanho e taxa
   */
  estimateTransactionFee(txSize: number, feeRate: number): number {
    return estimateTransactionFee(txSize, feeRate)
  }

  /**
   * Estima taxa ótima para tempo alvo de confirmação
   */
  estimateOptimalFeeRate(
    targetBlocks: number,
    currentFeeRates: { slow: number; normal: number; fast: number; urgent: number },
  ): number {
    return estimateOptimalFeeRate(targetBlocks, currentFeeRates)
  }
}

/** Singleton instance for stateless operations */
export const transactionService = new TransactionService()
