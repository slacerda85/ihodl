import { fromBase58 } from '@/shared/lib/bitcoin/crypto'
import { bech32, bech32m } from 'bech32'
import { Network } from '../networks'

// Convert 5-bit words to 8-bit bytes
function from5to8(words: number[]): Uint8Array {
  let value = 0
  let bits = 0
  const result: number[] = []

  for (const word of words) {
    if (word < 0 || word > 31) throw new Error('Invalid 5-bit word')
    value = (value << 5) | word
    bits += 5
    while (bits >= 8) {
      bits -= 8
      result.push((value >> bits) & 0xff)
    }
  }

  // Ensure no leftover bits (valid addresses should align perfectly)
  if (bits > 0) throw new Error('Invalid padding in Bech32 data')
  return new Uint8Array(result)
}

// Main function to convert address to output script
export function toOutputScript(address: string, network: Network): Uint8Array {
  // 1. Try Base58Check (P2PKH or P2SH)
  try {
    const payload = fromBase58(address)
    if (payload.length !== 21) throw new Error('Invalid Base58 payload length')

    const version = payload[0]
    const hash = payload.slice(1) // 20-byte hash

    if (version === network.pubKeyHash) {
      // P2PKH: OP_DUP (0x76) OP_HASH160 (0xa9) <20-byte hash> (0x14) OP_EQUALVERIFY (0x88) OP_CHECKSIG (0xac)
      return new Uint8Array([0x76, 0xa9, 0x14, ...hash, 0x88, 0xac])
    } else if (version === network.scriptHash) {
      // P2SH: OP_HASH160 (0xa9) <20-byte hash> (0x14) OP_EQUAL (0x87)
      return new Uint8Array([0xa9, 0x14, ...hash, 0x87])
    }
    // If version doesn’t match, proceed to Bech32
  } catch (e) {
    console.log(e)
    // Not a valid Base58Check address; move to Bech32
  }

  // 2. Try Bech32 or Bech32m (SegWit/Taproot)
  let prefix: string
  let words: number[]
  try {
    const result = bech32.decode(address)
    prefix = result.prefix
    words = result.words
  } catch (e) {
    console.warn(e)
    try {
      const result = bech32m.decode(address)
      prefix = result.prefix
      words = result.words
    } catch (e) {
      console.warn(e)
      throw new Error('Invalid address: not a valid Base58 or Bech32/Bech32m address')
    }
  }

  // Validate network
  if (prefix !== network.bech32) {
    throw new Error(`Invalid Bech32 prefix: expected '${network.bech32}', got '${prefix}'`)
  }

  // Extract witness version and program
  const version = words[0]
  if (version < 0 || version > 16) throw new Error('Invalid witness version')
  const program5bit = words.slice(1)
  const program = from5to8(program5bit)

  // Construct SegWit/Taproot script
  const versionOpcode = version === 0 ? 0x00 : 0x50 + version // 0x00 for v0, 0x51–0x60 for v1–v16
  return new Uint8Array([versionOpcode, program.length, ...program])
}

// Example usage:
/*
const mainnet: Network = {
  base58Prefixes: { pubKeyHash: 0, scriptHash: 5 },
  bech32: 'bc'
};
const p2pkhScript = toOutputScript('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', mainnet);
const p2shScript = toOutputScript('3EktnHQD7RiAE6uzMj2ZifT9YgRrkSgzQX', mainnet);
const p2wpkhScript = toOutputScript('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', mainnet);
*/
