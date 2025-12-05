import { createAddress, /* fromBase58check */ fromBech32 } from '../lib/address'
import { Connection } from '../models/network'
import {
  AccountIndex,
  AddressCollection,
  AddressDetails,
  Change,
  CoinType,
  GAP_LIMIT,
  Purpose,
} from '../models/address'
import { Tx, Utxo } from '../models/transaction'
import AddressRepository from '../repositories/address'
import KeyService from './key'
import SeedService from './seed'
import TransactionService from './transaction'
import WalletService from './wallet'

interface AddressServiceInterface {
  getBalance(addresses: AddressDetails[]): { balance: number; utxos: Utxo[] }
  discover(connection: Connection): Promise<AddressCollection>
  getUsedAddresses(type: 'receiving' | 'change'): AddressDetails[]
  getNextUnusedAddress(): string
  getNextChangeAddress(): string
  createAddress(publicKey: Uint8Array): string
  createManyAddresses(publicKeys: Uint8Array[]): string[]
  clearAddresses(): void
  validateAddress(address: string): boolean
}

export default class AddressService implements AddressServiceInterface {
  createAddress(publicKey: Uint8Array): string {
    // Implementation to create a single address
    const address = createAddress(publicKey)
    return address
  }

  createManyAddresses(publicKeys: Uint8Array[]): string[] {
    // Implementation to create multiple addresses
    return publicKeys.map(publicKey => createAddress(publicKey))
  }

