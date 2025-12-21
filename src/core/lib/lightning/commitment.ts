// BOLT #3: Commitment Transaction Builder
// Constrói commitment transactions para canais Lightning

import { sha256, ripemd160, hash160, signMessage, verifyMessage } from '../crypto/crypto'
import { uint8ArrayToHex } from '../utils/utils'
import { HTLCManager, HTLCOwner, UpdateAddHtlc } from './htlc'
import {
  RevocationStore,
  getPerCommitmentSecretFromSeed,
  secretToPoint,
  derivePubkey,
  deriveRevocationPubkey,
} from './revocation'
import { OpCode } from '@/core/models/opcodes'
import { scalarAdd } from '@/core/lib/crypto/secp256k1'

// ==========================================
// CONSTANTES BOLT #3
// ==========================================

/** Valor de output para anchor outputs (330 sats) */
export const ANCHOR_OUTPUT_VALUE = 330n

/** Dust limit mínimo para P2WPKH (546 sats) */
export const DUST_LIMIT_P2WPKH = 546n

/** Dust limit mínimo para P2WSH (330 sats) */
export const DUST_LIMIT_P2WSH = 330n

/** Tamanho estimado de um HTLC output em bytes */
export const HTLC_OUTPUT_SIZE = 172

/** Tamanho estimado de um HTLC success tx em bytes */
export const HTLC_SUCCESS_TX_SIZE = 703

/** Tamanho estimado de um HTLC timeout tx em bytes */
export const HTLC_TIMEOUT_TX_SIZE = 663

// ==========================================
// TIPOS
// ==========================================

/**
 * Configuração local do canal
 */
export interface LocalConfig {
  /** Seed para derivar per-commitment secrets */
  perCommitmentSecretSeed: Uint8Array
  /** Dust limit em satoshis */
  dustLimitSat: bigint
  /** Máximo de HTLCs aceitos */
  maxAcceptedHtlcs: number
  /** HTLC mínimo em msat */
  htlcMinimumMsat: bigint
  /** Máximo de valor em voo em msat */
  maxHtlcValueInFlightMsat: bigint
  /** Delay para to_self_delay em blocos */
  toSelfDelay: number
  /** Reserve do canal em satoshis */
  channelReserveSat: bigint
  /** Basepoints */
  fundingPubkey: Uint8Array
  fundingPrivateKey: Uint8Array
  revocationBasepoint: Uint8Array
  paymentBasepoint: Uint8Array
  delayedPaymentBasepoint: Uint8Array
  htlcBasepoint: Uint8Array
  /** Saldo inicial em msat */
  initialMsat: bigint
  /** Upfront shutdown script (opcional) */
  upfrontShutdownScript?: Uint8Array
}

/**
 * Configuração remota do canal
 */
export interface RemoteConfig {
  /** Dust limit em satoshis */
  dustLimitSat: bigint
  /** Máximo de HTLCs aceitos */
  maxAcceptedHtlcs: number
  /** HTLC mínimo em msat */
  htlcMinimumMsat: bigint
  /** Máximo de valor em voo em msat */
  maxHtlcValueInFlightMsat: bigint
  /** Delay para to_self_delay em blocos */
  toSelfDelay: number
  /** Reserve do canal em satoshis */
  channelReserveSat: bigint
  /** Basepoints */
  fundingPubkey: Uint8Array
  revocationBasepoint: Uint8Array
  paymentBasepoint: Uint8Array
  delayedPaymentBasepoint: Uint8Array
  htlcBasepoint: Uint8Array
  /** Saldo inicial em msat */
  initialMsat: bigint
  /** Per-commitment point atual */
  currentPerCommitmentPoint?: Uint8Array
  /** Próximo per-commitment point */
  nextPerCommitmentPoint?: Uint8Array
  /** Upfront shutdown script (opcional) */
  upfrontShutdownScript?: Uint8Array
}

/**
 * Output de commitment transaction
 */
export interface CommitmentOutput {
  /** Script do output */
  script: Uint8Array
  /** Valor em satoshis */
  valueSat: bigint
  /** Tipo de output */
  type:
    | 'to_local'
    | 'to_remote'
    | 'htlc_offered'
    | 'htlc_received'
    | 'anchor_local'
    | 'anchor_remote'
}

/**
 * HTLC output com informações adicionais
 */
export interface HTLCOutput extends CommitmentOutput {
  /** Informações do HTLC */
  htlc: UpdateAddHtlc
  /** Quem ofereceu o HTLC */
  htlcProposer: HTLCOwner
}

/**
 * Commitment transaction completa
 */
export interface CommitmentTx {
  /** Versão da transação */
  version: number
  /** Locktime */
  locktime: number
  /** Inputs */
  inputs: CommitmentInput[]
  /** Outputs */
  outputs: CommitmentOutput[]
  /** Número do commitment */
  ctn: number
  /** Feerate em sat/kw */
  feeratePerKw: number
  /** Quem é o dono deste commitment */
  owner: HTLCOwner
}

/**
 * Input de commitment transaction
 */
export interface CommitmentInput {
  /** TXID do funding */
  txid: Uint8Array
  /** Output index do funding */
  vout: number
  /** Sequence (para locktime encoding) */
  sequence: number
  /** Witness placeholder */
  witness?: Uint8Array[]
}

