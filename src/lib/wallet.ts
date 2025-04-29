import { Account } from '@/models/account'
import { fromMnemonic, toMnemonic } from '@/lib/key'
import { createEntropy, randomUUID } from '@/lib/crypto'
import { WalletData } from '@/models/wallet'

export interface CreateWalletParams {
  walletName: string
  seedPhrase?: string
  cold: boolean
  accounts?: Account[]
}

function createWallet({ walletName, seedPhrase, cold, accounts }: CreateWalletParams): WalletData {
  try {
    const walletId = randomUUID()
    const entropy = seedPhrase ? fromMnemonic(seedPhrase) : createEntropy(16)

    const defaultAccounts: Account[] = [
      // Bitcoin Native Segwit
      {
        purpose: 84,
        coinType: 0,
        accountIndex: 0,
      },
      // Bitcoin Taproot (future)
      {
        purpose: 86,
        coinType: 0,
        accountIndex: 0,
      },
    ]

    const accountsToAdd = accounts ?? defaultAccounts

    const seedPhraseToUse = seedPhrase ?? toMnemonic(entropy)

    const newWallet: WalletData = {
      walletId,
      walletName,
      seedPhrase: seedPhraseToUse,
      cold,
      accounts: accountsToAdd,
    }
    return newWallet
  } catch (error) {
    console.error('Error creating wallet:', error)
    throw new Error('Failed to create wallet')
  }
}

export { createWallet }
