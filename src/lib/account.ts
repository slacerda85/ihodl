// import api from '@/api'
import { Account, CoinType, Purpose } from '@/models/account'
import {
  createHardenedIndex,
  createPublicKey,
  deriveChildPrivateKey,
  getParentFingerprint,
  splitRootExtendedKey,
  verifyExtendedKey,
} from '@/lib/key'
import { Tx } from '@/models/transaction'
import { AddressInfo } from '@/models/address'
import { connect, getTransactions } from './electrum'
import { createSegwitAddress } from './address'

/**
 * Derives an account from the extended key.
 * @param extendedKey - The extended private key (bip32) to derive from.
 * @param purpose - The purpose of the account (default is 84 for Native SegWit).
 * @param coinType - The coin type of the account. Default is 0 (Bitcoin).
 * @param account - The account number (default is 0).
 * @param change - The change number (0 for receiving, 1 for change).
 * @param addressIndex - The address index (default is 0).
 * @returns An object containing the derived account information.
 */
function deriveAccount(
  extendedKey: Uint8Array,
  purpose: Purpose = 84,
  coinType: CoinType = 0,
  account: number = 0,
  change: number = 0,
  addressIndex: number = 0,
): {
  extendedKey: Uint8Array
  childIndex: number
  parentFingerprint: number
  depth: number
} {
  // check if the extended key is valid
  if (!verifyExtendedKey(extendedKey)) {
    throw new Error('Invalid extended key')
  }
  // derive purpose
  const purposeIndex = createHardenedIndex(purpose)
  const purposeExtendedKey = deriveChildPrivateKey(extendedKey, purposeIndex)

  // derive coin type
  const coinTypeIndex = createHardenedIndex(coinType)
  const coinTypeExtendedKey = deriveChildPrivateKey(purposeExtendedKey, coinTypeIndex)

  // derive account
  const accountIndex = createHardenedIndex(account)
  const accountExtendedKey = deriveChildPrivateKey(coinTypeExtendedKey, accountIndex)

  // derive change
  const changeIndex = change
  const changeExtendedKey = deriveChildPrivateKey(accountExtendedKey, changeIndex)
  const changePublicKey = createPublicKey(changeExtendedKey.subarray(0, 32))

  // derive address index
  const addressIndexExtendedKey = deriveChildPrivateKey(changeExtendedKey, addressIndex)

  const parentFingerprint = getParentFingerprint(changePublicKey) // fast way to detect parent and child nodes in software

  return {
    extendedKey: addressIndexExtendedKey,
    parentFingerprint,
    childIndex: addressIndex,
    depth: 5, // purpose + coin type + account + change + address index
  }
}

export type DiscoverAccountsResponse = {
  discoveredAccounts: Account[]
}

/**
 * Discovers accounts based on the provided extended key and parameters.
 * @param extendedKey - The extended private key (bip32) to derive from.
 * @param purpose - The purpose of the account (default is 84 for Native SegWit).
 * @param coinType - The coin type of the account. Default is 0 (Bitcoin).
 * @param accountStartIndex - The starting account index (default is 0).
 * @param gapLimit - The gap limit for unused addresses (default is 20).
 * @returns An object containing the discovered accounts.
 */
async function discoverAccounts(
  extendedKey: Uint8Array,
  purpose: Purpose = 84,
  coinType: CoinType = 0,
  accountStartIndex = 0,
  gapLimit: number = 20,
  // multiAccount = false,
): Promise<DiscoverAccountsResponse> {
  try {
    const discoveredAccounts: Account[] = []

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

    const addressInfo: AddressInfo[] = []
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
        console.log(`Found transactions for address ${receivingAddress}`)
        addressInfo.push({
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

    // Create the discovered account object
    const discoveredAccount: Account = {
      purpose,
      coinType,
      accountIndex: accountStartIndex,
      addressInfo,
    }
    discoveredAccounts.push(discoveredAccount)

    // Return the discovered accounts
    return {
      discoveredAccounts,
    }
  } catch (error) {
    throw new Error(`Failed to discover accounts: ${(error as Error).message}`)
  }
}

function calculateBalance(addressInfo: AddressInfo[]): {
  balance: number
  utxos: { address: string; tx: Tx[] }[]
} {
  let balance = 0
  const utxos: { address: string; tx: Tx[] }[] = []

  addressInfo.forEach(address => {
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

export {
  deriveAccount,
  discoverAccounts,
  calculateBalance,
  // discoverAccounts,
  // getTransactions,
  // getTransactionDetails,
  // getTransactionHistory,
  // getTransactionFee,
  // sendTransaction,
  // getBalance,
  // createWallet,
  // importWallet,
  // deleteWallet,
}
