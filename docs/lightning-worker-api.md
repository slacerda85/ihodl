# Lightning Worker API e Flags

## Comandos expostos

- `init(masterKey, walletId?)`: inicializa pipeline Electrum → watcher → peers → reestablish → gossip → watchtower.
- `restartForWallet(walletId, masterKey)`: encerra e reinicia para nova wallet com teardown seguro.
- `connectElectrum`, `startPeers`, `reestablishChannels`, `syncGossip`, `startWatchtower`: fases individuais, usadas internamente pelo fluxo de init.
- `stop()`: encerra serviços, listeners e conexões (Electrum, peers, gossip background).
- `getInitStatus()`, `getReadiness()`, `getMetrics()`: snapshots para UI e debug.
- Peer helpers: `getConnectedPeers()`, `getAllPeers()`, `addPeer()`, `removePeer()`, `reconnectAllPeers()`.

## Eventos emitidos (EventEmitter)

- `status`: `WorkerInitStatus { phase, progress, message, error? }`.
- `readiness`: `WorkerReadiness { walletLoaded, electrumReady, transportConnected, peerConnected, channelsReestablished, gossipSynced, watcherRunning }`.
- `metrics`: `WorkerMetrics { electrumHeight, connectedPeers, gossipCompleted, electrumAttempts|Failures, peerStartAttempts|Failures, disconnectCount, gossipSyncAttempts|Timeouts }`.
- `initialized` | `stopped` | `error`: lifecycle e falhas de fase.

## Pontos de montagem na UI

- Hook `useLightningStartupWorker` (arquivo `src/ui/hooks/use-lightning-worker.ts`) injeta o worker no root e sincroniza status/readiness/metrics com `lightningStore`.
- Montagem atual no `_layout.tsx` via `<LightningWorkerBootstrap />`, que respeita flag de rollout.
- Painel `LightningDebugPanel` consome snapshots do store para telemetria de desenvolvimento.

## Feature flag de rollout

- Flag: `EXPO_PUBLIC_LIGHTNING_WORKER_ENABLED` (default `true`).
- Implementação: `src/config/feature-flags.ts` com helper `isLightningWorkerEnabled()`.
- Uso: `_layout.tsx` só monta o bootstrap quando a flag está habilitada, permitindo rollout gradual ou desativação de emergência sem tocar na UI.

## Notas de uso

- UI deve consultar readiness real antes de habilitar ações (já aplicado em stores).
- Para testes/QA, desabilite o worker exportando `EXPO_PUBLIC_LIGHTNING_WORKER_ENABLED=false` no ambiente Expo.
