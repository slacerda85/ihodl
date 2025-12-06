import {
  CloudSyncRepositoryInterface,
  ConflictResolutionStrategy,
} from './cloud-sync-repository-interface'
import { CloudStorageWrapper } from './cloud-storage-wrapper'
import cloudSettingsRepository from './cloud-settings-repository'

/**
 * Serviço central para sincronização de dados com nuvem
 * Gerencia upload/download, resolução de conflitos e metadados de sincronização
 */
export class CloudSyncService {
  private static instance: CloudSyncService
  private cloudStorage: CloudStorageWrapper

  private constructor() {
    this.cloudStorage = CloudStorageWrapper.getInstance()
  }

  static getInstance(): CloudSyncService {
    if (!CloudSyncService.instance) {
      CloudSyncService.instance = new CloudSyncService()
    }
    return CloudSyncService.instance
  }

  /**
   * Habilita/desabilita sincronização com nuvem
   */
  setSyncEnabled(enabled: boolean): void {
    cloudSettingsRepository.setSyncEnabled(enabled)
  }

  /**
   * Verifica se sincronização está habilitada
   */
  isSyncEnabled(): boolean {
    return cloudSettingsRepository.getSettings().syncEnabled
  }

  /**
   * Define estratégia de resolução de conflitos
   */
  setConflictStrategy(strategy: ConflictResolutionStrategy): void {
    cloudSettingsRepository.setConflictStrategy(strategy)
  }

  /**
   * Verifica se nuvem está disponível
   */
  async isCloudAvailable(): Promise<boolean> {
    return await this.cloudStorage.isAvailable()
  }

  /**
   * Sincroniza dados de um repositório
   * @param repository Repositório a sincronizar
   * @param repositoryName Nome do repositório para identificação
   * @param localData Dados locais atuais
   * @returns Dados sincronizados
   */
  async syncRepository<T>(
    repository: CloudSyncRepositoryInterface,
    repositoryName: string,
    localData: T,
  ): Promise<T> {
    if (!this.isSyncEnabled()) {
      return localData
    }

    try {
      const cloudAvailable = await this.isCloudAvailable()
      if (!cloudAvailable) {
        console.warn('Cloud not available, skipping sync')
        return localData
      }

      // Verifica se há dados na nuvem
      const hasRemoteData = await repository.hasRemoteData()
      const remoteTimestamp = await repository.getRemoteTimestamp()

      if (!hasRemoteData) {
        // Primeiro upload
        await repository.upload(localData)
        return localData
      }

      // Baixa dados da nuvem
      const remoteData = await repository.download()

      // Resolve conflitos baseado na estratégia
      const mergedData = this.resolveConflicts(localData, remoteData, remoteTimestamp)

      // Se dados locais foram modificados, faz upload
      if (this.hasLocalChanges(localData, mergedData)) {
        await repository.upload(mergedData)
      }

      return mergedData
    } catch (error) {
      console.error(`Failed to sync repository ${repositoryName}:`, error)
      // Em caso de erro, retorna dados locais
      return localData
    }
  }

  /**
   * Faz upload forçado dos dados locais para nuvem
   */
  async forceUpload<T>(
    repository: CloudSyncRepositoryInterface,
    repositoryName: string,
    localData: T,
  ): Promise<void> {
    if (!this.isSyncEnabled()) return

    try {
      const cloudAvailable = await this.isCloudAvailable()
      if (!cloudAvailable) {
        throw new Error('Cloud not available')
      }

      await repository.upload(localData)
      console.log(`Uploaded ${repositoryName} to cloud`)
    } catch (error) {
      console.error(`Failed to upload ${repositoryName}:`, error)
      throw error
    }
  }

  /**
   * Faz download forçado dos dados da nuvem
   */
  async forceDownload<T>(
    repository: CloudSyncRepositoryInterface,
    repositoryName: string,
  ): Promise<T | null> {
    if (!this.isSyncEnabled()) return null

    try {
      const cloudAvailable = await this.isCloudAvailable()
      if (!cloudAvailable) {
        throw new Error('Cloud not available')
      }

      const hasRemoteData = await repository.hasRemoteData()
      if (!hasRemoteData) {
        return null
      }

      const remoteData = await repository.download()
      console.log(`Downloaded ${repositoryName} from cloud`)
      return remoteData
    } catch (error) {
      console.error(`Failed to download ${repositoryName}:`, error)
      throw error
    }
  }

  /**
   * Remove dados da nuvem para um repositório
   */
  async deleteRemoteData(
    repository: CloudSyncRepositoryInterface,
    repositoryName: string,
  ): Promise<void> {
    if (!this.isSyncEnabled()) return

    try {
      await repository.deleteRemote()
      console.log(`Deleted ${repositoryName} from cloud`)
    } catch (error) {
      console.error(`Failed to delete ${repositoryName} from cloud:`, error)
      throw error
    }
  }

  /**
   * Resolve conflitos entre dados locais e remotos
   */
  private resolveConflicts<T>(localData: T, remoteData: T, remoteTimestamp: number | null): T {
    const strategy = cloudSettingsRepository.getSettings().conflictStrategy

    switch (strategy) {
      case ConflictResolutionStrategy.KEEP_LOCAL:
        return localData

      case ConflictResolutionStrategy.KEEP_REMOTE:
        return remoteData

      case ConflictResolutionStrategy.LAST_WRITE_WINS:
        // Por enquanto, assume que local é mais recente
        // TODO: Implementar timestamps reais nos dados
        return localData

      case ConflictResolutionStrategy.MANUAL_MERGE:
        // TODO: Implementar merge manual
        console.warn('Manual merge not implemented, keeping local data')
        return localData

      default:
        return localData
    }
  }

  /**
   * Verifica se há mudanças nos dados locais
   */
  private hasLocalChanges<T>(original: T, current: T): boolean {
    return JSON.stringify(original) !== JSON.stringify(current)
  }

  /**
   * Obtém estatísticas de sincronização
   */
  async getSyncStats(): Promise<{
    cloudAvailable: boolean
    syncEnabled: boolean
    conflictStrategy: ConflictResolutionStrategy
  }> {
    const cloudAvailable = await this.isCloudAvailable()
    const settings = cloudSettingsRepository.getSettings()
    return {
      cloudAvailable,
      syncEnabled: settings.syncEnabled,
      conflictStrategy: settings.conflictStrategy,
    }
  }
}
