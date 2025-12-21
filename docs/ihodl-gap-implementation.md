# iHodl Gap Implementation Plan (Lightning + On-Chain)

Objetivo: fechar todos os gaps listados em `wallets-comparison.md`, simplificando o pipeline via `ln-worker-service` como orquestrador único sempre que possível. Separar apenas o que realmente precisa rodar fora do ciclo do app (ex.: notificacoes nativas, watchtower dedicada). Cada etapa traz checklist para acompanhamento.

## Princípios

- Priorizar `WorkerService` como entrypoint unico de inicializacao Lightning (paridade com Electrum: LNWallet -> start_network).
- Minimizar servicos paralelos; mover responsabilidades para o worker quando nao houver impedimento tecnico/performance.
- Gates de prontidao obrigatorios antes de qualquer operacao Lightning.
- On-chain paridade com Electrum: PSBT, multisig, watch-only, HW wallets.

## Resumo de Gaps (do wallets-comparison)

- Readiness/gates reais (hoje otimistas) e inicializacao completa (Electrum + peers + gossip + watchtower).
- Componentes visuais faltantes: `IncomingBalancePopover`, `LiquidityAds` UI, notificacoes/watchers.
- Funcionalidades on-chain faltantes: PSBT avancado, multisig, watch-only/xpub, hardware wallets, descriptors, message signing, Taproot completo.

## Plano por Etapa (com checklists)

### 1) Orquestracao unica via `ln-worker-service`

Responsavel: `src/core/services/ln-worker-service.ts` + App root.

Checklist:

1. [x] Expor factory/instance do Worker no `lightningStore` ou provider global.
2. [x] Chamar `worker.initialize(walletId/masterKey)` no App root (ex.: `AppProvider`/hook global) ao abrir app ou trocar carteira.
3. [x] Garantir `stop()` no logout/troca de wallet e no background (onBlur) se necessario.
4. [x] Remover caminhos alternativos de inicializacao duplicados (ex.: chamadas diretas de services isolados) em favor do worker.
5. [x] Documentar ordem de fases no README interno (init -> electrum -> peers -> reestablish -> gossip -> watchtower).

Fases documentadas: init → connectElectrum → startPeers → reestablishChannels → syncGossip → startWatchtower (mantido no worker).

### 2) Gates de prontidao obrigatorios

Responsavel: `ln-worker-service`, `ln-service` facade, UI hooks.

Checklist:

1. [x] Implementar `canSendPayment()` / `canReceivePayment()` no worker usando `WorkerReadiness` real (electrumReady, peerConnected, channelsReestablished, gossipSynced ou trampoline).
2. [x] Propagar readiness para UI via store/hook; remover defaults otimistas.
3. [x] Bloquear botoes/acoes de send/receive quando readiness insuficiente; mensagens claras.
4. [x] Tests de regressao: enviar pagamento sem peer/gossip deve falhar rapido e seguro.

### 3) Electrum client + watcher ligados pelo worker

Responsavel: `ln-worker-service`, `ln-electrum-watcher-service`.

Checklist:

1. [x] Chamar `connectElectrum()` dentro do fluxo `initialize` (fase precoce) com retry/backoff.
2. [x] Acionar `ensureElectrumWatcherStarted()` e `ChannelOnChainMonitor` assim que Electrum conectado.
3. [x] Surface metrics: altura de bloco, tentativas/falhas.
4. [x] Remover inicializacoes soltas de Electrum fora do worker.

### 4) Peer connectivity + channel reestablish via worker

Responsavel: `ln-worker-service`, `ln-peer-service`, `ln-channel-reestablish-service`.

Checklist:

1. [ ] Garantir `startPeers()` no fluxo do worker apos Electrum.
2. [ ] `attachPeerEventHandlers()` e reconexao com backoff ativados.
3. [ ] Chamar `reestablishChannels()` apos peers conectados, antes de liberar pagamentos.
4. [ ] Persistir peers (score/LRU) e carregar no boot.
5. [ ] Tests: queda e reconexao restabelecendo canais e HTLCs pendentes.

