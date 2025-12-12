// BOLT #5: Recommendations for On-chain Transaction Handling - Protocol Functions
// Baseado em electrum/lnsweep.py

import { sha256, hash160 } from '@/core/lib/crypto'
import { uint8ArrayToHex, hexToUint8Array } from '@/core/lib/utils/utils'
import {
  CommitmentOutputType,
  PaymentPreimage,
  CltvExpiry,
} from '@/core/models/lightning/transaction'
import {
  IRREVOCABLE_CONFIRMATION_DEPTH,
  SECURITY_DELAY_BLOCKS,
  TO_LOCAL_PENALTY_WITNESS_WEIGHT,
  OFFERED_HTLC_PENALTY_WITNESS_WEIGHT,
  RECEIVED_HTLC_PENALTY_WITNESS_WEIGHT,
  TO_LOCAL_PENALTY_INPUT_WEIGHT,
  OFFERED_HTLC_PENALTY_INPUT_WEIGHT,
  RECEIVED_HTLC_PENALTY_INPUT_WEIGHT,
} from '@/core/models/lightning/onchain'
import { secretToPoint, derivePubkey, deriveRevocationPubkey } from './revocation'
import * as secp from '@noble/secp256k1'
import {
  OnChainResolutionContext,
  OutputResolutionResult,
  OutputResolutionState,
  HtlcResolutionAction,
  CommitmentAnalysis,
  HtlcTransactionAnalysis,
  PenaltyTransactionAnalysis,
  ClosingTransactionAnalysis,
  OnChainChannelState,
  OnChainRequirements,
  OnChainError,
  OnChainErrorType,
  HtlcTimeoutCheck,
  RevokedOutputHandling,
  OnChainFeeManagement,
  ChannelCloseType,
  OnChainTransactionType,
  PenaltyTransactionType,
} from '@/core/models/lightning/onchain'
import { Sha256, Point } from '@/core/models/lightning/base'
import { Tx } from '@/core/models/transaction'

// ==========================================
// BOLT #5: SWEEP TRANSACTIONS
// ==========================================

import { OpCode } from '@/core/models/opcodes'

// ==========================================
// CPFP (Child Pays For Parent) SUPPORT
// ==========================================

/**
 * Configuração para CPFP fee bumping
 */
export interface CpfpConfig {
  /** Fee rate desejada em sat/vB */
  targetFeeRate: number
  /** Fee rate atual do parent em sat/vB */
  parentFeeRate: number
  /** Tamanho do parent em vbytes */
  parentVsize: number
  /** Tamanho estimado do child em vbytes */
  childVsize: number
  /** UTXOs disponíveis para funding */
  availableUtxos: UtxoForCpfp[]
}

/**
 * UTXO disponível para CPFP
 */
export interface UtxoForCpfp {
  txid: string
  vout: number
  valueSats: bigint
  scriptPubKey: Uint8Array
}

/**
 * Resultado do cálculo CPFP
 */
export interface CpfpResult {
  /** Fee necessária para o child tx */
  childFeeSats: bigint
  /** Fee rate efetiva resultante */
  effectiveFeeRate: number
  /** Se é economicamente viável */
  isEconomic: boolean
  /** Mensagem de erro se não viável */
  error?: string
}

/**
 * Calcula a fee necessária para CPFP
 *
 * Para atingir uma fee rate alvo para o pacote parent+child,
 * precisamos que:
 * (parent_fee + child_fee) / (parent_vsize + child_vsize) >= target_rate
 *
 * Portanto:
 * child_fee >= target_rate * (parent_vsize + child_vsize) - parent_fee
 */
export function calculateCpfpFee(config: CpfpConfig): CpfpResult {
  const { targetFeeRate, parentFeeRate, parentVsize, childVsize } = config

  // Fee atual do parent
  const parentFeeSats = BigInt(Math.ceil(parentFeeRate * parentVsize))

  // Fee total necessária para o pacote
  const totalVsize = parentVsize + childVsize
  const totalFeeNeeded = BigInt(Math.ceil(targetFeeRate * totalVsize))

  // Fee que o child precisa pagar
  const childFeeSats = totalFeeNeeded - parentFeeSats

  if (childFeeSats <= 0n) {
    return {
      childFeeSats: 0n,
      effectiveFeeRate: parentFeeRate,
      isEconomic: true,
    }
  }

  // Verificar se é economicamente viável
  // Child fee rate não deve ser absurdamente alta
  const childOnlyFeeRate = Number(childFeeSats) / childVsize
  const maxChildFeeRate = targetFeeRate * 10 // Não mais que 10x a taxa alvo

  if (childOnlyFeeRate > maxChildFeeRate) {
    return {
      childFeeSats,
      effectiveFeeRate: Number(totalFeeNeeded) / totalVsize,
      isEconomic: false,
      error: `Child fee rate ${childOnlyFeeRate.toFixed(2)} sat/vB muito alta`,
    }
  }

  return {
    childFeeSats,
    effectiveFeeRate: Number(totalFeeNeeded) / totalVsize,
    isEconomic: true,
  }
}

/**
 * Cria transação CPFP para bump de fee usando anchor output
 *
 * @param anchorInput - Input do anchor output
 * @param fundingUtxos - UTXOs adicionais para funding
 * @param targetFeeRate - Fee rate desejada em sat/vB
 * @param changeAddress - Endereço para troco
 */
export function createCpfpTransaction(params: {
  anchorInput: PartialTxInput
  parentTxVsize: number
  parentFeeRate: number
  fundingUtxos: UtxoForCpfp[]
  targetFeeRate: number
  changeAddress: string
}): {
  tx: CpfpTransactionData
  success: boolean
  error?: string
} {
  const { anchorInput, parentTxVsize, parentFeeRate, fundingUtxos, targetFeeRate, changeAddress } =
    params

  // Estimar tamanho do child tx
  // 1 anchor input (107 vbytes) + N funding inputs (68 vbytes P2WPKH) + 1 output (31 vbytes) + overhead (10 vbytes)
  const anchorInputVsize = 107
  const fundingInputVsize = 68
  const outputVsize = 31
  const overheadVsize = 10

  // Começar com apenas anchor
  let childVsize = anchorInputVsize + outputVsize + overheadVsize
  let totalInputValue = anchorInput.valueSats

  const selectedUtxos: UtxoForCpfp[] = []

  // Calcular fee necessária
  let cpfpResult = calculateCpfpFee({
    targetFeeRate,
    parentFeeRate,
    parentVsize: parentTxVsize,
    childVsize,
    availableUtxos: fundingUtxos,
  })

  // Se anchor sozinho não é suficiente, adicionar UTXOs
  while (!cpfpResult.isEconomic || totalInputValue < cpfpResult.childFeeSats) {
    if (fundingUtxos.length === 0) {
      return {
        tx: null as any,
        success: false,
        error: 'UTXOs insuficientes para CPFP',
      }
    }

    // Adicionar próximo UTXO
    const utxo = fundingUtxos.shift()!
    selectedUtxos.push(utxo)
    totalInputValue += utxo.valueSats
    childVsize += fundingInputVsize

    cpfpResult = calculateCpfpFee({
      targetFeeRate,
      parentFeeRate,
      parentVsize: parentTxVsize,
      childVsize,
      availableUtxos: fundingUtxos,
    })
  }

  // Calcular troco
  const changeAmount = totalInputValue - cpfpResult.childFeeSats - 330n // 330 sats anchor value

  if (changeAmount < 546n) {
    // Dust, não criar output de troco
    return {
      tx: {
        inputs: [anchorInput, ...selectedUtxos.map(utxoToInput)],
        outputs: [],
        feeSats: totalInputValue + anchorInput.valueSats,
        feeRate: cpfpResult.effectiveFeeRate,
      },
      success: true,
    }
  }

  return {
    tx: {
      inputs: [anchorInput, ...selectedUtxos.map(utxoToInput)],
      outputs: [
        {
          address: changeAddress,
          valueSats: changeAmount,
        },
      ],
      feeSats: cpfpResult.childFeeSats,
      feeRate: cpfpResult.effectiveFeeRate,
    },
    success: true,
  }
}

/**
 * Dados de transação CPFP
 */
export interface CpfpTransactionData {
  inputs: PartialTxInput[]
  outputs: { address: string; valueSats: bigint }[]
  feeSats: bigint
  feeRate: number
}

function utxoToInput(utxo: UtxoForCpfp): PartialTxInput {
  return {
    prevout: {
      txid: hexToUint8Array(utxo.txid),
      outIdx: utxo.vout,
    },
    valueSats: utxo.valueSats,
    witnessScript: utxo.scriptPubKey,
    nSequence: 0xfffffffd,
    privkey: new Uint8Array(32), // Caller must provide
    isRevocation: false,
  }
}

// ==========================================
// HTLC TRANSACTION GENERATION
// ==========================================

/**
 * Parâmetros para criar HTLC-Success TX
 */
export interface HtlcSuccessTxParams {
  /** Commitment transaction */
  ctx: Tx
  /** Índice do output HTLC no commitment */
  htlcOutputIdx: number
  /** Valor do HTLC em satoshis */
  htlcValueSats: bigint
  /** Payment preimage (32 bytes) */
  preimage: Uint8Array
  /** Payment hash (32 bytes) */
  paymentHash: Uint8Array
  /** Nossa HTLC pubkey derivada */
  localHtlcPubkey: Uint8Array
  /** HTLC pubkey remota derivada */
  remoteHtlcPubkey: Uint8Array
  /** Revocation pubkey */
  revocationPubkey: Uint8Array
  /** Delayed payment pubkey local */
  localDelayedPubkey: Uint8Array
  /** to_self_delay em blocos */
  toSelfDelay: number
  /** Fee rate em sat/kw */
  feerateSatKw: number
  /** Se tem anchors */
  hasAnchors: boolean
  /** Assinatura remota (já obtida via commitment_signed) */
  remoteHtlcSig: Uint8Array
  /** Nossa privkey HTLC */
  localHtlcPrivkey: Uint8Array
}

/**
 * Parâmetros para criar HTLC-Timeout TX
 */
export interface HtlcTimeoutTxParams {
  /** Commitment transaction */
  ctx: Tx
  /** Índice do output HTLC no commitment */
  htlcOutputIdx: number
  /** Valor do HTLC em satoshis */
  htlcValueSats: bigint
  /** Payment hash (32 bytes) */
  paymentHash: Uint8Array
  /** CLTV expiry absoluto */
  cltvExpiry: number
  /** Nossa HTLC pubkey derivada */
  localHtlcPubkey: Uint8Array
  /** HTLC pubkey remota derivada */
  remoteHtlcPubkey: Uint8Array
  /** Revocation pubkey */
  revocationPubkey: Uint8Array
  /** Delayed payment pubkey local */
  localDelayedPubkey: Uint8Array
  /** to_self_delay em blocos */
  toSelfDelay: number
  /** Fee rate em sat/kw */
  feerateSatKw: number
  /** Se tem anchors */
  hasAnchors: boolean
  /** Assinatura remota (já obtida via commitment_signed) */
  remoteHtlcSig: Uint8Array
  /** Nossa privkey HTLC */
  localHtlcPrivkey: Uint8Array
}

/**
 * HTLC transaction criada
 */
export interface HtlcTransaction {
  /** Transação serializada (sem assinaturas) */
  txHex: string
  /** Transação serializada com witness */
  txWitnessHex: string
  /** Txid */
  txid: string
  /** Witness script do output */
  outputWitnessScript: Uint8Array
  /** Valor do output */
  outputValueSats: bigint
}

/** Peso de HTLC-Success TX (sem anchor) */
const HTLC_SUCCESS_WEIGHT_NO_ANCHORS = 703
/** Peso de HTLC-Timeout TX (sem anchor) */
const HTLC_TIMEOUT_WEIGHT_NO_ANCHORS = 663
/** Peso de HTLC-Success TX (com anchor) */
const HTLC_SUCCESS_WEIGHT_ANCHORS = 706
/** Peso de HTLC-Timeout TX (com anchor) */
const HTLC_TIMEOUT_WEIGHT_ANCHORS = 666

/**
 * Cria HTLC-Success transaction
 *
 * Usada para reclamar um HTLC recebido quando temos o preimage.
 * O output usa o mesmo script que to_local (delayed + revocable).
 */
export function createHtlcSuccessTx(params: HtlcSuccessTxParams): HtlcTransaction {
  const {
    ctx,
    htlcOutputIdx,
    htlcValueSats,
    preimage,
    paymentHash,
    localHtlcPubkey,
    remoteHtlcPubkey,
    revocationPubkey,
    localDelayedPubkey,
    toSelfDelay,
    feerateSatKw,
    hasAnchors,
    remoteHtlcSig,
    localHtlcPrivkey,
  } = params

  // Calcular fee
  const weight = hasAnchors ? HTLC_SUCCESS_WEIGHT_ANCHORS : HTLC_SUCCESS_WEIGHT_NO_ANCHORS
  const feeSats = BigInt(Math.ceil((weight * feerateSatKw) / 1000))

  // Valor do output (HTLC value - fee)
  // Com anchors, fee é zero (pago via CPFP)
  const outputValueSats = hasAnchors ? htlcValueSats : htlcValueSats - feeSats

  // Criar witness script do output (igual to_local)
  const outputWitnessScript = makeToLocalWitnessScript(
    revocationPubkey,
    toSelfDelay,
    localDelayedPubkey,
  )

  // Criar script do input (HTLC output do commitment)
  const htlcWitnessScript = makeReceivedHtlcScript({
    revocationPubkey,
    remoteHtlcPubkey,
    localHtlcPubkey,
    paymentHash,
    cltvExpiry: 0, // Não usado para success
    hasAnchors,
  })

  // Construir transação
  const txBuilder = {
    version: 2,
    locktime: 0,
    inputs: [
      {
        txid: ctx.txid,
        vout: htlcOutputIdx,
        sequence: hasAnchors ? 1 : 0,
        witnessScript: htlcWitnessScript,
      },
    ],
    outputs: [
      {
        value: outputValueSats,
        script: createP2wshScript(outputWitnessScript),
      },
    ],
  }

  // Criar witness
  // witness: <remotehtlcsig> <localhtlcsig> <payment_preimage> <witness_script>
  const localSig = signHtlcTx(txBuilder, 0, htlcValueSats, htlcWitnessScript, localHtlcPrivkey)

  const witness = [remoteHtlcSig, localSig, preimage, htlcWitnessScript]

  // Serializar
  const txHex = serializeTx(txBuilder)
  const txWitnessHex = serializeTxWithWitness(txBuilder, [witness])
  const txid = calculateTxid(txBuilder)

  return {
    txHex,
    txWitnessHex,
    txid,
    outputWitnessScript,
    outputValueSats,
  }
}

/**
 * Cria HTLC-Timeout transaction
 *
 * Usada para recuperar um HTLC oferecido após o timeout.
 * O output usa o mesmo script que to_local (delayed + revocable).
 */
