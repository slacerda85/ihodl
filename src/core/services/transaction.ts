import { Tx } from '../models/tx'
import { AddressService } from './address'

interface TransactionServiceInterface {
  getTransactions(address: string): Promise<Tx[]>
}

export class TransactionService implements TransactionServiceInterface {
  async getTransactions(address: string): Promise<Tx[]> {
    const addressService = new AddressService()

    return addressService.getAddressHistory(address)
  }
}
