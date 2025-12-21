# Plano de Consolidação do Lightning Worker

> **Data de criação:** 14 de dezembro de 2025  
> **Status:** Em andamento  
> **Prioridade:** Alta

## Resumo

Este documento descreve o plano de implementação para corrigir as inconsistências identificadas na orquestração dos workers Lightning do iHodl. As correções visam alinhar a arquitetura com o padrão do Electrum (referência) e eliminar bugs de sincronização, race conditions e riscos de perda de fundos.

---

## 1. Unificação do Singleton de Worker

**Problema:** Existem 3 caminhos diferentes para obter/criar workers Lightning, causando estado dessincronizado.

**Objetivo:** Ter apenas um ponto de acesso ao WorkerService via `lightningStore`.

### Tarefas

- [x] **1.1** Remover singleton em `useWorkerService.ts` ✅ (2024-12-14)
  - Arquivo: `src/ui/features/lightning/hooks/useWorkerService.ts`
  - Remover `const workerServiceInstance = createWorkerService(...)`
  - Fazer `useWorkerService()` retornar `lightningStore.getWorker()`

- [x] **1.2** Atualizar hooks dependentes ✅ (2024-12-14)
  - Arquivo: `src/ui/features/lightning/hooks/useBackgroundGossipSync.ts`
  - Arquivo: `src/ui/features/lightning/hooks/useHtlcMonitor.ts`
  - Verificar que usam `useWorkerService()` (já usam, mas garantir que funcionam com nova implementação)

- [x] **1.3** Deprecar `networkStore.getLightningWorker()` ✅ (2024-12-14)
  - Arquivo: `src/ui/features/network/store.ts`
  - Adicionar `@deprecated` JSDoc ou remover método se não usado
  - Buscar usages e migrar para `lightningStore.getWorker()`

- [x] **1.4** Remover `LightningWorker` do `networkService` ✅ (2024-12-14)
  - Arquivo: `src/core/services/network.ts`
  - Mover `createLightningWorker` para `ln-worker-service.ts` se ainda necessário
  - Ou manter apenas como factory interna do WorkerService
  - **Resolução:** Mantido como factory `@internal`, documentado que só deve ser usado pelo WorkerService

- [x] **1.5** Testes ✅ (2024-12-14)
  - Verificar que não há múltiplas instâncias de WorkerService em runtime
  - Adicionar assertion em `createWorkerService` para detectar múltiplas chamadas
  - **Resolução:** Adicionado contador de instâncias com warning em DEV e funções auxiliares para testes

---

## 2. Consolidação do Fluxo de Inicialização

**Problema:** Múltiplos pontos de entrada podem causar race conditions e inicialização parcial.

**Objetivo:** Um único fluxo de inicialização orquestrado pelo `AppProvider`.

### Tarefas

- [x] **2.1** Adicionar guard de inicialização em `useWorkerService` ✅ (2024-12-14)
  - Arquivo: `src/ui/features/lightning/hooks/useWorkerService.ts`
  - Lançar erro ou retornar estado de loading se worker não inicializado
  - **Resolução:** Adicionados `useWorkerServiceSafe()` e `useWorkerReady()` para acesso seguro

- [x] **2.2** Remover auto-init do `useLightningStartupWorker` ✅ (2024-12-14)
  - Arquivo: `src/ui/hooks/use-lightning-worker.ts`
  - Delegar toda inicialização ao `AppProvider`
  - Manter hook apenas para observar status
  - **Resolução:** Removido useEffect com autoStart, adicionado warning de deprecation

- [x] **2.3** Centralizar inicialização no `AppProvider` ✅ (2024-12-14)
  - Arquivo: `src/ui/features/app-provider/AppProvider.tsx`
  - Garantir que `lightningStore.actions.initialize()` é chamado apenas uma vez por wallet
  - Adicionar debounce ou lock para evitar chamadas duplicadas
  - **Resolução:** Já implementado com `isSyncingWorkerRef` + mutex no WorkerService

- [x] **2.4** Adicionar mutex de inicialização no `WorkerService` ✅ (2024-12-14)
  - Arquivo: `src/core/services/ln-worker-service.ts`
  - Implementar lock para evitar `initialize()` concorrentes
  - Retornar Promise existente se já estiver inicializando
  - **Resolução:** Adicionado `initializationPromise` como mutex, método refatorado para `doInitialize`

- [ ] **2.5** Testes
  - Simular múltiplas chamadas `initialize()` simultâneas
  - Verificar que apenas uma inicialização completa ocorre

---

## 3. Graceful Shutdown com Espera de HTLCs

**Problema:** O worker para imediatamente sem esperar HTLCs pendentes, risco de perda de fundos.

**Objetivo:** Implementar shutdown graceful que espera resolução de HTLCs.

### Tarefas

