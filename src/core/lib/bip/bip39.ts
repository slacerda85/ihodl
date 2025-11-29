import { sha256 } from '@noble/hashes/sha2.js'
import { sha512 } from '@noble/hashes/sha2.js'
import { pbkdf2, pbkdf2Async } from '@noble/hashes/pbkdf2.js'
import { randomBytes } from '@/core/lib/crypto'
import wordList from 'bip39/src/wordlists/english.json'

let DEFAULT_WORDLIST: string[] | undefined = wordList

const INVALID_MNEMONIC = 'Invalid mnemonic'
const INVALID_ENTROPY = 'Invalid entropy'
const INVALID_CHECKSUM = 'Invalid mnemonic checksum'
const WORDLIST_REQUIRED =
  'A wordlist is required but a default could not be found.\n' +
  'Please pass a 2048 word array explicitly.'

// Helper functions for Uint8Array conversions
function stringToUint8Array(str: string, encoding: 'utf8' | 'hex' = 'utf8'): Uint8Array {
  if (encoding === 'hex') {
    if (str.length % 2 !== 0) {
      throw new Error('Invalid hex string')
    }
    const bytes = new Uint8Array(str.length / 2)
    for (let i = 0; i < str.length; i += 2) {
      bytes[i / 2] = parseInt(str.substring(i, i + 2), 16)
    }
    return bytes
  } else {
    return new TextEncoder().encode(str)
  }
}

function uint8ArrayToString(bytes: Uint8Array, encoding: 'utf8' | 'hex' = 'utf8'): string {
  if (encoding === 'hex') {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  } else {
    return new TextDecoder().decode(bytes)
  }
}

function normalize(str?: string): string {
  return (str || '').normalize('NFKD')
}

function lpad(str: string, padString: string, length: number): string {
  while (str.length < length) {
    str = padString + str
  }
  return str
}

function binaryToByte(bin: string): number {
  return parseInt(bin, 2)
}

function bytesToBinary(bytes: number[]): string {
  return bytes.map((x: number): string => lpad(x.toString(2), '0', 8)).join('')
}

function deriveChecksumBits(entropyArray: Uint8Array): string {
  const ENT = entropyArray.length * 8
  const CS = ENT / 32
  const hash = sha256(entropyArray)
  return bytesToBinary(Array.from(hash)).slice(0, CS)
}

function salt(password?: string): string {
  return 'mnemonic' + (password || '')
}

export function mnemonicToSeedSync(mnemonic: string, password?: string): Uint8Array {
  const mnemonicBuffer = stringToUint8Array(normalize(mnemonic))
  const saltBuffer = stringToUint8Array(salt(normalize(password)))
  return pbkdf2(sha512, mnemonicBuffer, saltBuffer, {
    c: 2048,
    dkLen: 64,
  })
}

export function mnemonicToSeed(mnemonic: string, password?: string): Promise<Uint8Array> {
  const mnemonicBuffer = stringToUint8Array(normalize(mnemonic))
  const saltBuffer = stringToUint8Array(salt(normalize(password)))
  return pbkdf2Async(sha512, mnemonicBuffer, saltBuffer, {
    c: 2048,
    dkLen: 64,
  })
}

export function mnemonicToEntropy(mnemonic: string, wordlist?: string[]): string {
  wordlist = wordlist || DEFAULT_WORDLIST
  if (!wordlist) {
    throw new Error(WORDLIST_REQUIRED)
  }

  const words = normalize(mnemonic).split(' ')
  if (words.length % 3 !== 0) {
    throw new Error(INVALID_MNEMONIC)
  }

  // convert word indices to 11 bit binary strings
  const bits = words
    .map((word: string): string => {
      const index = wordlist!.indexOf(word)
      if (index === -1) {
        throw new Error(INVALID_MNEMONIC)
      }

      return lpad(index.toString(2), '0', 11)
    })
    .join('')

  // split the binary string into ENT/CS
  const dividerIndex = Math.floor(bits.length / 33) * 32
  const entropyBits = bits.slice(0, dividerIndex)
  const checksumBits = bits.slice(dividerIndex)

  // calculate the checksum and compare
  const entropyBytes = entropyBits.match(/(.{1,8})/g)!.map(binaryToByte)
  if (entropyBytes.length < 16) {
    throw new Error(INVALID_ENTROPY)
  }
  if (entropyBytes.length > 32) {
    throw new Error(INVALID_ENTROPY)
  }
  if (entropyBytes.length % 4 !== 0) {
    throw new Error(INVALID_ENTROPY)
  }

  const entropy = new Uint8Array(entropyBytes)
  const newChecksum = deriveChecksumBits(entropy)
  if (newChecksum !== checksumBits) {
    throw new Error(INVALID_CHECKSUM)
  }

  return uint8ArrayToString(entropy, 'hex')
}

export function entropyToMnemonic(entropy: Uint8Array | string, wordlist?: string[]): string {
  if (typeof entropy === 'string') {
    entropy = stringToUint8Array(entropy, 'hex')
  }

  wordlist = wordlist || DEFAULT_WORDLIST
  if (!wordlist) {
    throw new Error(WORDLIST_REQUIRED)
  }

  // 128 <= ENT <= 256
  if (entropy.length < 12) {
    throw new TypeError(INVALID_ENTROPY)
  }
  if (entropy.length > 24) {
    throw new TypeError(INVALID_ENTROPY)
  }
  if (entropy.length % 4 !== 0) {
    throw new TypeError(INVALID_ENTROPY)
  }

  const entropyBits = bytesToBinary(Array.from(entropy))
  const checksumBits = deriveChecksumBits(entropy)

  const bits = entropyBits + checksumBits
  const chunks = bits.match(/(.{1,11})/g)!
  const words = chunks.map((binary: string): string => {
    const index = binaryToByte(binary)
    return wordlist![index]
  })

  return wordlist[0] === '\u3042\u3044\u3053\u304f\u3057\u3093' // Japanese wordlist
    ? words.join('\u3000')
    : words.join(' ')
}

export function generateMnemonic(
  strength?: number,
  rng?: (size: number) => Uint8Array,
  wordlist?: string[],
): string {
  strength = strength || 128
  if (strength % 32 !== 0) {
    throw new TypeError(INVALID_ENTROPY)
  }
  rng = rng || randomBytes
  return entropyToMnemonic(rng(strength / 8), wordlist)
}

export function validateMnemonic(mnemonic: string, wordlist?: string[]): boolean {
  try {
    mnemonicToEntropy(mnemonic, wordlist)
  } catch (e) {
    if (e instanceof TypeError) {
      return false
    }
    if (e instanceof Error) {
      return false
    }
  }

  return true
}
