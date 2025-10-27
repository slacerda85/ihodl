import { createWallet } from '../lib/wallet'

describe('Wallet Creation with Lightning Key Derivation', () => {
  it('should create a wallet with derived Lightning keys', () => {
    try {
      const result = createWallet({
        walletName: 'Test Wallet',
        cold: false,
      })

      expect(result.wallet.walletName).toBe('Test Wallet')
      expect(result.wallet.accounts).toHaveLength(2)

      // Check Bitcoin account
      const bitcoinAccount = result.wallet.accounts[0]
      expect(bitcoinAccount.purpose).toBe(84)
      expect(bitcoinAccount.lightning).toBeUndefined()

      // Check Lightning account
      const lightningAccount = result.wallet.accounts[1]
      expect(lightningAccount.purpose).toBe(9735)
      expect(lightningAccount.lightning).toBeDefined()
      expect(lightningAccount.lightning?.type).toBe('node')
      expect(lightningAccount.lightning?.derivedKeys).toBeDefined()
      expect(lightningAccount.lightning?.derivedKeys?.nodeKey).toBeDefined()
      expect(lightningAccount.lightning?.derivedKeys?.nodeKey?.nodeId).toBeDefined()
    } catch (error) {
      console.error('Test error:', error)
      throw error
    }
  })

  it('should create a wallet with custom Lightning accounts', () => {
    const customAccounts = [
      {
        purpose: 84 as const,
        coinType: 0 as const,
        accountIndex: 0,
      },
      {
        purpose: 9735 as const,
        coinType: 0 as const,
        accountIndex: 0,
        lightning: {
          type: 'funding_wallet' as const,
          chain: 0,
          lnVer: 0,
          caseIndex: 0,
        },
      },
    ]

    const result = createWallet({
      walletName: 'Custom Wallet',
      cold: false,
      accounts: customAccounts,
    })

    expect(result.wallet.accounts).toHaveLength(2)

    const fundingAccount = result.wallet.accounts[1]
    expect(fundingAccount.lightning?.type).toBe('funding_wallet')
    expect(fundingAccount.lightning?.derivedKeys?.fundingKeys).toBeDefined()
    expect(fundingAccount.lightning?.derivedKeys?.fundingKeys?.address).toBeDefined()
  })
})
