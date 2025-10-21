import type {
  LightningClient,
  LightningClientConfig,
  LightningNode,
  LightningChannel,
  PaymentResult,
  LightningInvoice,
  LightningPayment,
  Peer,
  OpenChannelParams,
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

  async listChannels(): Promise<LightningChannel[]> {
    // TODO: Implement Eclair REST API call to channels
    throw new Error('Eclair listChannels not implemented')
  }

  async getChannel(channelId: string): Promise<LightningChannel | null> {
    // TODO: Implement Eclair REST API call to channel/{channelId}
    throw new Error('Eclair getChannel not implemented')
  }

  async openChannel(params: OpenChannelParams): Promise<{ channelId: string }> {
    // TODO: Implement Eclair REST API call to open
    throw new Error('Eclair openChannel not implemented')
  }

  async closeChannel(channelId: string, force: boolean = false): Promise<void> {
    // TODO: Implement Eclair REST API call to close
    throw new Error('Eclair closeChannel not implemented')
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

  async describeGraph(): Promise<{ nodes: LightningNode[]; channels: LightningChannel[] }> {
    // TODO: Implement Eclair REST API call to network
    throw new Error('Eclair describeGraph not implemented')
  }

  async estimateFee(
    destination: string,
    amount: number,
  ): Promise<{ fee: number; probability: number }> {
    // TODO: Implement Eclair REST API call to findroute
    throw new Error('Eclair estimateFee not implemented')
  }

  async connectPeer(pubkey: string, host: string): Promise<void> {
    // TODO: Implement Eclair REST API call to connect
    throw new Error('Eclair connectPeer not implemented')
  }

  async disconnectPeer(pubkey: string): Promise<void> {
    // TODO: Implement Eclair REST API call to disconnect
    throw new Error('Eclair disconnectPeer not implemented')
  }

  async listPeers(): Promise<Peer[]> {
    // TODO: Implement Eclair REST API call to peers
    throw new Error('Eclair listPeers not implemented')
  }
}
