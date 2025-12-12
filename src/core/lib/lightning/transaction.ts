// BOLT #3: Bitcoin Transaction and Script Formats - Utility Functions

import { sha256, hash160, verifyMessage, signMessage } from '@/core/lib/crypto'
import { createPublicKey } from '@/core/lib/key'
import { createP2WPKHScript } from '@/core/lib/address'
import * as secp from '@noble/secp256k1'
import { encodeU16, encodeU32, encodeU64 } from './base'
import { uint8ArrayToHex } from '@/core/lib/utils/utils'
import {
  Satoshis,
  CltvExpiry,
  CommitmentTransaction,
  CommitmentOutput,
  CommitmentOutputType,
  HtlcTimeoutTransaction,
  HtlcSuccessTransaction,
  DerivedKeys,
  CommitmentParams,
  DustLimits,
  PrivateKey,
  PaymentHash,
  ANCHOR_AMOUNT_SAT,
  DUST_LIMIT_UNKNOWN_SEGWIT,
} from '@/core/models/lightning/transaction'
import { Sha256, Point, Signature } from '@/core/models/lightning/base'
import { OpCode } from '@/core/models/opcodes'

// const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n

// Utility functions for key derivation

/**
 * Derives per-commitment point from basepoint and commitment number
 */
export function derivePerCommitmentPoint(basepoint: Point, commitmentNumber: bigint): Point {
  // SHA256(per_commitment_basepoint || commitment_number)
  const commitmentNumberBuf = encodeU64(commitmentNumber)
  const input = new Uint8Array([...basepoint, ...commitmentNumberBuf])
  const hash = sha256(input)
  return secp.getPublicKey(hash, true)
}

/**
 * Derives revocation pubkey: SHA256(revocation_basepoint || per_commitment_point)
 */
export function deriveRevocationPubkey(
  revocationBasepoint: Point,
  perCommitmentPoint: Point,
): Point {
  const input = new Uint8Array([...revocationBasepoint, ...perCommitmentPoint])
  const hash = sha256(input)
  return secp.getPublicKey(hash, true)
}

/**
 * Derives local pubkey: per_commitment_point + payment_basepoint * SHA256(per_commitment_point || payment_basepoint)
 */
export function deriveLocalPubkey(
  perCommitmentPoint: Point,
  paymentBasepointPriv: PrivateKey,
): Point {
  const paymentBasepoint = createPublicKey(paymentBasepointPriv)
  const input = new Uint8Array([...perCommitmentPoint, ...paymentBasepoint])
  const scalarBytes = sha256(input)
  const scalar = BigInt('0x' + uint8ArrayToHex(scalarBytes))
  const multipliedPoint = secp.Point.fromHex(uint8ArrayToHex(paymentBasepoint)).multiply(scalar)
  const result = secp.Point.fromHex(uint8ArrayToHex(perCommitmentPoint)).add(multipliedPoint)
  return new Uint8Array(result.toBytes(true))
}

/**
 * Derives remote pubkey: per_commitment_point + payment_basepoint * SHA256(per_commitment_point || payment_basepoint)
 */
export function deriveRemotePubkey(perCommitmentPoint: Point, paymentBasepoint: Point): Point {
  const input = new Uint8Array([...perCommitmentPoint, ...paymentBasepoint])
  const scalarBytes = sha256(input)
  const scalar = BigInt('0x' + uint8ArrayToHex(scalarBytes))
  const multipliedPoint = secp.Point.fromHex(uint8ArrayToHex(paymentBasepoint)).multiply(scalar)
  const result = secp.Point.fromHex(uint8ArrayToHex(perCommitmentPoint)).add(multipliedPoint)
  return new Uint8Array(result.toBytes(true))
}

/**
 * Derives HTLC pubkey: per_commitment_point + htlc_basepoint * SHA256(per_commitment_point || htlc_basepoint)
 */