Estado atual: troca de init (BOLT #1) agora aguarda `handshakeComplete` do BOLT #8 antes de enviar mensagens. Além disso, removemos uso indevido de TLS no transporte Lightning (Noise roda sobre TCP puro mesmo na porta 443), eliminando timeouts/handshake failures observados no iOS.

### 5) Gossip sync e modo de roteamento

Responsavel: `ln-worker-service`, `ln-routing-service`, `gossip-sync`, `graph-cache`.

Checklist:

1. [ ] Rodar `syncGossip()` (ou trampoline-only) dentro do worker; usar cache em disco (`GraphCacheManager`).
2. [ ] Alternar `RoutingMode` para LOCAL quando `BackgroundSyncState = COMPLETED`; fallback para TRAMPOLINE se incompleto.
3. [ ] Em caso de tempo limite (>30min), marcar estado e permitir retry manual.
4. [ ] Expor progresso de gossip na UI (percentual, nodes/canais carregados).
5. [ ] Tests de caminho feliz (cache hit) e cache miss (sync completo).

### 6) Watchtower / Lightning monitor

Responsavel: `ln-watchtower-service`, `ln-monitor-service` integrados ao worker.

Checklist:

1. [ ] Acionar `startWatchtower()` opcional no worker (config flag).
2. [ ] Integrar `LightningMonitorService` para HTLC/breach alerts; timers ja existem no worker (htlcPollIntervalMs).
3. [ ] Definir politica de execucao em background: se permissoes/OS permitirem, manter rodando mesmo com app fechado; senao, pausar com resume no foreground.
4. [ ] Surface status na UI (watchtower running / paused).

### 7) UI gaps de liquidez e notificacoes

Responsavel: `src/ui/features/lightning/*`.

Checklist:

1. [ ] Implementar `IncomingBalancePopover` (saldo on-chain pendente e auto swap-in).
2. [ ] Implementar `LiquidityAdsView` para adicionar liquidez manual.
3. [ ] Completar `LiquidityStatusDashboard` (metricas inbound/outbound, graficos simples).
4. [ ] Integrar notificacoes (local/push) para eventos: canal aberto/fechado, swap-in executado, falha de pagamento, perda de peer.
5. [ ] Bloquear/mostrar estados em botoes send/receive conforme readiness (etapa 2).

### 8) Funcionalidades on-chain pendentes (paridade Electrum)

Responsavel: `src/core/lib/transactions/*`, `psbt.ts`, `wallet service`, UI wallet.

Checklist:

1. [ ] PSBT avancado: merge/finalize, Taproot fields (BIP-371), schnorr sign/verify, sighash Taproot (BIP-341).
2. [ ] Multisig P2SH/P2WSH: address generation, scripts, assinatura/validacao.
3. [ ] Watch-only / xpub import: CKD_pub, sync UTXO, PSBT unsigned.
4. [ ] Hardware wallets: integrar fluxo PSBT com dispositivos; plugin architecture semelhante aos plugins Electrum (priorizar Ledger/Trezor mais tarde).
5. [ ] Descriptors (BIP-380/381) parsing/export basico.
6. [ ] Message signing (ECDSA/Schnorr) para mensagens Bitcoin.
7. [ ] UI: expor PSBT flow, multisig setup, xpub import, coin control refinado.

### 9) Notificacoes e processos em segundo plano

Responsavel: worker + camada de notificacao.

Checklist:

1. [ ] Definir politica: se worker puder rodar leve em background, manter gossip/watchtower/htlc monitor ativos; caso contrario, pausar e reagendar no foreground.
2. [ ] Implementar canal de eventos do worker -> notificacao local/push para eventos criticos (breach, pagamento recebido, canal fechado).
3. [ ] Testar consumo de bateria/redes; colocar feature flag para background intenso.

### 10) Observabilidade e testes

Responsavel: worker + testes.

Checklist:

1. [ ] Logs estruturados por fase (init, electrum, peers, reestablish, gossip, watchtower) com duracao e erros.
2. [ ] Tests de integracao: boot completo (Electrum -> peers -> reestablish -> gossip) e envio/recebimento com gates.
3. [ ] Smoke tests de regressao on-chain (RBF/CPFP/batch) e PSBT/multisig quando entregues.
4. [ ] Metricas basicas expostas pelo worker (`WorkerMetrics`) e mostradas em tela dev/debug.

## Execucao sugerida (ordem)

1. Consolidar `ln-worker-service` como unico orchestrator (etapas 1-4 + gates da etapa 2).
2. Ligar gossip/routing e watchtower (etapas 5-6) e expor progresso na UI.
3. Entregar UI gaps de liquidez/notificacoes (etapa 7) alinhado aos estados reais do worker.
4. Fechar paridade on-chain (etapa 8) em paralelo por squad on-chain.
5. Ativar notificacoes/background e observabilidade (etapas 9-10).
