import { createAddress } from '../lib/address'
import { getTransactions } from '../lib/electrum'
import { Tx } from '../models/tx'
import { Connection } from '../models/network'

interface AddressServiceInterface {
  createAddress(publicKey: Uint8Array): string
  createManyAddresses(publicKeys: Uint8Array[]): string[]
  getAddressHistory(address: string, connection: Connection): Promise<Tx[]>
}

class AddressService implements AddressServiceInterface {
  createAddress(publicKey: Uint8Array): string {
    // Implementation to create a single address
    const address = createAddress(publicKey)
    return address
  }

  createManyAddresses(publicKeys: Uint8Array[]): string[] {
    // Implementation to create multiple addresses
    return publicKeys.map(publicKey => createAddress(publicKey))
  }

  async getAddressHistory(address: string, connection: Connection): Promise<Tx[]> {
    const history = await getTransactions(address, connection)
    return history
  }
}

const addressService = new AddressService()
export default addressService
