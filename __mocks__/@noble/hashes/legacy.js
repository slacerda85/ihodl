// Mock for @noble/hashes/legacy
export const ripemd160 = {
  create: () => ({
    update: data => ({
      digest: () => new Uint8Array(20),
    }),
  }),
}
