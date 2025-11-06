// Mock for @noble/hashes/hmac
export const hmac = {
  create: (hashFn, key) => ({
    update: data => ({
      digest: () => new Uint8Array(32),
    }),
  }),
}
