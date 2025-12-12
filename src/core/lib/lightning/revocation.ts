// BOLT #2: Revocation Store - Armazenamento de Per-Commitment Secrets
// Baseado em electrum/lnutil.py RevocationStore

import { sha256 } from '../crypto/crypto'
import { uint8ArrayToHex, hexToUint8Array } from '../utils/utils'
import * as secp from '@noble/secp256k1'

// ==========================================
// CONSTANTES
// ==========================================

/**
 * Índice inicial para per-commitment secrets
 * Os secrets são contados para baixo: START_INDEX, START_INDEX-1, ...
 */
export const START_INDEX = 2 ** 48 - 1

/**
 * Número máximo de secrets armazenados (usando hash chain compression)
 * Com 49 buckets, podemos armazenar 2^48 secrets usando apenas 49 * 32 = 1568 bytes
 */
export const NUM_BUCKETS = 49

// ==========================================
// TIPOS
// ==========================================

/**
 * Bucket para armazenar secret comprimido
 */
export interface RevocationBucket {
  /** Índice do commitment */
  index: number
  /** Secret de 32 bytes */
  secret: Uint8Array
}

/**
 * Estado do RevocationStore para serialização
 */
export interface RevocationStoreState {
  buckets: ({ index: number; secret: string } | null)[]
}

// ==========================================
// DERIVAÇÃO DE SECRETS
// ==========================================

/**
 * Deriva per-commitment secret a partir do seed
 *
 * Implementa a derivação especificada em BOLT #3:
 * - Usa uma árvore binária de hashes
 * - O secret para o índice I é derivado do seed usando os bits de I
 *
 * @param seed - Seed de 32 bytes
 * @param index - Índice do commitment (0 a 2^48-1)
 * @returns Secret de 32 bytes
 */
export function getPerCommitmentSecretFromSeed(seed: Uint8Array, index: number): Uint8Array {
  if (seed.length !== 32) {
    throw new Error('Seed must be 32 bytes')
  }
  if (index < 0 || index > START_INDEX) {
    throw new Error(`Index ${index} out of range [0, ${START_INDEX}]`)
  }

  let secret = new Uint8Array(seed)

  // Iterar pelos 48 bits do índice
  for (let i = 47; i >= 0; i--) {
    if (((index >> i) & 1) === 1) {
      // Bit é 1: XOR com hash e depois hash novamente
      const temp = new Uint8Array(32)
      temp[i >> 3] ^= 1 << (7 - (i & 7))

      const xored = new Uint8Array(32)
      for (let j = 0; j < 32; j++) {
        xored[j] = secret[j] ^ temp[j]
      }
      secret = new Uint8Array(sha256(xored))
    }
  }

  return secret
}

/**
 * Deriva per-commitment point a partir do secret
 *
 * O point é a chave pública correspondente ao secret
 *
 * @param secret - Secret de 32 bytes
 * @returns Point de 33 bytes (compressed pubkey)
 */
export function secretToPoint(secret: Uint8Array): Uint8Array {
  return secp.getPublicKey(secret, true)
}

// ==========================================
// REVOCATION STORE
// ==========================================

/**
 * RevocationStore - Armazena per-commitment secrets do peer de forma eficiente
 *
 * Usa o algoritmo de compressão de hash chain descrito em BOLT #3:
 * - Armazena no máximo 49 secrets
 * - Pode reconstruir qualquer secret anterior
 * - Detecta tentativas de fraude (secrets inválidos)
 *
 * Uso:
 * 1. Criar store: new RevocationStore()
 * 2. Receber secret: store.addSecret(secret, index)
 * 3. Verificar: store.getSecret(index)
 *
 * O algoritmo funciona assim:
 * - Cada bucket i armazena um secret cujo índice tem trailing zeros >= i
 * - Quando um novo secret chega, ele substitui todos os buckets menores
 * - Secrets anteriores podem ser derivados dos buckets usando hash chain
 */
export class RevocationStore {
  private buckets: (RevocationBucket | null)[] = new Array(NUM_BUCKETS).fill(null)

  constructor() {
    // Inicializar todos os buckets como null
    for (let i = 0; i < NUM_BUCKETS; i++) {
      this.buckets[i] = null
    }
  }

