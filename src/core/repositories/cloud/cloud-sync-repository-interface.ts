/**
 * Interface para sincronização de dados com nuvem
 * Abstrai a persistência local para permitir sincronização com serviços cloud
 */
export interface CloudSyncRepositoryInterface {
  /**
   * Faz upload dos dados locais para a nuvem
   * @param data Dados a serem enviados
   * @returns Promise que resolve quando o upload for concluído
   */
  upload(data: any): Promise<void>

  /**
   * Faz download dos dados da nuvem para local
   * @returns Promise com os dados baixados
   */
  download(): Promise<any>

  /**
   * Sincroniza dados entre local e nuvem
   * Resolve conflitos baseado em timestamp ou estratégia definida
   * @param localData Dados locais atuais
   * @returns Promise com dados sincronizados
   */
  sync(localData: any): Promise<any>

  /**
   * Verifica se há dados na nuvem
   * @returns Promise que resolve true se houver dados
   */
  hasRemoteData(): Promise<boolean>

  /**
   * Remove dados da nuvem
   * @returns Promise que resolve quando removido
   */
  deleteRemote(): Promise<void>

  /**
   * Obtém timestamp da última modificação na nuvem
   * @returns Promise com timestamp ou null se não existir
   */
  getRemoteTimestamp(): Promise<number | null>
}

/**
 * Estratégias de resolução de conflitos durante sincronização
 */
export enum ConflictResolutionStrategy {
  /** Última modificação vence */
  LAST_WRITE_WINS = 'last_write_wins',
  /** Mantém dados locais */
  KEEP_LOCAL = 'keep_local',
  /** Mantém dados remotos */
  KEEP_REMOTE = 'keep_remote',
  /** Merge manual (não implementado ainda) */
  MANUAL_MERGE = 'manual_merge',
}

/**
 * Metadados de sincronização
 */
export interface SyncMetadata {
  /** Timestamp da última sincronização */
  lastSync: number
  /** Timestamp da última modificação local */
  lastLocalChange: number
  /** Timestamp da última modificação remota */
  lastRemoteChange: number
  /** Estratégia de resolução de conflitos */
  conflictStrategy: ConflictResolutionStrategy
  /** Versão do schema dos dados */
  schemaVersion: string
}
