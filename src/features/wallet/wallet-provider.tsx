import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { AddressType, createWallet as generateWallet } from './wallet-actions'
import { randomUUID } from 'expo-crypto'
import { useLocalSearchParams } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Tx } from '@mempool/mempool.js/lib/interfaces/bitcoin/transactions'
import { getAddressTxChain } from '@/shared/lib/bitcoin/rpc/mempool'

/* export interface Transaction {
  id: string
  transactionDate: string
  value: number
  contactName?: string
  address: string
  transactionType: 'P2WPKH' | 'P2TR'
  network: 'onChain' | 'lightning'
} */

// Mock transaction data - in a real app you would get these from your wallet provider
/* const transactions: Transaction[] = [
  {
    id: '1',
    transactionDate: '2025-03-05',
    value: 0.0012,
    contactName: 'Alice',
    address: 'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp8cy',
    transactionType: 'P2WPKH',
    network: 'onChain',
  },
  {
    id: '2',
    transactionDate: '2025-03-05',
    value: -0.0005,
    address: 'bc1pyxpexx6kzhng3cdr7jpfpf5euwzkhcmqn3hzmngssk8d9ntgn3eqdk0dg3',
    transactionType: 'P2WPKH',
    network: 'onChain',
  },
  {
    id: '3',
    transactionDate: '2025-03-01',
    value: 0.0003,
    contactName: 'Bob',
    address: 'lnbc500u1p3qkglupp...',
    transactionType: 'P2TR',
    network: 'lightning',
  },
  {
    id: '4',
    transactionDate: '2025-02-28',
    value: -0.0008,
    address: 'bc1q9h8rsyf9wtwkjz47xklceleqg0aphuwnv5mztq',
    transactionType: 'P2WPKH',
    network: 'onChain',
  },
  {
    id: '5',
    transactionDate: '2025-02-25',
    value: 0.0015,
    contactName: 'Carol',
    address: 'lnbc150u1p3q9hjdpp...',
    transactionType: 'P2TR',
    network: 'lightning',
  },
  {
    id: '6',
    transactionDate: '2025-02-25',
    value: -0.0007,
    address: 'bc1q9h8rsyf9wtwkjz47xklceleqg0aphuwnv5mztq',
    transactionType: 'P2WPKH',
    network: 'onChain',
  },
  {
    id: '7',
    transactionDate: '2025-02-20',
    value: 0.0021,
    contactName: 'Dave',
    address: 'bc1q34aq5drpuwy3wgl9lhup9892qp6svr8ldzyy7c',
    transactionType: 'P2WPKH',
    network: 'onChain',
  },
  {
    id: '8',
    transactionDate: '2025-02-15',
    value: -0.0004,
    address: 'lnbc400u1p3qvgtdpp...',
    transactionType: 'P2TR',
    network: 'lightning',
  },
  {
    id: '9',
    transactionDate: '2025-02-10',
    value: 0.0009,
    contactName: 'Eve',
    address: 'bc1pclwuyj69dskddydugsjshm47a9ccdqjcktqgk02qgqrz25ehfqhsea0p4c',
    transactionType: 'P2TR',
    network: 'onChain',
  },
  {
    id: '10',
    transactionDate: '2025-02-05',
    value: -0.0016,
    address: 'lnbc160u1p3qp8tfpp...',
    transactionType: 'P2TR',
    network: 'lightning',
  },
  {
    id: '11',
    transactionDate: '2025-01-28',
    value: 0.0018,
    contactName: 'Frank',
    address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
    transactionType: 'P2WPKH',
    network: 'onChain',
  },
] */

type WalletData = Awaited<ReturnType<typeof generateWallet>> & {
  walletId: string
  walletName: string
  cold: boolean
  transactions: Tx[]
}

type WalletContextType = {
  createWallet: (
    walletName: string,
    cold: boolean,
  ) => Promise<{ success: boolean; walletId?: string }>
  importWallet: (walletName: string, seedPhrase: string) => Promise<{ success: boolean }>
  getWalletById: (walletId: string) => Promise<WalletData | undefined>
  deleteWallet: (walletId: string) => Promise<void>
  wallets: WalletData[]
  setWallets: (wallets: WalletData[]) => void
  selectedWalletId: string
  setSelectedWalletId: (walletId: string) => void
  selectedAddressType: AddressType
  setSelectedAddressType: (addressType: AddressType) => void
  getBalance: (walletId: string) => Promise<number>
}

const WalletContext = createContext({} as WalletContextType)

// Storage key for wallets
const WALLETS_STORAGE_KEY = '@ihodl_wallets'

