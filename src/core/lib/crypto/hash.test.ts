import { createHash } from './hash'

describe('createHash', () => {
  it('should create sha256 hash', () => {
    const hash = createHash('sha256').update('test').digest('hex')
    expect(hash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08')
  })

  it('should create sha512 hash', () => {
    const hash = createHash('sha512').update('test').digest('hex')
    expect(hash).toBe(
      'ee26b0dd4af7e749aa1a8ee3c10ae9923f618980772e473f8819a5d4940e0db27ac185f8a0e1d5f84f88bc887fd67b143732c304cc5fa9ad8e6f57f50028a8ff',
    )
  })
})
