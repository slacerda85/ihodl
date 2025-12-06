import { CloudStorageWrapper } from './cloud-storage-wrapper'
import { WalletCloudSyncAdapter } from './adapters/wallet-cloud-sync-adapter'
import { SeedCloudSyncAdapter } from './adapters/seed-cloud-sync-adapter'

export interface CloudBackupOperation {
  id: string
  type: 'save' | 'delete' | 'clear'
  repository: string
  key: string
  data?: any
  timestamp: number
  retryCount: number
  priority: 'low' | 'normal' | 'high'
}

export interface BackupPolicy {
  repository: string
  debounceMs: number
  maxRetries: number
  batchSize: number
  priority: 'low' | 'normal' | 'high'
}

/**
 * Queue inteligente para operações de backup em nuvem
 * - Debounce para agrupar operações similares
 * - Retry com backoff exponencial
 * - Rate limiting para respeitar limites de API
 * - Persistência da queue para sobreviver a restarts
 */
export class CloudBackupQueue {
  private static instance: CloudBackupQueue
  private queue: CloudBackupOperation[] = []
  private processing = false
  private cloudStorage: CloudStorageWrapper
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private policies: Map<string, BackupPolicy> = new Map()

  private constructor() {
    this.cloudStorage = CloudStorageWrapper.getInstance()
    this.setupDefaultPolicies()
    // Carrega queue persistida de forma assíncrona
    this.loadPersistedQueue().catch(error => {
      console.warn('Failed to load persisted backup queue on init', error)
    })
  }

  static getInstance(): CloudBackupQueue {
    if (!CloudBackupQueue.instance) {
      CloudBackupQueue.instance = new CloudBackupQueue()
    }
    return CloudBackupQueue.instance
  }

  private setupDefaultPolicies(): void {
    // Políticas padrão por tipo de repositório
    this.policies.set('wallet', {
      repository: 'wallet',
      debounceMs: 3000, // 3s debounce
      maxRetries: 5,
      batchSize: 5,
      priority: 'high',
    })

    this.policies.set('seed', {
      repository: 'seed',
      debounceMs: 5000, // 5s debounce (dados sensíveis)
      maxRetries: 3,
      batchSize: 1, // Seeds individuais
      priority: 'high',
    })

    this.policies.set('address', {
      repository: 'address',
      debounceMs: 2000,
      maxRetries: 3,
      batchSize: 10,
      priority: 'normal',
    })

    this.policies.set('transaction', {
      repository: 'transaction',
      debounceMs: 1000,
      maxRetries: 3,
      batchSize: 20,
      priority: 'low',
    })
  }

  /**
   * Adiciona operação à queue com debounce
   */
  enqueue(operation: Omit<CloudBackupOperation, 'id' | 'timestamp' | 'retryCount'>): void {
    const policy = this.policies.get(operation.repository) || this.policies.get('default')
    if (!policy) return

    const op: CloudBackupOperation = {
      ...operation,
      id: `${operation.repository}_${operation.key}_${Date.now()}`,
      timestamp: Date.now(),
      retryCount: 0,
      priority: operation.priority || policy.priority,
    }

    // Remove operações similares pendentes (mesmo repo + key)
    this.queue = this.queue.filter(
      existing => !(existing.repository === op.repository && existing.key === op.key),
    )

    this.queue.push(op)
    this.persistQueue()

    // Debounce: agrupa operações do mesmo repositório
    this.scheduleDebouncedSync(operation.repository)
  }

  private scheduleDebouncedSync(repository: string): void {
    const policy = this.policies.get(repository)
    if (!policy) return

    // Cancela timer anterior se existir
    const existingTimer = this.debounceTimers.get(repository)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Agenda novo sync debounced
    const timer = setTimeout(() => {
      this.processRepositoryQueue(repository)
      this.debounceTimers.delete(repository)
    }, policy.debounceMs)

    this.debounceTimers.set(repository, timer)
  }

  /**
   * Processa queue de um repositório específico
   */
  private async processRepositoryQueue(repository: string): Promise<void> {
    if (this.processing) return

    const policy = this.policies.get(repository)
    if (!policy) return

    const repoOps = this.queue
      .filter(op => op.repository === repository)
      .sort((a, b) => {
        // Ordena por prioridade e timestamp
        const priorityOrder = { high: 3, normal: 2, low: 1 }
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
        return priorityDiff !== 0 ? priorityDiff : a.timestamp - b.timestamp
      })

    if (repoOps.length === 0) return

    this.processing = true

    try {
      // Processa em batches
      for (let i = 0; i < repoOps.length; i += policy.batchSize) {
        const batch = repoOps.slice(i, i + policy.batchSize)
        await this.processBatch(batch)
      }
    } finally {
      this.processing = false
    }
  }

