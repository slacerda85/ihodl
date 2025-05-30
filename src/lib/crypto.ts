import base58 from 'bs58'
import { bech32, bech32m } from 'bech32'
import * as Crypto from 'expo-crypto'
import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha512'
import { sha256 as nobleSha256 } from '@noble/hashes/sha256'
import { ripemd160 } from '@noble/hashes/ripemd160'
import { randomUUID as expoRandomUUID } from 'expo-crypto'

// hash functions
function createEntropy(size: number): Uint8Array {
  return Crypto.getRandomValues(new Uint8Array(size))
}
function hmacSeed(seed: Uint8Array): Uint8Array {
  // cant use Buffer
  const extendedSeed = hmac.create(sha512, 'Bitcoin seed').update(seed).digest()

  return extendedSeed

  // const key = Buffer.from(new TextEncoder().encode("Bitcoin seed"));
  // return createHmac("sha512", key).update(Buffer.from(seed)).digest();
}

function arrayToHex(array: Uint8Array): string {
  return Array.from(array)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function hmacSHA512(chainCode: Uint8Array, data: Uint8Array): Uint8Array {
  // cant use Buffer
  return hmac.create(sha512, chainCode).update(data).digest()
}
function sha256(key: Uint8Array): Uint8Array {
  return nobleSha256(key)
}

function hash256(key: Uint8Array): Uint8Array {
  return sha256(sha256(key))
}

function hash160(buffer: Uint8Array): Uint8Array {
  return ripemd160.create().update(sha256(buffer)).digest()
}

function createChecksum(key: Uint8Array): Uint8Array {
  const firstSha = sha256(key)
  const secondSha = sha256(firstSha)
  return secondSha.subarray(0, 4)
}

// old base58 encoding
function toBase58(buffer: Uint8Array): string {
  return base58.encode(buffer)
}

// old base58 decoding
function fromBase58(base58String: string): Uint8Array {
  return base58.decode(base58String)
}

// Função para codificar em Bech32 ou Bech32m
function encode(data: Buffer, prefix: string, version: number): string {
  const dataArray = bech32.toWords(data)

  // Escolhe o método de codificação com base na versão
  if (version === 0) {
    return bech32.encode(prefix, dataArray)
  } else {
    return bech32m.encode(prefix, dataArray)
  }
}

// Função para decodificar de Bech32 ou Bech32m
function decode(bech32String: string): { prefix: string; data: Buffer; version: number } {
  try {
    const { prefix, words } = bech32.decode(bech32String)
    // Se o checksum for válido para Bech32
    return { prefix, data: Buffer.from(bech32.fromWords(words)), version: 0 }
  } catch {
    try {
      // Tenta Bech32m se Bech32 falhar
      const { prefix, words } = bech32m.decode(bech32String)
      return { prefix, data: Buffer.from(bech32.fromWords(words)), version: 1 }
    } catch {
      throw new Error('Não é um endereço Bech32 ou Bech32m válido')
    }
  }
}

function hexToUint8Array(hexString: string): Uint8Array {
  // Remove 0x prefix if present
  hexString = hexString.replace('0x', '')

  // Match every two characters (one byte)
  const matches = hexString.match(/.{1,2}/g)

  if (!matches) {
    throw new Error('Invalid hex string')
  }

  // Convert each pair of characters to a number and create Uint8Array
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)))
}

function uint8ArrayToHex(uint8Array: Uint8Array): string {
  return uint8Array.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')
}

function randomUUID() {
  return expoRandomUUID()
}

export {
  createEntropy,
  hmacSeed,
  arrayToHex,
  hmacSHA512,
  sha256,
  hash256,
  hash160,
  createChecksum,
  toBase58,
  fromBase58,
  encode,
  decode,
  hexToUint8Array,
  uint8ArrayToHex,
  randomUUID,
}
