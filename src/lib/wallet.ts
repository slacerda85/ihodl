import { Account } from '@/models/account'
import { createRootExtendedKey, fromMnemonic, toMnemonic } from '@/lib/key'
import { createEntropy, randomUUID } from '@/lib/crypto'
import { deleteItem, getItem, setItem } from '@/lib/storage'
import { WalletData } from '@/models/wallet'
import { getTxHistory } from './transactions'
import { calculateBalance } from './account'

interface CreateWalletParams {
  walletName: string
  seedPhrase?: string
  cold: boolean
  accounts?: Account[]
}

async function createWallet({
  walletName,
  seedPhrase,
  cold,
  accounts,
}: CreateWalletParams): Promise<{
  success: boolean
  walletId: string
}> {
  try {
    const walletId = randomUUID()
    const mnemonic = seedPhrase ?? toMnemonic(createEntropy(12))
    const accountsToAdd = accounts ?? [
      {
        purpose: 84,
        coinType: 0,
        accountIndex: 0,
      },
    ]

    const newWallet: WalletData = {
      walletId,
      walletName,
      cold,
      seedPhrase: mnemonic,
      accounts: accountsToAdd,
    }

    // save to storage
    const { success: saveSuccess } = await saveWallet(newWallet)

    if (!saveSuccess) {
      throw new Error('Failed to save wallet')
    }
    // set the created wallet as selected wallet
    await setItem('selected_wallet_id', newWallet.walletId)

    return {
      success: true,
      walletId,
    }
  } catch (error) {
    console.error('Error creating wallet:', error)
    throw new Error('Failed to create wallet')
  }
}

async function saveWallet(walletData: WalletData) {
  await setItem(`wallet_${walletData.walletId}`, walletData)
  await saveWalletId(walletData.walletId)
  return { success: true }
}

async function setSelectedWalletId(walletId: string) {
  await setItem('selected_wallet_id', walletId)
  return { success: true }
}

async function getSelectedWalletId(): Promise<string | undefined> {
  const selectedWalletId = await getItem<string>('selected_wallet_id')
  return selectedWalletId
}

async function getWallet(id: string): Promise<WalletData | undefined> {
  const wallet = await getItem<WalletData>(`wallet_${id}`)

  if (!wallet) {
    return undefined
  }

  return wallet
}

async function deleteWallet(id: string): Promise<{ success: boolean }> {
  await deleteItem(`wallet_${id}`)
  // remove id from id index
  const walletIds = await getWalletIds()
  const newWalletIds = walletIds.filter(walletId => walletId !== id)
  await setItem('wallet_ids', newWalletIds)
  // now set the first wallet as selected wallet if it was this one
  const selectedWalletId = await getSelectedWalletId()
  if (selectedWalletId === id) {
    const newSelectedWalletId = newWalletIds[0] || undefined
    await setItem('selected_wallet_id', newSelectedWalletId)
  }
  return { success: true }
}

async function saveWalletId(id: string): Promise<{ success: boolean }> {
  const walletIds = await getItem<string[]>('wallet_ids')
  const newWalletIds = walletIds ? [...walletIds, id] : [id]
  await setItem('wallet_ids', newWalletIds)
  return { success: true }
}

async function getWalletIds(): Promise<string[]> {
  const walletIds = await getItem<string[]>('wallet_ids')
  return walletIds || []
}

async function getWallets(): Promise<WalletData[]> {
  try {
    const walletIds = await getWalletIds()

    // Use Promise.allSettled instead of Promise.all to handle individual failures
    const results = await Promise.allSettled(walletIds.map(id => getWallet(id)))

    // Extract successfully retrieved wallets
    const loadedWallets = results
      .filter(
        (result): result is PromiseFulfilledResult<WalletData | undefined> =>
          result.status === 'fulfilled',
      )
      .map(result => result.value)
      .filter((wallet): wallet is WalletData => wallet !== undefined)

    return loadedWallets
  } catch (error) {
    console.error('Failed to fetch wallets:', error)
    return [] // Return empty array instead of failing completely
  }
}

async function deleteWallets() {
  // Clear all wallet data
  const walletIds = await getWalletIds()
  await Promise.all(walletIds.map(id => deleteWallet(id)))
}

async function getBalance(wallet: WalletData): Promise<number> {
  const { accounts, seedPhrase } = wallet
  const { purpose, coinType, accountIndex } = accounts[0]
  const entropy = fromMnemonic(seedPhrase)
  const extendedKey = createRootExtendedKey(entropy)
  const { txHistory } = await getTxHistory({
    extendedKey,
    purpose,
    coinType,
    accountStartIndex: accountIndex,
  })

  const { balance } = calculateBalance(txHistory)
  return balance
}

/* export {
  createWallet,
  getWallet,
  deleteWallet,
  saveWalletId,
  getWalletIds,
  saveWallet,
  getWallets,
  deleteWallets,
  setSelectedWalletId,
  getSelectedWalletId,
  getBalance,
} */
