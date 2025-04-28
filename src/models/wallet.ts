import { Account } from './account'

export type WalletData = {
  walletId: string
  walletName: string
  cold: boolean
  entropy: Uint8Array
  accounts: Account[]
  /**
   * @deprecated Usar `entropy`
   */
  seedPhrase?: string
}