/**
 * Tipo de canal (BOLT #9 features)
 */
export enum ChannelType {
  /** Canal básico com static_remotekey */
  STATIC_REMOTEKEY = 1,
  /** Canal com anchor outputs */
  ANCHORS = 2,
  /** Canal com zero-fee anchor outputs */
  ANCHORS_ZERO_FEE_HTLC = 3,
}

// ==========================================
// SCRIPT BUILDERS
// ==========================================

/**
 * Cria script de funding output (2-of-2 multisig P2WSH)
 *
 * @param localPubkey - Chave pública local de 33 bytes
 * @param remotePubkey - Chave pública remota de 33 bytes
 * @returns Script de funding
 */
export function fundingOutputScript(localPubkey: Uint8Array, remotePubkey: Uint8Array): Uint8Array {
  // Ordenar pubkeys lexicograficamente
  const pubkeys = [localPubkey, remotePubkey].sort((a, b) => {
    for (let i = 0; i < 33; i++) {
      if (a[i] !== b[i]) return a[i] - b[i]
    }
    return 0
  })

  // OP_2 <pubkey1> <pubkey2> OP_2 OP_CHECKMULTISIG
  const script = new Uint8Array(1 + 1 + 33 + 1 + 33 + 1 + 1)
  let offset = 0
  script[offset++] = 0x52 // OP_2
  script[offset++] = 0x21 // Push 33 bytes
  script.set(pubkeys[0], offset)
  offset += 33
  script[offset++] = 0x21 // Push 33 bytes
  script.set(pubkeys[1], offset)
  offset += 33
  script[offset++] = 0x52 // OP_2
  script[offset++] = 0xae // OP_CHECKMULTISIG

  return script
}

/**
 * Cria script to_local (output para quem fez o commitment)
 *
 * Script permite:
 * - Gastar imediatamente com revocation_pubkey (se revogado)
 * - Gastar após delay com local_delayedpubkey
 *
 * @param revocationPubkey - Chave de revogação de 33 bytes
 * @param localDelayedPubkey - Chave delayed local de 33 bytes
 * @param toSelfDelay - Delay em blocos
 * @returns Script to_local
 */
export function toLocalScript(
  revocationPubkey: Uint8Array,
  localDelayedPubkey: Uint8Array,
  toSelfDelay: number,
): Uint8Array {
  // OP_IF
  //     <revocationpubkey>
  // OP_ELSE
  //     <to_self_delay>
  //     OP_CHECKSEQUENCEVERIFY
  //     OP_DROP
  //     <local_delayedpubkey>
  // OP_ENDIF
  // OP_CHECKSIG

  const delayBytes = encodeCSVDelay(toSelfDelay)

  const script = new Uint8Array(
    1 + // OP_IF
      1 +
      33 + // push revocation
      1 + // OP_ELSE
      delayBytes.length +
      1 + // push delay
      1 + // OP_CSV
      1 + // OP_DROP
      1 +
      33 + // push delayed
      1 + // OP_ENDIF
      1, // OP_CHECKSIG
  )

  let offset = 0
  script[offset++] = 0x63 // OP_IF
  script[offset++] = 0x21 // Push 33 bytes
  script.set(revocationPubkey, offset)
  offset += 33
  script[offset++] = 0x67 // OP_ELSE
  script.set(delayBytes, offset)
  offset += delayBytes.length
  script[offset++] = 0xb2 // OP_CHECKSEQUENCEVERIFY
  script[offset++] = 0x75 // OP_DROP
  script[offset++] = 0x21 // Push 33 bytes
  script.set(localDelayedPubkey, offset)
  offset += 33
  script[offset++] = 0x68 // OP_ENDIF
  script[offset++] = 0xac // OP_CHECKSIG

  return script.subarray(0, offset)
}

/**
 * Cria script to_remote (output para o peer)
 *
 * Para canais com static_remotekey, é apenas P2WPKH
 * Para canais com anchors, é P2WSH com delay
 *
 * @param remotePubkey - Chave pública remota de 33 bytes
 * @param channelType - Tipo de canal
 * @returns Script to_remote
 */
export function toRemoteScript(remotePubkey: Uint8Array, channelType: ChannelType): Uint8Array {
  if (channelType === ChannelType.STATIC_REMOTEKEY) {
    // P2WPKH: OP_0 <hash160(pubkey)>
    // Nota: Na prática, retornamos apenas a pubkey e deixamos
    // a criação do P2WPKH para a serialização da transação
    return remotePubkey
  }

  // Canais com anchors usam P2WSH com 1-block delay
  // <remote_pubkey> OP_CHECKSIGVERIFY 1 OP_CHECKSEQUENCEVERIFY
  const script = new Uint8Array(1 + 33 + 1 + 1 + 1)
  let offset = 0
  script[offset++] = 0x21 // Push 33 bytes
  script.set(remotePubkey, offset)
  offset += 33
  script[offset++] = 0xad // OP_CHECKSIGVERIFY
  script[offset++] = 0x51 // OP_1
  script[offset++] = 0xb2 // OP_CHECKSEQUENCEVERIFY

  return script.subarray(0, offset)
}

