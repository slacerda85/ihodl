import { Tx } from '@/features/transactions/transaction'
import api from '../api'

interface ElectrumResponse<T> {
  result: T
  error: any
  id: string
}

export default class TransactionsController {
  static async getTransactions(address: string): Promise<any> {
    try {
      console.log('getTransactions', address)
      const response = await fetch(`http://localhost:3000/api/transactions/${address}`)
      console.log('response', response)
      const data = await response.json()
      console.log('data', data)
      return data
    } catch (error) {
      console.log('error', error)
      throw error
    }
  }

  static async getTx(txid: string): Promise<any> {
    const response = await api.get<ElectrumResponse<Tx>>(`/transaction/${txid}`)
    return response.data.result
  }
}
