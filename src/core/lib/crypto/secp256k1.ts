/**
 * Operações de curva elíptica secp256k1 usando @noble/secp256k1
 *
 * Este módulo fornece primitivas criptográficas de baixo nível para:
 * - Aritmética modular de escalares (chaves privadas)
 * - Operações com pontos na curva (chaves públicas)
 * - Assinaturas e verificação
 *
 * Usado para implementar BOLT-3:
 * - Derivação de revocation keys
 * - Verificação de commitment signatures
 * - Assinaturas HTLC
 *
 * @see https://github.com/lightning/bolts/blob/master/03-transactions.md
 */

import * as secp from '@noble/secp256k1'
import { uint8ArrayToHex, hexToUint8Array } from '../utils/utils'
import { sha256 } from './crypto'

// Configurar hash functions para @noble/secp256k1 v3
// @ts-ignore - Configuração necessária para v3
secp.utils.sha256Sync = sha256
// @ts-ignore
secp.utils.sha256 = sha256

/**
 * Ordem da curva secp256k1 (n)
 * Todos os escalares são calculados mod n
 */
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n

/**
 * Converte Uint8Array para BigInt (big-endian)
 */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte)
  }
  return result
}

/**
 * Converte BigInt para Uint8Array de 32 bytes (big-endian)
 */
export function bigIntToBytes(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32)
  let value = n < 0n ? n + N : n
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(value & 0xffn)
    value >>= 8n
  }
  return bytes
}

/**
 * Adição modular de escalares (mod n)
 *
 * result = (a + b) mod n
 *
 * Usado para derivação de chaves conforme BOLT-3:
 * - revocation_privkey = term1 + term2
 * - localpubkey derivation
 *
 * @param a - Primeiro escalar (32 bytes)
 * @param b - Segundo escalar (32 bytes)
 * @returns Resultado da adição mod n (32 bytes)
 */
export function scalarAdd(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== 32 || b.length !== 32) {
    throw new Error('Scalars must be 32 bytes')
  }
  const aBigInt = bytesToBigInt(a)
  const bBigInt = bytesToBigInt(b)
  const result = (aBigInt + bBigInt) % N
  return bigIntToBytes(result < 0n ? result + N : result)
}

/**
 * Subtração modular de escalares (mod n)
 *
 * result = (a - b) mod n
 *
 * @param a - Primeiro escalar (32 bytes)
 * @param b - Segundo escalar (32 bytes)
 * @returns Resultado da subtração mod n (32 bytes)
 */
export function scalarSub(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== 32 || b.length !== 32) {
    throw new Error('Scalars must be 32 bytes')
  }
  const aBigInt = bytesToBigInt(a)
  const bBigInt = bytesToBigInt(b)
  let result = (aBigInt - bBigInt) % N
  if (result < 0n) {
    result += N
  }
  return bigIntToBytes(result)
}

/**
 * Multiplicação modular de escalares (mod n)
 *
 * result = (a * b) mod n
 *
 * Usado para BOLT-3 key derivation:
 * - revocation_basepoint_secret * SHA256(...)
 * - per_commitment_secret * SHA256(...)
 *
 * @param a - Primeiro escalar (32 bytes)
 * @param b - Segundo escalar (32 bytes)
 * @returns Resultado da multiplicação mod n (32 bytes)
 */
export function scalarMultiply(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== 32 || b.length !== 32) {
    throw new Error('Scalars must be 32 bytes')
  }
  const aBigInt = bytesToBigInt(a)
  const bBigInt = bytesToBigInt(b)
  const result = (aBigInt * bBigInt) % N
  return bigIntToBytes(result)
}

/**
 * Reduz um escalar mod n
 *
 * Útil quando o input pode ser >= n (como output de hash)
 *
 * @param a - Escalar a reduzir (32 bytes)
 * @returns Escalar reduzido mod n (32 bytes)
 */
export function scalarMod(a: Uint8Array): Uint8Array {
  if (a.length !== 32) {
    throw new Error('Scalar must be 32 bytes')
  }
  const aBigInt = bytesToBigInt(a)
  const result = aBigInt % N
  return bigIntToBytes(result < 0n ? result + N : result)
}

/**
 * Calcula o inverso modular de um escalar
 *
 * result = a^(-1) mod n
 *
 * @param a - Escalar a inverter (32 bytes)
 * @returns Inverso mod n (32 bytes)
 */
