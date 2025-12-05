// BIP (Bitcoin Improvement Proposals) implementations
// Centralized exports for all BIP-related functionality

// BIP-39: Mnemonic code for generating deterministic keys
export * as bip39 from './bip39'

// BIP-173/350: Bech32/Bech32m address format
export * as bech32 from './bech32'
export * as bech32m from './bech32m'

// BIP-340: Schnorr signatures for secp256k1
export * as bip340 from './bip340'
