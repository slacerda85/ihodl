import { AddressCollection } from '@/core/models/address'
import { createContext, ReactNode, useState, useEffect, useCallback, useContext } from 'react'
import { useWallet } from '../wallet'
import { useNetwork } from '../network/NetworkProvider'
import AddressService from '@/core/services/address'
import { Utxo } from '@/core/models/tx'
import TransactionService from '@/core/services/transaction'

type AddressContextType = {
  loading: boolean
  addressCollection: AddressCollection | null
  balance: number
  utxos: Utxo[]
}

const AddressContext = createContext<AddressContextType | null>(null)

type AddressProviderProps = {
  children: ReactNode
}

export default function AddressProvider({ children }: AddressProviderProps) {
  const { activeWalletId } = useWallet()
  const { getConnection } = useNetwork()
  const [loading, setLoading] = useState<boolean>(true)
  const [addressCollection, setAddressCollection] = useState<AddressCollection | null>(null)
  const [balance, setBalance] = useState<number>(0)
  const [utxos, setUtxos] = useState<Utxo[]>([])

  // fetch and load address collection
  const loadAddressCollection = useCallback(async () => {
    if (!activeWalletId) return
    setLoading(true)
    const addressService = new AddressService()
    try {
      const connection = await getConnection()
      const addressCollection = await addressService.discover(activeWalletId, connection)
      setAddressCollection(addressCollection)
    } catch (error) {
      console.error('Error loading address collection:', error)
    }
    setLoading(false)
  }, [activeWalletId, getConnection])

  useEffect(() => {
    console.log('useEffect: loadAddressCollection')
    loadAddressCollection()
  }, [loadAddressCollection])

  useEffect(() => {
    if (!addressCollection) return
    const transactionService = new TransactionService()
    const { balance, utxos } = transactionService.calculateBalance(addressCollection.addresses)
    setBalance(balance)
    setUtxos(utxos)
  }, [addressCollection])

  return (
    <AddressContext value={{ loading, addressCollection, balance, utxos }}>
      {children}
    </AddressContext>
  )
}

export function useAddress() {
  const context = useContext(AddressContext)
  if (!context) {
    throw new Error('useAddress must be used within an AddressProvider')
  }
  return context
}
