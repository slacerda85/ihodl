import { CloudBackupQueue } from './cloud-backup-queue'

/**
 * Decorator que adiciona funcionalidade de backup em nuvem a repositórios
 * Mantém o fluxo síncrono local enquanto adiciona backup assíncrono
 */
export class RepositoryCloudBackupDecorator {
  private backupQueue: CloudBackupQueue
  private repositoryName: string

  constructor(repositoryName: string) {
    this.backupQueue = CloudBackupQueue.getInstance()
    this.repositoryName = repositoryName
  }

  /**
   * Wrap uma função de save para adicionar backup automático
   */
  wrapSave<Args extends any[]>(
    originalSave: (...args: Args) => void,
    getBackupData: (...args: Args) => any,
    keyGenerator?: (...args: Args) => string,
  ): (...args: Args) => void {
    return (...args: Args) => {
      // Executa save local (síncrono)
      originalSave(...args)

      // Enqueue backup em nuvem (assíncrono)
      const backupData = getBackupData(...args)
      const key = keyGenerator ? keyGenerator(...args) : this.repositoryName

      this.backupQueue.enqueue({
        type: 'save',
        repository: this.repositoryName,
        key,
        data: backupData,
        priority: this.getPriorityForRepository(),
      })
    }
  }

  /**
   * Wrap uma função de delete para adicionar backup automático
   */
  wrapDelete<Args extends any[]>(
    originalDelete: (...args: Args) => void,
    keyGenerator?: (...args: Args) => string,
  ): (...args: Args) => void {
    return (...args: Args) => {
      // Executa delete local (síncrono)
      originalDelete(...args)

      // Enqueue delete em nuvem (assíncrono)
      const key = keyGenerator ? keyGenerator(...args) : this.repositoryName

      this.backupQueue.enqueue({
        type: 'delete',
        repository: this.repositoryName,
        key,
        priority: this.getPriorityForRepository(),
      })
    }
  }

  /**
   * Wrap uma função de clear para adicionar backup automático
   */
  wrapClear(originalClear: () => void): () => void {
    return () => {
      // Executa clear local (síncrono)
      originalClear()

      // Enqueue clear em nuvem (assíncrono)
      this.backupQueue.enqueue({
        type: 'clear',
        repository: this.repositoryName,
        key: this.repositoryName,
        priority: this.getPriorityForRepository(),
      })
    }
  }

  /**
   * Determina prioridade baseada no tipo de repositório
   */
  private getPriorityForRepository(): 'low' | 'normal' | 'high' {
    switch (this.repositoryName) {
      case 'wallet':
      case 'seed':
        return 'high'
      case 'address':
        return 'normal'
      case 'transaction':
      case 'electrum':
      case 'lightning':
        return 'low'
      default:
        return 'normal'
    }
  }

  /**
   * Força backup imediato deste repositório
   */
  async forceBackup(): Promise<void> {
    await this.backupQueue.forceSync(this.repositoryName)
  }

  /**
   * Retorna status do backup para este repositório
   */
  getBackupStatus(): { pendingOperations: number } {
    const queueStatus = this.backupQueue.getQueueStatus()
    return {
      pendingOperations: queueStatus[this.repositoryName] || 0,
    }
  }
}
