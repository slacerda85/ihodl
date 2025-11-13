import { createAddress } from '../lib/address'
import { getTransactions } from '../lib/electrum'
import { Tx } from '../models/tx'

interface AddressServiceInterface {
  createAddress(publicKey: Uint8Array): Promise<string>
  createManyAddresses(publicKeys: Uint8Array[]): Promise<string[]>
  getAddressHistory(address: string): Promise<Tx[]>
}

export class AddressService implements AddressServiceInterface {
  async createAddress(publicKey: Uint8Array): Promise<string> {
    // Implementation to create a single address
    const address = createAddress(publicKey)
    return address
  }

  async createManyAddresses(publicKeys: Uint8Array[]): Promise<string[]> {
    // Implementation to create multiple addresses
    return publicKeys.map(publicKey => createAddress(publicKey))
  }

  async getAddressHistory(address: string): Promise<Tx[]> {
    const history = await getTransactions(address)
    return history
  }
}