export function deriveHtlcPubkey(perCommitmentPoint: Point, htlcBasepointPriv: PrivateKey): Point {
  const htlcBasepoint = createPublicKey(htlcBasepointPriv)
  const input = new Uint8Array([...perCommitmentPoint, ...htlcBasepoint])
  const scalarBytes = sha256(input)
  const scalar = BigInt('0x' + uint8ArrayToHex(scalarBytes))
  const multipliedPoint = secp.Point.fromHex(uint8ArrayToHex(htlcBasepoint)).multiply(scalar)
  const result = secp.Point.fromHex(uint8ArrayToHex(perCommitmentPoint)).add(multipliedPoint)
  return new Uint8Array(result.toBytes(true))
}

/**
 * Derives delayed pubkey: per_commitment_point + delayed_payment_basepoint * SHA256(per_commitment_point || delayed_payment_basepoint)
 */
export function deriveDelayedPubkey(
  perCommitmentPoint: Point,
  delayedPaymentBasepointPriv: PrivateKey,
): Point {
  const delayedPaymentBasepoint = createPublicKey(delayedPaymentBasepointPriv)
  const input = new Uint8Array([...perCommitmentPoint, ...delayedPaymentBasepoint])
  const scalarBytes = sha256(input)
  const scalar = BigInt('0x' + uint8ArrayToHex(scalarBytes))
  const multipliedPoint = secp.Point.fromHex(uint8ArrayToHex(delayedPaymentBasepoint)).multiply(
    scalar,
  )
  const result = secp.Point.fromHex(uint8ArrayToHex(perCommitmentPoint)).add(multipliedPoint)
  return new Uint8Array(result.toBytes(true))
}

/**
 * Derives all keys for a commitment
 */
export function deriveCommitmentKeys(params: CommitmentParams): DerivedKeys {
  const perCommitmentPoint = derivePerCommitmentPoint(
    params.revocationBasepoint,
    params.commitmentNumber,
  )
  return {
    localPubkey: deriveLocalPubkey(perCommitmentPoint, params.localPaymentBasepointPriv),
    localHtlcPubkey: deriveHtlcPubkey(perCommitmentPoint, params.localHtlcBasepointPriv),
    localDelayedPubkey: deriveDelayedPubkey(
      perCommitmentPoint,
      params.localDelayedPaymentBasepointPriv,
    ),
    revocationPubkey: deriveRevocationPubkey(params.revocationBasepoint, perCommitmentPoint),
  }
}

// Script construction utilities

/**
 * Creates P2WSH script for funding output
 */
export function createFundingScript(
  localFundingPubkey: Point,
  remoteFundingPubkey: Point,
): Uint8Array {
  // 2 <local_funding_pubkey> <remote_funding_pubkey> 2 CHECKMULTISIG
  const script = new Uint8Array([
    OpCode.OP_2,
    0x21, // 33 bytes
    ...localFundingPubkey,
    0x21, // 33 bytes
    ...remoteFundingPubkey,
    OpCode.OP_2,
    OpCode.OP_CHECKMULTISIG,
  ])
  return script
}

/**
 * Creates P2WSH script for to_local output
 */
export function createToLocalScript(
  revocationPubkey: Point,
  localDelayedPubkey: Point,
  toSelfDelay: number,
): Uint8Array {
  // IF revocation_pubkey CHECKSIG ELSE local_delayed_pubkey CHECKSIGVERIFY <to_self_delay> CHECKSEQUENCEVERIFY ENDIF
  const delayBuf = encodeU16(toSelfDelay)
  const script = new Uint8Array([
    OpCode.OP_IF,
    0x21, // 33 bytes
    ...revocationPubkey,
    OpCode.OP_CHECKSIG,
    OpCode.OP_ELSE,
    0x21, // 33 bytes
    ...localDelayedPubkey,
    OpCode.OP_CHECKSIGVERIFY,
    ...delayBuf,
    OpCode.OP_CHECKSEQUENCEVERIFY,
    OpCode.OP_ENDIF,
  ])
  return script
}