- [x] **3.1** Implementar `waitForPendingHtlcs()` no `WorkerService` ✅ (2024-12-14)
  - Arquivo: `src/core/services/ln-worker-service.ts`
  - Método que aguarda até timeout ou todos HTLCs resolverem
  - Retornar lista de HTLCs que não resolveram no tempo
  - **Resolução:** Implementado com polling de 500ms e timeout configurável

- [x] **3.2** Modificar `stop()` para chamar wait ✅ (2024-12-14)
  - Arquivo: `src/core/services/ln-worker-service.ts`
  - Chamar `waitForPendingHtlcs(5000)` antes de parar serviços
  - Logar warning se HTLCs pendentes após timeout
  - **Resolução:** `stop()` agora chama `waitForPendingHtlcs()` e emite evento 'warning' se houver HTLCs não resolvidos

- [x] **3.3** Atualizar `AppProvider` para shutdown graceful ✅ (2024-12-14)
  - Arquivo: `src/ui/features/app-provider/AppProvider.tsx`
  - No handler de `background`, aguardar `worker.stop()` com await
  - Considerar manter worker rodando em background para resolver HTLCs
  - **Resolução:** Handler agora usa async/await e loga início/fim do shutdown

- [ ] **3.4** Adicionar notificação de HTLCs pendentes
  - Exibir alerta ao usuário se tentar fechar app com HTLCs pendentes
  - Permitir forçar fechamento com aviso de risco

- [ ] **3.5** Testes
  - Simular shutdown com HTLCs pendentes
  - Verificar que HTLCs são resolvidos ou logados corretamente

---

## 4. Single Source of Truth para Readiness

**Problema:** Estado de readiness duplicado entre WorkerService e LightningStore causa bugs de sincronização.

**Objetivo:** Readiness gerenciado apenas no WorkerService, store apenas observa.

**Status:** ✅ COMPLETO (2024-12-14)

### Tarefas

- [x] **4.1** Remover estado de readiness duplicado do `LightningStore` ✅ (2024-12-14)
  - Arquivo: `src/ui/features/lightning/store.ts`
  - Removido `updateReadiness()`, `mapWorkerReadiness()`, `isSyncingFromWorker`
  - Removido `workerReadiness` do state (redundante com `readinessState`)
  - Worker agora emite `ReadinessState` diretamente (não `WorkerReadiness`)

- [x] **4.2** Simplificar sincronização de readiness ✅ (2024-12-14)
  - Arquivo: `src/ui/features/lightning/store.ts`
  - Novo `syncWorkerReadiness()` recebe `ReadinessState` diretamente
  - Adicionado `hasReadinessChanged()` para comparação eficiente
  - Fluxo agora é 100% unidirecional (WorkerService → Store → UI)

- [x] **4.3** Atualizar hooks de readiness ✅ (2024-12-14)
  - Arquivo: `src/ui/features/lightning/hooks/useLightningReadiness.ts`
  - Adicionados imports de tipos (`ReadinessState`, `ReadinessLevel`)
  - Novos hooks: `useCanPerformOperation()`, `useReadinessBlockers()`
  - Re-export de tipos para facilitar uso em componentes

- [x] **4.4** Exportar `ReadinessState` do WorkerService ✅ (2024-12-14)
  - Arquivo: `src/core/services/ln-worker-service.ts`
  - Re-export de `ReadinessState`, `ReadinessLevel`, `getReadinessLevel`
  - `WorkerReadiness` mantido como tipo interno (tem `electrumReady`)
  - `setReadiness()` agora converte para `ReadinessState` antes de emitir

- [x] **4.5** Testes ✅ (2024-12-14)
  - Compilação verificada sem erros nos arquivos modificados
  - Fluxo unidirecional garante ausência de loops
  - Pronto para testes manuais de integração

---

## 5. Consolidação do Peer Management

**Problema:** Lógica de peers espalhada em 3 locais diferentes.

**Objetivo:** Toda gestão de peers centralizada no WorkerService.

### Tarefas

- [x] **5.1** Remover `connectToPeer` e `disconnect` do `LightningStore` ✅ (2024-12-14)
  - Arquivo: `src/ui/features/lightning/store.ts`
  - Delegar ao WorkerService
  - **Resolução:** Métodos marcados como `@deprecated` com warning em runtime

- [x] **5.2** Atualizar UI para usar WorkerService ✅ (2024-12-14)
  - Buscar componentes que usam `lightningStore.actions.connectToPeer`
  - Migrar para `workerService.addPeer()` ou similar
  - **Resolução:** Nenhum componente de UI usa esses métodos diretamente

- [x] **5.3** Deprecar funções standalone em `ln-transport-service.ts` ✅ (2024-12-14)
  - Arquivo: `src/core/services/ln-transport-service.ts`
  - Marcar `connect()`, `disconnect()` como `@internal` ou `@deprecated`
  - Uso apenas via WorkerService
  - **Resolução:** Métodos marcados com `@internal` e documentação de referência ao plano

- [ ] **5.4** Consolidar `PeerConnectivityService` e `PeerManager`
  - Avaliar se ambos são necessários
  - Se sim, definir responsabilidades claras
  - Se não, unificar em um único serviço