/**
 * Cria script de HTLC oferecido (offered HTLC) - BOLT #3 compliant
 *
 * Script (sem anchors):
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
 * OP_ENDIF
 *
 * Com anchors, adiciona: OP_1 OP_CHECKSEQUENCEVERIFY OP_DROP antes do último OP_ENDIF
 *
 * @param revocationPubkey - Chave de revogação (33 bytes)
 * @param localHtlcPubkey - Chave HTLC local (33 bytes)
 * @param remoteHtlcPubkey - Chave HTLC remota (33 bytes)
 * @param paymentHash - Hash do pagamento (32 bytes)
 * @param hasAnchors - Se true, adiciona CSV delay para anchors
 * @returns Script do HTLC oferecido
 */
export function offeredHtlcScript(
  revocationPubkey: Uint8Array,
  localHtlcPubkey: Uint8Array,
  remoteHtlcPubkey: Uint8Array,
  paymentHash: Uint8Array,
  hasAnchors: boolean = false,
): Uint8Array {
  // Calcular hashes necessários
  const revocationPubkeyHash = hash160(revocationPubkey) // RIPEMD160(SHA256(revocationpubkey))
  const paymentHashRipemd = ripemd160(paymentHash) // RIPEMD160(payment_hash) - payment_hash já é SHA256

  // Tamanho máximo do script
  const script = new Uint8Array(200)
  let offset = 0

  // OP_DUP OP_HASH160 <20 bytes revocationPubkeyHash> OP_EQUAL
  script[offset++] = OpCode.OP_DUP
  script[offset++] = OpCode.OP_HASH160
  script[offset++] = 0x14 // Push 20 bytes
  script.set(revocationPubkeyHash, offset)
  offset += 20
  script[offset++] = OpCode.OP_EQUAL

  // OP_IF
  script[offset++] = OpCode.OP_IF

  // OP_CHECKSIG
  script[offset++] = OpCode.OP_CHECKSIG

  // OP_ELSE
  script[offset++] = OpCode.OP_ELSE

  // <remote_htlcpubkey>
  script[offset++] = 0x21 // Push 33 bytes
  script.set(remoteHtlcPubkey, offset)
  offset += 33

  // OP_SWAP OP_SIZE
  script[offset++] = OpCode.OP_SWAP
  script[offset++] = OpCode.OP_SIZE

  // <32> (usando push de 1 byte para o valor 32)
  script[offset++] = 0x01 // Push 1 byte
  script[offset++] = 0x20 // 32

  // OP_EQUAL
  script[offset++] = OpCode.OP_EQUAL

  // OP_NOTIF
  script[offset++] = OpCode.OP_NOTIF

  // OP_DROP OP_2 OP_SWAP
  script[offset++] = OpCode.OP_DROP
  script[offset++] = OpCode.OP_2
  script[offset++] = OpCode.OP_SWAP

  // <local_htlcpubkey>
  script[offset++] = 0x21 // Push 33 bytes
  script.set(localHtlcPubkey, offset)
  offset += 33

  // OP_2 OP_CHECKMULTISIG
  script[offset++] = OpCode.OP_2
  script[offset++] = OpCode.OP_CHECKMULTISIG

  // OP_ELSE
  script[offset++] = OpCode.OP_ELSE

  // OP_HASH160 <20 bytes paymentHashRipemd> OP_EQUALVERIFY
  script[offset++] = OpCode.OP_HASH160
  script[offset++] = 0x14 // Push 20 bytes
  script.set(paymentHashRipemd, offset)
  offset += 20
  script[offset++] = OpCode.OP_EQUALVERIFY

  // OP_CHECKSIG
  script[offset++] = OpCode.OP_CHECKSIG

  // OP_ENDIF
  script[offset++] = OpCode.OP_ENDIF

  // Para canais com anchors, adicionar CSV delay
  if (hasAnchors) {
    script[offset++] = OpCode.OP_1
    script[offset++] = OpCode.OP_CHECKSEQUENCEVERIFY
    script[offset++] = OpCode.OP_DROP
  }

  // OP_ENDIF final
  script[offset++] = OpCode.OP_ENDIF

  return script.subarray(0, offset)
}

/**
 * Cria script de HTLC recebido (received HTLC) - BOLT #3 compliant
 *
 * Script (sem anchors):
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
 * OP_ENDIF
 *
 * Com anchors, adiciona: OP_1 OP_CHECKSEQUENCEVERIFY OP_DROP antes do último OP_ENDIF
 *
 * @param revocationPubkey - Chave de revogação (33 bytes)
 * @param localHtlcPubkey - Chave HTLC local (33 bytes)
 * @param remoteHtlcPubkey - Chave HTLC remota (33 bytes)
 * @param paymentHash - Hash do pagamento (32 bytes)
 * @param cltvExpiry - Altura do bloco de expiração (CLTV absolute)
 * @param hasAnchors - Se true, adiciona CSV delay para anchors
 * @returns Script do HTLC recebido
 */