/**
 * Creates P2WSH script for offered HTLC - BOLT #3 compliant
 *
 * Script:
 * OP_DUP OP_HASH160 <RIPEMD160(SHA256(revocationpubkey))> OP_EQUAL
 * OP_IF
 *     OP_CHECKSIG
 * OP_ELSE
 *     <remote_htlcpubkey> OP_SWAP OP_SIZE 32 OP_EQUAL
 *     OP_NOTIF
 *         OP_DROP 2 OP_SWAP <local_htlcpubkey> 2 OP_CHECKMULTISIG
 *     OP_ELSE
 *         OP_HASH160 <RIPEMD160(payment_hash)> OP_EQUALVERIFY OP_CHECKSIG
 *     OP_ENDIF
 *     [OP_1 OP_CHECKSEQUENCEVERIFY OP_DROP] // if anchors
 * OP_ENDIF
 */
export function createOfferedHtlcScript(
  revocationPubkey: Point,
  remoteHtlcPubkey: Point,
  localHtlcPubkey: Point,
  paymentHash: PaymentHash,
  cltvExpiry: CltvExpiry,
  optionAnchors: boolean = false,
): Uint8Array {
  // BOLT #3: use RIPEMD160(SHA256(revocation_pubkey)) para o check
  const revocationHash = hash160(revocationPubkey)
  // Para o payment, usa RIPEMD160(payment_hash) onde payment_hash já é SHA256(preimage)
  const paymentHashRipemd = ripemd160Hash(paymentHash)

  const parts: number[] = []

  // OP_DUP OP_HASH160 <20 bytes> OP_EQUAL
  parts.push(OpCode.OP_DUP)
  parts.push(OpCode.OP_HASH160)
  parts.push(0x14) // 20 bytes
  parts.push(...revocationHash)
  parts.push(OpCode.OP_EQUAL)

  // OP_IF
  parts.push(OpCode.OP_IF)

  // OP_CHECKSIG
  parts.push(OpCode.OP_CHECKSIG)

  // OP_ELSE
  parts.push(OpCode.OP_ELSE)

  // <remote_htlcpubkey>
  parts.push(0x21) // 33 bytes
  parts.push(...remoteHtlcPubkey)

  // OP_SWAP OP_SIZE <32> OP_EQUAL
  parts.push(OpCode.OP_SWAP)
  parts.push(OpCode.OP_SIZE)
  parts.push(0x01) // Push 1 byte
  parts.push(0x20) // 32
  parts.push(OpCode.OP_EQUAL)

  // OP_NOTIF
  parts.push(OpCode.OP_NOTIF)

  // OP_DROP OP_2 OP_SWAP <local_htlcpubkey> OP_2 OP_CHECKMULTISIG
  parts.push(OpCode.OP_DROP)
  parts.push(OpCode.OP_2)
  parts.push(OpCode.OP_SWAP)
  parts.push(0x21) // 33 bytes
  parts.push(...localHtlcPubkey)
  parts.push(OpCode.OP_2)
  parts.push(OpCode.OP_CHECKMULTISIG)

  // OP_ELSE
  parts.push(OpCode.OP_ELSE)

  // OP_HASH160 <RIPEMD160(payment_hash)> OP_EQUALVERIFY OP_CHECKSIG
  parts.push(OpCode.OP_HASH160)
  parts.push(0x14) // 20 bytes
  parts.push(...paymentHashRipemd)
  parts.push(OpCode.OP_EQUALVERIFY)
  parts.push(OpCode.OP_CHECKSIG)

  // OP_ENDIF
  parts.push(OpCode.OP_ENDIF)

  // Anchors: OP_1 OP_CHECKSEQUENCEVERIFY OP_DROP
  if (optionAnchors) {
    parts.push(OpCode.OP_1)
    parts.push(OpCode.OP_CHECKSEQUENCEVERIFY)
    parts.push(OpCode.OP_DROP)
  }

  // OP_ENDIF final
  parts.push(OpCode.OP_ENDIF)

  return new Uint8Array(parts)
}

