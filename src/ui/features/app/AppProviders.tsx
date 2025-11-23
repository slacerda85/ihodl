import React, { ReactNode } from 'react'
import { SettingsProvider } from '@/ui/features/settings'
import { WalletProvider } from '@/ui/features/wallet'
// import { TransactionsProvider } from '@/ui/features/transactions'
// import { ElectrumProvider } from '@/ui/features/electrum'
// import { BlockchainProvider } from '@/ui/features/blockchain'
// import { LightningStateProvider, LightningProvider } from '@/ui/features/lightning'
import AuthProvider from '@/ui/features/auth/AuthProvider'
import { AccountProvider } from '../account/AccountProvider'
import NetworkProvider from '../network/NetworkProvider'

interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <SettingsProvider>
      <AuthProvider>
        <WalletProvider>
          <NetworkProvider>
            {/* <AccountProvider> */}
            {/* 
          <ElectrumProvider>
            <BlockchainProvider>
              <TransactionsProvider>
                <LightningStateProvider>
                  <LightningProvider> */}
            {children}
            {/* </LightningProvider>
                </LightningStateProvider>
              </TransactionsProvider>
            </BlockchainProvider>
          </ElectrumProvider>
         */}
            {/* </AccountProvider> */}
          </NetworkProvider>
        </WalletProvider>
      </AuthProvider>
    </SettingsProvider>
  )
}
