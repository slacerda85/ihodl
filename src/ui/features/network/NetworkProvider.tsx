import { Connection } from '@/core/models/network'
import { createContext, ReactNode, useContext, useRef } from 'react'
import networkService from '@/core/services/network'
import LightningWorker from '@/core/lib/lightning/worker'

type NetworkContextType = {
  getConnection(): Promise<Connection>
  getLightningWorker(
    masterKey: Uint8Array,
    network?: 'mainnet' | 'testnet' | 'regtest',
  ): Promise<LightningWorker>
}
const NetworkContext = createContext<NetworkContextType | null>(null)

interface NetworkProviderProps {
  children: ReactNode
}

export default function NetworkProvider({ children }: NetworkProviderProps) {
  const connectionRef = useRef<Connection | null>(null)
  const lightningClientRef = useRef<LightningWorker | null>(null)

  async function getConnection() {
    // Verificar se a conexão existe e está saudável
    if (
      !connectionRef.current ||
      connectionRef.current.destroyed ||
      !isConnectionHealthy(connectionRef.current)
    ) {
      // Se não estiver saudável, conectar novamente
      const connection = await networkService.connect()
      connectionRef.current = connection
    }
    // Ensure there's always an error listener to prevent "no listeners" warnings
    if (connectionRef.current.listenerCount('error') === 0) {
      connectionRef.current.on('error', err => {
        console.warn('[NetworkProvider] Connection error:', err.message)
        connectionRef.current?.destroy()
        connectionRef.current = null
      })
    }
    return connectionRef.current
  }

  async function getLightningWorker(
    masterKey: Uint8Array,
    network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
  ): Promise<LightningWorker> {
    // Verificar se já existe um cliente ativo
    if (lightningClientRef.current) {
      // Verificar se a conexão ainda está saudável
      const connection = (lightningClientRef.current as any).connection
      if (!connection.destroyed && isConnectionHealthy(connection)) {
        return lightningClientRef.current
      }
      // Se não estiver saudável, fechar o cliente antigo
      await lightningClientRef.current.close()
    }

    // Criar novo worker Lightning
    const worker = await networkService.createLightningWorker(masterKey, network)
    lightningClientRef.current = worker

    // Configurar listener de erro
    const connection = (worker as any).connection
    if (connection.listenerCount('error') === 0) {
      connection.on('error', (err: Error) => {
        console.warn('[NetworkProvider] Lightning connection error:', err.message)
        lightningClientRef.current = null
      })
    }

    return worker
  }

  // Função auxiliar para verificar saúde da conexão
  function isConnectionHealthy(connection: Connection): boolean {
    // Verificar se o socket não foi destruído
    return !connection.destroyed
  }

  // no .Provider necessary anymore in React 19
  return <NetworkContext value={{ getConnection, getLightningWorker }}>{children}</NetworkContext>
}

export function useNetwork() {
  const context = useContext(NetworkContext)
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider')
  }
  return context
}