export function createHtlcTimeoutTx(params: HtlcTimeoutTxParams): HtlcTransaction {
  const {
    ctx,
    htlcOutputIdx,
    htlcValueSats,
    paymentHash,
    cltvExpiry,
    localHtlcPubkey,
    remoteHtlcPubkey,
    revocationPubkey,
    localDelayedPubkey,
    toSelfDelay,
    feerateSatKw,
    hasAnchors,
    remoteHtlcSig,
    localHtlcPrivkey,
  } = params

  // Calcular fee
  const weight = hasAnchors ? HTLC_TIMEOUT_WEIGHT_ANCHORS : HTLC_TIMEOUT_WEIGHT_NO_ANCHORS
  const feeSats = BigInt(Math.ceil((weight * feerateSatKw) / 1000))

  // Valor do output (HTLC value - fee)
  // Com anchors, fee é zero (pago via CPFP)
  const outputValueSats = hasAnchors ? htlcValueSats : htlcValueSats - feeSats

  // Criar witness script do output (igual to_local)
  const outputWitnessScript = makeToLocalWitnessScript(
    revocationPubkey,
    toSelfDelay,
    localDelayedPubkey,
  )

  // Criar script do input (HTLC output do commitment)
  const htlcWitnessScript = makeOfferedHtlcScript({
    revocationPubkey,
    remoteHtlcPubkey,
    localHtlcPubkey,
    paymentHash,
    hasAnchors,
  })

  // Construir transação
  const txBuilder = {
    version: 2,
    locktime: cltvExpiry, // CLTV locktime
    inputs: [
      {
        txid: ctx.txid,
        vout: htlcOutputIdx,
        sequence: hasAnchors ? 1 : 0,
        witnessScript: htlcWitnessScript,
      },
    ],
    outputs: [
      {
        value: outputValueSats,
        script: createP2wshScript(outputWitnessScript),
      },
    ],
  }

  // Criar witness
  // witness: <remotehtlcsig> <localhtlcsig> <> <witness_script>
  const localSig = signHtlcTx(txBuilder, 0, htlcValueSats, htlcWitnessScript, localHtlcPrivkey)

  const witness = [remoteHtlcSig, localSig, new Uint8Array(0), htlcWitnessScript]

  // Serializar
  const txHex = serializeTx(txBuilder)
  const txWitnessHex = serializeTxWithWitness(txBuilder, [witness])
  const txid = calculateTxid(txBuilder)

  return {
    txHex,
    txWitnessHex,
    txid,
    outputWitnessScript,
    outputValueSats,
  }
}

/**
 * Cria script para Offered HTLC
 *
 * BOLT #3:
 * OP_DUP OP_HASH160 <RIPEMD160(SHA256(revocationpubkey))> OP_EQUAL
 * OP_IF
 *     OP_CHECKSIG
 * OP_ELSE
 *     <remote_htlcpubkey> OP_SWAP OP_SIZE 32 OP_EQUAL
 *     OP_NOTIF
 *         OP_DROP 2 OP_SWAP <local_htlcpubkey> 2 OP_CHECKMULTISIG
 *     OP_ELSE
 *         OP_HASH160 <RIPEMD160(payment_hash)> OP_EQUALVERIFY
 *         OP_CHECKSIG
 *     OP_ENDIF
 *     [OP_1 OP_CHECKSEQUENCEVERIFY OP_DROP] (se anchors)
 * OP_ENDIF
 */
function makeOfferedHtlcScript(params: {
  revocationPubkey: Uint8Array
  remoteHtlcPubkey: Uint8Array
  localHtlcPubkey: Uint8Array
  paymentHash: Uint8Array
  hasAnchors: boolean
}): Uint8Array {
  const { revocationPubkey, remoteHtlcPubkey, localHtlcPubkey, paymentHash, hasAnchors } = params

  const revocationPubkeyHash = hash160(revocationPubkey)
  const paymentHashRipemd = hash160(paymentHash)

  const parts: Uint8Array[] = [
    // OP_DUP OP_HASH160 <revocation_key_hash> OP_EQUAL
    new Uint8Array([OpCode.OP_DUP, OpCode.OP_HASH160, 0x14]),
    revocationPubkeyHash,
    new Uint8Array([OpCode.OP_EQUAL]),
    // OP_IF OP_CHECKSIG
    new Uint8Array([OpCode.OP_IF, OpCode.OP_CHECKSIG]),
    // OP_ELSE <remote_htlcpubkey> OP_SWAP OP_SIZE 32 OP_EQUAL
    new Uint8Array([OpCode.OP_ELSE, 0x21]),
    remoteHtlcPubkey,
    new Uint8Array([OpCode.OP_SWAP, OpCode.OP_SIZE, 0x01, 0x20, OpCode.OP_EQUAL]),
    // OP_NOTIF OP_DROP 2 OP_SWAP <local_htlcpubkey> 2 OP_CHECKMULTISIG
    new Uint8Array([OpCode.OP_NOTIF, OpCode.OP_DROP, OpCode.OP_2, OpCode.OP_SWAP, 0x21]),
    localHtlcPubkey,
    new Uint8Array([OpCode.OP_2, OpCode.OP_CHECKMULTISIG]),
    // OP_ELSE OP_HASH160 <payment_hash_ripemd> OP_EQUALVERIFY OP_CHECKSIG OP_ENDIF
    new Uint8Array([OpCode.OP_ELSE, OpCode.OP_HASH160, 0x14]),
    paymentHashRipemd,
    new Uint8Array([OpCode.OP_EQUALVERIFY, OpCode.OP_CHECKSIG, OpCode.OP_ENDIF]),
  ]

  // Adicionar CSV delay se anchors
  if (hasAnchors) {
    parts.push(new Uint8Array([OpCode.OP_1, OpCode.OP_CHECKSEQUENCEVERIFY, OpCode.OP_DROP]))
  }

  // OP_ENDIF final
  parts.push(new Uint8Array([OpCode.OP_ENDIF]))

  return concatUint8Arrays(parts)
}

/**
 * Cria script para Received HTLC
 *
 * BOLT #3:
 * OP_DUP OP_HASH160 <RIPEMD160(SHA256(revocationpubkey))> OP_EQUAL
 * OP_IF
 *     OP_CHECKSIG
 * OP_ELSE
 *     <remote_htlcpubkey> OP_SWAP OP_SIZE 32 OP_EQUAL
 *     OP_IF
 *         OP_HASH160 <RIPEMD160(payment_hash)> OP_EQUALVERIFY
 *         2 OP_SWAP <local_htlcpubkey> 2 OP_CHECKMULTISIG
 *     OP_ELSE
 *         OP_DROP <cltv_expiry> OP_CHECKLOCKTIMEVERIFY OP_DROP
 *         OP_CHECKSIG
 *     OP_ENDIF
 *     [OP_1 OP_CHECKSEQUENCEVERIFY OP_DROP] (se anchors)
 * OP_ENDIF
 */
function makeReceivedHtlcScript(params: {
  revocationPubkey: Uint8Array
  remoteHtlcPubkey: Uint8Array
  localHtlcPubkey: Uint8Array
  paymentHash: Uint8Array
  cltvExpiry: number
  hasAnchors: boolean
}): Uint8Array {
  const {
    revocationPubkey,
    remoteHtlcPubkey,
    localHtlcPubkey,
    paymentHash,
    cltvExpiry,
    hasAnchors,
  } = params

  const revocationPubkeyHash = hash160(revocationPubkey)
  const paymentHashRipemd = hash160(paymentHash)
  const cltvBytes = encodeCltv(cltvExpiry)

  const parts: Uint8Array[] = [
    // OP_DUP OP_HASH160 <revocation_key_hash> OP_EQUAL
    new Uint8Array([OpCode.OP_DUP, OpCode.OP_HASH160, 0x14]),
    revocationPubkeyHash,
    new Uint8Array([OpCode.OP_EQUAL]),
    // OP_IF OP_CHECKSIG
    new Uint8Array([OpCode.OP_IF, OpCode.OP_CHECKSIG]),
    // OP_ELSE <remote_htlcpubkey> OP_SWAP OP_SIZE 32 OP_EQUAL
    new Uint8Array([OpCode.OP_ELSE, 0x21]),
    remoteHtlcPubkey,
    new Uint8Array([OpCode.OP_SWAP, OpCode.OP_SIZE, 0x01, 0x20, OpCode.OP_EQUAL]),
    // OP_IF OP_HASH160 <payment_hash_ripemd> OP_EQUALVERIFY 2 OP_SWAP <local_htlcpubkey> 2 OP_CHECKMULTISIG
    new Uint8Array([OpCode.OP_IF, OpCode.OP_HASH160, 0x14]),
    paymentHashRipemd,
    new Uint8Array([OpCode.OP_EQUALVERIFY, OpCode.OP_2, OpCode.OP_SWAP, 0x21]),
    localHtlcPubkey,
    new Uint8Array([OpCode.OP_2, OpCode.OP_CHECKMULTISIG]),
    // OP_ELSE OP_DROP <cltv_expiry> OP_CHECKLOCKTIMEVERIFY OP_DROP OP_CHECKSIG OP_ENDIF
    new Uint8Array([OpCode.OP_ELSE, OpCode.OP_DROP]),
    cltvBytes,
    new Uint8Array([
      OpCode.OP_CHECKLOCKTIMEVERIFY,
      OpCode.OP_DROP,
      OpCode.OP_CHECKSIG,
      OpCode.OP_ENDIF,
    ]),
  ]

  // Adicionar CSV delay se anchors
  if (hasAnchors) {
    parts.push(new Uint8Array([OpCode.OP_1, OpCode.OP_CHECKSEQUENCEVERIFY, OpCode.OP_DROP]))
  }

  // OP_ENDIF final
  parts.push(new Uint8Array([OpCode.OP_ENDIF]))

  return concatUint8Arrays(parts)
}

/**
 * Codifica CLTV para script
 */
function encodeCltv(cltv: number): Uint8Array {
  if (cltv <= 0) return new Uint8Array([OpCode.OP_0])
  if (cltv <= 16) return new Uint8Array([0x50 + cltv])

  const bytes: number[] = []
  let n = cltv
  while (n > 0) {
    bytes.push(n & 0xff)
    n >>= 8
  }
  if (bytes[bytes.length - 1] & 0x80) bytes.push(0x00)

  const result = new Uint8Array(1 + bytes.length)
  result[0] = bytes.length
  for (let i = 0; i < bytes.length; i++) result[i + 1] = bytes[i]
  return result
}

/**
 * Cria P2WSH script (0x0020 + sha256(witnessScript))
 */
function createP2wshScript(witnessScript: Uint8Array): Uint8Array {
  const scriptHash = sha256(witnessScript)
  const result = new Uint8Array(34)
  result[0] = 0x00 // OP_0
  result[1] = 0x20 // Push 32 bytes
  result.set(scriptHash, 2)
  return result
}

/**
 * Assina HTLC transaction
 */
function signHtlcTx(
  txBuilder: any,
  inputIdx: number,
  valueSats: bigint,
  witnessScript: Uint8Array,
  privkey: Uint8Array,
): Uint8Array {
  // Criar sighash para BIP143 (SegWit)
  const sighash = createSegwitSighash(txBuilder, inputIdx, valueSats, witnessScript)

  // Assinar
  const sig = secp.sign(sighash, privkey)
  const sigDer = sig.toDERRawBytes()

  // Adicionar SIGHASH_ALL
  const sigWithHashtype = new Uint8Array(sigDer.length + 1)
  sigWithHashtype.set(sigDer, 0)
  sigWithHashtype[sigDer.length] = 0x01 // SIGHASH_ALL

  return sigWithHashtype
}

/**
 * Cria sighash BIP143 para SegWit
 */
function createSegwitSighash(
  txBuilder: any,
  inputIdx: number,
  valueSats: bigint,
  witnessScript: Uint8Array,
): Uint8Array {
  // Implementação simplificada do BIP143 sighash
  // Na prática, usar biblioteca de transação completa

  const parts: Uint8Array[] = []

  // nVersion (4 bytes)
  const version = new Uint8Array(4)
  new DataView(version.buffer).setUint32(0, txBuilder.version, true)
  parts.push(version)

  // hashPrevouts (32 bytes)
  const prevouts = new Uint8Array(36 * txBuilder.inputs.length)
  for (let i = 0; i < txBuilder.inputs.length; i++) {
    const input = txBuilder.inputs[i]
    const txidBytes = hexToUint8Array(input.txid)
    prevouts.set(txidBytes, i * 36)
    new DataView(prevouts.buffer).setUint32(i * 36 + 32, input.vout, true)
  }
  parts.push(sha256(sha256(prevouts)))

  // hashSequence (32 bytes)
  const sequences = new Uint8Array(4 * txBuilder.inputs.length)
  for (let i = 0; i < txBuilder.inputs.length; i++) {
    new DataView(sequences.buffer).setUint32(
      i * 4,
      txBuilder.inputs[i].sequence || 0xfffffffd,
      true,
    )
  }
  parts.push(sha256(sha256(sequences)))

  // outpoint (36 bytes)
  const outpoint = new Uint8Array(36)
  outpoint.set(hexToUint8Array(txBuilder.inputs[inputIdx].txid), 0)
  new DataView(outpoint.buffer).setUint32(32, txBuilder.inputs[inputIdx].vout, true)
  parts.push(outpoint)

  // scriptCode (var)
  const scriptLen = new Uint8Array([witnessScript.length])
  parts.push(scriptLen)
  parts.push(witnessScript)

  // value (8 bytes)
  const value = new Uint8Array(8)
  new DataView(value.buffer).setBigUint64(0, valueSats, true)
  parts.push(value)

  // nSequence (4 bytes)
  const seq = new Uint8Array(4)
  new DataView(seq.buffer).setUint32(0, txBuilder.inputs[inputIdx].sequence || 0xfffffffd, true)
  parts.push(seq)

  // hashOutputs (32 bytes)
  let outputsLen = 0
  for (const out of txBuilder.outputs) {
    outputsLen += 8 + 1 + out.script.length
  }
  const outputs = new Uint8Array(outputsLen)
  let offset = 0
  for (const out of txBuilder.outputs) {
    new DataView(outputs.buffer).setBigUint64(offset, out.value, true)
    offset += 8
    outputs[offset++] = out.script.length
    outputs.set(out.script, offset)
    offset += out.script.length
  }
  parts.push(sha256(sha256(outputs)))

  // nLocktime (4 bytes)
  const locktime = new Uint8Array(4)
  new DataView(locktime.buffer).setUint32(0, txBuilder.locktime || 0, true)
  parts.push(locktime)

  // nHashType (4 bytes)
  const hashType = new Uint8Array(4)
  new DataView(hashType.buffer).setUint32(0, 0x01, true) // SIGHASH_ALL
  parts.push(hashType)

  return sha256(sha256(concatUint8Arrays(parts)))
}

/**
 * Serializa transação (sem witness)
 */
