import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { createWallet as generateWallet } from './wallet-actions'
import { randomUUID } from 'expo-crypto'
import { useLocalSearchParams } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Tx } from '@/shared/models/transaction'
import { AddressType, WalletProtocol } from './wallet-models'
import TransactionsController from '@/shared/api/controllers/transactions-controller'

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
  fetchTransactions: () => Promise<void>
}

const WalletContext = createContext({} as WalletContextType)

// Storage key for wallets
const WALLETS_STORAGE_KEY = '@ihodl_wallets'

export default function WalletProvider({ children }: { children: ReactNode }) {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [wallets, setWalletsState] = useState<WalletData[]>([])
  const [selectedWalletId, setSelectedWalletId] = useState<string>('')
  const [selectedAddressType, setSelectedAddressType] = useState<AddressType>('bip84')

  const wallet = wallets.find(wallet => wallet.walletId === selectedWalletId)

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
      const newWallet = await generateWallet()
      const walletId = randomUUID()

      const updatedWallets = [
        ...wallets,
        { ...newWallet, walletId, walletName, cold, transactions: [] },
      ]
      setWalletsState(updatedWallets)
      await fetchTransactions()
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
      await fetchTransactions()
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
    console.log(`[getBalance] Starting calculation for wallet: ${walletId}`)

    const wallet = await getWalletById(walletId)
    if (!wallet) {
      console.log(`[getBalance] Wallet not found: ${walletId}`)
      return 0
    }

    console.log(`[getBalance] Found wallet: ${wallet.walletName} (${walletId})`)
    console.log(`[getBalance] Transaction count: ${wallet.transactions.length}`)

    // Extract all wallet addresses across protocols and types
    const walletAddresses = new Set<string>()
    for (const protocol of Object.keys(wallet.addresses) as WalletProtocol[]) {
      for (const addressType of Object.keys(wallet.addresses[protocol]) as AddressType[]) {
        const address = wallet.addresses[protocol][addressType]
        if (address) {
          walletAddresses.add(address)
          console.log(`[getBalance] Added address: ${address} (${protocol}/${addressType})`)
        }
      }
    }

    console.log(`[getBalance] Total unique addresses found: ${walletAddresses.size}`)
    if (walletAddresses.size === 0) {
      console.log(`[getBalance] No addresses found for wallet, returning 0`)
      return 0
    }

    // Map to track unspent outputs
    const utxos = new Map<string, number>() // key: txid:vout, value: amount
    console.log(`[getBalance] Processing ${wallet.transactions.length} transactions`)

    // Process all transactions
    let skippedTxCount = 0
    for (const tx of wallet.transactions) {
      console.log(`[getBalance] Processing tx: ${tx.txid}`)

      // Skip transactions not in active chain
      if (!tx.in_active_chain) {
        console.log(`[getBalance] Skipping tx ${tx.txid} - not in active chain`)
        skippedTxCount++
        continue
      }

      let outputsForWallet = 0
      // Process outputs (vout) - potential incoming funds
      for (const [index, output] of tx.vout.entries()) {
        const addressesInOutput = output.scriptPubKey.addresses || []
        console.log(
          `[getBalance] Checking output #${index} (${output.value} BTC)`,
          addressesInOutput.length ? `Addresses: ${addressesInOutput.join(', ')}` : 'No addresses',
        )

        const matchingAddresses = addressesInOutput.filter(addr => walletAddresses.has(addr))
        if (matchingAddresses.length > 0) {
          // This output belongs to one of our addresses
          const utxoKey = `${tx.txid}:${index}`
          utxos.set(utxoKey, output.value)
          outputsForWallet++
          console.log(
            `[getBalance] ✅ Found output for our wallet: ${utxoKey} = ${output.value} BTC`,
          )
        }
      }

      console.log(`[getBalance] Found ${outputsForWallet} outputs for wallet in tx ${tx.txid}`)

      // Process inputs (vin) - potential outgoing funds
      let spentOutputs = 0
      for (const input of tx.vin) {
        const utxoKey = `${input.txid}:${input.vout}`
        console.log(`[getBalance] Checking input: ${utxoKey}`)
        if (utxos.has(utxoKey)) {
          // This input spends a previously received output
          const amount = utxos.get(utxoKey)
          console.log(`[getBalance] ❌ Found spent output: ${utxoKey} = ${amount} BTC`)
          utxos.delete(utxoKey)
          spentOutputs++
        }
      }

      console.log(`[getBalance] Found ${spentOutputs} spent outputs in tx ${tx.txid}`)
    }

    console.log(`[getBalance] Skipped ${skippedTxCount} transactions not in active chain`)
    console.log(`[getBalance] Remaining ${utxos.size} unspent outputs (UTXOs):`)

    // Sum up all unspent outputs
    let totalBalance = 0
    for (const [utxoKey, value] of utxos.entries()) {
      console.log(`[getBalance] UTXO: ${utxoKey} = ${value} BTC`)
      totalBalance += value
    }

    console.log(`[getBalance] Final balance calculation: ${totalBalance} BTC`)
    return totalBalance
  }

  // Fetch transactions for the selected wallet
  async function fetchTransactions() {
    if (!wallet) {
      console.error('No wallet selected')
      return
    }
    try {
      const transactions = await TransactionsController.getTransactions(
        wallet.addresses?.onchain?.[selectedAddressType] ?? '',
      )
      transactions.forEach(transaction => {
        transaction.vout.forEach(vout => console.log({ vout }))
      })
      setWalletsState(prevWallets => {
        const updatedWallets = prevWallets.map(wallet => {
          if (wallet.walletId === selectedWalletId) {
            return { ...wallet, transactions }
          }
          return wallet
        })
        saveWallets(updatedWallets)
        return updatedWallets
      })
    } catch (error) {
      console.log('Error fetching transactions:', error)
    }
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
        fetchTransactions,
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
