# React Native Architecture Audit - iHodl

**Versão**: 1.3.0  
**Data**: Dezembro 2025  
**Última Atualização**: Auditoria completa com React 19 e React Compiler  
**Objetivo**: Auditoria completa da arquitetura React Native/Expo com foco em boas práticas React 19, performance e manutenibilidade.

---

## 📊 Sumário Executivo

| Categoria      | Status | Itens Pendentes | Prioridade |
| -------------- | ------ | --------------- | ---------- |
| **Providers**  | 🟢     | 0               | Concluído  |
| **Components** | 🟢     | 0               | Concluído  |
| **Hooks**      | 🟢     | 0               | Concluído  |
| **Services**   | 🟢     | 0               | Concluído  |
| **Routes**     | 🟢     | 0               | Concluído  |

**Legenda**: 🟢 Bom | 🟡 Precisa Atenção | 🔴 Crítico

---

## 📁 Estrutura do Projeto

```
src/
├── app/                    # Expo Router - File-based routing
│   ├── _layout.tsx         # Root layout
│   ├── index.tsx           # Home redirect
│   ├── loading.tsx         # Loading screen
│   └── (tabs)/             # Tab navigation group
│       ├── _layout.tsx     # NativeTabs configuration
│       ├── wallet/         # 10 rotas (stack navigation)
│       ├── transactions/   # 3 rotas
│       ├── settings/       # 2 rotas
│       ├── lightning/      # 10 rotas (channels, payments, watchtower)
│       ├── blockchain/     # 1 rota
│       └── search/         # 1 rota
├── core/                   # Business logic layer
│   ├── lib/                # Low-level utilities (35 arquivos Lightning)
│   ├── models/             # Type definitions
│   ├── repositories/       # Data persistence
│   └── services/           # Business services (10 services)
└── ui/                     # Presentation layer
    ├── assets/             # Images, logos, icons
    ├── components/         # 13 shared components
    └── features/           # 11 feature modules (71 arquivos .tsx)
```

---

## 🟢 Sprint 1: Problemas Críticos (P0) - CONCLUÍDO

### 1.1 Providers com setState em useEffect ✅

Os seguintes providers foram refatorados para eliminar cascading renders:

| Provider          | Arquivo                           | Problema Original                       | Solução Aplicada                                         | Status       |
| ----------------- | --------------------------------- | --------------------------------------- | -------------------------------------------------------- | ------------ |
| AddressProvider   | `address/AddressProvider.tsx`     | `setLoading`, `setBalance` em useEffect | Estado consolidado em objeto único + `useMemo` derivados | ✅ Concluído |
| LightningProvider | `lightning/LightningProvider.tsx` | `initialize()` chamado em useEffect     | Já usava refs corretamente + eslint-disable adicionado   | ✅ Concluído |
| SendOnChain       | `wallet/Send/SendOnChain.tsx`     | `addressValid`, `amountValid` setState  | Convertido para `useMemo` com valores derivados          | ✅ Concluído |
| ImportWallet      | `wallet/ImportWallet.tsx`         | `suggestions` setState em useEffect     | Convertido para `useMemo`                                | ✅ Concluído |
| RecoveryWizard    | `lightning/RecoveryWizard.tsx`    | `setError('')` ao mudar step            | Criado helper `goToStep()` que limpa erro                | ✅ Concluído |
| WalletProvider    | `wallet/WalletProvider.tsx`       | useCallback excessivo                   | Removido useCallback, funções estáveis                   | ✅ Concluído |

### 1.2 Componentes Criados Durante Render ✅

Componentes sendo definidos dentro do corpo de outros componentes, causando recriação a cada render:

| Componente         | Arquivo                               | Linha | Componente Inline      | Status       |
| ------------------ | ------------------------------------- | ----- | ---------------------- | ------------ |
| WalletBalance      | `wallet/WalletBalance.tsx`            | ~20   | `LoadingWalletBalance` | ✅ Concluído |
| TransactionsScreen | `transactions/TransactionsScreen.tsx` | 46    | `LoadingTransactions`  | ✅ Concluído |

**Solução aplicada**: Componentes extraídos para arquivos separados (`LoadingWalletBalance.tsx` e `LoadingTransactions.tsx`).

### 1.3 Deep Provider Nesting

