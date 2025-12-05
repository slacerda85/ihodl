/**
 * Submarine Swaps Implementation
 *
 * Implementa swaps atômicos entre on-chain Bitcoin e Lightning Network:
 * - Loop In: On-chain BTC → Lightning (Forward Swap)
 * - Loop Out: Lightning → On-chain BTC (Reverse Swap)
 *
 * Baseado na implementação Electrum e protocolo Boltz
 * Referência: https://docs.boltz.exchange/
 */

import { sha256 } from '@noble/hashes/sha2.js'
import { ripemd160 } from '@noble/hashes/legacy.js'
import * as secp256k1 from '@noble/secp256k1'
import { OpCode } from '@/core/models/opcodes'
import { uint8ArrayToHex } from '@/core/lib/utils'

// ============================================================================
// Constantes
// ============================================================================

/** Tamanho padrão da TX de swap para estimativa de fee */
export const SWAP_TX_SIZE = 150

/** Valor mínimo de swap em satoshis */
export const MIN_SWAP_AMOUNT_SAT = 20000

/** Delta mínimo de locktime */
export const MIN_LOCKTIME_DELTA = 60

/** Delta de locktime para refund */
export const LOCKTIME_DELTA_REFUND = 70

/** Delta máximo de locktime */
export const MAX_LOCKTIME_DELTA = 100

/** CLTV delta mínimo para cliente */
export const MIN_FINAL_CLTV_DELTA_FOR_CLIENT = 3 * 144 // ~3 dias

/** Delay para resgatar após double-spend detectado */
export const REDEEM_AFTER_DOUBLE_SPENT_DELAY = 144 // ~1 dia

// ============================================================================
// Tipos
// ============================================================================

/**
 * Tipo de swap
 */
export enum SwapType {
  /** On-chain → Lightning (Forward/Loop In) */
  FORWARD = 'forward',
  /** Lightning → On-chain (Reverse/Loop Out) */
  REVERSE = 'reverse',
}

/**
 * Estado do swap
 */
export enum SwapState {
  /** Swap criado, aguardando funding */
  CREATED = 'created',
  /** TX de funding enviada */
  FUNDED = 'funded',
  /** TX de funding confirmada */
  CONFIRMED = 'confirmed',
  /** Swap completado com sucesso */
  COMPLETED = 'completed',
  /** Swap expirou, precisa de refund */
  EXPIRED = 'expired',
  /** Refund realizado */
  REFUNDED = 'refunded',
  /** Swap falhou */
  FAILED = 'failed',
}

/**
 * Taxas do servidor de swap
 */
export interface SwapFees {
  /** Percentual de fee (em base points, ex: 100 = 1%) */
  percentageBps: number
  /** Fee de mineração em satoshis */
  miningFeeSat: bigint
  /** Valor mínimo de swap em satoshis */
  minAmountSat: bigint
  /** Valor máximo para forward swap */
  maxForwardSat: bigint
  /** Valor máximo para reverse swap */
  maxReverseSat: bigint
}

/**
 * Oferta de swap de um servidor
 */
export interface SwapOffer {
  /** Taxas do servidor */
  fees: SwapFees
  /** Pubkey do servidor (hex) */
  serverPubkey: string
  /** Relays Nostr do servidor */
  relays: string[]
  /** Bits de proof-of-work necessários */
  powBits: number
  /** Timestamp da oferta */
  timestamp: number
}

/**
 * Dados de um swap
 */
export interface SwapData {
  /** Tipo de swap */
  type: SwapType
  /** Estado atual */
  state: SwapState
  /** Locktime absoluto (block height) */
  locktime: number
  /** Valor on-chain em satoshis */
  onchainAmountSat: bigint
  /** Valor lightning em satoshis */
  lightningAmountSat: bigint
  /** Script de resgate (hex) */
  redeemScript: string
  /** Preimage (hex, 32 bytes) */
  preimage?: string
  /** Payment hash (hex, 32 bytes) */
  paymentHash: string
  /** Hash de prepayment se houver (hex) */
  prepayHash?: string
  /** Chave privada do swap (hex, 32 bytes) */
  privateKey: string
  /** Endereço de lockup (P2WSH) */
  lockupAddress: string
  /** Endereço para claim/refund */
  claimToAddress?: string
  /** TXID de funding */
  fundingTxid?: string
  /** Vout do funding */
  fundingVout?: number
  /** TXID de spending (claim ou refund) */
  spendingTxid?: string
  /** Timestamp de criação */
  createdAt: number
  /** Timestamp de última atualização */
  updatedAt: number
  /** Pubkey do servidor */
  serverPubkey: string
}