/**
 * Creates P2WSH script for received HTLC - BOLT #3 compliant
 *
 * Script:
 * OP_DUP OP_HASH160 <RIPEMD160(SHA256(revocationpubkey))> OP_EQUAL
 * OP_IF
 *     OP_CHECKSIG
 * OP_ELSE
 *     <remote_htlcpubkey> OP_SWAP OP_SIZE 32 OP_EQUAL
 *     OP_IF
 *         OP_HASH160 <RIPEMD160(payment_hash)> OP_EQUALVERIFY
 *         2 OP_SWAP <local_htlcpubkey> 2 OP_CHECKMULTISIG
 *     OP_ELSE
 *         OP_DROP <cltv_expiry> OP_CHECKLOCKTIMEVERIFY OP_DROP OP_CHECKSIG
 *     OP_ENDIF
 *     [OP_1 OP_CHECKSEQUENCEVERIFY OP_DROP] // if anchors
 * OP_ENDIF
 */
export function createReceivedHtlcScript(
  revocationPubkey: Point,
  remoteHtlcPubkey: Point,
  localHtlcPubkey: Point,
  paymentHash: PaymentHash,
  cltvExpiry: CltvExpiry,
  optionAnchors: boolean = false,
): Uint8Array {
  // BOLT #3: use RIPEMD160(SHA256(revocation_pubkey)) para o check
  const revocationHash = hash160(revocationPubkey)
  // Para o payment, usa RIPEMD160(payment_hash)
  const paymentHashRipemd = ripemd160Hash(paymentHash)

  const parts: number[] = []

  // OP_DUP OP_HASH160 <20 bytes> OP_EQUAL
  parts.push(OpCode.OP_DUP)
  parts.push(OpCode.OP_HASH160)
  parts.push(0x14) // 20 bytes
  parts.push(...revocationHash)
  parts.push(OpCode.OP_EQUAL)

  // OP_IF
  parts.push(OpCode.OP_IF)

  // OP_CHECKSIG
  parts.push(OpCode.OP_CHECKSIG)

  // OP_ELSE
  parts.push(OpCode.OP_ELSE)

  // <remote_htlcpubkey>
  parts.push(0x21) // 33 bytes
  parts.push(...remoteHtlcPubkey)

  // OP_SWAP OP_SIZE <32> OP_EQUAL
  parts.push(OpCode.OP_SWAP)
  parts.push(OpCode.OP_SIZE)
  parts.push(0x01) // Push 1 byte
  parts.push(0x20) // 32
  parts.push(OpCode.OP_EQUAL)

  // OP_IF
  parts.push(OpCode.OP_IF)

  // OP_HASH160 <RIPEMD160(payment_hash)> OP_EQUALVERIFY
  parts.push(OpCode.OP_HASH160)
  parts.push(0x14) // 20 bytes
  parts.push(...paymentHashRipemd)
  parts.push(OpCode.OP_EQUALVERIFY)

  // OP_2 OP_SWAP <local_htlcpubkey> OP_2 OP_CHECKMULTISIG
  parts.push(OpCode.OP_2)
  parts.push(OpCode.OP_SWAP)
  parts.push(0x21) // 33 bytes
  parts.push(...localHtlcPubkey)
  parts.push(OpCode.OP_2)
  parts.push(OpCode.OP_CHECKMULTISIG)

  // OP_ELSE
  parts.push(OpCode.OP_ELSE)

  // OP_DROP <cltv_expiry> OP_CHECKLOCKTIMEVERIFY OP_DROP OP_CHECKSIG
  parts.push(OpCode.OP_DROP)

  // Encode CLTV expiry como minimal push
  const cltvBytes = encodeCltvExpiryForScript(cltvExpiry)
  parts.push(...cltvBytes)

  parts.push(OpCode.OP_CHECKLOCKTIMEVERIFY)
  parts.push(OpCode.OP_DROP)
  parts.push(OpCode.OP_CHECKSIG)

  // OP_ENDIF
  parts.push(OpCode.OP_ENDIF)

  // Anchors: OP_1 OP_CHECKSEQUENCEVERIFY OP_DROP
  if (optionAnchors) {
    parts.push(OpCode.OP_1)
    parts.push(OpCode.OP_CHECKSEQUENCEVERIFY)
    parts.push(OpCode.OP_DROP)
  }

  // OP_ENDIF final
  parts.push(OpCode.OP_ENDIF)

  return new Uint8Array(parts)
}

