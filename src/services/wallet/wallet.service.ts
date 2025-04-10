import { Account } from '@/models/account'
import { createRootExtendedKey, fromMnemonic } from '@/services/key'
import { createEntropy, randomUUID } from '@/services/crypto'
import { deleteItem, getItem, setItem } from '@/services/storage'
import { WalletData, WalletDataRaw } from '@/models/wallet'

async function createWallet(
  walletName: string,
  cold: boolean,
  accounts: Account[],
  seedPhrase?: string,
): Promise<WalletData> {
  const entropy = seedPhrase ? fromMnemonic(seedPhrase) : createEntropy(16)
  const rootExtendedKey = createRootExtendedKey(entropy)
  const walletId = randomUUID()

  const walletData: WalletData = {
    walletId,
    walletName,
    cold,
    extendedKey: rootExtendedKey,
    accounts,
  }

  await saveWallet(walletId, walletData)
  await saveWalletId(walletId)

  return walletData
}

async function saveWallet(id: string, walletData: WalletData) {
  await setItem(`wallet_${id}`, walletData)
}

async function getWallet(id: string): Promise<WalletDataRaw | undefined> {
  const wallet = await getItem<WalletDataRaw>(`wallet_${id}`)

  if (!wallet) {
    return undefined
  }
  return wallet
}

async function deleteWallet(id: string): Promise<void> {
  await deleteItem(`wallet_${id}`)
  const walletIds = await getWalletIds()
  const newWalletIds = walletIds.filter(walletId => walletId !== id)
  await setItem('wallet_ids', newWalletIds)
}

async function saveWalletId(id: string) {
  const walletIds = await getItem<string[]>('wallet_ids')
  const newWalletIds = walletIds ? [...walletIds, id] : [id]
  await setItem('wallet_ids', newWalletIds)
}

async function getWalletIds(): Promise<string[]> {
  const walletIds = await getItem<string[]>('wallet_ids')
  return walletIds || []
}

async function getWallets(): Promise<WalletDataRaw[]> {
  try {
    const walletIds = await getWalletIds()

    // Use Promise.allSettled instead of Promise.all to handle individual failures
    const results = await Promise.allSettled(walletIds.map(id => getWallet(id)))

    // Extract successfully retrieved wallets
    const wallets = results
      .filter(
        (result): result is PromiseFulfilledResult<WalletDataRaw | undefined> =>
          result.status === 'fulfilled',
      )
      .map(result => result.value)
      .filter((wallet): wallet is WalletDataRaw => wallet !== undefined)

    return wallets
  } catch (error) {
    console.error('Failed to fetch wallets:', error)
    return [] // Return empty array instead of failing completely
  }
}

export { createWallet, getWallet, deleteWallet, saveWalletId, getWalletIds, saveWallet, getWallets }