/**
 * Parâmetros para criar um forward swap (Loop In)
 */
export interface CreateForwardSwapParams {
  /** Valor em satoshis a receber no Lightning */
  amountSat: bigint
  /** Invoice para pagar (gerado pelo usuário) */
  invoice: string
  /** Endereço para refund se expirar */
  refundAddress: string
  /** Oferta do servidor */
  offer: SwapOffer
}

/**
 * Parâmetros para criar um reverse swap (Loop Out)
 */
export interface CreateReverseSwapParams {
  /** Valor em satoshis a receber on-chain */
  amountSat: bigint
  /** Endereço para receber on-chain */
  onchainAddress: string
  /** Oferta do servidor */
  offer: SwapOffer
}

/**
 * Resposta do servidor para criação de swap
 */
export interface SwapServerResponse {
  /** ID do swap no servidor */
  swapId: string
  /** Endereço de lockup */
  lockupAddress: string
  /** Script de resgate (hex) */
  redeemScript: string
  /** Locktime */
  locktime: number
  /** Invoice para pagar (reverse swap) */
  invoice?: string
  /** Valor esperado on-chain */
  expectedAmountSat: bigint
  /** Fee total */
  totalFeeSat: bigint
}

/**
 * Resultado de claim/refund
 */
export interface SwapClaimResult {
  /** TXID da transação */
  txid: string
  /** Transação serializada (hex) */
  rawTx: string
  /** Valor recebido após fees */
  amountSat: bigint
}

// ============================================================================
// Script de Swap
// ============================================================================

/**
 * Constrói o script de swap (witness script)
 *
 * Template:
 * OP_SIZE <32> OP_EQUAL
 * OP_IF
 *   OP_HASH160 <payment_hash_ripemd160> OP_EQUALVERIFY
 *   <claim_pubkey>
 * OP_ELSE
 *   OP_DROP
 *   <locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP
 *   <refund_pubkey>
 * OP_ENDIF
 * OP_CHECKSIG
 */
export function constructSwapScript(
  paymentHash: Uint8Array, // 32 bytes
  locktime: number,
  claimPubkey: Uint8Array, // 33 bytes
  refundPubkey: Uint8Array, // 33 bytes
): Uint8Array {
  if (paymentHash.length !== 32) {
    throw new Error('Payment hash must be 32 bytes')
  }
  if (claimPubkey.length !== 33) {
    throw new Error('Claim pubkey must be 33 bytes (compressed)')
  }
  if (refundPubkey.length !== 33) {
    throw new Error('Refund pubkey must be 33 bytes (compressed)')
  }

  // RIPEMD160 do payment hash
  const paymentHashRipemd = ripemd160(paymentHash)

  // Codificar locktime como little-endian
  const locktimeBytes = encodeLocktimeForScript(locktime)

  const script: number[] = []

  // OP_SIZE <32> OP_EQUAL
  script.push(OpCode.OP_SIZE)
  script.push(0x01, 0x20) // PUSH 1 byte: 32
  script.push(OpCode.OP_EQUAL)

  // OP_IF
  script.push(OpCode.OP_IF)

  // OP_HASH160 <payment_hash_ripemd160> OP_EQUALVERIFY
  script.push(OpCode.OP_HASH160)
  script.push(0x14) // PUSH 20 bytes
  script.push(...paymentHashRipemd)
  script.push(OpCode.OP_EQUALVERIFY)

  // <claim_pubkey>
  script.push(0x21) // PUSH 33 bytes
  script.push(...claimPubkey)

  // OP_ELSE
  script.push(OpCode.OP_ELSE)

  // OP_DROP
  script.push(OpCode.OP_DROP)

  // <locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP
  script.push(locktimeBytes.length)
  script.push(...locktimeBytes)
  script.push(OpCode.OP_CHECKLOCKTIMEVERIFY)
  script.push(OpCode.OP_DROP)

  // <refund_pubkey>
  script.push(0x21) // PUSH 33 bytes
  script.push(...refundPubkey)

  // OP_ENDIF OP_CHECKSIG
  script.push(OpCode.OP_ENDIF)
  script.push(OpCode.OP_CHECKSIG)

  return new Uint8Array(script)
}

