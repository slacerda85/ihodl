import { Connection } from '@/core/models/network'
import { createContext, ReactNode, useContext, useRef } from 'react'
import networkService from '@/core/services/network'

type NetworkContextType = {
  getConnection(): Promise<Connection>
}
const NetworkContext = createContext<NetworkContextType | null>(null)

interface NetworkProviderProps {
  children: ReactNode
}

export default function NetworkProvider({ children }: NetworkProviderProps) {
  const connectionRef = useRef<Connection | null>(null)

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

  // Função auxiliar para verificar saúde da conexão
  function isConnectionHealthy(connection: Connection): boolean {
    // Verificar se o socket está writable e readable
    return connection.writable && connection.readable && !connection.destroyed
  }

  // no .Provider necessary anymore in React 19
  return <NetworkContext value={{ getConnection }}>{children}</NetworkContext>
}

export function useNetwork() {
  const context = useContext(NetworkContext)
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider')
  }
  return context
}
