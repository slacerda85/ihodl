# Proposta de Arquitetura de State - iHodl

**Data**: Dezembro 2025  
**Objetivo**: Simplificar a arquitetura de state usando apenas ferramentas nativas do React, eliminando redundância entre providers e MMKV.

---

## 📊 Análise do Estado Atual

### Problema Principal: Duplicação de Dados

Atualmente, os dados são armazenados em **dois lugares**:

1. **MMKV (Repositories)** - Persistência síncrona
2. **React State (Providers)** - Re-renderização

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO ATUAL (Problemático)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  UI Component                                                   │
│       │                                                         │
│       ▼                                                         │
│  Provider.action()                                              │
│       │                                                         │
│       ├──► Service.method()                                     │
│       │         │                                               │
│       │         ▼                                               │
│       │    Repository.save() ──► MMKV (Persistido)             │
│       │                                                         │
│       ▼                                                         │
│  setState() ──────────────────► React State (Duplicado!)       │
│       │                                                         │
│       ▼                                                         │
│  Re-render (muitas vezes desnecessário)                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Providers Atuais e Seus States

| Provider           | States Duplicados no MMKV          | States Necessários para UI      |
| ------------------ | ---------------------------------- | ------------------------------- |
| WalletProvider     | `wallets`, `activeWalletId`        | ❌ Nenhum (MMKV é síncrono)     |
| AddressProvider    | `addresses`, `nextReceiveIndex`    | `loading` (durante fetch)       |
| SettingsProvider   | Todos (persiste no useEffect)      | `colorMode` (tema dinâmico)     |
| NetworkProvider    | Nenhum (usa refs)                  | ✅ Correto                      |
| LightningProvider  | `channels`, `invoices`, `payments` | `isLoading`, `connection.state` |
| WatchtowerProvider | `channels`, `stats`                | `isRunning`, `events`           |
| AuthProvider       | Nenhum                             | `authenticated`, `inactive`     |

---

## 🎯 Nova Arquitetura Proposta

### Princípio Central

> **"O state React deve conter apenas dados que precisam disparar re-renderização."**

- Dados persistidos → Acessados via `service.get*()` síncronos
- Dados de loading/error → State local do componente ou provider mínimo
- Conexões/Refs → `useRef` (não disparam re-render)

### Estrutura Proposta

```
src/
├── core/
│   ├── repositories/      # MMKV - Persistência (já existe)
│   └── services/          # Lógica de negócio (já existe)
│
└── ui/
    ├── features/
    │   ├── wallet/
    │   │   ├── state.ts           # NOVO: Tipos e estado local
    │   │   └── WalletProvider.tsx # SIMPLIFICADO
    │   ├── lightning/
    │   │   ├── state.ts
    │   │   └── LightningProvider.tsx
    │   └── ...
    │
    └── state/
        ├── StateProvider.tsx      # NOVO: Provider único (opcional)
        ├── types.ts               # Tipos globais de state
        └── index.ts
```

---

## 📦 Nova Implementação

### 1. State Types (src/ui/state/types.ts)

```typescript
/**
 * Estado mínimo que realmente precisa disparar re-renders.
 * Dados persistidos no MMKV NÃO devem estar aqui.
 */

// Estados de UI (loading, error, etc)
export interface UIState {
  loading: boolean
  error: string | null
}

// Estado de autenticação (não persistido)
export interface AuthState {
  authenticated: boolean
  inactive: boolean
}

// Estado de conexão (efêmero)
export interface ConnectionState {
  isConnected: boolean
  lastPing?: number
}

// Estado Lightning que precisa de re-render
export interface LightningUIState extends UIState {
  connection: ConnectionState
  // Canais e invoices vêm do service (MMKV)
}

// Estado de endereços (apenas loading)
export interface AddressUIState {
  loading: boolean
  // Endereços vêm do service (MMKV)
}
```

### 2. WalletProvider Simplificado

