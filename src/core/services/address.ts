import { createAddress } from '../lib/address'
import { Connection } from '../models/network'
import {
  AddressDetails,
  GAP_LIMIT,
  Change,
  Purpose,
  CoinType,
  AccountIndex,
  AddressCollection,
} from '../models/address'
import AddressRepository from '../repositories/address'
import SeedService from './seed'
import KeyService from './key'
import TransactionService from './transaction'
import { Tx, Utxo } from '../models/tx'

interface AddressServiceInterface {
  getBalance(addresses: AddressDetails[]): { balance: number; utxos: Utxo[] }
  discover(walletId: string, connection: Connection): Promise<AddressCollection>
  getNextUnusedAddress(walletId: string): string
  getNextChangeAddress(walletId: string): string
  createAddress(publicKey: Uint8Array): string
  createManyAddresses(publicKeys: Uint8Array[]): string[]
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

  private getAccountKeys(walletId: string): {
    receivingAccountKey: Uint8Array
    changeAccountKey: Uint8Array
  } {
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

  async discover(walletId: string, connection: Connection): Promise<AddressCollection> {
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

    const { receivingAccountKey, changeAccountKey } = this.getAccountKeys(walletId)
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

  getNextUnusedAddress(walletId: string): string {
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
    const { receivingAccountKey } = this.getAccountKeys(walletId)
    const address = this.deriveAddress(receivingAccountKey, collection.nextReceiveIndex)
    collection.nextReceiveIndex++
    repository.save(collection)
    return address
  }

  getNextChangeAddress(walletId: string): string {
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
    const { changeAccountKey } = this.getAccountKeys(walletId)
    const address = this.deriveAddress(changeAccountKey, collection.nextChangeIndex)
    collection.nextChangeIndex++
    repository.save(collection)
    return address
  }
}
