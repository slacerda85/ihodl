// Client-specific types for Lightning wallet providers

export interface LightningWalletConfig {
  mnemonic: string
  apiKey: string
  network?: 'mainnet' | 'testnet' | 'regtest'
  provider: 'breez' | 'phoenix' | 'other'
}

export interface LightningWalletProvider {
  connect(config: LightningWalletConfig): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  getInfo(): Promise<any> // Using any for now, can be typed later
  listPayments(offset?: number, limit?: number): Promise<any[]>
  prepareSendPayment(request: any): Promise<any>
  sendPayment(request: any): Promise<any>
  receivePayment(request: any): Promise<any>
  checkLightningAddressAvailable(request: any): Promise<boolean>
  registerLightningAddress(request: any): Promise<any>
  getLightningAddress(): Promise<any>
  deleteLightningAddress(): Promise<void>
  unclaimedDeposits(): Promise<any[]>
  claimDeposit(txid: string, vout: number, maxFee: any): Promise<void>
  refundDeposit(txid: string, vout: number, destinationAddress: string, fee: any): Promise<void>
  addEventListener(callback: (event: any) => void): Promise<string>
  removeEventListener(listenerId: string): Promise<void>
}