function serializeTx(txBuilder: any): string {
  const parts: Uint8Array[] = []

  // Version
  const version = new Uint8Array(4)
  new DataView(version.buffer).setUint32(0, txBuilder.version, true)
  parts.push(version)

  // Input count
  parts.push(encodeVarInt(txBuilder.inputs.length))

  // Inputs
  for (const input of txBuilder.inputs) {
    const txid = hexToUint8Array(input.txid)
    // Reverse for little-endian
    const txidReversed = new Uint8Array(32)
    for (let i = 0; i < 32; i++) txidReversed[i] = txid[31 - i]
    parts.push(txidReversed)

    const vout = new Uint8Array(4)
    new DataView(vout.buffer).setUint32(0, input.vout, true)
    parts.push(vout)

    parts.push(new Uint8Array([0x00])) // Empty scriptSig

    const seq = new Uint8Array(4)
    new DataView(seq.buffer).setUint32(0, input.sequence || 0xfffffffd, true)
    parts.push(seq)
  }

  // Output count
  parts.push(encodeVarInt(txBuilder.outputs.length))

  // Outputs
  for (const output of txBuilder.outputs) {
    const value = new Uint8Array(8)
    new DataView(value.buffer).setBigUint64(0, output.value, true)
    parts.push(value)

    parts.push(encodeVarInt(output.script.length))
    parts.push(output.script)
  }

  // Locktime
  const locktime = new Uint8Array(4)
  new DataView(locktime.buffer).setUint32(0, txBuilder.locktime || 0, true)
  parts.push(locktime)

  return uint8ArrayToHex(concatUint8Arrays(parts))
}

/**
 * Serializa transação com witness
 */
function serializeTxWithWitness(txBuilder: any, witnesses: Uint8Array[][]): string {
  const parts: Uint8Array[] = []

  // Version
  const version = new Uint8Array(4)
  new DataView(version.buffer).setUint32(0, txBuilder.version, true)
  parts.push(version)

  // Marker and flag for SegWit
  parts.push(new Uint8Array([0x00, 0x01]))

  // Input count
  parts.push(encodeVarInt(txBuilder.inputs.length))

  // Inputs
  for (const input of txBuilder.inputs) {
    const txid = hexToUint8Array(input.txid)
    const txidReversed = new Uint8Array(32)
    for (let i = 0; i < 32; i++) txidReversed[i] = txid[31 - i]
    parts.push(txidReversed)

    const vout = new Uint8Array(4)
    new DataView(vout.buffer).setUint32(0, input.vout, true)
    parts.push(vout)

    parts.push(new Uint8Array([0x00]))

    const seq = new Uint8Array(4)
    new DataView(seq.buffer).setUint32(0, input.sequence || 0xfffffffd, true)
    parts.push(seq)
  }

  // Output count
  parts.push(encodeVarInt(txBuilder.outputs.length))

  // Outputs
  for (const output of txBuilder.outputs) {
    const value = new Uint8Array(8)
    new DataView(value.buffer).setBigUint64(0, output.value, true)
    parts.push(value)

    parts.push(encodeVarInt(output.script.length))
    parts.push(output.script)
  }

  // Witnesses
  for (const witness of witnesses) {
    parts.push(encodeVarInt(witness.length))
    for (const item of witness) {
      parts.push(encodeVarInt(item.length))
      parts.push(item)
    }
  }

  // Locktime
  const locktime = new Uint8Array(4)
  new DataView(locktime.buffer).setUint32(0, txBuilder.locktime || 0, true)
  parts.push(locktime)

  return uint8ArrayToHex(concatUint8Arrays(parts))
}

/**
 * Calcula txid
 */
function calculateTxid(txBuilder: any): string {
  const txHex = serializeTx(txBuilder)
  const txBytes = hexToUint8Array(txHex)
  const hash = sha256(sha256(txBytes))
  // Reverse for display
  const reversed = new Uint8Array(32)
  for (let i = 0; i < 32; i++) reversed[i] = hash[31 - i]
  return uint8ArrayToHex(reversed)
}

/**
 * Codifica VarInt
 */
function encodeVarInt(n: number): Uint8Array {
  if (n < 0xfd) return new Uint8Array([n])
  if (n <= 0xffff) {
    const buf = new Uint8Array(3)
    buf[0] = 0xfd
    new DataView(buf.buffer).setUint16(1, n, true)
    return buf
  }
  if (n <= 0xffffffff) {
    const buf = new Uint8Array(5)
    buf[0] = 0xfe
    new DataView(buf.buffer).setUint32(1, n, true)
    return buf
  }
  const buf = new Uint8Array(9)
  buf[0] = 0xff
  new DataView(buf.buffer).setBigUint64(1, BigInt(n), true)
  return buf
}

// Core Protocol Functions

/**
 * Monitors the blockchain for transactions spending unresolved outputs
 * Requirement: Once funding transaction is broadcast OR commitment signed,
 * MUST monitor blockchain for transactions spending any unresolved output
 */
export function monitorBlockchainForSpends(
  context: OnChainResolutionContext,
  channelState: OnChainChannelState,
  blockchainTransactions: Tx[],
): {
  newResolutions: OutputResolutionResult[]
  errors: OnChainError[]
} {
  const newResolutions: OutputResolutionResult[] = []
  const errors: OnChainError[] = []

  for (const tx of blockchainTransactions) {
    // Check if this transaction spends any of our unresolved outputs
    for (const vin of tx.vin) {
      const spendTxid = vin.txid
      const spendVout = vin.vout

      // Check if this spends our funding output
      if (
        uint8ArrayToHex(context.fundingTxid) === spendTxid &&
        context.fundingOutputIndex === spendVout
      ) {
        // Funding output spent - analyze the spending transaction
        const analysis = analyzeOnChainTransaction(tx, context)
        if (analysis) {
          const resolution = processTransactionAnalysis(analysis, context, channelState)
          if (resolution) {
            newResolutions.push(resolution)
          }
        }
      }

      // Check if this spends any HTLC outputs
      for (const resolution of channelState.pendingResolutions) {
        if (
          resolution.resolvingTransaction &&
          uint8ArrayToHex(resolution.resolvingTransaction) === spendTxid
        ) {
          // This transaction spends an HTLC output - update resolution
          const updatedResolution = {
            ...resolution,
            confirmationDepth: tx.confirmations || 0,
          }

          if (updatedResolution.confirmationDepth >= IRREVOCABLE_CONFIRMATION_DEPTH) {
            updatedResolution.state = OutputResolutionState.IRREVOCABLY_RESOLVED
          }

          newResolutions.push(updatedResolution)
        }
      }
    }

    // Also check if this transaction itself is a pending resolution
    for (const resolution of channelState.pendingResolutions) {
      if (
        resolution.resolvingTransaction &&
        uint8ArrayToHex(resolution.resolvingTransaction) === tx.txid
      ) {
        // This transaction is a pending resolution - update its confirmation status
        const updatedResolution = {
          ...resolution,
          confirmationDepth: tx.confirmations || 0,
        }

        if (updatedResolution.confirmationDepth >= IRREVOCABLE_CONFIRMATION_DEPTH) {
          updatedResolution.state = OutputResolutionState.IRREVOCABLY_RESOLVED
        }

        newResolutions.push(updatedResolution)
      }
    }
  }

  return { newResolutions, errors }
}

/**
 * Analyzes an on-chain transaction to determine its type and implications
 */
export function analyzeOnChainTransaction(
  tx: Tx,
  context: OnChainResolutionContext,
):
  | CommitmentAnalysis
  | HtlcTransactionAnalysis
  | PenaltyTransactionAnalysis
  | ClosingTransactionAnalysis
  | null {
  // Check if it's a closing transaction first (since they also spend from funding)
  const closingAnalysis = analyzeClosingTransaction(tx, context)
  if (closingAnalysis) {
    return closingAnalysis
  }

  // Check if it's a commitment transaction
  if (isCommitmentTransaction(tx, context)) {
    return analyzeCommitmentTransaction(tx, context)
  }

  // Check if it's an HTLC transaction
  const htlcAnalysis = analyzeHtlcTransaction(tx, context)
  if (htlcAnalysis) {
    return htlcAnalysis
  }

  // Check if it's a penalty transaction
  const penaltyAnalysis = analyzePenaltyTransaction(tx, context)
  if (penaltyAnalysis) {
    return penaltyAnalysis
  }

  return null
}

/**
 * Checks if a transaction is a commitment transaction
 */
export function isCommitmentTransaction(tx: Tx, context: OnChainResolutionContext): boolean {
  // Commitment transactions spend the funding output
  return tx.vin.some(
    vin =>
      uint8ArrayToHex(context.fundingTxid) === vin.txid && context.fundingOutputIndex === vin.vout,
  )
}

/**
 * Analyzes a commitment transaction
 */
export function analyzeCommitmentTransaction(
  tx: Tx,
  context: OnChainResolutionContext,
): CommitmentAnalysis {
  let closeType = ChannelCloseType.UNILATERAL_REMOTE_COMMITMENT
  let isRevoked = false
  let revocationPubkey: Point | undefined

  // Check if it's our commitment (local close) or remote's (remote close)
  // This would require checking signatures, but simplified for now

  // Analyze outputs
  const outputs: any[] = tx.vout.map((vout, index) => ({
    index,
    type: determineOutputType(vout, context),
    value: BigInt(vout.value * 100000000), // Convert to satoshis
    resolutionState: OutputResolutionState.UNRESOLVED,
  }))

  return {
    transactionType: OnChainTransactionType.COMMITMENT,
    closeType,
    outputs,
    isRevoked,
    revocationPubkey,
  }
}

/**
 * Determines the type of commitment output
 */
export function determineOutputType(
  vout: any,
  context: OnChainResolutionContext,
): CommitmentOutputType {
  // Simplified: check script patterns
  const script = vout.scriptPubKey.hex

  // Check for P2WPKH (to_remote)
  if (script.startsWith('0014')) {
    return CommitmentOutputType.TO_REMOTE
  }

  // Check for P2WSH (HTLCs, to_local, anchors)
  if (script.startsWith('0020')) {
    // Would need to decode script to determine exact type
    // Simplified: assume HTLC for now
    return CommitmentOutputType.OFFERED_HTLC
  }

  return CommitmentOutputType.TO_REMOTE // fallback
}

/**
 * Analyzes HTLC timeout/success transactions
 */
export function analyzeHtlcTransaction(
  tx: Tx,
  context: OnChainResolutionContext,
): HtlcTransactionAnalysis | null {
  // HTLC transactions typically spend from commitment outputs (not funding)
  // and have specific locktime patterns or witness data
  const spendsFromCommitment = tx.vin.some(vin => vin.txid !== uint8ArrayToHex(context.fundingTxid))

  if (!spendsFromCommitment) {
    return null
  }

  // Check for HTLC timeout (CLTV expiry - locktime is the expiry height)
  if (tx.locktime > 0 && tx.locktime < 500000000) {
    return {
      transactionType: OnChainTransactionType.HTLC_TIMEOUT,
      htlcId: 0n, // Would need to track
      paymentHash: new Uint8Array(32), // placeholder
      cltvExpiry: tx.locktime,
      resolutionState: OutputResolutionState.UNRESOLVED,
    }
  }

  // Check for HTLC success (locktime = 0, and has witness data)
  if (tx.locktime === 0 && tx.vin.some(vin => vin.txinwitness && vin.txinwitness.length > 0)) {
    return {
      transactionType: OnChainTransactionType.HTLC_SUCCESS,
      htlcId: 0n,
      paymentHash: new Uint8Array(32),
      resolutionState: OutputResolutionState.UNRESOLVED,
    }
  }

  return null
}

/**
 * Analyzes penalty transactions
 */
export function analyzePenaltyTransaction(
  tx: Tx,
  context: OnChainResolutionContext,
): PenaltyTransactionAnalysis | null {
  // Penalty transactions have multiple inputs from the same revoked commitment
  // and typically have specific witness patterns for revocation keys
  const inputTxids = tx.vin.map(vin => vin.txid)
  const uniqueTxids = new Set(inputTxids)

  // Must have multiple inputs from the same transaction (revoked commitment)
  if (uniqueTxids.size === 1 && tx.vin.length > 1) {
    return {
      transactionType: OnChainTransactionType.PENALTY,
      penaltyType: PenaltyTransactionType.TO_LOCAL_PENALTY, // simplified
      revokedCommitmentTxid: sha256(new Uint8Array([...tx.vin[0].txid].map(c => c.charCodeAt(0)))), // placeholder
      outputsResolved: tx.vin.map((_, i) => i),
      witnessWeight: TO_LOCAL_PENALTY_WITNESS_WEIGHT,
    }
  }

  return null
}

/**
 * Analyzes closing transactions
 */
export function analyzeClosingTransaction(
  tx: Tx,
  context: OnChainResolutionContext,
): ClosingTransactionAnalysis | null {
  // Closing transactions have 2 outputs max, spend from funding output, locktime = 0,
  // and typically don't have HTLC-related outputs (simplified check)
  if (
    tx.vout.length <= 2 &&
    tx.locktime === 0 &&
    tx.vin.some(vin => vin.txid === uint8ArrayToHex(context.fundingTxid)) &&
    tx.vout.length === 2 // Mutual close typically has 2 outputs
  ) {
    return {
      transactionType: OnChainTransactionType.CLOSING,
      closeType: ChannelCloseType.MUTUAL_CLOSE,
      localOutput: tx.vout[0]
        ? {
            address: tx.vout[0].scriptPubKey.addresses?.[0] || '',
            value: BigInt(tx.vout[0].value * 100000000),
          }
        : undefined,
      remoteOutput: tx.vout[1]
        ? {
            address: tx.vout[1].scriptPubKey.addresses?.[0] || '',
            value: BigInt(tx.vout[1].value * 100000000),
          }
        : undefined,
      fee: BigInt(0), // Simplified: would need input values to calculate properly
      resolutionState: OutputResolutionState.RESOLVED,
    }
  }

  return null
}

/**
 * Processes transaction analysis to create resolution results
 */
export function processTransactionAnalysis(
  analysis:
    | CommitmentAnalysis
    | HtlcTransactionAnalysis
    | PenaltyTransactionAnalysis
    | ClosingTransactionAnalysis,
  context: OnChainResolutionContext,
  channelState: OnChainChannelState,
): OutputResolutionResult | null {
  switch (analysis.transactionType) {
    case OnChainTransactionType.COMMITMENT:
      return processCommitmentAnalysis(analysis as CommitmentAnalysis, context, channelState)
    case OnChainTransactionType.HTLC_TIMEOUT:
    case OnChainTransactionType.HTLC_SUCCESS:
      return processHtlcAnalysis(analysis as HtlcTransactionAnalysis, context)
    case OnChainTransactionType.PENALTY:
      return processPenaltyAnalysis(analysis as PenaltyTransactionAnalysis)
    case OnChainTransactionType.CLOSING:
      return processClosingAnalysis(analysis as ClosingTransactionAnalysis)
    default:
      return null
  }
}

