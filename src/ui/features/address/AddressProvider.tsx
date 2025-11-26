import { AddressDetails } from '@/core/models/address'
import { createContext, ReactNode, useState, useEffect, useCallback, useContext } from 'react'
import { useWallet } from '../wallet'
import { useNetwork } from '../network/NetworkProvider'
import AddressService from '@/core/services/address'
import { Utxo } from '@/core/models/transaction'
import TransactionService from '@/core/services/transaction'

type AddressContextType = {
  loading: boolean
  addresses: AddressDetails[]
  nextReceiveAddress: string
  nextChangeAddress: string
  balance: number
  utxos: Utxo[]
  usedReceivingAddresses: AddressDetails[]
  usedChangeAddresses: AddressDetails[]
}

const AddressContext = createContext<AddressContextType | null>(null)

type AddressProviderProps = {
  children: ReactNode
}

export default function AddressProvider({ children }: AddressProviderProps) {
  const { activeWalletId } = useWallet()
  const { getConnection } = useNetwork()
  const [loading, setLoading] = useState<boolean>(true)
  const [addresses, setAddresses] = useState<AddressDetails[]>([])
  const [usedReceivingAddresses, setUsedReceivingAddresses] = useState<AddressDetails[]>([])
  const [usedChangeAddresses, setUsedChangeAddresses] = useState<AddressDetails[]>([])
  const [nextReceiveAddress, setNextReceiveAddress] = useState<string>('')
  const [nextChangeAddress, setNextChangeAddress] = useState<string>('')
  const [balance, setBalance] = useState<number>(0)
  const [utxos, setUtxos] = useState<Utxo[]>([])

  // fetch and load address collection
  const loadAddressCollection = useCallback(async () => {
    // check if walletId changed
    if (!activeWalletId) return

    setLoading(true)
    const addressService = new AddressService()
    let nextReceiveAddr: string = ''
    let nextChangeAddr: string = ''
    try {
      const connection = await getConnection()
      const addressCollection = await addressService.discover(connection)
      setAddresses(addressCollection.addresses)
      const usedReceiving = addressCollection.addresses.filter(
        addr => addr.derivationPath.change === 0 && addr.txs.length > 0,
      )
      const usedChange = addressCollection.addresses.filter(
        addr => addr.derivationPath.change === 1 && addr.txs.length > 0,
      )
      setUsedReceivingAddresses(usedReceiving)
      setUsedChangeAddresses(usedChange)

      nextReceiveAddr = addressService.getNextUnusedAddress()
      nextChangeAddr = addressService.getNextChangeAddress()
    } catch (error) {
      console.error('Error loading address collection:', error)
    }
    setNextReceiveAddress(nextReceiveAddr)
    setNextChangeAddress(nextChangeAddr)
    setLoading(false)
  }, [activeWalletId, getConnection])

  useEffect(() => {
    console.log('useEffect: loadAddressCollection')
    loadAddressCollection()
  }, [loadAddressCollection])

  useEffect(() => {
    if (!addresses) return
    const transactionService = new TransactionService()
    const { balance, utxos } = transactionService.calculateBalance(addresses)
    setBalance(balance)
    setUtxos(utxos)
  }, [addresses])

  return (
    <AddressContext
      value={{
        loading,
        addresses,
        usedReceivingAddresses,
        usedChangeAddresses,
        nextReceiveAddress,
        nextChangeAddress,
        balance,
        utxos,
      }}
    >
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
