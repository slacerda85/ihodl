import { MMKV } from 'react-native-mmkv'
import { ConflictResolutionStrategy } from './cloud-sync-repository-interface'

const cloudSettingsStorage = new MMKV({
  id: 'cloud-settings-storage',
})

interface CloudSettings {
  syncEnabled: boolean
  conflictStrategy: ConflictResolutionStrategy
  lastSyncCheck: number
  autoSync: boolean
}

interface CloudSettingsRepositoryInterface {
  getSettings(): CloudSettings
  setSyncEnabled(enabled: boolean): void
  setConflictStrategy(strategy: ConflictResolutionStrategy): void
  setAutoSync(enabled: boolean): void
  updateLastSyncCheck(): void
  clear(): void
}

export class CloudSettingsRepository implements CloudSettingsRepositoryInterface {
  private readonly SETTINGS_KEY = 'cloud_settings'

  getSettings(): CloudSettings {
    const settingsData = cloudSettingsStorage.getString(this.SETTINGS_KEY)
    if (!settingsData) {
      return this.getDefaultSettings()
    }
    return { ...this.getDefaultSettings(), ...JSON.parse(settingsData) }
  }

  private getDefaultSettings(): CloudSettings {
    return {
      syncEnabled: false,
      conflictStrategy: ConflictResolutionStrategy.LAST_WRITE_WINS,
      lastSyncCheck: 0,
      autoSync: false,
    }
  }

  setSyncEnabled(enabled: boolean): void {
    const settings = this.getSettings()
    settings.syncEnabled = enabled
    this.saveSettings(settings)
  }

  setConflictStrategy(strategy: ConflictResolutionStrategy): void {
    const settings = this.getSettings()
    settings.conflictStrategy = strategy
    this.saveSettings(settings)
  }

  setAutoSync(enabled: boolean): void {
    const settings = this.getSettings()
    settings.autoSync = enabled
    this.saveSettings(settings)
  }

  updateLastSyncCheck(): void {
    const settings = this.getSettings()
    settings.lastSyncCheck = Date.now()
    this.saveSettings(settings)
  }

  private saveSettings(settings: CloudSettings): void {
    cloudSettingsStorage.set(this.SETTINGS_KEY, JSON.stringify(settings))
  }

  clear(): void {
    cloudSettingsStorage.delete(this.SETTINGS_KEY)
  }
}

const cloudSettingsRepository = new CloudSettingsRepository()

export default cloudSettingsRepository
