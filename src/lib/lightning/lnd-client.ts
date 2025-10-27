import type {
  LightningClient,
  LightningClientConfig,
  LightningNode,
  PaymentResult,
  LightningInvoice,
  LightningPayment,
  PaymentStatus,
  CreateInvoiceParams,
} from './types'

/**
 * LND gRPC client implementation
 */
export class LNDClient implements LightningClient {
  private config: LightningClientConfig

  constructor(config: LightningClientConfig) {
    this.config = config
  }

  private mapPaymentStatus(status: string): PaymentStatus {
    switch (status) {
      case 'SUCCEEDED':
        return 'succeeded'
      case 'FAILED':
        return 'failed'
      case 'IN_FLIGHT':
        return 'in_flight'
      case 'INITIATED':
        return 'initiated'
      default:
        return 'unknown'
    }
  }

  async getInfo(): Promise<LightningNode> {
    try {
      const response = await fetch(`${this.config.url}/v1/getinfo`, {
        method: 'GET',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth?.macaroon || '',
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`LND API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return {
        pubKey: data.identity_pubkey,
        alias: data.alias || data.identity_pubkey.substring(0, 20),
        color: data.color || '#FF6B35',
        numChannels: data.num_active_channels || 0,
        totalCapacity: parseInt(data.total_capacity || '0'),
        lastUpdate: Date.now(),
        addresses:
          data.uris?.map((uri: string) => {
            const [, host] = uri.split('@')
            return {
              network: host?.includes(':') ? 'tcp' : 'unknown',
              addr: host || uri,
            }
          }) || [],
        features: data.features || {},
      }
    } catch (error) {
      console.error('LND getInfo error:', error)
      throw new Error(`Failed to get LND node info: ${error}`)
    }
  }

  async createInvoice(params: CreateInvoiceParams): Promise<LightningInvoice> {
    try {
      const requestBody = {
        value: params.amount.toString(),
        memo: params.description || '',
        expiry: params.expiry || 3600,
        private: params.private || false,
      }

      const response = await fetch(`${this.config.url}/v1/invoices`, {
        method: 'POST',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth?.macaroon || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`LND API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return {
        paymentRequest: data.payment_request,
        paymentHash: data.r_hash,
        amount: params.amount,
        description: params.description,
        expiry: params.expiry || 3600,
        timestamp: data.creation_date || Date.now(),
        payeePubKey: '', // Will be filled when invoice is decoded
        minFinalCltvExpiry: data.cltv_expiry || 144,
        routingHints: [],
        features: [],
        signature: '',
      }
    } catch (error) {
      console.error('LND createInvoice error:', error)
      throw new Error(`Failed to create LND invoice: ${error}`)
    }
  }

  async payInvoice(paymentRequest: string): Promise<PaymentResult> {
    try {
      const requestBody = {
        payment_request: paymentRequest,
        timeout_seconds: 60,
        fee_limit: {
          fixed: '1000', // 1000 sats max fee
        },
      }

      const response = await fetch(`${this.config.url}/v1/channels/transactions`, {
        method: 'POST',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth?.macaroon || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`LND API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return {
        paymentHash: data.payment_hash,
        paymentPreimage: data.payment_preimage,
        amount: parseInt(data.value || '0'),
        fee: parseInt(data.fee || '0'),
        success: true,
        failureReason: data.payment_error || undefined,
      }
    } catch (error) {
      console.error('LND payInvoice error:', error)
      throw new Error(`Failed to pay LND invoice: ${error}`)
    }
  }

  async listPayments(): Promise<LightningPayment[]> {
    try {
      const response = await fetch(`${this.config.url}/v1/payments`, {
        method: 'GET',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth?.macaroon || '',
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`LND API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return (data.payments || []).map((payment: any) => ({
        paymentHash: payment.payment_hash,
        paymentPreimage: payment.payment_preimage,
        amount: parseInt(payment.value || payment.value_msat || '0') / 1000,
        fee: parseInt(payment.fee || payment.fee_msat || '0') / 1000,
        status: this.mapPaymentStatus(payment.status),
        timestamp: payment.creation_time_ns ? payment.creation_time_ns / 1000000000 : Date.now(),
        description: payment.payment_request?.description,
        invoice: payment.payment_request,
        destination: payment.dest,
        paymentRequest: payment.payment_request,
        failureReason: payment.failure_reason,
        htlcs: [], // Simplified for now
        paymentIndex: payment.payment_index || 0,
        failureCode: payment.failure_reason ? 1 : undefined,
      }))
    } catch (error) {
      console.error('LND listPayments error:', error)
      throw new Error(`Failed to list LND payments: ${error}`)
    }
  }

  async listInvoices(): Promise<LightningInvoice[]> {
    try {
      const response = await fetch(`${this.config.url}/v1/invoices`, {
        method: 'GET',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth?.macaroon || '',
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`LND API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return (data.invoices || []).map((invoice: any) => ({
        paymentRequest: invoice.payment_request,
        paymentHash: invoice.r_hash,
        amount: parseInt(invoice.value || '0'),
        description: invoice.memo,
        descriptionHash: invoice.description_hash,
        paymentSecret: invoice.payment_addr,
        expiry: invoice.expiry || 3600,
        timestamp: invoice.creation_date || Date.now(),
        payeePubKey: invoice.payee_pub_key || '',
        minFinalCltvExpiry: invoice.cltv_expiry || 144,
        fallbackAddr: invoice.fallback_addr,
        routingHints: [], // Simplified
        features: [],
        signature: '',
      }))
    } catch (error) {
      console.error('LND listInvoices error:', error)
      throw new Error(`Failed to list LND invoices: ${error}`)
    }
  }

  async estimateFee(
    destination: string,
    amount: number,
  ): Promise<{ fee: number; probability: number }> {
    try {
      const requestBody = {
        dest: destination,
        amt: amount.toString(),
        amt_msat: (amount * 1000).toString(),
      }

      const response = await fetch(`${this.config.url}/v1/channels/fee`, {
        method: 'POST',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth?.macaroon || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`LND API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return {
        fee: parseInt(data.fee_sat || '0'),
        probability: data.success_prob || 0.95,
      }
    } catch (error) {
      console.error('LND estimateFee error:', error)
      throw new Error(`Failed to estimate LND fee: ${error}`)
    }
  }
}
