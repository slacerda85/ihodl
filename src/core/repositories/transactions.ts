import { MMKV } from 'react-native-mmkv'
import { Tx } from '../models/tx'

const transactionStorage = new MMKV({
  id: 'transaction-storage',
})

interface TransactionRepositoryInterface {
  readPendingTransactions(walletId: string): Tx[]
  savePendingTransaction(walletId: string, tx: Tx): void
  deletePendingTransaction(walletId: string, txid: string): void
}

export default class TransactionRepository implements TransactionRepositoryInterface {
  savePendingTransaction(walletId: string, tx: Tx): void {
    const key = `pending_transactions_${walletId}`
    const existingData = transactionStorage.getString(key)
    let transactions: Tx[] = []
    if (existingData) {
      transactions = JSON.parse(existingData) as Tx[]
    }

    transactions.push(tx)
    transactionStorage.set(key, JSON.stringify(transactions))
  }
  readPendingTransactions(walletId: string): Tx[] {
    const key = `pending_transactions_${walletId}`
    const data = transactionStorage.getString(key)
    if (data) {
      return JSON.parse(data) as Tx[]
    }
    return []
  }

  deletePendingTransaction(walletId: string, txid: string): void {
    const key = `pending_transactions_${walletId}`
    const existingData = transactionStorage.getString(key)
    if (existingData) {
      let transactions: Tx[] = JSON.parse(existingData) as Tx[]
      transactions = transactions.filter(tx => tx.txid !== txid)
      transactionStorage.set(key, JSON.stringify(transactions))
    }
  }
}
