import type {
  LightningClient,
  LightningClientConfig,
  LightningNode,
  PaymentResult,
  LightningInvoice,
  LightningPayment,
  CreateInvoiceParams,
} from './types'

/**
 * Eclair client implementation
 */
export class EclairClient implements LightningClient {
  private config: LightningClientConfig

  constructor(config: LightningClientConfig) {
    this.config = config
  }

  async getInfo(): Promise<LightningNode> {
    try {
      const response = await fetch(`${this.config.url}/getinfo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}), // Eclair expects empty JSON body
      })

      if (!response.ok) {
        throw new Error(`Eclair API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return {
        pubKey: data.nodeId,
        alias: data.alias || data.nodeId.substring(0, 20),
        color: data.color || '#FF6B35',
        numChannels: data.channels?.normal || 0,
        totalCapacity: 0, // Eclair doesn't provide this in getinfo
        lastUpdate: Date.now(),
        addresses: [],
        features: {},
      }
    } catch (error) {
      console.error('Eclair getInfo error:', error)
      throw new Error(`Failed to get Eclair node info: ${error}`)
    }
  }

  async createInvoice(params: CreateInvoiceParams): Promise<LightningInvoice> {
    try {
      const requestBody = {
        amountMsat: params.amount * 1000,
        description: params.description || '',
        expireIn: params.expiry || 3600,
      }

      const response = await fetch(`${this.config.url}/createinvoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`Eclair API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return {
        paymentRequest: data.serialized,
        paymentHash: data.paymentHash,
        amount: params.amount,
        description: params.description,
        expiry: params.expiry || 3600,
        timestamp: Date.now(),
        payeePubKey: '', // Will be filled when invoice is decoded
        minFinalCltvExpiry: 144,
        routingHints: [],
        features: [],
        signature: '',
      }
    } catch (error) {
      console.error('Eclair createInvoice error:', error)
      throw new Error(`Failed to create Eclair invoice: ${error}`)
    }
  }

  async payInvoice(paymentRequest: string): Promise<PaymentResult> {
    // TODO: Implement Eclair REST API call to payinvoice
    throw new Error('Eclair payInvoice not implemented')
  }

  async listPayments(): Promise<LightningPayment[]> {
    // TODO: Implement Eclair REST API call to payments
    throw new Error('Eclair listPayments not implemented')
  }

  async listInvoices(): Promise<LightningInvoice[]> {
    // TODO: Implement Eclair REST API call to invoices
    throw new Error('Eclair listInvoices not implemented')
  }

  async estimateFee(
    destination: string,
    amount: number,
  ): Promise<{ fee: number; probability: number }> {
    // TODO: Implement Eclair REST API call to findroute
    throw new Error('Eclair estimateFee not implemented')
  }
}
