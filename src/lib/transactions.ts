import { CoinType, Purpose } from '@/models/account'
import {
  createHardenedIndex,
  createPublicKey,
  deriveChildPrivateKey,
  splitRootExtendedKey,
} from '@/lib/key'
import { connect, getTransactions } from './electrum'
import { createSegwitAddress } from './address'
import { Tx, TxHistory, UTXO, WalletTransaction } from '@/models/transaction'

interface GetTxHistoryParams {
  extendedKey: Uint8Array
  purpose?: Purpose
  coinType?: CoinType
  accountStartIndex?: number
  gapLimit?: number
}

interface GetTxHistoryResponse {
  balance: number
  utxos: {
    address: string
    tx: Tx[]
  }[]
  txHistory: TxHistory[]
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
async function getTxHistory({
  extendedKey,
  purpose = 84,
  coinType = 0,
  accountStartIndex = 0,
  gapLimit = 20,
  // multiAccount = false,
}: GetTxHistoryParams): Promise<GetTxHistoryResponse> {
  try {
    const txHistory: TxHistory[] = []

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

    // receiving (change 1)
    const changeIndex = 1
    const changeExtendedKey = deriveChildPrivateKey(accountExtendedKey, changeIndex)

    // const txHistory: TxHistory[] = []
    let consecutiveUnused = 0
    let index = 0

    // connect to electrum server
    const socket = await connect()

    // Continue scanning until we find gapLimit consecutive unused addresses
    while (consecutiveUnused < gapLimit) {
      // derive address index
      const addressIndexExtendedKey = deriveChildPrivateKey(receivingExtendedKey, index)
      const { privateKey } = splitRootExtendedKey(addressIndexExtendedKey)
      const addressIndexPublicKey = createPublicKey(privateKey)
      const receivingAddress = createSegwitAddress(addressIndexPublicKey)

      // change address
      const changeAddressIndexExtendedKey = deriveChildPrivateKey(changeExtendedKey, index)
      const { privateKey: changePrivateKey } = splitRootExtendedKey(changeAddressIndexExtendedKey)
      const changeAddressIndexPublicKey = createPublicKey(changePrivateKey)
      const changeAddress = createSegwitAddress(changeAddressIndexPublicKey)

      const transactions = await getTransactions(receivingAddress, socket)
      // const transactions = await api.transactions.getTransactions(address)
      if (transactions.length > 0) {
        txHistory.push({
          receivingAddress,
          changeAddress,
          index,
          txs: transactions, // Store transactions associated with the address
        })
        // Reset consecutive unused counter when we find a used address
        consecutiveUnused = 0
      } else {
        consecutiveUnused++
      }

      index++
    }

    const { balance, utxos } = calculateBalance(txHistory)

    return { balance, utxos, txHistory }
  } catch (error) {
    throw new Error(`Failed to discover accounts: ${(error as Error).message}`)
  }
}

function calculateBalance(txHistory: TxHistory[]): {
  balance: number
  utxos: { address: string; tx: Tx[] }[]
} {
  let balance = 0
  const utxos: { address: string; tx: Tx[] }[] = []

  txHistory.forEach(address => {
    const { receivingAddress, txs } = address

    const utxos = txs.filter(tx => {
      // if the array of txs has any tx that has a vin that matches the txid of the current tx, its already spent
      if (txs.some(t => t.vin.some(v => v.txid === tx.txid))) {
        return false
      }
      // if the tx is not spent, add it to the utxos array
      return true
    })

    // calculate balance for each address
    const addressBalance = utxos.reduce((acc, tx) => {
      const vout = tx.vout.find(v => v.scriptPubKey.address === receivingAddress)
      if (vout) {
        return acc + vout.value
      }
      return acc
    }, 0)

    balance += addressBalance
  })

  return {
    balance,
    utxos,
  }
}

type GetWalletAddressesRequest = {
  extendedKey: Uint8Array
  purpose: Purpose
  coinType: CoinType
  accountStartIndex?: number
  gapLimit?: number
}

/* async function getWalletAddresses({
  extendedKey,
  purpose = 84,
  coinType = 0,
  accountStartIndex = 0,
  gapLimit = 20,
  // multiAccount = false,
}: GetWalletAddressesRequest): string[] {
  try {
  } catch (error) {}
} */
/* 
async function processWalletTransactions(walletAddresses: Set<string>): Promise<{
  balance: number
  utxos: UTXO[]
  walletTransactions: WalletTransaction[]
}> {
  // Assume existing code fetches allTxs and builds allTxsMap, calculates balance and utxos
  // For example:
  // const allTxs = await fetchTransactions(walletAddresses);
  // const allTxsMap = new Map(allTxs.map(tx => [tx.txid, tx]));
  // const { balance, utxos } = calculateBalanceAndUtxos(allTxs, walletAddresses);

  const walletTransactions: WalletTransaction[] = allTxs.map(tx => {
    // Determine if transaction spends wallet funds (i.e., 'sent')
    const isSent = tx.vin.some(vin => {
      const prevTx = allTxsMap.get(vin.txid)
      return prevTx && walletAddresses.has(prevTx.vout[vin.vout].scriptPubKey.address)
    })
    const type: 'sent' | 'received' = isSent ? 'sent' : 'received'

    // Calculate amount based on type
    const amount = tx.vout.reduce((sum, vout) => {
      const address = vout.scriptPubKey.address
      if (
        (type === 'received' && walletAddresses.has(address)) ||
        (type === 'sent' && !walletAddresses.has(address))
      ) {
        return sum + vout.value
      }
      return sum
    }, 0)

    // Set fromAddress
    let fromAddress = type === 'received' ? 'External' : ''
    if (type === 'sent') {
      for (const vin of tx.vin) {
        const prevTx = allTxsMap.get(vin.txid)
        if (prevTx) {
          const address = prevTx.vout[vin.vout].scriptPubKey.address
          if (walletAddresses.has(address)) {
            fromAddress = address
            break
          }
        }
      }
    }

    // Set toAddress
    let toAddress = ''
    for (const vout of tx.vout) {
      const address = vout.scriptPubKey.address
      if (
        (type === 'received' && walletAddresses.has(address)) ||
        (type === 'sent' && !walletAddresses.has(address))
      ) {
        toAddress = address
        break
      }
    }

    // Convert timestamp to date string
    const timestamp = tx.time || tx.blocktime
    const date = new Date(timestamp * 1000).toISOString()

    // Determine status based on confirmations
    const confirmations = tx.confirmations || 0
    let status: 'pending' | 'processing' | 'confirmed'
    if (confirmations === 0) {
      status = 'pending'
    } else if (confirmations < 6) {
      status = 'processing'
    } else {
      status = 'confirmed'
    }

    return {
      txid: tx.txid,
      date,
      type,
      fromAddress,
      toAddress,
      amount,
      status,
    }
  })

  return { balance, utxos, walletTransactions }
} */

export { getTxHistory, calculateBalance }