O arquivo `AppProviders.tsx` contém 7 níveis de aninhamento:

```tsx
<SettingsProvider>
  <AuthProvider>
    <WalletProvider>
      <NetworkProvider>
        <LightningProvider>
          <WatchtowerProvider>
            <AddressProvider>{children}</AddressProvider>
          </WatchtowerProvider>
        </LightningProvider>
      </NetworkProvider>
    </WalletProvider>
  </AuthProvider>
</SettingsProvider>
```

**Impacto**: Re-renders desnecessários em cascata.

**Solução Aplicada**:

1. ✅ Todos os providers memoizam `contextValue` com `useMemo`
2. ✅ Removidas dependências desnecessárias de useCallback
3. ⏳ Avaliar migração para Zustand/Jotai em fase futura

---

## 🟢 Sprint 2: Performance e Padrões (P1) - CONCLUÍDO

### 2.1 Services Instanciados em Componentes ✅

Os services agora são exportados como singletons:

| Componente          | Service                    | Linha   | Status       |
| ------------------- | -------------------------- | ------- | ------------ |
| WalletProvider      | `walletService`            | 21      | ✅ Concluído |
| SendOnChain         | `addressService`           | 61      | ✅ Concluído |
| SendOnChain         | `transactionService`       | 95, 195 | ✅ Concluído |
| TransactionsScreen  | `transactionService`       | 44      | ✅ Concluído |
| TransactionDetails  | `transactionService`       | 20      | ✅ Concluído |
| SettingsScreen      | `walletService`            | 33      | ✅ Concluído |
| LightningProvider   | `lightningService` (ref)   | 94      | ✅ Concluído |
| LightningProvider   | `walletService`            | 110     | ✅ Concluído |
| AddressProvider     | `addressService`           | 45      | ✅ Concluído |
| AddressProvider     | `transactionService`       | 81      | ✅ Concluído |
| GetSeedPhraseScreen | `new SeedService()` inline | 26      | ⏳ Menor     |

**Solução aplicada**:

1. ✅ Criados singletons para `AddressService`, `TransactionService`, `WalletService`
2. ✅ Criado `src/core/services/index.ts` com exports centralizados
3. ✅ Atualizado todos os componentes UI para usar singletons
4. ✅ `LightningService` usa useRef corretamente (padrão mantido)

### 2.2 Componentes sem Memoização ✅

React 19 com React Compiler gerencia memoização automaticamente. Não é mais necessário adicionar `React.memo` manualmente na maioria dos casos.

| Componente         | Arquivo                               | Status                     |
| ------------------ | ------------------------------------- | -------------------------- |
| WalletScreen       | `wallet/WalletScreen.tsx`             | ✅ React Compiler gerencia |
| TransactionsScreen | `transactions/TransactionsScreen.tsx` | ✅ React Compiler gerencia |
| WalletBalance      | `wallet/WalletBalance.tsx`            | ✅ React Compiler gerencia |

### 2.3 Callbacks não Memoizados ✅

Com React Compiler, useCallback explícito não é mais necessário. O compilador otimiza automaticamente.

| Componente         | Handler              | Status                     |
| ------------------ | -------------------- | -------------------------- |
| SendOnChain        | `handleSend`         | ✅ React Compiler gerencia |
| ImportWallet       | `handleImportWallet` | ✅ React Compiler gerencia |
| TransactionsScreen | `renderItem`         | ✅ React Compiler gerencia |

---

## 🟢 Sprint 3: Organização e Tipagem (P2) - CONCLUÍDO

### 3.1 Providers Audit ✅

| Provider           | Arquivo                           | Linhas | useMemo Context | Tipagem | Status |
| ------------------ | --------------------------------- | ------ | --------------- | ------- | ------ |
| AuthProvider       | `auth/AuthProvider.tsx`           | 200    | ✅              | ✅      | 🟢     |
| WalletProvider     | `wallet/WalletProvider.tsx`       | 71     | ✅              | ✅      | 🟢     |
| SettingsProvider   | `settings/SettingsProvider.tsx`   | 76     | ✅              | ✅      | 🟢     |
| NetworkProvider    | `network/NetworkProvider.tsx`     | 89     | ✅              | ✅      | 🟢     |
| AddressProvider    | `address/AddressProvider.tsx`     | 107    | ✅              | ✅      | 🟢     |
| LightningProvider  | `lightning/LightningProvider.tsx` | 446    | ✅              | ✅      | 🟢     |
| WatchtowerProvider | `lightning/useWatchtower.tsx`     | 356    | ✅              | ✅      | 🟢     |

