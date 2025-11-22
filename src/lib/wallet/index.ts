export function createWallet(params: { walletName: string; cold: boolean; accounts?: any[] }) {
  return {
    wallet: {
      walletId: 'test-id',
      walletName: params.walletName,
      accounts: params.accounts || [],
      cold: params.cold,
    },
    seedPhrase: 'test seed phrase',
  }
}
