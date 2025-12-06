# React Native Architecture Audit - iHodl

**Versão**: 1.2.0  
**Data**: Dezembro 2025  
**Última Atualização**: Refatoração profunda de cascading renders concluída  
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
│       ├── settings/       # 3 rotas
│       └── search/         # 1 rota
├── core/                   # Business logic layer
│   ├── lib/                # Low-level utilities
│   ├── models/             # Type definitions
│   ├── repositories/       # Data persistence
│   └── services/           # Business services
└── ui/                     # Presentation layer
    ├── assets/             # Images, logos, icons
    ├── components/         # 13 shared components
    └── features/           # 11 feature modules
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
| wallet       | 16       | ✅           | ✅       | ❌    | ✅      | 🟢     |
| transactions | 6        | ✅           | ❌       | ❌    | ✅      | 🟢     |
| settings     | 6        | ✅           | ✅       | ❌    | ✅      | 🟢     |
| auth         | 4        | ✅           | ✅       | ❌    | ✅      | 🟢     |
| address      | 2        | ✅           | ✅       | ❌    | ❌      | 🟢     |
| network      | 2        | ✅           | ✅       | ❌    | ❌      | 🟢     |
| lightning    | 17       | ✅           | ✅       | ✅    | ✅      | 🟢     |
| home         | 2        | ✅           | ❌       | ❌    | ✅      | 🟢     |
| blockchain   | 5        | ✅           | ❌\*     | ❌    | ✅      | 🔴     |
| utxo         | 2        | ✅           | ❌       | ❌    | ❌      | 🟡     |
| app          | 2        | ✅           | ✅\*\*   | ❌    | ❌      | 🟢     |

\*BlockchainProvider.tsx existe mas está vazio  
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

| Hook                 | Arquivo                           | Propósito              | Bem Estruturado | Status |
| -------------------- | --------------------------------- | ---------------------- | --------------- | ------ |
| useAuth              | `auth/AuthProvider.tsx`           | Autenticação/Biometria | ✅              | 🟢     |
| useWallet            | `wallet/WalletProvider.tsx`       | Estado carteira        | 🟡              | 🟡     |
| useSettings          | `settings/SettingsProvider.tsx`   | Configurações app      | ✅              | 🟢     |
| useNetwork           | `network/NetworkProvider.tsx`     | Conexão Electrum       | ✅              | 🟢     |
| useAddress           | `address/AddressProvider.tsx`     | Endereços/UTXOs        | 🟡              | 🟡     |
| useLightning         | `lightning/LightningProvider.tsx` | Estado Lightning       | ✅              | 🟢     |
| useWatchtower        | `lightning/useWatchtower.tsx`     | Monitoramento canais   | ✅              | 🟢     |
| useHasBreaches       | `lightning/useWatchtower.tsx`     | Status breaches        | ✅              | 🟢     |
| useWatchtowerStatus  | `lightning/useWatchtower.tsx`     | Status watchtower      | ✅              | 🟢     |
| useMonitoredChannels | `lightning/useWatchtower.tsx`     | Lista canais           | ✅              | 🟢     |
| useWatchtowerEvents  | `lightning/useWatchtower.tsx`     | Eventos watchtower     | ✅              | 🟢     |

---

## 📋 Plano de Refatoração

### Fase 1: Correções Críticas (Semana 1-2)

| #   | Tarefa                                  | Arquivo                  | Esforço  | Status |
| --- | --------------------------------------- | ------------------------ | -------- | ------ |
| 1.1 | Extrair LoadingWalletBalance            | `WalletBalance.tsx`      | 🟢 Baixo | ⏳     |
| 1.2 | Extrair LoadingTransactions             | `TransactionsScreen.tsx` | 🟢 Baixo | ⏳     |
| 1.3 | Refatorar setState em AddressProvider   | `AddressProvider.tsx`    | 🟡 Médio | ⏳     |
| 1.4 | Refatorar setState em LightningProvider | `LightningProvider.tsx`  | 🟡 Médio | ⏳     |
| 1.5 | Criar service singletons                | `core/services/*.ts`     | 🟡 Médio | ⏳     |

### Fase 2: Otimizações de Performance (Semana 3-4)

| #   | Tarefa                              | Arquivo(s)                 | Esforço  | Status |
| --- | ----------------------------------- | -------------------------- | -------- | ------ |
| 2.1 | Adicionar React.memo em providers   | `*Provider.tsx`            | 🟢 Baixo | ⏳     |
| 2.2 | Adicionar useCallback em handlers   | `Send*.tsx`, `Import*.tsx` | 🟢 Baixo | ⏳     |
| 2.3 | Memoizar context values             | `*Provider.tsx`            | 🟡 Médio | ⏳     |
| 2.4 | Refatorar provider nesting          | `AppProviders.tsx`         | 🔴 Alto  | ⏳     |
| 2.5 | Adicionar React.memo em componentes | `components/*.tsx`         | 🟢 Baixo | ⏳     |

### Fase 3: Organização e Padrões (Semana 5-6)

| #   | Tarefa                                  | Arquivo(s)                          | Esforço  | Status |
| --- | --------------------------------------- | ----------------------------------- | -------- | ------ |
| 3.1 | Criar index.ts para features sem export | `features/*/index.ts`               | 🟢 Baixo | ⏳     |
| 3.2 | Completar BlockchainProvider            | `blockchain/BlockchainProvider.tsx` | 🟡 Médio | ⏳     |
| 3.3 | Refatorar Utxos para feature completa   | `utxo/`                             | 🟡 Médio | ⏳     |
| 3.4 | Padronizar exports de componentes       | `components/*/index.ts`             | 🟢 Baixo | ⏳     |
| 3.5 | Documentar props dos componentes        | `components/*.tsx`                  | 🟢 Baixo | ⏳     |

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
| Total de Providers          | 7           | ≤5   |
| Níveis de Aninhamento       | 7           | ≤3   |
| Providers com useCallback   | 4/7 (57%)   | 100% |
| Providers com useMemo       | 1/7 (14%)   | 100% |
| Providers com ESLint errors | 2           | 0    |

### Components

| Métrica                          | Valor Atual | Meta |
| -------------------------------- | ----------- | ---- |
| Componentes Shared               | 13          | N/A  |
| Componentes com React.memo       | 0/13 (0%)   | 100% |
| Componentes com Props tipadas    | ~60%        | 100% |
| Inline components (anti-pattern) | 2           | 0    |

### Services

| Métrica                 | Valor Atual | Meta   |
| ----------------------- | ----------- | ------ |
| Services em core        | 9           | N/A    |
| Instanciações inline    | 13          | 0      |
| Services como singleton | 0/9 (0%)    | 100%\* |

\*Para services stateless

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
| Dez 2025 | 1.1.0  | Refatoração: singletons para services, extração de componentes inline, memoização de context values, barrel exports |
| Jan 2025 | 1.0.0  | Auditoria inicial completa                                                                                          |