/**
 * Codifica locktime para uso em script (little-endian, minimal encoding)
 */
function encodeLocktimeForScript(locktime: number): Uint8Array {
  if (locktime === 0) {
    return new Uint8Array([0x00])
  }

  const bytes: number[] = []
  let value = locktime

  while (value > 0) {
    bytes.push(value & 0xff)
    value >>>= 8
  }

  // Se o bit mais significativo está setado, adicionar 0x00
  if (bytes[bytes.length - 1] & 0x80) {
    bytes.push(0x00)
  }

  return new Uint8Array(bytes)
}

/**
 * Calcula o endereço P2WSH a partir do witness script
 */
export function scriptToP2wshAddress(
  script: Uint8Array,
  network: 'mainnet' | 'testnet' = 'mainnet',
): string {
  const scriptHash = sha256(script)
  const prefix = network === 'mainnet' ? 'bc' : 'tb'

  // Bech32 encode: version 0 + 32 bytes hash
  return bech32Encode(prefix, 0, scriptHash)
}

/**
 * Codificação Bech32 simplificada
 */
function bech32Encode(hrp: string, version: number, data: Uint8Array): string {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

  // Converter para 5-bit words
  const words = [version]
  let accumulator = 0
  let bits = 0

  for (const byte of data) {
    accumulator = (accumulator << 8) | byte
    bits += 8

    while (bits >= 5) {
      bits -= 5
      words.push((accumulator >>> bits) & 0x1f)
    }
  }

  if (bits > 0) {
    words.push((accumulator << (5 - bits)) & 0x1f)
  }

  // Calcular checksum
  const checksum = bech32Checksum(hrp, words)
  const combined = [...words, ...checksum]

  // Construir string
  let result = hrp + '1'
  for (const word of combined) {
    result += CHARSET[word]
  }

  return result
}

/**
 * Calcula checksum Bech32
 */
function bech32Checksum(hrp: string, data: number[]): number[] {
  const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

  function polymod(values: number[]): number {
    let chk = 1
    for (const v of values) {
      const top = chk >>> 25
      chk = ((chk & 0x1ffffff) << 5) ^ v
      for (let i = 0; i < 5; i++) {
        if ((top >>> i) & 1) {
          chk ^= GENERATOR[i]
        }
      }
    }
    return chk
  }

  function hrpExpand(hrp: string): number[] {
    const ret: number[] = []
    for (const c of hrp) {
      ret.push(c.charCodeAt(0) >>> 5)
    }
    ret.push(0)
    for (const c of hrp) {
      ret.push(c.charCodeAt(0) & 31)
    }
    return ret
  }

  const values = [...hrpExpand(hrp), ...data]
  const polymodValue = polymod([...values, 0, 0, 0, 0, 0, 0]) ^ 1

  const checksum: number[] = []
  for (let i = 0; i < 6; i++) {
    checksum.push((polymodValue >>> (5 * (5 - i))) & 31)
  }

  return checksum
}

// ============================================================================
// Validação de Script
// ============================================================================

/**
 * Valida o script de swap
 */
