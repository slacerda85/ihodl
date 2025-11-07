import React, { ReactNode } from 'react'
import { SettingsProvider } from '@/features/settings'
import { WalletProvider } from '@/features/wallet'
import { TransactionsProvider } from '@/features/transactions'
import { ElectrumProvider } from '@/features/electrum'
import { BlockchainProvider } from '@/features/blockchain'
import { LightningStateProvider, LightningProvider } from '@/features/lightning'
import AuthProvider from '@/features/auth/AuthProvider'

interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <SettingsProvider>
      <AuthProvider>
        <WalletProvider>
          <ElectrumProvider>
            <BlockchainProvider>
              <TransactionsProvider>
                <LightningStateProvider>
                  <LightningProvider>{children}</LightningProvider>
                </LightningStateProvider>
              </TransactionsProvider>
            </BlockchainProvider>
          </ElectrumProvider>
        </WalletProvider>
      </AuthProvider>
    </SettingsProvider>
  )
}
