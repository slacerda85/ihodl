import {
  generateKey,
  ecdh,
  hkdfExtract,
  encryptWithAD,
  decryptWithAD,
  initializeHandshakeState,
  actOneSend,
  actOneReceive,
  actTwoSend,
  actTwoReceive,
  actThreeSend,
  actThreeReceive,
  encryptMessage,
  decryptMessage,
} from './transport'
import { HandshakeError } from '@/core/models/lightning/transport'

// Helper function to convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  if (hex.startsWith('0x')) hex = hex.slice(2)
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

// Helper function to convert Uint8Array to hex string
function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

describe('Transport Protocol Tests', () => {
  describe('Utility Functions', () => {
    test('generateKey produces valid secp256k1 keypair', () => {
      const key = generateKey()
      expect(key.priv).toHaveLength(32)
      expect(key.pub).toHaveLength(33)
      expect(key.serializeCompressed()).toEqual(key.pub)
    })

    test('ecdh computes correct shared secret', () => {
      const priv = hexToBytes('0x1111111111111111111111111111111111111111111111111111111111111111')
      const pub = hexToBytes('0x028d7500dd4c12685d1f568b4c2b5048e8534b873319f3a8daa612b469132ec7f7')
      const expected = hexToBytes(
        '0x95d390e719f4165eef7958084eec08ac6c32f44660b959e2ac0f60c3c82e9529',
      )
      const result = ecdh(priv, pub)
      expect(bytesToHex(result)).toBe(bytesToHex(expected))
    })

    test('hkdfExtract produces correct output', () => {
      const salt = hexToBytes('0x2640f52eebcd9e882958951c794250eedb28002c05d7dc2ea0f195406042caf1')
      const ikm = hexToBytes('0x1e2fb3c8fe8fb9f262f649f64d26ecf0f2c0a805a767cf02dc2d77a6ef1fdcc3')
      const [ck, temp_k1] = hkdfExtract(salt, ikm)
      expect(bytesToHex(ck)).toBe(
        '0xb61ec1191326fa240decc9564369dbb3ae2b34341d1e11ad64ed89f89180582f',
      )
      expect(bytesToHex(temp_k1)).toBe(
        '0xe68f69b7f096d7917245f5e5cf8ae1595febe4d4644333c99f9c4a1282031c9f',
      )
    })

    test('encryptWithAD and decryptWithAD round trip', () => {
      const key = hexToBytes('0xe68f69b7f096d7917245f5e5cf8ae1595febe4d4644333c99f9c4a1282031c9f')
      const nonce = 0
      const ad = hexToBytes('0x9e0e7de8bb75554f21db034633de04be41a2b8a18da7a319a03c803bf02b396c')
      const plaintext = new Uint8Array(0)
      const ciphertext = encryptWithAD(key, nonce, ad, plaintext)
      const decrypted = decryptWithAD(key, nonce, ad, ciphertext)
      expect(decrypted).toEqual(plaintext)
    })
  })

  describe('Handshake State Initialization', () => {
    test('initializeHandshakeState for initiator', () => {
      const rs = hexToBytes('0x028d7500dd4c12685d1f568b4c2b5048e8534b873319f3a8daa612b469132ec7f7')
      const state = initializeHandshakeState(rs)
      const expectedH = hexToBytes(
        '0xd1fbf6dee4f686f132fd702c4abf8fba4bb420d89d2a048a3c4f4c092e37b676',
      )
      expect(bytesToHex(state.h)).toBe(bytesToHex(expectedH))
    })

    test('initializeHandshakeState for responder', () => {
      const ls = {
        priv: hexToBytes('0x2121212121212121212121212121212121212121212121212121212121212121'),
        pub: hexToBytes('0x028d7500dd4c12685d1f568b4c2b5048e8534b873319f3a8daa612b469132ec7f7'),
        serializeCompressed: () =>
          hexToBytes('0x028d7500dd4c12685d1f568b4c2b5048e8534b873319f3a8daa612b469132ec7f7'),
      }
      const state = initializeHandshakeState(undefined, ls)
      const expectedH = hexToBytes(
        '0xd1fbf6dee4f686f132fd702c4abf8fba4bb420d89d2a048a3c4f4c092e37b676',
      )
      expect(bytesToHex(state.h)).toBe(bytesToHex(expectedH))
    })
  })

  describe('Initiator Tests', () => {
    test('transport-initiator successful handshake', () => {
      // Setup keys
      const rs = hexToBytes('0x028d7500dd4c12685d1f568b4c2b5048e8534b873319f3a8daa612b469132ec7f7')
      const ls = {
        priv: hexToBytes('0x1111111111111111111111111111111111111111111111111111111111111111'),
        pub: hexToBytes('0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa'),
        serializeCompressed: () =>
          hexToBytes('0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa'),
      }
      const e = {
        priv: hexToBytes('0x1212121212121212121212121212121212121212121212121212121212121212'),
        pub: hexToBytes('0x036360e856310ce5d294e8be33fc807077dc56ac80d95d9cd4ddbd21325eff73f7'),
        serializeCompressed: () =>
          hexToBytes('0x036360e856310ce5d294e8be33fc807077dc56ac80d95d9cd4ddbd21325eff73f7'),
      }

      // Act One
      let state = initializeHandshakeState(rs)
      const { message: act1Msg, newState: state1 } = actOneSend(state, rs, e)
      expect(bytesToHex(act1Msg)).toBe(
        '0x00036360e856310ce5d294e8be33fc807077dc56ac80d95d9cd4ddbd21325eff73f78a475f6c2158db3d3ec7ccdc16954b91',
      )
      state = state1

      // Act Two (simulated input)
      const act2Input = hexToBytes(
        '0x0002466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f277cd1aa3afc805b5687494f8313aa44c4',
      )
      const result2 = actTwoReceive(state, act2Input, e)
      expect(result2).not.toHaveProperty('error')
      state = (result2 as any).newState

      // Act Three
      const { message: act3Msg, keys } = actThreeSend(
        state,
        ls,
        hexToBytes('0x02466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27'),
      )
      expect(bytesToHex(act3Msg)).toBe(
        '0x000649705d4a395cd5ecaba9572a449fed4e2578d1100dc1b9dc65dfe957362bdbe68eb9cc25d671c4c372399789fc7cd8ab5c15fd5e1efac127c291ad8d3d71a33b',
      )
      expect(bytesToHex(keys.sk)).toBe(
        '0x000e6742eb7930b5fe917d438bb5a1e6c39bdb53e05eda6ccb77e6ae018157e4',
      )
      expect(bytesToHex(keys.rk)).toBe(
        '0x2e743d741733e1ec836e7c9c1c42fe6d5b5f38a6956227af9a326d1df4317362',
      )
    })

    test('transport-initiator act2 short read test', () => {
      const rs = hexToBytes('0x028d7500dd4c12685d1f568b4c2b5048e8534b873319f3a8daa612b469132ec7f7')
      const e = {
        priv: hexToBytes('0x1212121212121212121212121212121212121212121212121212121212121212'),
        pub: hexToBytes('0x036360e856310ce5d294e8be33fc807077dc56ac80d95d9cd4ddbd21325eff73f7'),
        serializeCompressed: () =>
          hexToBytes('0x036360e856310ce5d294e8be33fc807077dc56ac80d95d9cd4ddbd21325eff73f7'),
      }
      let state = initializeHandshakeState(rs)
      const { newState } = actOneSend(state, rs)
      state = newState
      const act2Input = hexToBytes(
        '0x0002466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f276e2470b93aac583c9ef6eafca3f730',
      ) // short
      const result = actTwoReceive(state, act2Input, e)
      expect(result).toHaveProperty('error', HandshakeError.ACT2_READ_FAILED)
    })

    test('transport-initiator act2 bad version test', () => {
      const rs = hexToBytes('0x028d7500dd4c12685d1f568b4c2b5048e8534b873319f3a8daa612b469132ec7f7')
      const e = {
        priv: hexToBytes('0x1212121212121212121212121212121212121212121212121212121212121212'),
        pub: hexToBytes('0x036360e856310ce5d294e8be33fc807077dc56ac80d95d9cd4ddbd21325eff73f7'),
        serializeCompressed: () =>
          hexToBytes('0x036360e856310ce5d294e8be33fc807077dc56ac80d95d9cd4ddbd21325eff73f7'),
      }
      let state = initializeHandshakeState(rs)
      const { newState } = actOneSend(state, rs)
      state = newState
      const act2Input = hexToBytes(
        '0x0102466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f276e2470b93aac583c9ef6eafca3f730ae',
      )
      const result = actTwoReceive(state, act2Input, e)
      expect(result).toHaveProperty('error', HandshakeError.ACT2_BAD_VERSION)
    })

    test('transport-initiator act2 bad key serialization test', () => {
      const rs = hexToBytes('0x028d7500dd4c12685d1f568b4c2b5048e8534b873319f3a8daa612b469132ec7f7')
      const e = {
        priv: hexToBytes('0x1212121212121212121212121212121212121212121212121212121212121212'),
        pub: hexToBytes('0x036360e856310ce5d294e8be33fc807077dc56ac80d95d9cd4ddbd21325eff73f7'),
        serializeCompressed: () =>
          hexToBytes('0x036360e856310ce5d294e8be33fc807077dc56ac80d95d9cd4ddbd21325eff73f7'),
      }
      let state = initializeHandshakeState(rs)
      const { newState } = actOneSend(state, rs)
      state = newState
      const act2Input = hexToBytes(
        '0x0004466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f276e2470b93aac583c9ef6eafca3f730ae',
      )
      const result = actTwoReceive(state, act2Input, e)
      expect(result).toHaveProperty('error', HandshakeError.ACT2_BAD_PUBKEY)
    })

    test('transport-initiator act2 bad MAC test', () => {
      const rs = hexToBytes('0x028d7500dd4c12685d1f568b4c2b5048e8534b873319f3a8daa612b469132ec7f7')
      const e = {
        priv: hexToBytes('0x1212121212121212121212121212121212121212121212121212121212121212'),
        pub: hexToBytes('0x036360e856310ce5d294e8be33fc807077dc56ac80d95d9cd4ddbd21325eff73f7'),
        serializeCompressed: () =>
          hexToBytes('0x036360e856310ce5d294e8be33fc807077dc56ac80d95d9cd4ddbd21325eff73f7'),
      }
      let state = initializeHandshakeState(rs)
      const { newState } = actOneSend(state, rs)
      state = newState
      const act2Input = hexToBytes(
        '0x0002466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f276e2470b93aac583c9ef6eafca3f730af',
      )
      const result = actTwoReceive(state, act2Input, e)
      expect(result).toHaveProperty('error', HandshakeError.ACT2_BAD_TAG)
    })
  })

  describe('Responder Tests', () => {
    test('transport-responder successful handshake', () => {
      const ls = {
        priv: hexToBytes('0x2121212121212121212121212121212121212121212121212121212121212121'),
        pub: hexToBytes('0x028d7500dd4c12685d1f568b4c2b5048e8534b873319f3a8daa612b469132ec7f7'),
        serializeCompressed: () =>
          hexToBytes('0x028d7500dd4c12685d1f568b4c2b5048e8534b873319f3a8daa612b469132ec7f7'),
      }
      const e = {
        priv: hexToBytes('0x2222222222222222222222222222222222222222222222222222222222222222'),
        pub: hexToBytes('0x02466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27'),
        serializeCompressed: () =>
          hexToBytes('0x02466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27'),
      }

      let state = initializeHandshakeState(undefined, ls)

      // Act One input
      const act1Input = hexToBytes(
        '0x00036360e856310ce5d294e8be33fc807077dc56ac80d95d9cd4ddbd21325eff73f78a475f6c2158db3d3ec7ccdc16954b91',
      )
      const result1 = actOneReceive(state, act1Input, ls)
      expect(result1).not.toHaveProperty('error')
      state = (result1 as any).newState

      // Act Two
      const { message: act2Msg, newState: state2 } = actTwoSend(
        state,
        hexToBytes('0x036360e856310ce5d294e8be33fc807077dc56ac80d95d9cd4ddbd21325eff73f7'),
        e,
      )
      expect(bytesToHex(act2Msg)).toBe(
        '0x0002466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f277cd1aa3afc805b5687494f8313aa44c4',
      )
      state = state2

      // Act Three input
      const act3Input = hexToBytes(
        '0x000649705d4a395cd5ecaba9572a449fed4e2578d1100dc1b9dc65dfe957362bdbe68eb9cc25d671c4c372399789fc7cd8ab5c15fd5e1efac127c291ad8d3d71a33b',
      )
      const result3 = actThreeReceive(
        state,
        act3Input,
        e,
        hexToBytes('0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa'),
      )
      expect(result3).not.toHaveProperty('error')
      const keys = (result3 as any).keys
      expect(bytesToHex(keys.rk)).toBe(
        '0x000e6742eb7930b5fe917d438bb5a1e6c39bdb53e05eda6ccb77e6ae018157e4',
      )
      expect(bytesToHex(keys.sk)).toBe(
        '0x2e743d741733e1ec836e7c9c1c42fe6d5b5f38a6956227af9a326d1df4317362',
      )
    })

    // Add more responder error tests similarly...
  })

  describe('Message Encryption Tests', () => {
    test('transport-message test', () => {
      const ck = hexToBytes('0x000e6742eb7930b5fe917d438bb5a1e6c39bdb53e05eda6ccb77e6ae018157e4')
      const sk = hexToBytes('0x000e6742eb7930b5fe917d438bb5a1e6c39bdb53e05eda6ccb77e6ae018157e4')
      const rk = hexToBytes('0x2e743d741733e1ec836e7c9c1c42fe6d5b5f38a6956227af9a326d1df4317362')
      let keys = {
        sk,
        rk,
        sn: 0,
        rn: 0,
        sck: ck,
        rck: ck,
      }

      const message = new TextEncoder().encode('hello')

      // First message
      const { encrypted: enc0, newKeys: keys1 } = encryptMessage(keys, message)
      expect(bytesToHex(enc0)).toBe(
        '0x0213fd0b397901a7d09f034b124e63068ccd68608ac222e2479e9486ce9fa47356dcfcc4c4254d',
      )
      keys = keys1

      // Second message
      const { encrypted: enc1, newKeys: keys2 } = encryptMessage(keys, message)
      expect(bytesToHex(enc1)).toBe(
        '0x9ad49c4b146f81f53bf09d0155ef9f9792fa42251c0fbf883f6689d430fc368a3d7b6020bdcdf6',
      )
      keys = keys2

      // Decrypt first message
      const decResult0 = decryptMessage(keys, enc0)
      expect(decResult0).not.toHaveProperty('error')
      const { message: dec0, newKeys: keysDec0 } = decResult0 as any
      expect([...dec0]).toEqual([...message])
      keys = keysDec0

      // Decrypt second message
      const decResult1 = decryptMessage(keys, enc1)
      expect(decResult1).not.toHaveProperty('error')
      const { message: dec1 } = decResult1 as any
      expect([...dec1]).toEqual([...message])
    })
  })
})
