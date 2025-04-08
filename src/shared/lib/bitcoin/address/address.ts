import { bech32 } from 'bech32'
import { sha256, uint8ArrayToHex } from '@/shared/lib/bitcoin/crypto/crypto'

// Constants for script opcodes
const OP_0 = 0x00
const OP_1 = 0x51

/**
 * Converts a bech32 address to its corresponding output script
 * Only supports native segwit (bc1) addresses
 * @param address - Bitcoin bech32 address
 * @returns The corresponding output script as a Uint8Array
 */
export function toOutputScript(address: string): Uint8Array {
  try {
    // Decode the bech32 address
    const decoded = bech32.decode(address)
    const data = new Uint8Array(bech32.fromWords(decoded.words.slice(1)))
    const version = decoded.words[0]

    // Check for Bitcoin mainnet
    if (decoded.prefix !== 'bc') {
      throw new Error(`Address ${address} has invalid prefix, expected 'bc'`)
    }

    // Handle SegWit v0 addresses (P2WPKH and P2WSH)
    if (version === 0) {
      if (data.length === 20) {
        // P2WPKH: OP_0 0x14 <20-byte hash>
        const output = new Uint8Array(2 + data.length)
        output[0] = OP_0
        output[1] = 0x14 // Push 20 bytes
        output.set(data, 2)
        return output
      }

      if (data.length === 32) {
        // P2WSH: OP_0 0x20 <32-byte hash>
        const output = new Uint8Array(2 + data.length)
        output[0] = OP_0
        output[1] = 0x20 // Push 32 bytes
        output.set(data, 2)
        return output
      }
    }
    // Handle SegWit v1 addresses (P2TR - Taproot)
    else if (version === 1 && data.length === 32) {
      // P2TR: OP_1 0x20 <32-byte pubkey>
      const output = new Uint8Array(2 + data.length)
      output[0] = OP_1
      output[1] = 0x20 // Push 32 bytes
      output.set(data, 2)
      return output
    }

    throw new Error(`Address ${address} has no matching script`)
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error(`Invalid bech32 address: ${address}`)
  }
}

/**
 * Converts a Bitcoin address to scriptHash format required by Electrum servers
 * @param address - Bitcoin bech32 address
 * @returns scriptHash as a hex string
 */
export function addressToScriptHash(address: string): string {
  // Get output script as Uint8Array
  const script = toOutputScript(address)

  // Hash the script using our sha256
  const hash = sha256(script)

  // Reverse the hash (required by Electrum protocol)
  const reversedHash = new Uint8Array(hash.length)
  for (let i = 0; i < hash.length; i++) {
    reversedHash[i] = hash[hash.length - 1 - i]
  }

  // Convert to hex string
  return uint8ArrayToHex(reversedHash)
}
