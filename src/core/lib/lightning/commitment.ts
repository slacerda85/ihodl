// BOLT #3: Commitment Transaction Builder
// Constrói commitment transactions para canais Lightning

import { sha256 } from '../crypto/crypto'
import { uint8ArrayToHex } from '../utils'
import { HTLCManager, HTLCOwner, UpdateAddHtlc } from './htlc'
import {
  RevocationStore,
  getPerCommitmentSecretFromSeed,
  secretToPoint,
  derivePubkey,
  deriveRevocationPubkey,
} from './revocation'

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
 * Cria script de HTLC oferecido (offered HTLC)
 *
 * @param revocationPubkey - Chave de revogação
 * @param localHtlcPubkey - Chave HTLC local
 * @param remoteHtlcPubkey - Chave HTLC remota
 * @param paymentHash - Hash do pagamento (32 bytes)
 * @returns Script do HTLC oferecido
 */
export function offeredHtlcScript(
  revocationPubkey: Uint8Array,
  localHtlcPubkey: Uint8Array,
  remoteHtlcPubkey: Uint8Array,
  paymentHash: Uint8Array,
): Uint8Array {
  // Nota: Este é um script simplificado. O script completo BOLT #3 é mais complexo
  // OP_DUP OP_HASH160 <RIPEMD160(SHA256(revocationpubkey))> OP_EQUAL
  // OP_IF
  //     OP_CHECKSIG
  // OP_ELSE
  //     <remote_htlcpubkey> OP_SWAP OP_SIZE 32 OP_EQUAL
  //     OP_IF
  //         OP_HASH160 <RIPEMD160(payment_hash)> OP_EQUALVERIFY
  //         2 OP_SWAP <local_htlcpubkey> 2 OP_CHECKMULTISIG
  //     OP_ELSE
  //         OP_DROP <cltv_expiry> OP_CHECKLOCKTIMEVERIFY OP_DROP
  //         OP_CHECKSIG
  //     OP_ENDIF
  // OP_ENDIF

  // Versão simplificada para início
  const script = new Uint8Array(200)
  let offset = 0

  // Por simplicidade, usar apenas o payment hash por enquanto
  script[offset++] = 0xa8 // OP_SHA256
  script[offset++] = 0x20 // Push 32 bytes
  script.set(paymentHash, offset)
  offset += 32
  script[offset++] = 0x87 // OP_EQUAL

  return script.subarray(0, offset)
}

/**
 * Cria script de HTLC recebido (received HTLC)
 *
 * @param revocationPubkey - Chave de revogação
 * @param localHtlcPubkey - Chave HTLC local
 * @param remoteHtlcPubkey - Chave HTLC remota
 * @param paymentHash - Hash do pagamento (32 bytes)
 * @param cltvExpiry - Altura do bloco de expiração
 * @returns Script do HTLC recebido
 */
export function receivedHtlcScript(
  revocationPubkey: Uint8Array,
  localHtlcPubkey: Uint8Array,
  remoteHtlcPubkey: Uint8Array,
  paymentHash: Uint8Array,
  cltvExpiry: number,
): Uint8Array {
  // Versão simplificada
  const script = new Uint8Array(200)
  let offset = 0

  // Por simplicidade, usar apenas o payment hash por enquanto
  script[offset++] = 0xa8 // OP_SHA256
  script[offset++] = 0x20 // Push 32 bytes
  script.set(paymentHash, offset)
  offset += 32
  script[offset++] = 0x87 // OP_EQUAL

  return script.subarray(0, offset)
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

    // Obter HTLCs ativos
    const activeHtlcs = this.htlcManager.getHtlcsActiveAtCtn(owner, targetCtn)

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
    for (const htlc of activeHtlcs) {
      const htlcOutput = this.createHtlcOutput(htlc, owner, keys)
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
    // TODO: Implementar lógica completa
    const isOffered = true // Simplificado

    const script = isOffered
      ? offeredHtlcScript(
          keys.revocationPubkey,
          keys.localHtlcPubkey,
          keys.remoteHtlcPubkey,
          htlc.paymentHash,
        )
      : receivedHtlcScript(
          keys.revocationPubkey,
          keys.localHtlcPubkey,
          keys.remoteHtlcPubkey,
          htlc.paymentHash,
          htlc.cltvExpiry,
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
