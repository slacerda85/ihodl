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
    if (!connectionRef.current) {
      const connection = await networkService.connect()
      connectionRef.current = connection
    }
    return connectionRef.current
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