export function receivedHtlcScript(
  revocationPubkey: Uint8Array,
  localHtlcPubkey: Uint8Array,
  remoteHtlcPubkey: Uint8Array,
  paymentHash: Uint8Array,
  cltvExpiry: number,
  hasAnchors: boolean = false,
): Uint8Array {
  // Calcular hashes necessários
  const revocationPubkeyHash = hash160(revocationPubkey) // RIPEMD160(SHA256(revocationpubkey))
  const paymentHashRipemd = ripemd160(paymentHash) // RIPEMD160(payment_hash)

  // Tamanho máximo do script
  const script = new Uint8Array(220)
  let offset = 0

  // OP_DUP OP_HASH160 <20 bytes revocationPubkeyHash> OP_EQUAL
  script[offset++] = OpCode.OP_DUP
  script[offset++] = OpCode.OP_HASH160
  script[offset++] = 0x14 // Push 20 bytes
  script.set(revocationPubkeyHash, offset)
  offset += 20
  script[offset++] = OpCode.OP_EQUAL

  // OP_IF
  script[offset++] = OpCode.OP_IF

  // OP_CHECKSIG
  script[offset++] = OpCode.OP_CHECKSIG

  // OP_ELSE
  script[offset++] = OpCode.OP_ELSE

  // <remote_htlcpubkey>
  script[offset++] = 0x21 // Push 33 bytes
  script.set(remoteHtlcPubkey, offset)
  offset += 33

  // OP_SWAP OP_SIZE
  script[offset++] = OpCode.OP_SWAP
  script[offset++] = OpCode.OP_SIZE

  // <32> (usando push de 1 byte para o valor 32)
  script[offset++] = 0x01 // Push 1 byte
  script[offset++] = 0x20 // 32

  // OP_EQUAL
  script[offset++] = OpCode.OP_EQUAL

  // OP_IF
  script[offset++] = OpCode.OP_IF

  // OP_HASH160 <20 bytes paymentHashRipemd> OP_EQUALVERIFY
  script[offset++] = OpCode.OP_HASH160
  script[offset++] = 0x14 // Push 20 bytes
  script.set(paymentHashRipemd, offset)
  offset += 20
  script[offset++] = OpCode.OP_EQUALVERIFY

  // OP_2 OP_SWAP
  script[offset++] = OpCode.OP_2
  script[offset++] = OpCode.OP_SWAP

  // <local_htlcpubkey>
  script[offset++] = 0x21 // Push 33 bytes
  script.set(localHtlcPubkey, offset)
  offset += 33

  // OP_2 OP_CHECKMULTISIG
  script[offset++] = OpCode.OP_2
  script[offset++] = OpCode.OP_CHECKMULTISIG

  // OP_ELSE
  script[offset++] = OpCode.OP_ELSE

  // OP_DROP
  script[offset++] = OpCode.OP_DROP

  // <cltv_expiry> - encoded properly
  const cltvBytes = encodeCltvExpiry(cltvExpiry)
  script.set(cltvBytes, offset)
  offset += cltvBytes.length

  // OP_CHECKLOCKTIMEVERIFY OP_DROP OP_CHECKSIG
  script[offset++] = OpCode.OP_CHECKLOCKTIMEVERIFY
  script[offset++] = OpCode.OP_DROP
  script[offset++] = OpCode.OP_CHECKSIG

  // OP_ENDIF
  script[offset++] = OpCode.OP_ENDIF

  // Para canais com anchors, adicionar CSV delay
  if (hasAnchors) {
    script[offset++] = OpCode.OP_1
    script[offset++] = OpCode.OP_CHECKSEQUENCEVERIFY
    script[offset++] = OpCode.OP_DROP
  }

  // OP_ENDIF final
  script[offset++] = OpCode.OP_ENDIF

  return script.subarray(0, offset)
}

/**
 * Codifica CLTV expiry para uso em script
 * Valores até 16 usam OP_1-OP_16, valores maiores usam push de bytes
 */
function encodeCltvExpiry(cltv: number): Uint8Array {
  if (cltv <= 0) {
    return new Uint8Array([OpCode.OP_0])
  }
  if (cltv <= 16) {
    // Use OP_1 through OP_16 (0x51 - 0x60)
    return new Uint8Array([0x50 + cltv])
  }

  // Encode como minimal push conforme BIP 62
  // Precisamos encontrar o menor encoding possível
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

  const result = new Uint8Array(1 + bytes.length)
  result[0] = bytes.length // Push N bytes
  for (let i = 0; i < bytes.length; i++) {
    result[i + 1] = bytes[i]
  }

  return result
}

/**
 * Codifica delay para OP_CHECKSEQUENCEVERIFY
 */
function encodeCSVDelay(delay: number): Uint8Array {
  if (delay <= 0) {
    throw new Error('Delay must be positive')
  }
  if (delay <= 16) {
    // Use OP_1 through OP_16
    return new Uint8Array([0x50 + delay])
  }
  if (delay <= 0x7f) {
    return new Uint8Array([0x01, delay])
  }
  if (delay <= 0x7fff) {
    return new Uint8Array([0x02, delay & 0xff, (delay >> 8) & 0xff])
  }
  // Delay maior (até 3 bytes)
  return new Uint8Array([0x03, delay & 0xff, (delay >> 8) & 0xff, (delay >> 16) & 0xff])
}

// ==========================================
// COMMITMENT TRANSACTION BUILDER
// ==========================================

