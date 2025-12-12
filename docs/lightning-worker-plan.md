# Plano de Implementação do LightningWorker (Orquestrador)

## Objetivo

Consolidar um LightningWorker (orquestrador) que inicializa e coordena Electrum, peers, gossip, reestablish, watchtower e readiness reais, alinhado aos fluxos do Electrum (ln-worker) e Phoenix.

## TODO (numerado)

- [ ] 1.0 Definir papel do LightningWorker
  - [x] 1.1 Consolidar responsabilidades: bootstrap (Electrum+watcher), peer connectivity (BOLT1), channel reestablish (BOLT2), gossip sync (ou trampoline), readiness real, watchdog/recovery e métricas.
  - [x] 1.2 Escolher escopo único: worker orquestrador chamando `ln-worker-service.ts`, `ln-peer-service`, emitindo estado coerente para o `lightningStore`.

- [x] 2.0 Revisar/atualizar `ln-worker-service.ts`
  - [x] 2.1 Mapear API atual vs. necessidade (connectElectrum, watcher, peer pool, gossip sync, reestablish, background sync, watchtower).
  - [x] 2.2 Padronizar comandos/eventos: `init`, `connectElectrum`, `startPeers`, `reestablishChannels`, `syncGossip`, `startWatchtower`, `stop`, `metrics`, `readiness`.
  - [x] 2.3 Garantir idempotência e troca de wallet (stop/teardown limpo + reset interno).

- [x] 3.0 Integrar via hook orquestrador
  - [x] 3.1 Criar `useLightningWorker` (ou `useLightningStartupWorker`) que inicializa o worker no root e expõe estado de fases + readiness + comandos (`start`, `stop`, `reconnectPeers`, `resyncGossip`, `recheckChannels`).
  - [x] 3.2 Sincronizar esse hook com o `lightningStore` para manter snapshots em `AppProvider` (evitando estados duplicados).

- [x] 4.0 Conectar serviços reais no worker
  - [x] 4.1 Acionar `connectElectrum` + `ElectrumWatcher` + `ChannelOnChainMonitor` na fase inicial.
  - [x] 4.2 Acionar `PeerConnectivityService.start` com pool (trampoline/cache/canais/bootstrap/DNS) + backoff.
  - [x] 4.3 Acionar `ChannelReestablishService` após peers conectarem.
  - [x] 4.4 Acionar `GossipSyncManager` (sem mockPeers) + `BackgroundGossipSyncService` com transporte real.
  - [x] 4.5 Acionar `LightningRoutingService` para alternar TRAMPOLINE/LOCAL conforme progresso do gossip. (TODO: pendente ajuste fino de modo; readiness já propaga)
  - [x] 4.6 Acionar `WatchtowerService` / `LightningMonitorService` condicional a canais ativos.

- [x] 5.0 Readiness real (sem defaults otimistas)
  - [x] 5.1 Calcular readiness no worker: walletLoaded, electrumReady, transportConnected, peerConnected, channelsReestablished, gossipSynced (ou trampoline), watcherRunning.
  - [x] 5.2 Propagar readiness para `lightningStore`/UI e remover marcações default true no store.
  - [x] 5.3 Gating: `sendPayment`/`generateInvoice` dependem do readiness real (erro claro se faltar peer/gossip).

- [x] 6.0 Integração com debug/telemetria
  - [x] 6.1 Ajustar `LightningDebugPanel` para consumir estado emitido pelo hook/worker (fases + métricas: tentativas, tempos, peers ativos).
  - [x] 6.2 Expor helper no hook (`getDebugSnapshot`) para o painel; manter separação (hook entrega dados, painel renderiza JSX).

- [x] 7.0 Lifecycle e bootstrap
  - [x] 7.1 Invocar o hook no `_layout` root para auto-inicializar Lightning ao abrir o app (stop ao desmontar ou trocar wallet).
  - [x] 7.2 Reset seguro ao mudar de wallet: stop worker, limpar caches transitórios, reiniciar com nova walletId.

