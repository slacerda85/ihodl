# Lightning Initialization Roadmap

## 1. Fundamentos e Contratos

- [x] 1.1 AppProvider e stores
- [x] 1.1.1 Garantir que `AppProvider` continua agregando `lightningStore` e `lightningStore.actions` como única fonte global.
- [x] 1.1.2 Evitar criar novos providers de Lightning na UI; usar o contexto já exposto pelo `AppProvider`.
- [x] 1.2 Fronteira UI → Services
- [x] 1.2.1 UI deve importar apenas de `@/core/services/*`; nenhuma chamada direta para `@/core/lib` a partir da UI.
- [x] 1.2.2 Confirmar que novas features Lightning usam apenas APIs de serviço (ex.: `ln-service`, `ln-initializer-service`, `ln-peer-service`).
- [x] 1.3 Fronteira Services → Lib
- [x] 1.3.1 Services devem encapsular o uso de funções da lib (`@/core/lib/lightning/*`, `@/core/lib/electrum/*`).
- [x] 1.3.2 Adicionar novas chamadas de lib somente dentro de services; expor métodos claros para a UI.

## 2. Conectividade de Rede

- [x] 2.1 Electrum
- [x] 2.1.1 Finalizar `connectElectrum` no initializer com retries/backoff e telemetria básica.
- [x] 2.1.2 Garantir `ElectrumWatcher` e `ChannelOnChainMonitor` iniciam/param de forma idempotente.
- [x] 2.2 Peer Connectivity (TCP + Noise + BOLT1)
- [x] 2.2.1 Usar `PeerConnectivityService` para conectar peers: trampoline → cache → peers de canais → bootstrap → DNS seeds.
- [x] 2.2.2 Implementar reconexão com limites (`maxReconnectAttempts`) e persistir peers confiáveis no `LightningRepository`.
- [x] 2.3 Channel Reestablish (BOLT2)
- [x] 2.3.1 Usar `ChannelReestablishService` para reenviar `channel_reestablish` a cada peer conectado.
- [x] 2.3.2 Registrar estatísticas de reestabelecimento (sucesso/falha) para debug e métricas.

## 3. Gossip e Routing

- [ ] 3.1 GossipSyncManager (cache-first)
- [ ] 3.1.1 Remover `mockPeers`; plugar peers reais do `PeerConnectivityService` para iniciar sync.
- [ ] 3.1.2 Respeitar `syncTimeout`; ao expirar, sinalizar no status e permitir retry manual.
- [ ] 3.2 Background Gossip (Hybrid)
- [ ] 3.2.1 Conectar `BackgroundGossipSyncService` ao transporte real via `PeerAdapter` + `TcpTransport`.
- [ ] 3.2.2 Emitir progresso e completar sync para alimentar `LightningRoutingService`.
- [ ] 3.3 Routing Service
- [ ] 3.3.1 Alternar `RoutingMode` de `TRAMPOLINE` para `LOCAL` quando `BackgroundSyncState` = `COMPLETED` e grafo >= limiares.
- [ ] 3.3.2 Expor no service API para consultar modo atual e stats de routing.

## 4. Readiness e Gates de Operação

- [ ] 4.1 Definir estado de prontidão
- [ ] 4.1.1 Consolidar `readinessState`/`readinessLevel` no `lightningStore` com flags: walletLoaded, electrumReady, peersReady, channelsReestablished, gossipSynced (ou trampoline).
- [ ] 4.2 Gates em services
- [ ] 4.2.1 No `ln-service.sendPayment` e operações críticas, validar readiness; retornar erro amigável se faltar peer/gossip.
- [ ] 4.2.2 Expor helper `canSendPayment()` / `canReceivePayment()` para a UI via services.
- [ ] 4.3 UI
- [ ] 4.3.1 Bloquear botões de envio/recebimento quando readiness insuficiente; mostrar estado atual (ex.: "Sincronizando grafo").

## 5. Persistência e Cache

- [ ] 5.1 GraphCache
- [ ] 5.1.1 Carregar/salvar grafo com `GraphCacheManager` em disco; invalidar quando versão/redes mudarem.
- [ ] 5.2 Peer/Channel cache
- [ ] 5.2.1 Persistir peers com score; expirar conforme `peerCacheMaxAge`.
- [ ] 5.2.2 Garantir canais carregam antes de reestablish para evitar inconsistências.

## 6. Monitoramento e Recuperação

- [ ] 6.1 Error Recovery
- [ ] 6.1.1 Manter `ErrorRecoveryService` ativo; registrar causas de queda de peer/gossip.
- [ ] 6.2 Watchtower / HTLC
- [ ] 6.2.1 Confirmar `WatchtowerService` inicia/stops junto do initializer; planejar métricas básicas.
- [ ] 6.2.2 Avaliar ativar `LightningMonitorService` somente quando houver canais ativos.

## 7. Experiência de Usuário

- [ ] 7.1 Feedback de progresso
- [ ] 7.1.1 Reaproveitar `InitStatus` para UI: fases (starting, syncing, connecting, ready) e mensagens.
- [ ] 7.1.2 Superfície de estado em telas Lightning (dashboard, channels, send/receive) consumindo apenas services.
- [ ] 7.2 Modo Trampoline vs Local
- [ ] 7.2.1 Expor na UI o modo atual; permitir toggle apenas se suportado pelas configs.

## 8. Testes

- [ ] 8.1 Unitários
- [ ] 8.1.1 Cobrir `syncLightningGraph` com peers reais + cache fallback.
- [ ] 8.1.2 Testar `BackgroundGossipSync` com adapter mock de transporte.
- [ ] 8.2 Integração
- [ ] 8.2.1 Fluxo completo: Electrum → peers → channel_reestablish → gossip → readiness gates.
- [ ] 8.2.2 Teste de regressão para `sendPayment` com readiness faltando (deve falhar rápido/seguro).

## 9. Rollout

- [ ] 9.1 Feature flags
- [ ] 9.1.1 Isolar mudanças de gossip/transport em flags para habilitar por ambiente.
- [ ] 9.2 Observabilidade
- [ ] 9.2.1 Log estruturado das fases do initializer; medir tempos de sync/peers.
- [ ] 9.3 Deploy
- [ ] 9.3.1 Testnet primeiro; depois mainnet com flag conservadora e monitoramento ativo.