/**
 * Helper: RIPEMD160 standalone (não hash160 que é RIPEMD160(SHA256))
 */
function ripemd160Hash(data: Uint8Array): Uint8Array {
  // Importar de @noble/hashes/legacy
  const { ripemd160 } = require('@noble/hashes/legacy.js')
  return ripemd160(data)
}

/**
 * Encodes CLTV expiry for use in script (minimal push encoding)
 */
function encodeCltvExpiryForScript(cltv: number): number[] {
  if (cltv <= 0) {
    return [OpCode.OP_0]
  }
  if (cltv <= 16) {
    // Use OP_1 through OP_16 (0x51 - 0x60)
    return [0x50 + cltv]
  }

  // Encode como minimal push conforme BIP 62
  const bytes: number[] = []
  let n = cltv

  while (n > 0) {
    bytes.push(n & 0xff)
    n >>= 8
  }

  // Se o bit mais alto estiver setado, adicionar 0x00 para manter positivo
  if (bytes[bytes.length - 1] & 0x80) {
    bytes.push(0x00)
  }

  return [bytes.length, ...bytes]
}

/**
 * Creates P2WSH script for anchor output
 */
export function createAnchorScript(): Uint8Array {
  return new Uint8Array([OpCode.OP_1])
}

// Fee calculation utilities

/**
 * Calculates commitment transaction fee
 */
export function calculateCommitmentFee(
  feeratePerKw: number,
  numHtlcs: number,
  optionAnchors: boolean = false,
): Satoshis {
  // Base weight: 724 + 172 * num_htlcs (for non-anchor)
  // With anchors: 1124 + 172 * num_htlcs
  const baseWeight = optionAnchors ? 1124 : 724
  const htlcWeight = 172
  const totalWeight = baseWeight + htlcWeight * numHtlcs
  return BigInt(Math.ceil((totalWeight * feeratePerKw) / 1000))
}

/**
 * Calculates HTLC transaction fee
 */
export function calculateHtlcFee(feeratePerKw: number, optionAnchors: boolean = false): Satoshis {
  // Weight: 663 (non-anchor) or 703 (anchor)
  const weight = optionAnchors ? 703 : 663
  return BigInt(Math.ceil((weight * feeratePerKw) / 1000))
}

// Dust limit utilities

/**
 * Gets dust limits for different script types
 */
export function getDustLimits(feeratePerKw: number): DustLimits {
  const calculateDust = (inputSize: number, outputSize: number) =>
    BigInt(Math.ceil(((inputSize + outputSize) * feeratePerKw) / 1000))

  return {
    p2pkh: calculateDust(148, 34), // P2PKH input 148, output 34
    p2sh: calculateDust(91, 32), // P2SH input 91, output 32
    p2wpkh: calculateDust(67, 31), // P2WPKH input 67, output 31
    p2wsh: calculateDust(67, 43), // P2WSH input 67, output 43
    unknownSegwit: DUST_LIMIT_UNKNOWN_SEGWIT, // Fixed
  }
}

/**
 * Checks if an output is above dust limit
 */
export function isAboveDustLimit(
  value: Satoshis,
  scriptPubKey: Uint8Array,
  dustLimits: DustLimits,
): boolean {
  // Simplified: assume P2WSH for now
  return value >= dustLimits.p2wsh
}

// Commitment transaction construction

/**
 * Builds a commitment transaction
 */
