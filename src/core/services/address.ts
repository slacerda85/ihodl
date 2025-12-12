import { createAddress, createP2PKHAddress, createP2TRAddress, fromBech32 } from '../lib/address'
import { getAddressTypeFromPurpose } from '../models/address'
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
import { walletService } from './wallet'
import { getAllBech32Prefixes, getNetworkConfig } from '../../config/network'

const VALID_BECH32_HRPS = getAllBech32Prefixes().map(hrp => `${hrp}1`)

// Lazy imports to avoid circular dependency
// TransactionService and WalletService are imported dynamically where needed
type TransactionServiceType = import('./transaction').default
type WalletServiceType = import('./wallet').default

function getTransactionService(): TransactionServiceType {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return new (require('./transaction').default)()
}

interface AddressServiceInterface {
  getBalance(addresses: AddressDetails[]): { balance: number; utxos: Utxo[] }
  discover(connection: Connection): Promise<AddressCollection>
  getUsedAddresses(type: 'receiving' | 'change'): AddressDetails[]
  getNextUnusedAddress(): string
  getNextChangeAddress(): string
  getNextAddressByType(addressType: 'legacy' | 'segwit' | 'taproot'): string
  createAddress(publicKey: Uint8Array): string
  createP2PKHAddress(publicKey: Uint8Array): string
  createP2TRAddress(publicKey: Uint8Array): string
  createManyAddresses(publicKeys: Uint8Array[]): string[]
  clearAddresses(): void
  validateAddress(address: string): boolean
  getAddressesForMempoolCheck(gapLimit?: number): string[]
}

export default class AddressService implements AddressServiceInterface {
  private cachedAccountKeys: {
    receivingAccountKey: Uint8Array
    changeAccountKey: Uint8Array
  } | null = null
  private cachedWalletId: string | null = null

  createAddress(publicKey: Uint8Array): string {
    // Implementation to create a single address
    const config = getNetworkConfig()
    const address = createAddress(publicKey, 0, config.bech32Hrp)
    return address
  }

  createP2PKHAddress(publicKey: Uint8Array): string {
    return createP2PKHAddress(publicKey)
  }

  createP2TRAddress(publicKey: Uint8Array): string {
    const config = getNetworkConfig()
    return createP2TRAddress(publicKey, config.bech32Hrp)
  }

  createManyAddresses(publicKeys: Uint8Array[]): string[] {
    // Implementation to create multiple addresses
    const config = getNetworkConfig()
    return publicKeys.map(publicKey => createAddress(publicKey, 0, config.bech32Hrp))
  }

  getAccountKeys(): {
    receivingAccountKey: Uint8Array
    changeAccountKey: Uint8Array
  } {
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for deriving account keys')
    }

    // Return cached keys if wallet hasn't changed
    if (this.cachedAccountKeys && this.cachedWalletId === walletId) {
      return this.cachedAccountKeys
    }

    const seed = new SeedService().getSeed(walletId)
    const keyService = new KeyService()
    const masterKey = keyService.createMasterKey(seed)
    const { receivingAccountKey, changeAccountKey } = keyService.deriveAccountKeys({
      masterKey,
    })

    // Cache the keys
    this.cachedAccountKeys = { receivingAccountKey, changeAccountKey }
    this.cachedWalletId = walletId

