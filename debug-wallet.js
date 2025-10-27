const { createWallet } = require('./src/lib/wallet')

try {
  const result = createWallet({
    walletName: 'Test Wallet',
    cold: false,
  })
  console.log('Success:', result)
} catch (error) {
  console.error('Error:', error)
}
