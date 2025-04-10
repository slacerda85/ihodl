import { AxiosError } from 'axios'
import api from '../api'
import { Tx } from '@/models/transaction'

/* async function getTransaction(txid: string): Promise<Tx> {
  const response = await api.get<Tx>(`/transaction/${txid}`)
  return response.data
} */

async function getTransactions(address: string): Promise<Tx[]> {
  if (address.length === 0) {
    throw new Error('Address is empty')
  }
  try {
    const response = await api.get<Tx[]>(`/transactions/${address}`)

    const transactions = response.data
    return transactions
  } catch (error) {
    console.warn('api.transactions.getTransactions error')
    console.warn(JSON.stringify(error, null, 2))
    if (error instanceof AxiosError) {
      throw new Error(error.response?.data.error)
    }
    throw error
  }
}

async function getTransactionsMultiple(addresses: string[]): Promise<Tx[]> {
  if (addresses.length === 0) {
    throw new Error('Addresses are empty')
  }
  try {
    const response = await api.post<Tx[]>('/transactions/multiple', {
      addresses,
    })
    const transactions = response.data
    return transactions
  } catch (error) {
    console.warn('api.transactions.getTransactionsMultiple error')
    console.warn(JSON.stringify(error, null, 2))
    if (error instanceof AxiosError) {
      throw new Error(error.response?.data.error)
    }
    throw error
  }
}

async function getBalance(address: string): Promise<number> {
  if (address.length === 0) {
    throw new Error('Address is empty')
  }
  try {
    const response = await api.get<number>(`/balance/${address}`)
    const balance = response.data
    return balance
  } catch (error) {
    console.warn('api.transactions.getBalance error')
    console.error(JSON.stringify(error, null, 2))
    if (error instanceof AxiosError) {
      throw new Error(error.response?.data.error)
    }
    throw error
  }
}

const transactionsApi = {
  // getTransaction,
  getTransactions,
  getTransactionsMultiple,
  getBalance,
}

export default transactionsApi