/**
 * Processes commitment transaction analysis
 */
function processCommitmentAnalysis(
  analysis: CommitmentAnalysis,
  context: OnChainResolutionContext,
  channelState: OnChainChannelState,
): OutputResolutionResult {
  const actions: HtlcResolutionAction[] = []

  if (analysis.closeType === ChannelCloseType.UNILATERAL_LOCAL_COMMITMENT) {
    // Local commitment published - handle as local close
    actions.push(HtlcResolutionAction.SPEND_TO_CONVENIENT_ADDRESS) // for to_local
    actions.push(HtlcResolutionAction.WAIT_FOR_TIMEOUT) // for HTLCs
  } else if (analysis.closeType === ChannelCloseType.UNILATERAL_REMOTE_COMMITMENT) {
    // Remote commitment published - handle as remote close
    actions.push(HtlcResolutionAction.SPEND_TO_CONVENIENT_ADDRESS) // for HTLCs
  } else if (analysis.closeType === ChannelCloseType.REVOKED_TRANSACTION_CLOSE) {
    // Revoked commitment - penalize
    actions.push(HtlcResolutionAction.SPEND_WITH_PREIMAGE) // penalty spend
  }

  return {
    state: OutputResolutionState.RESOLVED,
    actionsTaken: [],
    nextActions: actions,
  }
}

/**
 * Processes HTLC transaction analysis
 */
function processHtlcAnalysis(
  analysis: HtlcTransactionAnalysis,
  context: OnChainResolutionContext,
): OutputResolutionResult {
  let extractedPreimage: PaymentPreimage | undefined

  if (analysis.transactionType === OnChainTransactionType.HTLC_SUCCESS) {
    // Extract preimage from witness
    extractedPreimage = extractPreimageFromHtlcSuccess(analysis)
  }

  return {
    state: analysis.resolutionState,
    actionsTaken: [HtlcResolutionAction.EXTRACT_PREIMAGE],
    extractedPreimage,
  }
}

/**
 * Processes penalty transaction analysis
 */
function processPenaltyAnalysis(analysis: PenaltyTransactionAnalysis): OutputResolutionResult {
  return {
    state: OutputResolutionState.RESOLVED,
    actionsTaken: [HtlcResolutionAction.SPEND_WITH_PREIMAGE],
  }
}

/**
 * Processes closing transaction analysis
 */
function processClosingAnalysis(analysis: ClosingTransactionAnalysis): OutputResolutionResult {
  return {
    state: analysis.resolutionState || OutputResolutionState.RESOLVED,
    actionsTaken: [],
  }
}

/**
 * Extracts preimage from HTLC success transaction witness
 * Requirement: MUST extract payment preimage from HTLC-success transaction input witness
 */
export function extractPreimageFromHtlcSuccess(
  analysis: HtlcTransactionAnalysis,
): PaymentPreimage | undefined {
  // In a real implementation, this would parse the witness stack
  // Simplified: return placeholder
  if (analysis.transactionType === OnChainTransactionType.HTLC_SUCCESS) {
    return new Uint8Array(32) // 32-byte preimage
  }
  return undefined
}

/**
 * Checks if HTLC has timed out
 * Requirement: HTLC output has timed out once height >= cltv_expiry
 */
export function checkHtlcTimeout(
  htlcId: bigint,
  cltvExpiry: CltvExpiry,
  currentBlockHeight: number,
): HtlcTimeoutCheck {
  const isTimedOut = currentBlockHeight >= cltvExpiry
  const blocksUntilTimeout = isTimedOut ? 0 : cltvExpiry - currentBlockHeight

  return {
    htlcId,
    cltvExpiry,
    currentBlockHeight,
    isTimedOut,
    blocksUntilTimeout,
  }
}

/**
 * Handles revoked commitment transaction
 * Requirement: MUST resolve revoked outputs using revocation keys
 */
export function handleRevokedCommitment(
  commitmentTxid: Sha256,
  revocationPubkey: Point,
  outputsToPenalize: number[],
  currentBlockHeight: number,
  commitmentBlockHeight?: number,
): RevokedOutputHandling {
  // Use commitment publication height + security delay if provided, otherwise assume recent publication
  const effectiveDelay = commitmentBlockHeight ? currentBlockHeight - commitmentBlockHeight : 0 // Assume published at current height, so delay hasn't expired
  const securityDelayExpired = effectiveDelay >= SECURITY_DELAY_BLOCKS
  const blocksUntilExpiry = securityDelayExpired ? 0 : SECURITY_DELAY_BLOCKS - effectiveDelay

  return {
    commitmentTxid,
    revocationPubkey,
    outputsToPenalize,
    penaltyTransactions: [], // Would be populated when creating penalty txs
    securityDelayExpired,
    blocksUntilExpiry,
  }
}

/**
 * Calculates penalty transaction weight
 * From Appendix A: Expected Weights
 */
export function calculatePenaltyWeight(penaltyType: PenaltyTransactionType): number {
  switch (penaltyType) {
    case PenaltyTransactionType.TO_LOCAL_PENALTY:
      return TO_LOCAL_PENALTY_WITNESS_WEIGHT
    case PenaltyTransactionType.OFFERED_HTLC_PENALTY:
      return OFFERED_HTLC_PENALTY_WITNESS_WEIGHT
    case PenaltyTransactionType.RECEIVED_HTLC_PENALTY:
      return RECEIVED_HTLC_PENALTY_WITNESS_WEIGHT
  }
}

/**
 * Calculates penalty input weight
 */
export function calculatePenaltyInputWeight(penaltyType: PenaltyTransactionType): number {
  switch (penaltyType) {
    case PenaltyTransactionType.TO_LOCAL_PENALTY:
      return TO_LOCAL_PENALTY_INPUT_WEIGHT
    case PenaltyTransactionType.OFFERED_HTLC_PENALTY:
      return OFFERED_HTLC_PENALTY_INPUT_WEIGHT
    case PenaltyTransactionType.RECEIVED_HTLC_PENALTY:
      return RECEIVED_HTLC_PENALTY_INPUT_WEIGHT
  }
}

/**
 * Calculates maximum HTLCs that can be resolved in single penalty transaction
 */
export function calculateMaxHtlcsInPenaltyTransaction(): number {
  const maxWeight = 400000 // Standard max weight
  const baseWeight = TO_LOCAL_PENALTY_INPUT_WEIGHT + 272 // to_local + to_remote sweep
  const weightPerHtlc = RECEIVED_HTLC_PENALTY_INPUT_WEIGHT // worst case

  return Math.floor((maxWeight - baseWeight - 4 * 53 - 2) / weightPerHtlc)
}

/**
 * Manages fees for on-chain transactions
 */
export function manageOnChainFees(
  feeratePerKw: number,
  numPenaltyOutputs: number,
  optionAnchors: boolean,
): OnChainFeeManagement {
  // Estimate fees for penalty transactions
  const estimatedPenaltyFee = BigInt(numPenaltyOutputs * 1000) // Simplified

  // Estimate fees for HTLC transactions
  const estimatedHtlcFee = BigInt((663 * feeratePerKw) / 1000) // Base HTLC weight

  return {
    feeratePerKw,
    estimatedPenaltyFee,
    estimatedHtlcFee,
    useReplaceByFee: true,
    combineTransactions: optionAnchors,
  }
}

/**
 * Determines requirements for on-chain handling based on channel state
 */
export function determineOnChainRequirements(
  channelState: OnChainChannelState,
  analysis?: CommitmentAnalysis,
): OnChainRequirements {
  const hasUnresolvedOutputs = channelState.pendingResolutions.some(
    r => r.state === OutputResolutionState.UNRESOLVED,
  )

  const hasHtlcs =
    analysis?.outputs?.some(
      o =>
        o.type === CommitmentOutputType.OFFERED_HTLC ||
        o.type === CommitmentOutputType.RECEIVED_HTLC,
    ) || false

  return {
    mustMonitorBlockchain: true,
    mustResolveOutputs: hasUnresolvedOutputs,
    mustExtractPreimages: false, // Would be set based on HTLC analysis
    mustHandleRevokedTransactions: analysis?.isRevoked || false,
    mustWaitForDelays: analysis?.closeType === ChannelCloseType.UNILATERAL_LOCAL_COMMITMENT,
    canForgetChannel: !hasUnresolvedOutputs && !hasHtlcs,
  }
}

/**
 * Validates on-chain transaction handling
 */
export function validateOnChainHandling(
  context: OnChainResolutionContext,
  channelState: OnChainChannelState,
): OnChainError[] {
  const errors: OnChainError[] = []

  // Check for invalid transactions
  if (channelState.pendingResolutions.some(r => r.state === OutputResolutionState.UNRESOLVED)) {
    // Check if any resolution has been pending too long
    const now = Date.now()
    // Simplified: assume timeout after 100 blocks
    if (now > (channelState.lastActivity || 0) + 100 * 600000) {
      // 100 blocks * 10min
      errors.push({
        type: OnChainErrorType.TIMEOUT_EXPIRED,
        message: 'Output resolution timeout exceeded',
      })
    }
  }

  return errors
}

/**
 * Updates channel state based on new resolutions
 */
export function updateChannelState(
  channelState: OnChainChannelState,
  newResolutions: OutputResolutionResult[],
): OnChainChannelState {
  const updatedResolutions = [...channelState.pendingResolutions]

  for (const newResolution of newResolutions) {
    const existingIndex = updatedResolutions.findIndex(
      r =>
        r.resolvingTransaction &&
        uint8ArrayToHex(r.resolvingTransaction) ===
          uint8ArrayToHex(newResolution.resolvingTransaction!),
    )

    if (existingIndex >= 0) {
      updatedResolutions[existingIndex] = newResolution
    } else {
      updatedResolutions.push(newResolution)
    }
  }

  // Update irrevocably resolved outputs
  const irrevocablyResolved = updatedResolutions
    .filter(r => r.state === OutputResolutionState.IRREVOCABLY_RESOLVED)
    .map(r => 0) // Would need to track output indices

  // Update extracted preimages
  const updatedPreimages = [...channelState.extractedPreimages]
  for (const resolution of newResolutions) {
    if (resolution.extractedPreimage) {
      // Check if not already in the list
      const exists = updatedPreimages.some(
        p => uint8ArrayToHex(p) === uint8ArrayToHex(resolution.extractedPreimage!),
      )
      if (!exists) {
        updatedPreimages.push(resolution.extractedPreimage)
      }
    }
  }

  return {
    ...channelState,
    pendingResolutions: updatedResolutions,
    irrevocablyResolvedOutputs: irrevocablyResolved,
    extractedPreimages: updatedPreimages,
    lastActivity: Date.now(),
  }
}

/**
 * Tipos de output que podem ser swept
 */
export enum SweepOutputType {
  TO_LOCAL = 'to_local', // Nosso output após to_self_delay
  TO_LOCAL_ANCHOR = 'to_local_anchor', // Anchor output local
  HTLC_TIMEOUT = 'htlc_timeout', // HTLC que expirou (offered by us)
  HTLC_SUCCESS = 'htlc_success', // HTLC que foi resgatado (received by us)
  HTLC_SECOND_STAGE = 'htlc_second_stage', // Output de HTLC-timeout/success tx após delay
}

/**
 * Informações de um output para sweep
 */
export interface SweepableOutput {
  type: SweepOutputType
  txid: Uint8Array // 32 bytes
  vout: number
  value: bigint // satoshis
  script: Uint8Array // witness script
  cltvExpiry?: number // Para HTLCs com timeout
  csvDelay?: number // Para outputs com OP_CSV
  htlcId?: bigint
  paymentHash?: Uint8Array
  paymentPreimage?: Uint8Array // Para HTLC success
}

/**
 * Parâmetros para construir sweep transaction
 */
export interface SweepParams {
  outputs: SweepableOutput[]
  destinationScript: Uint8Array // P2WPKH ou P2WSH de destino
  feeRatePerKw: number
  currentBlockHeight: number
  localDelayedPubkey: Uint8Array
  revocationPubkey: Uint8Array
  localHtlcPubkey: Uint8Array
  remoteHtlcPubkey: Uint8Array
  toSelfDelay: number
}

/**
 * Resultado de uma sweep transaction
 */
export interface SweepTransaction {
  version: number
  locktime: number
  inputs: SweepInput[]
  outputs: SweepOutput[]
  weight: number
  fee: bigint
  totalSwept: bigint
}

export interface SweepInput {
  txid: Uint8Array
  vout: number
  sequence: number
  witnessScript: Uint8Array
  witnessStack: Uint8Array[] // Será preenchido após assinatura
}

export interface SweepOutput {
  value: bigint
  scriptPubKey: Uint8Array
}

/**
 * Calcula o peso de witness para um tipo de output
 */
export function calculateSweepWitnessWeight(outputType: SweepOutputType): number {
  switch (outputType) {
    case SweepOutputType.TO_LOCAL:
      // <local_delayedsig> 0 <witnessScript>
      // sig: 73, 0: 1, witnessScript: ~80
      return 1 + 73 + 1 + 1 + 80 // ~156 WU
    case SweepOutputType.TO_LOCAL_ANCHOR:
      // <local_sig> <witnessScript>
      return 1 + 73 + 1 + 40 // ~115 WU
    case SweepOutputType.HTLC_TIMEOUT:
      // 0 <remotesig> <localsig> <> <witnessScript>
      return 1 + 1 + 73 + 73 + 1 + 140 // ~289 WU
    case SweepOutputType.HTLC_SUCCESS:
      // 0 <remotesig> <localsig> <preimage> <witnessScript>
      return 1 + 1 + 73 + 73 + 33 + 140 // ~321 WU
    case SweepOutputType.HTLC_SECOND_STAGE:
      // <local_delayedsig> 0 <witnessScript>
      return 1 + 73 + 1 + 1 + 80 // ~156 WU
    default:
      return 200 // Estimativa conservadora
  }
}

/**
 * Verifica se um output pode ser swept agora
 */
export function canSweepOutput(
  output: SweepableOutput,
  currentBlockHeight: number,
): { canSweep: boolean; reason?: string; blocksUntilSweepable?: number } {
  // Verificar CLTV (absolute locktime)
  if (output.cltvExpiry && currentBlockHeight < output.cltvExpiry) {
    return {
      canSweep: false,
      reason: 'CLTV not expired',
      blocksUntilSweepable: output.cltvExpiry - currentBlockHeight,
    }
  }

  // CSV é verificado na transação, não precisa esperar aqui
  // (o nSequence vai enforçar o delay)

  return { canSweep: true }
}

/**
 * Constrói uma sweep transaction para múltiplos outputs
 */
