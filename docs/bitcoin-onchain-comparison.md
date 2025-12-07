# Análise Comparativa: ihodl vs Electrum - Funcionalidades Bitcoin On-Chain

Este documento apresenta uma análise comparativa entre a implementação de funcionalidades Bitcoin on-chain do projeto **ihodl** e do projeto **Electrum**, organizando as funcionalidades por etapas do protocolo Bitcoin.

**Última atualização:** Dezembro 2025

---

## Sumário

1. [Visão Geral](#visão-geral)
2. [Etapa 1: Geração de Entropia e Mnemônicos (BIP-39)](#etapa-1-geração-de-entropia-e-mnemônicos-bip-39)
3. [Etapa 2: Derivação de Chaves Hierárquicas (BIP-32/BIP-44/BIP-84)](#etapa-2-derivação-de-chaves-hierárquicas-bip-32bip-44bip-84)
4. [Etapa 3: Geração de Endereços](#etapa-3-geração-de-endereços)
5. [Etapa 4: Construção de Transações](#etapa-4-construção-de-transações)
6. [Etapa 5: Seleção de UTXOs (Coin Selection)](#etapa-5-seleção-de-utxos-coin-selection)
7. [Etapa 6: Assinatura de Transações](#etapa-6-assinatura-de-transações)
8. [Etapa 7: Serialização e Broadcast](#etapa-7-serialização-e-broadcast)
9. [Etapa 8: PSBT (Partially Signed Bitcoin Transactions)](#etapa-8-psbt-partially-signed-bitcoin-transactions)
10. [Etapa 9: Descriptors](#etapa-9-descriptors)
11. [Etapa 10: Funcionalidades Auxiliares](#etapa-10-funcionalidades-auxiliares)
12. [Resumo de Gaps e Recomendações](#resumo-de-gaps-e-recomendações)

---

## Visão Geral

### ihodl

O projeto ihodl é um aplicativo React Native/Expo de carteira Bitcoin com foco em simplicidade. A implementação on-chain está concentrada em:

- `src/core/lib/key.ts` - Gerenciamento de chaves
- `src/core/lib/address.ts` - Geração de endereços
- `src/core/lib/transactions/transactions.ts` - Construção e assinatura de transações
- `src/core/lib/transactions/utxo.ts` - Gerenciamento de UTXOs
- `src/core/lib/transactions/psbt.ts` - PSBT (Partially Signed Bitcoin Transactions)
- `src/core/lib/bips/bip39.ts` - Mnemônicos BIP-39
- `src/core/lib/crypto/` - Funções criptográficas

### Electrum

O Electrum é uma carteira Bitcoin madura e completa com implementação extensiva:

- `electrum/bip32.py` - Derivação de chaves BIP-32
- `electrum/bitcoin.py` - Funções Bitcoin core
- `electrum/transaction.py` - Transações completas incluindo PSBT
- `electrum/coinchooser.py` - Seleção sofisticada de UTXOs
- `electrum/descriptor.py` - Output Script Descriptors
- `electrum/mnemonic.py` - Sistema próprio de mnemônicos + BIP-39
- `electrum/crypto.py` - Criptografia avançada
- `electrum/keystore.py` - Gerenciamento de keystores

---

## Etapa 1: Geração de Entropia e Mnemônicos (BIP-39)

### ihodl ✅

**Implementação atual:**

```typescript
// bip39.ts
export function mnemonicToSeedSync(mnemonic: string, password?: string): Uint8Array {
  const mnemonicBuffer = stringToUint8Array(normalize(mnemonic))
  const saltBuffer = stringToUint8Array(salt(normalize(password)))
  return pbkdf2(sha512, mnemonicBuffer, saltBuffer, { c: 2048, dkLen: 64 })
}

export function entropyToMnemonic(entropyStr: string, wordlist?: string[]): string
export function mnemonicToEntropy(mnemonic: string, wordlist?: string[]): string
export function validateMnemonic(mnemonic: string, wordlist?: string[]): boolean
```

**Funcionalidades:**

- ✅ Geração de entropia
- ✅ Entropia para mnemônico
- ✅ Mnemônico para seed (PBKDF2)
- ✅ Validação de mnemônico
- ✅ Suporte a password/passphrase
- ✅ Normalização NFKD

### Electrum ⭐

**Funcionalidades adicionais:**

```python
# mnemonic.py
class Mnemonic:
    @classmethod
    def mnemonic_to_seed(cls, mnemonic: str, *, passphrase: Optional[str]) -> bytes:
        # Usa salt "electrum" em vez de "mnemonic" (padrão Electrum)
        return hashlib.pbkdf2_hmac('sha512', mnemonic.encode(),
                                    b'electrum' + passphrase.encode(), 2048)

    def make_seed(self, *, seed_type: str, num_bits: int = 132) -> str:
        # Geração com tipo de seed embutido no checksum

    def check_seed(self, seed: str, custom_entropy: int = 0) -> bool:
        # Validação do tipo de seed via checksum
```

**Funcionalidades:**

- ✅ Tudo do ihodl
- ✅ Sistema próprio de seed com tipo embutido (segwit, standard, 2fa)
- ✅ Suporte a múltiplos idiomas (en, es, ja, pt, zh)
- ✅ Normalização CJK avançada
- ✅ Recuperação de seeds de outras carteiras (bip39_recovery.py)
- ✅ SLIP-39 (Shamir Backup)

### 🔴 Gaps Identificados

| Funcionalidade                         | ihodl | Electrum          | Prioridade |
| -------------------------------------- | ----- | ----------------- | ---------- |
| Múltiplos idiomas de wordlist          | ❌    | ✅                | Baixa      |
| Recuperação BIP-39 de outras carteiras | ❌    | ✅                | Média      |
| SLIP-39 (Shamir Backup)                | ❌    | ✅                | Baixa      |
| Seed type encoding                     | ❌    | ✅ (proprietário) | Baixa      |

---

## Etapa 2: Derivação de Chaves Hierárquicas (BIP-32/BIP-44/BIP-84)

### ihodl ✅

**Implementação atual:**

```typescript
// key.ts
function createMasterKey(seed: Uint8Array): Uint8Array {
  return hmacSeed(seed) // HMAC-SHA512 com "Bitcoin seed"
}

function deriveChildKey(extendedKey: Uint8Array, index: number): Uint8Array {
  const isHardened = index >= 0x80000000
  // ... derivação CKD_priv implementada
}

function serializePrivateKey(extendedKey, depth, parentFingerprint, childIndex, version): Uint8Array
function serializePublicKey(
  publicKey,
  chainCode,
  depth,
  parentFingerprint,
  childIndex,
  version,
): Uint8Array

const KEY_VERSIONS = {
  bip32: { mainnet: { private: xprv, public: xpub } },
  bip49: { mainnet: { private: yprv, public: ypub } },
  bip84: { mainnet: { private: zprv, public: zpub } },
  // testnet/regtest também
}
```

**Funcionalidades:**

- ✅ Criação de master key
- ✅ Derivação hardened e non-hardened
- ✅ Serialização xprv/xpub/zprv/zpub
- ✅ Fingerprint do parent
- ✅ Suporte BIP-32/44/49/84 via versões
- ✅ Parsing de path string ("m/84'/0'/0'")
- ✅ Derivação pública (CKD_pub)
- ✅ Deserialização xpub/xprv
- ✅ KeyOriginInfo para PSBT

### Electrum ⭐

**Funcionalidades adicionais:**

```python
# bip32.py
class BIP32Node(NamedTuple):
    @classmethod
    def from_xkey(cls, xkey: str) -> 'BIP32Node':
        # Deserialização completa de xpub/xprv

    @classmethod
    def from_rootseed(cls, seed: bytes, *, xtype: str) -> 'BIP32Node':
        # Criação a partir de seed

    def subkey_at_private_derivation(self, path: str) -> 'BIP32Node':
        # Derivação por path string "m/84'/0'/0'"

    def subkey_at_public_derivation(self, path: str) -> 'BIP32Node':
        # Derivação pública apenas

def convert_bip32_strpath_to_intpath(n: str) -> List[int]:
    # "m/84'/0'/0'" -> [0x80000054, 0x80000000, 0x80000000]

def convert_bip32_intpath_to_strpath(path: Sequence[int]) -> str:
    # Conversão inversa

class KeyOriginInfo:
    # Informação de origem da chave para PSBT
    fingerprint: bytes
    path: Sequence[int]
```

**Funcionalidades:**

- ✅ Tudo do ihodl
- ✅ Parsing de path string ("m/84'/0'/0'")
- ✅ Derivação pública (CKD_pub) - watch-only wallets
- ✅ Deserialização de xpub/xprv
- ✅ KeyOriginInfo para PSBT
- ✅ Validação de consistência xkey com origin info
- ✅ Proteção contra pontos EC inválidos

### 🔴 Gaps Identificados

| Funcionalidade                      | ihodl | Electrum | Prioridade |
| ----------------------------------- | ----- | -------- | ---------- |
| Watch-only wallets                  | ❌    | ✅       | Média      |
| Proteção contra pontos EC inválidos | ❌    | ✅       | Baixa      |

---

## Etapa 3: Geração de Endereços

### ihodl ✅

**Implementação atual:**

```typescript
// address.ts
function createAddress(publicKey: Uint8Array, version: number = 0): string {
  const hash = hash160(publicKey)
  const programWords = bech32.toWords(hash)
  return bech32.encode('bc', [version, ...programWords])
}

function fromBech32(bech32Address: string): Bech32Result {
  // Decodificação Bech32
}

function toBech32(publicKeyHash: Uint8Array, version: number, prefix: string): string {
  // Codificação Bech32/Bech32m
}

function toScriptHash(address: string): string {
  // Electrum script hash para lookup
}

function createP2WPKHScript(pubkey: Uint8Array): Uint8Array {
  // OP_0 <20-byte-hash>
}
```

**Tipos suportados:**

- ✅ P2WPKH (bc1q...) - Bech32
- ✅ P2TR (bc1p...) - Bech32m
- ✅ P2PKH (1...) - Base58 (parcial)

### Electrum ⭐

**Funcionalidades adicionais:**

```python
# bitcoin.py
def hash160_to_p2pkh(h160: bytes) -> str  # Legacy P2PKH (1...)
def hash160_to_p2sh(h160: bytes) -> str   # P2SH (3...)
def public_key_to_p2wpkh(pubkey: bytes) -> str  # Native SegWit (bc1q...)
def script_to_p2wsh(script: bytes) -> str      # P2WSH (bc1q... 62 chars)
def pubkey_to_address(txin_type: str, pubkey: str) -> str

def address_to_script(addr: str) -> bytes      # Endereço -> scriptPubKey
def address_to_payload(addr: str) -> Tuple[OnchainOutputType, bytes]

class OnchainOutputType(Enum):
    P2PKH, P2SH, WITVER0_P2WPKH, WITVER0_P2WSH, WITVER1_P2TR

def is_address(addr: str) -> bool
def is_segwit_address(addr: str) -> bool
def is_taproot_address(addr: str) -> bool
def is_b58_address(addr: str) -> bool
```

**Tipos suportados:**

- ✅ P2PKH (1...)
- ✅ P2SH (3...)
- ✅ P2SH-P2WPKH (3...)
- ✅ P2WPKH (bc1q...)
- ✅ P2WSH (bc1q...)
- ✅ P2TR (bc1p...)

### 🔴 Gaps Identificados

| Funcionalidade        | ihodl        | Electrum | Prioridade |
| --------------------- | ------------ | -------- | ---------- |
| P2PKH (legacy)        | ❌           | ✅       | Baixa      |
| P2SH                  | ❌           | ✅       | Média      |
| P2SH-P2WPKH           | ❌           | ✅       | Média      |
| P2WSH (multisig)      | ❌           | ✅       | Média      |
| address_to_script()   | ✅ (parcial) | ✅       | -          |
| Validação de endereço | ❌           | ✅       | Alta       |

---

## Etapa 4: Construção de Transações

### ihodl ✅

**Implementação atual:**

```typescript
// transactions.ts
interface SimpleTransaction {
  version: number
  inputs: { txid: string; vout: number; scriptSig: Uint8Array; sequence: number }[]
  outputs: { value: number; scriptPubKey: Uint8Array }[]
  locktime: number
  witnesses: Uint8Array[][]
}

async function buildTransaction({
  recipientAddress,
  amount,
  feeRate,
  utxos,
  changeAddress,
}): Promise<BuildTransactionResult>

function createScriptPubKey(address: string): Uint8Array
function decodeTransaction(txHex: string): DecodedTransaction
function serializeTransaction(tx: SimpleTransaction): Uint8Array
function estimateTransactionSize(inputCount: number, outputCount: number): number
```

**Funcionalidades:**

- ✅ Construção básica de tx
- ✅ Suporte SegWit
- ✅ Cálculo de fee
- ✅ Output de troco
- ✅ Estimativa de tamanho
- ✅ Serialização para hex
- ✅ RBF (Replace-By-Fee)
- ✅ Coin selection avançado (Branch and Bound)
- ✅ Múltiplos algoritmos de coin selection

### Electrum ⭐

**Funcionalidades adicionais:**

```python
# transaction.py
class TxInput:
    prevout: TxOutpoint
    script_sig: bytes
    nsequence: int
    witness: bytes
    block_height: Optional[int]
    spent_height: Optional[int]

    def get_time_based_relative_locktime(self) -> Optional[int]  # BIP-68
    def get_block_based_relative_locktime(self) -> Optional[int]
    def is_coinbase_output(self) -> bool

class TxOutput:
    scriptpubkey: bytes
    value: int

    @classmethod
    def from_address_and_value(cls, address: str, value: int) -> 'TxOutput'

class Transaction:
    def txid(self) -> str
    def wtxid(self) -> str
    def estimated_size(self) -> int
    def estimated_weight(self) -> int
    def estimated_total_size(self) -> int
    def is_rbf_enabled(self) -> bool
    def is_segwit(self) -> bool
    def is_complete(self) -> bool
    def get_fee(self) -> int
    def verify_sig_for_txin(self, txin_index, pubkey, sig) -> bool
    def serialize_preimage(self, txin_index, sighash) -> bytes

class PartialTransaction(Transaction):
    # Extensão para PSBT
    def add_inputs(self, inputs)
    def add_outputs(self, outputs)
    def remove_signatures(self)
    def update_signatures(self, signatures)
```

**Funcionalidades:**

- ✅ Tudo do ihodl
- ✅ wtxid (witness txid)
- ✅ Detecção RBF (BIP-125)
- ✅ Relative locktime (BIP-68)
- ✅ Verificação de assinatura
- ✅ Weight vs vBytes preciso
- ✅ Preimage para todos sighash types
- ✅ Suporte a coinbase maturity
- ✅ Merge de transações

### 🔴 Gaps Identificados

| Funcionalidade               | ihodl       | Electrum | Prioridade |
| ---------------------------- | ----------- | -------- | ---------- |
| wtxid                        | ❌          | ✅       | Baixa      |
| Relative locktime (BIP-68)   | ❌          | ✅       | Média      |
| Verificação de assinatura    | ❌          | ✅       | Alta       |
| Múltiplos sighash types      | ❌ (só ALL) | ✅       | Média      |
| Coinbase maturity check      | ❌          | ✅       | Média      |
| CPFP (Child Pays For Parent) | ❌          | ✅       | Média      |
| Merge de transações          | ❌          | ✅       | Baixa      |

---

## Etapa 5: Seleção de UTXOs (Coin Selection)

### ihodl ⚠️

**Implementação atual:**

```typescript
// transactions.ts
async function buildTransaction({
  recipientAddress,
  amount,
  feeRate,
  utxos,
  changeAddress,
  coinSelectionAlgorithm = CoinSelectionAlgorithm.BRANCH_AND_BOUND,
  // ... outros parâmetros
}): Promise<BuildTransactionResult>

// Implementa Branch and Bound e outros algoritmos
const coinSelectionResult = selectCoinsAdvanced(confirmedUtxos, {
  targetAmount: amount,
  feeRate,
  algorithm: coinSelectionAlgorithm,
  avoidAddressReuse,
  consolidateSmallUtxos,
})
```

**Algoritmos:** Branch and Bound, Largest-first, Privacy-focused

### Electrum ⭐

**Funcionalidades adicionais:**

```python
# coinchooser.py
class CoinChooserBase:
    def bucketize_coins(self, coins, fee_estimator_vb):
        # Agrupa coins por chave (endereço, script, etc)

    def _change_amounts(self, tx, count, fee_estimator) -> List[int]:
        # Divide change em múltiplos outputs para privacidade

    def _change_outputs(self, tx, change_addrs, fee_estimator, dust_threshold):
        # Cria outputs de change com valores arredondados

    def make_tx(self, coins, inputs, outputs, change_addrs,
                fee_estimator_vb, dust_threshold, BIP69_sort=True):
        # Construção completa com seleção otimizada

class CoinChooserPrivacy(CoinChooserBase):
    # Agrupa por script para evitar linking

class CoinChooserRandom(CoinChooserBase):
    # Seleção aleatória determinística (PRNG com seed)

class PRNG:
    # PRNG determinístico baseado em SHA256 dos UTXOs
    # Garante mesma seleção para mesmos UTXOs
```

**Algoritmos:**

- ✅ Largest-first
- ✅ Random (determinístico)
- ✅ Privacy-focused (agrupa por script)
- ✅ Branch and Bound
- ✅ Effective value (considera fee do input)
- ✅ BIP-69 sorting
- ✅ Dust consolidation
- ✅ Change splitting para privacidade

### 🔴 Gaps Identificados

| Funcionalidade              | ihodl | Electrum | Prioridade |
| --------------------------- | ----- | -------- | ---------- |
| Algoritmo privacy-focused   | ⚠️    | ✅       | Alta       |
| Effective value calculation | ❌    | ✅       | Alta       |
| BIP-69 sorting              | ❌    | ✅       | Média      |
| PRNG determinístico         | ❌    | ✅       | Média      |
| Change splitting            | ❌    | ✅       | Média      |
| Dust consolidation          | ❌    | ✅       | Média      |

---

## Etapa 6: Assinatura de Transações

### ihodl ⚠️

**Implementação atual:**

```typescript
// transactions.ts
function createSegWitSignature(tx, inputIndex, privateKey, amount): Uint8Array {
  const publicKey = createPublicKey(privateKey)
  const sighash = createSighash(tx, inputIndex, amount, publicKey)
  const { signature } = secp256k1.ecdsaSign(sighash, privateKey)
  const derSignature = compactSignatureToDER(signature)
  return [...derSignature, 0x01] // SIGHASH_ALL
}

function createSighash(tx, inputIndex, amount, publicKey): Uint8Array {
  // BIP-143 sighash para SegWit v0
}

// crypto.ts - Taproot (parcial)
function schnorrSign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  // Placeholder: usa ECDSA convertido para 64-byte format
  // NÃO é uma assinatura Schnorr BIP-340 verdadeira
  const { signature } = secp256k1.ecdsaSign(message, privateKey)
  return signature
}
```

**Funcionalidades:**

- ✅ ECDSA signing
- ✅ BIP-143 (SegWit v0 sighash)
- ✅ DER encoding
- ✅ SIGHASH_ALL
- ⚠️ Schnorr signing (placeholder - não BIP-340)

### Electrum ⭐

**Funcionalidades adicionais:**

```python
# transaction.py
class Sighash(IntEnum):
    DEFAULT = 0   # Taproot only
    ALL = 1
    NONE = 2
    SINGLE = 3
    ANYONECANPAY = 0x80

class Transaction:
    def serialize_preimage(self, txin_index, sighash, sighash_cache):
        if txin.is_taproot():
            # BIP-341 sighash (Taproot)
            return self._serialize_taproot_preimage(...)
        elif txin.is_segwit():
            # BIP-143 sighash (SegWit v0)
            return self._serialize_segwit_preimage(...)
        else:
            # Legacy sighash
            return self._serialize_legacy_preimage(...)

    def verify_sig_for_txin(self, txin_index, pubkey, sig, sighash_cache):
        # Verificação de assinatura

# bitcoin.py
def taproot_tweak_seckey(seckey: bytes, h: bytes) -> bytes
def taproot_tweak_pubkey(pubkey: bytes, h: bytes) -> Tuple[int, bytes]
def ecdsa_sign_usermessage(privkey, message, is_compressed) -> bytes
def verify_usermessage_with_address(address, sig65, message) -> bool
```

**Funcionalidades:**

- ✅ Tudo do ihodl
- ✅ Todos os sighash types (ALL, NONE, SINGLE, ANYONECANPAY)
- ✅ Legacy sighash
- ✅ BIP-341 Taproot sighash
- ✅ Schnorr signing (BIP-340)
- ✅ Message signing (Bitcoin Signed Message)
- ✅ Verificação de assinaturas
- ✅ Sighash cache para performance

### 🔴 Gaps Identificados

| Funcionalidade            | ihodl | Electrum | Prioridade |
| ------------------------- | ----- | -------- | ---------- |
| Legacy sighash            | ❌    | ✅       | Baixa      |
| SIGHASH_NONE/SINGLE       | ❌    | ✅       | Baixa      |
| SIGHASH_ANYONECANPAY      | ❌    | ✅       | Média      |
| BIP-341 Taproot sighash   | ❌    | ✅       | Alta       |
| Schnorr signing (BIP-340) | ⚠️    | ✅       | Alta       |
| Message signing           | ❌    | ✅       | Média      |
| Verificação de assinatura | ❌    | ✅       | Alta       |

---

## Etapa 7: Serialização e Broadcast

### ihodl ✅

**Implementação atual:**

```typescript
function serializeTransaction(tx: SimpleTransaction): Uint8Array {
  // Version + marker + flag + inputs + outputs + witnesses + locktime
}

function decodeTransaction(txHex: string): DecodedTransaction {
  // Parsing completo de tx hex
}

async function sendTransaction({
  signedTransaction,
  txHex,
  getConnectionFn,
}): SendTransactionResult {
  // Broadcast via Electrum server
  const response = await callElectrumMethod('blockchain.transaction.broadcast', [txHex], socket)
}

function testTransactionDecode(txHex: string): ValidationResult {
  // Validação antes de broadcast
}
```

### Electrum ⭐

**Funcionalidades adicionais:**

```python
class Transaction:
    def serialize_to_network(self, estimate_size=False, include_sigs=True,
                             force_legacy=False) -> str

    def to_qr_data(self) -> Tuple[str, bool]:
        # Base43 encoding para QR codes

    @classmethod
    def from_io(cls, inputs, outputs, locktime=0, version=2):
        # Construção a partir de I/O
```

**Funcionalidades:**

- ✅ Tudo do ihodl
- ✅ Base43 encoding para QR codes compactos
- ✅ Serialização com/sem sigs
- ✅ Force legacy format

### 🔴 Gaps Identificados

| Funcionalidade        | ihodl | Electrum | Prioridade |
| --------------------- | ----- | -------- | ---------- |
| Base43 para QR codes  | ❌    | ✅       | Baixa      |
| Serialização sem sigs | ❌    | ✅       | Média      |

---

## Etapa 8: PSBT (Partially Signed Bitcoin Transactions)

### ihodl ✅

**Implementação atual:**

```typescript
// psbt.ts
export class PartialTransaction {
  public globalMap: Map<number, Uint8Array> = new Map()
  public inputs: PsbtInput[] = []
  public outputs: PsbtOutput[] = []

  constructor(psbtHex?: string) {
    if (psbtHex) {
      this.deserialize(psbtHex)
    }
  }

  deserialize(psbtHex: string): void
  serialize(): string
  // ... métodos completos de PSBT
}

export class KeyOriginInfo {
  constructor(
    public fingerprint: number,
    public path: number[],
  ) {}

  serialize(): Uint8Array
  static deserialize(data: Uint8Array): KeyOriginInfo
}
```

**Funcionalidades:**

- ✅ Serialização/deserialização PSBT (BIP-174)
- ✅ Todos os campos globais e por input/output
- ✅ KeyOriginInfo para BIP-32 derivation paths
- ✅ Estrutura completa de PSBT
- ✅ Parsing de key-value maps

### Electrum ⭐

**Funcionalidades adicionais:**

```python
# transaction.py
class PartialTransaction(Transaction):
    def serialize_as_bytes(self) -> bytes  # PSBT format
    def serialize(self) -> str             # PSBT base64

    @classmethod
    def from_raw_psbt(cls, raw: bytes) -> 'PartialTransaction'

    def combine_with(self, other: 'PartialTransaction')
    def finalize_psbt(self)

    def convert_all_utxos_to_witness_utxos(self)  # Para QR codes menores

class PartialTxInput(TxInput):
    witness_utxo: Optional[TxOutput]
    sigs_ecdsa: Dict[bytes, bytes]     # pubkey -> sig
    tap_key_sig: Optional[bytes]
    bip32_paths: Dict[bytes, Tuple[bytes, Sequence[int]]]
    redeem_script: Optional[bytes]
    witness_script: Optional[bytes]
    script_descriptor: Optional[Descriptor]
```

**Funcionalidades:**

- ✅ Tudo do ihodl
- ✅ Combinação de PSBTs
- ✅ Finalização
- ✅ Taproot fields (BIP-371)
- ✅ SLIP-19 ownership proof

### 🔴 Gaps Identificados

| Funcionalidade           | ihodl | Electrum | Prioridade |
| ------------------------ | ----- | -------- | ---------- |
| Combinação de PSBTs      | ❌    | ✅       | Alta       |
| Finalização de PSBT      | ❌    | ✅       | Alta       |
| Taproot fields (BIP-371) | ❌    | ✅       | Média      |
| SLIP-19 ownership proof  | ❌    | ✅       | Baixa      |

---

## Etapa 9: Descriptors

### ihodl ❌

**Não implementado.**

### Electrum ⭐

**Implementação completa:**

```python
# descriptor.py
class PubkeyProvider:
    origin: Optional[KeyOriginInfo]
    pubkey: str
    deriv_path: Optional[str]  # Suffix com wildcard (e.g., "/0/*")

class Descriptor:
    @classmethod
    def parse(cls, s: str) -> 'Descriptor'

    def expand(self) -> ExpandedScripts
    def satisfy(self, sigdata) -> ScriptSolutionTop
    def get_all_pubkeys(self) -> Set[bytes]
    def to_string(self) -> str

# Tipos suportados:
# pk(KEY), pkh(KEY), wpkh(KEY), sh(wpkh(KEY))
# multi(k, KEY, KEY, ...), sortedmulti(k, KEY, ...)
# wsh(multi(...)), sh(wsh(multi(...)))
# tr(KEY), tr(KEY, TREE)

def AddChecksum(desc: str) -> str
def DescriptorChecksum(desc: str) -> str
```

**Funcionalidades:**

- ✅ Parsing de descriptors
- ✅ Checksum validation
- ✅ Wildcard expansion
- ✅ Single-sig e multi-sig
- ✅ Taproot descriptors
- ✅ Nested descriptors (sh(wpkh(...)))

### 🔴 Gaps Identificados

| Funcionalidade        | ihodl | Electrum | Prioridade |
| --------------------- | ----- | -------- | ---------- |
| Output Descriptors    | ❌    | ✅       | Alta       |
| Descriptor checksum   | ❌    | ✅       | Alta       |
| Multi-sig descriptors | ❌    | ✅       | Média      |
| Taproot descriptors   | ❌    | ✅       | Média      |

---

## Etapa 10: Funcionalidades Auxiliares

### Comparação

| Funcionalidade           | ihodl       | Electrum      | Prioridade |
| ------------------------ | ----------- | ------------- | ---------- |
| **Opcodes completos**    | ❌          | ✅            | Média      |
| **Script parsing**       | ❌          | ✅            | Alta       |
| **Script templates**     | ❌          | ✅            | Alta       |
| **Dust threshold check** | ✅          | ✅            | -          |
| **Fee estimation**       | ✅ (básico) | ✅ (avançado) | Média      |
| **WIF import/export**    | ❌          | ✅            | Baixa      |
| **Minikey support**      | ❌          | ✅            | Baixa      |
| **AES encryption**       | ❌          | ✅            | Média      |
| **ChaCha20-Poly1305**    | ❌          | ✅            | Baixa      |

### Electrum - Funcionalidades Extras

```python
# bitcoin.py
class opcodes(IntEnum):
    OP_0 = 0x00
    OP_DUP = 0x76
    OP_HASH160 = 0xa9
    OP_CHECKSIG = 0xac
    # ... todos os opcodes

def script_GetOp(_bytes: bytes):
    # Iterator para parsing de scripts

SCRIPTPUBKEY_TEMPLATE_P2PKH = [OP_DUP, OP_HASH160, ...]
SCRIPTPUBKEY_TEMPLATE_P2WPKH = [OP_0, OPPushDataGeneric(20)]

def match_script_against_template(script, template) -> bool
def get_script_type_from_output_script(scriptpubkey) -> str
def get_address_from_output_script(_bytes) -> str

# crypto.py
def aes_encrypt_with_iv(key, iv, data) -> bytes
def aes_decrypt_with_iv(key, iv, data) -> bytes
def pw_encode(data, password, version) -> str
def pw_decode(data, password) -> bytes
```

---

## Resumo de Gaps e Recomendações

### 🔴 Prioridade Crítica

| Gap                  | Descrição                                | Impacto                                   |
| -------------------- | ---------------------------------------- | ----------------------------------------- |
| **Taproot Completo** | Schnorr signing não é BIP-340 verdadeiro | Carteira incompleta para padrões modernos |

### 🟠 Prioridade Alta

| Gap                             | Descrição                              | Impacto                                 |
| ------------------------------- | -------------------------------------- | --------------------------------------- |
| **PSBT Finalização**            | PSBT sem combinação/finalização        | Hardware wallets limitados              |
| **Derivação pública (CKD_pub)** | Não suporta derivação apenas de pubkey | Impossibilita watch-only wallets        |
| **Verificação de assinatura**   | Não verifica assinaturas               | Segurança reduzida                      |
| **Output Descriptors**          | Sem suporte a descriptors              | Interoperabilidade limitada             |
| **Coin selection privacy**      | Algoritmo privacy-focused limitado     | Privacidade reduzida                    |
| **Script parsing**              | Sem parsing genérico de scripts        | Suporte limitado a tipos de endereço    |
| **Validação de endereço**       | Sem validação robusta                  | Risco de envio para endereços inválidos |

### 🟡 Prioridade Média

| Gap                      | Descrição                               |
| ------------------------ | --------------------------------------- |
| P2SH, P2WSH              | Tipos de endereço para multisig         |
| Múltiplos sighash types  | ANYONECANPAY, SINGLE, NONE              |
| Message signing          | Prova de propriedade de endereço        |
| BIP-68 relative locktime | Timelocks avançados                     |
| CPFP                     | Child Pays For Parent para acelerar txs |
| BIP-69 sorting           | Ordenação determinística                |
| AES encryption           | Backup criptografado                    |
| Recuperação BIP-39       | Suporte a seeds de outras carteiras     |

### 🟢 Prioridade Baixa

| Gap                        | Descrição                      |
| -------------------------- | ------------------------------ |
| Legacy P2PKH               | Endereços começando com "1"    |
| SLIP-39                    | Shamir backup                  |
| Múltiplos idiomas wordlist | Suporte internacional          |
| Minikey                    | Formato antigo de chaves       |
| wtxid                      | Witness transaction ID         |
| Base43 QR                  | Compressão extra para QR codes |

---

## Roadmap Sugerido

### Fase 1: Aperfeiçoamento (Alta Prioridade)

1. Completar PSBT (combinação, finalização, Taproot fields)
2. Implementar Schnorr signing verdadeiro (BIP-340)
3. Adicionar derivação pública (CKD_pub) completa
4. Implementar verificação de assinatura
5. Melhorar coin selection privacy

### Fase 2: Modernização Completa

6. Implementar Output Descriptors
7. Adicionar BIP-341 Taproot sighash
8. CPFP (Child Pays For Parent)
9. Message signing
10. Watch-only wallets

### Fase 3: Recursos Avançados

11. P2SH, P2WSH para multisig
12. Múltiplos sighash types
13. BIP-68 relative locktime
14. Backup criptografado (AES)
15. Recuperação BIP-39 de outras carteiras

---

## Conclusão

O projeto **ihodl** possui uma implementação robusta e moderna de funcionalidades Bitcoin on-chain:

- ✅ BIP-39 mnemônicos completos
- ✅ BIP-32/84 derivação de chaves com parsing de paths
- ✅ P2WPKH, P2TR endereços
- ✅ SegWit v0 assinaturas
- ✅ PSBT básico (serialização/deserialização)
- ✅ RBF (Replace-By-Fee)
- ✅ Coin selection avançado (Branch and Bound)
- ✅ Taproot addresses (Schnorr signing parcial)

Comparado ao Electrum, o ihodl está bem posicionado como uma carteira moderna, faltando principalmente:

- 🔴 Completar PSBT (combinação/finalização)
- 🔴 Schnorr signing verdadeiro (BIP-340)
- 🟠 Derivação pública para watch-only
- 🟠 Verificação de assinaturas
- 🟠 Output Descriptors

O Electrum continua sendo uma referência valiosa para implementação de funcionalidades avançadas, especialmente em áreas como multisig, hardware wallets e recursos de privacidade.
