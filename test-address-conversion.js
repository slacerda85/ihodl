// Test script for address conversion functions
import { toScriptHash, legacyToScriptHash } from './src/lib/address'

console.log('Testing address conversion functions...')

// Test Bech32 address (P2WPKH)
const bech32Address = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
try {
  const bech32Scripthash = toScriptHash(bech32Address)
  console.log(`Bech32 address: ${bech32Address}`)
  console.log(`Scripthash: ${bech32Scripthash}`)
} catch (error) {
  console.error(`Error converting Bech32 address: ${error}`)
}

// Test legacy address (P2PKH)
const legacyAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
try {
  const legacyScripthash = legacyToScriptHash(legacyAddress)
  console.log(`Legacy address: ${legacyAddress}`)
  console.log(`Scripthash: ${legacyScripthash}`)
} catch (error) {
  console.error(`Error converting legacy address: ${error}`)
}

console.log('Test completed.')