/**
 * CommitmentBuilder - Constrói commitment transactions
 *
 * Esta classe é responsável por:
 * - Criar outputs to_local e to_remote
 * - Criar outputs HTLC
 * - Calcular fees
 * - Ordenar outputs (BIP 69)
 */
export class CommitmentBuilder {
  private localConfig: LocalConfig
  private remoteConfig: RemoteConfig
  private htlcManager: HTLCManager
  private fundingTxid: Uint8Array
  private fundingOutputIndex: number
  private fundingSatoshis: bigint
  private channelType: ChannelType
  private revocationStore: RevocationStore

  constructor(params: {
    localConfig: LocalConfig
    remoteConfig: RemoteConfig
    htlcManager: HTLCManager
    fundingTxid: Uint8Array
    fundingOutputIndex: number
    fundingSatoshis: bigint
    channelType?: ChannelType
  }) {
    this.localConfig = params.localConfig
    this.remoteConfig = params.remoteConfig
    this.htlcManager = params.htlcManager
    this.fundingTxid = params.fundingTxid
    this.fundingOutputIndex = params.fundingOutputIndex
    this.fundingSatoshis = params.fundingSatoshis
    this.channelType = params.channelType || ChannelType.STATIC_REMOTEKEY
    this.revocationStore = new RevocationStore()
  }

  /**
   * Constrói commitment transaction para um lado específico
   *
   * @param owner - Quem é o dono deste commitment (LOCAL ou REMOTE)
   * @param ctn - Número do commitment (opcional, usa o mais recente)
   * @returns Commitment transaction
   */
  buildCommitmentTx(owner: HTLCOwner, ctn?: number): CommitmentTx {
    const targetCtn = ctn ?? this.htlcManager.ctnLatest(owner)
    const feerate = this.htlcManager.getCurrentFeerate(owner, targetCtn)

    // Obter per-commitment point
    const perCommitmentPoint = this.getPerCommitmentPoint(owner, targetCtn)

    // Derivar chaves para este commitment
    const keys = this.deriveKeys(owner, perCommitmentPoint)

    // Calcular saldos base
    let localBalanceMsat = this.localConfig.initialMsat
    let remoteBalanceMsat = this.remoteConfig.initialMsat

    // Obter HTLCs ativos com seus proposers
    const activeHtlcsWithProposer = this.htlcManager.getHtlcsActiveAtCtnWithProposer(
      owner,
      targetCtn,
    )

    // Criar outputs
    const outputs: CommitmentOutput[] = []

    // Output to_local
    const toLocalSat = localBalanceMsat / 1000n
    if (toLocalSat > this.localConfig.dustLimitSat) {
      outputs.push({
        script: toLocalScript(
          keys.revocationPubkey,
          keys.localDelayedPubkey,
          this.remoteConfig.toSelfDelay,
        ),
        valueSat: toLocalSat,
        type: 'to_local',
      })
    }

    // Output to_remote
    const toRemoteSat = remoteBalanceMsat / 1000n
    if (toRemoteSat > this.remoteConfig.dustLimitSat) {
      outputs.push({
        script: toRemoteScript(keys.remotePaymentPubkey, this.channelType),
        valueSat: toRemoteSat,
        type: 'to_remote',
      })
    }

    // Outputs HTLC
    for (const { htlc, proposer } of activeHtlcsWithProposer) {
      const htlcOutput = this.createHtlcOutput(htlc, owner, keys, proposer)
      if (htlcOutput) {
        outputs.push(htlcOutput)
      }
    }

    // Anchor outputs (se aplicável)
    if (this.channelType >= ChannelType.ANCHORS) {
      outputs.push({
        script: this.anchorScript(this.localConfig.fundingPubkey),
        valueSat: ANCHOR_OUTPUT_VALUE,
        type: 'anchor_local',
      })
      outputs.push({
        script: this.anchorScript(this.remoteConfig.fundingPubkey),
        valueSat: ANCHOR_OUTPUT_VALUE,
        type: 'anchor_remote',
      })
    }

    // Ordenar outputs (BIP 69)
    outputs.sort((a, b) => {
      if (a.valueSat !== b.valueSat) {
        return Number(a.valueSat - b.valueSat)
      }
      // Ordenar por script se valores iguais
      const aHex = uint8ArrayToHex(a.script)
      const bHex = uint8ArrayToHex(b.script)
      return aHex.localeCompare(bHex)
    })

    // Criar input
    const input: CommitmentInput = {
      txid: this.fundingTxid,
      vout: this.fundingOutputIndex,
      sequence: this.encodeLocktime(owner, targetCtn),
    }

    return {
      version: 2,
      locktime: this.encodeLocktime(owner, targetCtn),
      inputs: [input],
      outputs,
      ctn: targetCtn,
      feeratePerKw: feerate,
      owner,
    }
  }

  /**
   * Obtém per-commitment point para um ctn específico
   */
  private getPerCommitmentPoint(owner: HTLCOwner, ctn: number): Uint8Array {
    if (owner === HTLCOwner.LOCAL) {
      // Derivar do nosso seed
      const secret = getPerCommitmentSecretFromSeed(this.localConfig.perCommitmentSecretSeed, ctn)
      return secretToPoint(secret)
    } else {
      // Usar o point que o peer enviou
      // Para o commitment mais recente, usar nextPerCommitmentPoint
      // Para anteriores, usar o point que foi revelado
      if (this.remoteConfig.nextPerCommitmentPoint) {
        return this.remoteConfig.nextPerCommitmentPoint
      }
      throw new Error('Remote per-commitment point not available')
    }
  }