  /**
   * Adiciona um novo per-commitment secret do peer
   *
   * Valida que o secret é consistente com secrets anteriores
   * e atualiza os buckets apropriados
   *
   * @param secret - Secret de 32 bytes
   * @param index - Índice do commitment (contagem regressiva)
   * @throws Error se o secret for inválido/inconsistente
   */
  addSecret(secret: Uint8Array, index: number): void {
    if (secret.length !== 32) {
      throw new Error('Secret must be 32 bytes')
    }

    // Calcular quantos trailing zeros o índice tem
    const bucket = this.countTrailingZeros(index)

    // Verificar se o secret é consistente com os buckets existentes
    for (let i = 0; i < bucket; i++) {
      const existingBucket = this.buckets[i]
      if (existingBucket !== null) {
        // Derivar o secret esperado para o índice existente a partir do novo secret
        const expectedSecret = this.deriveSecret(secret, index, existingBucket.index)
        if (!this.compareSecrets(expectedSecret, existingBucket.secret)) {
          throw new Error(
            `Inconsistent secret at bucket ${i}: ` +
              `expected ${uint8ArrayToHex(expectedSecret)}, ` +
              `got ${uint8ArrayToHex(existingBucket.secret)}`,
          )
        }
      }
    }

    // Armazenar o novo secret e limpar buckets menores
    this.buckets[bucket] = { index, secret: new Uint8Array(secret) }
    for (let i = 0; i < bucket; i++) {
      this.buckets[i] = null
    }
  }

  /**
   * Obtém o secret para um índice específico
   *
   * Deriva o secret a partir do bucket apropriado
   *
   * @param index - Índice do commitment
   * @returns Secret de 32 bytes ou undefined se não disponível
   */
  getSecret(index: number): Uint8Array | undefined {
    // Encontrar o bucket que contém o secret ou pode derivá-lo
    for (let i = 0; i < NUM_BUCKETS; i++) {
      const bucket = this.buckets[i]
      if (bucket !== null && bucket.index >= index) {
        // Podemos derivar o secret a partir deste bucket
        return this.deriveSecret(bucket.secret, bucket.index, index)
      }
    }
    return undefined
  }

  /**
   * Retorna o índice do último secret recebido
   *
   * @returns Índice ou undefined se nenhum secret foi recebido
   */
  getLastIndex(): number | undefined {
    for (let i = 0; i < NUM_BUCKETS; i++) {
      if (this.buckets[i] !== null) {
        return this.buckets[i]!.index
      }
    }
    return undefined
  }

  /**
   * Verifica se um índice específico está disponível
   *
   * @param index - Índice a verificar
   * @returns true se o secret pode ser obtido
   */
  hasSecret(index: number): boolean {
    return this.getSecret(index) !== undefined
  }

  /**
   * Conta trailing zeros binários de um número
   *
   * @param n - Número a analisar
   * @returns Número de trailing zeros
   */
  private countTrailingZeros(n: number): number {
    if (n === 0) return 48 // Maximum for 48-bit index
    let count = 0
    while ((n & 1) === 0 && count < 48) {
      n >>= 1
      count++
    }
    return count
  }

  /**
   * Deriva secret de um índice a partir de outro
   *
   * Usa o mesmo algoritmo de getPerCommitmentSecretFromSeed
   * mas partindo de um secret já conhecido
   *
   * @param startSecret - Secret de partida
   * @param startIndex - Índice do secret de partida
   * @param targetIndex - Índice do secret desejado
   * @returns Secret derivado
   */
  private deriveSecret(
    startSecret: Uint8Array,
    startIndex: number,
    targetIndex: number,
  ): Uint8Array {
    if (targetIndex > startIndex) {
      throw new Error('Cannot derive future secrets')
    }

    let secret = new Uint8Array(startSecret)

    // XOR dos bits diferentes entre os índices
    const diffBits = startIndex ^ targetIndex

    for (let i = 47; i >= 0; i--) {
      if (((diffBits >> i) & 1) === 1) {
        // Este bit precisa ser flipado
        const temp = new Uint8Array(32)
        temp[i >> 3] ^= 1 << (7 - (i & 7))

        const xored = new Uint8Array(32)
        for (let j = 0; j < 32; j++) {
          xored[j] = secret[j] ^ temp[j]
        }
        secret = new Uint8Array(sha256(xored))
      }
    }

    return secret
  }

  /**
   * Compara dois secrets de forma segura (constant-time)
   *
   * @param a - Primeiro secret
   * @param b - Segundo secret
   * @returns true se iguais
   */
  private compareSecrets(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) {
      diff |= a[i] ^ b[i]
    }
    return diff === 0
  }

  // ==========================================
  // SERIALIZAÇÃO
  // ==========================================

  /**
   * Exporta estado para serialização
   */
  toJSON(): RevocationStoreState {
    return {
      buckets: this.buckets.map(b =>
        b === null ? null : { index: b.index, secret: uint8ArrayToHex(b.secret) },
      ),
    }
  }

  /**
   * Restaura estado de JSON
   */
  static fromJSON(state: RevocationStoreState): RevocationStore {
    const store = new RevocationStore()
    store.buckets = state.buckets.map(b =>
      b === null ? null : { index: b.index, secret: hexToUint8Array(b.secret) },
    )
    return store
  }
}