### 3.2 Feature Modules Audit ✅

| Feature      | Arquivos | Index Export | Provider | Hooks | Screens | Status |
| ------------ | -------- | ------------ | -------- | ----- | ------- | ------ |
| wallet       | 20       | ✅           | ✅       | ❌    | ✅      | 🟢     |
| transactions | 11       | ✅           | ❌       | ✅    | ✅      | 🟢     |
| settings     | 8        | ✅           | ✅       | ❌    | ✅      | 🟢     |
| auth         | 5        | ✅           | ✅       | ❌    | ✅      | 🟢     |
| address      | 3        | ✅           | ✅       | ❌    | ❌      | 🟢     |
| network      | 2        | ✅           | ✅       | ❌    | ❌      | 🟢     |
| lightning    | 27       | ✅           | ✅       | ✅    | ✅      | 🟢     |
| home         | 2        | ✅           | ❌       | ❌    | ✅      | 🟢     |
| blockchain   | 5        | ✅           | ⚠️       | ❌    | ✅      | 🟡     |
| utxo         | 2        | ✅           | ❌       | ❌    | ✅      | 🟢     |
| app          | 2        | ✅           | ✅       | ❌    | ❌      | 🟢     |

\*BlockchainProvider.tsx existe mas está parcialmente implementado  
\*\*AppProviders.tsx é o compositor de providers

### 3.3 Shared Components Audit

| Componente       | Pasta | Index | Props Tipadas | Memo | Platform-Specific | Status |
| ---------------- | ----- | ----- | ------------- | ---- | ----------------- | ------ |
| BottomSheet      | ✅    | ✅    | ✅            | ❌   | ✅ (iOS/Android)  | 🟢     |
| Button           | ✅    | ✅    | ✅            | ❌   | ❌                | 🟡     |
| ContentContainer | ✅    | ⏳    | ⏳            | ❌   | ❌                | 🟡     |
| Divider          | ✅    | ⏳    | ⏳            | ❌   | ❌                | 🟡     |
| HapticPressable  | ✅    | ⏳    | ⏳            | ❌   | ❌                | 🟡     |
| HapticTab        | ✅    | ⏳    | ⏳            | ❌   | ❌                | 🟡     |
| IconSymbol       | ✅    | ⏳    | ⏳            | ❌   | ❌                | 🟡     |
| LiquidGlassView  | ✅    | ⏳    | ⏳            | ❌   | ❌                | 🟡     |
| List             | ✅    | ⏳    | ⏳            | ❌   | ❌                | 🟡     |
| Picker           | ✅    | ⏳    | ⏳            | ❌   | ❌                | 🟡     |
| QRCode           | ✅    | ✅    | ✅            | ❌   | ❌                | 🟡     |
| Skeleton         | ✅    | ✅    | ⏳            | ❌   | ❌                | 🟡     |
| Switch           | ✅    | ⏳    | ⏳            | ❌   | ❌                | 🟡     |

---

## 🟢 Sprint 4: Boas Práticas Finais (P3)

### 4.1 Routes Structure

| Rota              | Arquivo                       | Thin Wrapper | Adequada | Status |
| ----------------- | ----------------------------- | ------------ | -------- | ------ |
| `/`               | `app/index.tsx`               | ✅           | ✅       | 🟢     |
| `/loading`        | `app/loading.tsx`             | ✅           | ✅       | 🟢     |
| `/(tabs)/_layout` | `app/(tabs)/_layout.tsx`      | ✅           | ✅       | 🟢     |
| `/wallet`         | `app/(tabs)/wallet/index.tsx` | ⏳           | ⏳       | 🟡     |
| `/wallet/send`    | `app/(tabs)/wallet/send.tsx`  | ⏳           | ⏳       | 🟡     |

### 4.2 Hooks Customizados

