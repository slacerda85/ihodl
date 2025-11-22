import { UTXO } from '@/lib/transactions/types'
import { getFriendlyTransactions, getFriendlyTxs, getWalletAccountsBalance } from '../lib/tx/tx'
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
  deleteAccountsByWalletId(walletId: string): void
}

export class AccountService implements AccountServiceInterface {
  async getAccounts(walletId: string, connection: Connection): Promise<WalletAccount[]> {
    // first check repository for existing accounts
    // if none found, perform discovery
    const accountRepository = new AccountRepository()
    let accounts: WalletAccount[] = []
    const storedAccounts = accountRepository.read(walletId)
    if (storedAccounts.length > 0) {
      console.log(`Found ${storedAccounts.length} stored accounts for wallet ${walletId}`)
      accounts.push(...storedAccounts)
    }
    console.log()
    const lastAddressIndex = storedAccounts.reduce((max, account) => {
      return account.addressIndex > max ? account.addressIndex : max
    }, 0)
    console.log(`Last address index for stored accounts: ${lastAddressIndex}`)

    const startIndex = lastAddressIndex

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
      console.log('fetching rcv addr: ', `... ${address.slice(-6)}`)
      const txs = await new AccountService().fetchTransactions(address, connection)
      if (txs.length === 0) {
        unusedCount++
      } else {
        unusedCount = 0
        // fetch change addresses as well to include in account details
        const changeAddress = new AccountService().deriveAddress(changeAccountKey, addressIndex)
        console.log('fetching chg addr: ', `... ${changeAddress.slice(-6)}`)
        const changeTxs = await new AccountService().fetchTransactions(changeAddress, connection)
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

  async fetchAccountsParallel(
    receivingAccountKey: Uint8Array,
    changeAccountKey: Uint8Array,
    connection: Connection | Connection[],
    startIndex: number = 0,
  ): Promise<AccountDetails[]> {
    const connections = Array.isArray(connection) ? connection : [connection]
    const accounts: AccountDetails[] = []
    let unusedCount = 0
    let addressIndex = startIndex

    // To parallelize, we'll collect all potential addresses up to a reasonable limit
    const maxAddressesToCheck = startIndex + ACCOUNT_DISCOVERY_GAP_LIMIT * 5
    const addressesToFetch: { address: string; isChange: boolean; index: number }[] = []

    for (let i = 0; i < maxAddressesToCheck; i++) {
      const receivingAddress = new AccountService().deriveAddress(receivingAccountKey, addressIndex)
      addressesToFetch.push({ address: receivingAddress, isChange: false, index: addressIndex })

      const changeAddress = new AccountService().deriveAddress(changeAccountKey, addressIndex)
      addressesToFetch.push({ address: changeAddress, isChange: true, index: addressIndex })

      addressIndex++
    }

    // Fetch all transactions in parallel, distributing across connections
    const txPromises = addressesToFetch.map(({ address }, idx) => {
      const conn = connections[idx % connections.length]
      return new AccountService().fetchTransactions(address, conn)
    })
    const txResults = await Promise.all(txPromises)

    // Process results in order
    const resultsMap = new Map<string, any[]>()
    addressesToFetch.forEach(({ address }, idx) => {
      resultsMap.set(address, txResults[idx])
    })

    addressIndex = startIndex
    unusedCount = 0

    while (
      unusedCount < ACCOUNT_DISCOVERY_GAP_LIMIT &&
      addressIndex < startIndex + maxAddressesToCheck
    ) {
      const receivingAddress = new AccountService().deriveAddress(receivingAccountKey, addressIndex)
      console.log('fetching receiving address: ', receivingAddress)
      const txs = resultsMap.get(receivingAddress) || []

      if (txs.length === 0) {
        unusedCount++
      } else {
        unusedCount = 0
        // fetch change addresses as well to include in account details
        const changeAddress = new AccountService().deriveAddress(changeAccountKey, addressIndex)
        console.log('fetching change address: ', changeAddress)
        const changeTxs = resultsMap.get(changeAddress) || []

        accounts.push({
          purpose: Purpose.BIP84,
          coinType: CoinType.Bitcoin,
          accountIndex: AccountIndex.Main,
          change: Change.Receiving,
          addressIndex,
          address: receivingAddress,
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

  getBalance(walletId: string): { balance: number; utxos: UTXO[] } {
    const accountRepository = new AccountRepository()
    const accounts = accountRepository.read(walletId)
    const { balance, utxos } = getWalletAccountsBalance(accounts)
    return { balance, utxos }
  }

  getFriendlyTxs(walletId: string): FriendlyTx[] {
    const accountRepository = new AccountRepository()
    const accounts = accountRepository.read(walletId)
    const addresses = accounts.map(account => account.address)
    const txs = accounts.flatMap(account => account.txs)
    const friendlyTxs = getFriendlyTransactions(addresses, txs, walletId)
    return friendlyTxs
  }

  getFriendlyTx(txid: string): FriendlyTx | null {
    // Search all accounts for the txid
    const accountRepository = new AccountRepository()
    const allAccounts = accountRepository.all()
    for (const account of allAccounts) {
      const addresses = [account.address]
      const txs = account.txs
      const friendlyTxs = getFriendlyTransactions(addresses, txs, account.walletId)
      const foundTx = friendlyTxs.find(tx => tx.txid === txid)
      if (foundTx) {
        return foundTx
      }
    }
    return null
  }

  deleteAccountsByWalletId(walletId: string): void {
    const accountRepository = new AccountRepository()
    accountRepository.delete(walletId)
  }
}