export function validateSwapScript(
  redeemScript: Uint8Array,
  lockupAddress: string,
  paymentHash: Uint8Array,
  locktime: number,
  claimPubkey?: Uint8Array,
  refundPubkey?: Uint8Array,
): boolean {
  // Reconstruir o script esperado
  if (!claimPubkey || !refundPubkey) {
    // Extrair pubkeys do script se não fornecidos
    const extracted = extractSwapScriptParams(redeemScript)
    if (!extracted) return false
    claimPubkey = claimPubkey || extracted.claimPubkey
    refundPubkey = refundPubkey || extracted.refundPubkey
  }

  const expectedScript = constructSwapScript(paymentHash, locktime, claimPubkey, refundPubkey)

  // Comparar scripts
  if (redeemScript.length !== expectedScript.length) return false
  for (let i = 0; i < redeemScript.length; i++) {
    if (redeemScript[i] !== expectedScript[i]) return false
  }

  // Verificar endereço
  const expectedAddress = scriptToP2wshAddress(redeemScript)
  return lockupAddress === expectedAddress
}

/**
 * Extrai parâmetros do script de swap
 */
export function extractSwapScriptParams(script: Uint8Array): {
  paymentHashRipemd: Uint8Array
  claimPubkey: Uint8Array
  refundPubkey: Uint8Array
  locktime: number
} | null {
  try {
    // Script mínimo esperado: ~107 bytes
    if (script.length < 100) return null

    // Encontrar payment_hash (após OP_HASH160, antes de OP_EQUALVERIFY)
    // Formato: OP_HASH160 <20 bytes> OP_EQUALVERIFY
    let offset = 0

    // Pular OP_SIZE <32> OP_EQUAL OP_IF OP_HASH160
    offset = 5

    // Ler payment hash (20 bytes após push opcode)
    if (script[offset] !== 0x14) return null // PUSH 20 bytes
    offset++
    const paymentHashRipemd = script.slice(offset, offset + 20)
    offset += 20

    // Pular OP_EQUALVERIFY
    if (script[offset] !== OpCode.OP_EQUALVERIFY) return null
    offset++

    // Ler claim pubkey (33 bytes)
    if (script[offset] !== 0x21) return null // PUSH 33 bytes
    offset++
    const claimPubkey = script.slice(offset, offset + 33)
    offset += 33

    // Pular OP_ELSE OP_DROP
    if (script[offset] !== OpCode.OP_ELSE) return null
    offset++
    if (script[offset] !== OpCode.OP_DROP) return null
    offset++

    // Ler locktime (variable length)
    const locktimeLen = script[offset]
    offset++
    let locktime = 0
    for (let i = 0; i < locktimeLen; i++) {
      locktime |= script[offset + i] << (8 * i)
    }
    offset += locktimeLen

    // Pular OP_CHECKLOCKTIMEVERIFY OP_DROP
    if (script[offset] !== OpCode.OP_CHECKLOCKTIMEVERIFY) return null
    offset++
    if (script[offset] !== OpCode.OP_DROP) return null
    offset++

    // Ler refund pubkey (33 bytes)
    if (script[offset] !== 0x21) return null // PUSH 33 bytes
    offset++
    const refundPubkey = script.slice(offset, offset + 33)

    return { paymentHashRipemd, claimPubkey, refundPubkey, locktime }
  } catch {
    return null
  }
}

// ============================================================================
// Cálculo de Fees
// ============================================================================

/**
 * Calcula fee total para um swap
 */
export function calculateSwapFee(amountSat: bigint, fees: SwapFees): bigint {
  // Fee percentual
  const percentFee = (amountSat * BigInt(fees.percentageBps)) / 10000n

  // Fee total = percentual + mineração
  return percentFee + fees.miningFeeSat
}

/**
 * Calcula valor a receber após fees (para reverse swap)
 */
export function calculateReverseSwapReceiveAmount(sendAmountSat: bigint, fees: SwapFees): bigint {
  const fee = calculateSwapFee(sendAmountSat, fees)
  return sendAmountSat - fee
}

/**
 * Calcula valor a enviar para receber amount específico (para forward swap)
 */
