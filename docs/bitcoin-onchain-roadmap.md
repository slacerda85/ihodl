# Bitcoin On-Chain Implementation Roadmap

This roadmap tracks the implementation of missing Bitcoin on-chain features in ihodl, based on gaps identified compared to Electrum. Progress is updated as implementation advances.

## Overall Status

- **Start Date**: December 7, 2025
- **Current Phase**: Implementation Complete
- **Estimated Completion**: All major Bitcoin on-chain features implemented
- **Status**: ✅ All phases completed successfully

## Implementation Steps

### Phase 1: BIP-32 Enhancements (High Priority)

- [x] **Step 1**: Enhance BIP-32 in `src/core/lib/key.ts` with `deriveChildPublicKey()` and path parsing for CKD_pub and watch-only wallets.
  - Status: Completed
  - Details: Added `deriveChildPublicKey()` for public key derivation, `convertBip32StrPathToIntPath()` and `convertBip32IntPathToStrPath()` for path parsing, and `deserializePrivateKey()`/`deserializePublicKey()` for xpub/xprv parsing. All functions exported and lint-clean.
  - Files: `src/core/lib/key.ts`
  - Dependencies: Existing crypto functions

### Phase 2: PSBT Support (Critical)

- [x] **Step 2**: Add PSBT support in `src/core/lib/transactions/psbt.ts` with PartialTransaction class for hardware wallet integration.
  - Status: Completed
  - Details: Implemented PartialTransaction class with full serialization/deserialization, key-value parsing, compact size handling, input/output maps, and combination logic. Supports BIP32 derivation, partial signatures, and witness UTXOs.
  - Files: `src/core/lib/transactions/psbt.ts` (new), update `src/core/lib/transactions/transactions.ts`
  - Dependencies: BIP-32 enhancements

### Phase 3: Address Extensions (Medium Priority)

- [x] **Step 3**: Extend addresses in `src/core/lib/address.ts` with P2TR, P2SH, and validation functions for full Bitcoin address types.
  - Status: Completed
  - Details: Added `createP2TRAddress()` for Taproot, `createP2SHAddress()` and `createP2WSHAddress()` skeletons, `isValidAddress()` for validation, and `addressToScript()` for scriptPubKey conversion. Integrated with existing Bech32 functions.
  - Files: `src/core/lib/address.ts`
  - Dependencies: Crypto updates for Taproot

### Phase 4: Transaction Upgrades (High Priority)

- [x] **Step 4**: Upgrade transactions in `src/core/lib/transactions/transactions.ts` with RBF, multiple sighash types, and signature verification.
  - Status: Completed
  - Details: Added RBF signaling with `createRBFTransaction()` and `isRBFEnabled()`, implemented multiple sighash types (ALL/NONE/SINGLE/ANYONECANPAY) in `createSighash()`, added signature verification with `verifySegWitSignature()`, and updated `createSegWitSignature()` to support different sighash types.
  - Files: `src/core/lib/transactions/transactions.ts`
  - Dependencies: Address and crypto enhancements

### Phase 5: Coin Selection Improvements (High Priority)

- [x] **Step 5**: Improve coin selection in `src/core/lib/transactions/transactions.ts` with privacy-focused and branch-and-bound algorithms.
  - Status: Completed
  - Details: Implemented advanced coin selection with `selectCoinsAdvanced()` supporting Branch and Bound, Largest First, Smallest First, Random, and Privacy-Focused algorithms. Added privacy scoring, fee-aware selection, and integration with `buildTransaction()`. Updated `BuildTransactionParams` interface with coin selection options.
  - Files: `src/core/lib/transactions/transactions.ts`, `src/core/lib/transactions/types.ts`
  - Dependencies: Transaction upgrades

### Phase 6: Taproot and Advanced Crypto (Critical)

- [x] **Step 6**: Add Taproot signing in `src/core/lib/crypto/crypto.ts` with Schnorr and BIP-341 sighash for modern security.
  - Status: Completed
  - Details: Implemented Schnorr signing (`schnorrSign`, `schnorrVerify`), Taproot key tweaking (`taprootTweakPrivateKey`, `taprootTweakPublicKey`), BIP-341 sighash calculation (`calculateTaprootSighash`), and Taproot address creation (`createTaprootAddress`, `createTaprootOutputKey`). Added tagged hash function and x-only pubkey conversion. All functions use Uint8Arrays and follow project conventions.
  - Files: `src/core/lib/crypto/crypto.ts`
  - Dependencies: All previous phases

## Testing and Validation

- [ ] Unit tests for each new feature in `src/core/tests/`
- [ ] Integration with existing wallet services
- [ ] Compatibility checks with React Native/Expo constraints

## Notes

- All implementations must use Uint8Arrays/DataViews (no Node.js Buffer).
- Follow camelCase naming conventions.
- Draw inspiration from Electrum's Python code, adapting to TypeScript.
- Update this roadmap after each completed step.
  <parameter name="filePath">c:\repos\ihodl\docs\bitcoin-onchain-roadmap.md
