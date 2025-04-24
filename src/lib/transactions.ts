import { CoinType, Purpose } from '@/models/account'
import {
  createHardenedIndex,
  createPublicKey,
  deriveChildPrivateKey,
  splitRootExtendedKey,
} from '@/lib/key'
import { connect, getTransactions } from './electrum'
import { createSegwitAddress } from './address'
import { Tx, TxHistory } from '@/models/transaction'

interface GetTxHistoryParams {
  extendedKey: Uint8Array
  purpose: Purpose
  coinType: CoinType
  accountStartIndex?: number
  gapLimit?: number
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
}: GetTxHistoryParams): Promise<{
  balance: number
  utxos: {
    address: string
    tx: Tx[]
  }[]
  txHistory: TxHistory[]
}> {
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

export { getTxHistory }
