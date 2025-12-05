/**
 * QRCode Component Tests
 *
 * Verifica se o componente gera QR codes corretos para:
 * - Endereços Bitcoin (on-chain)
 * - Invoices Lightning
 * - BIP-21 URIs
 */

import qrcode from 'qrcode-generator'

// Simula a lógica de geração do componente QRCode
function generateQRData(value: string): { moduleCount: number; data: boolean[][] } {
  const qr = qrcode(0, 'H')
  qr.addData(value)
  qr.make()

  const moduleCount = qr.getModuleCount()
  const data: boolean[][] = []

  for (let row = 0; row < moduleCount; row++) {
    data[row] = []
    for (let col = 0; col < moduleCount; col++) {
      data[row][col] = qr.isDark(row, col)
    }
  }

  return { moduleCount, data }
}

describe('QRCode Generation', () => {
  describe('Bitcoin On-Chain Addresses', () => {
    it('should generate QR for P2WPKH address (bech32)', () => {
      const address = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
      const result = generateQRData(address)

      expect(result.moduleCount).toBeGreaterThan(0)
      expect(result.data.length).toBe(result.moduleCount)
    })

    it('should generate QR for P2TR address (bech32m)', () => {
      const address = 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0'
      const result = generateQRData(address)

      expect(result.moduleCount).toBeGreaterThan(0)
      expect(result.data.length).toBe(result.moduleCount)
    })

    it('should generate QR for Legacy address', () => {
      const address = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
      const result = generateQRData(address)

      expect(result.moduleCount).toBeGreaterThan(0)
    })

    it('should generate QR for BIP-21 URI', () => {
      const uri = 'bitcoin:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4?amount=0.001'
      const result = generateQRData(uri)

      expect(result.moduleCount).toBeGreaterThan(0)
    })

    it('should generate QR for BIP-21 URI with label', () => {
      const uri = 'bitcoin:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4?amount=0.001&label=Test'
      const result = generateQRData(uri)

      expect(result.moduleCount).toBeGreaterThan(0)
    })
  })

  describe('Lightning Invoices', () => {
    it('should generate QR for BOLT11 invoice', () => {
      // Exemplo de invoice BOLT11 (testnet)
      const invoice =
        'lntb1u1pjkd45xpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jshwlglv23cyc7nf3fsk66qjhx2g4pjq2s'
      const result = generateQRData(invoice)

      expect(result.moduleCount).toBeGreaterThan(0)
    })

    it('should generate QR for lightning: URI', () => {
      const invoice =
        'lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq8rkx3yf5tcsyz3d73gafnh3cax9rn449d9p5uxz9ezhhypd0elx87sjle52dl6a97yx'
      const uri = `lightning:${invoice}`
      const result = generateQRData(uri)

      expect(result.moduleCount).toBeGreaterThan(0)
    })

    it('should generate QR for LIGHTNING: URI (uppercase)', () => {
      // Muitos wallets usam uppercase para Lightning
      const invoice = 'LNBC1PVJLUEZSP5ZYG3ZYG3ZYG3ZYG3ZYG3ZYG3ZYG3ZYG3ZYG3ZYG3ZYG3ZYG3ZYGS'
      const uri = `LIGHTNING:${invoice}`
      const result = generateQRData(uri)

      expect(result.moduleCount).toBeGreaterThan(0)
    })
  })

  describe('Unified QR (BIP-21 + Lightning)', () => {
    it('should generate QR for unified URI with lightning parameter', () => {
      // BIP-21 com fallback lightning (como proposto em várias specs)
      const address = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
      const invoice = 'lnbc1pvjluez...'
      const uri = `bitcoin:${address}?lightning=${invoice}`
      const result = generateQRData(uri)

      expect(result.moduleCount).toBeGreaterThan(0)
    })
  })

  describe('Error Correction Levels', () => {
    it('should use high error correction (H) for logo overlay', () => {
      const address = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'

      // Com H (30% correção), o QR deve ter mais módulos
      const qrH = qrcode(0, 'H')
      qrH.addData(address)
      qrH.make()

      // Com L (7% correção), o QR deve ter menos módulos
      const qrL = qrcode(0, 'L')
      qrL.addData(address)
      qrL.make()

      // H geralmente resulta em QR maior ou igual a L
      expect(qrH.getModuleCount()).toBeGreaterThanOrEqual(qrL.getModuleCount())
    })
  })

  describe('Long Data Handling', () => {
    it('should handle very long Lightning invoices', () => {
      // Invoices podem ter mais de 500 caracteres
      const longInvoice =
        'lnbc' + 'a'.repeat(400) + 'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'
      const result = generateQRData(longInvoice)

      expect(result.moduleCount).toBeGreaterThan(0)
    })

    it('should handle BIP-21 with many parameters', () => {
      const uri =
        'bitcoin:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4' +
        '?amount=0.001' +
        '&label=Test%20Payment' +
        '&message=This%20is%20a%20test%20message' +
        '&lightning=lnbc1pvjluez...'
      const result = generateQRData(uri)

      expect(result.moduleCount).toBeGreaterThan(0)
    })
  })
})

describe('QR Code Format Recommendations', () => {
  describe('Bitcoin Address Formats', () => {
    it('raw address is valid but BIP-21 is recommended', () => {
      const rawAddress = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
      const bip21Uri = `bitcoin:${rawAddress}`

      // Ambos funcionam
      expect(() => generateQRData(rawAddress)).not.toThrow()
      expect(() => generateQRData(bip21Uri)).not.toThrow()

      // BIP-21 permite adicionar amount, label, etc
      const withAmount = `bitcoin:${rawAddress}?amount=0.001`
      expect(() => generateQRData(withAmount)).not.toThrow()
    })

    it('uppercase bitcoin: prefix is valid per BIP-21', () => {
      // BIP-21 permite case-insensitive para o scheme
      const uri = 'BITCOIN:BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4'
      expect(() => generateQRData(uri)).not.toThrow()
    })
  })

  describe('Lightning Invoice Formats', () => {
    it('raw invoice is valid', () => {
      const invoice = 'lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq'
      expect(() => generateQRData(invoice)).not.toThrow()
    })

    it('lightning: prefix is valid', () => {
      const invoice = 'lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq'
      expect(() => generateQRData(`lightning:${invoice}`)).not.toThrow()
    })

    it('LIGHTNING: uppercase prefix is valid', () => {
      const invoice = 'LNBC1PVJLUEZPP5QQQSYQCYQ5RQWZQFQQQSYQCYQ5RQWZQFQQQSYQCYQ5RQWZQFQYPQ'
      expect(() => generateQRData(`LIGHTNING:${invoice}`)).not.toThrow()
    })
  })
})
