import { CloudStorage, CloudStorageProvider, CloudStorageScope } from 'react-native-cloud-storage'
import { Platform } from 'react-native'

/**
 * Wrapper para react-native-cloud-storage
 * Abstrai a dependência externa e permite troca futura
 */
export class CloudStorageWrapper {
  private static instance: CloudStorageWrapper

  private constructor() {
    // Configura o provider baseado na plataforma
    CloudStorage.setProvider(
      Platform.select({
        ios: CloudStorageProvider.ICloud,
        default: CloudStorageProvider.GoogleDrive,
      }),
    )
  }

  static getInstance(): CloudStorageWrapper {
    if (!CloudStorageWrapper.instance) {
      CloudStorageWrapper.instance = new CloudStorageWrapper()
    }
    return CloudStorageWrapper.instance
  }

  /**
   * Verifica se o cloud storage está disponível
   */
  async isAvailable(): Promise<boolean> {
    try {
      return await CloudStorage.isCloudAvailable()
    } catch (error) {
      console.warn('Cloud storage not available:', error)
      return false
    }
  }

  /**
   * Salva dados no cloud storage
   * @param key Chave única para os dados (será usado como path)
   * @param data Dados a serem salvos (serão serializados como JSON)
   */
  async setItem(key: string, data: any): Promise<void> {
    try {
      const serialized = JSON.stringify(data)
      const path = `${key}.json`
      await CloudStorage.writeFile(path, serialized, CloudStorageScope.AppData)
    } catch (error) {
      console.error(`Failed to save ${key} to cloud:`, error)
      throw error
    }
  }

  /**
   * Recupera dados do cloud storage
   * @param key Chave dos dados
   * @returns Dados desserializados ou null se não existir
   */
  async getItem<T = any>(key: string): Promise<T | null> {
    try {
      const path = `${key}.json`
      const data = await CloudStorage.readFile(path, CloudStorageScope.AppData)
      return JSON.parse(data) as T
    } catch (error: any) {
      // Qualquer erro ao ler é tratado como arquivo inexistente
      // Isso cobre "Directory not found", "File not found", etc.
      return null
    }
  }

  /**
   * Remove dados do cloud storage
   * @param key Chave dos dados a remover
   */
  async removeItem(key: string): Promise<void> {
    try {
      const path = `${key}.json`
      await CloudStorage.unlink(path, CloudStorageScope.AppData)
    } catch (error: any) {
      // Trata tentativa de remover arquivo inexistente como normal
      if (
        error?.message?.includes('Directory not found') ||
        error?.message?.includes('No such file') ||
        error?.message?.includes('does not exist')
      ) {
        return
      }
      console.error(`Failed to remove ${key} from cloud:`, error)
      throw error
    }
  }

  /**
   * Lista todas as chaves no cloud storage
   */
  async getAllKeys(): Promise<string[]> {
    try {
      const files = await CloudStorage.readdir('/', CloudStorageScope.AppData)
      return files.filter(file => file.endsWith('.json')).map(file => file.replace('.json', ''))
    } catch (error: any) {
      // Trata diretório inexistente como lista vazia
      if (
        error?.message?.includes('Directory not found') ||
        error?.message?.includes('No such file')
      ) {
        return []
      }
      console.error('Failed to get all keys from cloud:', error)
      throw error
    }
  }

  /**
   * Verifica se uma chave existe no cloud storage
   * @param key Chave a verificar
   */
  async hasKey(key: string): Promise<boolean> {
    try {
      const path = `${key}.json`
      return await CloudStorage.exists(path, CloudStorageScope.AppData)
    } catch (error: any) {
      // Trata erros de diretório/arquivo não encontrado como inexistente
      if (
        error?.message?.includes('Directory not found') ||
        error?.message?.includes('No such file') ||
        error?.message?.includes('does not exist')
      ) {
        return false
      }
      console.error(`Failed to check if ${key} exists in cloud:`, error)
      return false
    }
  }

  /**
   * Limpa todos os dados do cloud storage
   */
  async clear(): Promise<void> {
    try {
      const files = await CloudStorage.readdir('/', CloudStorageScope.AppData)
      for (const file of files) {
        await CloudStorage.unlink(`/${file}`, CloudStorageScope.AppData)
      }
    } catch (error: any) {
      // Trata erros de diretório não encontrado como normal (nada para limpar)
      if (
        error?.message?.includes('Directory not found') ||
        error?.message?.includes('No such file')
      ) {
        return
      }
      console.error('Failed to clear cloud storage:', error)
      throw error
    }
  }

  /**
   * Obtém metadados de um item
   * @param key Chave do item
   */
  async getItemMetadata(key: string): Promise<any> {
    try {
      const path = `${key}.json`
      const stats = await CloudStorage.stat(path, CloudStorageScope.AppData)
      return {
        size: stats.size,
        birthtime: stats.birthtime,
        mtime: stats.mtime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
      }
    } catch (error) {
      console.error(`Failed to get metadata for ${key}:`, error)
      return null
    }
  }
}
