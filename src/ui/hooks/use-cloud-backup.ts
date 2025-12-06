import { useEffect } from 'react'
import { CloudBackupScheduler } from '../../core/repositories/cloud/cloud-backup-scheduler'

/**
 * Hook para inicializar o sistema de backup em nuvem
 * Deve ser chamado no nível mais alto da aplicação
 */
export function useCloudBackup() {
  useEffect(() => {
    const scheduler = CloudBackupScheduler.getInstance()

    // Inicializa o scheduler
    scheduler.initialize().catch(error => {
      console.warn('Failed to initialize cloud backup scheduler', error)
    })

    // Cleanup quando o componente desmontar
    return () => {
      scheduler.stop()
    }
  }, [])
}

/**
 * Utilitário para forçar backup completo
 * Útil para debugging ou ações manuais do usuário
 */
export async function forceCloudBackup(): Promise<void> {
  const scheduler = CloudBackupScheduler.getInstance()
  await scheduler.forceFullBackup()
}

/**
 * Utilitário para obter status do backup
 * Útil para debugging e UI
 */
export function getCloudBackupStatus() {
  const scheduler = CloudBackupScheduler.getInstance()
  return scheduler.getStatus()
}
