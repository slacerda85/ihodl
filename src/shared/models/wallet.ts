import { AccountData, AccountDataRaw, AccountType } from './account'

export type WalletData = {
  walletId: string
  walletName: string
  cold: boolean
  masterKey: Uint8Array
  chainCode: Uint8Array
  accounts: Record<AccountType, AccountData>
}

export type WalletDataRaw = Omit<WalletData, 'accounts'> & {
  masterKeyRaw: Record<string, string>
  chainCodeRaw: Record<string, string>
  accounts: Record<AccountType, AccountDataRaw>
}
