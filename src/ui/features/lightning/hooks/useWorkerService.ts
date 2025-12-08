/**
 * Hook para acessar o WorkerService
 *
 * Fornece acesso ao WorkerService que centraliza todas as funcionalidades
 * Lightning Network (monitor, conectividade, watchtower, etc.)
 */

import { WorkerService, createWorkerService } from '@/core/services/ln-worker-service'

// Instância singleton do WorkerService criada na importação
const workerServiceInstance = createWorkerService({
  network: 'testnet',
  maxPeers: 5,
  enableWatchtower: true,
  enableGossip: true,
  enableTrampoline: true,
})

/**
 * Hook para acessar o WorkerService
 *
 * Retorna uma instância singleton do WorkerService que centraliza
 * todas as funcionalidades Lightning Network.
 *
 * @returns Instância do WorkerService
 */
export function useWorkerService(): WorkerService {
  return workerServiceInstance
}

/**
 * Hook para acessar apenas o Lightning Monitor Service
 */
export function useLightningMonitor() {
  const workerService = useWorkerService()
  return workerService.getLightningMonitorService()
}

/**
 * Hook para acessar apenas o Peer Connectivity Service
 */
export function usePeerConnectivity() {
  const workerService = useWorkerService()
  return workerService.getPeerConnectivityService()
}

/**
 * Hook para acessar apenas o Watchtower Service
 */
export function useWatchtower() {
  const workerService = useWorkerService()
  return workerService.getWatchtowerService()
}
