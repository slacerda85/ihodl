# Worker Context Summary

## Scope

- Implemented Lightning worker lifecycle, debug telemetry, and fault-tolerance across recent sessions.

## Key Changes

- Hook `useLightningStartupWorker` wired at app root (`src/app/_layout.tsx`) to auto-start per wallet; cleans up on unmount/wallet switch.
- Lightning store gains `resetForWalletChange` to clear readiness/state/metrics when wallet changes.
- Debug UI: `LightningDebugPanel` now renders worker status/readiness/metrics plus retry/error counters (Electrum attempts/failures, peer attempts/failures, disconnects, gossip attempts/timeouts). Helper hook `useLightningDebugSnapshot` exposes worker snapshots.
- Worker (`ln-worker-service.ts`): added retries/backoff for Electrum, peers, gossip; metrics now include attempts/failures/disconnectCount/gossipTimeouts; peer event handlers update readiness/metrics; background gossip retry; listeners cleaned on stop.
- Plan updates in `docs/lightning-worker-plan.md`: sections 6.0, 7.0, 8.0 marked complete (debug/telemetry, lifecycle/reset, fault tolerance).

## Outstanding (from plan)

- Section 9.0 security/performance, 10.0 tests, 11.0 docs/flags remain open. Gossip mode switching still flagged for fine-tuning.

## Useful Paths

- Worker service: `src/core/services/ln-worker-service.ts`
- Worker hook: `src/ui/hooks/use-lightning-worker.ts`
- Lightning store: `src/ui/features/lightning/store.ts`
- Debug panel: `src/ui/features/lightning/components/LightningDebugPanel.tsx`
- Plan: `docs/lightning-worker-plan.md`