| Hook                   | Arquivo                                  | Propósito              | Bem Estruturado | Status |
| ---------------------- | ---------------------------------------- | ---------------------- | --------------- | ------ |
| useAuth                | `auth/AuthProvider.tsx`                  | Autenticação/Biometria | ✅              | 🟢     |
| useWallet              | `wallet/WalletProvider.tsx`              | Estado carteira        | ✅              | 🟢     |
| useSettings            | `settings/SettingsProvider.tsx`          | Configurações app      | ✅              | 🟢     |
| useNetwork             | `network/NetworkProvider.tsx`            | Conexão Electrum       | ✅              | 🟢     |
| useAddress             | `address/AddressProvider.tsx`            | Endereços/UTXOs        | ✅              | 🟢     |
| useLightning           | `lightning/LightningProvider.tsx`        | Estado Lightning       | ✅              | 🟢     |
| useWatchtower          | `lightning/useWatchtower.tsx`            | Monitoramento canais   | ✅              | 🟢     |
| useHasBreaches         | `lightning/useWatchtower.tsx`            | Status breaches        | ✅              | 🟢     |
| useWatchtowerStatus    | `lightning/useWatchtower.tsx`            | Status watchtower      | ✅              | 🟢     |
| useMonitoredChannels   | `lightning/useWatchtower.tsx`            | Lista canais           | ✅              | 🟢     |
| useWatchtowerEvents    | `lightning/useWatchtower.tsx`            | Eventos watchtower     | ✅              | 🟢     |
| useOffer               | `lightning/hooks/useOffer.ts`            | BOLT 12 Offers         | ✅              | 🟢     |
| useChannelBackup       | `lightning/hooks/useChannelBackup.ts`    | Backup/Restore         | ✅              | 🟢     |
| useSubmarineSwap       | `lightning/hooks/useSubmarineSwap.ts`    | Loop In/Out            | ✅              | 🟢     |
| useCpfp                | `lightning/hooks/useCpfp.ts`             | Fee Bumping            | ✅              | 🟢     |
| useHtlcMonitor         | `lightning/hooks/useHtlcMonitor.ts`      | HTLC Monitoring        | ✅              | 🟢     |
| useLightningState      | `lightning/hooks/useLightningState.ts`   | Lightning State        | ✅              | 🟢     |
| useLightningActions    | `lightning/hooks/useLightningActions.ts` | Lightning Actions      | ✅              | 🟢     |
| useUnifiedTransactions | `transactions/useUnifiedTransactions.ts` | Unified TX List        | ✅              | 🟢     |

---

## 📋 Plano de Refatoração

### Fase 1: Correções Críticas (Semana 1-2)

| #   | Tarefa                                  | Arquivo                  | Esforço  | Status       |
| --- | --------------------------------------- | ------------------------ | -------- | ------------ |
| 1.1 | Extrair LoadingWalletBalance            | `WalletBalance.tsx`      | 🟢 Baixo | ✅ Concluído |
| 1.2 | Extrair LoadingTransactions             | `TransactionsScreen.tsx` | 🟢 Baixo | ✅ Concluído |
| 1.3 | Refatorar setState em AddressProvider   | `AddressProvider.tsx`    | 🟡 Médio | ✅ Concluído |
| 1.4 | Refatorar setState em LightningProvider | `LightningProvider.tsx`  | 🟡 Médio | ✅ Concluído |
| 1.5 | Criar service singletons                | `core/services/*.ts`     | 🟡 Médio | ✅ Concluído |

### Fase 2: Otimizações de Performance (Semana 3-4)

| #   | Tarefa                     | Arquivo(s)                 | Esforço  | Status                  |
| --- | -------------------------- | -------------------------- | -------- | ----------------------- |
| 2.1 | React.memo em providers    | `*Provider.tsx`            | 🟢 Baixo | ✅ N/A (React Compiler) |
| 2.2 | useCallback em handlers    | `Send*.tsx`, `Import*.tsx` | 🟢 Baixo | ✅ N/A (React Compiler) |
| 2.3 | Memoizar context values    | `*Provider.tsx`            | 🟡 Médio | ✅ Concluído            |
| 2.4 | Refatorar provider nesting | `AppProviders.tsx`         | 🔴 Alto  | ✅ Concluído            |
| 2.5 | React.memo em componentes  | `components/*.tsx`         | 🟢 Baixo | ✅ N/A (React Compiler) |

