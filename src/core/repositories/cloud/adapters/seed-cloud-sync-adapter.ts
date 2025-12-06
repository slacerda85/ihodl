import { CloudSyncRepositoryInterface } from '../cloud-sync-repository-interface'
import { CloudStorageWrapper } from '../cloud-storage-wrapper'

/**
 * Adaptador para sincronização do SeedRepository com nuvem
 * NOTA: Seeds são dados sensíveis. Em produção, devem ser criptografados
 * antes da sincronização com a nuvem.
 */
export class SeedCloudSyncAdapter implements CloudSyncRepositoryInterface {
  private cloudStorage: CloudStorageWrapper
  private readonly CLOUD_KEY = 'seed_data'

  constructor() {
    this.cloudStorage = CloudStorageWrapper.getInstance()
  }

  async upload(data: any): Promise<void> {
    // data deve ser um objeto com seeds por walletId
    const cloudData = {
      seeds: data.seeds || {},
      timestamp: Date.now(),
      schemaVersion: 1,
    }
    await this.cloudStorage.setItem(this.CLOUD_KEY, cloudData)
  }

  async download(): Promise<any> {
    const cloudData = await this.cloudStorage.getItem<{
      seeds: { [walletId: string]: string }
      timestamp: number
      schemaVersion: number
    }>(this.CLOUD_KEY)

    if (!cloudData) {
      return { seeds: {} }
    }

    return {
      seeds: cloudData.seeds || {},
    }
  }

  async sync(localData: any): Promise<any> {
    // Para seeds, estratégia conservadora: upload local, mas não sobrescreve dados locais existentes
    // Seeds são dados críticos que não devem ser perdidos
    const cloudData = await this.download()

    // Se não há dados na nuvem, faz upload dos dados locais
    if (Object.keys(cloudData.seeds).length === 0) {
      await this.upload(localData)
      return localData
    }

    // Se há dados na nuvem, mescla sem sobrescrever dados locais
    const mergedSeeds = { ...cloudData.seeds, ...localData.seeds }

    // Upload dados mesclados
    await this.upload({ seeds: mergedSeeds })

    return { seeds: mergedSeeds }
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
