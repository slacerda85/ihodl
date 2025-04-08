import { randomUUID } from 'expo-crypto'
import { AccountData, AccountProtocol, AccountType, accountPath } from '@/core/models/account'
import { WalletData, WalletDataRaw } from '@/core/models/wallet'
import { createEntropy } from '@/shared/lib/bitcoin/crypto'
import {
  createMasterKey,
  createPublicKey,
  deriveFromPath,
  fromMnemonic,
  serializePublicKeyForSegWit,
} from '@/shared/lib/bitcoin/key'
import storage from '../storage'

// Types
interface CreateWalletProps {
  walletName: string
  mnemonic?: string
  cold?: boolean
  accountTypes?: AccountType[]
}

// Default configurations
const defaultAccountTypes: AccountType[] = ['bip84']

/**
 * Creates a new wallet with specified or default account types
 */
export async function createWallet(options: CreateWalletProps) {
  const { walletName, mnemonic, cold = false, accountTypes = defaultAccountTypes } = options || {}

  const seed = mnemonic !== undefined ? fromMnemonic(mnemonic) : createEntropy(16)
  const { masterKey, chainCode } = createMasterKey(seed)

  // mount accounts object
  const newAccounts: Record<AccountType, AccountData> = {} as Record<AccountType, AccountData>

  accountTypes.forEach(accountType => {
    const path = accountPath[accountType]
    if (!path) {
      return
    }

    const accountNode = deriveFromPath(masterKey, chainCode, path)
    const { derivedKey, derivedChainCode, childIndex, depth, parentFingerprint } = accountNode // for typescript to ensure we are using the derived key

    newAccounts[accountType] = {
      privateKey: derivedKey,
      chainCode: derivedChainCode,
      childIndex,
      parentFingerprint,
      depth,
    }
  })

  const walletId = randomUUID()

  const walletData: WalletData = {
    walletId,
    walletName,
    cold,
    masterKey,
    chainCode,
    accounts: newAccounts,
  }

  await storage.setItem(`wallet_${walletId}`, walletData)
  await saveWalletId(walletId)

  return walletData
}

export async function getWallet(id: string): Promise<WalletDataRaw | undefined> {
  console.log('getWallet', id)
  const wallet = await storage.getItem<WalletDataRaw>(`wallet_${id}`)

  if (!wallet) {
    return undefined
  }
  return wallet
}

export async function deleteWallet(id: string): Promise<void> {
  await storage.deleteItem(`wallet_${id}`)
  const walletIds = await getWalletIds()
  const newWalletIds = walletIds.filter(walletId => walletId !== id)
  await storage.setItem('wallet_ids', newWalletIds)
}

async function saveWalletId(id: string) {
  const walletIds = await storage.getItem<string[]>('wallet_ids')
  const newWalletIds = walletIds ? [...walletIds, id] : [id]
  await storage.setItem('wallet_ids', newWalletIds)
}

async function getWalletIds(): Promise<string[]> {
  const walletIds = await storage.getItem<string[]>('wallet_ids')
  return walletIds || []
}

export async function getWallets(): Promise<WalletDataRaw[]> {
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

export async function resetWallets(): Promise<void> {
  const walletIds = await getWalletIds()
  await Promise.all(walletIds.map(id => deleteWallet(id)))
}
