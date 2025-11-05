/** @type {import('detox').Detox} */
const { by, device, element, expect, waitFor } = require('detox')

/* global describe, beforeAll, beforeEach, it */

describe('Lightning Network E2E Tests', () => {
  beforeAll(async () => {
    await device.launchApp()
  })

  beforeEach(async () => {
    await device.reloadReactNative()
    // Navigate to wallet if not already there
    // This assumes the app starts at wallet screen or has navigation
  })

  describe('Wallet Initialization', () => {
    it('should initialize Bitcoin wallet with seed', async () => {
      // Test wallet creation or import
      // This would require UI elements for wallet creation
      await expect(element(by.id('wallet-screen'))).toBeVisible()
    })

    it('should derive Lightning keys from wallet seed', async () => {
      // Verify Lightning wallet is initialized after Bitcoin wallet
      // Check if LightningProvider context is available
    })
  })

  describe('Receive Lightning Payment', () => {
    beforeEach(async () => {
      // Navigate to Lightning receive screen
      await element(by.id('lightning-tab')).tap()
      await element(by.id('receive-lightning-button')).tap()
    })

    it('should generate Lightning invoice automatically', async () => {
      // Wait for invoice generation
      await waitFor(element(by.id('qr-code')))
        .toBeVisible()
        .withTimeout(10000)

      // Verify QR code is displayed
      await expect(element(by.id('qr-code'))).toBeVisible()

      // Verify invoice text is shown
      await expect(element(by.id('invoice-text'))).toBeVisible()
    })

    it('should allow copying invoice to clipboard', async () => {
      await waitFor(element(by.id('copy-invoice-button')))
        .toBeVisible()
        .withTimeout(10000)

      await element(by.id('copy-invoice-button')).tap()

      // Verify success message or clipboard content
      await expect(element(by.text('Copiado!'))).toBeVisible()
    })

    it('should allow sharing invoice', async () => {
      await waitFor(element(by.id('share-invoice-button')))
        .toBeVisible()
        .withTimeout(10000)

      await element(by.id('share-invoice-button')).tap()

      // On iOS/Android, this would open share sheet
      // We can check if share intent was triggered
    })

    it('should generate invoice with custom amount', async () => {
      // Open advanced settings
      await element(by.id('advanced-settings-button')).tap()

      // Enter amount
      await element(by.id('amount-input')).typeText('1000')
      await element(by.id('description-input')).typeText('Test payment')

      // Generate custom invoice
      await element(by.id('generate-custom-invoice-button')).tap()

      // Verify QR code updates
      await expect(element(by.id('qr-code'))).toBeVisible()
    })
  })

  describe('Send Lightning Payment', () => {
    beforeEach(async () => {
      // Navigate to Lightning send screen
      await element(by.id('lightning-tab')).tap()
      await element(by.id('send-lightning-button')).tap()
    })

    it('should paste invoice from clipboard', async () => {
      // Mock clipboard content (would need to set up device clipboard)
      // For testing, we can directly set the invoice text

      const testInvoice = 'lnbc10u1p3wxyhupp...' // Valid test invoice

      await element(by.id('invoice-input')).typeText(testInvoice)

      // Verify invoice is valid
      await expect(element(by.text('Invoice válida'))).toBeVisible()
    })

    it('should prepare payment and show details', async () => {
      const testInvoice = 'lnbc10u1p3wxyhupp...' // Valid test invoice

      await element(by.id('invoice-input')).typeText(testInvoice)

      // Prepare payment
      await element(by.id('prepare-payment-button')).tap()

      // Wait for preparation
      await waitFor(element(by.id('payment-details')))
        .toBeVisible()
        .withTimeout(10000)

      // Verify payment details are shown
      await expect(element(by.id('payment-amount'))).toBeVisible()
      await expect(element(by.id('payment-fee'))).toBeVisible()
    })

    it('should send payment successfully', async () => {
      const testInvoice = 'lnbc10u1p3wxyhupp...' // Valid test invoice

      await element(by.id('invoice-input')).typeText(testInvoice)
      await element(by.id('prepare-payment-button')).tap()

      await waitFor(element(by.id('send-payment-button')))
        .toBeVisible()
        .withTimeout(10000)

      // Send payment
      await element(by.id('send-payment-button')).tap()

      // Verify success message
      await expect(element(by.text('Pagamento enviado com sucesso!'))).toBeVisible()
    })

    it('should handle invalid invoice', async () => {
      const invalidInvoice = 'invalid-invoice-text'

      await element(by.id('invoice-input')).typeText(invalidInvoice)

      // Try to prepare payment
      await element(by.id('prepare-payment-button')).tap()

      // Verify error message
      await expect(element(by.text('Por favor insira uma invoice Lightning válida'))).toBeVisible()
    })
  })

  describe('Lightning Network State', () => {
    it('should show network connection status', async () => {
      await element(by.id('lightning-tab')).tap()

      // Check if network status is displayed
      await expect(element(by.id('network-status'))).toBeVisible()
    })

    it('should handle network disconnection gracefully', async () => {
      // This would require mocking network disconnection
      // Verify UI handles offline state properly
    })
  })

  describe('Error Handling', () => {
    it('should handle invoice generation failure', async () => {
      // Mock failure in invoice generation
      // Navigate to receive screen
      await element(by.id('lightning-tab')).tap()
      await element(by.id('receive-lightning-button')).tap()

      // If generation fails, should show error message
      await expect(element(by.text('Falha ao gerar invoice'))).toBeVisible()
    })

    it('should handle payment sending failure', async () => {
      // Mock payment failure
      const testInvoice = 'lnbc10u1p3wxyhupp...'

      await element(by.id('lightning-tab')).tap()
      await element(by.id('send-lightning-button')).tap()
      await element(by.id('invoice-input')).typeText(testInvoice)
      await element(by.id('prepare-payment-button')).tap()
      await element(by.id('send-payment-button')).tap()

      // Verify error handling
      await expect(element(by.text('Falha ao enviar pagamento'))).toBeVisible()
    })
  })
})