export function buildSweepTransaction(params: SweepParams): SweepTransaction | null {
  const { outputs, destinationScript, feeRatePerKw, currentBlockHeight } = params

  // Filtrar outputs que podem ser swept
  const sweepableOutputs = outputs.filter(o => canSweepOutput(o, currentBlockHeight).canSweep)

  if (sweepableOutputs.length === 0) {
    return null
  }

  // Calcular peso base da transação
  // 4 (version) + 1 (marker) + 1 (flag) + 1 (input count) + 1 (output count) + 4 (locktime)
  let weight = 4 * (4 + 1 + 1 + 4) // = 40 WU para overhead

  // Calcular peso dos inputs
  const inputs: SweepInput[] = []
  let totalValue = 0n

  for (const output of sweepableOutputs) {
    // Input weight: 32 (txid) + 4 (vout) + 1 (scriptSig len) + 4 (sequence) = 41 bytes = 164 WU
    weight += 164

    // Witness weight
    weight += calculateSweepWitnessWeight(output.type)

    // Criar input
    const sequence = output.csvDelay ? output.csvDelay : 0xfffffffe
    inputs.push({
      txid: output.txid,
      vout: output.vout,
      sequence,
      witnessScript: output.script,
      witnessStack: [], // Preenchido após assinatura
    })

    totalValue += output.value
  }

  // Output weight: 8 (value) + 1 (scriptPubKey len) + len(scriptPubKey)
  weight += 4 * (8 + 1 + destinationScript.length)

  // Calcular fee
  const vsize = Math.ceil(weight / 4)
  const fee = BigInt(Math.ceil((vsize * feeRatePerKw) / 1000))

  // Verificar se há valor suficiente
  const outputValue = totalValue - fee
  if (outputValue <= 546n) {
    // Dust limit
    return null
  }

  // Determinar locktime
  // Usar o maior CLTV dos outputs se houver
  let locktime = 0
  for (const output of sweepableOutputs) {
    if (output.cltvExpiry && output.cltvExpiry > locktime) {
      locktime = output.cltvExpiry
    }
  }

  return {
    version: 2,
    locktime,
    inputs,
    outputs: [
      {
        value: outputValue,
        scriptPubKey: destinationScript,
      },
    ],
    weight,
    fee,
    totalSwept: outputValue,
  }
}

/**
 * Constrói witness para sweep de to_local output
 * <local_delayedsig> 0 <witnessScript>
 */
export function buildToLocalSweepWitness(
  signature: Uint8Array,
  witnessScript: Uint8Array,
): Uint8Array[] {
  return [
    signature,
    new Uint8Array([]), // 0 para o branch OP_ELSE (não revogação)
    witnessScript,
  ]
}

/**
 * Constrói witness para sweep de HTLC timeout (offered HTLC que expirou)
 * 0 <remotesig> <localsig> <> <witnessScript>
 */
export function buildHtlcTimeoutSweepWitness(
  localSig: Uint8Array,
  remoteSig: Uint8Array,
  witnessScript: Uint8Array,
): Uint8Array[] {
  return [
    new Uint8Array([]), // 0 para OP_CHECKMULTISIG dummy
    remoteSig,
    localSig,
    new Uint8Array([]), // Empty para timeout path
    witnessScript,
  ]
}

/**
 * Constrói witness para sweep de HTLC success (received HTLC com preimage)
 * 0 <remotesig> <localsig> <preimage> <witnessScript>
 */
export function buildHtlcSuccessSweepWitness(
  localSig: Uint8Array,
  remoteSig: Uint8Array,
  preimage: Uint8Array,
  witnessScript: Uint8Array,
): Uint8Array[] {
  return [
    new Uint8Array([]), // 0 para OP_CHECKMULTISIG dummy
    remoteSig,
    localSig,
    preimage,
    witnessScript,
  ]
}

// ==========================================
// BOLT #5: JUSTICE/PENALTY TRANSACTIONS
// ==========================================

/**
 * Informações de um output revogado
 */
export interface RevokedOutput {
  type: PenaltyTransactionType
  txid: Uint8Array
  vout: number
  value: bigint
  witnessScript: Uint8Array
  revocationPrivkey?: Uint8Array // Derivado do per-commitment secret
}

/**
 * Parâmetros para construir penalty transaction
 */
export interface PenaltyParams {
  revokedOutputs: RevokedOutput[]
  destinationScript: Uint8Array
  feeRatePerKw: number
  revocationPrivkey: Uint8Array // Derivado: revocationprivkey = revocationBaseSecret + SHA256(revocationBasepoint || perCommitmentPoint) * G
  perCommitmentSecret: Uint8Array
  revocationBasepoint: Uint8Array
}

/**
 * Justice transaction para punir commit revogado
 */
export interface JusticeTransaction {
  version: number
  locktime: number
  inputs: PenaltyInput[]
  outputs: PenaltyOutput[]
  weight: number
  fee: bigint
  totalRecovered: bigint
}

export interface PenaltyInput {
  txid: Uint8Array
  vout: number
  sequence: number
  witnessScript: Uint8Array
  penaltyType: PenaltyTransactionType
}

export interface PenaltyOutput {
  value: bigint
  scriptPubKey: Uint8Array
}

/**
 * Deriva revocation privkey do per-commitment secret
 *
 * Conforme BOLT-3:
 * revocation_privkey = revocation_basepoint_secret * SHA256(revocation_basepoint || per_commitment_point)
 *                    + per_commitment_secret * SHA256(per_commitment_point || revocation_basepoint)
 *
 * @see https://github.com/lightning/bolts/blob/master/03-transactions.md#revocationpubkey-derivation
 */
export function deriveRevocationPrivkey(
  revocationBasepointSecret: Uint8Array,
  perCommitmentSecret: Uint8Array,
  revocationBasepoint: Uint8Array,
  perCommitmentPoint: Uint8Array,
): Uint8Array {
  // Import secp256k1 functions for modular arithmetic
  const { scalarMultiply, scalarAdd } = require('@/core/lib/crypto/secp256k1')

  // Hash: SHA256(revocation_basepoint || per_commitment_point)
  const combined = new Uint8Array(66)
  combined.set(revocationBasepoint, 0)
  combined.set(perCommitmentPoint, 33)
  const hash = sha256(combined)

  // term1 = revocation_basepoint_secret
  const term1 = revocationBasepointSecret

  // term2 = per_commitment_secret * hash (mod n)
  const term2 = scalarMultiply(perCommitmentSecret, hash) as Uint8Array

  // revocation_privkey = term1 + term2 (mod n)
  return scalarAdd(term1, term2) as Uint8Array
}

/**
 * Constrói justice transaction para punir commit revogado
 */
export function buildJusticeTransaction(params: PenaltyParams): JusticeTransaction | null {
  const { revokedOutputs, destinationScript, feeRatePerKw } = params

  if (revokedOutputs.length === 0) {
    return null
  }

  // Calcular peso base
  let weight = 40 // Overhead base

  // Calcular peso dos inputs
  const inputs: PenaltyInput[] = []
  let totalValue = 0n

  for (const output of revokedOutputs) {
    weight += calculatePenaltyInputWeight(output.type)

    inputs.push({
      txid: output.txid,
      vout: output.vout,
      sequence: 0xffffffff, // Não usa RBF para penalty
      witnessScript: output.witnessScript,
      penaltyType: output.type,
    })

    totalValue += output.value
  }

  // Output weight
  weight += 4 * (8 + 1 + destinationScript.length)

  // Calcular fee
  const vsize = Math.ceil(weight / 4)
  const fee = BigInt(Math.ceil((vsize * feeRatePerKw) / 1000))

  // Verificar se há valor suficiente
  const outputValue = totalValue - fee
  if (outputValue <= 546n) {
    return null
  }

  return {
    version: 2,
    locktime: 0, // Penalty tx não precisa de locktime
    inputs,
    outputs: [
      {
        value: outputValue,
        scriptPubKey: destinationScript,
      },
    ],
    weight,
    fee,
    totalRecovered: outputValue,
  }
}

/**
 * Constrói witness para penalty de to_local (revocação)
 * <revocationsig> 1 <witnessScript>
 */
export function buildToLocalPenaltyWitness(
  revocationSig: Uint8Array,
  witnessScript: Uint8Array,
): Uint8Array[] {
  return [
    revocationSig,
    new Uint8Array([0x01]), // 1 para branch OP_IF (revogação)
    witnessScript,
  ]
}

/**
 * Constrói witness para penalty de offered HTLC (revogação)
 * <revocationsig> <revocationpubkey> <witnessScript>
 */
export function buildOfferedHtlcPenaltyWitness(
  revocationSig: Uint8Array,
  revocationPubkey: Uint8Array,
  witnessScript: Uint8Array,
): Uint8Array[] {
  return [revocationSig, revocationPubkey, witnessScript]
}

/**
 * Constrói witness para penalty de received HTLC (revogação)
 * <revocationsig> <revocationpubkey> <witnessScript>
 */
export function buildReceivedHtlcPenaltyWitness(
  revocationSig: Uint8Array,
  revocationPubkey: Uint8Array,
  witnessScript: Uint8Array,
): Uint8Array[] {
  return [revocationSig, revocationPubkey, witnessScript]
}

/**
 * Detecta se um commitment transaction é revogado
 *
 * Verifica se o per-commitment secret corresponde ao per-commitment point esperado.
 * Um commitment é considerado revogado se:
 * 1. O secret não é zero
 * 2. secret * G == expectedPerCommitmentPoint
 *
 * @param _commitmentTxid - TXID do commitment (não usado, mantido para API)
 * @param perCommitmentSecret - Secret revelado pelo peer
 * @param expectedPerCommitmentPoint - Point que deveria corresponder ao secret
 * @returns true se o commitment é revogado (secret é válido)
 */
export function detectRevokedCommitment(
  _commitmentTxid: Uint8Array,
  perCommitmentSecret: Uint8Array,
  expectedPerCommitmentPoint: Uint8Array,
): boolean {
  // Import secp256k1 functions
  const { secretToPoint: scalarToPoint, pointsEqual } = require('@/core/lib/crypto/secp256k1')

  // Verificar se o secret não é zero
  const isZero = perCommitmentSecret.every(b => b === 0)
  if (isZero) {
    return false
  }

  try {
    // Derivar point do secret: point = secret * G
    const derivedPoint = scalarToPoint(perCommitmentSecret, true) as Uint8Array

    // Verificar se o point derivado corresponde ao esperado
    return pointsEqual(derivedPoint, expectedPerCommitmentPoint)
  } catch {
    // Se falhar (ex: secret inválido), não é um commitment revogado válido
    return false
  }
}

/**
 * Encontra outputs revogados em uma commitment transaction
 */
export function findRevokedOutputs(
  tx: Tx,
  context: OnChainResolutionContext,
  perCommitmentSecret: Uint8Array,
): RevokedOutput[] {
  const revokedOutputs: RevokedOutput[] = []
  const txidBytes = new TextEncoder().encode(tx.txid)

  for (let i = 0; i < tx.vout.length; i++) {
    const output = tx.vout[i]
    const value = BigInt(Math.floor(output.value * 100000000))

    // Analisar o tipo de output baseado no script
    // Isso é simplificado - na prática, precisamos analisar o witness script

    // Se parece com to_local (P2WSH com script de revogação)
    if (output.scriptPubKey.type === 'witness_v0_scripthash') {
      revokedOutputs.push({
        type: PenaltyTransactionType.TO_LOCAL_PENALTY,
        txid: txidBytes,
        vout: i,
        value,
        witnessScript: new Uint8Array(0), // Seria extraído do witness
      })
    }
  }

  return revokedOutputs
}

/**
 * Serializa sweep/justice transaction para broadcast
 */
export function serializeSweepTransaction(tx: SweepTransaction | JusticeTransaction): Uint8Array {
  const parts: Uint8Array[] = []

  // Version (4 bytes, little-endian)
  const version = new Uint8Array(4)
  version[0] = tx.version & 0xff
  version[1] = (tx.version >> 8) & 0xff
  version[2] = (tx.version >> 16) & 0xff
  version[3] = (tx.version >> 24) & 0xff
  parts.push(version)

  // Marker and flag for segwit
  parts.push(new Uint8Array([0x00, 0x01]))

  // Input count (varint)
  parts.push(encodeVarint(tx.inputs.length))

  // Inputs
  for (const input of tx.inputs) {
    // txid (32 bytes, reversed)
    const txidReversed = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      txidReversed[i] = input.txid[31 - i]
    }
    parts.push(txidReversed)

    // vout (4 bytes, little-endian)
    const vout = new Uint8Array(4)
    vout[0] = input.vout & 0xff
    vout[1] = (input.vout >> 8) & 0xff
    vout[2] = (input.vout >> 16) & 0xff
    vout[3] = (input.vout >> 24) & 0xff
    parts.push(vout)

    // scriptSig (empty for segwit)
    parts.push(new Uint8Array([0x00]))

    // sequence (4 bytes, little-endian)
    const sequence = new Uint8Array(4)
    sequence[0] = input.sequence & 0xff
    sequence[1] = (input.sequence >> 8) & 0xff
    sequence[2] = (input.sequence >> 16) & 0xff
    sequence[3] = (input.sequence >> 24) & 0xff
    parts.push(sequence)
  }

  // Output count (varint)
  parts.push(encodeVarint(tx.outputs.length))

  // Outputs
  for (const output of tx.outputs) {
    // value (8 bytes, little-endian)
    const value = new Uint8Array(8)
    let v = output.value
    for (let i = 0; i < 8; i++) {
      value[i] = Number(v & 0xffn)
      v >>= 8n
    }
    parts.push(value)

    // scriptPubKey
    parts.push(encodeVarint(output.scriptPubKey.length))
    parts.push(output.scriptPubKey)
  }

  // Witness data (a ser adicionado após assinatura)
  // Por enquanto, apenas placeholder
  for (const _input of tx.inputs) {
    parts.push(new Uint8Array([0x00])) // Número de witness items (placeholder)
  }

  // Locktime (4 bytes, little-endian)
  const locktime = new Uint8Array(4)
  locktime[0] = tx.locktime & 0xff
  locktime[1] = (tx.locktime >> 8) & 0xff
  locktime[2] = (tx.locktime >> 16) & 0xff
  locktime[3] = (tx.locktime >> 24) & 0xff
  parts.push(locktime)

  // Concatenar tudo
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }

  return result
}

/**
 * Codifica um número como varint
 */
function encodeVarint(n: number): Uint8Array {
  if (n < 0xfd) {
    return new Uint8Array([n])
  } else if (n <= 0xffff) {
    return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff])
  } else if (n <= 0xffffffff) {
    return new Uint8Array([0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff])
  } else {
    throw new Error('Number too large for varint')
  }
}

// ==========================================
// SWEEP INFO - Baseado em electrum/lnsweep.py SweepInfo
// ==========================================

/**
 * Informações para sweep de um output (similar ao SweepInfo do Electrum)
 */
export interface SweepInfo {
  /** Nome descritivo do sweep */
  name: string
  /** CLTV absoluto (null se não tem locktime) */
  cltvAbs: number | null
  /** Input parcial para sweep */
  txIn: PartialTxInput
  /** Output para first-stage HTLC tx (null para outros) */
  txOut: PartialTxOutput | null
  /** Se pode ser batched com outras transações */
  canBeBatched: boolean
  /** Se deve ignorar dust limit */
  dustOverride: boolean
}

