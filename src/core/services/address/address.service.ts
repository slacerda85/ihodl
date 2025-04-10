import { bech32 } from 'bech32'
import secp256k1 from 'secp256k1'
import crypto from '@/core/services/crypto'

function createSegwitAddress(publicKey: Uint8Array, version: number = 0): string {
  if (!secp256k1.publicKeyVerify(publicKey)) {
    throw new Error('Invalid public key')
  }
  // Satoshi's Hash160
  const hash = crypto.hash160(publicKey)
  // Convert the hash to words (5-bit groups)
  const programWords = bech32.toWords(hash)
  // Prepend the version byte to the words array
  const words = [version, ...programWords]
  // Encode using Bech32
  const segWitAddress = bech32.encode('bc', words)

  return segWitAddress
}

function createTaprootAddress(publicKey: Uint8Array): string {
  // Check if the public key is valid
  if (!secp256k1.publicKeyVerify(publicKey)) {
    throw new Error('Invalid public key')
  }

  // Hash the public key using SHA256 and then RIPEMD160
  const hash = crypto.hash160(publicKey)

  // Convert the hash to words (5-bit groups)
  const programWords = bech32.toWords(hash)

  // Prepend the version byte (0x01 for Taproot) to the words array
  const words = [0x01, ...programWords]

  // Encode using Bech32
  const taprootAddress = bech32.encode('bc', words)

  return taprootAddress
}