export function buildCommitmentTransaction(params: CommitmentParams): CommitmentTransaction {
  const keys = deriveCommitmentKeys(params)
  const fee = calculateCommitmentFee(params.feeratePerKw, params.htlcs.length, params.optionAnchors)

  // Calculate balances
  let toLocalMsat = params.localToSelfDelay > 0 ? params.toLocalMsat : 0n
  let toRemoteMsat = params.toRemoteMsat

  // Subtract fees and dust
  const totalMsat = toLocalMsat + toRemoteMsat
  const feeMsat = fee * 1000n
  if (totalMsat < feeMsat) {
    throw new Error('Insufficient funds for fee')
  }

  toLocalMsat -= feeMsat / 2n
  toRemoteMsat -= feeMsat / 2n

  const outputs: CommitmentOutput[] = []

  // Add HTLC outputs
  for (const htlc of params.htlcs) {
    if (htlc.amountMsat < params.localDustLimit * 1000n) continue

    if (htlc.direction === 'offered') {
      const script = createOfferedHtlcScript(
        keys.revocationPubkey,
        params.remoteHtlcPubkey,
        keys.localHtlcPubkey,
        htlc.paymentHash,
        htlc.cltvExpiry,
        params.optionAnchors,
      )
      outputs.push({
        type: CommitmentOutputType.OFFERED_HTLC,
        value: htlc.amountMsat / 1000n,
        scriptPubKey: script,
        cltvExpiry: htlc.cltvExpiry,
        paymentHash: htlc.paymentHash,
      })
      toLocalMsat -= htlc.amountMsat
    } else {
      const script = createReceivedHtlcScript(
        keys.revocationPubkey,
        params.remoteHtlcPubkey,
        keys.localHtlcPubkey,
        htlc.paymentHash,
        htlc.cltvExpiry,
        params.optionAnchors,
      )
      outputs.push({
        type: CommitmentOutputType.RECEIVED_HTLC,
        value: htlc.amountMsat / 1000n,
        scriptPubKey: script,
        cltvExpiry: htlc.cltvExpiry,
        paymentHash: htlc.paymentHash,
      })
      toRemoteMsat -= htlc.amountMsat
    }
  }

  // Add to_local output
  if (toLocalMsat >= params.localDustLimit * 1000n) {
    const script = createToLocalScript(
      keys.revocationPubkey,
      keys.localDelayedPubkey,
      params.localToSelfDelay,
    )
    outputs.push({
      type: CommitmentOutputType.TO_LOCAL,
      value: toLocalMsat / 1000n,
      scriptPubKey: script,
    })
  }

  // Add to_remote output
  if (toRemoteMsat >= params.remoteDustLimit * 1000n) {
    outputs.push({
      type: CommitmentOutputType.TO_REMOTE,
      value: toRemoteMsat / 1000n,
      scriptPubKey: createP2WPKHScript(params.remotePaymentBasepoint),
    })
  }

  // Add anchor outputs if option_anchors
  if (params.optionAnchors) {
    if (outputs.some(o => o.type !== CommitmentOutputType.TO_REMOTE)) {
      outputs.push({
        type: CommitmentOutputType.TO_LOCAL_ANCHOR,
        value: ANCHOR_AMOUNT_SAT,
        scriptPubKey: createAnchorScript(),
      })
    }
    if (outputs.some(o => o.type === CommitmentOutputType.TO_REMOTE)) {
      outputs.push({
        type: CommitmentOutputType.TO_REMOTE_ANCHOR,
        value: ANCHOR_AMOUNT_SAT,
        scriptPubKey: createAnchorScript(),
      })
    }
  }

  // Sort outputs by BIP69
  outputs.sort((a, b) => {
    if (a.value !== b.value) return Number(a.value - b.value)
    return a.scriptPubKey.length - b.scriptPubKey.length
  })

  return {
    version: 2,
    locktime: 0,
    inputs: [
      {
        fundingTxid: params.fundingTxid,
        fundingOutputIndex: params.fundingOutputIndex,
        sequence: 0xfffffffe,
        scriptSig: new Uint8Array(),
        witness: [], // Will be filled during signing
      },
    ],
    outputs,
  }
}

// HTLC transaction construction

/**
 * Builds an HTLC-timeout transaction - BOLT #3 compliant
 *
 * Usado quando o HTLC oferecido expira sem ser resgatado
 * O output vai para to_local (com delay)
 */
