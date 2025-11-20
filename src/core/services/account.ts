import { calculateWalletBalance, getBalance, getFriendlyTxs } from '../lib/tx/tx'
import {
  ACCOUNT_DISCOVERY_GAP_LIMIT,
  AccountDetails,
  AccountIndex,
  Change,
  CoinType,
  Purpose,
  WalletAccount,
} from '../models/account'
import { Connection } from '../models/network'
import { FriendlyTx } from '../models/tx'
import AccountRepository from '../repositories/account'
import addressService from './address'
import keyService from './key'
import SeedService from './seed'

interface AccountServiceInterface {
  getAccounts(walletId: string, connection: Connection): Promise<WalletAccount[]>
  getBalance(walletId: string): void
  getFriendlyTxs(walletId: string): FriendlyTx[]
  getFriendlyTx(txid: string): FriendlyTx | null
}

export class AccountService implements AccountServiceInterface {
  async getAccounts(walletId: string, connection: Connection): Promise<WalletAccount[]> {
    // first check repository for existing accounts
    // if none found, perform discovery
    const accountRepository = new AccountRepository()
    let accounts: WalletAccount[] = []
    const storedAccounts = accountRepository.read(walletId)
    if (storedAccounts.length > 0) {
      accounts.push(...storedAccounts)
    }
    const lastAddressIndex = storedAccounts.reduce((max, account) => {
      return account.addressIndex > max ? account.addressIndex : max
    }, 0)

    const startIndex = lastAddressIndex + 1

    const discoveredAccounts = await new AccountService().discover({
      walletId,
      connection,
      startIndex,
    })

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

    accounts.push(...walletAccounts)
    return accounts
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
    const { receivingAccountKey, changeAccountKey } = new AccountService().getAccountKeys(walletId)
    // 2) scan addresses of external chain (receiving addresses)
    const loadedAccounts = await new AccountService().fetchAccounts(
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

    while (unusedCount < ACCOUNT_DISCOVERY_GAP_LIMIT) {
      const address = new AccountService().deriveAddress(receivingAccountKey, addressIndex)
      console.log('fetching receiving address: ', address)
      const txs = await new AccountService().fetchTransactions(address, connection)
      if (txs.length === 0) {
        unusedCount++
      } else {
        // fetch change addresses as well to include in account details
        const changeAddress = new AccountService().deriveAddress(changeAccountKey, addressIndex)
        console.log('fetching change address: ', changeAddress)
        const changeTxs = await new AccountService().fetchTransactions(changeAddress, connection)

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
    const seed = new SeedService().getSeed(walletId)
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
    const txs = await addressService.getAddressHistory(address, connection)
    return txs
  }

  getBalance(walletId: string): number {
    const accountRepository = new AccountRepository()
    const accounts = accountRepository.read(walletId)
    const { balance } = calculateWalletBalance(accounts)
    return balance
  }

  getFriendlyTxs(walletId: string): FriendlyTx[] {
    const accountRepository = new AccountRepository()
    const accounts = accountRepository.read(walletId)
    const addresses = accounts.map(account => account.address)
    const txs = accounts.flatMap(account => account.txs)
    const friendlyTxs = getFriendlyTxs(addresses, txs, walletId)
    return friendlyTxs
  }

  getFriendlyTx(txid: string): FriendlyTx | null {
    // Search all accounts for the txid
    const accountRepository = new AccountRepository()
    const allAccounts = accountRepository.all()
    for (const account of allAccounts) {
      const addresses = [account.address]
      const txs = account.txs
      const friendlyTxs = getFriendlyTxs(addresses, txs, account.walletId)
      const foundTx = friendlyTxs.find(tx => tx.txid === txid)
      if (foundTx) {
        return foundTx
      }
    }
    return null
  }
}