  /**
   * Deriva todas as chaves necessárias para um commitment
   */
  private deriveKeys(
    owner: HTLCOwner,
    perCommitmentPoint: Uint8Array,
  ): {
    revocationPubkey: Uint8Array
    localDelayedPubkey: Uint8Array
    remotePaymentPubkey: Uint8Array
    localHtlcPubkey: Uint8Array
    remoteHtlcPubkey: Uint8Array
  } {
    const isLocal = owner === HTLCOwner.LOCAL

    // Para commitment LOCAL:
    // - to_local usa local_delayedpubkey e remote's revocation
    // - to_remote usa remote's payment
    // Para commitment REMOTE:
    // - to_local usa remote's delayed e local's revocation
    // - to_remote usa local's payment

    const revocationBasepoint = isLocal
      ? this.remoteConfig.revocationBasepoint
      : this.localConfig.revocationBasepoint

    const delayedPaymentBasepoint = isLocal
      ? this.localConfig.delayedPaymentBasepoint
      : this.remoteConfig.delayedPaymentBasepoint

    const paymentBasepoint = isLocal
      ? this.remoteConfig.paymentBasepoint
      : this.localConfig.paymentBasepoint

    const localHtlcBasepoint = isLocal
      ? this.localConfig.htlcBasepoint
      : this.remoteConfig.htlcBasepoint

    const remoteHtlcBasepoint = isLocal
      ? this.remoteConfig.htlcBasepoint
      : this.localConfig.htlcBasepoint

    return {
      revocationPubkey: deriveRevocationPubkey(revocationBasepoint, perCommitmentPoint),
      localDelayedPubkey: derivePubkey(delayedPaymentBasepoint, perCommitmentPoint),
      remotePaymentPubkey: derivePubkey(paymentBasepoint, perCommitmentPoint),
      localHtlcPubkey: derivePubkey(localHtlcBasepoint, perCommitmentPoint),
      remoteHtlcPubkey: derivePubkey(remoteHtlcBasepoint, perCommitmentPoint),
    }
  }

  /**
   * Cria output HTLC
   */
  private createHtlcOutput(
    htlc: UpdateAddHtlc,
    owner: HTLCOwner,
    htlcProposer: HTLCOwner,
    keys: ReturnType<typeof this.deriveKeys>,
  ): HTLCOutput | null {
    // Verificar dust limit
    const valueSat = htlc.amountMsat / 1000n
    const dustLimit =
      owner === HTLCOwner.LOCAL ? this.localConfig.dustLimitSat : this.remoteConfig.dustLimitSat

    if (valueSat <= dustLimit) {
      return null // HTLC é dust, não incluir
    }

    // Determinar se é offered ou received do ponto de vista do dono do commitment
    // Um HTLC é "offered" quando o dono do commitment é o mesmo que o proposer do HTLC
    const isOffered = owner === htlcProposer

    // Verificar se canal usa anchors
    const hasAnchors = this.channelType >= ChannelType.ANCHORS

    const script = isOffered
      ? offeredHtlcScript(
          keys.revocationPubkey,
          keys.localHtlcPubkey,
          keys.remoteHtlcPubkey,
          htlc.paymentHash,
          hasAnchors,
        )
      : receivedHtlcScript(
          keys.revocationPubkey,
          keys.localHtlcPubkey,
          keys.remoteHtlcPubkey,
          htlc.paymentHash,
          htlc.cltvExpiry,
          hasAnchors,
        )

    return {
      script,
      valueSat,
      type: isOffered ? 'htlc_offered' : 'htlc_received',
      htlc,
      htlcProposer: HTLCOwner.LOCAL, // Simplificado
    }
  }

  /**
   * Cria script de anchor output
   */
  private anchorScript(fundingPubkey: Uint8Array): Uint8Array {
    // <funding_pubkey> OP_CHECKSIG OP_IFDUP OP_NOTIF OP_16 OP_CHECKSEQUENCEVERIFY OP_ENDIF
    const script = new Uint8Array(1 + 33 + 5)
    let offset = 0
    script[offset++] = 0x21 // Push 33 bytes
    script.set(fundingPubkey, offset)
    offset += 33
    script[offset++] = 0xac // OP_CHECKSIG
    script[offset++] = 0x73 // OP_IFDUP
    script[offset++] = 0x64 // OP_NOTIF
    script[offset++] = 0x60 // OP_16
    script[offset++] = 0xb2 // OP_CHECKSEQUENCEVERIFY
    script[offset++] = 0x68 // OP_ENDIF

    return script.subarray(0, offset)
  }

