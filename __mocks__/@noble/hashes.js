// Mock for @noble/hashes
export const hmac = {
  create: () => ({
    update: () => ({
      digest: () => new Uint8Array(32),
    }),
  }),
}

export const sha256 = () => new Uint8Array(32)
export const sha512 = () => new Uint8Array(64)

export const ripemd160 = {
  create: () => ({
    update: () => ({
      digest: () => new Uint8Array(20),
    }),
  }),
}
