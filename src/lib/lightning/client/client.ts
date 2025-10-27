// Lightning Wallet Provider interface for abstraction

import { breezClient } from './breez'
import type {
  GetInfoResponse,
  PrepareSendPaymentRequest,
  PrepareSendPaymentResponse,
  SendPaymentRequest,
  SendPaymentResponse,
  ReceivePaymentRequest,
  ReceivePaymentResponse,
  CheckLightningAddressRequest,
  RegisterLightningAddressRequest,
  LightningAddressInfo,
  DepositInfo,
  Fee,
  Payment,
  SdkEvent,
} from '@breeztech/breez-sdk-spark'
import type { LightningWalletConfig, LightningWalletProvider } from './types'

// Factory function to create provider
export function createLightningWalletProvider(provider: string): LightningWalletProvider {
  switch (provider) {
    case 'breez':
      return new BreezWalletProvider()
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

// Breez implementation
export class BreezWalletProvider implements LightningWalletProvider {
  private breezClient = breezClient

  async connect(config: LightningWalletConfig): Promise<void> {
    await this.breezClient.connect({
      mnemonic: config.mnemonic,
      apiKey: config.apiKey,
      network: config.network,
    })
  }

  async disconnect(): Promise<void> {
    await this.breezClient.disconnect()
  }

  isConnected(): boolean {
    return this.breezClient.isConnected()
  }

  async getInfo(): Promise<GetInfoResponse> {
    return await this.breezClient.getInfo()
  }

  async listPayments(offset = 0, limit = 100): Promise<Payment[]> {
    return await this.breezClient.listPayments(offset, limit)
  }

  async prepareSendPayment(
    request: PrepareSendPaymentRequest,
  ): Promise<PrepareSendPaymentResponse> {
    return await this.breezClient.prepareSendPayment(request)
  }

  async sendPayment(request: SendPaymentRequest): Promise<SendPaymentResponse> {
    return await this.breezClient.sendPayment(request)
  }

  async receivePayment(request: ReceivePaymentRequest): Promise<ReceivePaymentResponse> {
    return await this.breezClient.receivePayment(request)
  }

  async checkLightningAddressAvailable(request: CheckLightningAddressRequest): Promise<boolean> {
    return await this.breezClient.checkLightningAddressAvailable(request)
  }

  async registerLightningAddress(
    request: RegisterLightningAddressRequest,
  ): Promise<LightningAddressInfo> {
    return await this.breezClient.registerLightningAddress(request)
  }

  async getLightningAddress(): Promise<LightningAddressInfo | undefined> {
    return await this.breezClient.getLightningAddress()
  }

  async deleteLightningAddress(): Promise<void> {
    await this.breezClient.deleteLightningAddress()
  }

  async unclaimedDeposits(): Promise<DepositInfo[]> {
    return await this.breezClient.unclaimedDeposits()
  }

  async claimDeposit(txid: string, vout: number, maxFee: Fee): Promise<void> {
    await this.breezClient.claimDeposit(txid, vout, maxFee)
  }

  async refundDeposit(
    txid: string,
    vout: number,
    destinationAddress: string,
    fee: Fee,
  ): Promise<void> {
    await this.breezClient.refundDeposit(txid, vout, destinationAddress, fee)
  }

  async addEventListener(callback: (event: SdkEvent) => void): Promise<string> {
    return await this.breezClient.addEventListener(callback)
  }

  async removeEventListener(listenerId: string): Promise<void> {
    await this.breezClient.removeEventListener(listenerId)
  }
}