export default function WalletProvider({ children }: { children: ReactNode }) {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [wallets, setWalletsState] = useState<WalletData[]>([])
  const [selectedWalletId, setSelectedWalletId] = useState<string>('')
  const [selectedAddressType, setSelectedAddressType] = useState<AddressType>('bip84')
  // const [isLoading, setIsLoading] = useState(true)

  // Save wallets to AsyncStorage
  async function saveWallets(walletsToSave: WalletData[]) {
    try {
      const jsonValue = JSON.stringify(walletsToSave)
      await AsyncStorage.setItem(WALLETS_STORAGE_KEY, jsonValue)
    } catch (error) {
      console.error('Error saving wallets:', error)
    }
  }

  // Custom setter for wallets that also saves to AsyncStorage
  async function setWallets(newWallets: WalletData[]) {
    setWalletsState(newWallets)
    saveWallets(newWallets)
  }

  async function createWallet(
    walletName: string,
    cold: boolean = false,
  ): Promise<{
    success: boolean
    walletId?: string
  }> {
    try {
      const newWallet = await generateWallet({
        accounts: {
          onchain: ['bip44', 'bip49', 'bip84', 'bip86'],
          lightning: ['lightning-node'],
        },
      })
      const walletId = randomUUID()
      // const transactions: Tx[] = await getAddressTxChain(newWallet.addresses['0'])
      const updatedWallets = [
        ...wallets,
        { ...newWallet, walletId, walletName, cold, transactions: [] },
      ]

      setWalletsState(updatedWallets)
      await saveWallets(updatedWallets)

      setSelectedWalletId(walletId)
      return { success: true, walletId }
    } catch (error) {
      console.error(error)
      return { success: false }
    }
  }

  async function importWallet(walletName: string, seedPhrase: string) {
    try {
      const newWallet = await generateWallet({ mnemonic: seedPhrase })
      const walletId = randomUUID()
      // const transactions: Tx[] = await getAddressTxChain(newWallet.addresses.onchain.bip86)
      const updatedWallets = [
        ...wallets,
        { ...newWallet, walletId, walletName, cold: true, transactions: [] },
      ]

      setWalletsState(updatedWallets)
      await saveWallets(updatedWallets)

      setSelectedWalletId(walletId)
      return { success: true }
    } catch (error) {
      console.error(error)
      return { success: false }
    }
  }

  async function getWalletById(walletId: string) {
    return wallets.find(wallet => wallet.walletId === walletId)
  }

  async function deleteWallet(walletId: string) {
    const updatedWallets = wallets.filter(wallet => wallet.walletId !== walletId)
    setWalletsState(updatedWallets)
    await saveWallets(updatedWallets)
  }

  async function getBalance(walletId: string) {
    const wallet = await getWalletById(walletId)
    if (!wallet) {
      return 0
    }

    return wallet.transactions.reduce(
      (acc, tx) =>
        acc +
        (tx.vout.reduce((acc, vout) => acc + vout.value, 0) -
          tx.vin.reduce((acc, vin) => acc + (vin.prevout ? vin.prevout.value : 0), 0)),
      0,
    )
  }

  // Load wallets on component mount
  useEffect(() => {
    // cleanup storage function
    /* const cleanupStorage = async () => {
      await AsyncStorage.removeItem(WALLETS_STORAGE_KEY)
    } */

    // Load wallets from AsyncStorage
    const loadWallets = async () => {
      // await cleanupStorage()

      try {
        // setIsLoading(true)
        const jsonValue = await AsyncStorage.getItem(WALLETS_STORAGE_KEY)
        if (jsonValue != null) {
          const loadedWallets = JSON.parse(jsonValue) as WalletData[]
          setWalletsState(loadedWallets)

          // Set the first wallet as selected if there's no ID from params and we have wallets
          if (!id && loadedWallets.length > 0) {
            setSelectedWalletId(loadedWallets[0].walletId)
          }
        }
      } catch (error) {
        console.error('Error loading wallets:', error)
      } finally {
        // setIsLoading(false)
      }
    }

    loadWallets()
  }, [id])

  // change selected wallet id when navigating to a wallet details screen
  useEffect(() => {
    if (id) {
      setSelectedWalletId(id)
    }
  }, [id])

  return (
    <WalletContext.Provider
      value={{
        createWallet,
        importWallet,
        getWalletById,
        deleteWallet,
        getBalance,
        wallets,
        setWallets,
        selectedWalletId,
        setSelectedWalletId,
        selectedAddressType,
        setSelectedAddressType,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider')
  }

  return context
}