    return this.cachedAccountKeys
  }

  private deriveAddress(
    accountKey: Uint8Array,
    addressIndex: number,
    addressType: 'legacy' | 'segwit' | 'taproot' = 'segwit',
  ): string {
    const keyService = new KeyService()
    const { addressKey } = keyService.deriveAddressKeys(accountKey, addressIndex)
    const addressPublicKey = keyService.deriveAddressPublicKey(addressKey)

    switch (addressType) {
      case 'legacy':
        return this.createP2PKHAddress(addressPublicKey)
      case 'segwit':
        return this.createAddress(addressPublicKey)
      case 'taproot':
        return this.createP2TRAddress(addressPublicKey)
      default:
        return this.createAddress(addressPublicKey)
    }
  }

  getBalance(addresses: AddressDetails[]): { balance: number; utxos: Utxo[] } {
    const transactionService = getTransactionService()
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
    // const walletService = getWalletService()
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for address discovery')
    }
    const repository = AddressRepository
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

    const transactionsService = getTransactionService()
    while (unusedCount < GAP_LIMIT) {
      try {
        this.deriveAddress(receivingAccountKey, addressIndex)
      } catch (error) {
        console.error('Error deriving address:', error)
        break
      }

      // Check all address types for transactions
      const addressTypes: ('segwit' | 'taproot')[] = ['segwit', 'taproot']
      let hasTransactions = false

      for (const addressType of addressTypes) {
        const receivingAddress = this.deriveAddress(receivingAccountKey, addressIndex, addressType)
        const txs = await transactionsService.getTransactions(receivingAddress, connection)

        if (txs.length > 0) {
          hasTransactions = true
          // Add receiving address with transactions
          addresses.push({
            derivationPath: {
              purpose: addressType === 'segwit' ? Purpose.BIP84 : Purpose.BIP86,
              coinType: CoinType.Bitcoin,
              accountIndex: AccountIndex.Main,
              change: Change.Receiving,
              addressIndex,
            },
            address: receivingAddress,
            addressType,
            txs,
          })

          // Also check change address for this type
          const changeAddress = this.deriveAddress(changeAccountKey, addressIndex, addressType)
          const changeTxs = await transactionsService.getTransactions(changeAddress, connection)

          if (changeTxs.length > 0) {
            addresses.push({
              derivationPath: {
                purpose: addressType === 'segwit' ? Purpose.BIP84 : Purpose.BIP86,
                coinType: CoinType.Bitcoin,
                accountIndex: AccountIndex.Main,
                change: Change.Change,
                addressIndex,
              },
              address: changeAddress,
              addressType,
              txs: changeTxs,
            })
          }
        }
      }

      if (!hasTransactions) {
        unusedCount++
      } else {
        unusedCount = 0
      }

      addressIndex++
    }

    return addresses
  }

  getUsedAddresses(type: 'receiving' | 'change'): AddressDetails[] {
    // const walletService = new WalletService()
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for getting used addresses')
    }
    const repository = AddressRepository
    const collection = repository.read(walletId)
    if (!collection) {
      return []
    }
    const changeType = type === 'receiving' ? Change.Receiving : Change.Change
    const filteredAddresses = collection.addresses.filter(
      addr => addr.derivationPath.change === changeType && addr.txs.length > 0,
    )

    // Ensure all addresses have addressType property (for backward compatibility)
    return filteredAddresses.map(addr => ({
      ...addr,
      addressType: addr.addressType || getAddressTypeFromPurpose(addr.derivationPath.purpose),
    }))
  }

  getNextUnusedAddress(): string {
    // const walletService = new WalletService()
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for getting next unused address')
    }
    const repository = AddressRepository
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
    /// const walletService = new WalletService()
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for getting next change address')
    }
    const repository = AddressRepository
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

  getNextAddressByType(addressType: 'legacy' | 'segwit' | 'taproot'): string {
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for getting next address')
    }
    const repository = AddressRepository
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
    const address = this.deriveAddress(
      receivingAccountKey,
      collection.nextReceiveIndex,
      addressType,
    )
    // don't save the address yet (only address with txs are saved)
    return address
  }

  /**
   * Otimizado: Retorna ambos os próximos endereços (receive e change) derivando as chaves apenas uma vez.
   * Isso evita a operação pesada de derivação de chaves (PBKDF2) ser executada duas vezes.
   */
  getNextAddresses(): { receive: string; change: string } {
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for getting next addresses')
    }
    const repository = AddressRepository
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
    // Deriva as chaves apenas uma vez (operação pesada)
    const { receivingAccountKey, changeAccountKey } = this.getAccountKeys()
    const receive = this.deriveAddress(receivingAccountKey, collection.nextReceiveIndex)
    const change = this.deriveAddress(changeAccountKey, collection.nextChangeIndex)
    return { receive, change }
  }

  /**
   * Retorna endereços para verificar na mempool.
   * Inclui:
   * - Todos os endereços usados (receive + change) - para detectar novas txs em endereços conhecidos
   * - Próximos N endereços não usados (receive) - para detectar depósitos em novos endereços
   * @param gapLimit Número de endereços não usados a verificar (padrão: GAP_LIMIT = 20)
   * @returns Lista de endereços para verificar na mempool
   */
  getAddressesForMempoolCheck(gapLimit: number = GAP_LIMIT): string[] {
    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      console.warn('[AddressService] No active wallet for mempool check')
      return []
    }

    const addresses: string[] = []

    // 1. Adicionar todos os endereços usados (receive + change)
    const usedReceiving = this.getUsedAddresses('receiving')
    const usedChange = this.getUsedAddresses('change')

    for (const addr of usedReceiving) {
      addresses.push(addr.address)
    }
    for (const addr of usedChange) {
      addresses.push(addr.address)
    }

    // 2. Adicionar próximos N endereços não usados (receive apenas, para detectar depósitos)
    try {
      const repository = AddressRepository
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
      const startIndex = collection.nextReceiveIndex

      for (let i = 0; i < gapLimit; i++) {
        const address = this.deriveAddress(receivingAccountKey, startIndex + i)
        addresses.push(address)
      }

      console.log(
        `[AddressService] Mempool check addresses: ${usedReceiving.length} used receive, ${usedChange.length} used change, ${gapLimit} unused receive`,
      )
    } catch (error) {
      console.error('[AddressService] Error deriving addresses for mempool check:', error)
    }

    // Remover duplicatas
    return [...new Set(addresses)]
  }

  clearAddresses(): void {
    // Clear cached account keys when addresses are cleared
    this.cachedAccountKeys = null
    this.cachedWalletId = null

    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet for clearing addresses')
    }
    const repository = AddressRepository
    repository.deleteByWalletId(walletId)
  }

  validateAddress(address: string): boolean {
    if (!address || address.trim().length === 0) {
      return false
    }

    const trimmedAddress = address.trim()

    // Check if it's a Bech32 address
    if (VALID_BECH32_HRPS.some(hrp1 => trimmedAddress.startsWith(hrp1))) {
      const hrps = getAllBech32Prefixes()
      try {
        const result = fromBech32(trimmedAddress)
        return hrps.includes(result.prefix)
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

/** Singleton instance for stateless operations */
export const addressService = new AddressService()