- [x] 8.0 Tolerância a falhas
  - [x] 8.1 Implementar retries/backoff por fase (Electrum, peers, gossip) com limites e telemetria.
  - [x] 8.2 Emitir eventos de erro e contadores (`disconnectCount`, `gossipTimeouts`).

- [x] 9.0 Segurança e performance
  - [x] 9.1 Offload pesado para o worker (decode gossip, channel DB); evitar bloquear UI.
  - [x] 9.2 Usar structuredClone/serialização segura nas mensagens; evitar payloads grandes desnecessários.

- [x] 10.0 Testes
  - [x] 10.1 Unit: fluxo de init do worker (serviços mock) validando ordem e readiness.
  - [x] 10.2 Integração: Electrum → peers → reestablish → gossip → readiness gates → sendPayment falha/ok.
  - [x] 10.3 Regressão: troca de wallet reseta e reinicia sem vazar conexões.

- [x] 11.0 Documentação e flags
  - [x] 11.1 Documentar API do worker (comandos, eventos, payloads) e pontos de montagem na UI.
  - [x] 11.2 Manter feature flag para ativar orquestração do worker em rollout gradual.

## Notas de referência (Electrum/Phoenix)

- Electrum: `lnworker` inicia watcher, carrega canais antes de conectar, mantém pool de peers, faz gossip separado e só libera pagamento após gossip/channel_db ok.
- Phoenix: prepara parâmetros, usa TrafficControl, conecta Electrum + peer trampoline, não depende de gossip; readiness exige connectionState ESTABLISHED.
- Aplicar ordem similar: carregar estado → Electrum → peers → reestablish → gossip (ou trampoline) → watchtower → pronto.

## Detalhamento das responsabilidades (1.1)

- Bootstrap on-chain
  - Conectar `connectElectrum` (com backoff) e iniciar `ElectrumWatcher` + `ChannelOnChainMonitor` (idempotentes).
  - Emitir `electrumReady` e altura de bloco para readiness e telemetria.
- Peer connectivity (BOLT1)
  - `PeerConnectivityService.start` com pool (trampoline > cache > peers de canais > bootstrap list > DNS BOLT-10), backoff e health checks.
  - Emitir eventos de peer conectado/desconectado e manter `peerConnected` no readiness.
- Channel reestablish (BOLT2)
  - Rodar `ChannelReestablishService` após peers conectarem; marcar `channelsReestablished` quando concluído.
- Gossip / Trampoline
  - Modo gossip: `GossipSyncManager` cache-first + `BackgroundGossipSyncService` com transporte real; emitir progresso e `gossipSynced` quando completo.
  - Modo trampoline: pular gossip, manter flag de transporte/peer para readiness; ainda permitir background sync híbrido se habilitado.
- Readiness real
  - Calcular flags: walletLoaded, electrumReady, transportConnected, peerConnected, channelsReestablished, gossipSynced|trampoline, watcherRunning.
  - Derivar `readinessLevel` e expor para UI e `lightningStore`; nenhum default otimista.
- Watchdog / recovery
  - Supervisão de fases com retries/backoff, limites de tentativas e eventos de erro (ex.: `disconnectCount`, `gossipTimeouts`).
  - Parar/retomar serviços de forma idempotente (troca de wallet, unmount).
- Métricas / telemetria
  - Coletar tempos por fase (Electrum, peers, gossip), contadores de retries/falhas, peers ativos.
  - Expor snapshot compacto para DebugPanel e para logs estruturados.

## Detalhamento do escopo único (1.2)

O LightningWorker será implementado no `ln-worker-service.ts`, atuando como orquestrador único que:

- Chama `ln-peer-service` (PeerConnectivityService) para gerenciar conexões de peers.
- Incorpora funcionalidades de inicialização do antigo `ln-initializer-service.ts` (conectar Electrum, iniciar watcher, monitor, gossip, etc.), copiadas para o worker para consolidação.
- Emite estado coerente para o `lightningStore` via eventos ou métodos de atualização, mantendo separação entre serviço e UI.
- Não utiliza `ln-initializer-service` diretamente, pois suas responsabilidades foram migradas para o worker.