  /**
   * Codifica locktime/sequence com commitment number
   * Bits superiores contêm obscured commitment number
   */
  private encodeLocktime(owner: HTLCOwner, ctn: number): number {
    // obscured commitment number = commitment number XOR (SHA256(payment_basepoint1 || payment_basepoint2) & 0xFFFFFFFFFFFF)
    const combined = new Uint8Array(66)
    combined.set(this.localConfig.paymentBasepoint, 0)
    combined.set(this.remoteConfig.paymentBasepoint, 33)
    const hash = sha256(combined)

    // Usar últimos 6 bytes do hash
    const obscuringFactor =
      (hash[26] << 40) |
      (hash[27] << 32) |
      (hash[28] << 24) |
      (hash[29] << 16) |
      (hash[30] << 8) |
      hash[31]

    const obscuredCtn = ctn ^ obscuringFactor

    // Locktime: upper 8 bits = 0x20, lower 24 bits = lower 24 bits of obscured ctn
    return 0x20000000 | (obscuredCtn & 0xffffff)
  }

  /**
   * Calcula fee base para um commitment
   */
  calculateBaseFee(numHtlcs: number, feeratePerKw: number): bigint {
    // Base tx weight sem HTLCs: ~724 weight units
    const baseWeight = 724
    const htlcWeight = numHtlcs * HTLC_OUTPUT_SIZE

    // Anchors adicionam peso
    const anchorWeight = this.channelType >= ChannelType.ANCHORS ? 330 * 2 : 0

    const totalWeight = baseWeight + htlcWeight + anchorWeight
    const feeSat = BigInt(Math.ceil((totalWeight * feeratePerKw) / 1000))

    return feeSat
  }

  /**
   * Assina uma commitment transaction
   * @param commitmentTx - Commitment transaction a ser assinada
   * @returns Assinatura de 64 bytes (r + s)
   */
  signCommitmentTx(commitmentTx: CommitmentTx): Uint8Array {
    // Calcular sighash da transação
    const sighash = this.calculateCommitmentSighash(commitmentTx)

    // Assinar usando a chave privada de funding
    return signMessage(sighash, this.localConfig.fundingPrivateKey)
  }

  /**
   * Calcula o sighash para uma commitment transaction
   * Baseado em BIP 143 (SegWit v0)
   */
  private calculateCommitmentSighash(commitmentTx: CommitmentTx): Uint8Array {
    // Para simplificar, vamos usar uma versão básica do sighash
    // Na prática, seria necessário serializar a transação completa
    // seguindo as regras do BIP 143

    // Por enquanto, usar um hash simples dos dados principais
    const data = new Uint8Array(32 + 4 + 4 + 32 + 4) // txid + vout + sequence + script + amount
    let offset = 0

    // TXID do funding (reverso)
    const txidReversed = new Uint8Array(this.fundingTxid).reverse()
    data.set(txidReversed, offset)
    offset += 32

    // VOUT
    new DataView(data.buffer).setUint32(offset, this.fundingOutputIndex, true)
    offset += 4

    // Sequence
    new DataView(data.buffer).setUint32(offset, commitmentTx.inputs[0].sequence, true)
    offset += 4

    // Script do funding output (2-of-2 multisig)
    const fundingScript = fundingOutputScript(
      this.localConfig.fundingPubkey,
      this.remoteConfig.fundingPubkey,
    )
    // Para sighash, usamos o scriptPubKey do output sendo gasto
    const scriptHash = sha256(fundingScript)
    data.set(scriptHash.slice(0, 32), offset)
    offset += 32

    // Amount (funding satoshis)
    new DataView(data.buffer).setBigUint64(offset, this.fundingSatoshis, true)

    // Hash duplo SHA256
    return sha256(sha256(data))
  }

  /**
   * Verifica uma assinatura de commitment transaction
   * @param commitmentTx - Commitment transaction
   * @param signature - Assinatura a verificar (64 bytes)
   * @returns true se a assinatura for válida
   */
  verifyCommitmentSignature(commitmentTx: CommitmentTx, signature: Uint8Array): boolean {
    // Calcular sighash da transação
    const sighash = this.calculateCommitmentSighash(commitmentTx)

    // Verificar assinatura usando a chave pública de funding do peer
    return verifyMessage(sighash, signature, this.remoteConfig.fundingPubkey)
  }

  /**
   * Calcula o sighash para uma HTLC transaction
   * Baseado em BIP 143 para HTLC success/timeout transactions
   *
   * @param commitmentTx - Commitment transaction que contém o HTLC
   * @param htlcOutput - Output HTLC do commitment
   * @param outputIndex - Índice do output HTLC no commitment
   * @returns Hash para assinar
   */
  private calculateHtlcSighash(
    commitmentTx: CommitmentTx,
    htlcOutput: CommitmentOutput,
    outputIndex: number,
  ): Uint8Array {
    // HTLC transaction gasta o output do commitment
    // Construir dados para BIP143 sighash
    const data = new Uint8Array(32 + 4 + 4 + 32 + 8)
    let offset = 0

    // Commitment TXID
    const commitmentTxid = this.computeCommitmentTxid(commitmentTx)
    data.set(commitmentTxid, offset)
    offset += 32

    // Output index
    new DataView(data.buffer).setUint32(offset, outputIndex, true)
    offset += 4

    // Sequence (0 para HTLC transactions)
    new DataView(data.buffer).setUint32(offset, 0, true)
    offset += 4

    // Script hash do witness script do HTLC
    const scriptHash = sha256(htlcOutput.witnessScript || new Uint8Array(0))
    data.set(scriptHash.slice(0, 32), offset)
    offset += 32

    // Amount
    new DataView(data.buffer).setBigUint64(offset, htlcOutput.amountSat, true)

    return sha256(sha256(data))
  }