export function calculateForwardSwapSendAmount(receiveAmountSat: bigint, fees: SwapFees): bigint {
  // sendAmount - fee = receiveAmount
  // sendAmount - (sendAmount * percentage / 10000 + miningFee) = receiveAmount
  // sendAmount * (1 - percentage / 10000) = receiveAmount + miningFee
  // sendAmount = (receiveAmount + miningFee) / (1 - percentage / 10000)

  const numerator = (receiveAmountSat + fees.miningFeeSat) * 10000n
  const denominator = 10000n - BigInt(fees.percentageBps)

  return numerator / denominator + 1n // Arredondar para cima
}

// ============================================================================
// Gerenciamento de Swap
// ============================================================================

/**
 * Gera par de chaves para swap
 */
export function generateSwapKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = crypto.getRandomValues(new Uint8Array(32))
  const publicKey = secp256k1.getPublicKey(privateKey, true)
  return { privateKey, publicKey }
}

/**
 * Gera preimage aleatório e seu hash
 */
export function generatePreimage(): { preimage: Uint8Array; paymentHash: Uint8Array } {
  const preimage = crypto.getRandomValues(new Uint8Array(32))
  const paymentHash = sha256(preimage)
  return { preimage, paymentHash }
}

/**
 * Verifica se preimage corresponde ao payment hash
 */
export function verifyPreimage(preimage: Uint8Array, paymentHash: Uint8Array): boolean {
  if (preimage.length !== 32 || paymentHash.length !== 32) return false
  const computed = sha256(preimage)
  for (let i = 0; i < 32; i++) {
    if (computed[i] !== paymentHash[i]) return false
  }
  return true
}

// ============================================================================
// Transações de Claim/Refund
// ============================================================================

/**
 * Parâmetros para criar transação de claim
 */
export interface ClaimTxParams {
  /** Script de resgate */
  redeemScript: Uint8Array
  /** Preimage (32 bytes) */
  preimage: Uint8Array
  /** Chave privada do claim */
  claimPrivateKey: Uint8Array
  /** TXID do funding */
  fundingTxid: string
  /** Vout do funding */
  fundingVout: number
  /** Valor do funding em satoshis */
  fundingAmountSat: bigint
  /** Endereço de destino */
  destinationAddress: string
  /** Fee rate em sat/vB */
  feeRateSatPerVb: number
}

/**
 * Parâmetros para criar transação de refund
 */
export interface RefundTxParams {
  /** Script de resgate */
  redeemScript: Uint8Array
  /** Chave privada do refund */
  refundPrivateKey: Uint8Array
  /** Locktime do swap */
  locktime: number
  /** TXID do funding */
  fundingTxid: string
  /** Vout do funding */
  fundingVout: number
  /** Valor do funding em satoshis */
  fundingAmountSat: bigint
  /** Endereço de destino */
  destinationAddress: string
  /** Fee rate em sat/vB */
  feeRateSatPerVb: number
}

/**
 * Estrutura de witness para claim
 * Witness: <signature> <preimage> <redeem_script>
 */
export function constructClaimWitness(
  signature: Uint8Array,
  preimage: Uint8Array,
  redeemScript: Uint8Array,
): Uint8Array[] {
  return [signature, preimage, redeemScript]
}

/**
 * Estrutura de witness para refund
 * Witness: <signature> <empty> <redeem_script>
 */
export function constructRefundWitness(
  signature: Uint8Array,
  redeemScript: Uint8Array,
): Uint8Array[] {
  return [signature, new Uint8Array(0), redeemScript]
}

/**
 * Calcula tamanho do witness para claim
 */
export function calculateClaimWitnessSize(redeemScriptSize: number): number {
  // Witness: signature (71-73) + preimage (32) + redeem_script
  const signatureSize = 73 // Máximo
  const preimageSize = 32
  return 1 + signatureSize + 1 + preimageSize + varIntSize(redeemScriptSize) + redeemScriptSize
}

/**
 * Calcula tamanho do witness para refund
 */
export function calculateRefundWitnessSize(redeemScriptSize: number): number {
  // Witness: signature (71-73) + empty (1) + redeem_script
  const signatureSize = 73
  return 1 + signatureSize + 1 + varIntSize(redeemScriptSize) + redeemScriptSize
}

/**
 * Calcula tamanho de varint
 */