  getAccountKeys(): {
    receivingAccountKey: Uint8Array
    changeAccountKey: Uint8Array
  } {
    const walletService = new WalletService()
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for deriving account keys')
    }
    const seed = new SeedService().getSeed(walletId)
    const keyService = new KeyService()
    const masterKey = keyService.createMasterKey(seed)
    const { receivingAccountKey, changeAccountKey } = keyService.deriveAccountKeys({
      masterKey,
    })
    return { receivingAccountKey, changeAccountKey }
  }

  private deriveAddress(accountKey: Uint8Array, addressIndex: number): string {
    const keyService = new KeyService()
    const { addressKey } = keyService.deriveAddressKeys(accountKey, addressIndex)
    const addressPublicKey = keyService.deriveAddressPublicKey(addressKey)
    const address = this.createAddress(addressPublicKey)
    return address
  }

  getBalance(addresses: AddressDetails[]): { balance: number; utxos: Utxo[] } {
    const transactionService = new TransactionService()
    const allTxs: Tx[] = []
    const allAddresses: string[] = []

    // aggregate all txs and addresses
    for (const addrDetail of addresses) {
      allAddresses.push(addrDetail.address)
      allTxs.push(...addrDetail.txs)
    }

    const utxos = transactionService.getUtxos(allAddresses, allTxs)
    const balance = utxos.reduce((sum, utxo) => sum + utxo.amount, 0)

    return { balance, utxos }
  }

  async discover(connection: Connection): Promise<AddressCollection> {
    const walletService = new WalletService()
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for address discovery')
    }
    const repository = new AddressRepository()
    let collection = repository.read(walletId)
    if (!collection) {
      collection = {
        walletId,
        addresses: [],
        nextReceiveIndex: 0,
        nextChangeIndex: 0,
        gapLimit: GAP_LIMIT,
      }
    }

    const { receivingAccountKey, changeAccountKey } = this.getAccountKeys()
    const startIndex = collection.nextReceiveIndex

    const discoveredAddresses = await this.fetchAddresses(
      receivingAccountKey,
      changeAccountKey,
      connection,
      startIndex,
    )

    // Add discovered addresses to collection
    for (const addr of discoveredAddresses) {
      collection.addresses.push(addr)
      // ajusta indices nextReceiveIndex e nextChangeIndex
      if (addr.derivationPath.change === Change.Receiving) {
        collection.nextReceiveIndex = Math.max(
          collection.nextReceiveIndex,
          addr.derivationPath.addressIndex + 1,
        )
      } else {
        collection.nextChangeIndex = Math.max(
          collection.nextChangeIndex,
          addr.derivationPath.addressIndex + 1,
        )
      }
    }

    repository.save(collection)

    return collection
  }

  async fetchAddresses(
    receivingAccountKey: Uint8Array,
    changeAccountKey: Uint8Array,
    connection: Connection,
    startIndex: number = 0,
  ): Promise<AddressDetails[]> {
    const addresses: AddressDetails[] = []
    let unusedCount = 0
    let addressIndex = startIndex

    const transactionsService = new TransactionService()
    while (unusedCount < GAP_LIMIT) {
      try {
        this.deriveAddress(receivingAccountKey, addressIndex)
      } catch (error) {
        console.error('Error deriving address:', error)
        break
      }
      const receivingAddress = this.deriveAddress(receivingAccountKey, addressIndex)
      const txs = await transactionsService.getTransactions(receivingAddress, connection)
      if (txs.length === 0) {
        unusedCount++
      } else {
        unusedCount = 0
        // fetch change addresses as well to include in address details
        const changeAddress = this.deriveAddress(changeAccountKey, addressIndex)
        const changeTxs = await transactionsService.getTransactions(changeAddress, connection)
        addresses.push({
          derivationPath: {
            purpose: Purpose.BIP84,
            coinType: CoinType.Bitcoin,
            accountIndex: AccountIndex.Main,
            change: Change.Receiving,
            addressIndex,
          },
          address: receivingAddress,
          txs,
        })
        addresses.push({
          derivationPath: {
            purpose: Purpose.BIP84,
            coinType: CoinType.Bitcoin,
            accountIndex: AccountIndex.Main,
            change: Change.Change,
            addressIndex,
          },
          address: changeAddress,
          txs: changeTxs,
        })
      }
      addressIndex++
    }

    return addresses
  }

  getUsedAddresses(type: 'receiving' | 'change'): AddressDetails[] {
    const walletService = new WalletService()
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for getting used addresses')
    }
    const repository = new AddressRepository()
    const collection = repository.read(walletId)
    if (!collection) {
      return []
    }
    const changeType = type === 'receiving' ? Change.Receiving : Change.Change
    return collection.addresses.filter(
      addr => addr.derivationPath.change === changeType && addr.txs.length > 0,
    )
  }

  getNextUnusedAddress(): string {
    const walletService = new WalletService()
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for getting next unused address')
    }
    const repository = new AddressRepository()
    let collection = repository.read(walletId)
    if (!collection) {
      collection = {
        walletId,
        addresses: [],
        nextReceiveIndex: 0,
        nextChangeIndex: 0,
        gapLimit: GAP_LIMIT,
      }
    }
    const { receivingAccountKey } = this.getAccountKeys()
    const address = this.deriveAddress(receivingAccountKey, collection.nextReceiveIndex)
    // don't save the address yet (only address with txs are saved)
    return address
  }

  getNextChangeAddress(): string {
    const walletService = new WalletService()
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for getting next change address')
    }
    const repository = new AddressRepository()
    let collection = repository.read(walletId)
    if (!collection) {
      collection = {
        walletId,
        addresses: [],
        nextReceiveIndex: 0,
        nextChangeIndex: 0,
        gapLimit: GAP_LIMIT,
      }
    }
    const { changeAccountKey } = this.getAccountKeys()
    const address = this.deriveAddress(changeAccountKey, collection.nextChangeIndex)
    // don't save the address yet (only address with txs are saved)
    return address
  }

  clearAddresses(): void {
    const walletService = new WalletService()
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for clearing addresses')
    }
    const repository = new AddressRepository()
    repository.deleteByWalletId(walletId)
  }

  validateAddress(address: string): boolean {
    if (!address || address.trim().length === 0) {
      return false
    }

    const trimmedAddress = address.trim()

    // Check if it's a Bech32 address (starts with bc1)
    if (trimmedAddress.startsWith('bc1')) {
      try {
        fromBech32(trimmedAddress)
        return true
      } catch {
        return false
      }
    }

    /* // Check if it's a Base58 address (starts with 1 or 3)
    if (trimmedAddress.startsWith('1') || trimmedAddress.startsWith('3')) {
      try {
        fromBase58check(trimmedAddress)
        return true
      } catch {
        return false
      }
    } */

    return false
  }
}
