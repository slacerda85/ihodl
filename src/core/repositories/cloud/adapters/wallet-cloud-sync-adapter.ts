import { CloudSyncRepositoryInterface } from '../cloud-sync-repository-interface'
import { CloudStorageWrapper } from '../cloud-storage-wrapper'
import { Wallet } from '../../../models/wallet'

/**
 * Adaptador para sincronização do WalletRepository com nuvem
 */
export class WalletCloudSyncAdapter implements CloudSyncRepositoryInterface {
  private cloudStorage: CloudStorageWrapper
  private readonly CLOUD_KEY = 'wallet_data'

  constructor() {
    this.cloudStorage = CloudStorageWrapper.getInstance()
  }

  async upload(data: any): Promise<void> {
    // data deve ser um objeto com wallets e activeWalletId
    const cloudData = {
      wallets: data.wallets || [],
      activeWalletId: data.activeWalletId,
      timestamp: Date.now(),
      schemaVersion: '1.0',
    }
    await this.cloudStorage.setItem(this.CLOUD_KEY, cloudData)
  }

  async download(): Promise<any> {
    const cloudData = await this.cloudStorage.getItem<{
      wallets: Wallet[]
      activeWalletId?: string
      timestamp: number
      schemaVersion: string
    }>(this.CLOUD_KEY)

    if (!cloudData) {
      return { wallets: [], activeWalletId: undefined }
    }

    return {
      wallets: cloudData.wallets || [],
      activeWalletId: cloudData.activeWalletId,
    }
  }

  async sync(localData: any): Promise<any> {
    // Para wallet, sempre mantém dados locais como prioritários
    // pois mudanças de carteira ativa são críticas
    await this.upload(localData)
    return localData
  }

  async hasRemoteData(): Promise<boolean> {
    return await this.cloudStorage.hasKey(this.CLOUD_KEY)
  }

  async deleteRemote(): Promise<void> {
    await this.cloudStorage.removeItem(this.CLOUD_KEY)
  }

  async getRemoteTimestamp(): Promise<number | null> {
    const cloudData = await this.cloudStorage.getItem<{
      timestamp: number
    }>(this.CLOUD_KEY)

    return cloudData?.timestamp || null
  }
}
