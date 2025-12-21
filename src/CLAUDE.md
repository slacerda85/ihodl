# AI Coding Instructions for iHodl Bitcoin Wallet

## Architecture Overview

iHodl is a React Native Bitcoin wallet app using Expo framework. Core architecture follows a layered approach:

- **src/core/models**: TypeScript type definitions (e.g., `wallet.ts` defines Wallet interface)
- **src/core/services**: Business logic classes (e.g., `wallet.ts` handles wallet creation via WalletService)
- **src/core/repositories**: Data persistence (e.g., WalletRepository for storage)
- **src/core/lib**: Reusable utilities (e.g., crypto functions in `crypto.ts`)
- **src/ui**: React components, organized in `features/` for functionality-specific screens with dedicated stores
- **src/app**: Expo Router routes (e.g., `(tabs)` for tab navigation)

Frontend communicates with core ONLY through services. No direct repository access from UI.

## State Management

Uses centralized AppProvider aggregating feature stores with subscribers for reactive state:

- **Stores**: Each feature has a store (e.g., `walletStore`, `settingsStore`) with `subscribe`, `getSnapshot`, and `actions`
- **Reactivity**: Hooks use `useSyncExternalStore` for efficient re-renders (e.g., `useWallets()`, `useSettingsState()`)
- **Provider**: Single `AppProvider` at app root exposes all stores; no nested providers
- **Ephemeral State**: Reducer for transient state (auth, connections, loading/errors)

Reference: `src/ui/features/app-provider/AppProvider.tsx` for provider structure.

## Key Conventions

- **Casing**: camelCase for variables/functions (e.g., `minhaVariavel`, `calcularSaldo`), PascalCase for components/classes (e.g., `MinhaClasse`, `MeuComponente`), YELL_CASE for constants/enums (e.g., `MINHA_CONSTANTE`, `MEU_ENUM`), kebab-case for files/folders (e.g., `minha-pasta`, `meu-arquivo.tsx`). NEVER use snake_case anywhere in code; use ONLY kebab-case for filenames and folders.
- **Crypto**: No Node.js Buffer; use Uint8Arrays and DataViews exclusively
- **Imports**: Use `@/core/...` aliases for core modules
- **Error Handling**: Services handle errors; UI shows user-friendly messages

## Development Workflows

- **Linting**: `npm run lint` (ESLint on src/\*_/_.ts,tsx)
- **Testing**: `npm test` (Jest)
- **Development**: `npm run dev` (Expo start with development variant)
- **Build**: `expo prebuild --platform android` for native builds

## Bitcoin-Specific Patterns

- **BIP Support**: Implements BIP32/39/49/84 for HD wallets and addresses
- **Address Types**: P2PKH, P2SH, P2WPKH, P2TR support
- **Cold Wallets**: Offline mode for key generation
- **Lightning Network**: Partial integration via LN services (e.g., `ln-service.ts`)

## Dependencies

- **Crypto**: @noble/secp256k1, @noble/hashes for elliptic curve ops
- **Storage**: react-native-mmkv for encrypted local storage
- **Networking**: react-native-tcp-socket for Bitcoin RPC connections

## React Patterns

- **Functional Components with Hooks**: Use functional components exclusively; avoid class components. Follow Rules of Hooks strictly (no conditional calls, top-level only).
- **State Management**: Lift shared state to AppProvider; use reducers for complex updates (e.g., wallet actions). Employ custom hooks for reusable logic (e.g., `useWallets()` for reactive wallet data).
- **Performance**: Use `useMemo` for expensive computations (e.g., balance calculations); `React.memo` for stable components. Provide unique keys in lists (e.g., transaction IDs).
- **React 19 Features**: Leverage Actions for async operations (e.g., transaction sends); `useOptimistic` for instant UI feedback on wallet updates.
- **Pure Rendering**: Ensure components are pure; move side effects to `useEffect` or Actions. Avoid direct API calls in render.

Reference: `src/ui/features/app-provider/AppProvider.tsx` for state patterns, `src/ui/hooks/` for custom hooks.</content>
<parameter name="filePath">c:\repos\ihodl\.github\copilot-instructions.md
