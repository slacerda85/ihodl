# Mapeamento de Modelos e Repositórios - ihodl

Este documento define a estrutura de dados persistidos na aplicação ihodl, mapeando todos os repositórios, seus modelos e relacionamentos para facilitar consultas, extensões e manutenção.

---

## Sumário

1. [Visão Geral da Arquitetura](#visão-geral-da-arquitetura)
2. [Camada de Persistência](#camada-de-persistência)
3. [Repositórios On-Chain](#repositórios-on-chain)
   - [WalletRepository](#walletrepository)
   - [SeedRepository](#seedrepository)
   - [AddressRepository](#addressrepository)
   - [TransactionRepository](#transactionrepository)
   - [ElectrumRepository](#electrumrepository)
4. [Repositórios Lightning](#repositórios-lightning)
   - [LightningRepository](#lightningrepository)
5. [Diagrama de Relacionamentos](#diagrama-de-relacionamentos)
6. [Extensões Futuras Sugeridas](#extensões-futuras-sugeridas)

---

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         SERVICES                                 │
│  (WalletService, TransactionService, LightningService, etc.)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       REPOSITORIES                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │   Wallet    │ │    Seed     │ │   Address   │ │ Transaction ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘│
│  ┌─────────────┐ ┌─────────────┐                                 │
│  │  Electrum   │ │  Lightning  │                                 │
│  └─────────────┘ └─────────────┘                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MMKV STORAGE                                 │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐       │
│  │ wallet-storage │ │  seed-storage  │ │address-storage │       │
│  │   (plaintext)  │ │  (encrypted)   │ │  (plaintext)   │       │
│  └────────────────┘ └────────────────┘ └────────────────┘       │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐       │
│  │ transaction-   │ │electrum-storage│ │lightning-storage│       │
│  │   storage      │ │  (plaintext)   │ │  (encrypted)   │       │
│  └────────────────┘ └────────────────┘ └────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Camada de Persistência

### Tecnologia: MMKV

Todos os repositórios utilizam **react-native-mmkv** para persistência local de alta performance.

| Storage ID            | Criptografado | Conteúdo                   |
| --------------------- | ------------- | -------------------------- |
| `wallet-storage`      | ❌ Não        | Metadados de carteiras     |
| `seed-storage`        | ✅ Sim        | Seeds/mnemônicos           |
| `address-storage`     | ❌ Não        | Endereços derivados        |
| `transaction-storage` | ❌ Não        | Transações pendentes       |
| `electrum-storage`    | ❌ Não        | Peers e conexões           |
| `lightning-storage`   | ✅ Sim        | Canais, chaves, pagamentos |

---

## Repositórios On-Chain

### WalletRepository

**Arquivo:** `src/core/repositories/wallet.ts`  
**Storage ID:** `wallet-storage`  
**Criptografia:** Não

#### Modelo Principal: `Wallet`

```typescript
interface Wallet {
  id: string // UUID da carteira
  name: string // Nome definido pelo usuário
  cold: boolean // Se é cold wallet (watch-only)
}
```

#### Chaves de Storage

| Chave              | Tipo        | Descrição            |
| ------------------ | ----------- | -------------------- |
| `wallet_{id}`      | JSON string | Dados da carteira    |
| `active_wallet_id` | string      | ID da carteira ativa |

#### Interface

```typescript
interface WalletRepositoryInterface {
  save(wallet: Wallet): void
  findById(id: string): Wallet | null
  findAll(): Wallet[]
  findAllIds(): string[]
  delete(id: string): void
  setActiveWalletId(id?: string): void
  getActiveWalletId(): string | undefined
  clear(): void
}
```

#### Relacionamentos

```
Wallet (1) ──────► (1) Seed
Wallet (1) ──────► (1) AddressCollection
Wallet (1) ──────► (N) Tx (pending)
```

---

### SeedRepository

**Arquivo:** `src/core/repositories/seed.ts`  
**Storage ID:** `seed-storage`  
**Criptografia:** ✅ Sim (MMKV encryption + opcional AES por senha)

#### Modelo Principal: `string` (mnemonic)

O seed é armazenado como string (mnemônico de 12/24 palavras), opcionalmente criptografado com senha do usuário.

#### Chaves de Storage

| Chave             | Tipo   | Descrição                   |
| ----------------- | ------ | --------------------------- |
| `seed_{walletId}` | string | Seed criptografado ou plain |

#### Interface

```typescript
interface SeedRepositoryInterface {
  save(walletId: string, seed: string, password?: string): void
  find(walletId: string, password?: string): string | null
  delete(walletId: string): void
  clear(): void
}
```

#### Segurança

- Storage base já criptografado com chave fixa
- Criptografia adicional opcional via `encryptSeed(password, seed)`
- **TODO:** Derivar chave de criptografia da senha do usuário

---

### AddressRepository

**Arquivo:** `src/core/repositories/address.ts`  
**Storage ID:** `address-storage`  
**Criptografia:** Não

#### Modelo Principal: `AddressCollection`

```typescript
interface AddressCollection {
  walletId: string // FK para Wallet
  addresses: AddressDetails[] // Lista de endereços
  nextReceiveIndex: number // Próximo índice de recebimento
  nextChangeIndex: number // Próximo índice de troco
  gapLimit: number // Gap limit (default: 20)
}

interface AddressDetails {
  derivationPath: DerivationPath
  address: string // Endereço bech32
  txs: Tx[] // Transações associadas
}

interface DerivationPath {
  purpose: Purpose // BIP44/49/84/86
  coinType: CoinType // Bitcoin/Testnet
  accountIndex: AccountIndex // Índice da conta
  change: Change // 0=receiving, 1=change
  addressIndex: number // Índice do endereço
}
```

#### Enums de Suporte

```typescript
enum Purpose {
  BIP44 = 0x8000002c  // Legacy P2PKH
  BIP49 = 0x80000031  // Nested SegWit P2SH-P2WPKH
  BIP84 = 0x80000054  // Native SegWit P2WPKH
  BIP86 = 0x80000056  // Taproot P2TR
}

enum CoinType {
  Bitcoin = 0x80000000
  Testnet = 0x80000001
}

enum Change {
  Receiving = 0
  Change = 1
}

const GAP_LIMIT = 20
```

#### Chaves de Storage

| Chave                | Tipo        | Descrição                  |
| -------------------- | ----------- | -------------------------- |
| `address_{walletId}` | JSON string | AddressCollection completa |

#### Interface

```typescript
interface AddressRepositoryInterface {
  save(addressCollection: AddressCollection): void
  read(walletId: string): AddressCollection | null
  deleteByWalletId(walletId: string): void
}
```

---

### TransactionRepository

**Arquivo:** `src/core/repositories/transactions.ts`  
**Storage ID:** `transaction-storage`  
**Criptografia:** Não

#### Modelo Principal: `Tx`

```typescript
interface Tx {
  in_active_chain: boolean
  hex: string // Raw transaction hex
  txid: string // Transaction ID
  hash: string // Witness hash (wtxid)
  size: number // Tamanho em bytes
  vsize: number // Virtual size (weight/4)
  weight: number // Weight units
  version: number // Transaction version
  locktime: number // nLockTime
  vin: Vin[] // Inputs
  vout: Vout[] // Outputs
  blockhash: string // Hash do bloco
  confirmations?: number // Número de confirmações
  blocktime: number // Timestamp do bloco
  time: number // Transaction time
  height?: number // Block height
  proof?: MerkleProof // SPV proof
}

interface Vin {
  txid: string // Previous output txid
  vout: number // Previous output index
  scriptSig: { asm: string; hex: string }
  sequence: number // nSequence
  txinwitness?: string[] // Witness data
}

interface Vout {
  value: number // Valor em BTC
  n: number // Output index
  scriptPubKey: ScriptPubKey
}

interface ScriptPubKey {
  asm: string // Script assembly
  hex: string // Script hex
  reqSigs: number // Required signatures
  type: string // Script type (p2wpkh, etc)
  address: string // Endereço derivado
  addresses?: string[] // Endereços múltiplos (multisig)
}

interface MerkleProof {
  merkle: string[] // Merkle path
  pos: number // Position in tree
}
```

#### Modelos Auxiliares

```typescript
interface Utxo {
  txid: string
  vout: number
  address: string
  scriptPubKey: ScriptPubKey
  amount: number // Valor em BTC
  confirmations: number
  blocktime: number
  isSpent: boolean
}

interface FriendlyTx {
  txid: string
  date: string
  type: 'received' | 'sent' | 'self'
  fromAddress: string
  toAddress: string
  amount: number
  status: 'pending' | 'processing' | 'confirmed' | 'unknown'
  fee: number | null
  confirmations: number
}
```

#### Chaves de Storage

| Chave                             | Tipo        | Descrição             |
| --------------------------------- | ----------- | --------------------- |
| `pending_transactions_{walletId}` | JSON string | Array de Tx pendentes |

#### Interface

```typescript
interface TransactionRepositoryInterface {
  savePendingTransaction(walletId: string, tx: Tx): void
  readPendingTransactions(walletId: string): Tx[]
  deletePendingTransaction(walletId: string, txid: string): void
}
```

---

### ElectrumRepository

**Arquivo:** `src/core/repositories/electrum.ts`  
**Storage ID:** `electrum-storage`  
**Criptografia:** Não

#### Modelos

```typescript
// Peer descoberto via network
type ElectrumPeer = [string, string, string[]]
// [ip, hostname, features[]]

// Opções de conexão
interface ElectrumConnectionOptions {
  host: string
  port: number
  rejectUnauthorized?: boolean
}

// Peer persistido com metadados
interface PersistedElectrumPeer {
  host: string
  port: number
  lastConnected?: number // Timestamp
  lastHeight?: number // Block height reportado
  failureCount?: number // Contador de falhas
}
```

#### Chaves de Storage

| Chave               | Tipo        | Descrição                           |
| ------------------- | ----------- | ----------------------------------- |
| `trustedPeers`      | JSON string | Array de ElectrumPeer               |
| `lastPeerUpdate`    | number      | Timestamp da última atualização     |
| `lastConnectedPeer` | JSON string | PersistedElectrumPeer               |
| `peerStats`         | JSON string | Record<host, PersistedElectrumPeer> |

#### Interface

```typescript
interface ElectrumRepositoryInterface {
  // Trusted Peers
  saveTrustedPeers(peers: ElectrumPeer[]): void
  getTrustedPeers(): ElectrumPeer[]
  clearTrustedPeers(): void

  // Last Peer Update
  setLastPeerUpdate(timestamp: number): void
  getLastPeerUpdate(): number | null

  // Last Connected Peer
  setLastConnectedPeer(peer: PersistedElectrumPeer): void
  getLastConnectedPeer(): PersistedElectrumPeer | null

  // Peer Statistics
  savePeerStats(host: string, stats: PersistedElectrumPeer): void
  getPeerStats(host: string): PersistedElectrumPeer | null
  getAllPeerStats(): Record<string, PersistedElectrumPeer>
  clearPeerStats(): void

  // Utility
  clearAll(): void
  peersToConnectionOptions(peers: ElectrumPeer[]): ElectrumConnectionOptions[]
}
```

---

## Repositórios Lightning

### LightningRepository

**Arquivo:** `src/core/repositories/lightning.ts`  
**Storage ID:** `lightning-storage`  
**Criptografia:** ✅ Sim

Este é o repositório mais complexo, gerenciando todo o estado do nó Lightning.

#### Modelos de Canais

```typescript
interface PersistedChannel {
  channelId: string // Identificador único
  nodeId: string // Node ID do peer (FK para PersistedPeer)
  state: string // Estado do canal
  fundingTxid?: string // Funding transaction ID
  fundingOutputIndex?: number // Output index no funding tx
  localBalance: string // Saldo local (string para precisão)
  remoteBalance: string // Saldo remoto
  localConfig: any // Configuração local
  remoteConfig: any // Configuração remota
  createdAt?: number // Timestamp de criação
  lastActivity?: number // Última atividade
}
```

#### Modelos de Peers

```typescript
interface PersistedPeer {
  nodeId: string // Node ID (33 bytes hex)
  host: string // IP ou hostname
  port: number // Porta
  pubkey: string // Public key
  lastConnected?: number // Timestamp
  features?: string // Feature bits
}
```

#### Modelos de Pagamentos

```typescript
interface PersistedPreimage {
  paymentHash: string // SHA256 hash
  preimage: string // Preimage (32 bytes hex)
  createdAt: number
}

interface PersistedPaymentInfo {
  paymentHash: string // Chave primária
  amountMsat?: string // Valor em millisatoshis
  direction: 'sent' | 'received'
  status: string // pending, complete, failed
  expiryDelay?: number // CLTV delta
  createdAt: number
}

interface PersistedInvoice {
  paymentHash: string // Chave primária
  bolt11: string // Invoice codificada
  amountMsat?: string
  description: string
  expiry: number // Segundos até expirar
  createdAt: number
}
```

#### Modelos de Routing

```typescript
interface RoutingNode {
  nodeId: string // Chave primária
  features: string // Feature bits
  addresses: { host: string; port: number }[]
  lastUpdate: number
}

interface RoutingChannel {
  shortChannelId: string // Chave primária (block:tx:output)
  node1: string // Node ID 1
  node2: string // Node ID 2
  capacity: string // Capacidade do canal
  feeBaseMsat: number // Fee base
  feeProportionalMillionths: number // Fee proporcional (ppm)
  cltvDelta: number // CLTV delta
  lastUpdate: number
}
```

#### Modelos de Watchtower

```typescript
interface PersistedWatchtowerChannel {
  channelId: string
  fundingTxid: string
  fundingOutputIndex: number
  remotePubkey: string
  localPubkey: string
  localBalance: string
  remoteBalance: string
  capacity: string
  currentCommitmentNumber: string
  revokedCommitments: PersistedRevokedCommitment[]
  lastChecked: number
  status: string
}

interface PersistedRevokedCommitment {
  commitmentNumber: string
  commitmentTxid: string
  revocationKey: string
  localDelayedPubkey: string
  toSelfDelay: number
  amount: string
  createdAt: number
}

interface PersistedWatchtowerStats {
  breachesDetected: number
  penaltiesBroadcast: number
  lastCheck: number
}
```

#### Modelos de Backup

```typescript
interface ChannelBackupData {
  version: number
  channelId: string
  nodeId: string
  fundingTxid: string
  fundingOutputIndex: number
  localBalance: string
  remoteBalance: string
  channelSeed: string
  peerHost: string
  peerPort: number
  createdAt: number
}

interface FullBackup {
  version: number
  createdAt: number
  nodePrivkey?: string
  channels: ChannelBackupData[]
}

interface RestoreContext {
  channelId: string
  state: RestoreState
  backup: ChannelBackupData
  lastAttempt: number
  attempts: number
  error?: string
}

enum RestoreState {
  PENDING = 'pending'
  CONNECTING = 'connecting'
  NEGOTIATING = 'negotiating'
  COMPLETE = 'complete'
  FAILED = 'failed'
}
```

#### Chaves de Storage

| Chave                 | Tipo         | Descrição                                     |
| --------------------- | ------------ | --------------------------------------------- |
| `channels`            | JSON string  | Record<channelId, PersistedChannel>           |
| `peers`               | JSON string  | Record<nodeId, PersistedPeer>                 |
| `preimages`           | JSON string  | Record<paymentHash, PersistedPreimage>        |
| `node_key`            | string (hex) | Chave privada do nó                           |
| `channel_seeds`       | JSON string  | Record<channelId, seedHex>                    |
| `payment_info`        | JSON string  | Record<paymentHash, PersistedPaymentInfo>     |
| `invoices`            | JSON string  | Record<paymentHash, PersistedInvoice>         |
| `routing_graph`       | JSON string  | { nodes: Record, channels: Record }           |
| `watchtower_channels` | JSON string  | Record<channelId, PersistedWatchtowerChannel> |
| `watchtower_stats`    | JSON string  | PersistedWatchtowerStats                      |
| `channel_backups`     | JSON string  | Record<channelId, ChannelBackupData>          |
| `restore_contexts`    | JSON string  | Record<channelId, RestoreContext>             |
| `last_backup_time`    | string       | Timestamp do último backup                    |

#### Interface Completa

```typescript
interface LightningRepositoryInterface {
  // Channels
  saveChannel(channel: PersistedChannel): void
  findChannelById(channelId: string): PersistedChannel | null
  findAllChannels(): Record<string, PersistedChannel>
  deleteChannel(channelId: string): void

  // Peers
  savePeer(peer: PersistedPeer): void
  findPeerById(nodeId: string): PersistedPeer | null
  findAllPeers(): Record<string, PersistedPeer>
  deletePeer(nodeId: string): void

  // Preimages
  savePreimage(preimage: PersistedPreimage): void
  findPreimageByHash(paymentHash: string): PersistedPreimage | null
  findAllPreimages(): Record<string, PersistedPreimage>
  deletePreimage(paymentHash: string): void

  // Payment Info
  savePaymentInfo(info: PersistedPaymentInfo): void
  findPaymentInfoByHash(paymentHash: string): PersistedPaymentInfo | null
  findAllPaymentInfos(): Record<string, PersistedPaymentInfo>

  // Invoices
  saveInvoice(invoice: PersistedInvoice): void
  findInvoiceByHash(paymentHash: string): PersistedInvoice | null
  findAllInvoices(): Record<string, PersistedInvoice>

  // Node Key
  saveNodeKey(nodeKey: Uint8Array): void
  getNodeKey(): Uint8Array | null

  // Channel Seeds
  saveChannelSeed(channelId: string, seed: Uint8Array): void
  getChannelSeed(channelId: string): Uint8Array | null
  getAllChannelSeeds(): Record<string, string>

  // Routing Graph
  saveRoutingNode(node: RoutingNode): void
  saveRoutingChannel(channel: RoutingChannel): void
  getRoutingGraph(): { nodes: Record; channels: Record }

  // Watchtower
  saveWatchtowerChannel(channelId: string, data: PersistedWatchtowerChannel): void
  getWatchtowerChannel(channelId: string): PersistedWatchtowerChannel | null
  getWatchtowerChannels(): Record<string, PersistedWatchtowerChannel>
  deleteWatchtowerChannel(channelId: string): void
  saveWatchtowerStats(stats: PersistedWatchtowerStats): void
  getWatchtowerStats(): PersistedWatchtowerStats | null
  clearWatchtowerData(): void

  // Backup & Restore
  saveChannelBackup(channelId: string, backup: ChannelBackupData): void
  getChannelBackup(channelId: string): ChannelBackupData | null
  getAllChannelBackups(): Record<string, ChannelBackupData>
  deleteChannelBackup(channelId: string): void
  createFullBackup(): FullBackup
  exportEncryptedBackup(password: string): string
  importEncryptedBackup(data: string, password: string): FullBackup
  saveRestoreContext(channelId: string, context: RestoreContext): void
  getRestoreContext(channelId: string): RestoreContext | null
  getAllRestoreContexts(): Record<string, RestoreContext>
  startBackupRestore(backup: FullBackup): RestoreContext[]
  updateRestoreState(channelId: string, state: RestoreState, error?: string): void
  updateLastBackupTime(): void
  getLastBackupTime(): number | null
  clearRestoreData(): void

  // Utility
  clearAll(): void
  exportData(): string
  importData(data: string): void
}
```

---

## Diagrama de Relacionamentos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ON-CHAIN                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐          ┌──────────────┐          ┌──────────────┐      │
│   │    Wallet    │◄────────►│     Seed     │          │   Electrum   │      │
│   │              │    1:1   │  (encrypted) │          │    Peers     │      │
│   └──────┬───────┘          └──────────────┘          └──────────────┘      │
│          │                                                                   │
│          │ 1:1                                                               │
│          ▼                                                                   │
│   ┌──────────────────────┐                                                   │
│   │  AddressCollection   │                                                   │
│   │  - nextReceiveIndex  │                                                   │
│   │  - nextChangeIndex   │                                                   │
│   │  - gapLimit          │                                                   │
│   └──────────┬───────────┘                                                   │
│              │ 1:N                                                           │
│              ▼                                                               │
│   ┌──────────────────────┐          ┌──────────────────────┐                │
│   │   AddressDetails     │◄────────►│         Tx           │                │
│   │   - derivationPath   │   N:M    │   - vin[], vout[]    │                │
│   │   - address          │          │   - MerkleProof      │                │
│   └──────────────────────┘          └──────────┬───────────┘                │
│                                                 │                            │
│                                                 │ derived                    │
│                                                 ▼                            │
│                                     ┌──────────────────────┐                │
│                                     │        Utxo          │                │
│                                     │   - amount           │                │
│                                     │   - isSpent          │                │
│                                     └──────────────────────┘                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                             LIGHTNING                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐                              ┌──────────────┐            │
│   │   NodeKey    │                              │ RoutingGraph │            │
│   │  (encrypted) │                              │  - nodes     │            │
│   └──────┬───────┘                              │  - channels  │            │
│          │                                      └──────────────┘            │
│          │ derives                                                           │
│          ▼                                                                   │
│   ┌──────────────┐          ┌──────────────┐                                │
│   │ ChannelSeed  │◄────────►│   Channel    │                                │
│   │  (per chan)  │   1:1    │   - state    │                                │
│   └──────────────┘          │   - balances │                                │
│                             └──────┬───────┘                                │
│                                    │                                         │
│          ┌─────────────────────────┼─────────────────────────┐              │
│          │                         │                         │              │
│          ▼                         ▼                         ▼              │
│   ┌──────────────┐          ┌──────────────┐          ┌──────────────┐      │
│   │     Peer     │          │   Backup     │          │  Watchtower  │      │
│   │  - host:port │          │   Context    │          │   Channel    │      │
│   │  - features  │          └──────────────┘          └──────────────┘      │
│   └──────────────┘                                                          │
│                                                                              │
│   ┌──────────────┐          ┌──────────────┐          ┌──────────────┐      │
│   │   Invoice    │◄────────►│ PaymentInfo  │◄────────►│   Preimage   │      │
│   │   - bolt11   │   hash   │  - direction │   hash   │  - secret    │      │
│   │   - expiry   │          │  - status    │          └──────────────┘      │
│   └──────────────┘          └──────────────┘                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Extensões Futuras Sugeridas

### 1. Modelos para PSBT

```typescript
interface PersistedPSBT {
  id: string // UUID
  walletId: string
  psbtBase64: string // PSBT serializado
  status: 'unsigned' | 'partial' | 'complete' | 'broadcast'
  createdAt: number
  updatedAt: number
  description?: string
  signers: PSBTSigner[]
}

interface PSBTSigner {
  fingerprint: string // Root fingerprint
  hasSigned: boolean
  signedAt?: number
}
```

### 2. Modelos para Descriptors

```typescript
interface PersistedDescriptor {
  walletId: string
  descriptor: string // Descriptor string com checksum
  type: 'wpkh' | 'wsh' | 'tr' | 'sh' // Tipo de script
  isInternal: boolean // Change ou receiving
  rangeStart: number
  rangeEnd: number
  createdAt: number
}
```

### 3. Modelos para KeyOriginInfo

```typescript
interface PersistedKeyOrigin {
  walletId: string
  fingerprint: string // 4 bytes hex
  derivationPath: string // "m/84'/0'/0'"
  xpub: string // Extended public key
}
```

### 4. Modelos para Hardware Wallet

```typescript
interface PersistedHWDevice {
  id: string
  name: string
  type: 'ledger' | 'trezor' | 'coldcard'
  fingerprint: string
  lastConnected: number
}
```

### 5. Modelos para Coin Selection Preferences

```typescript
interface CoinSelectionPrefs {
  walletId: string
  algorithm: 'largest' | 'smallest' | 'random' | 'privacy'
  dustThreshold: number
  targetConfirmations: number
  avoidAddressReuse: boolean
}
```

### 6. Modelos para Fee Estimation Cache

```typescript
interface FeeEstimateCache {
  timestamp: number
  estimates: {
    fastestFee: number // sat/vB
    halfHourFee: number
    hourFee: number
    economyFee: number
    minimumFee: number
  }
}
```

### 7. Modelos para Labels (BIP-329)

```typescript
interface AddressLabel {
  address: string
  label: string
  type: 'addr'
  origin?: string // Descriptor or derivation path
}

interface TxLabel {
  txid: string
  label: string
  type: 'tx'
}

interface OutputLabel {
  outpoint: string // txid:vout
  label: string
  type: 'output'
  spendable: boolean
}
```

---

## Checklist de Implementação

### Prioridade Alta

- [ ] Adicionar modelo PSBT ao TransactionRepository
- [ ] Adicionar modelo Descriptor ao AddressRepository
- [ ] Adicionar modelo KeyOriginInfo ao WalletRepository
- [ ] Implementar FeeEstimateCache no ElectrumRepository

### Prioridade Média

- [ ] Adicionar Labels (BIP-329)
- [ ] Adicionar CoinSelectionPrefs
- [ ] Melhorar criptografia do SeedRepository

### Prioridade Baixa

- [ ] Suporte a Hardware Wallet
- [ ] Export/Import completo (BIP-329 compatible)
