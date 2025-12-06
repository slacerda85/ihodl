import { AppState, AppStateStatus } from 'react-native'
import { CloudBackupQueue } from './cloud-backup-queue'
import cloudSettingsRepository from './cloud-settings-repository'

/**
 * Scheduler para coordenar backups em nuvem baseado em eventos
 * - App background/foreground
 * - Conectividade de rede
 * - Intervalos periódicos
 */
export class CloudBackupScheduler {
  private static instance: CloudBackupScheduler
  private backupQueue: CloudBackupQueue
  private periodicTimer?: ReturnType<typeof setInterval>
  private appStateSubscription?: { remove: () => void }
  private isInitialized = false

  private constructor() {
    this.backupQueue = CloudBackupQueue.getInstance()
  }

  static getInstance(): CloudBackupScheduler {
    if (!CloudBackupScheduler.instance) {
      CloudBackupScheduler.instance = new CloudBackupScheduler()
    }
    return CloudBackupScheduler.instance
  }

  /**
   * Inicializa o scheduler
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    // Verifica se cloud backup está habilitado
    const settings = await cloudSettingsRepository.getSettings()
    if (!settings.syncEnabled) {
      console.log('Cloud backup disabled, skipping scheduler initialization')
      return
    }

    this.setupAppStateListener()
    this.setupPeriodicBackup()
    this.isInitialized = true

    console.log('Cloud backup scheduler initialized')
  }

  /**
   * Para o scheduler
   */
  stop(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer)
      this.periodicTimer = undefined
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove()
      this.appStateSubscription = undefined
    }
    this.isInitialized = false
  }

  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange)
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus): Promise<void> => {
    const settings = await cloudSettingsRepository.getSettings()

    if (!settings.syncEnabled) return

    if (nextAppState === 'background') {
      // App indo para background - força sync de dados críticos
      console.log('App going to background, forcing critical data sync')
      await this.backupQueue.forceSync('wallet')
      await this.backupQueue.forceSync('seed')
    } else if (nextAppState === 'active') {
      // App voltando ao foreground - verifica mudanças remotas
      console.log('App becoming active, checking for remote changes')
      // Em produção, poderia verificar se há mudanças remotas
      // e fazer download se necessário
    }
  }

  private setupPeriodicBackup(): void {
    // Backup periódico a cada 15 minutos
    const PERIODIC_BACKUP_INTERVAL = 15 * 60 * 1000 // 15 minutos

    this.periodicTimer = setInterval(async () => {
      const settings = await cloudSettingsRepository.getSettings()
      if (!settings.syncEnabled) return

      console.log('Running periodic cloud backup')
      try {
        // Sync de todos os repositórios
        await this.backupQueue.forceSync()
      } catch (error) {
        console.warn('Periodic cloud backup failed', error)
      }
    }, PERIODIC_BACKUP_INTERVAL)
  }

  /**
   * Força backup imediato de todos os repositórios
   */
  async forceFullBackup(): Promise<void> {
    console.log('Forcing full cloud backup')
    await this.backupQueue.forceSync()
  }

  /**
   * Retorna status do scheduler
   */
  getStatus(): {
    initialized: boolean
    periodicTimerActive: boolean
    queueStatus: { [repository: string]: number }
  } {
    return {
      initialized: this.isInitialized,
      periodicTimerActive: !!this.periodicTimer,
      queueStatus: this.backupQueue.getQueueStatus(),
    }
  }
}
