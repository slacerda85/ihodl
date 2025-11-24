import { Connection } from '../models/network'
import { FriendlyTx, MerkleProof, Tx, Utxo } from '../models/tx'
import { getTransactions, getBlockHash, getMerkleProof } from '@/core/lib/electrum'
import { sha256 } from '@noble/hashes/sha2'
import { uint8ArrayFromHex, uint8ArrayToHex, concatUint8Arrays } from '../lib/utils'
import { AddressCollection, AddressDetails, Change } from '../models/address'

interface TransactionServiceInterface {
  deduplicateTxs(txs: Tx[]): Tx[]
  getTransactions(address: string, connection: Connection): Promise<Tx[]>
  getUtxos(addresses: string[], txs: Tx[]): Utxo[]
  verifyTransaction(
    tx: Tx,
    connection: Connection,
  ): Promise<{
    valid: boolean
    proof?: MerkleProof
  }>
  getFriendlyTxs(addresses: AddressDetails[]): FriendlyTx[]
  calculateBalance(addresses: AddressDetails[]): { balance: number; utxos: Utxo[] }
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
            scriptPubKey: vout.scriptPubKey.hex,
            amount: vout.value, // convert BTC to sats
            confirmations: tx.confirmations || 0,
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

  async verifyTransaction(
    tx: Tx,
    connection: Connection,
  ): Promise<{
    valid: boolean
    proof?: MerkleProof
  }> {
    try {
      const height = tx.height
      if (!height || height <= 0) {
        console.log('Transaction not confirmed')
        return { valid: false }
      }

      // Get the block header hex
      const headerResponse = await getBlockHash(height, connection)
      const headerHex = headerResponse.result
      if (!headerHex || headerHex.length !== 160) {
        console.log('Block header not found or invalid')
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
    const sha256d = (data: Uint8Array) => sha256(sha256(data))

    let h = uint8ArrayFromHex(txHash) // txid is big-endian
    let index = leafPos

    for (const item of merkleBranch) {
      const itemBytes = uint8ArrayFromHex(item)
      let inner: Uint8Array
      if (index & 1) {
        inner = concatUint8Arrays([itemBytes, h])
      } else {
        inner = concatUint8Arrays([h, itemBytes])
      }
      h = sha256d(inner)
      index >>= 1
    }

    return uint8ArrayToHex(h) // return big-endian
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
}