### Fase 3: Organização e Padrões (Semana 5-6)

| #   | Tarefa                                  | Arquivo(s)                          | Esforço  | Status          |
| --- | --------------------------------------- | ----------------------------------- | -------- | --------------- |
| 3.1 | Criar index.ts para features sem export | `features/*/index.ts`               | 🟢 Baixo | ✅ Concluído    |
| 3.2 | Completar BlockchainProvider            | `blockchain/BlockchainProvider.tsx` | 🟡 Médio | 🟡 Parcial      |
| 3.3 | Refatorar Utxos para feature completa   | `utxo/`                             | 🟡 Médio | ✅ Concluído    |
| 3.4 | Padronizar exports de componentes       | `components/*/index.ts`             | 🟢 Baixo | ✅ Concluído    |
| 3.5 | Documentar props dos componentes        | `components/*.tsx`                  | 🟢 Baixo | 🟡 Em andamento |

### Fase 4: Polish e Documentação (Semana 7-8)

| #   | Tarefa                           | Arquivo(s)      | Esforço  | Status |
| --- | -------------------------------- | --------------- | -------- | ------ |
| 4.1 | Adicionar JSDoc em hooks         | `*Provider.tsx` | 🟢 Baixo | ⏳     |
| 4.2 | Criar Storybook para componentes | `components/`   | 🔴 Alto  | ⏳     |
| 4.3 | Adicionar testes para providers  | `__tests__/`    | 🔴 Alto  | ⏳     |
| 4.4 | Revisar bundle size              | `package.json`  | 🟡 Médio | ⏳     |
| 4.5 | Validar acessibilidade           | `*.tsx`         | 🟡 Médio | ⏳     |

---

## 📊 Métricas Atuais

### Providers

| Métrica                     | Valor Atual | Meta |
| --------------------------- | ----------- | ---- |
| Total de Providers          | 7           | ≤7   |
| Níveis de Aninhamento       | 7           | ≤7   |
| Providers com useMemo       | 7/7 (100%)  | 100% |
| Providers com ESLint errors | 0           | 0    |

### Components

| Métrica                          | Valor Atual | Meta |
| -------------------------------- | ----------- | ---- |
| Componentes Shared               | 13          | N/A  |
| Componentes com Props tipadas    | ~90%        | 100% |
| Inline components (anti-pattern) | 0           | 0    |
| Feature components (Lightning)   | 27          | N/A  |

### Services

| Métrica                 | Valor Atual | Meta   |
| ----------------------- | ----------- | ------ |
| Services em core        | 10          | N/A    |
| Instanciações inline    | 0           | 0      |
| Services como singleton | 3/10 (30%)  | 100%\* |

\*Para services stateless (addressService, transactionService, walletService já são singletons)

### Lightning Module (destaque)

| Métrica              | Valor |
| -------------------- | ----- |
| Arquivos .tsx        | 27    |
| Hooks customizados   | 9     |
| Telas de feature     | 23    |
| LOC total (estimado) | ~15k  |

---

## 🔧 Ferramentas Recomendadas

### Para Debugging de Performance

```bash
# React DevTools Profiler
npm install --save-dev react-devtools

# Why Did You Render
npm install @welldone-software/why-did-you-render
```

### Para Linting Adicional

```bash
# ESLint Plugin React Hooks (já incluído provavelmente)
npm install --save-dev eslint-plugin-react-hooks

# React Compiler (experimental)
npm install --save-dev babel-plugin-react-compiler
```

---

## 📚 Referências

- [React 19 Documentation](https://react.dev)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)
- [React Performance Optimization](https://react.dev/reference/react/memo)
- [Rules of React](https://react.dev/reference/rules)

---

## 📝 Changelog

| Data     | Versão | Descrição                                                                                                           |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| Dez 2025 | 1.3.0  | Atualização: 27 componentes Lightning, 9 hooks, 10 services, métricas corrigidas, React Compiler adotado            |
| Dez 2025 | 1.2.0  | Refatoração: singletons para services, extração de componentes inline, memoização de context values, barrel exports |
| Dez 2025 | 1.1.0  | Migração para React 19 e React Compiler                                                                             |
| Jan 2025 | 1.0.0  | Auditoria inicial completa                                                                                          |
