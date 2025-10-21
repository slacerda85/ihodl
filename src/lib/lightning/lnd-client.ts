import type {
  LightningClient,
  LightningClientConfig,
  LightningNode,
  LightningChannel,
  PaymentResult,
  LightningInvoice,
  LightningPayment,
  Peer,
  ChannelStatus,
  PaymentStatus,
  HtlcAttemptStatus,
  ChannelType,
  CommitmentType,
  ChannelLifecycleState,
  HtlcStatus,
  OpenChannelParams,
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

  private mapChannelStatus(active: boolean): ChannelStatus {
    return active ? 'active' : 'inactive'
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

  private mapHtlcAttemptStatus(status: string): HtlcAttemptStatus {
    switch (status) {
      case 'SUCCEEDED':
        return 'succeeded'
      case 'FAILED':
        return 'failed'
      case 'IN_FLIGHT':
        return 'in_flight'
      default:
        return 'in_flight'
    }
  }

  async getInfo(): Promise<LightningNode> {
    try {
      const response = await fetch(`${this.config.url}/v1/getinfo`, {
        method: 'GET',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth.macaroon || '',
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

  async listChannels(): Promise<LightningChannel[]> {
    try {
      const response = await fetch(`${this.config.url}/v1/channels`, {
        method: 'GET',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth.macaroon || '',
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`LND API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return (data.channels || []).map((channel: any) => ({
        channelId: channel.chan_id?.toString() || '',
        channelPoint: channel.channel_point || '',
        localBalance: parseInt(channel.local_balance || '0'),
        remoteBalance: parseInt(channel.remote_balance || '0'),
        capacity: parseInt(channel.capacity || '0'),
        remotePubkey: channel.remote_pubkey || '',
        status: this.mapChannelStatus(channel.active),
        channelType: 'legacy' as ChannelType,
        numConfirmations: channel.num_confirmations || 0,
        commitmentType: 'legacy' as CommitmentType,
        private: channel.private || false,
        initiator: channel.initiator || false,
        feePerKw: parseInt(channel.fee_per_kw || '0'),
        unsettledBalance: parseInt(channel.unsettled_balance || '0'),
        totalSatoshisSent: parseInt(channel.total_satoshis_sent || '0'),
        totalSatoshisReceived: parseInt(channel.total_satoshis_received || '0'),
        numUpdates: channel.num_updates || 0,
        pendingHtlcs: (channel.pending_htlcs || []).map((htlc: any) => ({
          incomingAmount: parseInt(htlc.incoming_amount_msat || '0') / 1000,
          outgoingAmount: parseInt(htlc.outgoing_amount_msat || '0') / 1000,
          incomingHtlcId: htlc.incoming_htlc_id || 0,
          outgoingHtlcId: htlc.outgoing_htlc_id || 0,
          expiryHeight: htlc.expiration_height || 0,
          hashLock: htlc.hash_lock || '',
          status: 'in_flight' as HtlcStatus,
        })),
        csvDelay: channel.csv_delay || 144,
        active: channel.active || false,
        lifecycleState: 'active' as ChannelLifecycleState,
      }))
    } catch (error) {
      console.error('LND listChannels error:', error)
      throw new Error(`Failed to list LND channels: ${error}`)
    }
  }

  async getChannel(channelId: string): Promise<LightningChannel | null> {
    try {
      const response = await fetch(`${this.config.url}/v1/channel/${channelId}`, {
        method: 'GET',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth.macaroon || '',
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          return null // Channel not found
        }
        throw new Error(`LND API error: ${response.status} ${response.statusText}`)
      }

      const channel = await response.json()

      return {
        channelId: channel.chan_id?.toString() || '',
        channelPoint: channel.channel_point || '',
        localBalance: parseInt(channel.local_balance || '0'),
        remoteBalance: parseInt(channel.remote_balance || '0'),
        capacity: parseInt(channel.capacity || '0'),
        remotePubkey: channel.remote_pubkey || '',
        status: this.mapChannelStatus(channel.active),
        channelType: 'legacy' as ChannelType,
        numConfirmations: channel.num_confirmations || 0,
        commitmentType: 'legacy' as CommitmentType,
        private: channel.private || false,
        initiator: channel.initiator || false,
        feePerKw: parseInt(channel.fee_per_kw || '0'),
        unsettledBalance: parseInt(channel.unsettled_balance || '0'),
        totalSatoshisSent: parseInt(channel.total_satoshis_sent || '0'),
        totalSatoshisReceived: parseInt(channel.total_satoshis_received || '0'),
        numUpdates: channel.num_updates || 0,
        pendingHtlcs: (channel.pending_htlcs || []).map((htlc: any) => ({
          incomingAmount: parseInt(htlc.incoming_amount_msat || '0') / 1000,
          outgoingAmount: parseInt(htlc.outgoing_amount_msat || '0') / 1000,
          incomingHtlcId: htlc.incoming_htlc_id || 0,
          outgoingHtlcId: htlc.outgoing_htlc_id || 0,
          expiryHeight: htlc.expiration_height || 0,
          hashLock: htlc.hash_lock || '',
          status: 'in_flight' as HtlcStatus,
        })),
        csvDelay: channel.csv_delay || 144,
        active: channel.active || false,
        lifecycleState: 'active' as ChannelLifecycleState,
      }
    } catch (error) {
      console.error('LND getChannel error:', error)
      throw new Error(`Failed to get LND channel: ${error}`)
    }
  }

  async openChannel(params: OpenChannelParams): Promise<{ channelId: string }> {
    try {
      const requestBody = {
        node_pubkey_string: params.nodePubkey,
        local_funding_amount: params.localFundingAmount.toString(),
        push_sat: params.pushSat?.toString() || '0',
        target_conf: params.targetConf || 3,
        min_htlc_msat: params.minHtlcMsat?.toString(),
        remote_csv_delay: params.remoteCsvDelay,
        min_confs: params.minConfs || 1,
        spend_unconfirmed: false,
        close_address: '',
        funding_shim: null,
      }

      const response = await fetch(`${this.config.url}/v1/channels`, {
        method: 'POST',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth.macaroon || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`LND API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return {
        channelId: data.funding_txid_str || data.funding_txid_bytes || '',
      }
    } catch (error) {
      console.error('LND openChannel error:', error)
      throw new Error(`Failed to open LND channel: ${error}`)
    }
  }

  async closeChannel(channelId: string, force: boolean = false): Promise<void> {
    try {
      const requestBody = {
        channel_point: {
          funding_txid_str: channelId,
          output_index: 0, // This would need to be parsed from channel point
        },
        force: force,
        target_conf: 3,
        sat_per_vbyte: 1,
      }

      const response = await fetch(`${this.config.url}/v1/channels`, {
        method: 'DELETE',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth.macaroon || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`LND API error: ${response.status} ${response.statusText}`)
      }

      // LND returns the closing transaction details
      await response.json()
    } catch (error) {
      console.error('LND closeChannel error:', error)
      throw new Error(`Failed to close LND channel: ${error}`)
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
          'Grpc-Metadata-macaroon': this.config.auth.macaroon || '',
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
          'Grpc-Metadata-macaroon': this.config.auth.macaroon || '',
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
          'Grpc-Metadata-macaroon': this.config.auth.macaroon || '',
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
          'Grpc-Metadata-macaroon': this.config.auth.macaroon || '',
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

  async describeGraph(): Promise<{ nodes: LightningNode[]; channels: LightningChannel[] }> {
    try {
      const response = await fetch(`${this.config.url}/v1/graph`, {
        method: 'GET',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth.macaroon || '',
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`LND API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      const nodes: LightningNode[] = (data.nodes || []).map((node: any) => ({
        pubKey: node.pub_key,
        alias: node.alias || node.pub_key.substring(0, 20),
        color: node.color || '#FF6B35',
        numChannels: node.num_channels || 0,
        totalCapacity: parseInt(node.total_capacity || '0'),
        lastUpdate: node.last_update || Date.now(),
        addresses: (node.addresses || []).map((addr: any) => ({
          network: addr.network || 'tcp',
          addr: addr.addr || '',
        })),
        features: node.features || {},
      }))

      const channels: LightningChannel[] = (data.edges || []).map((edge: any) => ({
        channelId: edge.channel_id?.toString() || '',
        channelPoint: edge.chan_point || '',
        localBalance: 0, // Not available in graph
        remoteBalance: 0, // Not available in graph
        capacity: parseInt(edge.capacity || '0'),
        remotePubkey: edge.node2_pub || '',
        status: 'active' as ChannelStatus,
        channelType: 'legacy' as ChannelType,
        numConfirmations: 0,
        commitmentType: 'legacy' as CommitmentType,
        private: edge.private || false,
        initiator: false,
        feePerKw: 0,
        unsettledBalance: 0,
        totalSatoshisSent: 0,
        totalSatoshisReceived: 0,
        numUpdates: edge.last_update || 0,
        pendingHtlcs: [],
        csvDelay: 144,
        active: true,
        lifecycleState: 'active' as ChannelLifecycleState,
      }))

      return { nodes, channels }
    } catch (error) {
      console.error('LND describeGraph error:', error)
      throw new Error(`Failed to describe LND graph: ${error}`)
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
          'Grpc-Metadata-macaroon': this.config.auth.macaroon || '',
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

  async connectPeer(pubkey: string, host: string): Promise<void> {
    try {
      const requestBody = {
        addr: {
          pubkey: pubkey,
          host: host,
        },
        perm: true,
      }

      const response = await fetch(`${this.config.url}/v1/peers`, {
        method: 'POST',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth.macaroon || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`LND API error: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      console.error('LND connectPeer error:', error)
      throw new Error(`Failed to connect LND peer: ${error}`)
    }
  }

  async disconnectPeer(pubkey: string): Promise<void> {
    try {
      const response = await fetch(`${this.config.url}/v1/peers/${pubkey}`, {
        method: 'DELETE',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth.macaroon || '',
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`LND API error: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      console.error('LND disconnectPeer error:', error)
      throw new Error(`Failed to disconnect LND peer: ${error}`)
    }
  }

  async listPeers(): Promise<Peer[]> {
    try {
      const response = await fetch(`${this.config.url}/v1/peers`, {
        method: 'GET',
        headers: {
          'Grpc-Metadata-macaroon': this.config.auth.macaroon || '',
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`LND API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return (data.peers || []).map((peer: any) => ({
        pubKey: peer.pub_key,
        address: peer.address || '',
        inbound: peer.inbound || false,
        pingTime: peer.ping_time || 0,
      }))
    } catch (error) {
      console.error('LND listPeers error:', error)
      throw new Error(`Failed to list LND peers: ${error}`)
    }
  }
}
