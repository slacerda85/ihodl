// Mock for @noble/ciphers
export const chacha20poly1305 = {
  seal: (key, nonce, plaintext, associatedData) => {
    // Mock implementation - return encrypted data
    return new Uint8Array(plaintext.length + 16) // +16 for auth tag
  },
  open: (key, nonce, ciphertext, associatedData) => {
    // Mock implementation - return decrypted data
    if (ciphertext.length < 16) return null // Invalid auth tag
    return new Uint8Array(ciphertext.length - 16) // Remove auth tag
  },
}
