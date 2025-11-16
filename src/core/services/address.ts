import { createAddress } from '../lib/address'
import { getTransactions } from '../lib/electrum'
import { Tx } from '../models/tx'
import { connect } from '@/core/lib/electrum'

interface AddressServiceInterface {
  createAddress(publicKey: Uint8Array): string
  createManyAddresses(publicKeys: Uint8Array[]): string[]
  getAddressHistory(address: string): Promise<Tx[]>
}

class AddressService implements AddressServiceInterface {
  // construct a socket to reuse connections
  private socket: Awaited<ReturnType<typeof connect>> | null = null

  async init() {
    if (!this.socket) {
      this.socket = await connect()
    }
  }

  createAddress(publicKey: Uint8Array): string {
    // Implementation to create a single address
    const address = createAddress(publicKey)
    return address
  }

  createManyAddresses(publicKeys: Uint8Array[]): string[] {
    // Implementation to create multiple addresses
    return publicKeys.map(publicKey => createAddress(publicKey))
  }

  async getAddressHistory(address: string): Promise<Tx[]> {
    await this.init()
    const history = await getTransactions(address, this.socket!)
    return history
  }
}

const addressService = new AddressService()
export default addressService
