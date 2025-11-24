import { AddressCollection, AddressDetails } from '@/core/models/address'
import { createContext, ReactNode, useState, useEffect, useCallback, useContext } from 'react'
import { useWallet } from '../wallet'
import { useNetwork } from '../network/NetworkProvider'
import AddressService from '@/core/services/address'
import { Utxo } from '@/core/models/tx'
import TransactionService from '@/core/services/transaction'

type AddressContextType = {
  loading: boolean
  addresses: AddressDetails[]
  nextReceiveAddress: string
  nextChangeAddress: string
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
  const [addresses, setAddresses] = useState<AddressDetails[]>([])
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
    let nextReceiveAddr: AddressDetails | undefined
    let nextChangeAddr: AddressDetails | undefined
    try {
      const connection = await getConnection()
      const addressCollection = await addressService.discover(connection)
      setAddresses(addressCollection.addresses)
      nextReceiveAddr = addressCollection.addresses.find(
        addr =>
          addr.derivationPath.addressIndex === addressCollection.nextReceiveIndex &&
          addr.derivationPath.change === 0,
      )
      nextChangeAddr = addressCollection.addresses.find(
        addr =>
          addr.derivationPath.addressIndex === addressCollection.nextChangeIndex &&
          addr.derivationPath.change === 1,
      )
      // setNextUnusedAddressIndex(addressCollection.nextReceiveIndex)
      // setAddressCollection(addressCollection)
    } catch (error) {
      console.error('Error loading address collection:', error)
    }
    const nextReceiveAddressValue = nextReceiveAddr?.address || ''
    const nextChangeAddressValue = nextChangeAddr?.address || ''
    setNextReceiveAddress(nextReceiveAddressValue)
    setNextChangeAddress(nextChangeAddressValue)
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
      value={{ loading, addresses, nextReceiveAddress, nextChangeAddress, balance, utxos }}
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
