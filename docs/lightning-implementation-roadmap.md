# Roadmap de Implementação Lightning Network - iHodl

> **Versão:** 1.3  
> **Data:** Dezembro 2025  
> **Última atualização:** Dezembro 2025  
> **Baseado em:** [lightning-initialization-comparison.md](./lightning-initialization-comparison.md)

---

## Sumário

- [Visão Geral](#visão-geral)
- [Decisão Arquitetural: Trampoline vs Full Gossip](#decisão-arquitetural-trampoline-vs-full-gossip)
- [Fase 1: Fundações de Conectividade](#fase-1-fundações-de-conectividade)
- [Fase 2: Channel Reestablishment](#fase-2-channel-reestablishment)
- [Fase 3: Sincronização de Gossip OU Trampoline Mode](#fase-3-sincronização-de-gossip-ou-trampoline-mode)
- [Fase 4: Gates de Prontidão](#fase-4-gates-de-prontidão)
- [Fase 5: Integração Electrum](#fase-5-integração-electrum)
- [Fase 6: Testes e Validação](#fase-6-testes-e-validação)
- [Cronograma Estimado](#cronograma-estimado)
- [Riscos e Mitigações](#riscos-e-mitigações)
- [Checklist de Acompanhamento](#checklist-de-acompanhamento)

---

## Visão Geral

Este roadmap detalha a implementação das correções identificadas na análise comparativa dos fluxos de inicialização Lightning Network. O objetivo é garantir que o iHodl siga as melhores práticas observadas no Phoenix (ACINQ) e Electrum.

### Prioridades

| Prioridade | Descrição                              | Impacto                   |
| ---------- | -------------------------------------- | ------------------------- |
| 🔴 P0      | Crítico - Bloqueia funcionalidade core | Pagamentos falham         |
| 🟡 P1      | Alto - Afeta confiabilidade            | Canais podem ser perdidos |
| 🟢 P2      | Médio - Melhoria de resiliência        | Fallback limitado         |
| ⚪ P3      | Baixo - Nice to have                   | Otimização                |

### Estado Atual do Codebase

Baseado na análise do código existente:

✅ **Já implementado:**

- Transporte P2P (BOLT #8) com handshake Noise_XK (`src/core/lib/lightning/transport.ts`)
- Gossip messages parsing (BOLT #7) (`src/core/lib/lightning/gossip.ts`)
- Channel state machine (BOLT #2) (`src/core/lib/lightning/channel.ts`)
- Cliente Electrum funcional (`src/core/lib/electrum/client.ts`)
- LightningRepository abrangente (`src/core/repositories/lightning.ts`)
- Estrutura de serviços (`src/core/services/ln-*.ts`)
- Channel reestablishment com detecção de data loss (`src/core/services/ln-channel-reestablish-service.ts`)

⚠️ **Parcialmente implementado / simulado:**

- `syncLightningGraph()` - apenas simula delay
- `establishPeerConnections()` - agora conecta via TcpTransport + init BOLT #1, falta readiness/gates
- Integração transport ↔ peer ↔ channels
- Path finding real

❌ **Não implementado:**

- Integração completa de channel reestablishment com inicialização
- Gates de prontidão antes de operações
- DNS Bootstrap (BOLT-10)
- Trampoline routing (alternativa ao gossip)

### Progresso Atual

**✅ Fase 1: Fundações de Conectividade - CONCLUÍDA (Dezembro 2025)**

- Todos os 9 testes de integração passaram
- Conexões P2P reais estabelecidas com peers Lightning
- Persistência de peers funcionando
- Reconexão automática implementada

**🔄 Fase 2: Channel Reestablishment - CONCLUÍDA (Dezembro 2025)**

- Mensagem channel_reestablish implementada
- Serviço de reestablishment funcional
- Detecção de data loss local e remoto implementada
- Force close em caso de data loss irrecuperável implementado
- Integração com fluxo de inicialização completa
- Próxima fase: Routing (Trampoline ou Gossip)

**✅ Fase 3: Full Gossip Mode - CONCLUÍDA (Dezembro 2025)**

- Gossip sync manager implementado com sincronização multi-peer
- Verificação de assinaturas para channel/node announcements
- Pathfinding local com algoritmo Dijkstra
- Cache persistente de grafo com TTL de 14 dias
- Próxima fase: Gates de Prontidão

---

## Decisão Arquitetural: Trampoline vs Full Gossip

Antes de prosseguir, é necessário decidir qual modelo de routing usar:

### Opção A: Trampoline Mode (Recomendado para MVP)

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRAMPOLINE MODE                               │
├─────────────────────────────────────────────────────────────────┤
│ Vantagens:                                                       │
│ • Startup ~10x mais rápido (sem sync de gossip)                 │
│ • Menor uso de memória/storage (~50MB menos)                    │
│ • Menor consumo de bateria                                       │
│ • Implementação mais simples                                     │
│ • Similar ao Phoenix (referência validada)                       │
├─────────────────────────────────────────────────────────────────┤
│ Desvantagens:                                                    │
│ • Depende de trampoline node (ACINQ) - centralização            │
│ • Privacidade reduzida (trampoline conhece remetente)           │
│ • Fees potencialmente maiores                                    │
├─────────────────────────────────────────────────────────────────┤
│ Implementação:                                                   │
│ • Conectar APENAS ao trampoline node                            │
│ • Delegar pathfinding ao trampoline                             │
│ • Não sincronizar gossip                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Opção B: Full Gossip Mode

```
┌─────────────────────────────────────────────────────────────────┐
│                    FULL GOSSIP MODE                              │
├─────────────────────────────────────────────────────────────────┤
│ Vantagens:                                                       │
│ • Máxima descentralização                                        │
│ • Privacidade superior                                           │
│ • Pathfinding local otimizado                                    │
│ • Independente de terceiros                                      │
├─────────────────────────────────────────────────────────────────┤
│ Desvantagens:                                                    │
│ • Startup lento (~1-5 min para sync inicial)                    │
│ • Alto uso de memória (~100-200MB para grafo)                   │
│ • Complexidade de implementação maior                            │
│ • Maior consumo de bateria                                       │
├─────────────────────────────────────────────────────────────────┤
│ Implementação:                                                   │
│ • Conectar a múltiplos peers (4-8)                              │
│ • Sincronizar grafo completo via gossip queries                 │
│ • Implementar pathfinding local (Dijkstra/A*)                   │
└─────────────────────────────────────────────────────────────────┘
```

### Opção C: Hybrid Mode (Recomendado para Produção)

```
┌─────────────────────────────────────────────────────────────────┐
│                    HYBRID MODE                                   │
├─────────────────────────────────────────────────────────────────┤
│ Estratégia:                                                      │
│ • Inicia em trampoline mode (startup rápido)                    │
│ • Sincroniza gossip em background                               │
│ • Migra para local pathfinding quando sync completo             │
│ • Fallback para trampoline se pathfinding local falhar          │
└─────────────────────────────────────────────────────────────────┘
```

**Recomendação:** Implementar **Opção A (Trampoline)** primeiro como MVP, depois evoluir para **Opção C (Hybrid)**.

---

## Fase 1: Fundações de Conectividade

> **Prioridade:** 🔴 P0  
> **Duração Estimada:** 2-3 semanas  
> **Objetivo:** Estabelecer conexões P2P reais com peers Lightning

### 1.1 Integrar TcpTransport com PeerConnectivityService

**Arquivos a modificar:**

- `src/core/services/ln-peer-service.ts`
- `src/core/services/ln-transport-service.ts`
- `src/core/lib/lightning/tcp-transport.ts`

**Tarefas:**

```
[x] 1.1.1 Refatorar PeerConnectivityService para usar TcpTransport real
    Arquivo: src/core/services/ln-peer-service.ts

    Mudanças:
    - Remover simulação em connectToPeer()
    - Integrar com TcpTransport.connect()
    - Implementar handshake BOLT #8 real

    Referência Electrum:
    - lnworker.py:_add_peer() → LNTransport(privkey, peer_addr)
    - lntransport.py:handshake()

[x] 1.1.2 Implementar troca de Init messages (BOLT #1)
    Arquivo: src/core/services/ln-transport-service.ts

    Mudanças:
    - Após handshake, enviar init message **(implementado)**
    - Receber e processar init do peer **(implementado)**
    - Negociar features **(implementado)**
    - Armazenar features negociados **(implementado)**

    Referência Phoenix:
    - Peer.connect() em lightning-kmp

[x] 1.1.3 Implementar conexão ao Trampoline Node
    Arquivo: src/core/services/ln-peer-service.ts

    Mudanças:
    - Adicionar constante TRAMPOLINE_NODE (ACINQ) **(implementado)**
    - Priorizar conexão ao trampoline na inicialização **(implementado)**
    - Adicionar onion address para suporte Tor **(implementado)**

    Constantes:
    const TRAMPOLINE_NODE = {
      nodeId: '03933884aaf1d6b108397e5efe5c86bcf2d8ca8d2f700eda99db9214fc2712b134',
      host: '13.248.222.197',
      port: 9735,
      onionHost: 'iq7zhmhck54vcax2vlrdcavq2m32wao7ekh6jyeglmnuuvv3js57r4id.onion'
    }
```

### 1.2 Implementar Connection State Machine

**Arquivos a modificar:**

- `src/core/services/ln-transport-service.ts`
- Novo: `src/core/models/lightning/connection.ts`

**Tarefas:**

```
[x] 1.2.1 Criar modelo de estado de conexão
    Arquivo: src/core/models/lightning/connection.ts

    interface ConnectionState {
      status: 'disconnected' | 'connecting' | 'handshaking' | 'init_sent' | 'established' | 'error'
      peerId: string | null
      features: Uint8Array | null
      lastConnected: number | null
      lastDisconnected: number | null
      reconnectAttempts: number
      error: string | null
    }

[x] 1.2.2 Implementar backoff exponencial para reconexão
    Arquivo: src/core/services/ln-peer-service.ts

    Referência Phoenix (AppConnectionsDaemon.kt):
    - Timeouts: 1s → 2s → 4s → 7s → 10s (normal)
    - Timeouts: 3s → 6s → 12s → 21s → 30s (Tor)

[x] 1.2.3 Implementar ping/pong keepalive
    Arquivo: src/core/services/ln-transport-service.ts

    - Enviar ping a cada 30s
    - Timeout de 10s para pong
    - Reconectar se pong não recebido
```

### 1.3 Persistir Estado de Peers

**Arquivos a modificar:**

- `src/core/repositories/lightning.ts`
- `src/core/services/ln-peer-service.ts`

**Tarefas:**

```
[x] 1.3.1 Salvar peers conectados com sucesso
    - Após conexão estabelecida, salvar no repository
    - Incluir: nodeId, address, port, lastConnected, features

[x] 1.3.2 Carregar peers do cache na inicialização
    - Priorizar peers conhecidos sobre bootstrap
    - Implementar LRU para limitar cache (max 50 peers)

[x] 1.3.3 Implementar scoring de peers
    - Incrementar score em conexão bem-sucedida
    - Decrementar em falha
    - Ordenar por score na seleção
```

### Critérios de Conclusão Fase 1

- [x] Conexão real estabelecida com pelo menos 1 peer
- [x] Init messages trocados corretamente
- [x] Features negociados e armazenados
- [x] Reconexão automática funcionando
- [x] Peers persistidos entre sessões

---

## Fase 2: Channel Reestablishment

> **Prioridade:** 🔴 P0  
> **Duração Estimada:** 2 semanas  
> **Objetivo:** Reestabelecer canais existentes após reconexão

### 2.1 Implementar channel_reestablish (BOLT #2)

**Arquivos a modificar:**

- `src/core/lib/lightning/peer-protocol.ts`
- `src/core/lib/lightning/channel.ts`
- Novo: `src/core/services/ln-channel-reestablish-service.ts`

**Tarefas:**

```
[x] 2.1.1 Criar mensagem channel_reestablish
    Arquivo: src/core/lib/lightning/peer-protocol.ts

    interface ChannelReestablishMessage {
      channelId: Uint8Array           // 32 bytes
      nextCommitmentNumber: bigint     // u64
      nextRevocationNumber: bigint     // u64
      yourLastPerCommitmentSecret: Uint8Array  // 32 bytes
      myCurrentPerCommitmentPoint: Uint8Array  // 33 bytes
    }

    function encodeChannelReestablish(msg: ChannelReestablishMessage): Uint8Array
    function decodeChannelReestablish(data: Uint8Array): ChannelReestablishMessage

[x] 2.1.2 Implementar lógica de reestablishment
    Arquivo: src/core/services/ln-channel-reestablish-service.ts

    class ChannelReestablishService {
      async reestablishChannel(channelId: Uint8Array, peer: Peer): Promise<ReestablishResult>

      // Verificar commitment numbers
      // Detectar data loss (nosso ou do peer)
      // Sincronizar HTLCs pendentes
      // Retomar estado NORMAL
    }

[x] 2.1.3 Integrar com fluxo de inicialização
    Arquivo: src/core/services/ln-initializer-service.ts

    Após peer conectado:
    1. Carregar canais do repository
    2. Filtrar canais com esse peer
    3. Enviar channel_reestablish para cada
    4. Aguardar resposta
    5. Atualizar estado do canal
```

### 2.2 Tratamento de Data Loss

**Arquivos a modificar:**

- `src/core/services/ln-channel-reestablish-service.ts`
- `src/core/lib/lightning/channel.ts`

**Tarefas:**

```
[x] 2.2.1 Detectar data loss local
    - Se peer envia commitment number maior que esperado
    - Acionar protocolo de recuperação (option_data_loss_protect)

[x] 2.2.2 Detectar data loss remoto
    - Se peer envia commitment number menor
    - Fornecer per_commitment_secret para prova

[x] 2.2.3 Implementar force close se irrecuperável
    - Publicar commitment transaction mais recente
    - Iniciar sweep de outputs
```

### Critérios de Conclusão Fase 2

- [x] Canais reestabelecidos corretamente após desconexão
- [ ] HTLCs pendentes retomados
- [x] Data loss detectado e tratado
- [ ] Estados de canal sincronizados

---

## Fase 3: Sincronização de Gossip OU Trampoline Mode

> **Prioridade:** 🔴 P0 (um dos dois é obrigatório)  
> **Duração Estimada:** 3-4 semanas  
> **Objetivo:** Habilitar pathfinding para pagamentos

### Opção 3A: Trampoline Mode (Recomendado para MVP)

**Arquivos a criar/modificar:**

- Novo: `src/core/lib/lightning/trampoline.ts`
- `src/core/services/ln-payment-service.ts`

**Tarefas:**

```
[x] 3A.1 Implementar Trampoline Onion
    Arquivo: src/core/lib/lightning/trampoline.ts

    interface TrampolineHop {
      nodeId: Uint8Array
      payloadTlv: Uint8Array
    }

    function createTrampolineOnion(
      hops: TrampolineHop[],
      associatedData: Uint8Array
    ): Uint8Array

    Referência: electrum/trampoline.py:create_trampoline_route_and_onion()

[x] 3A.2 Modificar sendPayment para usar trampoline
    Arquivo: src/core/services/ln-payment-service.ts

    async sendPaymentViaTrampoline(invoice: string): Promise<PaymentResult> {
      // 1. Decodificar invoice
      // 2. Criar trampoline onion com destino
      // 3. Enviar para trampoline node
      // 4. Aguardar resposta
    }

[x] 3A.3 Implementar fee estimation para trampoline
    - Fees base + proporcional configuráveis (4 níveis: 0, 1000msat+100ppm, 3000msat+500ppm, 5000msat+1000ppm)
    - Retry automático com fee level incremental em sendPayment
    - Método createSmartTrampolinePaymentWithFeeLevel na EnhancedTrampolineRouter
    - Integração com ln-service.ts para retry em falhas de fee

    Referência Phoenix:
    trampolineFees = [
      TrampolineFees(feeBase = 4.sat, feeProportional = 4_000, cltvExpiryDelta = 576)
    ]
```

### Opção 3B: Full Gossip Mode

**Arquivos a modificar:**

- `src/core/services/ln-initializer-service.ts`
- `src/core/lib/lightning/gossip-sync.ts`
- Novo: `src/core/lib/lightning/pathfinding.ts`

**Tarefas:**

```
[x] 3B.1 Implementar gossip sync real
    Arquivo: src/core/lib/lightning/gossip-sync.ts

    class GossipSyncManager {
      async startSync(peers: Peer[]): Promise<void>
      async queryChannelRange(peer: Peer, firstBlock: number, numBlocks: number): Promise<void>
      async queryShortChannelIds(peer: Peer, ids: ShortChannelId[]): Promise<void>
      getProgress(): SyncProgress
      isReady(): boolean
    }

[x] 3B.2 Implementar verificação de assinaturas
    - Validar channel_announcement signatures (verifyChannelAnnouncement)
    - Validar node_announcement signatures (verifyNodeAnnouncement)
    - Validar channel_update signatures (verifyChannelUpdate)
    - Integração no GossipSyncManager com métodos de verificação
    - Exportações atualizadas no index.ts

    Referência: electrum/channel_db.py:verify_channel_announcement()

[x] 3B.3 Implementar pathfinding local
    Arquivo: src/core/lib/lightning/pathfinding.ts

    interface Route {
      hops: RouteHop[]
      totalFee: bigint
      totalCltv: number
    }

    function findRoute(
      graph: RoutingGraph,
      source: Uint8Array,
      destination: Uint8Array,
      amountMsat: bigint,
      maxFee: bigint,
      maxCltv: number
    ): Route | null

    - Wrapper para RoutingGraph.findRoute() existente
    - Funções utilitárias: addChannelToGraph, addNodeToGraph, validateRoute, etc.
    - Integração com Dijkstra's algorithm

[ ] 3B.4 Implementar cache de grafo
    - Persistir grafo no LightningRepository
    - Carregar na inicialização
    - Atualizar incrementalmente
    - Prune de dados antigos (14 dias)
```

### Opção 3C: Hybrid Mode (Produção)

```
[ ] 3C.1 Iniciar em trampoline mode
[ ] 3C.2 Sincronizar gossip em background
[ ] 3C.3 Migrar para local pathfinding quando sync completo
[ ] 3C.4 Fallback para trampoline se local falhar
```

### Critérios de Conclusão Fase 3

- [x] Pagamentos podem ser enviados com sucesso
- [x] Rotas encontradas para destinos diversos
- [x] Fees dentro do esperado
- [x] Retry automático em caso de falha de rota

---

## 🎯 Próximas Etapas - Pós Fase 3

Com a implementação completa do **Full Gossip Mode**, o iHodl agora possui:

✅ **Funcionalidades Core Lightning:**

- Conectividade P2P real com peers Lightning
- Channel reestablishment automático
- Sincronização completa do grafo de roteamento
- Pathfinding local com Dijkstra
- Cache persistente de grafo com TTL

### Estratégia de Próximas Etapas

**Recomendação:** Focar em **Fase 4 (Gates de Prontidão)** como prioridade máxima, pois:

1. **Bloqueia MVP**: Sem gates, operações podem falhar silenciosamente
2. **Impacto Usuário**: Usuário precisa saber quando pode enviar/receber
3. **Fundação para Produção**: Essencial para UX confiável

### Plano de Ação Imediato (2 semanas)

#### Semana 1: ReadinessState Core

```
[x] 4.1.1 Criar modelo ReadinessState
[x] 4.1.2 Implementar guards em sendPayment()
[x] 4.1.3 Implementar guards em createInvoice()
[x] 4.1.4 Adicionar readiness ao contexto React
```

#### Semana 2: UI e Traffic Control

```
[ ] 4.1.5 Componente LightningReadinessGuard
[ ] 4.1.6 Status de inicialização na UI
[ ] 4.2.1 Implementar TrafficControl básico
[ ] 4.2.2 Monitor de conectividade de rede
```

### Plano de Médio Prazo (4-6 semanas)

#### Fase 5: Integração Electrum (2 semanas)

```
[ ] 5.1.1 Conectar Electrum na inicialização
[ ] 5.1.2 Implementar ElectrumWatcher
[ ] 5.1.3 Monitorar funding/closing transactions
[ ] 5.2.1 DNS Bootstrap como fallback
```

#### Fase 6: Testes em Testnet (2-3 semanas)

```
[ ] 6.1.1 Testes unitários completos
[ ] 6.2.1 Canal testnet básico
[ ] 6.2.2 Pagamento testnet
[ ] 6.3.1 Comparação com Phoenix/Electrum
```

### Considerações Estratégicas

#### MVP Definition Atualizada

Com Full Gossip Mode implementado, o MVP pode ser definido como:

**Funcionalidades Essenciais:**

- ✅ Receber pagamentos (invoices)
- ✅ Enviar pagamentos via routing local
- ✅ Canais persistentes com reestablishment
- 🔄 Gates de prontidão (próxima prioridade)

**Funcionalidades Nice-to-have:**

- Monitoramento on-chain (Electrum)
- DNS bootstrap
- Testes completos em testnet

#### Riscos Prioritários

1. **UX sem Readiness**: Usuário tenta operações antes do sistema estar pronto
2. **Sem Electrum**: Canais não monitorados, estados incorretos
3. **Testes Insuficientes**: Bugs descobertos tardiamente

#### Métricas de Sucesso

- **Readiness Gates**: 100% das operações validadas
- **Testnet**: Pelo menos 1 canal criado e 1 pagamento enviado
- **Performance**: Startup < 30s, sync inicial < 5min

---

## Fase 4: Gates de Prontidão

> **Prioridade:** 🟡 P1  
> **Duração Estimada:** 1 semana  
> **Objetivo:** Impedir operações antes do sistema estar pronto

### 4.1 Implementar ReadinessState

**Arquivos a criar/modificar:**

- Novo: `src/core/models/lightning/readiness.ts`
- `src/core/services/ln-service.ts`
- `src/core/services/ln-initializer-service.ts`

**Tarefas:**

```
[ ] 4.1.1 Criar modelo de ReadinessState
    Arquivo: src/core/models/lightning/readiness.ts

    interface ReadinessState {
      isWalletLoaded: boolean
      isTransportConnected: boolean
      isPeerConnected: boolean
      isChannelReestablished: boolean
      isGossipSynced: boolean  // ou isTrampolineReady
      isWatcherRunning: boolean
    }

    enum ReadinessLevel {
      NOT_READY = 0,
      CAN_RECEIVE = 1,    // Pode gerar invoices
      CAN_SEND = 2,       // Pode enviar pagamentos
      FULLY_READY = 3     // Todas funcionalidades
    }

    function getReadinessLevel(state: ReadinessState): ReadinessLevel

[ ] 4.1.2 Implementar guards em operações
    Arquivo: src/core/services/ln-service.ts

    async sendPayment(params): Promise<SendPaymentResult> {
      const readiness = this.getReadinessState()
      if (getReadinessLevel(readiness) < ReadinessLevel.CAN_SEND) {
        throw new LightningNotReadyError('Cannot send: ' + getNotReadyReason(readiness))
      }
      // ... resto da implementação
    }

[ ] 4.1.3 Expor readiness para UI
    Arquivo: src/ui/features/lightning/LightningProvider.tsx

    - Adicionar readinessState ao contexto
    - Componente <LightningReadinessGuard>
    - Mostrar status de inicialização na UI
```

### 4.2 Implementar TrafficControl (inspirado no Phoenix)

**Arquivos a criar:**

- Novo: `src/core/services/ln-traffic-control-service.ts`

**Tarefas:**

```
[ ] 4.2.1 Implementar TrafficControl
    interface TrafficControlState {
      walletIsAvailable: boolean
      internetIsAvailable: boolean
      disconnectCount: number  // Voting mechanism
    }

    canConnect = walletIsAvailable && internetIsAvailable && disconnectCount <= 0

    // Incrementar quando:
    // - App vai para background
    // - Erro de conexão

    // Decrementar quando:
    // - App volta para foreground
    // - Pagamento in-flight precisa ficar conectado
    // - Push notification recebida

[ ] 4.2.2 Monitorar estado da rede
    - Usar NetInfo do React Native
    - Pausar conexões quando offline
    - Retomar quando online
```

### Critérios de Conclusão Fase 4

- [ ] Operações bloqueadas quando sistema não pronto
- [ ] Mensagens de erro claras para usuário
- [ ] UI mostra status de inicialização
- [ ] Reconexão automática quando rede disponível

---

## Fase 5: Integração Electrum

> **Prioridade:** 🟡 P1  
> **Duração Estimada:** 2 semanas  
> **Objetivo:** Monitorar blockchain para canais Lightning

### 5.1 Integrar ElectrumClient com LightningInitializer

**Arquivos a modificar:**

- `src/core/services/ln-initializer-service.ts`
- `src/core/lib/electrum/client.ts`
- Novo: `src/core/services/ln-electrum-watcher-service.ts`

**Tarefas:**

```
[ ] 5.1.1 Conectar a Electrum na inicialização
    Arquivo: src/core/services/ln-initializer-service.ts

    Na fase initializeCoreComponents():
    - Conectar ao servidor Electrum
    - Aguardar handshake
    - Verificar consistência de blockchain
    - Obter altura atual

[ ] 5.1.2 Implementar ElectrumWatcher para Lightning
    Arquivo: src/core/services/ln-electrum-watcher-service.ts

    class ElectrumWatcherService {
      // Monitorar funding transactions
      watchFundingTx(txid: string, outputIndex: number): void

      // Monitorar spending de outputs
      watchChannelPoint(channelPoint: string): void

      // Detectar force close
      onSpendDetected(callback: (txid: string) => void): void

      // Obter confirmations
      getConfirmations(txid: string): Promise<number>
    }

[ ] 5.1.3 Integrar com channel state machine
    - Atualizar estado do canal baseado em eventos on-chain
    - Detectar funding confirmed
    - Detectar channel closed
    - Iniciar sweep de HTLCs se necessário
```

### 5.2 Implementar DNS Bootstrap (BOLT-10)

**Arquivos a criar:**

- Novo: `src/core/lib/lightning/dns-bootstrap.ts`

**Tarefas:**

```
[ ] 5.2.1 Implementar DNS SRV lookup
    // DNS seeds para Lightning
    const LN_DNS_SEEDS = [
      'nodes.lightning.directory',
      'lseed.bitcoinstats.com',
      'lseed.darosior.ninja'
    ]

    async function getBootstrapPeers(): Promise<LNPeerAddr[]> {
      // Query DNS SRV records
      // Parse bech32 pubkeys
      // Return peer addresses
    }

[ ] 5.2.2 Integrar como fallback em PeerConnectivityService
    - Usar após esgotar cache local
    - Usar após falhar bootstrap peers hardcoded
```

### Critérios de Conclusão Fase 5

- [ ] Conexão Electrum estabelecida na inicialização
- [ ] Transações de canais monitoradas
- [ ] Estados de canal atualizados automaticamente
- [ ] DNS bootstrap funcionando como fallback

---

## Fase 6: Testes e Validação

> **Prioridade:** 🟡 P1  
> **Duração Estimada:** 2 semanas  
> **Objetivo:** Garantir funcionamento correto em testnet

### 6.1 Testes Unitários

```
[ ] 6.1.1 Testes de transporte
    - Handshake BOLT #8
    - Init messages
    - Encoding/decoding de mensagens
    - Ping/pong

[ ] 6.1.2 Testes de channel reestablishment
    - Reestablishment normal
    - Data loss detection
    - HTLC resumption

[ ] 6.1.3 Testes de pathfinding (se full gossip)
    - Dijkstra básico
    - Fees calculation
    - CLTV calculation
    - No route found
```

### 6.2 Testes de Integração

```
[ ] 6.2.1 Testnet end-to-end
    - Criar canal com node testnet
    - Enviar pagamento
    - Receber pagamento
    - Fechar canal cooperativo
    - Force close

[ ] 6.2.2 Testes de resiliência
    - Reconexão após desconexão
    - Recuperação após crash
    - Comportamento offline
```

### 6.3 Testes de Regressão

```
[ ] 6.3.1 Verificar inicialização completa
    - Todas as fases executam em ordem
    - Nenhuma operação antes de ready
    - Timeouts apropriados

[ ] 6.3.2 Comparar com Phoenix/Electrum
    - Mesmas mensagens trocadas
    - Mesma ordem de operações
    - Comportamento similar em edge cases
```

---

## Cronograma Estimado

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CRONOGRAMA ATUALIZADO                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ✅ CONCLUÍDO:                                                                │
│ Semana 1-2:   ████████████████ Fase 1.1-1.2: Conectividade básica           │
│ Semana 3:     ████████         Fase 1.3: Persistência de peers              │
│ Semana 4-5:   ████████████████ Fase 2: Channel Reestablishment              │
│ Semana 6-8:   ████████████████████████ Fase 3: Full Gossip Mode             │
│                                                                              │
│ 🎯 PRÓXIMAS ETAPAS:                                                          │
│ Semana 9:     ██████████████████████████████████ Fase 4.1: ReadinessState Core ✅ CONCLUÍDA │
│ Semana 10:    ████████         Fase 4.2: UI e Traffic Control               │
│ Semana 11-12: ████████████████ Fase 5: Integração Electrum                  │
│ Semana 13-14: ████████████████ Fase 6: Testes em Testnet                    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ TOTAL RESTANTE: 6 semanas (~1.5 meses)                                       │
│ MVP FUNCIONAL: Semana 10 (2 semanas)                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### MVP (8 semanas) - ATUALIZADO

Para um MVP funcional com **Full Gossip Mode**:

- ✅ Fase 1: 3 semanas (Concluída)
- ✅ Fase 2: 2 semanas (Concluída)
- ✅ Fase 3: 3 semanas (Concluída - Full Gossip)
- 🔄 Fase 4: 2 semanas (Fase 4.1 concluída - Próximo: Fase 4.2 UI e Traffic Control)

**Status Atual:** 9/10 semanas concluídas, MVP funcional em 1 semana!

---

## Riscos e Mitigações

| Risco                          | Probabilidade | Impacto | Mitigação                              |
| ------------------------------ | ------------- | ------- | -------------------------------------- |
| Trampoline node indisponível   | Baixa         | Alto    | Implementar múltiplos trampoline nodes |
| Incompatibilidade de protocolo | Média         | Alto    | Testar contra múltiplas implementações |
| Performance de pathfinding     | Média         | Médio   | Cache agressivo, limitar profundidade  |
| Problemas de reconexão         | Alta          | Médio   | Backoff exponencial, circuit breaker   |
| Data loss em crash             | Baixa         | Crítico | Backup frequente, SCB recovery         |

---

## Checklist de Acompanhamento

### Fase 1: Fundações de Conectividade

- [x] 1.1.1 TcpTransport integrado
- [x] 1.1.2 Init messages implementados
- [x] 1.1.3 Trampoline node configurado
- [x] 1.2.1 ConnectionState model
- [x] 1.2.2 Backoff exponencial
- [x] 1.2.3 Ping/pong keepalive
- [x] 1.3.1 Peers salvos
- [x] 1.3.2 Peers carregados
- [x] 1.3.3 Scoring de peers

### Fase 2: Channel Reestablishment

- [x] 2.1.1 Mensagem channel_reestablish
- [x] 2.1.2 Lógica de reestablishment
- [x] 2.1.3 Integração com inicialização
- [x] 2.2.1 Data loss local detection
- [x] 2.2.2 Data loss remoto detection
- [x] 2.2.3 Force close se irrecuperável

### Fase 3: Routing

- [x] 3A.1 Trampoline onion (se Opção A)
- [x] 3A.2 sendPaymentViaTrampoline
- [x] 3A.3 Fee estimation
- [ ] OU
- [x] 3B.1 Gossip sync real (se Opção B)
- [x] 3B.2 Verificação de assinaturas
- [x] 3B.3 Pathfinding local
- [x] 3B.4 Cache de grafo

### Fase 4: Gates de Prontidão

- [x] 4.1.1 ReadinessState model
- [x] 4.1.2 Guards em operações
- [x] 4.1.3 UI de readiness
- [ ] 4.2.1 TrafficControl
- [ ] 4.2.2 Monitor de rede

### Fase 5: Integração Electrum

- [ ] 5.1.1 Electrum na inicialização
- [ ] 5.1.2 ElectrumWatcher
- [ ] 5.1.3 Integração com channels
- [ ] 5.2.1 DNS Bootstrap
- [ ] 5.2.2 Fallback integrado

### Fase 6: Testes

- [ ] 6.1.1 Testes de transporte
- [ ] 6.1.2 Testes de reestablishment
- [ ] 6.1.3 Testes de pathfinding
- [ ] 6.2.1 Testnet e2e
- [ ] 6.2.2 Testes de resiliência
- [ ] 6.3.1 Verificar inicialização
- [ ] 6.3.2 Comparar com referências

---

## Referências

- [Comparativo de Inicialização](./lightning-initialization-comparison.md)
- [Phoenix Source Code](../phoenix/)
- [Electrum Source Code](../electrum/)
- [BOLT Specifications](https://github.com/lightning/bolts)
- [React Instructions](../.github/instructions/react.instructions.md)

---

_Documento criado em: Dezembro 2025_  
_Última atualização: Dezembro 2025_