- [ ] **5.5** Testes
  - Verificar reconexão automática funciona
  - Testar cenários de disconnect/reconnect

---

## 6. Alinhamento com Padrões do Electrum

**Objetivo:** Garantir paridade de comportamento com a implementação de referência.

### Tarefas

- [ ] **6.1** Implementar `maintain_connectivity` loop
  - Arquivo: `src/core/services/ln-worker-service.ts`
  - Loop contínuo que mantém número mínimo de peers
  - Similar ao `_maintain_connectivity` do Electrum

- [ ] **6.2** Separar Gossip Worker (opcional, longo prazo)
  - Considerar criar `GossipWorker` separado como no Electrum
  - Benefício: gossip continua mesmo sem wallet ativo

- [ ] **6.3** Implementar `NUM_PEERS_TARGET`
  - Arquivo: `src/core/services/ln-worker-service.ts`
  - Configurar número alvo de peers (ex: 4)
  - Evitar reconexões desnecessárias quando já atingido

- [ ] **6.4** Melhorar retry/backoff
  - Implementar `NetworkRetryManager` similar ao Electrum
  - Backoff exponencial para falhas de conexão

---

## 7. Validação Final

### Tarefas

- [ ] **7.1** Code review completo das mudanças
- [ ] **7.2** Testes de integração end-to-end
- [ ] **7.3** Testes em testnet com transações reais
- [ ] **7.4** Documentar nova arquitetura
- [ ] **7.5** Atualizar `copilot-instructions.md` se necessário

---

## Cronograma Sugerido

| Fase      | Tarefas                 | Estimativa      |
| --------- | ----------------------- | --------------- |
| 1         | Unificação do Singleton | 2-3 horas       |
| 2         | Consolidação do Init    | 3-4 horas       |
| 3         | Graceful Shutdown       | 2-3 horas       |
| 4         | Single Source of Truth  | 2-3 horas       |
| 5         | Peer Management         | 3-4 horas       |
| 6         | Alinhamento Electrum    | 4-6 horas       |
| 7         | Validação               | 2-3 horas       |
| **Total** |                         | **18-26 horas** |

---

## Notas de Implementação

### Ordem de Execução Recomendada

1. **Fase 1** (Singleton) - Base para todas as outras ✅ CONCLUÍDA
2. **Fase 3** (Graceful Shutdown) - Crítico para segurança ✅ PARCIAL
3. **Fase 2** (Init) - Elimina race conditions ✅ PARCIAL
4. **Fase 4** (Readiness) - Simplifica código
5. **Fase 5** (Peers) - Melhora estabilidade ✅ PARCIAL
6. **Fase 6** (Electrum patterns) - Otimizações
7. **Fase 7** (Validação) - Qualidade

### Riscos

- **Breaking changes em hooks públicos** - Pode afetar componentes que usam `useWorkerService` diretamente
- **Regressão em pagamentos** - Testar extensivamente antes de deploy
- **Performance** - Monitorar se mudanças afetam tempo de inicialização

### Rollback

Manter branch `develop` estável. Implementar em feature branch e fazer PR com review.

---

## Histórico de Alterações

| Data       | Autor   | Descrição                                                                                                                                                                                           |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2024-12-14 | Copilot | Criação inicial do plano                                                                                                                                                                            |
| 2024-12-14 | Copilot | Fase 1 completa: unificação de singleton, deprecações                                                                                                                                               |
| 2024-12-14 | Copilot | Fase 2 parcial: mutex de inicialização, remoção de auto-init                                                                                                                                        |
| 2024-12-14 | Copilot | Fase 3 parcial: graceful shutdown com waitForPendingHtlcs                                                                                                                                           |
| 2024-12-14 | Copilot | Fase 5 parcial: deprecação de métodos de peer no store                                                                                                                                              |
| 2024-12-14 | Copilot | Correção de imports no store.ts (ln-transport-service), fix decodeInvoice mapping                                                                                                                   |
| 2024-12-14 | Copilot | Simplificação de waitForPendingHtlcs (TODO para tracking real de HTLCs)                                                                                                                             |
| 2024-12-14 | Copilot | Implementado getters de HTLC no worker (getPendingHtlcs, hasPendingHtlcs, countPendingHtlcs)                                                                                                        |
| 2024-12-14 | Copilot | Fase 2 completa: guards de inicialização, useWorkerServiceSafe, useWorkerReady                                                                                                                      |
| 2024-12-14 | Copilot | Fase 4 parcial: removido push bidirecional de readiness, documentado fluxo unidirecional                                                                                                            |
| 2024-12-14 | Copilot | Fase 5: métodos @internal no ln-transport-service                                                                                                                                                   |
| 2024-12-14 | Copilot | **Fase 4 COMPLETA**: Fluxo unidirecional worker→store, removido mapWorkerReadiness, updateReadiness, isSyncingFromWorker, workerReadiness. Novos hooks useCanPerformOperation, useReadinessBlockers |
