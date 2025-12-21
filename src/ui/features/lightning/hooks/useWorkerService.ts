/**
 * Hook para acessar o WorkerService
 *
 * Fornece acesso ao WorkerService que centraliza todas as funcionalidades
 * Lightning Network (monitor, conectividade, watchtower, etc.)
 *
 * IMPORTANTE: Este hook agora usa o singleton gerenciado pelo lightningStore,
 * eliminando múltiplas instâncias de WorkerService que causavam estado dessincronizado.
 *
 * @see docs/lightning-worker-consolidation-plan.md - Fase 1
 */

import type { WorkerService } from '@/core/services/ln-worker-service'
import { lightningStore } from '../store'

/**
 * Hook para acessar o WorkerService
 *
 * Retorna a instância singleton do WorkerService gerenciada pelo lightningStore.
 * Isso garante que toda a aplicação use a mesma instância do worker.
 *
 * @returns Instância do WorkerService
 * @throws Error se chamado antes do lightningStore estar disponível
 */
export function useWorkerService(): WorkerService {
  return lightningStore.getWorker()
}

/**
 * Hook para acessar o WorkerService de forma segura (sem exceção)
 *
 * Retorna a instância do WorkerService ou null se não estiver disponível/inicializado.
 * Útil em componentes que podem renderizar antes do Lightning estar pronto.
 *
 * @returns Instância do WorkerService ou null se não disponível
 *
 * @see docs/lightning-worker-consolidation-plan.md - Fase 2.1
 */
export function useWorkerServiceSafe(): WorkerService | null {
  try {
    const worker = lightningStore.getWorker()
    return worker.isInitialized() ? worker : null
  } catch {
    return null
  }
}

/**
 * Hook para verificar se o WorkerService está inicializado
 *
 * @returns true se o worker está pronto para uso
 *
 * @see docs/lightning-worker-consolidation-plan.md - Fase 2.1
 */
export function useWorkerReady(): boolean {
  try {
    const worker = lightningStore.getWorker()
    return worker.isInitialized()
  } catch {
    return false
  }
}

/**
 * Hook para acessar apenas o Lightning Monitor Service
 */
export function useLightningMonitor() {
  const workerService = useWorkerService()
  return workerService.getLightningMonitorService()
}

/**
 * Hook para acessar peers conectados via worker.peerManager
 */
export function useConnectedPeers() {
  const workerService = useWorkerService()
  return workerService.getConnectedPeers()
}

/**
 * Hook para acessar apenas o Watchtower Service
 */
export function useWatchtower() {
  const workerService = useWorkerService()
  return workerService.getWatchtowerService()
}
