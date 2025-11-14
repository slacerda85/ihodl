import { Tx } from '../models/tx'
import { AddressService } from './address'

interface TransactionServiceInterface {
  getTransactionsByAddress(address: string): Promise<Tx[]>
}

export class TransactionService implements TransactionServiceInterface {
  async getTransactionsByAddress(address: string): Promise<Tx[]> {
    const addressService = new AddressService()

    return addressService.getAddressHistory(address)
  }
}
