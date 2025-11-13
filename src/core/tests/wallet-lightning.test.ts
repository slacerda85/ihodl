import { createWallet } from '../../lib/wallet'
import { deriveLightningKeys } from '../../lib/wallet/wallet'

describe('Wallet Creation with Lightning Key Derivation', () => {
  it('should derive Lightning keys correctly', () => {
    const seedPhrase =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    const keys = deriveLightningKeys(seedPhrase)

    expect(keys).toBeDefined()
    expect(keys.nodeKey).toBeDefined()
    expect(keys.nodeKey?.nodeId).toMatch(/^0[23][a-f0-9]{64}$/)
    expect(keys.fundingKeys).toBeDefined()
    expect(keys.fundingKeys?.address).toMatch(/^bc1q/)
  })

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

      // Check Lightning account structure
      const lightningAccount = result.wallet.accounts[1]
      expect(lightningAccount.purpose).toBe(9735)

      // Derive Lightning keys separately
      const keys = deriveLightningKeys(result.seedPhrase)
      expect(keys).toBeDefined()
      expect(keys.nodeKey).toBeDefined()
      expect(keys.nodeKey?.nodeId).toMatch(/^0[23][a-f0-9]{64}$/)
      expect(keys.fundingKeys).toBeDefined()
      expect(keys.fundingKeys?.address).toMatch(/^bc1q/)
    } catch (error) {
      console.error('Test error:', error)
      console.error('Error stack:', (error as Error).stack)
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
    expect(fundingAccount.lightning?.chain).toBe(0)
    expect(fundingAccount.lightning?.lnVer).toBe(0)
    expect(fundingAccount.lightning?.caseIndex).toBe(0)
  })
})