export function buildHtlcTimeoutTransaction(
  commitmentTxid: Sha256,
  htlcOutputIndex: number,
  amount: Satoshis,
  cltvExpiry: CltvExpiry,
  feeratePerKw: number,
  localDelayedPubkey: Point,
  revocationPubkey: Point,
  toSelfDelay: number,
  optionAnchors: boolean = false,
): HtlcTimeoutTransaction {
  const fee = calculateHtlcFee(feeratePerKw, optionAnchors)
  const outputAmount = amount - fee

  // Output script é to_local com delay (igual ao to_local do commitment)
  // OP_IF <revocationpubkey> OP_ELSE <to_self_delay> OP_CSV OP_DROP <local_delayedpubkey> OP_ENDIF OP_CHECKSIG
  const outputScript = createToLocalScript(revocationPubkey, localDelayedPubkey, toSelfDelay)

  return {
    version: 2,
    locktime: cltvExpiry, // CLTV expiry
    inputs: [
      {
        commitmentTxid,
        commitmentOutputIndex: htlcOutputIndex,
        sequence: optionAnchors ? 1 : 0, // 1 para anchors (CSV), 0 caso contrário
        scriptSig: new Uint8Array(),
        witness: [], // Will be filled during signing
      },
    ],
    outputs: [
      {
        value: outputAmount,
        scriptPubKey: createP2wshScript(outputScript),
        pubkey: localDelayedPubkey,
      },
    ],
  }
}

/**
 * Builds an HTLC-success transaction - BOLT #3 compliant
 *
 * Usado quando o HTLC recebido é resgatado com o preimage
 * O output vai para to_local (com delay)
 */
export function buildHtlcSuccessTransaction(
  commitmentTxid: Sha256,
  htlcOutputIndex: number,
  amount: Satoshis,
  feeratePerKw: number,
  localDelayedPubkey: Point,
  revocationPubkey: Point,
  toSelfDelay: number,
  optionAnchors: boolean = false,
): HtlcSuccessTransaction {
  const fee = calculateHtlcFee(feeratePerKw, optionAnchors)
  const outputAmount = amount - fee

  // Output script é to_local com delay (igual ao to_local do commitment)
  const outputScript = createToLocalScript(revocationPubkey, localDelayedPubkey, toSelfDelay)

  return {
    version: 2,
    locktime: 0, // Sem locktime para success
    inputs: [
      {
        commitmentTxid,
        commitmentOutputIndex: htlcOutputIndex,
        sequence: optionAnchors ? 1 : 0, // 1 para anchors (CSV), 0 caso contrário
        scriptSig: new Uint8Array(),
        witness: [], // Will be filled during signing
      },
    ],
    outputs: [
      {
        value: outputAmount,
        scriptPubKey: createP2wshScript(outputScript),
        pubkey: localDelayedPubkey,
      },
    ],
  }
}

/**
 * Creates P2WSH script for witness script
 */
function createP2wshScript(witnessScript: Uint8Array): Uint8Array {
  const scriptHash = sha256(witnessScript)
  const result = new Uint8Array(34)
  result[0] = 0x00 // OP_0
  result[1] = 0x20 // Push 32 bytes
  result.set(scriptHash, 2)
  return result
}

// Signature verification utilities

/**
 * Verifies a signature against a message and pubkey
 */
export function verifySignature(signature: Signature, message: Sha256, pubkey: Point): boolean {
  try {
    return verifyMessage(message, signature, pubkey)
  } catch {
    return false
  }
}

/**
 * Creates a signature for a transaction
 */
export function signTransaction(tx: Uint8Array, privkey: Uint8Array): Signature {
  const hash = sha256(tx)
  return signMessage(hash, privkey)
}

// Obscuring factor calculation

/**
 * Calculates the obscuring factor for commitment number
 */
export function calculateObscuringFactor(
  localPaymentBasepoint: Point,
  remotePaymentBasepoint: Point,
): bigint {
  const input = new Uint8Array([...localPaymentBasepoint, ...remotePaymentBasepoint])
  const hash = sha256(input)
  const factor = BigInt('0x' + uint8ArrayToHex(hash.slice(0, 6)))
  return factor ^ 42n // XOR with commitment number (example: 42)
}
