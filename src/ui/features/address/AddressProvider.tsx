import { AddressDetails } from '@/core/models/address'
import {
  createContext,
  ReactNode,
  useState,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react'
import { useWallet } from '../wallet'
import { useNetworkConnection } from '../app-provider/AppProvider'
import { addressService, transactionService } from '@/core/services'
import { Utxo } from '@/core/models/transaction'
import { useActiveWalletId } from '../wallet/WalletProviderV2'

type AddressContextType = {
  loading: boolean
  addresses: AddressDetails[]
  nextReceiveAddress: string
  nextChangeAddress: string
  balance: number
  utxos: Utxo[]
  usedReceivingAddresses: AddressDetails[]
  usedChangeAddresses: AddressDetails[]
  refresh: () => Promise<void>
}

const AddressContext = createContext<AddressContextType | null>(null)

type AddressProviderProps = {
  children: ReactNode
}

/** Estado consolidado para evitar múltiplos re-renders */
type AddressState = {
  loading: boolean
  addresses: AddressDetails[]
  nextReceiveAddress: string
  nextChangeAddress: string
}

const initialState: AddressState = {
  loading: true,
  addresses: [],
  nextReceiveAddress: '',
  nextChangeAddress: '',
}

export default function AddressProvider({ children }: AddressProviderProps) {
  const activeWalletId = useActiveWalletId()
  const getConnection = useNetworkConnection()

  // Estado consolidado para reduzir re-renders
  const [state, setState] = useState<AddressState>(initialState)
  const isLoadingRef = useRef(false)

  // Derivar balance e utxos de addresses via useMemo (não causa re-render extra)
  const { balance, utxos } = useMemo(() => {
    if (state.addresses.length === 0) {
      return { balance: 0, utxos: [] as Utxo[] }
    }
    return transactionService.calculateBalance(state.addresses)
  }, [state.addresses])

  // Derivar used addresses via useMemo
  const usedReceivingAddresses = useMemo(
    () => state.addresses.filter(addr => addr.derivationPath.change === 0 && addr.txs.length > 0),
    [state.addresses],
  )

  const usedChangeAddresses = useMemo(
    () => state.addresses.filter(addr => addr.derivationPath.change === 1 && addr.txs.length > 0),
    [state.addresses],
  )

  // Função de carregamento que atualiza estado de uma vez
  const load = useCallback(async () => {
    if (!activeWalletId || isLoadingRef.current) return
    isLoadingRef.current = true

    // Marcar loading no início
    setState(prev => ({ ...prev, loading: true }))

    try {
      const connection = await getConnection()
      const addressCollection = await addressService.discover(connection)

      const nextReceiveAddr = addressService.getNextUnusedAddress()
      const nextChangeAddr = addressService.getNextChangeAddress()

      // Atualizar tudo de uma vez
      setState({
        loading: false,
        addresses: addressCollection.addresses,
        nextReceiveAddress: nextReceiveAddr,
        nextChangeAddress: nextChangeAddr,
      })
      isLoadingRef.current = false
    } catch (error) {
      console.error('Error loading address collection:', error)
      setState(prev => ({ ...prev, loading: false }))
      isLoadingRef.current = false
    }
  }, [activeWalletId, getConnection])

  // Effect apenas para disparar o load inicial
  useEffect(() => {
    void (async () => {
      await load()
    })()
  }, [load])

  const value = useMemo(
    () => ({
      loading: state.loading,
      addresses: state.addresses,
      usedReceivingAddresses,
      usedChangeAddresses,
      nextReceiveAddress: state.nextReceiveAddress,
      nextChangeAddress: state.nextChangeAddress,
      balance,
      utxos,
      refresh: load,
    }),
    [
      state.loading,
      state.addresses,
      usedReceivingAddresses,
      usedChangeAddresses,
      state.nextReceiveAddress,
      state.nextChangeAddress,
      balance,
      utxos,
      load,
    ],
  )

  return <AddressContext value={value}>{children}</AddressContext>
}

export function useAddress() {
  const context = useContext(AddressContext)
  if (!context) {
    throw new Error('useAddress must be used within an AddressProvider')
  }
  return context
}
