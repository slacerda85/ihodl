// Mock for @noble/secp256k1
export const getPublicKey = privateKey => {
  // Mock implementation - return a fixed public key
  return new Uint8Array(33) // Compressed public key
}

export const sign = (message, privateKey) => {
  // Mock implementation - return a fixed signature
  return new Uint8Array(64) // ECDSA signature
}

export const verify = (signature, message, publicKey) => {
  // Mock implementation - always return true for tests
  return true
}

export const utils = {
  randomPrivateKey: () => {
    return new Uint8Array(32) // Random 32-byte private key
  },
  isValidPrivateKey: privateKey => {
    return privateKey.length === 32
  },
}
