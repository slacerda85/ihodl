import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
  useCallback,
  Dispatch,
  SetStateAction,
} from 'react'
import {
  createWallet as createWalletAction,
  deleteWallet as deleteWalletAction,
  deleteWallets,
  getWallets as getWalletsAction,
} from '@/services/wallet'
import { Account, Purpose } from '@/models/account'
import { WalletData } from '@/models/wallet'

type WalletContextType = {
  wallets: WalletData[]
  setWallets: Dispatch<SetStateAction<WalletData[]>>
  selectedWalletId: string
  setSelectedWalletId: Dispatch<SetStateAction<string>>
  purpose: Purpose
  setPurpose: Dispatch<SetStateAction<Purpose>>
  // Action wrappers
  createWallet: (
    walletName: string,
    cold: boolean,
    accounts: Account[],
  ) => Promise<{ success: boolean }>
  importWallet: (
    walletName: string,
    mnemonic: string,
    cold: boolean,
    accounts: Account[],
  ) => Promise<{ success: boolean }>
  deleteWallet: (walletId: string) => Promise<boolean>
}

const WalletContext = createContext({} as WalletContextType)

export default function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<WalletData[]>([])
  const [selectedWalletId, setSelectedWalletId] = useState<string>('')
  const [purpose, setPurpose] = useState<Purpose>(84) // Default to BIP84 (Native SegWit)

  useEffect(() => {
    async function loadWallets() {
      console.log('loadWallets callback called')
      if (wallets.length > 0) {
        return // Wallets already loaded
      }
      try {
        const loadedWallets = await getWalletsAction()
        console.log(JSON.stringify(loadedWallets, null, 2))
        const formattedWallets: WalletData[] = loadedWallets.map(wallet => {
          return {
            ...wallet,
            extendedKey: new Uint8Array(
              Object.values(wallet.extendedKeyRaw).map(value => Number(value)),
            ),
          }
        })
        setWallets(formattedWallets)
        // Set the first wallet as selected if none is selected yet and wallets exist
        if (loadedWallets.length > 0 && !selectedWalletId) {
          setSelectedWalletId(loadedWallets[0].walletId)
        }
      } catch (error) {
        console.error('Failed to load wallets:', error)
      }
    }

    loadWallets()
  }, [selectedWalletId, wallets.length])

  // Wallet creation wrapper
  const createWallet = useCallback(
    async (walletName: string, cold = false, accounts: Account[]) => {
      try {
        const newWallet = await createWalletAction(walletName, cold, accounts)

        setWallets(prev => [...prev, newWallet])
        setSelectedWalletId(newWallet.walletId)

        return { success: true }
      } catch (error) {
        console.error('Error creating wallet:', error)
        return { success: false }
      }
    },
    [],
  )

  // Import wallet wrapper
  const importWallet = async (
    walletName: string,
    mnemonic: string,
    cold: boolean = false,
    accounts: Account[],
  ) => {
    try {
      const importedWallet = await createWalletAction(walletName, cold, accounts, mnemonic)

      setWallets(prev => [...prev, importedWallet])
      setSelectedWalletId(importedWallet.walletId)

      return { success: true }
    } catch (error) {
      console.error('Error importing wallet:', error)
      return { success: false }
    }
  }

  // Delete wallet wrapper
  const deleteWallet = useCallback(
    async (walletId: string) => {
      try {
        await deleteWalletAction(walletId)

        setWallets(prev => prev.filter(w => w.walletId !== walletId))

        // If the deleted wallet was selected, select another one if available
        if (selectedWalletId === walletId) {
          const remainingWallets = wallets.filter(w => w.walletId !== walletId)
          if (remainingWallets.length > 0) {
            setSelectedWalletId(remainingWallets[0].walletId)
          } else {
            setSelectedWalletId('')
          }
        }

        return true
      } catch (error) {
        console.error('Error deleting wallet:', error)
        return false
      }
    },
    [wallets, selectedWalletId],
  )

  return (
    <WalletContext.Provider
      value={{
        wallets,
        setWallets,
        selectedWalletId,
        setSelectedWalletId,
        purpose,
        setPurpose,
        createWallet,
        importWallet,
        deleteWallet,
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