```typescript
// src/ui/features/wallet/WalletProvider.tsx
import { createContext, ReactNode, useContext, useSyncExternalStore } from 'react'
import { Wallet } from '@/core/models/wallet'
import { walletService } from '@/core/services'

/**
 * WalletProvider SIMPLIFICADO
 *
 * NÃO mantém estado de wallets/activeWalletId.
 * Esses dados são lidos diretamente do MMKV via service.
 *
 * O único motivo para ter um provider é expor funções que
 * disparam side effects e potencialmente precisam notificar
 * a UI de mudanças.
 */

type WalletContextType = {
  // Getters síncronos (leem do MMKV)
  getWallets: () => Wallet[]
  getActiveWalletId: () => string | undefined
  getActiveWallet: () => Wallet | null

  // Actions que modificam e notificam
  createWallet: (params: Parameters<typeof walletService.createWallet>[0]) => Wallet
  deleteWallet: (walletId: string) => void
  setActiveWallet: (walletId: string) => void

  // Para forçar re-render quando necessário
  subscribe: (callback: () => void) => () => void
}

// Subscribers para notificar mudanças
const subscribers = new Set<() => void>()

function notifySubscribers() {
  subscribers.forEach(callback => callback())
}

const WalletContext = createContext<WalletContextType | null>(null)

export default function WalletProvider({ children }: { children: ReactNode }) {
  const contextValue: WalletContextType = {
    // Getters (síncronos, leem do MMKV)
    getWallets: () => walletService.getAllWallets(),
    getActiveWalletId: () => walletService.getActiveWalletId(),
    getActiveWallet: () => {
      const id = walletService.getActiveWalletId()
      return id ? walletService.getWalletById(id) : null
    },

    // Actions
    createWallet: (params) => {
      const wallet = walletService.createWallet(params)
      notifySubscribers() // Notifica que dados mudaram
      return wallet
    },
    deleteWallet: (walletId) => {
      walletService.deleteWallet(walletId)
      notifySubscribers()
    },
    setActiveWallet: (walletId) => {
      walletService.toggleActiveWallet(walletId)
      notifySubscribers()
    },

    // Subscribe para useSyncExternalStore
    subscribe: (callback) => {
      subscribers.add(callback)
      return () => subscribers.delete(callback)
    },
  }

  return <WalletContext value={contextValue}>{children}</WalletContext>
}

// Hook para usar o contexto
export function useWalletContext() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWalletContext must be used within WalletProvider')
  }
  return context
}

// Hook para dados reativos (usa useSyncExternalStore)
export function useWallets(): Wallet[] {
  const { getWallets, subscribe } = useWalletContext()
  return useSyncExternalStore(subscribe, getWallets)
}

export function useActiveWalletId(): string | undefined {
  const { getActiveWalletId, subscribe } = useWalletContext()
  return useSyncExternalStore(subscribe, getActiveWalletId)
}

export function useActiveWallet(): Wallet | null {
  const { getActiveWallet, subscribe } = useWalletContext()
  return useSyncExternalStore(subscribe, getActiveWallet)
}
```

### 3. AddressProvider Simplificado

```typescript
// src/ui/features/address/AddressProvider.tsx
import { createContext, ReactNode, useContext, useState, useCallback, useMemo } from 'react'
import { AddressDetails } from '@/core/models/address'
import { useWalletContext } from '../wallet'
import { useNetwork } from '../network/NetworkProvider'
import { addressService, transactionService } from '@/core/services'
import { Utxo } from '@/core/models/transaction'

/**
 * AddressProvider SIMPLIFICADO
 *
 * Mantém apenas estado de loading.
 * Endereços são lidos diretamente do repository via service.
 */

type AddressContextType = {
  loading: boolean
  refresh: () => Promise<void>

  // Getters síncronos (leem do MMKV via service)
  getAddresses: () => AddressDetails[]
  getBalance: () => { balance: number; utxos: Utxo[] }
  getNextReceiveAddress: () => string
  getNextChangeAddress: () => string
}

const AddressContext = createContext<AddressContextType | null>(null)

export default function AddressProvider({ children }: { children: ReactNode }) {
  const { getActiveWalletId } = useWalletContext()
  const { getConnection } = useNetwork()

  // ÚNICO estado: loading
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    const walletId = getActiveWalletId()
    if (!walletId || loading) return

    setLoading(true)
    try {
      const connection = await getConnection()
      await addressService.discover(connection)
    } catch (error) {
      console.error('Error refreshing addresses:', error)
    } finally {
      setLoading(false)
    }
  }, [getActiveWalletId, getConnection, loading])

  const contextValue = useMemo(() => ({
    loading,
    refresh,

    // Getters síncronos
    getAddresses: () => {
      // Lê diretamente do repository
      // O service já faz isso internamente
      const walletId = getActiveWalletId()
      if (!walletId) return []
      return addressService.getUsedAddresses('receiving')
        .concat(addressService.getUsedAddresses('change'))
    },
    getBalance: () => {
      const addresses = addressService.getUsedAddresses('receiving')
        .concat(addressService.getUsedAddresses('change'))
      return transactionService.calculateBalance(addresses)
    },
    getNextReceiveAddress: () => addressService.getNextUnusedAddress(),
    getNextChangeAddress: () => addressService.getNextChangeAddress(),
  }), [loading, refresh, getActiveWalletId])

  return <AddressContext value={contextValue}>{children}</AddressContext>
}

export function useAddress() {
  const context = useContext(AddressContext)
  if (!context) {
    throw new Error('useAddress must be used within AddressProvider')
  }
  return context
}
```