function varIntSize(value: number): number {
  if (value < 0xfd) return 1
  if (value <= 0xffff) return 3
  if (value <= 0xffffffff) return 5
  return 9
}

/**
 * Calcula fee para transação de claim/refund
 */
export function calculateSwapTxFee(
  witnessSize: number,
  feeRateSatPerVb: number,
  numInputs: number = 1,
  numOutputs: number = 1,
): bigint {
  // Base tx size (non-witness): ~10 + 41*inputs + 34*outputs
  const baseSize = 10 + 41 * numInputs + 34 * numOutputs

  // Witness weight
  const witnessWeight = witnessSize

  // Virtual size = (baseSize * 4 + witnessWeight) / 4
  const vsize = Math.ceil((baseSize * 4 + witnessWeight) / 4)

  return BigInt(Math.ceil(vsize * feeRateSatPerVb))
}

// ============================================================================
// Swap Manager
// ============================================================================

/**
 * Gerenciador de swaps
 */
export class SwapManager {
  private swaps: Map<string, SwapData> = new Map()
  private network: 'mainnet' | 'testnet'

  constructor(network: 'mainnet' | 'testnet' = 'mainnet') {
    this.network = network
  }

  /**
   * Cria um novo forward swap (Loop In)
   */
  async createForwardSwap(params: CreateForwardSwapParams): Promise<SwapData> {
    // Gerar keypair para refund
    const { privateKey } = generateSwapKeyPair()

    // Gerar preimage e payment hash
    const { preimage, paymentHash } = generatePreimage()

    // Calcular valores
    const totalFee = calculateSwapFee(params.amountSat, params.offer.fees)
    const onchainAmount = params.amountSat + totalFee

    // Criar swap data
    const swapData: SwapData = {
      type: SwapType.FORWARD,
      state: SwapState.CREATED,
      locktime: 0, // Será definido pelo servidor
      onchainAmountSat: onchainAmount,
      lightningAmountSat: params.amountSat,
      redeemScript: '', // Será definido pelo servidor
      preimage: uint8ArrayToHex(preimage),
      paymentHash: uint8ArrayToHex(paymentHash),
      privateKey: uint8ArrayToHex(privateKey),
      lockupAddress: '', // Será definido pelo servidor
      claimToAddress: params.refundAddress,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      serverPubkey: params.offer.serverPubkey,
    }

    // Armazenar swap
    this.swaps.set(uint8ArrayToHex(paymentHash), swapData)

    console.log(`[swap] Created forward swap: ${uint8ArrayToHex(paymentHash).slice(0, 16)}...`)

    return swapData
  }

  /**
   * Cria um novo reverse swap (Loop Out)
   */
  async createReverseSwap(params: CreateReverseSwapParams): Promise<SwapData> {
    // Gerar keypair para claim
    const { privateKey } = generateSwapKeyPair()

    // Para reverse swap, o servidor gera o preimage
    // Calcular valores
    const receiveAmount = calculateReverseSwapReceiveAmount(params.amountSat, params.offer.fees)

    // Criar swap data
    const swapData: SwapData = {
      type: SwapType.REVERSE,
      state: SwapState.CREATED,
      locktime: 0, // Será definido pelo servidor
      onchainAmountSat: receiveAmount,
      lightningAmountSat: params.amountSat,
      redeemScript: '', // Será definido pelo servidor
      paymentHash: '', // Será definido pelo servidor
      privateKey: uint8ArrayToHex(privateKey),
      lockupAddress: '', // Será definido pelo servidor
      claimToAddress: params.onchainAddress,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      serverPubkey: params.offer.serverPubkey,
    }

    const tempId = uint8ArrayToHex(crypto.getRandomValues(new Uint8Array(16)))
    this.swaps.set(tempId, swapData)

    console.log(`[swap] Created reverse swap: ${tempId.slice(0, 16)}...`)

    return swapData
  }

