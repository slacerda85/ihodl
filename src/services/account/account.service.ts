import api from '@/shared/api'
import { Account, CoinType, Purpose } from '@/models/account'
import {
  createHardenedIndex,
  createPublicKey,
  deriveChildPrivateKey,
  getParentFingerprint,
  verifyExtendedKey,
} from '@/services/key'
import { Tx } from '@/models/transaction'
import { hash160 } from '../crypto'
import { toBech32 } from '../address'
import { AddressInfo } from '@/models/address'

/**
 * Derives an account from the extended key.
 * @param extendedKey - The extended private key (bip32) to derive from.
 * @param purpose - The purpose of the account (default is 84 for Native SegWit).
 * @param coinType - The coin type of the account. Default is 0 (Bitcoin).
 * @param account - The account number (default is 0).
 * @param change - The change number (default is 0).
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

    // derive purpose
    const purposeIndex = createHardenedIndex(purpose)
    const purposeExtendedKey = deriveChildPrivateKey(extendedKey, purposeIndex)

    // derive coin type
    const coinTypeIndex = createHardenedIndex(coinType)
    const coinTypeExtendedKey = deriveChildPrivateKey(purposeExtendedKey, coinTypeIndex)

    // derive account
    const accountIndex = createHardenedIndex(accountStartIndex)
    const accountExtendedKey = deriveChildPrivateKey(coinTypeExtendedKey, accountIndex)

    // derive change
    const changeIndex = 0
    const changeExtendedKey = deriveChildPrivateKey(accountExtendedKey, changeIndex)

    const discovered: AddressInfo[] = []
    let consecutiveUnused = 0
    let index = 0

    // Continue scanning until we find gapLimit consecutive unused addresses
    while (consecutiveUnused < gapLimit) {
      // derive address index
      const addressIndexExtendedKey = deriveChildPrivateKey(changeExtendedKey, index)
      const addressIndexPublicKey = createPublicKey(addressIndexExtendedKey.subarray(0, 32))
      const publicKeyHash = hash160(addressIndexPublicKey)
      const address = toBech32(publicKeyHash, 0) // Convert to Bech32 address

      // const transactions = await ElectrumService.getTransactions(address)
      const transactions = await api.transactions.getTransactions(address)
      if (transactions.length > 0) {
        console.log(`Found transactions for address ${address}`)
        discovered.push({
          address,
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
      discovered,
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

export {
  deriveAccount,
  discoverAccounts,
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
