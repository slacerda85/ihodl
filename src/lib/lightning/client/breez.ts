import {
  BreezSdk,
  GetInfoRequest,
  GetInfoResponse,
  ListPaymentsRequest,
  ListPaymentsResponse,
  Payment,
  SendPaymentRequest,
  SendPaymentResponse,
  ReceivePaymentRequest,
  ReceivePaymentResponse,
  PrepareSendPaymentRequest,
  PrepareSendPaymentResponse,
  SdkEvent,
  EventListener,
  LogEntry,
  initLogging,
  connect,
  DepositInfo,
  Fee,
  defaultConfig,
  Seed,
  ListUnclaimedDepositsRequest,
  ListUnclaimedDepositsResponse,
  CheckLightningAddressRequest,
  RegisterLightningAddressRequest,
  LightningAddressInfo,
} from '@breeztech/breez-sdk-spark'

class WebLogger {
  log = (logEntry: LogEntry) => {
    const level = logEntry.level.toLowerCase()
    const message = `[${new Date().toISOString()}] ${level}: ${logEntry.line}`
    switch (level) {
      case 'error':
        console.error(message)
        break
      case 'warn':
        console.warn(message)
        break
      case 'info':
        console.info(message)
        break
      case 'debug':
        console.debug(message)
        break
      case 'trace':
        console.trace(message)
        break
      default:
        console.log(message)
    }
  }
}

export interface BreezClientConfig {
  mnemonic: string
  apiKey: string
  network?: 'mainnet' | 'testnet' | 'regtest'
}

export class BreezClient {
  private sdk: BreezSdk | null = null
  private logger: WebLogger | null = null

  async connect(config: BreezClientConfig): Promise<void> {
    if (this.sdk) {
      console.warn('BreezClient: Already connected')
      return
    }

    try {
      // Initialize logging
      if (!this.logger) {
        this.logger = new WebLogger()
        initLogging(this.logger)
      }

      // Create SDK config
      const network =
        config.network === 'mainnet'
          ? 'mainnet'
          : config.network === 'testnet'
            ? 'testnet'
            : 'regtest'

      const sdkConfig = defaultConfig(network as any)
      sdkConfig.apiKey = config.apiKey

      // Create seed from mnemonic
      const seed: Seed = {
        type: 'mnemonic',
        mnemonic: config.mnemonic,
      }

      // Connect to SDK
      this.sdk = await connect({
        config: sdkConfig,
        seed,
        storageDir: 'breez-spark-wallet',
      })

      console.log('BreezClient: Connected successfully')
    } catch (error) {
      console.error('BreezClient: Failed to connect:', error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (!this.sdk) {
      return
    }

    try {
      await this.sdk.disconnect()
      this.sdk = null
      console.log('BreezClient: Disconnected')
    } catch (error) {
      console.error('BreezClient: Failed to disconnect:', error)
      throw error
    }
  }

  isConnected(): boolean {
    return this.sdk !== null
  }

  // Wallet info
  async getInfo(ensureSynced = false): Promise<GetInfoResponse> {
    if (!this.sdk) throw new Error('BreezClient: Not connected')

    const request: GetInfoRequest = {
      ensureSynced,
    }

    return await this.sdk.getInfo(request)
  }

  // Payments
  async listPayments(offset = 0, limit = 100): Promise<Payment[]> {
    if (!this.sdk) throw new Error('BreezClient: Not connected')

    const request: ListPaymentsRequest = {
      offset,
      limit,
    }

    const response: ListPaymentsResponse = await this.sdk.listPayments(request)
    return response.payments
  }

  async prepareSendPayment(
    request: PrepareSendPaymentRequest,
  ): Promise<PrepareSendPaymentResponse> {
    if (!this.sdk) throw new Error('BreezClient: Not connected')
    return await this.sdk.prepareSendPayment(request)
  }

  async sendPayment(request: SendPaymentRequest): Promise<SendPaymentResponse> {
    if (!this.sdk) throw new Error('BreezClient: Not connected')
    return await this.sdk.sendPayment(request)
  }

  async receivePayment(request: ReceivePaymentRequest): Promise<ReceivePaymentResponse> {
    if (!this.sdk) throw new Error('BreezClient: Not connected')
    return await this.sdk.receivePayment(request)
  }

  // LNURL-Pay / Lightning Address
  async checkLightningAddressAvailable(request: CheckLightningAddressRequest): Promise<boolean> {
    if (!this.sdk) throw new Error('BreezClient: Not connected')
    return await this.sdk.checkLightningAddressAvailable(request)
  }

  async registerLightningAddress(
    request: RegisterLightningAddressRequest,
  ): Promise<LightningAddressInfo> {
    if (!this.sdk) throw new Error('BreezClient: Not connected')
    return await this.sdk.registerLightningAddress(request)
  }

  async getLightningAddress(): Promise<LightningAddressInfo | undefined> {
    if (!this.sdk) throw new Error('BreezClient: Not connected')
    return await this.sdk.getLightningAddress()
  }

  async deleteLightningAddress(): Promise<void> {
    if (!this.sdk) throw new Error('BreezClient: Not connected')
    await this.sdk.deleteLightningAddress()
  }

  // Deposits
  async unclaimedDeposits(): Promise<DepositInfo[]> {
    if (!this.sdk) throw new Error('BreezClient: Not connected')

    const request: ListUnclaimedDepositsRequest = {}
    const response: ListUnclaimedDepositsResponse = await this.sdk.listUnclaimedDeposits(request)
    return response.deposits
  }

  async claimDeposit(txid: string, vout: number, maxFee: Fee): Promise<void> {
    if (!this.sdk) throw new Error('BreezClient: Not connected')
    await this.sdk.claimDeposit({ txid, vout, maxFee })
  }

  async refundDeposit(
    txid: string,
    vout: number,
    destinationAddress: string,
    fee: Fee,
  ): Promise<void> {
    if (!this.sdk) throw new Error('BreezClient: Not connected')
    await this.sdk.refundDeposit({ txid, vout, destinationAddress, fee })
  }

  // Event listeners
  async addEventListener(callback: (event: SdkEvent) => void): Promise<string> {
    if (!this.sdk) throw new Error('BreezClient: Not connected')

    const listener: EventListener = {
      onEvent: callback,
    }

    return await this.sdk.addEventListener(listener)
  }

  async removeEventListener(listenerId: string): Promise<void> {
    if (!this.sdk) throw new Error('BreezClient: Not connected')
    await this.sdk.removeEventListener(listenerId)
  }
}

// Singleton instance
export const breezClient = new BreezClient()