  /**
   * Computa o TXID de uma commitment transaction
   */
  private computeCommitmentTxid(commitmentTx: CommitmentTx): Uint8Array {
    // Hash simples dos dados da transação
    // Na prática seria a serialização completa
    const data = new Uint8Array(8)
    new DataView(data.buffer).setBigUint64(0, commitmentTx.obscuredCommitmentNumber, true)
    return sha256(sha256(data))
  }

  /**
   * Assina uma HTLC transaction (success ou timeout)
   *
   * Usada quando enviamos commitment_signed para incluir assinaturas
   * de todas as HTLC transactions do peer.
   *
   * @param commitmentTx - Commitment transaction que contém o HTLC
   * @param htlcOutput - Output HTLC a assinar
   * @param owner - Dono do commitment (LOCAL ou REMOTE)
   * @returns Assinatura de 64 bytes
   */
  signHtlcTransaction(
    commitmentTx: CommitmentTx,
    htlcOutput: CommitmentOutput,
    owner: HTLCOwner,
  ): Uint8Array {
    // Encontrar o índice do output HTLC
    const outputIndex = commitmentTx.outputs.findIndex(
      o =>
        o.type === htlcOutput.type &&
        o.amountSat === htlcOutput.amountSat &&
        this.arraysEqual(o.scriptPubKey, htlcOutput.scriptPubKey),
    )

    if (outputIndex === -1) {
      throw new Error('HTLC output not found in commitment transaction')
    }

    // Calcular sighash
    const sighash = this.calculateHtlcSighash(commitmentTx, htlcOutput, outputIndex)

    // Assinar usando a chave HTLC derivada
    // Para o commitment do peer (REMOTE), usamos nossa chave HTLC
    // A chave derivada é baseada no per-commitment point do dono
    const perCommitmentPoint =
      owner === HTLCOwner.REMOTE
        ? this.remoteConfig.currentPerCommitmentPoint || this.remoteConfig.fundingPubkey
        : secretToPoint(
            getPerCommitmentSecretFromSeed(
              this.localConfig.perCommitmentSecretSeed,
              this.localCommitmentNumber,
            ),
          )

    const htlcPrivkey = this.deriveHtlcPrivkey(perCommitmentPoint)

    return signMessage(sighash, htlcPrivkey)
  }

  /**
   * Deriva a chave privada HTLC
   * htlc_privkey = htlc_basepoint_secret + SHA256(per_commitment_point || htlc_basepoint)
   */
  private deriveHtlcPrivkey(perCommitmentPoint: Uint8Array): Uint8Array {
    // Precisamos da chave privada do htlc_basepoint
    // Por enquanto, usamos a funding private key como aproximação
    // TODO: Armazenar htlc_basepoint_secret separadamente
    const combined = new Uint8Array(33 + 33)
    combined.set(perCommitmentPoint, 0)
    combined.set(this.localConfig.htlcBasepoint, 33)
    const tweak = sha256(combined)

    // Adicionar tweak à chave privada base (mod n)
    return scalarAdd(this.localConfig.fundingPrivateKey, tweak) as Uint8Array
  }

  /**
   * Verifica uma assinatura de HTLC transaction
   *
   * @param commitmentTx - Commitment transaction
   * @param htlcOutput - Output HTLC
   * @param signature - Assinatura a verificar
   * @returns true se válida
   */
  verifyHtlcSignature(
    commitmentTx: CommitmentTx,
    htlcOutput: CommitmentOutput,
    signature: Uint8Array,
  ): boolean {
    // Encontrar o índice do output HTLC
    const outputIndex = commitmentTx.outputs.findIndex(
      o =>
        o.type === htlcOutput.type &&
        o.amountSat === htlcOutput.amountSat &&
        this.arraysEqual(o.scriptPubKey, htlcOutput.scriptPubKey),
    )

    if (outputIndex === -1) {
      return false
    }

    // Calcular sighash
    const sighash = this.calculateHtlcSighash(commitmentTx, htlcOutput, outputIndex)

    // Derivar a chave pública HTLC do peer
    // Usamos nosso per-commitment point para derivar a chave do peer
    const perCommitmentPoint = secretToPoint(
      getPerCommitmentSecretFromSeed(
        this.localConfig.perCommitmentSecretSeed,
        this.localCommitmentNumber,
      ),
    )

    const remoteHtlcPubkey = derivePubkey(this.remoteConfig.htlcBasepoint, perCommitmentPoint)

    return verifyMessage(sighash, signature, remoteHtlcPubkey)
  }

  /**
   * Helper para comparar arrays
   */
  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  /**
   * Atualiza RevocationStore com um secret recebido
   */
  addRevocationSecret(secret: Uint8Array, index: number): void {
    this.revocationStore.addSecret(secret, index)
  }

  /**
   * Obtém RevocationStore
   */
  getRevocationStore(): RevocationStore {
    return this.revocationStore
  }
}

export default CommitmentBuilder
