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
 * CLN (Core Lightning) client implementation
 */
export class CLNClient implements LightningClient {
  private config: LightningClientConfig

  constructor(config: LightningClientConfig) {
    this.config = config
  }

  async getInfo(): Promise<LightningNode> {
    try {
      const response = await fetch(`${this.config.url}/v1/getinfo`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.auth.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`CLN API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return {
        pubKey: data.id,
        alias: data.alias || data.id.substring(0, 20),
        color: data.color || '#FF6B35',
        numChannels: data.num_active_channels || 0,
        totalCapacity: parseInt(data.total_capacity || '0'),
        lastUpdate: Date.now(),
        addresses:
          data.address?.map((addr: any) => ({
            network: addr.type || 'tcp',
            addr: addr.address || addr,
          })) || [],
        features: data.features || {},
      }
    } catch (error) {
      console.error('CLN getInfo error:', error)
      throw new Error(`Failed to get CLN node info: ${error}`)
    }
  }

  async createInvoice(params: CreateInvoiceParams): Promise<LightningInvoice> {
    try {
      const requestBody = {
        amount_msat: (params.amount * 1000).toString(),
        description: params.description || '',
        expiry: params.expiry || 3600,
      }

      const response = await fetch(`${this.config.url}/v1/invoice`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.auth.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`CLN API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return {
        paymentRequest: data.bolt11,
        paymentHash: data.payment_hash,
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
      console.error('CLN createInvoice error:', error)
      throw new Error(`Failed to create CLN invoice: ${error}`)
    }
  }

  async payInvoice(paymentRequest: string): Promise<PaymentResult> {
    try {
      const requestBody = {
        bolt11: paymentRequest,
      }

      const response = await fetch(`${this.config.url}/v1/pay`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.auth.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`CLN API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return {
        paymentHash: data.payment_hash,
        paymentPreimage: data.payment_preimage,
        amount: parseInt(data.amount_sent_msat || '0') / 1000,
        fee:
          parseInt(data.amount_msat || '0') / 1000 - parseInt(data.amount_sent_msat || '0') / 1000,
        success: data.status === 'complete',
        failureReason: data.status !== 'complete' ? 'Payment failed' : undefined,
      }
    } catch (error) {
      console.error('CLN payInvoice error:', error)
      throw new Error(`Failed to pay CLN invoice: ${error}`)
    }
  }

  async listPayments(): Promise<LightningPayment[]> {
    try {
      const response = await fetch(`${this.config.url}/v1/listpays`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.auth.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`CLN API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return data.pays.map((pay: any) => ({
        paymentHash: pay.payment_hash,
        paymentPreimage: pay.preimage,
        amount: parseInt(pay.amount_msat || '0') / 1000,
        fee: parseInt(pay.amount_sent_msat || '0') / 1000 - parseInt(pay.amount_msat || '0') / 1000,
        status:
          pay.status === 'complete'
            ? 'succeeded'
            : pay.status === 'failed'
              ? 'failed'
              : 'in_flight',
        timestamp: pay.created_at * 1000,
        description: pay.description || '',
        destination: pay.destination,
        paymentRequest: pay.bolt11,
        htlcs: [],
        paymentIndex: pay.id,
      }))
    } catch (error) {
      console.error('CLN listPayments error:', error)
      throw new Error(`Failed to list CLN payments: ${error}`)
    }
  }

  async listInvoices(): Promise<LightningInvoice[]> {
    try {
      const response = await fetch(`${this.config.url}/v1/listinvoices`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.auth.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`CLN API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return data.invoices.map((invoice: any) => ({
        paymentRequest: invoice.bolt11,
        paymentHash: invoice.payment_hash,
        amount: parseInt(invoice.amount_msat || '0') / 1000,
        description: invoice.description || '',
        expiry: invoice.expires_at - invoice.created_at,
        timestamp: invoice.created_at * 1000,
        payeePubKey: '', // CLN doesn't provide this in listinvoices
        minFinalCltvExpiry: 144,
        routingHints: [],
        features: [],
        signature: '',
      }))
    } catch (error) {
      console.error('CLN listInvoices error:', error)
      throw new Error(`Failed to list CLN invoices: ${error}`)
    }
  }

  async estimateFee(
    destination: string,
    amount: number,
  ): Promise<{ fee: number; probability: number }> {
    try {
      const requestBody = {
        id: destination,
        amount_msat: amount * 1000,
        riskfactor: 1,
      }

      const response = await fetch(`${this.config.url}/v1/getroute`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.auth.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`CLN API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      // Calculate total fee from the route
      const totalFee =
        data.route.reduce((sum: number, hop: any) => {
          return sum + parseInt(hop.amount_msat || '0') - parseInt(hop.delay || '0') // CLN uses delay field for fee
        }, 0) / 1000

      return {
        fee: totalFee,
        probability: 0.9, // CLN doesn't provide probability, assume 90%
      }
    } catch (error) {
      console.error('CLN estimateFee error:', error)
      throw new Error(`Failed to estimate CLN fee: ${error}`)
    }
  }
}
