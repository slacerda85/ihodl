# Refactor Implementation Plan: AppProvider Simplification

## Overview

This plan outlines the steps to refactor the `AppProvider` component in `src/ui/features/app-provider/AppProvider.tsx` to reduce code duplication, improve maintainability, and simplify the interface by directly using store objects instead of manually constructing property objects.

**Goal**: Reduce ~200 lines of repetitive code by leveraging TypeScript's type inference and direct store object usage, while maintaining type safety and reactivity.

## TODO Checklist

### Phase 1: Store Standardization

- [x] **Update lightningStore actions to getter**: Change `actions` from a property to a getter in `lightningStore` class to match other stores' pattern.
- [x] **Update watchtowerStore actions to getter**: Change `actions` from a property to a getter in `watchtowerStore` class to match other stores' pattern.
- [x] **Add direct methods to networkStore**: Add `getConnection()` and `getLightningWorker(masterKey, network?)` as direct methods on the `networkStore` class, delegating to `actions`.

### Phase 2: AppContextType Refactoring

- [x] **Refactor wallet store type**: Replace manual interface definition with `Pick<typeof walletStore, 'subscribe' | 'getWalletsSnapshot' | 'getActiveWalletIdSnapshot' | 'actions'>`.
- [x] **Refactor settings store type**: Replace manual interface definition with `Pick<typeof settingsStore, 'subscribe' | 'getSnapshot' | 'getColorMode' | 'getLightningSettings' | 'actions'>`.
- [x] **Refactor address store type**: Replace manual interface definition with `Pick<typeof addressStore, 'subscribe' | 'getAddressesSnapshot' | 'getBalanceSnapshot' | 'getNextAddressesSnapshot' | 'notify' | 'notifyLight' | 'clear'>`.
- [x] **Refactor network store type**: Replace manual interface definition with `Pick<typeof networkStore, 'subscribe' | 'getSnapshot' | 'getConnection' | 'getLightningWorker' | 'actions'>`.
- [x] **Refactor lightning store type**: Replace manual interface definition with `Pick<typeof lightningStore, 'subscribe' | 'getSnapshot' | 'getReadinessState' | 'getReadinessLevel' | 'actions'>`.
- [x] **Refactor watchtower store type**: Replace manual interface definition with `Pick<typeof watchtowerStore, 'subscribe' | 'getSnapshot' | 'getIsInitialized' | 'getIsRunning' | 'getStatus' | 'getChannels' | 'getEvents' | 'getHasBreaches' | 'actions'>`.

### Phase 3: contextValue Simplification

- [x] **Update wallet assignment**: Change from object construction to direct assignment: `wallet: walletStore`.
- [x] **Update settings assignment**: Change from object construction to direct assignment: `settings: settingsStore`.
- [x] **Update address assignment**: Change from object construction to direct assignment: `address: addressStore`.
- [x] **Update network assignment**: Change from object construction to direct assignment: `network: networkStore`.
- [x] **Update lightning assignment**: Change from object construction to direct assignment: `lightning: lightningStore`.
- [x] **Update watchtower assignment**: Change from object construction to direct assignment: `watchtower: watchtowerStore`.

### Phase 4: Testing and Validation

- [x] **Run TypeScript compilation**: Ensure no type errors after refactoring.
- [x] **Test hooks reactivity**: Verify that hooks like `useWallets()`, `useSettingsState()`, etc., still work correctly with `useSyncExternalStore`.
- [x] **Test store actions**: Confirm that actions are accessible and functional (e.g., `useWalletActions().createWallet()`).
- [x] **Run unit tests**: Execute existing tests to ensure no regressions.
- [x] **Manual testing**: Test app functionality, especially state updates and re-renders.

### Phase 5: Cleanup and Documentation

- [x] **Remove unused imports**: Clean up any type imports that are no longer needed after using `Pick`.
- [x] **Update comments**: Revise JSDoc and inline comments to reflect the simplified structure.
- [x] **Update README or docs**: Document the new pattern for future developers.
- [x] **Commit changes**: Create a commit with a clear message describing the refactoring.

## Further Considerations

- **Fallback Option**: If direct store assignment breaks reactivity, revert to manual construction for affected stores.
- **Performance Check**: Monitor bundle size and runtime performance after changes.
- **Team Review**: Have another developer review the changes before merging.

## Success Criteria

- [ ] Code compiles without errors.
- [ ] All hooks work as expected.
- [ ] No breaking changes to public API.
- [ ] Reduced code duplication (target: ~200 lines less).
- [ ] Improved maintainability (changes to stores automatically propagate).

## Risks and Mitigations

- **Risk**: Type inference issues with `Pick`. **Mitigation**: Test thoroughly and use explicit types if needed.
- **Risk**: Reactivity breaks. **Mitigation**: Verify `useSyncExternalStore` compatibility.
- **Risk**: Performance regression. **Mitigation**: Profile before and after.

---

_Last Updated: December 12, 2025_</content>
<parameter name="filePath">c:\repos\ihodl\docs\refactor-implementation-plan.md