### 4. StateProvider Unificado (Opcional)

```typescript
// src/ui/state/StateProvider.tsx
/**
 * StateProvider - Provider único para estado global mínimo
 *
 * Agrupa apenas os estados que:
 * 1. Não são persistidos no MMKV
 * 2. Precisam disparar re-renders globais
 *
 * Pode ser usado em conjunto com providers específicos
 * ou substituí-los completamente.
 */

import { createContext, ReactNode, useContext, useReducer, useMemo, Dispatch } from 'react'

// ==========================================
// TIPOS
// ==========================================

interface AppState {
  auth: {
    authenticated: boolean
    inactive: boolean
  }
  ui: {
    loading: Map<string, boolean> // loading por feature/operação
    errors: Map<string, string | null>
  }
  connection: {
    electrum: boolean
    lightning: boolean
  }
}

type AppAction =
  | { type: 'AUTH_SUCCESS' }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'SET_INACTIVE'; payload: boolean }
  | { type: 'SET_LOADING'; payload: { key: string; loading: boolean } }
  | { type: 'SET_ERROR'; payload: { key: string; error: string | null } }
  | { type: 'SET_CONNECTION'; payload: { type: 'electrum' | 'lightning'; connected: boolean } }

// ==========================================
// REDUCER
// ==========================================

const initialState: AppState = {
  auth: {
    authenticated: false,
    inactive: false,
  },
  ui: {
    loading: new Map(),
    errors: new Map(),
  },
  connection: {
    electrum: false,
    lightning: false,
  },
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'AUTH_SUCCESS':
      return { ...state, auth: { ...state.auth, authenticated: true } }

    case 'AUTH_LOGOUT':
      return { ...state, auth: { ...state.auth, authenticated: false } }

    case 'SET_INACTIVE':
      return { ...state, auth: { ...state.auth, inactive: action.payload } }

    case 'SET_LOADING': {
      const newLoading = new Map(state.ui.loading)
      if (action.payload.loading) {
        newLoading.set(action.payload.key, true)
      } else {
        newLoading.delete(action.payload.key)
      }
      return { ...state, ui: { ...state.ui, loading: newLoading } }
    }

    case 'SET_ERROR': {
      const newErrors = new Map(state.ui.errors)
      if (action.payload.error) {
        newErrors.set(action.payload.key, action.payload.error)
      } else {
        newErrors.delete(action.payload.key)
      }
      return { ...state, ui: { ...state.ui, errors: newErrors } }
    }

    case 'SET_CONNECTION':
      return {
        ...state,
        connection: { ...state.connection, [action.payload.type]: action.payload.connected },
      }

    default:
      return state
  }
}

// ==========================================
// CONTEXT
// ==========================================

type StateContextType = {
  state: AppState
  dispatch: Dispatch<AppAction>

  // Helpers
  isLoading: (key: string) => boolean
  getError: (key: string) => string | null
}

const StateContext = createContext<StateContextType | null>(null)

export function StateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  const contextValue = useMemo(() => ({
    state,
    dispatch,
    isLoading: (key: string) => state.ui.loading.get(key) ?? false,
    getError: (key: string) => state.ui.errors.get(key) ?? null,
  }), [state])

  return <StateContext.Provider value={contextValue}>{children}</StateContext.Provider>
}

export function useAppState() {
  const context = useContext(StateContext)
  if (!context) {
    throw new Error('useAppState must be used within StateProvider')
  }
  return context
}

// Hooks de conveniência
export function useAuth() {
  const { state, dispatch } = useAppState()
  return {
    ...state.auth,
    login: () => dispatch({ type: 'AUTH_SUCCESS' }),
    logout: () => dispatch({ type: 'AUTH_LOGOUT' }),
    setInactive: (inactive: boolean) => dispatch({ type: 'SET_INACTIVE', payload: inactive }),
  }
}

export function useLoading(key: string) {
  const { isLoading, dispatch } = useAppState()
  return {
    loading: isLoading(key),
    setLoading: (loading: boolean) =>
      dispatch({ type: 'SET_LOADING', payload: { key, loading } }),
  }
}
```

---

## 🔄 Fluxo de Dados Proposto

