# BIP (Bitcoin Improvement Proposals)

Esta pasta centraliza todas as implementações de BIPs (Bitcoin Improvement Proposals) utilizadas no projeto.

## Estrutura

### 📄 `bip39.ts`

**BIP-39: Mnemonic code for generating deterministic keys**

- Conversão de entropia para mnemônico (12/24 palavras)
- Derivação de seed a partir de mnemônico + passphrase opcional
- Wordlist em inglês
- Utilizado para criar e restaurar carteiras HD

### 📄 `bech32.ts`

**BIP-173/350: Bech32 e Bech32m address encoding**

- Codificação/decodificação Bech32 (segwit v0)
- Codificação/decodificação Bech32m (segwit v1+)
- Funções auxiliares: `toWords()`, `fromWords()`, `encode()`, `decode()`
- Suporte BOLT 11 (Lightning invoices) com padding flexível
- Suporte BOLT 12 (Offers) sem checksum

### 📄 `bip340.ts`

**BIP-340: Schnorr signatures for secp256k1**

- Assinaturas Schnorr (64 bytes) usando curva secp256k1
- Chaves públicas x-only (32 bytes)
- Tagged hashing conforme BIP-340
- Funções específicas para BOLT 12 (Lightning Offers)
- Utiliza `@noble/secp256k1` v3

### 📄 `index.ts`

Barrel export - facilita importações centralizadas de todas as funcionalidades BIP.

## Uso

```typescript
// Import individual
import { toWords, fromWords } from '@/core/lib/bips/bech32'
import { entropyToMnemonic } from '@/core/lib/bips/bip39'
import { signBolt12Message } from '@/core/lib/bips/bip340'

// Import via barrel (index.ts)
import { toWords, entropyToMnemonic, signBolt12Message } from '@/core/lib/bip'
```

## Convenções

- **Camel Case**: variáveis e funções (`toWords`, `signBolt12Message`)
- **Pascal Case**: tipos e interfaces (`SchnorrPublicKey`, `Bech32Result`)
- **YELL_CASE**: constantes (`BECH32_CHARSET`)
- **Sem snake_case ou kebab-case** em nenhum código

## Dependências

- `@noble/secp256k1`: Schnorr signatures (BIP-340)
- `@noble/hashes`: SHA-256, HMAC (BIP-39, BIP-340)
- `bip39` (npm): Wordlists apenas

## Referências

- [BIP-39 Spec](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki)
- [BIP-173 Spec](https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki) (Bech32)
- [BIP-350 Spec](https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki) (Bech32m)
- [BIP-340 Spec](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki) (Schnorr)