/**
 * Input parcial para transação
 */
export interface PartialTxInput {
  /** Outpoint (txid:vout) */
  prevout: TxOutpoint
  /** Valor em satoshis */
  valueSats: bigint
  /** Witness script */
  witnessScript: Uint8Array
  /** Sequence number */
  nSequence: number
  /** Private key para assinatura */
  privkey: Uint8Array
  /** Se é revogação */
  isRevocation: boolean
  /** Preimage (para HTLC success) */
  preimage?: Uint8Array
  /** CSV delay (se aplicável) */
  csvDelay?: number
}

/**
 * Output parcial para transação
 */
export interface PartialTxOutput {
  /** Endereço de destino */
  address: string
  /** Valor em satoshis */
  valueSats: bigint
  /** Script de saída */
  scriptPubKey: Uint8Array
}

/**
 * Outpoint de transação
 */
export interface TxOutpoint {
  txid: Uint8Array
  outIdx: number
}

/**
 * Configuração de canal para sweep
 */
export interface ChannelConfig {
  /** Per-commitment secret seed (local) */
  perCommitmentSecretSeed: Uint8Array
  /** To-self delay */
  toSelfDelay: number
  /** Funding pubkey */
  fundingPubkey: Uint8Array
  /** Revocation basepoint */
  revocationBasepoint: Uint8Array
  /** Revocation basepoint privkey (se temos) */
  revocationBasepointPrivkey?: Uint8Array
  /** Payment basepoint */
  paymentBasepoint: Uint8Array
  /** Payment basepoint privkey (se temos) */
  paymentBasepointPrivkey?: Uint8Array
  /** Delayed payment basepoint */
  delayedPaymentBasepoint: Uint8Array
  /** Delayed payment basepoint privkey (se temos) */
  delayedPaymentBasepointPrivkey?: Uint8Array
  /** HTLC basepoint */
  htlcBasepoint: Uint8Array
  /** HTLC basepoint privkey (se temos) */
  htlcBasepointPrivkey?: Uint8Array
  /** Se tem anchors */
  hasAnchors: boolean
}

/**
 * HTLC para sweep
 */
export interface HtlcForSweep {
  /** ID do HTLC */
  htlcId: bigint
  /** Payment hash */
  paymentHash: Uint8Array
  /** Valor em msat */
  amountMsat: bigint
  /** CLTV expiry */
  cltvExpiry: number
  /** Direção (SENT ou RECEIVED) */
  direction: 'SENT' | 'RECEIVED'
  /** Preimage (se conhecido) */
  preimage?: Uint8Array
}

// ==========================================
// SWEEP OUR CTX - Sweep quando NÓS publicamos nosso commitment
// ==========================================

/**
 * Cria sweep transactions para quando NÓS publicamos nosso commitment
 *
 * Baseado em sweep_our_ctx do Electrum
 *
 * Outputs que podem ser swept:
 * - to_local: após CSV delay
 * - HTLC success: com preimage (após CSV delay se anchors)
 * - HTLC timeout: após CLTV expiry (após CSV delay se anchors)
 * - Second-stage HTLCs: após CSV delay
 * - Local anchor: para fee bumping
 */
export function sweepOurCtx(
  ctx: Tx,
  ourConfig: ChannelConfig,
  theirConfig: ChannelConfig,
  ctn: number,
  htlcs: HtlcForSweep[],
  getPreimage: (paymentHash: Uint8Array) => Uint8Array | undefined,
): Map<string, SweepInfo> {
  const sweeps = new Map<string, SweepInfo>()

  // Derivar secrets e keys para este commitment
  const ourPerCommitmentSecret = getPerCommitmentSecretFromSeed(
    ourConfig.perCommitmentSecretSeed,
    START_INDEX - ctn,
  )
  const ourPcp = secretToPoint(ourPerCommitmentSecret)

  // Derivar local delayed privkey
  const ourDelayedPrivkey = derivePrivkey(ourConfig.delayedPaymentBasepointPrivkey!, ourPcp)
  const ourDelayedPubkey = secp.getPublicKey(ourDelayedPrivkey, true)

  // Derivar revocation pubkey deles
  const theirRevocationPubkey = deriveRevocationPubkey(theirConfig.revocationBasepoint, ourPcp)

  const toSelfDelay = theirConfig.toSelfDelay

  // Derivar HTLC privkey
  const ourHtlcPrivkey = derivePrivkey(ourConfig.htlcBasepointPrivkey!, ourPcp)

  // Criar witness script para to_local
  const toLocalWitnessScript = makeToLocalWitnessScript(
    theirRevocationPubkey,
    toSelfDelay,
    ourDelayedPubkey,
  )
  const toLocalAddress = scriptToP2wshAddress(toLocalWitnessScript)

  // Encontrar output to_local
  const toLocalOutputIdx = findOutputByAddress(ctx, toLocalAddress)

  // 1. Sweep local anchor (se anchors habilitado)
  if (ourConfig.hasAnchors) {
    const anchorSweep = sweepCtxAnchor(ctx, ourConfig.fundingPubkey)
    if (anchorSweep) {
      sweeps.set(anchorSweep.txIn.prevout.txid + ':' + anchorSweep.txIn.prevout.outIdx, anchorSweep)
    }
  }

  // 2. Sweep to_local
  if (toLocalOutputIdx !== null) {
    const txIn = sweepCtxToLocal({
      ctx,
      outputIdx: toLocalOutputIdx,
      witnessScript: toLocalWitnessScript,
      privkey: ourDelayedPrivkey,
      isRevocation: false,
      toSelfDelay,
    })

    if (txIn) {
      const prevout = uint8ArrayToHex(hexToUint8Array(ctx.txid)) + ':' + toLocalOutputIdx
      sweeps.set(prevout, {
        name: 'our_ctx_to_local',
        cltvAbs: null,
        txIn,
        txOut: null,
        canBeBatched: true,
        dustOverride: false,
      })
    }
  }

  // 3. Sweep HTLCs
  for (const htlc of htlcs) {
    let preimage: Uint8Array | undefined

    if (htlc.direction === 'RECEIVED') {
      // Para HTLC recebido, precisamos do preimage
      preimage = htlc.preimage || getPreimage(htlc.paymentHash)
      if (!preimage) {
        // Não temos preimage, não podemos clamar
        continue
      }
    }

    // Encontrar output do HTLC no ctx
    const htlcOutputIdx = findHtlcOutput(ctx, htlc, ourConfig, theirConfig, ourPcp)
    if (htlcOutputIdx === null) continue

    // Criar HTLC transaction (first stage)
    const htlcTxResult = createHtlcTx({
      ctx,
      htlc,
      htlcOutputIdx,
      ourHtlcPrivkey,
      ourConfig,
      theirConfig,
      ourPcp,
      preimage,
      isOurCtx: true,
    })

    if (htlcTxResult) {
      const { htlcTx, htlcTxWitnessScript } = htlcTxResult
      const prevout = ctx.txid + ':' + htlcOutputIdx
      const name = htlc.direction === 'SENT' ? 'offered-htlc' : 'received-htlc'

      sweeps.set(prevout, {
        name,
        cltvAbs: htlcTx.locktime,
        txIn: htlcTx.inputs[0] as unknown as PartialTxInput,
        txOut: htlcTx.outputs[0] as unknown as PartialTxOutput,
        canBeBatched: false,
        dustOverride: false,
      })
    }
  }

  return sweeps
}

// ==========================================
// SWEEP THEIR CTX - Sweep quando ELES publicam o commitment deles
// ==========================================

/**
 * Cria sweep transactions para quando ELES publicam o commitment deles
 *
 * Baseado em sweep_their_ctx do Electrum
 *
 * Outputs que podem ser swept:
 * - to_local: APENAS se revogado (penalty)
 * - to_remote: com CSV delay se anchors, senão direto na wallet
 * - HTLCs: com preimage para offered (deles), ou timeout para received (deles)
 */
export function sweepTheirCtx(
  ctx: Tx,
  ourConfig: ChannelConfig,
  theirConfig: ChannelConfig,
  ctn: number,
  perCommitmentSecret: Uint8Array | null,
  theirPcp: Uint8Array,
  isRevocation: boolean,
  htlcs: HtlcForSweep[],
  getPreimage: (paymentHash: Uint8Array) => Uint8Array | undefined,
): Map<string, SweepInfo> {
  const sweeps = new Map<string, SweepInfo>()

  // Derivar keys baseado no per-commitment point deles
  const ourRevocationPubkey = deriveRevocationPubkey(ourConfig.revocationBasepoint, theirPcp)
  const theirDelayedPubkey = derivePubkey(theirConfig.delayedPaymentBasepoint, theirPcp)

  // Criar witness script para to_local deles
  const toLocalWitnessScript = makeToLocalWitnessScript(
    ourRevocationPubkey,
    ourConfig.toSelfDelay,
    theirDelayedPubkey,
  )
  const toLocalAddress = scriptToP2wshAddress(toLocalWitnessScript)

  // 1. Remote anchor (para fee bumping)
  if (ourConfig.hasAnchors) {
    const anchorSweep = sweepCtxAnchor(ctx, ourConfig.fundingPubkey)
    if (anchorSweep) {
      sweeps.set(anchorSweep.txIn.prevout.txid + ':' + anchorSweep.txIn.prevout.outIdx, {
        ...anchorSweep,
        name: 'remote_anchor',
      })
    }
  }

  // 2. To_local - apenas se revogado (penalty/justice)
  if (isRevocation && perCommitmentSecret) {
    const ourRevocationPrivkey = deriveBlindedPrivkey(
      ourConfig.revocationBasepointPrivkey!,
      perCommitmentSecret,
    )

    const toLocalOutputIdx = findOutputByAddress(ctx, toLocalAddress)
    if (toLocalOutputIdx !== null) {
      const txIn = sweepCtxToLocal({
        ctx,
        outputIdx: toLocalOutputIdx,
        witnessScript: toLocalWitnessScript,
        privkey: ourRevocationPrivkey,
        isRevocation: true,
      })

      if (txIn) {
        const prevout = ctx.txid + ':' + toLocalOutputIdx
        sweeps.set(prevout, {
          name: 'to_local_for_revoked_ctx',
          cltvAbs: null,
          txIn,
          txOut: null,
          canBeBatched: false,
          dustOverride: false,
        })
      }
    }
  }

  // 3. To_remote (nosso output no commitment deles)
  if (ourConfig.hasAnchors) {
    const toRemoteAddress = makeToRemoteAddress(ourConfig.paymentBasepoint, true)
    const toRemoteOutputIdx = findOutputByAddress(ctx, toRemoteAddress)

    if (toRemoteOutputIdx !== null) {
      const txIn = sweepTheirCtxToRemote({
        ctx,
        outputIdx: toRemoteOutputIdx,
        ourPaymentPrivkey: ourConfig.paymentBasepointPrivkey!,
        hasAnchors: true,
      })

      if (txIn) {
        const prevout = ctx.txid + ':' + toRemoteOutputIdx
        sweeps.set(prevout, {
          name: 'their_ctx_to_remote',
          cltvAbs: null,
          txIn,
          txOut: null,
          canBeBatched: true,
          dustOverride: false,
        })
      }
    }
  }

  // 4. Sweep HTLCs
  const ourHtlcPrivkey = derivePrivkey(ourConfig.htlcBasepointPrivkey!, theirPcp)
  const theirHtlcPubkey = derivePubkey(theirConfig.htlcBasepoint, theirPcp)

  for (const htlc of htlcs) {
    const isReceivedHtlc = htlc.direction === 'RECEIVED'
    let preimage: Uint8Array | undefined

    // Para HTLC oferecido por eles (nosso received), precisamos do preimage
    // Para HTLC recebido por eles (nosso offered), esperamos timeout
    if (!isReceivedHtlc && !isRevocation) {
      preimage = htlc.preimage || getPreimage(htlc.paymentHash)
      if (!preimage) continue
    }

    const htlcOutputIdx = findHtlcOutput(ctx, htlc, ourConfig, theirConfig, theirPcp)
    if (htlcOutputIdx === null) continue

    // Criar witness script do HTLC
    const htlcWitnessScript = makeHtlcOutputWitnessScript({
      isReceivedHtlc,
      remoteRevocationPubkey: ourRevocationPubkey,
      remoteHtlcPubkey: new Uint8Array(secp.getPublicKey(ourHtlcPrivkey, true)),
      localHtlcPubkey: theirHtlcPubkey,
      paymentHash: htlc.paymentHash,
      cltvAbs: htlc.cltvExpiry,
      hasAnchors: ourConfig.hasAnchors,
    })

    const privkeyToUse =
      isRevocation && perCommitmentSecret
        ? deriveBlindedPrivkey(ourConfig.revocationBasepointPrivkey!, perCommitmentSecret)
        : ourHtlcPrivkey

    const cltvAbs = isReceivedHtlc && !isRevocation ? htlc.cltvExpiry : 0

    const txIn = sweepTheirCtxHtlc({
      ctx,
      witnessScript: htlcWitnessScript,
      preimage,
      outputIdx: htlcOutputIdx,
      privkey: privkeyToUse,
      isRevocation,
      cltvAbs,
      hasAnchors: ourConfig.hasAnchors,
    })

    if (txIn) {
      const prevout = ctx.txid + ':' + htlcOutputIdx
      const suffix = isRevocation ? '_for_revoked_ctx' : ''
      sweeps.set(prevout, {
        name: `their_ctx_htlc_${htlcOutputIdx}${suffix}`,
        cltvAbs: cltvAbs || null,
        txIn,
        txOut: null,
        canBeBatched: false,
        dustOverride: false,
      })
    }
  }

  return sweeps
}

// ==========================================
// SWEEP JUSTICE (WATCHTOWER) - Para commitments revogados
// ==========================================

/**
 * Cria sweep transactions para watchtower usando per-commitment secret recebido
 *
 * Baseado em sweep_their_ctx_watchtower do Electrum
 */
