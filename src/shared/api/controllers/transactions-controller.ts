import { Tx } from '@/features/transactions/transaction'
import api from '../api'
import { AxiosError } from 'axios'

interface ElectrumResponse<T> {
  result: T
  error: any
  id: string
}

export default class TransactionsController {
  static async getBalance(address: string): Promise<number> {
    try {
      console.log('getBalance', address)
      const response = await api.get<number>(`/balance/${address}`)
      console.log('response', response.data)
      const balance = response.data
      return balance
    } catch (error) {
      console.log('error', error)
      throw error
    }
  }

  static async getTransactions(address: string): Promise<Tx[]> {
    if (address.length === 0) {
      throw new Error('Address is empty')
    }
    try {
      const response = await api.get<Tx[]>(`/transactions/${address}`)
      const transactions = response.data
      return transactions
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new Error(error.response?.data.error)
      }
      throw error
    }
  }

  static async getTx(txid: string): Promise<any> {
    const response = await api.get<ElectrumResponse<Tx>>(`/transaction/${txid}`)
    return response.data.result
  }
}
