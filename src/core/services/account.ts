import {
  AccountDetails,
  AccountIndex,
  Change,
  CoinType,
  Purpose,
  WalletAccount,
} from '../models/account'
import { Connection } from '../models/network'
import accountRepository from '../repositories/account'
import addressService from './address'
import keyService from './key'
import seedService from './seed'

const GAP_LIMIT = 20

interface AccountServiceInterface {
  getAccounts(walletId: string, connection: Connection): Promise<WalletAccount[]>
}

class AccountService implements AccountServiceInterface {
  async getAccounts(walletId: string, connection: Connection): Promise<WalletAccount[]> {
    // first check repository for existing accounts
    // if none found, perform discovery
    const storedAccounts = accountRepository.read(walletId)
    if (storedAccounts.length > 0) {
      return storedAccounts
    }
    const discoveredAccounts = await this.discover({ walletId, connection })
    for (const account of discoveredAccounts) {
      accountRepository.save({
        ...account,
        walletId,
      })
    }
    const walletAccounts = discoveredAccounts.map(account => ({
      ...account,
      walletId,
    }))
    return walletAccounts
  }

  async discover({
    walletId,
    connection,
    startIndex = 0,
  }: {
    walletId: string
    connection: Connection
    startIndex?: number
  }): Promise<AccountDetails[]> {
    // 1) derive account keys
    const { receivingAccountKey, changeAccountKey } = this.getAccountKeys(walletId)
    // 2) scan addresses of external chain (receiving addresses)
    const loadedAccounts = await this.fetchAccounts(
      receivingAccountKey,
      changeAccountKey,
      connection,
      startIndex,
    )
    return loadedAccounts
  }

  async fetchAccounts(
    receivingAccountKey: Uint8Array,
    changeAccountKey: Uint8Array,
    connection: Connection,
    startIndex: number = 0,
  ): Promise<AccountDetails[]> {
    const accounts: AccountDetails[] = []
    let unusedCount = 0
    let addressIndex = startIndex

    while (unusedCount < GAP_LIMIT) {
      const address = this.deriveAddress(receivingAccountKey, addressIndex)
      console.log('fetching receiving address: ', address)
      const txs = await this.fetchTransactions(address, connection)
      if (txs.length === 0) {
        unusedCount++
      } else {
        // fetch change addresses as well to include in account details
        const changeAddress = this.deriveAddress(changeAccountKey, addressIndex)
        console.log('fetching change address: ', changeAddress)
        const changeTxs = await this.fetchTransactions(changeAddress, connection)

        unusedCount = 0
        accounts.push({
          purpose: Purpose.BIP84,
          coinType: CoinType.Bitcoin,
          accountIndex: AccountIndex.Main,
          change: Change.Receiving,
          addressIndex,
          address,
          txs,
        })
        accounts.push({
          purpose: Purpose.BIP84,
          coinType: CoinType.Bitcoin,
          accountIndex: AccountIndex.Main,
          change: Change.Change,
          addressIndex,
          address: changeAddress,
          txs: changeTxs,
        })
      }
      addressIndex++
    }

    return accounts
  }

  private getAccountKeys(walletId: string): {
    receivingAccountKey: Uint8Array
    changeAccountKey: Uint8Array
  } {
    const seed = seedService.getSeed(walletId)
    const masterKey = keyService.createMasterKey(seed)
    const { receivingAccountKey, changeAccountKey } = keyService.deriveAccountKeys({
      masterKey,
    })
    return { receivingAccountKey, changeAccountKey }
  }

  private deriveAddress(accountKey: Uint8Array, addressIndex: number): string {
    const { addressKey } = keyService.deriveAddressKeys(accountKey, addressIndex)
    const addressPublicKey = keyService.deriveAddressPublicKey(addressKey)
    const address = addressService.createAddress(addressPublicKey)
    return address
  }
  private async fetchTransactions(address: string, connection: Connection): Promise<any[]> {
    const txs = await addressService.getAddressHistory(address)
    return txs
  }
}

const accountService = new AccountService()
export default accountService