export function sweepTheirCtxWatchtower(
  ctx: Tx,
  ourConfig: ChannelConfig,
  theirConfig: ChannelConfig,
  perCommitmentSecret: Uint8Array,
  htlcs: HtlcForSweep[],
): PartialTxInput[] {
  const txIns: PartialTxInput[] = []

  // Derivar keys do per-commitment secret
  const pcp = secretToPoint(perCommitmentSecret)

  const watcherRevocationPrivkey = deriveBlindedPrivkey(
    ourConfig.revocationBasepointPrivkey!,
    perCommitmentSecret,
  )
  const revocationPubkey = new Uint8Array(secp.getPublicKey(watcherRevocationPrivkey, true))

  const breacherDelayedPubkey = derivePubkey(theirConfig.delayedPaymentBasepoint, pcp)
  const toSelfDelay = ourConfig.toSelfDelay

  // 1. Justice tx para to_local do breacher
  const toLocalWitnessScript = makeToLocalWitnessScript(
    revocationPubkey,
    toSelfDelay,
    breacherDelayedPubkey,
  )
  const toLocalAddress = scriptToP2wshAddress(toLocalWitnessScript)
  const toLocalOutputIdx = findOutputByAddress(ctx, toLocalAddress)

  if (toLocalOutputIdx !== null) {
    const txIn = sweepCtxToLocal({
      ctx,
      outputIdx: toLocalOutputIdx,
      witnessScript: toLocalWitnessScript,
      privkey: watcherRevocationPrivkey,
      isRevocation: true,
    })
    if (txIn) txIns.push(txIn)
  }

  // 2. Justice txs para HTLCs do breacher
  const breacherHtlcPubkey = derivePubkey(theirConfig.htlcBasepoint, pcp)
  const watcherHtlcPubkey = derivePubkey(ourConfig.htlcBasepoint, pcp)

  for (const htlc of htlcs) {
    const isReceivedHtlc = htlc.direction === 'RECEIVED'
    const htlcWitnessScript = makeHtlcOutputWitnessScript({
      isReceivedHtlc,
      remoteRevocationPubkey: revocationPubkey,
      remoteHtlcPubkey: watcherHtlcPubkey,
      localHtlcPubkey: breacherHtlcPubkey,
      paymentHash: htlc.paymentHash,
      cltvAbs: htlc.cltvExpiry,
      hasAnchors: ourConfig.hasAnchors,
    })

    const htlcOutputIdx = findHtlcOutput(ctx, htlc, ourConfig, theirConfig, pcp)
    if (htlcOutputIdx === null) continue

    const cltvAbs = isReceivedHtlc ? htlc.cltvExpiry : 0
    const txIn = sweepTheirCtxHtlc({
      ctx,
      witnessScript: htlcWitnessScript,
      preimage: undefined,
      outputIdx: htlcOutputIdx,
      privkey: watcherRevocationPrivkey,
      isRevocation: true,
      cltvAbs,
      hasAnchors: ourConfig.hasAnchors,
    })

    if (txIn) txIns.push(txIn)
  }

  return txIns
}

// ==========================================
// SWEEP SECOND-STAGE HTLC TX
// ==========================================

/**
 * Sweep do output de uma HTLC transaction (second stage)
 *
 * Baseado em sweep_htlctx_output do Electrum
 */
export function sweepHtlcTxOutput(params: {
  htlcTx: Tx
  outputIdx: number
  htlcTxWitnessScript: Uint8Array
  privkey: Uint8Array
  isRevocation: boolean
  toSelfDelay?: number
}): PartialTxInput | null {
  // O output de uma HTLC tx usa o mesmo script que to_local
  return sweepCtxToLocal({
    ctx: params.htlcTx,
    outputIdx: params.outputIdx,
    witnessScript: params.htlcTxWitnessScript,
    privkey: params.privkey,
    isRevocation: params.isRevocation,
    toSelfDelay: params.toSelfDelay,
  })
}

// ==========================================
// FUNÇÕES AUXILIARES DE SWEEP
// ==========================================

/**
 * Cria input para sweep de to_local output
 */
function sweepCtxToLocal(params: {
  ctx: Tx
  outputIdx: number
  witnessScript: Uint8Array
  privkey: Uint8Array
  isRevocation: boolean
  toSelfDelay?: number
}): PartialTxInput | null {
  const { ctx, outputIdx, witnessScript, privkey, isRevocation, toSelfDelay } = params

  if (!ctx.vout[outputIdx]) return null
  const valueSats = BigInt(Math.floor(ctx.vout[outputIdx].value * 100000000))

  // Criar outpoint
  const prevout: TxOutpoint = {
    txid: hexToUint8Array(ctx.txid),
    outIdx: outputIdx,
  }

  // Sequence: 0xfffffffe se revogação, to_self_delay se normal
  let nSequence = 0xfffffffe
  if (!isRevocation && toSelfDelay !== undefined) {
    nSequence = toSelfDelay
  }

  return {
    prevout,
    valueSats,
    witnessScript,
    nSequence,
    privkey,
    isRevocation,
    csvDelay: isRevocation ? undefined : toSelfDelay,
  }
}

/**
 * Cria input para sweep de HTLC em commitment deles
 */
function sweepTheirCtxHtlc(params: {
  ctx: Tx
  witnessScript: Uint8Array
  preimage?: Uint8Array
  outputIdx: number
  privkey: Uint8Array
  isRevocation: boolean
  cltvAbs: number
  hasAnchors: boolean
}): PartialTxInput | null {
  const { ctx, witnessScript, preimage, outputIdx, privkey, isRevocation, cltvAbs, hasAnchors } =
    params

  if (!ctx.vout[outputIdx]) return null
  const valueSats = BigInt(Math.floor(ctx.vout[outputIdx].value * 100000000))

  const prevout: TxOutpoint = {
    txid: hexToUint8Array(ctx.txid),
    outIdx: outputIdx,
  }

  // Sequence: 1 se anchors, 0xfffffffd caso contrário
  const nSequence = hasAnchors ? 1 : 0xfffffffd

  return {
    prevout,
    valueSats,
    witnessScript,
    nSequence,
    privkey,
    isRevocation,
    preimage,
  }
}

/**
 * Cria input para sweep de to_remote em commitment deles (com anchors)
 */
function sweepTheirCtxToRemote(params: {
  ctx: Tx
  outputIdx: number
  ourPaymentPrivkey: Uint8Array
  hasAnchors: boolean
}): PartialTxInput | null {
  const { ctx, outputIdx, ourPaymentPrivkey, hasAnchors } = params

  if (!hasAnchors) return null // Sem anchors, vai direto pra wallet
  if (!ctx.vout[outputIdx]) return null

  const valueSats = BigInt(Math.floor(ctx.vout[outputIdx].value * 100000000))
  const ourPaymentPubkey = new Uint8Array(secp.getPublicKey(ourPaymentPrivkey, true))
  const witnessScript = makeToRemoteWitnessScript(ourPaymentPubkey)

  const prevout: TxOutpoint = {
    txid: hexToUint8Array(ctx.txid),
    outIdx: outputIdx,
  }

  return {
    prevout,
    valueSats,
    witnessScript,
    nSequence: 1, // CSV = 1 para anchors
    privkey: ourPaymentPrivkey,
    isRevocation: false,
    csvDelay: 1,
  }
}

/**
 * Cria input para sweep de anchor output
 */
function sweepCtxAnchor(ctx: Tx, fundingPubkey: Uint8Array): SweepInfo | null {
  const anchorAddress = makeAnchorAddress(fundingPubkey)
  const witnessScript = makeAnchorWitnessScript(fundingPubkey)
  const outputIdx = findOutputByAddress(ctx, anchorAddress)

  if (outputIdx === null) return null

  const valueSats = BigInt(Math.floor(ctx.vout[outputIdx].value * 100000000))

  const prevout: TxOutpoint = {
    txid: hexToUint8Array(ctx.txid),
    outIdx: outputIdx,
  }

  return {
    name: 'local_anchor',
    cltvAbs: null,
    txIn: {
      prevout,
      valueSats,
      witnessScript,
      nSequence: 0xfffffffd,
      privkey: new Uint8Array(32), // Precisa da funding privkey
      isRevocation: false,
    },
    txOut: null,
    canBeBatched: true,
    dustOverride: true,
  }
}

// ==========================================
// SCRIPT BUILDERS
// ==========================================

/**
 * Cria witness script para to_local output
 *
 * OP_IF
 *     <revocationpubkey>
 * OP_ELSE
 *     <to_self_delay>
 *     OP_CHECKSEQUENCEVERIFY
 *     OP_DROP
 *     <local_delayedpubkey>
 * OP_ENDIF
 * OP_CHECKSIG
 */
function makeToLocalWitnessScript(
  revocationPubkey: Uint8Array,
  toSelfDelay: number,
  localDelayedPubkey: Uint8Array,
): Uint8Array {
  const delayBytes = encodeCSV(toSelfDelay)

  const parts: Uint8Array[] = [
    new Uint8Array([OpCode.OP_IF]),
    new Uint8Array([0x21]), // Push 33 bytes
    revocationPubkey,
    new Uint8Array([OpCode.OP_ELSE]),
    delayBytes,
    new Uint8Array([OpCode.OP_CHECKSEQUENCEVERIFY, OpCode.OP_DROP]),
    new Uint8Array([0x21]),
    localDelayedPubkey,
    new Uint8Array([OpCode.OP_ENDIF, OpCode.OP_CHECKSIG]),
  ]

  return concatUint8Arrays(parts)
}

/**
 * Cria witness script para to_remote output (com anchors)
 *
 * <remote_pubkey> OP_CHECKSIGVERIFY 1 OP_CHECKSEQUENCEVERIFY
 */
function makeToRemoteWitnessScript(remotePubkey: Uint8Array): Uint8Array {
  return new Uint8Array([
    0x21, // Push 33 bytes
    ...remotePubkey,
    OpCode.OP_CHECKSIGVERIFY,
    OpCode.OP_1,
    OpCode.OP_CHECKSEQUENCEVERIFY,
  ])
}

/**
 * Cria witness script para anchor output
 *
 * <funding_pubkey> OP_CHECKSIG OP_IFDUP OP_NOTIF OP_16 OP_CHECKSEQUENCEVERIFY OP_ENDIF
 */
function makeAnchorWitnessScript(fundingPubkey: Uint8Array): Uint8Array {
  return new Uint8Array([
    0x21, // Push 33 bytes
    ...fundingPubkey,
    OpCode.OP_CHECKSIG,
    OpCode.OP_IFDUP,
    OpCode.OP_NOTIF,
    0x01,
    0x10, // Push 16
    OpCode.OP_CHECKSEQUENCEVERIFY,
    OpCode.OP_ENDIF,
  ])
}

/**
 * Cria witness script para HTLC output
 */
