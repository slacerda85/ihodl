# Sistema de Backup em Nuvem Inteligente

Este documento explica o sistema de backup em nuvem implementado no ihodl, que garante redundância de dados sem comprometer a performance da aplicação.

## 🎯 Visão Geral

O sistema implementa uma arquitetura híbrida que mantém o fluxo síncrono dos repositórios enquanto adiciona backup assíncrono em nuvem. Isso garante que:

- ✅ **Performance**: Saves locais são instantâneos
- ✅ **Resiliência**: Dados são automaticamente backupados
- ✅ **Eficiência**: Debounce e batching reduzem requisições
- ✅ **Confiabilidade**: Queue persiste restarts do app

## 🏗️ Arquitetura

### Componentes Principais

#### 1. CloudBackupQueue

- **Responsabilidade**: Gerencia queue de operações pendentes
- **Características**:
  - Debounce inteligente (2-5s por repositório)
  - Retry com backoff exponencial
  - Rate limiting automático
  - Persistência da queue

#### 2. CloudBackupScheduler

- **Responsabilidade**: Coordena sync baseado em eventos
- **Eventos**:
  - App background → força sync dados críticos
  - App foreground → verifica mudanças remotas
  - Timer periódico (15min) → sync completo

#### 3. RepositoryCloudBackupDecorator

- **Responsabilidade**: Adiciona backup aos repositórios existentes
- **Padrão**: Decorator que wrap funções save/delete/clear

#### 4. Cloud Sync Adapters

- **Responsabilidade**: Interface com provedores cloud (iCloud/Google Drive)
- **Adaptadores**: Wallet, Seed, Address, Transaction, etc.

## 🚀 Como Usar

### 1. Inicialização no App

```typescript
import { useCloudBackup } from './ui/hooks/use-cloud-backup'

function App() {
  useCloudBackup() // Inicializa o sistema de backup

  return <AppContent />
}
```

### 2. Repositórios com Backup Automático

Os repositórios já têm backup integrado:

```typescript
import seedRepository from './core/repositories/seed'

// Save automático com backup
seedRepository.save(walletId, seed, password)

// Delete automático com backup
seedRepository.delete(walletId)

// Clear automático com backup
seedRepository.clear()
```

### 3. Backup Manual (Debugging)

```typescript
import { forceCloudBackup, getCloudBackupStatus } from './ui/hooks/use-cloud-backup'

// Forçar backup completo
await forceCloudBackup()

// Ver status
const status = getCloudBackupStatus()
console.log('Backup status:', status)
```

## ⚙️ Configuração

### Políticas por Repositório

```typescript
// cloud-backup-queue.ts
private policies: Map<string, BackupPolicy> = new Map()

// Wallet e Seed: Prioridade alta, debounce curto
this.policies.set('wallet', {
  debounceMs: 3000,
  maxRetries: 5,
  batchSize: 5,
  priority: 'high'
})

// Transactions: Prioridade baixa, debounce longo
this.policies.set('transaction', {
  debounceMs: 1000,
  maxRetries: 3,
  batchSize: 20,
  priority: 'low'
})
```

### Limites e Otimizações

- **Rate Limiting**: ~20-40 operações/hora (bem abaixo dos limites do iCloud)
- **Debounce**: 1-5 segundos por repositório
- **Batch Size**: 1-20 operações por batch
- **Retry**: Até 5 tentativas com backoff exponencial

## 🔒 Segurança

### Dados Sensíveis

- **Seeds**: Criptografados antes do backup
- **Chaves Privadas**: Nunca backupadas automaticamente
- **Metadados**: Apenas estrutura, não conteúdo sensível

### Estratégias de Conflito

- **Seeds**: Prioridade local (nunca sobrescrever)
- **Wallet**: Estratégia configurável (last-write-wins, keep-local, keep-remote)
- **Transactions**: Merge inteligente

## 📊 Monitoramento

### Status em Tempo Real

```typescript
const status = getCloudBackupStatus()
// {
//   initialized: true,
//   periodicTimerActive: true,
//   queueStatus: { wallet: 2, seed: 0, transaction: 5 }
// }
```

### Logs e Debugging

O sistema log automaticamente:

- Inicialização do scheduler
- Sync forçado (background/foreground)
- Falhas de backup com retry
- Status da queue

## 🔧 Extensão para Novos Repositórios

### 1. Criar Adapter

```typescript
// src/core/repositories/cloud/adapters/new-repo-cloud-sync-adapter.ts
export class NewRepoCloudSyncAdapter implements CloudSyncRepositoryInterface {
  async upload(data: any): Promise<void> {
    // Implement upload logic
  }

  async download(): Promise<any> {
    // Implement download logic
  }

  async sync(localData: any): Promise<any> {
    // Implement sync logic
  }
}
```

### 2. Adicionar Política

```typescript
// cloud-backup-queue.ts
this.policies.set('new-repo', {
  debounceMs: 2000,
  maxRetries: 3,
  batchSize: 10,
  priority: 'normal',
})
```

### 3. Integrar no Repositório

```typescript
// src/core/repositories/new-repo.ts
class NewRepo implements NewRepoInterface {
  private backupDecorator: RepositoryCloudBackupDecorator

  constructor() {
    this.backupDecorator = new RepositoryCloudBackupDecorator('new-repo')
  }

  save(data: any): void {
    // Save local
    this.localSave(data)

    // Backup automático
    this.backupDecorator.wrapSave(
      () => {}, // Já salvou localmente
      () => data,
      () => 'new-repo-key',
    )()
  }
}
```

## 🎛️ Configurações Avançadas

### Personalizar Políticas

```typescript
const queue = CloudBackupQueue.getInstance()
// Modificar política em runtime
queue.updatePolicy('wallet', { debounceMs: 1000 })
```

### Desabilitar Backup

```typescript
// Via settings
cloudSettingsRepository.setSyncEnabled(false)

// Ou parar scheduler
const scheduler = CloudBackupScheduler.getInstance()
scheduler.stop()
```

## 🐛 Troubleshooting

### Problemas Comuns

1. **Backup não funciona**: Verificar se cloud storage está disponível
2. **Queue cresce indefinidamente**: Verificar conectividade de rede
3. **Performance degradada**: Ajustar debounce e batch size

### Debug Tools

```typescript
// Ver queue atual
const queue = CloudBackupQueue.getInstance()
console.log('Queue status:', queue.getQueueStatus())

// Forçar processamento
await queue.forceSync('wallet')
```

## 📈 Performance

### Métricas Esperadas

- **Latência local**: < 1ms (MMKV)
- **Debounce delay**: 1-5s
- **Sync time**: 100-500ms por operação
- **Queue size**: < 100 operações em condições normais

### Otimizações

- **Batching**: Reduz requisições HTTP
- **Compression**: Dados comprimidos antes do upload
- **Incremental**: Apenas mudanças são enviadas
- **Caching**: Metadata cached localmente

---

Este sistema garante que seus dados estejam sempre seguros na nuvem, sem comprometer a experiência do usuário com delays ou travamentos.
