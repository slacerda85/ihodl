# Solução para Funções getBalance e fetchTransactions

## Problema

As funções `getBalance` e `fetchTransactions` retornavam `undefined` ou não eram funções, causando erros na aplicação.

## Causa

O Zustand persist estava serializando/deserializando incorretamente as funções, mantendo apenas o estado mas perdendo os métodos.

## Soluções Implementadas

### 1. Verificações de Segurança

Adicionada verificação de tipo antes de chamar as funções:

```typescript
// Em WalletBalance.tsx
const balance =
  activeWalletId && getBalance && typeof getBalance === 'function' ? getBalance(activeWalletId) : 0

// Em WalletScreen.tsx
if (
  activeWalletId !== undefined &&
  !loadingWallet &&
  fetchTransactions &&
  typeof fetchTransactions === 'function'
) {
  fetchTransactions(activeWalletId)
}
```

### 2. Partialize Storage

Configurado para persistir apenas o estado, não as funções:

```typescript
partialize: state => ({
  // ... outros estados
  tx: {
    walletCaches: state.tx?.walletCaches || [],
    loadingTxState: state.tx?.loadingTxState || false,
  },
})
```

### 3. Migração de Storage

Adicionada versão e migração para forçar recriação quando necessário:

```typescript
version: 1,
migrate: (persistedState: any, version: number) => {
  if (version < 1) {
    return {} // Estado vazio, será recriado
  }
  return persistedState
}
```

## Como Testar

### 1. Limpar Storage (se necessário)

```javascript
// No console do React Native Debugger ou navegador
localStorage.removeItem('app-storage') // Web
// ou reiniciar app para MMKV
```

### 2. Verificar Funções

```javascript
// No console
const store = useStorage.getState()
console.log('getBalance type:', typeof store.tx.getBalance)
console.log('fetchTransactions type:', typeof store.tx.fetchTransactions)
```

### 3. Testar Funcionalidade

1. Abrir aplicação
2. Criar/selecionar carteira
3. Verificar se saldo aparece
4. Verificar se transações são carregadas

## Arquivos Modificados

- `src/features/storage/useStorage.ts` - Configuração de persist
- `src/features/wallet/WalletBalance.tsx` - Verificação de segurança
- `src/features/wallet/WalletScreen.tsx` - Verificação de segurança
- `src/features/transactions/TransactionsScreen.tsx` - Verificação de segurança

## Próximos Passos

Se o problema persistir:

1. **Limpar completamente o storage**
2. **Reiniciar a aplicação**
3. **Verificar logs do console** para mensagens de migração
4. **Usar as funções de debug** em `src/lib/testStorage.ts`

## Debug Avançado

Use as funções em `testStorage.ts`:

```javascript
import { testStorageFunctions, recreateStorage } from '@/lib/testStorage'

// Testar estado atual
testStorageFunctions()

// Se necessário, recriar storage
recreateStorage()
```