function makeHtlcOutputWitnessScript(params: {
  isReceivedHtlc: boolean
  remoteRevocationPubkey: Uint8Array
  remoteHtlcPubkey: Uint8Array
  localHtlcPubkey: Uint8Array
  paymentHash: Uint8Array
  cltvAbs: number
  hasAnchors: boolean
}): Uint8Array {
  // Implementação simplificada - ver commitment.ts para versão completa
  const {
    isReceivedHtlc,
    remoteRevocationPubkey,
    remoteHtlcPubkey,
    localHtlcPubkey,
    paymentHash,
    cltvAbs,
    hasAnchors,
  } = params

  // Placeholder - usa offered/received HTLC script do commitment.ts
  const revPubkeyHash = hash160(remoteRevocationPubkey)
  const paymentHashRipemd = hash160(paymentHash)

  // Simplified script construction
  const script = new Uint8Array(200)
  let offset = 0

  // OP_DUP OP_HASH160 <revocation_pubkey_hash> OP_EQUAL
  script[offset++] = OpCode.OP_DUP
  script[offset++] = OpCode.OP_HASH160
  script[offset++] = 0x14 // 20 bytes
  script.set(revPubkeyHash, offset)
  offset += 20
  script[offset++] = OpCode.OP_EQUAL
  script[offset++] = OpCode.OP_IF
  script[offset++] = OpCode.OP_CHECKSIG
  script[offset++] = OpCode.OP_ELSE
  // ... resto do script (simplificado)
  script[offset++] = 0x21
  script.set(remoteHtlcPubkey, offset)
  offset += 33
  script[offset++] = OpCode.OP_SWAP
  script[offset++] = OpCode.OP_SIZE
  script[offset++] = 0x01
  script[offset++] = 0x20
  script[offset++] = OpCode.OP_EQUAL
  script[offset++] = OpCode.OP_ENDIF

  return script.subarray(0, offset)
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/** Per-commitment secret seed constant */
const START_INDEX = 2 ** 48 - 1

/** Deriva per-commitment secret do seed */
function getPerCommitmentSecretFromSeed(seed: Uint8Array, index: number): Uint8Array {
  let secret = new Uint8Array(seed)
  for (let i = 47; i >= 0; i--) {
    if (((index >> i) & 1) === 1) {
      const temp = new Uint8Array(32)
      temp[i >> 3] ^= 1 << (7 - (i & 7))
      const xored = new Uint8Array(32)
      for (let j = 0; j < 32; j++) {
        xored[j] = secret[j] ^ temp[j]
      }
      secret = new Uint8Array(sha256(xored))
    }
  }
  return secret
}

/** Deriva privkey usando per-commitment point */
function derivePrivkey(basepointSecret: Uint8Array, perCommitmentPoint: Uint8Array): Uint8Array {
  const combined = new Uint8Array(66)
  combined.set(perCommitmentPoint, 0)
  combined.set(new Uint8Array(secp.getPublicKey(basepointSecret, true)), 33)
  const tweak = sha256(combined)

  // privkey = basepoint_secret + tweak (mod n)
  const baseBigInt = BigInt('0x' + uint8ArrayToHex(basepointSecret))
  const tweakBigInt = BigInt('0x' + uint8ArrayToHex(tweak))
  const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
  const result = (baseBigInt + tweakBigInt) % n

  const resultHex = result.toString(16).padStart(64, '0')
  return hexToUint8Array(resultHex)
}

/** Deriva blinded privkey para revogação */
function deriveBlindedPrivkey(
  basepointSecret: Uint8Array,
  perCommitmentSecret: Uint8Array,
): Uint8Array {
  // revocation_privkey = revocation_basepoint_secret * SHA256(revocation_basepoint || per_commitment_point)
  //                    + per_commitment_secret * SHA256(per_commitment_point || revocation_basepoint)
  const basepoint = new Uint8Array(secp.getPublicKey(basepointSecret, true))
  const perCommitmentPoint = secretToPoint(perCommitmentSecret)

  const combined1 = new Uint8Array(66)
  combined1.set(basepoint, 0)
  combined1.set(perCommitmentPoint, 33)
  const tweak1 = sha256(combined1)

  const combined2 = new Uint8Array(66)
  combined2.set(perCommitmentPoint, 0)
  combined2.set(basepoint, 33)
  const tweak2 = sha256(combined2)

  const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
  const base = BigInt('0x' + uint8ArrayToHex(basepointSecret))
  const secret = BigInt('0x' + uint8ArrayToHex(perCommitmentSecret))
  const t1 = BigInt('0x' + uint8ArrayToHex(tweak1))
  const t2 = BigInt('0x' + uint8ArrayToHex(tweak2))

  const result = (base * t1 + secret * t2) % n
  const resultHex = result.toString(16).padStart(64, '0')
  return hexToUint8Array(resultHex)
}

/** Converte script para endereço P2WSH */
function scriptToP2wshAddress(script: Uint8Array): string {
  const scriptHash = sha256(script)
  // Simplified - retorna hex do script hash
  return 'p2wsh:' + uint8ArrayToHex(scriptHash)
}

/** Cria endereço para to_remote */
function makeToRemoteAddress(paymentBasepoint: Uint8Array, hasAnchors: boolean): string {
  if (hasAnchors) {
    const script = makeToRemoteWitnessScript(paymentBasepoint)
    return scriptToP2wshAddress(script)
  }
  // P2WPKH
  const pubkeyHash = hash160(paymentBasepoint)
  return 'p2wpkh:' + uint8ArrayToHex(pubkeyHash)
}

/** Cria endereço para anchor output */
function makeAnchorAddress(fundingPubkey: Uint8Array): string {
  const script = makeAnchorWitnessScript(fundingPubkey)
  return scriptToP2wshAddress(script)
}

/** Encontra output por endereço */
function findOutputByAddress(tx: Tx, address: string): number | null {
  for (let i = 0; i < tx.vout.length; i++) {
    const output = tx.vout[i]
    // Simplified address matching
    if (output.scriptPubKey.addresses && output.scriptPubKey.addresses.includes(address)) {
      return i
    }
    // Match by script hash
    const scriptHex = output.scriptPubKey.hex
    if (address.startsWith('p2wsh:') && scriptHex.startsWith('0020')) {
      const hashFromScript = scriptHex.substring(4)
      const hashFromAddress = address.substring(6)
      if (hashFromScript === hashFromAddress) {
        return i
      }
    }
  }
  return null
}

/** Encontra output de HTLC */
function findHtlcOutput(
  tx: Tx,
  htlc: HtlcForSweep,
  ourConfig: ChannelConfig,
  theirConfig: ChannelConfig,
  pcp: Uint8Array,
): number | null {
  // Simplified - would need to match HTLC script
  // For now, return null and let caller handle
  return null
}

/** Cria HTLC transaction */
function createHtlcTx(params: {
  ctx: Tx
  htlc: HtlcForSweep
  htlcOutputIdx: number
  ourHtlcPrivkey: Uint8Array
  ourConfig: ChannelConfig
  theirConfig: ChannelConfig
  ourPcp: Uint8Array
  preimage?: Uint8Array
  isOurCtx: boolean
}): { htlcTx: any; htlcTxWitnessScript: Uint8Array } | null {
  // Placeholder - full implementation would create HTLC-success or HTLC-timeout tx
  return null
}

/** Codifica CSV delay */
function encodeCSV(delay: number): Uint8Array {
  if (delay <= 0x10) {
    return new Uint8Array([0x50 + delay]) // OP_1 to OP_16
  }
  if (delay <= 0x7f) {
    return new Uint8Array([0x01, delay])
  }
  if (delay <= 0x7fff) {
    return new Uint8Array([0x02, delay & 0xff, (delay >> 8) & 0xff])
  }
  return new Uint8Array([0x03, delay & 0xff, (delay >> 8) & 0xff, (delay >> 16) & 0xff])
}

/** Concatena arrays */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

// ==========================================
// PREIMAGE EXTRACTION
// ==========================================

/**
 * Resultado da extração de preimage
 */
export interface PreimageExtractionResult {
  /** Preimage encontrado (32 bytes) */
  preimage: Uint8Array
  /** Payment hash correspondente */
  paymentHash: Uint8Array
  /** Txid onde foi encontrado */
  txid: string
  /** Input index onde foi encontrado */
  inputIdx: number
}

/**
 * Extrai preimage de uma transação on-chain
 *
 * Quando um HTLC-Success TX é publicado, o preimage é revelado no witness.
 * Esta função extrai preimages de transações que gastam outputs HTLC.
 *
 * O witness de HTLC-Success tem formato:
 * <remotehtlcsig> <localhtlcsig> <payment_preimage> <witness_script>
 *
 * O preimage sempre tem exatamente 32 bytes.
 */
export function extractPreimageFromTx(tx: Tx): PreimageExtractionResult[] {
  const results: PreimageExtractionResult[] = []

  for (let inputIdx = 0; inputIdx < tx.vin.length; inputIdx++) {
    const input = tx.vin[inputIdx]

    // Verificar se tem witness
    if (!input.txinwitness || input.txinwitness.length < 4) continue

    // Procurar por item de 32 bytes no witness (provável preimage)
    for (let i = 0; i < input.txinwitness.length - 1; i++) {
      const witnessItem = input.txinwitness[i]
      const itemBytes = hexToUint8Array(witnessItem)

      // Preimage tem exatamente 32 bytes
      if (itemBytes.length === 32) {
        // Calcular payment hash (SHA256 do preimage)
        const paymentHash = sha256(itemBytes)

        // Verificar se é realmente um preimage válido
        // (não apenas dados aleatórios de 32 bytes)
        // Para HTLCs, o preimage é o terceiro item (índice 2)
        if (i === 2) {
          results.push({
            preimage: itemBytes,
            paymentHash,
            txid: tx.txid,
            inputIdx,
          })
        }
      }
    }
  }

  return results
}

/**
 * Procura preimage em múltiplas transações
 *
 * @param txs - Lista de transações para buscar
 * @param paymentHashes - Payment hashes que estamos procurando
 */
export function findPreimagesInTransactions(
  txs: Tx[],
  paymentHashes: Uint8Array[],
): Map<string, Uint8Array> {
  const found = new Map<string, Uint8Array>()
  const hashSet = new Set(paymentHashes.map(h => uint8ArrayToHex(h)))

  for (const tx of txs) {
    const extracted = extractPreimageFromTx(tx)

    for (const result of extracted) {
      const hashHex = uint8ArrayToHex(result.paymentHash)
      if (hashSet.has(hashHex)) {
        found.set(hashHex, result.preimage)
      }
    }
  }

  return found
}

// ==========================================
// HTLC MONITORING
// ==========================================

/**
 * Estado de um HTLC pendente para monitoramento
 */
export interface PendingHtlc {
  /** ID do HTLC no canal */
  htlcId: bigint
  /** Payment hash */
  paymentHash: Uint8Array
  /** Valor em msat */
  amountMsat: bigint
  /** CLTV expiry absoluto */
  cltvExpiry: number
  /** Direção (sent/received) */
  direction: 'sent' | 'received'
  /** Channel ID */
  channelId: string
  /** Output index no commitment atual */
  commitmentOutputIdx?: number
  /** Estado do monitoramento */
  monitorState: HtlcMonitorState
  /** Txid da HTLC TX (se publicada) */
  htlcTxid?: string
  /** Preimage (se conhecido) */
  preimage?: Uint8Array
  /** Última altura de bloco verificada */
  lastCheckedHeight: number
}

/**
 * Estados de monitoramento de HTLC
 */
export enum HtlcMonitorState {
  /** Aguardando no commitment */
  PENDING = 'pending',
  /** Commitment foi publicado on-chain */
  ONCHAIN = 'onchain',
  /** HTLC TX (success/timeout) foi publicada */
  HTLC_TX_PUBLISHED = 'htlc_tx_published',
  /** Output do HTLC foi gasto (resolvido) */
  RESOLVED = 'resolved',
  /** HTLC expirou sem resolução */
  EXPIRED = 'expired',
  /** Erro durante monitoramento */
  ERROR = 'error',
}

/**
 * Resultado do check de HTLC
 */
export interface HtlcCheckResult {
  htlc: PendingHtlc
  action: HtlcAction
  message: string
  tx?: Tx
  preimage?: Uint8Array
}

/**
 * Ações possíveis para HTLC
 */
export enum HtlcAction {
  /** Nenhuma ação necessária */
  NONE = 'none',
  /** Publicar HTLC-Success TX */
  PUBLISH_SUCCESS = 'publish_success',
  /** Publicar HTLC-Timeout TX */
  PUBLISH_TIMEOUT = 'publish_timeout',
  /** Sweep output do HTLC TX */
  SWEEP_HTLC_OUTPUT = 'sweep_htlc_output',
  /** Atualizar estado (preimage encontrado) */
  UPDATE_PREIMAGE = 'update_preimage',
  /** Marcar como expirado */
  MARK_EXPIRED = 'mark_expired',
}

/**
 * Monitor de HTLCs pendentes
 */
export class HtlcMonitor {
  private pendingHtlcs: Map<string, PendingHtlc> = new Map()
  private knownPreimages: Map<string, Uint8Array> = new Map()

  /**
   * Adiciona HTLC para monitoramento
   */
  addHtlc(htlc: PendingHtlc): void {
    const key = `${htlc.channelId}:${htlc.htlcId}`
    this.pendingHtlcs.set(key, htlc)
  }

  /**
   * Remove HTLC do monitoramento
   */
  removeHtlc(channelId: string, htlcId: bigint): void {
    const key = `${channelId}:${htlcId}`
    this.pendingHtlcs.delete(key)
  }

  /**
   * Registra preimage conhecido
   */
  registerPreimage(paymentHash: Uint8Array, preimage: Uint8Array): void {
    const hashHex = uint8ArrayToHex(paymentHash)
    this.knownPreimages.set(hashHex, preimage)

    // Atualizar HTLCs que usam este payment hash
    for (const htlc of this.pendingHtlcs.values()) {
      if (uint8ArrayToHex(htlc.paymentHash) === hashHex) {
        htlc.preimage = preimage
      }
    }
  }

  /**
   * Obtém preimage conhecido
   */
  getPreimage(paymentHash: Uint8Array): Uint8Array | undefined {
    return this.knownPreimages.get(uint8ArrayToHex(paymentHash))
  }

  /**
   * Verifica HTLCs contra estado atual da blockchain
   *
   * @param currentHeight - Altura atual do bloco
   * @param recentTxs - Transações recentes para verificar
   * @param commitmentTxs - Commitment transactions publicadas
   */
  checkHtlcs(
    currentHeight: number,
    recentTxs: Tx[],
    commitmentTxs: Map<string, Tx>,
  ): HtlcCheckResult[] {
    const results: HtlcCheckResult[] = []

    // Primeiro, extrair preimages de transações recentes
    const paymentHashes = Array.from(this.pendingHtlcs.values()).map(h => h.paymentHash)
    const foundPreimages = findPreimagesInTransactions(recentTxs, paymentHashes)

    for (const [hashHex, preimage] of foundPreimages) {
      this.knownPreimages.set(hashHex, preimage)
    }

    // Verificar cada HTLC pendente
    for (const htlc of this.pendingHtlcs.values()) {
      const result = this.checkSingleHtlc(htlc, currentHeight, recentTxs, commitmentTxs)
      if (result.action !== HtlcAction.NONE) {
        results.push(result)
      }

      // Atualizar última altura verificada
      htlc.lastCheckedHeight = currentHeight
    }

    return results
  }

  /**
   * Verifica um único HTLC
   */
  private checkSingleHtlc(
    htlc: PendingHtlc,
    currentHeight: number,
    recentTxs: Tx[],
    commitmentTxs: Map<string, Tx>,
  ): HtlcCheckResult {
    const hashHex = uint8ArrayToHex(htlc.paymentHash)

    // Verificar se preimage foi encontrado
    const preimage = this.knownPreimages.get(hashHex)
    if (preimage && !htlc.preimage) {
      htlc.preimage = preimage
      return {
        htlc,
        action: HtlcAction.UPDATE_PREIMAGE,
        message: `Preimage encontrado para HTLC ${htlc.htlcId}`,
        preimage,
      }
    }

    // Verificar se commitment foi publicado
    const commitmentTx = commitmentTxs.get(htlc.channelId)

    switch (htlc.monitorState) {
      case HtlcMonitorState.PENDING:
        // HTLC ainda no commitment, verificar se expirou
        if (currentHeight >= htlc.cltvExpiry) {
          if (htlc.direction === 'sent') {
            // Nosso HTLC oferecido expirou - podemos fazer timeout
            htlc.monitorState = HtlcMonitorState.EXPIRED
            return {
              htlc,
              action: HtlcAction.PUBLISH_TIMEOUT,
              message: `HTLC ${htlc.htlcId} expirou, publicar timeout TX`,
            }
          }
        }

        // Verificar se commitment foi publicado
        if (commitmentTx) {
          htlc.monitorState = HtlcMonitorState.ONCHAIN
          return {
            htlc,
            action: this.determineOnchainAction(htlc, currentHeight),
            message: `Commitment publicado, HTLC ${htlc.htlcId} agora on-chain`,
            tx: commitmentTx,
          }
        }
        break

      case HtlcMonitorState.ONCHAIN:
        // HTLC está on-chain, determinar ação
        return {
          htlc,
          action: this.determineOnchainAction(htlc, currentHeight),
          message: `HTLC ${htlc.htlcId} on-chain, verificando ação`,
        }

      case HtlcMonitorState.HTLC_TX_PUBLISHED:
        // HTLC TX publicada, aguardar CSV delay para sweep
        // Verificar se output foi gasto
        for (const tx of recentTxs) {
          for (const input of tx.vin) {
            if (input.txid === htlc.htlcTxid && input.vout === 0) {
              htlc.monitorState = HtlcMonitorState.RESOLVED
              return {
                htlc,
                action: HtlcAction.NONE,
                message: `HTLC ${htlc.htlcId} resolvido`,
                tx,
              }
            }
          }
        }

        // Verificar se podemos fazer sweep (CSV expirou)
        return {
          htlc,
          action: HtlcAction.SWEEP_HTLC_OUTPUT,
          message: `Verificar sweep de HTLC TX output`,
        }

      case HtlcMonitorState.RESOLVED:
      case HtlcMonitorState.EXPIRED:
      case HtlcMonitorState.ERROR:
        // Estados finais, nenhuma ação
        break
    }

    return {
      htlc,
      action: HtlcAction.NONE,
      message: 'Nenhuma ação necessária',
    }
  }

  /**
   * Determina ação para HTLC on-chain
   */
  private determineOnchainAction(htlc: PendingHtlc, currentHeight: number): HtlcAction {
    if (htlc.direction === 'received') {
      // HTLC recebido - precisamos do preimage para clamar
      if (htlc.preimage) {
        return HtlcAction.PUBLISH_SUCCESS
      }
      // Sem preimage, não podemos fazer nada
      return HtlcAction.NONE
    } else {
      // HTLC oferecido - podemos fazer timeout após expirar
      if (currentHeight >= htlc.cltvExpiry) {
        return HtlcAction.PUBLISH_TIMEOUT
      }
      return HtlcAction.NONE
    }
  }

  /**
   * Retorna todos HTLCs pendentes
   */
  getPendingHtlcs(): PendingHtlc[] {
    return Array.from(this.pendingHtlcs.values())
  }

  /**
   * Retorna HTLCs que precisam de ação urgente
   *
   * @param currentHeight - Altura atual
   * @param urgencyBlocks - Blocos antes do expiry para considerar urgente
   */
  getUrgentHtlcs(currentHeight: number, urgencyBlocks: number = 6): PendingHtlc[] {
    return Array.from(this.pendingHtlcs.values()).filter(htlc => {
      const blocksUntilExpiry = htlc.cltvExpiry - currentHeight
      return blocksUntilExpiry <= urgencyBlocks && blocksUntilExpiry > 0
    })
  }
}
