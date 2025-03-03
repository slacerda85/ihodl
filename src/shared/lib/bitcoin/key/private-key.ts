import { createHash, randomBytes } from 'node:crypto'
import secp256k1 from 'secp256k1'

export enum Networks {
  livenet = 'livenet',
  testnet = 'testnet',
}

export default class PrivateKey {
  private key: Uint8Array

  constructor(key?: Uint8Array) {
    if (key) {
      this.key = key
    } else {
      // Generate random private key if none provided
      let privateKey: Buffer
      do {
        privateKey = randomBytes(32)
      } while (!secp256k1.privateKeyVerify(privateKey))
      this.key = privateKey
    }
  }

  public getKey(): Uint8Array {
    return this.key
  }

  public toPublicKey(): PublicKey {
    // Generate public key from private key
    const pubKeyBuffer = secp256k1.publicKeyCreate(this.key, true)
    return new PublicKey(pubKeyBuffer)
  }
}

export class PublicKey {
  private key: Uint8Array

  constructor(key: Uint8Array) {
    this.key = key
  }

  public getKey(): Uint8Array {
    return this.key
  }

  public toAddress(network: Networks): Address {
    // Hash public key
    const sha256Hash = createHash('sha256').update(this.key).digest()
    const ripemd160Hash = createHash('ripemd160').update(sha256Hash).digest()

    return new Address(ripemd160Hash, network)
  }
}

export class Address {
  private address: Buffer

  constructor(hash: Buffer, network: Networks) {
    // Add network byte (0x00 for mainnet, 0x6F for testnet)
    const versionByte = network === Networks.livenet ? 0x00 : 0x6f
    let address = Buffer.concat([Buffer.from([versionByte]), hash])

    // Double hash
    const firstSha256 = createHash('sha256').update(address).digest()
    const secondSha256 = createHash('sha256').update(firstSha256).digest()

    // Add checksum
    address = Buffer.concat([address, secondSha256.slice(0, 4)])

    this.address = address
  }

  public getAddress(): Buffer {
    return this.address
  }
}