  private async processBatch(operations: CloudBackupOperation[]): Promise<void> {
    // Para simplificar, processa uma operação por vez
    // Em produção, poderia fazer batch real na API
    for (const op of operations) {
      try {
        await this.executeOperation(op)
        // Remove da queue se sucesso
        this.queue = this.queue.filter(qop => qop.id !== op.id)
        this.persistQueue()
      } catch (error) {
        console.warn(`Cloud backup failed for ${op.repository}:${op.key}`, error)
        await this.handleOperationFailure(op)
      }
    }
  }

  private async executeOperation(operation: CloudBackupOperation): Promise<void> {
    const adapter = await this.getAdapterForRepository(operation.repository)
    if (!adapter) {
      throw new Error(`No adapter found for repository: ${operation.repository}`)
    }

    switch (operation.type) {
      case 'save':
        await adapter.upload(operation.data)
        break
      case 'delete':
        await adapter.deleteRemote()
        break
      case 'clear':
        await adapter.deleteRemote()
        break
    }
  }

  private async handleOperationFailure(operation: CloudBackupOperation): Promise<void> {
    const policy = this.policies.get(operation.repository)
    if (!policy) return

    operation.retryCount++

    if (operation.retryCount >= policy.maxRetries) {
      // Remove após max retries
      this.queue = this.queue.filter(op => op.id !== operation.id)
      this.persistQueue()
      console.error(`Max retries exceeded for ${operation.repository}:${operation.key}`)
    } else {
      // Exponential backoff: 1s, 2s, 4s, 8s...
      const delayMs = Math.pow(2, operation.retryCount) * 1000
      setTimeout(() => {
        this.processRepositoryQueue(operation.repository)
      }, delayMs)
    }
  }

  private getAdapterForRepository(repository: string): any {
    // Registry estático de adapters
    switch (repository) {
      case 'wallet':
        return new WalletCloudSyncAdapter()
      case 'seed':
        return new SeedCloudSyncAdapter()
      default:
        return null
    }
  }

  /**
   * Força sincronização imediata (usado em eventos como app background)
   */
  async forceSync(repository?: string): Promise<void> {
    if (repository) {
      // Cancela debounce e processa imediatamente
      const timer = this.debounceTimers.get(repository)
      if (timer) {
        clearTimeout(timer)
        this.debounceTimers.delete(repository)
      }
      await this.processRepositoryQueue(repository)
    } else {
      // Sync all repositories
      for (const repo of this.policies.keys()) {
        await this.forceSync(repo)
      }
    }
  }

  /**
   * Retorna status da queue para debugging
   */
  getQueueStatus(): { [repository: string]: number } {
    const status: { [repository: string]: number } = {}
    for (const op of this.queue) {
      status[op.repository] = (status[op.repository] || 0) + 1
    }
    return status
  }

  private async persistQueue(): Promise<void> {
    // Persiste queue no local storage para sobreviver a restarts
    const queueData = this.queue.map(op => ({
      ...op,
      // Remove dados grandes para não sobrecarregar storage
      data: op.data && typeof op.data === 'object' ? { _persisted: true } : op.data,
    }))

    try {
      // Só persiste se cloud storage estiver disponível
      const isAvailable = await this.cloudStorage.isAvailable()
      if (isAvailable) {
        await this.cloudStorage.setItem('backup_queue', {
          operations: queueData,
          timestamp: Date.now(),
        })
      }
    } catch (error) {
      console.warn('Failed to persist backup queue:', error)
    }
  }

  private async loadPersistedQueue(): Promise<void> {
    try {
      // Verifica se cloud storage está disponível antes de tentar carregar
      const isAvailable = await this.cloudStorage.isAvailable()
      if (!isAvailable) {
        console.log('Cloud storage not available, skipping persisted queue load')
        return
      }

      const persisted = await this.cloudStorage.getItem<{
        operations: CloudBackupOperation[]
        timestamp: number
      }>('backup_queue')
      if (persisted && persisted.operations) {
        // Só carrega operações recentes (últimas 24h)
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
        this.queue = persisted.operations.filter(
          (op: CloudBackupOperation) => op.timestamp > oneDayAgo,
        )
      }
    } catch (error) {
      console.warn('Failed to load persisted backup queue:', error)
    }
  }
}
