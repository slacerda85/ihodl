import { MMKV } from 'react-native-mmkv'
import { AddressCollection } from '../models/address'

const addressStorage = new MMKV({
  id: 'address-storage',
})

interface AddressRepositoryInterface {
  read(walletId: string): AddressCollection | null
  save(addressCollection: AddressCollection): void
  deleteByWalletId(walletId: string): void
}

class AddressRepository implements AddressRepositoryInterface {
  save(addressCollection: AddressCollection): void {
    const { walletId } = addressCollection
    const key = `address_${walletId}`
    addressStorage.set(key, JSON.stringify(addressCollection))
  }

  read(walletId: string): AddressCollection | null {
    const key = `address_${walletId}`
    const data = addressStorage.getString(key)
    if (data) {
      return JSON.parse(data) as AddressCollection
    }
    return null
  }

  deleteByWalletId(walletId: string): void {
    const key = `address_${walletId}`
    addressStorage.delete(key)
  }
}

const addressRepository = new AddressRepository()

export default addressRepository
