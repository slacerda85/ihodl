import { ReactNode } from 'react'
import { AppProvider } from '@/ui/features/app-provider'
import NetworkProvider from '../network/NetworkProvider'
import LightningProvider from '../lightning/LightningProvider'
import { WatchtowerProvider } from '../lightning/useWatchtower'
import WalletChangeHandler from './WalletChangeHandler'

interface AppProvidersProps {
  children: ReactNode
}

/**
 * AppProviders - Hierarquia de contextos da aplicação
 *
 * Arquitetura Centralizada (v2):
 * - AppProvider: Provider único que agrega Settings, Auth, Wallet e Address stores
 * - NetworkProvider: conexões de rede (Electrum, Lightning) - mantido separado por refs
 * - LightningProvider: Lightning Network - funcionalidades complexas com estado próprio
 * - WatchtowerProvider: monitoramento de canais Lightning
 * - WalletChangeHandler: reage à mudança de wallet e faz discover de endereços
 *
 * O AppProvider usa stores singleton com useSyncExternalStore para performance máxima,
 * eliminando re-renders desnecessários e seguindo React 19 best practices.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AppProvider>
      <NetworkProvider>
        <LightningProvider>
          <WatchtowerProvider>
            <WalletChangeHandler />
            {children}
          </WatchtowerProvider>
        </LightningProvider>
      </NetworkProvider>
    </AppProvider>
  )
}