```
┌─────────────────────────────────────────────────────────────────┐
│                     FLUXO NOVO (Otimizado)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  UI Component                                                   │
│       │                                                         │
│       ├──► LEITURA: service.get*() ──► MMKV (síncrono, sem     │
│       │                                 re-render)              │
│       │                                                         │
│       └──► ESCRITA:                                             │
│             │                                                   │
│             ▼                                                   │
│       Provider.action()                                         │
│             │                                                   │
│             ├──► Service.method() ──► Repository ──► MMKV      │
│             │                                                   │
│             └──► notifySubscribers() ──► Apenas componentes    │
│                                          que usaram              │
│                                          useSyncExternalStore   │
│                                          re-renderizam          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Análise por Provider

### 1. WalletProvider

**Estado Atual:**

```typescript
const [wallets, setWallets] = useState<Wallet[]>(() => walletService.getAllWallets())
const [activeWalletId, setActiveWalletId] = useState<string | undefined>()
```

**Problema:** `wallets` e `activeWalletId` já estão no MMKV. O setState duplica.

**Solução:** Remover states, usar `useSyncExternalStore` para componentes que precisam re-render.

---

### 2. AddressProvider

**Estado Atual:**

```typescript
const [state, setState] = useState<AddressState>({
  loading: true,
  addresses: [],
  nextReceiveAddress: '',
  nextChangeAddress: '',
})
```

**Problema:**

- `addresses` é duplicado do MMKV
- `nextReceiveAddress/nextChangeAddress` são derivados

**Solução:**

- Manter apenas `loading`
- `addresses` → `service.getUsedAddresses()` (síncrono)
- Endereços derivados → `service.getNextUnusedAddress()` (síncrono)

---

### 3. LightningProvider

**Estado Atual:**

```typescript
const [state, setState] = useState<LightningState>({
  isInitialized: false,
  isLoading: false,
  totalBalance: 0n,
  channels: [],
  invoices: [],
  payments: [],
  ...
})
```

**Análise:**

- `channels`, `invoices`, `payments` → MMKV via repository
- `isLoading`, `isInitialized`, `error` → Necessários para UI
- `connection` → Necessário (estado efêmero)
- `totalBalance` → Pode ser calculado, mas é útil cachear para performance

**Solução:**

```typescript
// Manter apenas
interface LightningUIState {
  isInitialized: boolean
  isLoading: boolean
  error: string | null
  connection: ConnectionState
  // totalBalance pode ser cacheado aqui para evitar recálculos
  cachedBalance: bigint
}
```

---

### 4. SettingsProvider

**Estado Atual:**

```typescript
const [state, dispatch] = useReducer(settingsReducer, loadPersistedSettingsState())
// useEffect persiste state changes
```

**Problema:** Persiste o state inteiro no MMKV a cada mudança, mas também mantém no React state.

**Solução:**

- Ler settings diretamente do MMKV
- `colorMode` derivado pode precisar de state (tema dinâmico)
- Ou usar `useSyncExternalStore` para sincronizar

---

### 5. WatchtowerProvider

**Estado Atual:**

```typescript
const [state, setState] = useState<WatchtowerState>({
  channels: [],
  events: [],
  status: {...},
  ...
})
```

**Análise:**

- `channels` → MMKV (watchtower repository)
- `events` → Pode ser MMKV ou memória (depende se quer persistir)
- `isRunning` → Estado efêmero necessário
- `status` → Pode ser calculado do service

**Solução:**

```typescript
interface WatchtowerUIState {
  isRunning: boolean
  events: WatchtowerEvent[] // Pode manter em memória se não precisar persistir
  // channels e status vêm do service
}
```

---

### 6. AuthProvider

**Estado Atual:**

```typescript
const [authenticated, setAuthenticated] = useState(false)
const [inactive, setInactive] = useState(false)
```

**Análise:** Estado puramente de sessão, não persistido. ✅ Correto.

---

### 7. NetworkProvider

**Estado Atual:**

```typescript
const connectionRef = useRef<Connection | null>(null)
const lightningClientRef = useRef<LightningWorker | null>(null)
```

**Análise:** Usa apenas refs, não dispara re-renders. ✅ Correto.

---

## 📊 Resumo das Mudanças

| Provider           | Antes (States)        | Depois (States)     | Redução |
| ------------------ | --------------------- | ------------------- | ------- |
| WalletProvider     | `wallets`, `activeId` | Nenhum (pub/sub)    | -100%   |
| AddressProvider    | 4 estados             | `loading`           | -75%    |
| LightningProvider  | 8+ estados            | 3-4 estados         | -50%    |
| SettingsProvider   | State completo        | `colorMode` apenas  | -80%    |
| WatchtowerProvider | 6 estados             | 2 estados           | -66%    |
| AuthProvider       | 2 estados             | 2 estados (mantido) | 0%      |
| NetworkProvider    | 0 (refs)              | 0 (refs)            | 0%      |

---

## 🚀 Plano de Migração

### Fase 1: Preparação (1 semana)

1. Criar `src/ui/state/types.ts` com novos tipos
2. Implementar `useSyncExternalStore` helpers no `WalletProvider`
3. Testar que componentes recebem atualizações corretamente

### Fase 2: Migração Gradual (2-3 semanas)

1. **WalletProvider** (mais simples, menos dependências)
2. **AddressProvider** (depende de Wallet e Network)
3. **SettingsProvider** (isolado)
4. **LightningProvider** (mais complexo)
5. **WatchtowerProvider** (depende de Lightning)

### Fase 3: Cleanup (1 semana)

1. Remover states não utilizados
2. Atualizar testes
3. Documentar nova arquitetura

---

## ⚠️ Considerações Importantes

### Quando MANTER State React

1. **Estado de UI puro**: `loading`, `error`, `isOpen`
2. **Estado de sessão**: `authenticated`, `inactive`
3. **Estado efêmero**: Conexões, timers, animações
4. **Formulários**: Inputs controlados

### Quando NÃO usar State React

1. Dados já persistidos no MMKV
2. Dados que podem ser derivados/calculados
3. Dados que não afetam a renderização

### useSyncExternalStore

O `useSyncExternalStore` é a solução do React para sincronizar com stores externos:

```typescript
const wallets = useSyncExternalStore(
  subscribe, // Função para inscrever no store
  getSnapshot, // Função para obter valor atual
  getServerSnapshot, // Opcional: para SSR
)
```

Ele garante:

- Re-render apenas quando o valor realmente muda
- Compatibilidade com concurrent features do React
- Performance otimizada

---

---

## 🏗️ Arquivos de Exemplo Criados

Os seguintes arquivos foram criados como exemplo da nova arquitetura:

| Arquivo                                         | Descrição                         |
| ----------------------------------------------- | --------------------------------- |
| `src/ui/state/types.ts`                         | Tipos para estado global mínimo   |
| `src/ui/state/StateProvider.tsx`                | Provider unificado com useReducer |
| `src/ui/state/index.ts`                         | Barrel export                     |
| `src/ui/features/wallet/WalletProviderV2.tsx`   | Wallet com useSyncExternalStore   |
| `src/ui/features/address/AddressProviderV2.tsx` | Address com loading mínimo        |

---

## 📦 AppProviders Simplificado (Proposta)

```tsx
// src/ui/features/app/AppProviders.tsx (proposta)
import { ReactNode } from 'react'
import { StateProvider } from '@/ui/state'
import { SettingsProvider } from '@/ui/features/settings'
import WalletProvider from '@/ui/features/wallet/WalletProviderV2'
import NetworkProvider from '@/ui/features/network/NetworkProvider'
import AddressProvider from '@/ui/features/address/AddressProviderV2'
import LightningProvider from '@/ui/features/lightning/LightningProvider'

/**
 * AppProviders Simplificado
 *
 * MUDANÇAS:
 * 1. StateProvider substitui AuthProvider (auth + loading + errors)
 * 2. WalletProvider não mantém state duplicado (usa useSyncExternalStore)
 * 3. AddressProvider só mantém loading
 * 4. WatchtowerProvider pode ser lazy-loaded (só quando Lightning está ativo)
 *
 * HIERARQUIA REDUZIDA:
 * StateProvider     → Auth, Loading, Errors (estados globais mínimos)
 * └── SettingsProvider → Tema (colorMode)
 *     └── WalletProvider → Subscription para wallets
 *         └── NetworkProvider → Refs para conexões
 *             └── AddressProvider → Loading de discovery
 *                 └── LightningProvider → Estado Lightning UI
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StateProvider>
      <SettingsProvider>
        <WalletProvider>
          <NetworkProvider>
            <AddressProvider>
              <LightningProvider>{children}</LightningProvider>
            </AddressProvider>
          </NetworkProvider>
        </WalletProvider>
      </SettingsProvider>
    </StateProvider>
  )
}
```

---

## 📚 Referências

- [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
- [Rules of React](https://react.dev/reference/rules)
- [MMKV Documentation](https://github.com/mrousavy/react-native-mmkv)
