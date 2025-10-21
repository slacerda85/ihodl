import type {
  LightningClient,
  LightningClientConfig,
  LightningNode,
  LightningChannel,
  PaymentResult,
  LightningInvoice,
  LightningPayment,
  Peer,
  ChannelType,
  CommitmentType,
  ChannelLifecycleState,
  OpenChannelParams,
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

  async listChannels(): Promise<LightningChannel[]> {
    try {
      const response = await fetch(`${this.config.url}/v1/listchannels`, {
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

      return (data.channels || []).map((channel: any) => ({
        channelId: channel.short_channel_id || channel.channel_id || '',
        channelPoint: channel.funding_txid || '',
        localBalance: parseInt(channel.our_amount_msat || '0') / 1000,
        remoteBalance:
          parseInt(channel.amount_msat || '0') / 1000 -
          parseInt(channel.our_amount_msat || '0') / 1000,
        capacity: parseInt(channel.amount_msat || '0') / 1000,
        remotePubkey: channel.peer_id || '',
        status: channel.state === 'CHANNELD_NORMAL' ? 'active' : 'inactive',
        channelType: 'legacy' as ChannelType,
        numConfirmations: 0,
        commitmentType: 'legacy' as CommitmentType,
        private: channel.private || false,
        initiator: channel.opener === 'local',
        feePerKw: 0,
        unsettledBalance: 0,
        totalSatoshisSent: 0,
        totalSatoshisReceived: 0,
        numUpdates: 0,
        pendingHtlcs: [],
        csvDelay: 144,
        active: channel.state === 'CHANNELD_NORMAL',
        lifecycleState: 'active' as ChannelLifecycleState,
      }))
    } catch (error) {
      console.error('CLN listChannels error:', error)
      throw new Error(`Failed to list CLN channels: ${error}`)
    }
  }

  async getChannel(channelId: string): Promise<LightningChannel | null> {
    try {
      const response = await fetch(`${this.config.url}/v1/channel/${channelId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.auth.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        throw new Error(`CLN API error: ${response.status} ${response.statusText}`)
      }

      const channel = await response.json()

      return {
        channelId: channel.short_channel_id || channel.channel_id || '',
        channelPoint: channel.funding_txid || '',
        localBalance: parseInt(channel.our_amount_msat || '0') / 1000,
        remoteBalance:
          parseInt(channel.amount_msat || '0') / 1000 -
          parseInt(channel.our_amount_msat || '0') / 1000,
        capacity: parseInt(channel.amount_msat || '0') / 1000,
        remotePubkey: channel.peer_id || '',
        status: channel.state === 'CHANNELD_NORMAL' ? 'active' : 'inactive',
        channelType: 'legacy' as ChannelType,
        numConfirmations: 0,
        commitmentType: 'legacy' as CommitmentType,
        private: channel.private || false,
        initiator: channel.opener === 'local',
        feePerKw: 0,
        unsettledBalance: 0,
        totalSatoshisSent: 0,
        totalSatoshisReceived: 0,
        numUpdates: 0,
        pendingHtlcs: [],
        csvDelay: 144,
        active: channel.state === 'CHANNELD_NORMAL',
        lifecycleState: 'active' as ChannelLifecycleState,
      }
    } catch (error) {
      console.error('CLN getChannel error:', error)
      throw new Error(`Failed to get CLN channel: ${error}`)
    }
  }

  async openChannel(params: OpenChannelParams): Promise<{ channelId: string }> {
    try {
      const requestBody = {
        id: params.nodePubkey,
        amount: params.localFundingAmount.toString(),
        push_msat: params.pushSat ? (params.pushSat * 1000).toString() : undefined,
        announce: !params.private,
        minconf: params.minConfs || 1,
      }

      const response = await fetch(`${this.config.url}/v1/fundchannel`, {
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
        channelId: data.channel_id || '',
      }
    } catch (error) {
      console.error('CLN openChannel error:', error)
      throw new Error(`Failed to open CLN channel: ${error}`)
    }
  }

  async closeChannel(channelId: string, force: boolean = false): Promise<void> {
    try {
      const requestBody = {
        id: channelId,
        unilateraltimeout: force ? 1 : undefined,
      }

      const response = await fetch(`${this.config.url}/v1/close`, {
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
    } catch (error) {
      console.error('CLN closeChannel error:', error)
      throw new Error(`Failed to close CLN channel: ${error}`)
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

  async describeGraph(): Promise<{ nodes: LightningNode[]; channels: LightningChannel[] }> {
    try {
      // Get nodes
      const nodesResponse = await fetch(`${this.config.url}/v1/listnodes`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.auth.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!nodesResponse.ok) {
        throw new Error(
          `CLN API error for nodes: ${nodesResponse.status} ${nodesResponse.statusText}`,
        )
      }

      const nodesData = await nodesResponse.json()
      const nodes: LightningNode[] = nodesData.nodes.map((node: any) => ({
        pubKey: node.nodeid,
        alias: node.alias || node.nodeid.substring(0, 20),
        color: node.color || '#FF6B35',
        numChannels: node.channels || 0,
        totalCapacity: 0, // CLN doesn't provide this directly
        lastUpdate: node.last_timestamp * 1000 || Date.now(),
        addresses: node.addresses || [],
        features: node.features || {},
      }))

      // Get channels
      const channelsResponse = await fetch(`${this.config.url}/v1/listchannels`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.auth.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!channelsResponse.ok) {
        throw new Error(
          `CLN API error for channels: ${channelsResponse.status} ${channelsResponse.statusText}`,
        )
      }

      const channelsData = await channelsResponse.json()
      const channels: LightningChannel[] = channelsData.channels.map((channel: any) => ({
        channelId: channel.short_channel_id,
        channelPoint: channel.channel_id,
        localBalance: 0, // CLN doesn't provide local balance in listchannels
        remoteBalance: 0, // CLN doesn't provide remote balance in listchannels
        capacity: parseInt(channel.satoshis || '0'),
        remotePubkey: channel.destination,
        status: channel.active ? 'active' : 'inactive',
        channelType: 'legacy', // CLN doesn't specify channel type
        numConfirmations: 6, // Assume confirmed
        commitmentType: 'legacy',
        private: channel.private,
        initiator: false, // CLN doesn't provide this
        feePerKw: 0,
        unsettledBalance: 0,
        totalSatoshisSent: 0,
        totalSatoshisReceived: 0,
        numUpdates: 0,
        pendingHtlcs: [],
        csvDelay: 144,
        active: channel.active,
        lifecycleState: channel.active ? 'active' : 'closed',
      }))

      return { nodes, channels }
    } catch (error) {
      console.error('CLN describeGraph error:', error)
      throw new Error(`Failed to describe CLN graph: ${error}`)
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

  async connectPeer(pubkey: string, host: string): Promise<void> {
    try {
      const requestBody = {
        id: pubkey,
        host,
      }

      const response = await fetch(`${this.config.url}/v1/connect`, {
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
    } catch (error) {
      console.error('CLN connectPeer error:', error)
      throw new Error(`Failed to connect CLN peer: ${error}`)
    }
  }

  async disconnectPeer(pubkey: string): Promise<void> {
    try {
      const requestBody = {
        id: pubkey,
        force: false,
      }

      const response = await fetch(`${this.config.url}/v1/disconnect`, {
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
    } catch (error) {
      console.error('CLN disconnectPeer error:', error)
      throw new Error(`Failed to disconnect CLN peer: ${error}`)
    }
  }

  async listPeers(): Promise<Peer[]> {
    try {
      const response = await fetch(`${this.config.url}/v1/listpeers`, {
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

      return data.peers.map((peer: any) => ({
        pubKey: peer.id,
        address: peer.netaddr?.[0] || '',
        inbound: (peer.connected && peer.inbound) || false,
        pingTime: 0, // CLN doesn't provide ping time
      }))
    } catch (error) {
      console.error('CLN listPeers error:', error)
      throw new Error(`Failed to list CLN peers: ${error}`)
    }
  }
}