export function scalarInverse(a: Uint8Array): Uint8Array {
  if (a.length !== 32) {
    throw new Error('Scalar must be 32 bytes')
  }
  const aBigInt = bytesToBigInt(a)
  if (aBigInt === 0n) {
    throw new Error('Cannot invert zero')
  }
  // Usando Fermat's little theorem: a^(-1) = a^(n-2) mod n
  const result = modPow(aBigInt, N - 2n, N)
  return bigIntToBytes(result)
}

/**
 * Exponenciação modular
 */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n
  base = base % mod
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod
    }
    exp = exp >> 1n
    base = (base * base) % mod
  }
  return result
}

/**
 * Deriva public key (point) de um secret (scalar)
 *
 * point = secret * G
 *
 * Onde G é o ponto gerador da curva secp256k1.
 * Esta é a operação fundamental para gerar chaves públicas.
 *
 * @param secret - Chave privada (32 bytes)
 * @param compressed - Se true, retorna formato comprimido (33 bytes)
 * @returns Chave pública (33 ou 65 bytes)
 */
export function secretToPoint(secret: Uint8Array, compressed: boolean = true): Uint8Array {
  if (secret.length !== 32) {
    throw new Error('Secret must be 32 bytes')
  }
  return secp.getPublicKey(secret, compressed)
}

/**
 * Adição de pontos na curva elíptica
 *
 * C = A + B
 *
 * Usado para derivação de chaves públicas:
 * - localpubkey = basepoint + SHA256(...) * G
 *
 * @param a - Primeiro ponto (33 ou 65 bytes)
 * @param b - Segundo ponto (33 ou 65 bytes)
 * @param compressed - Se true, retorna formato comprimido
 * @returns Ponto resultante
 */
export function pointAdd(a: Uint8Array, b: Uint8Array, compressed: boolean = true): Uint8Array {
  // Converter para hex string para Point.fromHex
  const pointA = secp.Point.fromHex(uint8ArrayToHex(a))
  const pointB = secp.Point.fromHex(uint8ArrayToHex(b))
  const result = pointA.add(pointB)
  return hexToUint8Array(result.toHex(compressed))
}

/**
 * Multiplicação de ponto por escalar
 *
 * C = P * s
 *
 * Usado para:
 * - Derivação de chaves: basepoint * hash
 * - Verificação de assinaturas
 *
 * @param point - Ponto na curva (33 ou 65 bytes)
 * @param scalar - Escalar multiplicador (32 bytes)
 * @param compressed - Se true, retorna formato comprimido
 * @returns Ponto resultante
 */
export function pointMultiply(
  point: Uint8Array,
  scalar: Uint8Array,
  compressed: boolean = true,
): Uint8Array {
  if (scalar.length !== 32) {
    throw new Error('Scalar must be 32 bytes')
  }
  const p = secp.Point.fromHex(uint8ArrayToHex(point))
  const s = bytesToBigInt(scalar)
  if (s === 0n) {
    throw new Error('Cannot multiply by zero')
  }
  const result = p.multiply(s)
  return hexToUint8Array(result.toHex(compressed))
}

/**
 * Subtração de pontos na curva
 *
 * C = A - B = A + (-B)
 *
 * @param a - Primeiro ponto
 * @param b - Segundo ponto
 * @param compressed - Se true, retorna formato comprimido
 * @returns Ponto resultante
 */
export function pointSub(a: Uint8Array, b: Uint8Array, compressed: boolean = true): Uint8Array {
  const pointA = secp.Point.fromHex(uint8ArrayToHex(a))
  const pointB = secp.Point.fromHex(uint8ArrayToHex(b))
  const result = pointA.subtract(pointB)
  return hexToUint8Array(result.toHex(compressed))
}

/**
 * Compara dois pontos para igualdade
 *
 * @param a - Primeiro ponto
 * @param b - Segundo ponto
 * @returns true se os pontos são iguais
 */
export function pointsEqual(a: Uint8Array, b: Uint8Array): boolean {
  // Normalizar para formato comprimido antes de comparar
  try {
    const pointA = secp.Point.fromHex(uint8ArrayToHex(a))
    const pointB = secp.Point.fromHex(uint8ArrayToHex(b))
    return pointA.equals(pointB)
  } catch {
    return false
  }
}

/**
 * Assina hash de mensagem com normalização low-S (BIP-62)
 *
 * Bitcoin exige assinaturas low-S para prevenir maleability.
 * @noble/secp256k1 já faz isso automaticamente.
 *
 * @param messageHash - Hash da mensagem (32 bytes)
 * @param privateKey - Chave privada (32 bytes)
 * @returns Assinatura compacta (64 bytes, r || s)
 */
