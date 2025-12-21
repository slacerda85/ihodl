# Worker Stabilization Plan (Lightning Pipeline)

Objetivo: eliminar loops e corridas de inicialização do Lightning worker, garantindo pipeline único (init → electrum → watcher/monitor → peers → reestablish → gossip) controlado pelo AppProvider.

## Checklist

1. [x] Remover bootstrap duplicado do worker em `_layout.tsx` (usar apenas AppProvider para orquestração).
2. [x] Consolidar listeners de status/readiness/metrics no store (evitar handlers duplicados em hooks auxiliares).
3. [x] Validar que `updateReadinessState` não é chamado a partir de callbacks do próprio worker (evitar loops) e adicionar guarda de idempotência.
4. [x] Revisar ciclo de reset/troca de wallet para não reenviar readiness ao worker durante teardown.
5. [ ] Smoke: abrir app com wallet ativa, observar Debug Panel (altura Electrum, peers, gossip, watcher) sem stack overflow; logs sem recursion.
