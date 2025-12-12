// BOLT #3: HTLC Scripts - Unit Tests
// Testes para verificar a corretude dos scripts HTLC conforme especificação

import { offeredHtlcScript, receivedHtlcScript } from '../commitment'
import { createOfferedHtlcScript, createReceivedHtlcScript } from '../transaction'
import { uint8ArrayToHex } from '@/core/lib/utils/utils'
import { OpCode } from '@/core/models/opcodes'
import { hash160 } from '@/core/lib/crypto'

// Test vectors
const mockRevocationPubkey = new Uint8Array(33).fill(0x02) // Dummy compressed pubkey
const mockLocalHtlcPubkey = new Uint8Array(33).fill(0x03)
const mockRemoteHtlcPubkey = new Uint8Array(33).fill(0x04)
const mockPaymentHash = new Uint8Array(32).fill(0xab) // SHA256(preimage)
const mockCltvExpiry = 600000 // Block height

describe('BOLT #3 HTLC Scripts', () => {
  describe('offeredHtlcScript', () => {
    it('should create valid offered HTLC script without anchors', () => {
      const script = offeredHtlcScript(
        mockRevocationPubkey,
        mockLocalHtlcPubkey,
        mockRemoteHtlcPubkey,
        mockPaymentHash,
        false,
      )

      // Script deve começar com OP_DUP OP_HASH160
      expect(script[0]).toBe(OpCode.OP_DUP)
      expect(script[1]).toBe(OpCode.OP_HASH160)

      // Próximo byte deve ser 0x14 (push 20 bytes)
      expect(script[2]).toBe(0x14)

      // Bytes 3-22 devem ser RIPEMD160(SHA256(revocationPubkey))
      const expectedHash = hash160(mockRevocationPubkey)
      const scriptHash = script.slice(3, 23)
      expect(uint8ArrayToHex(scriptHash)).toBe(uint8ArrayToHex(expectedHash))

      // OP_EQUAL deve vir depois do hash
      expect(script[23]).toBe(OpCode.OP_EQUAL)

      // OP_IF
      expect(script[24]).toBe(OpCode.OP_IF)

      // OP_CHECKSIG
      expect(script[25]).toBe(OpCode.OP_CHECKSIG)

      // OP_ELSE
      expect(script[26]).toBe(OpCode.OP_ELSE)

      // Script deve terminar com OP_ENDIF
      expect(script[script.length - 1]).toBe(OpCode.OP_ENDIF)

      // Sem anchors, não deve ter OP_CHECKSEQUENCEVERIFY próximo ao final
      const lastBytes = script.slice(-5)
      expect(lastBytes).not.toContain(OpCode.OP_CHECKSEQUENCEVERIFY)
    })

    it('should create valid offered HTLC script with anchors', () => {
      const script = offeredHtlcScript(
        mockRevocationPubkey,
        mockLocalHtlcPubkey,
        mockRemoteHtlcPubkey,
        mockPaymentHash,
        true, // with anchors
      )

      // Com anchors, deve ter OP_1 OP_CHECKSEQUENCEVERIFY OP_DROP antes do último OP_ENDIF
      const length = script.length
      expect(script[length - 4]).toBe(OpCode.OP_1)
      expect(script[length - 3]).toBe(OpCode.OP_CHECKSEQUENCEVERIFY)
      expect(script[length - 2]).toBe(OpCode.OP_DROP)
      expect(script[length - 1]).toBe(OpCode.OP_ENDIF)
    })

    it('should include remote HTLC pubkey', () => {
      const script = offeredHtlcScript(
        mockRevocationPubkey,
        mockLocalHtlcPubkey,
        mockRemoteHtlcPubkey,
        mockPaymentHash,
        false,
      )

      // Remote HTLC pubkey deve estar no script após OP_ELSE
      const scriptHex = uint8ArrayToHex(script)
      const remoteHtlcHex = uint8ArrayToHex(mockRemoteHtlcPubkey)
      expect(scriptHex).toContain(remoteHtlcHex)
    })

    it('should include local HTLC pubkey for multisig', () => {
      const script = offeredHtlcScript(
        mockRevocationPubkey,
        mockLocalHtlcPubkey,
        mockRemoteHtlcPubkey,
        mockPaymentHash,
        false,
      )

      // Local HTLC pubkey deve estar no script
      const scriptHex = uint8ArrayToHex(script)
      const localHtlcHex = uint8ArrayToHex(mockLocalHtlcPubkey)
      expect(scriptHex).toContain(localHtlcHex)
    })

    it('should contain OP_CHECKMULTISIG for timeout path', () => {
      const script = offeredHtlcScript(
        mockRevocationPubkey,
        mockLocalHtlcPubkey,
        mockRemoteHtlcPubkey,
        mockPaymentHash,
        false,
      )

      // Deve conter OP_CHECKMULTISIG
      expect(script).toContain(OpCode.OP_CHECKMULTISIG)
    })
  })

  describe('receivedHtlcScript', () => {
    it('should create valid received HTLC script without anchors', () => {
      const script = receivedHtlcScript(
        mockRevocationPubkey,
        mockLocalHtlcPubkey,
        mockRemoteHtlcPubkey,
        mockPaymentHash,
        mockCltvExpiry,
        false,
      )

      // Script deve começar com OP_DUP OP_HASH160
      expect(script[0]).toBe(OpCode.OP_DUP)
      expect(script[1]).toBe(OpCode.OP_HASH160)

      // Próximo byte deve ser 0x14 (push 20 bytes)
      expect(script[2]).toBe(0x14)

      // Script deve conter OP_CHECKLOCKTIMEVERIFY para timeout
      expect(script).toContain(OpCode.OP_CHECKLOCKTIMEVERIFY)

      // Script deve terminar com OP_ENDIF
      expect(script[script.length - 1]).toBe(OpCode.OP_ENDIF)
    })

    it('should create valid received HTLC script with anchors', () => {
      const script = receivedHtlcScript(
        mockRevocationPubkey,
        mockLocalHtlcPubkey,
        mockRemoteHtlcPubkey,
        mockPaymentHash,
        mockCltvExpiry,
        true, // with anchors
      )

      // Com anchors, deve ter OP_1 OP_CHECKSEQUENCEVERIFY OP_DROP antes do último OP_ENDIF
      const length = script.length
      expect(script[length - 4]).toBe(OpCode.OP_1)
      expect(script[length - 3]).toBe(OpCode.OP_CHECKSEQUENCEVERIFY)
      expect(script[length - 2]).toBe(OpCode.OP_DROP)
      expect(script[length - 1]).toBe(OpCode.OP_ENDIF)
    })

    it('should encode CLTV expiry correctly for small values', () => {
      const smallCltv = 10
      const script = receivedHtlcScript(
        mockRevocationPubkey,
        mockLocalHtlcPubkey,
        mockRemoteHtlcPubkey,
        mockPaymentHash,
        smallCltv,
        false,
      )

      // Para valores <= 16, deve usar OP_1-OP_16 (0x51-0x60)
      const expectedOpcode = 0x50 + smallCltv // OP_10 = 0x5a
      expect(script).toContain(expectedOpcode)
    })

    it('should encode CLTV expiry correctly for large values', () => {
      const largeCltv = 600000 // Típico block height
      const script = receivedHtlcScript(
        mockRevocationPubkey,
        mockLocalHtlcPubkey,
        mockRemoteHtlcPubkey,
        mockPaymentHash,
        largeCltv,
        false,
      )

      // O valor 600000 = 0x927C0 deve estar encoded no script
      // Como minimal push, precisa 3 bytes: [0x03, 0xC0, 0x27, 0x09]
      const scriptHex = uint8ArrayToHex(script)

      // Verificar que CLTV está no script (little-endian)
      // 600000 = 0x927C0 -> bytes: C0 27 09 (little-endian)
      expect(scriptHex).toContain('03c02709') // 3 bytes push + data
    })

    it('should contain OP_CHECKMULTISIG for success path', () => {
      const script = receivedHtlcScript(
        mockRevocationPubkey,
        mockLocalHtlcPubkey,
        mockRemoteHtlcPubkey,
        mockPaymentHash,
        mockCltvExpiry,
        false,
      )

      // Deve conter OP_CHECKMULTISIG
      expect(script).toContain(OpCode.OP_CHECKMULTISIG)
    })
  })

  describe('createOfferedHtlcScript (transaction.ts)', () => {
    it('should create the same structure as offeredHtlcScript', () => {
      const script1 = offeredHtlcScript(
        mockRevocationPubkey,
        mockLocalHtlcPubkey,
        mockRemoteHtlcPubkey,
        mockPaymentHash,
        false,
      )

      const script2 = createOfferedHtlcScript(
        mockRevocationPubkey,
        mockRemoteHtlcPubkey,
        mockLocalHtlcPubkey,
        mockPaymentHash,
        mockCltvExpiry, // Não usado em offered HTLC mas é parâmetro
        false,
      )

      // Ambos devem começar com OP_DUP OP_HASH160
      expect(script1[0]).toBe(script2[0])
      expect(script1[1]).toBe(script2[1])

      // Ambos devem ter OP_CHECKMULTISIG
      expect(script1).toContain(OpCode.OP_CHECKMULTISIG)
      expect(script2).toContain(OpCode.OP_CHECKMULTISIG)
    })
  })

  describe('createReceivedHtlcScript (transaction.ts)', () => {
    it('should create the same structure as receivedHtlcScript', () => {
      const script1 = receivedHtlcScript(
        mockRevocationPubkey,
        mockLocalHtlcPubkey,
        mockRemoteHtlcPubkey,
        mockPaymentHash,
        mockCltvExpiry,
        false,
      )

      const script2 = createReceivedHtlcScript(
        mockRevocationPubkey,
        mockRemoteHtlcPubkey,
        mockLocalHtlcPubkey,
        mockPaymentHash,
        mockCltvExpiry,
        false,
      )

      // Ambos devem começar com OP_DUP OP_HASH160
      expect(script1[0]).toBe(script2[0])
      expect(script1[1]).toBe(script2[1])

      // Ambos devem ter OP_CHECKLOCKTIMEVERIFY
      expect(script1).toContain(OpCode.OP_CHECKLOCKTIMEVERIFY)
      expect(script2).toContain(OpCode.OP_CHECKLOCKTIMEVERIFY)

      // Ambos devem ter OP_CHECKMULTISIG
      expect(script1).toContain(OpCode.OP_CHECKMULTISIG)
      expect(script2).toContain(OpCode.OP_CHECKMULTISIG)
    })
  })

  describe('Script Structure Validation', () => {
    it('offered HTLC should have correct spending paths', () => {
      const script = offeredHtlcScript(
        mockRevocationPubkey,
        mockLocalHtlcPubkey,
        mockRemoteHtlcPubkey,
        mockPaymentHash,
        false,
      )

      // Verificar estrutura geral do script:
      // 1. Revocation path: OP_DUP OP_HASH160 <hash> OP_EQUAL OP_IF OP_CHECKSIG
      // 2. Timeout path: OP_ELSE ... OP_NOTIF ... OP_CHECKMULTISIG
      // 3. Success path: OP_ELSE OP_HASH160 <hash> OP_EQUALVERIFY OP_CHECKSIG

      // Contar IFs/ELSEs/ENDIFs
      let ifCount = 0
      let elseCount = 0
      let endifCount = 0

      for (let i = 0; i < script.length; i++) {
        if (script[i] === OpCode.OP_IF) ifCount++
        if (script[i] === OpCode.OP_ELSE) elseCount++
        if (script[i] === OpCode.OP_ENDIF) endifCount++
        if (script[i] === OpCode.OP_NOTIF) ifCount++ // NOTIF conta como IF
      }

      // Deve ter estrutura balanceada
      expect(endifCount).toBe(ifCount)
    })

    it('received HTLC should have correct spending paths', () => {
      const script = receivedHtlcScript(
        mockRevocationPubkey,
        mockLocalHtlcPubkey,
        mockRemoteHtlcPubkey,
        mockPaymentHash,
        mockCltvExpiry,
        false,
      )

      // Verificar que tem os opcodes necessários
      expect(script).toContain(OpCode.OP_DUP)
      expect(script).toContain(OpCode.OP_HASH160)
      expect(script).toContain(OpCode.OP_IF)
      expect(script).toContain(OpCode.OP_ELSE)
      expect(script).toContain(OpCode.OP_ENDIF)
      expect(script).toContain(OpCode.OP_CHECKSIG)
      expect(script).toContain(OpCode.OP_CHECKLOCKTIMEVERIFY)
      expect(script).toContain(OpCode.OP_CHECKMULTISIG)
    })
  })
})