export function signWithLowS(messageHash: Uint8Array, privateKey: Uint8Array): Uint8Array {
  if (messageHash.length !== 32) {
    throw new Error('Message hash must be 32 bytes')
  }
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes')
  }
  // secp.sign retorna Uint8Array diretamente no v3
  return secp.sign(messageHash, privateKey)
}

/**
 * Assina hash e retorna em formato DER
 *
 * @param messageHash - Hash da mensagem (32 bytes)
 * @param privateKey - Chave privada (32 bytes)
 * @returns Assinatura DER (70-72 bytes tipicamente)
 */
export function signDer(messageHash: Uint8Array, privateKey: Uint8Array): Uint8Array {
  if (messageHash.length !== 32) {
    throw new Error('Message hash must be 32 bytes')
  }
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes')
  }
  // Para DER, precisamos usar a API de Signature
  // No v3, sign retorna compact format, então convertemos manualmente
  const compact = secp.sign(messageHash, privateKey)
  return compactToDer(compact)
}

/**
 * Converte assinatura compacta (64 bytes) para DER
 */
function compactToDer(compact: Uint8Array): Uint8Array {
  if (compact.length !== 64) {
    throw new Error('Compact signature must be 64 bytes')
  }

  const r = compact.slice(0, 32)
  const s = compact.slice(32, 64)

  // DER encoding
  const rEncoded = encodeInteger(r)
  const sEncoded = encodeInteger(s)

  const length = rEncoded.length + sEncoded.length
  const der = new Uint8Array(2 + length)
  der[0] = 0x30 // SEQUENCE
  der[1] = length
  der.set(rEncoded, 2)
  der.set(sEncoded, 2 + rEncoded.length)

  return der
}

/**
 * Codifica um inteiro em DER
 */
function encodeInteger(value: Uint8Array): Uint8Array {
  // Remover zeros à esquerda
  let start = 0
  while (start < value.length - 1 && value[start] === 0) {
    start++
  }
  const trimmed = value.slice(start)

  // Se o primeiro byte tem bit alto, adicionar 0x00 prefix
  const needsPadding = trimmed[0] >= 0x80
  const length = trimmed.length + (needsPadding ? 1 : 0)

  const encoded = new Uint8Array(2 + length)
  encoded[0] = 0x02 // INTEGER
  encoded[1] = length
  if (needsPadding) {
    encoded[2] = 0x00
    encoded.set(trimmed, 3)
  } else {
    encoded.set(trimmed, 2)
  }

  return encoded
}

/**
 * Verifica assinatura
 *
 * @param signature - Assinatura (compacta 64 bytes ou DER)
 * @param messageHash - Hash da mensagem (32 bytes)
 * @param publicKey - Chave pública (33 ou 65 bytes)
 * @returns true se a assinatura é válida
 */
export function verifySignature(
  signature: Uint8Array,
  messageHash: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  if (messageHash.length !== 32) {
    return false
  }
  try {
    return secp.verify(signature, messageHash, publicKey)
  } catch {
    return false
  }
}

/**
 * Verifica se um escalar é válido (0 < s < n)
 *
 * @param scalar - Escalar a verificar (32 bytes)
 * @returns true se o escalar é válido
 */
export function isValidScalar(scalar: Uint8Array): boolean {
  if (scalar.length !== 32) {
    return false
  }
  const s = bytesToBigInt(scalar)
  return s > 0n && s < N
}

/**
 * Verifica se um ponto está na curva secp256k1
 *
 * @param point - Ponto a verificar (33 ou 65 bytes)
 * @returns true se o ponto é válido
 */
export function isValidPoint(point: Uint8Array): boolean {
  if (point.length !== 33 && point.length !== 65) {
    return false
  }
  try {
    secp.Point.fromHex(uint8ArrayToHex(point))
    return true
  } catch {
    return false
  }
}

/**
 * Retorna o ponto no infinito serializado
 * (Não é um ponto válido para operações, mas útil para comparação)
 */
export function pointAtInfinity(): null {
  return null
}

/**
 * Verifica se um ponto é o ponto no infinito
 */
export function isPointAtInfinity(point: Uint8Array | null): boolean {
  return point === null
}

/**
 * Gera uma chave privada aleatória válida
 */
export function generatePrivateKey(): Uint8Array {
  return secp.utils.randomSecretKey()
}

/**
 * Retorna a ordem da curva (n)
 */
export function getCurveOrder(): bigint {
  return N
}