  /**
   * Atualiza swap com resposta do servidor
   */
  updateSwapFromServer(paymentHash: string, response: SwapServerResponse): void {
    const swap = this.swaps.get(paymentHash)
    if (!swap) {
      throw new Error(`Swap not found: ${paymentHash}`)
    }

    swap.lockupAddress = response.lockupAddress
    swap.redeemScript = response.redeemScript
    swap.locktime = response.locktime
    swap.updatedAt = Date.now()

    this.swaps.set(paymentHash, swap)
  }

  /**
   * Marca swap como funded
   */
  setSwapFunded(paymentHash: string, fundingTxid: string, fundingVout: number): void {
    const swap = this.swaps.get(paymentHash)
    if (!swap) {
      throw new Error(`Swap not found: ${paymentHash}`)
    }

    swap.state = SwapState.FUNDED
    swap.fundingTxid = fundingTxid
    swap.fundingVout = fundingVout
    swap.updatedAt = Date.now()

    this.swaps.set(paymentHash, swap)
  }

  /**
   * Marca swap como confirmado
   */
  setSwapConfirmed(paymentHash: string): void {
    const swap = this.swaps.get(paymentHash)
    if (!swap) {
      throw new Error(`Swap not found: ${paymentHash}`)
    }

    swap.state = SwapState.CONFIRMED
    swap.updatedAt = Date.now()

    this.swaps.set(paymentHash, swap)
  }

  /**
   * Marca swap como completado
   */
  setSwapCompleted(paymentHash: string, spendingTxid: string): void {
    const swap = this.swaps.get(paymentHash)
    if (!swap) {
      throw new Error(`Swap not found: ${paymentHash}`)
    }

    swap.state = SwapState.COMPLETED
    swap.spendingTxid = spendingTxid
    swap.updatedAt = Date.now()

    this.swaps.set(paymentHash, swap)
  }

  /**
   * Marca swap como expirado
   */
  setSwapExpired(paymentHash: string): void {
    const swap = this.swaps.get(paymentHash)
    if (!swap) {
      throw new Error(`Swap not found: ${paymentHash}`)
    }

    swap.state = SwapState.EXPIRED
    swap.updatedAt = Date.now()

    this.swaps.set(paymentHash, swap)
  }

  /**
   * Marca swap como refunded
   */
  setSwapRefunded(paymentHash: string, spendingTxid: string): void {
    const swap = this.swaps.get(paymentHash)
    if (!swap) {
      throw new Error(`Swap not found: ${paymentHash}`)
    }

    swap.state = SwapState.REFUNDED
    swap.spendingTxid = spendingTxid
    swap.updatedAt = Date.now()

    this.swaps.set(paymentHash, swap)
  }

  /**
   * Obtém swap por payment hash
   */
  getSwap(paymentHash: string): SwapData | undefined {
    return this.swaps.get(paymentHash)
  }

  /**
   * Lista todos os swaps
   */
  listSwaps(): SwapData[] {
    return Array.from(this.swaps.values())
  }

  /**
   * Lista swaps pendentes
   */
  listPendingSwaps(): SwapData[] {
    return Array.from(this.swaps.values()).filter(
      s =>
        s.state !== SwapState.COMPLETED &&
        s.state !== SwapState.REFUNDED &&
        s.state !== SwapState.FAILED,
    )
  }

  /**
   * Verifica se swap expirou
   */
  isSwapExpired(paymentHash: string, currentBlockHeight: number): boolean {
    const swap = this.swaps.get(paymentHash)
    if (!swap) return false

    return currentBlockHeight >= swap.locktime
  }

  /**
   * Exporta swaps para persistência
   */
  exportSwaps(): Record<string, SwapData> {
    const result: Record<string, SwapData> = {}
    for (const [key, value] of this.swaps) {
      result[key] = value
    }
    return result
  }

  /**
   * Importa swaps de persistência
   */
  importSwaps(data: Record<string, SwapData>): void {
    for (const [key, value] of Object.entries(data)) {
      this.swaps.set(key, value)
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Cria instância do SwapManager
 */
export function createSwapManager(network: 'mainnet' | 'testnet' = 'mainnet'): SwapManager {
  return new SwapManager(network)
}

// Types and classes are already exported inline
