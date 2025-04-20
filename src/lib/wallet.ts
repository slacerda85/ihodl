import { AccountToAdd } from '@/models/account'
import { toMnemonic } from '@/lib/key'
import { createEntropy, randomUUID } from '@/lib/crypto'
import { deleteItem, getItem, setItem } from '@/lib/storage'
import { WalletData } from '@/models/wallet'

async function createWallet(
  walletName: string,
  cold: boolean,
  accounts: AccountToAdd[],
  seedPhrase?: string,
): Promise<{
  success: boolean
  walletId: string
}> {
  try {
    const walletId = randomUUID()

    const mnemonic = seedPhrase ?? toMnemonic(createEntropy(12))

    const newWallet: WalletData = {
      walletId,
      walletName,
      cold,
      seedPhrase: mnemonic,
      accounts,
    }

    await saveWallet(newWallet)

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

async function saveSelectedWalletId(walletId: string) {
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
  const walletIds = await getWalletIds()
  const newWalletIds = walletIds.filter(walletId => walletId !== id)
  await setItem('wallet_ids', newWalletIds)
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

export {
  createWallet,
  getWallet,
  deleteWallet,
  saveWalletId,
  getWalletIds,
  saveWallet,
  getWallets,
  deleteWallets,
  saveSelectedWalletId,
  getSelectedWalletId,
}
