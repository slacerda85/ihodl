import { sha256 as nobleSha256 } from '@noble/hashes/sha2'
import { sha512 as nobleSha512 } from '@noble/hashes/sha2'
import { sha384 } from '@noble/hashes/sha2'
import { ripemd160 } from '@noble/hashes/legacy'

// Type definitions
type Encoding = 'hex' | 'base64' | 'latin1' | 'buffer' | 'utf8'
type BinaryLike = string | Uint8Array | Buffer

// Normalize algorithm names
function normalizeAlgorithm(algorithm: string): string {
  return algorithm.toLowerCase().replace('-', '')
}

// Hash algorithm implementations
const hashAlgorithms: { [key: string]: any } = {
  sha256: nobleSha256,
  sha512: nobleSha512,
  sha384: sha384,
  ripemd160: ripemd160,
}

class Hash {
  private algorithm: string
  private hasher: any
  private digested: boolean = false

  constructor(algorithm: string) {
    this.algorithm = normalizeAlgorithm(algorithm)
    const hashImpl = hashAlgorithms[this.algorithm]
    if (!hashImpl) {
      throw new Error(`Unsupported hash algorithm: ${algorithm}`)
    }
    this.hasher = hashImpl.create()
  }

  update(data: BinaryLike, inputEncoding?: Encoding): Hash {
    if (this.digested) {
      throw new Error('Hash already digested')
    }

    let buffer: Uint8Array
    if (typeof data === 'string') {
      const encoding = inputEncoding || 'utf8'
      if (encoding === 'hex') {
        buffer = new Uint8Array(data.length / 2)
        for (let i = 0; i < data.length; i += 2) {
          buffer[i / 2] = parseInt(data.substr(i, 2), 16)
        }
      } else if (encoding === 'base64') {
        buffer = Uint8Array.from(atob(data), c => c.charCodeAt(0))
      } else if (encoding === 'latin1') {
        buffer = new Uint8Array(data.length)
        for (let i = 0; i < data.length; i++) {
          buffer[i] = data.charCodeAt(i) & 0xff
        }
      } else {
        // utf8
        buffer = new TextEncoder().encode(data)
      }
    } else if (data instanceof Uint8Array) {
      buffer = data
    } else if (Buffer.isBuffer(data)) {
      buffer = new Uint8Array(data)
    } else {
      throw new Error('Invalid data type')
    }

    this.hasher.update(buffer)
    return this
  }

  digest(encoding?: Encoding): Buffer | string {
    if (this.digested) {
      throw new Error('Hash already digested')
    }
    this.digested = true

    const result = this.hasher.digest()
    const buffer = Buffer.from(result)

    if (!encoding || encoding === 'buffer') {
      return buffer
    }

    if (encoding === 'hex') {
      return buffer.toString('hex')
    } else if (encoding === 'base64') {
      return buffer.toString('base64')
    } else if (encoding === 'latin1') {
      return buffer.toString('latin1')
    } else {
      throw new Error(`Unsupported encoding: ${encoding}`)
    }
  }

  copy(): Hash {
    // For simplicity, since noble hashes don't have copy, create a new one
    // In a full implementation, we'd need to keep track of state
    throw new Error('Copy not implemented yet')
  }
}

export function createHash(algorithm: string): Hash {
  return new Hash(algorithm)
}