// ==========================================
// DERIVAÇÃO DE CHAVES POR COMMITMENT
// ==========================================

/**
 * Deriva chave privada para um commitment específico
 *
 * Combina a chave base com o per-commitment point usando ECDH
 *
 * @param baseSecret - Chave base de 32 bytes
 * @param perCommitmentPoint - Per-commitment point de 33 bytes
 * @returns Chave derivada de 32 bytes
 */
export function derivePrivkey(baseSecret: Uint8Array, perCommitmentPoint: Uint8Array): Uint8Array {
  // SHA256(per_commitment_point || base_point)
  const combined = new Uint8Array(66)
  combined.set(perCommitmentPoint, 0)

  // Derivar base_point a partir de baseSecret
  const basePoint = secp.getPublicKey(baseSecret, true)
  combined.set(basePoint, 33)

  const tweak = sha256(combined)

  // private_key = base_secret + SHA256(per_commitment_point || base_point)
  // Feito em campo finito da curva secp256k1
  const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
  const baseSecretBigInt = BigInt('0x' + uint8ArrayToHex(baseSecret))
  const tweakBigInt = BigInt('0x' + uint8ArrayToHex(tweak))
  const result = (baseSecretBigInt + tweakBigInt) % n

  // Converter de volta para bytes
  const resultHex = result.toString(16).padStart(64, '0')
  return hexToUint8Array(resultHex)
}

/**
 * Deriva chave pública para um commitment específico
 *
 * @param basePoint - Chave pública base de 33 bytes
 * @param perCommitmentPoint - Per-commitment point de 33 bytes
 * @returns Chave pública derivada de 33 bytes
 */
export function derivePubkey(basePoint: Uint8Array, perCommitmentPoint: Uint8Array): Uint8Array {
  // SHA256(per_commitment_point || base_point)
  const combined = new Uint8Array(66)
  combined.set(perCommitmentPoint, 0)
  combined.set(basePoint, 33)

  const tweak = sha256(combined)

  // public_key = base_point + SHA256(per_commitment_point || base_point) * G
  const tweakPoint = secp.getPublicKey(tweak, true)

  // Usar point addition
  const resultPoint = secp.Point.fromHex(uint8ArrayToHex(basePoint)).add(
    secp.Point.fromHex(uint8ArrayToHex(tweakPoint)),
  )

  return hexToUint8Array(resultPoint.toHex(true))
}

/**
 * Deriva chave de revogação
 *
 * A chave de revogação é usada para reivindicar fundos se o peer
 * tentar publicar um commitment antigo
 *
 * @param revocationBasepoint - Basepoint de revogação de 33 bytes
 * @param perCommitmentPoint - Per-commitment point de 33 bytes
 * @returns Chave pública de revogação de 33 bytes
 */
export function deriveRevocationPubkey(
  revocationBasepoint: Uint8Array,
  perCommitmentPoint: Uint8Array,
): Uint8Array {
  // revocation_pubkey = revocation_basepoint * SHA256(revocation_basepoint || per_commitment_point)
  //                   + per_commitment_point * SHA256(per_commitment_point || revocation_basepoint)

  // Hash 1: SHA256(revocation_basepoint || per_commitment_point)
  const combined1 = new Uint8Array(66)
  combined1.set(revocationBasepoint, 0)
  combined1.set(perCommitmentPoint, 33)
  const hash1 = sha256(combined1)

  // Hash 2: SHA256(per_commitment_point || revocation_basepoint)
  const combined2 = new Uint8Array(66)
  combined2.set(perCommitmentPoint, 0)
  combined2.set(revocationBasepoint, 33)
  const hash2 = sha256(combined2)

  // Multiplicar pontos pelos hashes
  const point1 = secp.Point.fromHex(uint8ArrayToHex(revocationBasepoint)).multiply(
    BigInt('0x' + uint8ArrayToHex(hash1)),
  )
  const point2 = secp.Point.fromHex(uint8ArrayToHex(perCommitmentPoint)).multiply(
    BigInt('0x' + uint8ArrayToHex(hash2)),
  )

  // Somar os pontos
  const resultPoint = point1.add(point2)
  return hexToUint8Array(resultPoint.toHex(true))
}

export default RevocationStore
