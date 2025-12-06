import { ReactNode } from 'react'
import { SettingsProvider } from '@/ui/features/settings'
import WalletProviderV2 from '@/ui/features/wallet/WalletProviderV2'
import AuthProvider from '@/ui/features/auth/AuthProvider'
import NetworkProvider from '../network/NetworkProvider'
import AddressProviderV2 from '../address/AddressProviderV2'
import LightningProvider from '../lightning/LightningProvider'
import { WatchtowerProvider } from '../lightning/useWatchtower'

interface AppProvidersProps {
  children: ReactNode
}

/**
 * AppProviders - Hierarquia de contextos da aplicação
 *
 * Ordem baseada nas dependências:
 * 1. SettingsProvider - configurações globais (mais externo)
 * 2. AuthProvider - autenticação do usuário
 * 3. WalletProvider - gerenciamento de carteiras
 * 4. NetworkProvider - conexões de rede (Electrum, Lightning)
 * 5. LightningProvider - Lightning Network
 * 6. WatchtowerProvider - monitoramento de canais Lightning
 * 7. AddressProvider - endereços e UTXOs (depende de useWallet e useNetwork)
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <SettingsProvider>
      <AuthProvider>
        <WalletProviderV2>
          <NetworkProvider>
            <LightningProvider>
              <WatchtowerProvider>
                <AddressProviderV2>{children}</AddressProviderV2>
              </WatchtowerProvider>
            </LightningProvider>
          </NetworkProvider>
        </WalletProviderV2>
      </AuthProvider>
    </SettingsProvider>
  )
}
