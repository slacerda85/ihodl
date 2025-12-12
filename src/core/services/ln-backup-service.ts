/**
 * Lightning Backup Service
 * Exposição controlada das APIs de backup para a UI.
 */

export {
  BackupManager,
  RestoreContext,
  RestoreState,
  ChannelBackupData,
  BackupVerificationResult,
  FullBackup,
  exportEncryptedBackup,
  importEncryptedBackup,
  exportSingleChannelBackup,
  importSingleChannelBackup,
  validateChannelBackup,
  getBackupChecksum,
  prepareChannelRestore,
  createRestoreSummary,
  CHANNEL_BACKUP_VERSION,
  RestoreSummary,
} from '../lib/lightning/backup'
