import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
  Dispatch,
  SetStateAction,
  useRef,
} from 'react'
import { getWallets, saveSelectedWalletId, getSelectedWalletId } from '@/lib/wallet'
import { Purpose } from '@/models/account'
import { WalletData } from '@/models/wallet'

type WalletContextType = {
  wallets: WalletData[]
  setWallets: Dispatch<SetStateAction<WalletData[]>>
  selectedWalletId: string
  setSelectedWalletId: Dispatch<SetStateAction<string>>
  purpose: Purpose
  setPurpose: Dispatch<SetStateAction<Purpose>>
  loading: boolean
}

const WalletContext = createContext({} as WalletContextType)

export default function WalletProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(false)
  const [wallets, setWallets] = useState<WalletData[]>([])
  const [selectedWalletId, setSelectedWalletId] = useState<string>('')
  const [purpose, setPurpose] = useState<Purpose>(84) // Default to BIP84 (Native SegWit)
  const initialLoadRef = useRef(true)

  useEffect(() => {
    async function loadWallets() {
      try {
        setLoading(true)
        const loadedWallets = await getWallets()
        console.log('Loaded wallets:', loadedWallets)
        setWallets(loadedWallets)

        const selectedId = await getSelectedWalletId()

        if (selectedId) {
          setSelectedWalletId(selectedId)
        } else {
          // If no selected wallet ID is found, set the first wallet as selected
          const firstWallet = loadedWallets[0]
          if (firstWallet) {
            setSelectedWalletId(firstWallet.walletId)
            await saveSelectedWalletId(firstWallet.walletId)
          }
        }
      } catch (error) {
        console.error('Failed to load wallets:', error)
      } finally {
        setLoading(false)
      }
    }

    // Run on initial load or when selectedWalletId changes
    if (initialLoadRef.current) {
      initialLoadRef.current = false
      loadWallets()
    } else if (selectedWalletId) {
      loadWallets()
    }
  }, [selectedWalletId])

  return (
    <WalletContext.Provider
      value={{
        wallets,
        setWallets,
        selectedWalletId,
        setSelectedWalletId,
        purpose,
        setPurpose,
        loading,
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
