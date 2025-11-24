import { ReactNode } from 'react'
import { SettingsProvider } from '@/ui/features/settings'
import { WalletProvider } from '@/ui/features/wallet'
import AuthProvider from '@/ui/features/auth/AuthProvider'
import NetworkProvider from '../network/NetworkProvider'
import AddressProvider from '../address/AddressProvider'

interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <SettingsProvider>
      <AuthProvider>
        <WalletProvider>
          <NetworkProvider>
            <AddressProvider>{children}</AddressProvider>
          </NetworkProvider>
        </WalletProvider>
      </AuthProvider>
    </SettingsProvider>
  )
}
