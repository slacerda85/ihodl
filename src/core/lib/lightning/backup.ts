/**
 * BOLT #2: Channel Backup and Restore
 *
 * Implementação de Static Channel Backup (SCB) para recuperação de canais.
 * Baseado no formato usado pelo Electrum e LND.
 *
 * O SCB contém dados essenciais para forçar o fechamento de um canal
 * caso o estado local seja perdido, permitindo recuperar fundos.
 */

import { gcm } from '@noble/ciphers/aes.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import * as Crypto from 'expo-crypto'
import { hexToUint8Array, uint8ArrayToHex } from '@/core/lib/utils'
import { createPublicKey } from '@/core/lib/key'
import { bech32 } from '@/core/lib/bips'

/**
 * Gera bytes aleatórios usando expo-crypto
 */
function randomBytes(size: number): Uint8Array {
  return Crypto.getRandomValues(new Uint8Array(size))
}

// ==========================================
// TYPES
// ==========================================

/**
 * Versão do formato de backup
 * Incrementar ao adicionar novos campos
 */
export const CHANNEL_BACKUP_VERSION = 2

/**
 * Versões conhecidas que podemos ler
 */
export const KNOWN_BACKUP_VERSIONS = [0, 1, 2]

/**
 * Magic bytes para identificar um backup
 */
export const BACKUP_MAGIC = 'IHODL_CB:'

/**
 * Dados essenciais para backup de canal individual
 */
export interface ChannelBackupData {
  // Identidade
  channelId: string // 32 bytes hex
  nodeId: string // 33 bytes hex (remote node pubkey)

  // Funding transaction
  fundingTxid: string // 32 bytes hex
  fundingOutputIndex: number // u16

  // Derivação de chaves
  channelSeed: string // 32 bytes hex - para derivar todas as chaves
  localPrivkey: string // 32 bytes hex - chave privada do nó local
  multisigFundingPrivkey?: string // 32 bytes hex - chave de funding

  // Configuração do canal
  isInitiator: boolean
  localDelay: number // to_self_delay local
  remoteDelay: number // to_self_delay remoto

  // Chaves públicas do peer
  remotePaymentPubkey: string // 33 bytes hex
  remoteRevocationPubkey: string // 33 bytes hex
  localPaymentPubkey?: string // 33 bytes hex

  // Conexão
  host: string
  port: number

  // Metadados
  createdAt: number // timestamp
  fundingAddress?: string // endereço de funding
}

/**
 * Container de backup completo (pode conter múltiplos canais)
 */
export interface FullBackup {
  version: number
  createdAt: number
  channels: ChannelBackupData[]
  nodePrivkey?: string // 32 bytes hex - chave do nó
}

/**
 * Backup exportado encriptado
 */
export interface EncryptedBackup {
  magic: string
  version: number
  salt: string // 16 bytes hex
  nonce: string // 12 bytes hex
  ciphertext: string // hex
  mac: string // 16 bytes hex (parte do ciphertext no AES-GCM)
}

// ==========================================
// SERIALIZATION
// ==========================================

/**
 * Serializador binário compatível com BCDataStream do Electrum
 */
class BackupDataStream {
  private data: number[] = []
  private readPos = 0

  constructor(initialData?: Uint8Array) {
    if (initialData) {
      this.data = Array.from(initialData)
    }
  }

  // Write methods
  writeU8(value: number): void {
    this.data.push(value & 0xff)
  }

  writeU16(value: number): void {
    this.data.push((value >> 8) & 0xff)
    this.data.push(value & 0xff)
  }

  writeU32(value: number): void {
    this.data.push((value >> 24) & 0xff)
    this.data.push((value >> 16) & 0xff)
    this.data.push((value >> 8) & 0xff)
    this.data.push(value & 0xff)
  }

  writeU64(value: bigint): void {
    const view = new DataView(new ArrayBuffer(8))
    view.setBigUint64(0, value, false)
    for (let i = 0; i < 8; i++) {
      this.data.push(view.getUint8(i))
    }
  }

  writeBoolean(value: boolean): void {
    this.writeU8(value ? 1 : 0)
  }

  writeBytes(bytes: Uint8Array, expectedLength?: number): void {
    if (expectedLength !== undefined && bytes.length !== expectedLength) {
      throw new Error(`Expected ${expectedLength} bytes, got ${bytes.length}`)
    }
    for (const byte of bytes) {
      this.data.push(byte)
    }
  }

  writeString(value: string): void {
    const encoded = new TextEncoder().encode(value)
    this.writeVarInt(encoded.length)
    this.writeBytes(encoded)
  }

  writeVarInt(value: number): void {
    if (value < 0xfd) {
      this.writeU8(value)
    } else if (value <= 0xffff) {
      this.writeU8(0xfd)
      this.data.push(value & 0xff)
      this.data.push((value >> 8) & 0xff)
    } else if (value <= 0xffffffff) {
      this.writeU8(0xfe)
      this.data.push(value & 0xff)
      this.data.push((value >> 8) & 0xff)
      this.data.push((value >> 16) & 0xff)
      this.data.push((value >> 24) & 0xff)
    } else {
      throw new Error('VarInt too large')
    }
  }

  // Read methods
  readU8(): number {
    if (this.readPos >= this.data.length) {
      throw new Error('Buffer underflow')
    }
    return this.data[this.readPos++]
  }

  readU16(): number {
    const b1 = this.readU8()
    const b2 = this.readU8()
    return (b1 << 8) | b2
  }

  readU32(): number {
    const b1 = this.readU8()
    const b2 = this.readU8()
    const b3 = this.readU8()
    const b4 = this.readU8()
    return ((b1 << 24) | (b2 << 16) | (b3 << 8) | b4) >>> 0
  }

  readU64(): bigint {
    const bytes = this.readBytes(8)
    const view = new DataView(bytes.buffer)
    return view.getBigUint64(0, false)
  }

  readBoolean(): boolean {
    return this.readU8() !== 0
  }

  readBytes(length: number): Uint8Array {
    if (this.readPos + length > this.data.length) {
      throw new Error('Buffer underflow')
    }
    const result = new Uint8Array(this.data.slice(this.readPos, this.readPos + length))
    this.readPos += length
    return result
  }

  readString(): string {
    const length = this.readVarInt()
    const bytes = this.readBytes(length)
    return new TextDecoder().decode(bytes)
  }

  readVarInt(): number {
    const first = this.readU8()
    if (first < 0xfd) {
      return first
    } else if (first === 0xfd) {
      const b1 = this.readU8()
      const b2 = this.readU8()
      return b1 | (b2 << 8)
    } else if (first === 0xfe) {
      const b1 = this.readU8()
      const b2 = this.readU8()
      const b3 = this.readU8()
      const b4 = this.readU8()
      return b1 | (b2 << 8) | (b3 << 16) | (b4 << 24)
    }
    throw new Error('VarInt too large')
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.data)
  }

  hasMore(): boolean {
    return this.readPos < this.data.length
  }
}

// ==========================================
// SERIALIZATION FUNCTIONS
// ==========================================

/**
 * Serializa um único backup de canal para bytes
 */
export function serializeChannelBackup(backup: ChannelBackupData): Uint8Array {
  const stream = new BackupDataStream()

  stream.writeU16(CHANNEL_BACKUP_VERSION)
  stream.writeBoolean(backup.isInitiator)

  // Chaves privadas
  stream.writeBytes(hexToUint8Array(backup.localPrivkey), 32)
  stream.writeBytes(hexToUint8Array(backup.channelSeed), 32)

  // Node ID remoto
  stream.writeBytes(hexToUint8Array(backup.nodeId), 33)

  // Funding
  stream.writeBytes(hexToUint8Array(backup.fundingTxid), 32)
  stream.writeU16(backup.fundingOutputIndex)
  stream.writeString(backup.fundingAddress || '')

  // Chaves públicas remotas
  stream.writeBytes(hexToUint8Array(backup.remotePaymentPubkey), 33)
  stream.writeBytes(hexToUint8Array(backup.remoteRevocationPubkey), 33)

  // Delays
  stream.writeU16(backup.localDelay)
  stream.writeU16(backup.remoteDelay)

  // Conexão
  stream.writeString(backup.host)
  stream.writeU16(backup.port)

  // V1+: local payment pubkey
  stream.writeBytes(
    backup.localPaymentPubkey ? hexToUint8Array(backup.localPaymentPubkey) : new Uint8Array(33),
    33,
  )

  // V2+: multisig funding privkey
  stream.writeBytes(
    backup.multisigFundingPrivkey
      ? hexToUint8Array(backup.multisigFundingPrivkey)
      : new Uint8Array(32),
    32,
  )

  // Metadados
  stream.writeU64(BigInt(backup.createdAt))

  return stream.toBytes()
}

/**
 * Deserializa bytes para backup de canal
 */
export function deserializeChannelBackup(data: Uint8Array): ChannelBackupData {
  const stream = new BackupDataStream(data)

  const version = stream.readU16()
  if (!KNOWN_BACKUP_VERSIONS.includes(version)) {
    throw new Error(`Unknown backup version: ${version}`)
  }

  const isInitiator = stream.readBoolean()

  // Chaves privadas
  const localPrivkey = uint8ArrayToHex(stream.readBytes(32))
  const channelSeed = uint8ArrayToHex(stream.readBytes(32))

  // Node ID remoto
  const nodeId = uint8ArrayToHex(stream.readBytes(33))

  // Funding
  const fundingTxid = uint8ArrayToHex(stream.readBytes(32))
  const fundingOutputIndex = stream.readU16()
  const fundingAddress = stream.readString()

  // Chaves públicas remotas
  const remotePaymentPubkey = uint8ArrayToHex(stream.readBytes(33))
  const remoteRevocationPubkey = uint8ArrayToHex(stream.readBytes(33))

  // Delays
  const localDelay = stream.readU16()
  const remoteDelay = stream.readU16()

  // Conexão
  const host = stream.readString()
  const port = stream.readU16()

  // V1+: local payment pubkey
  let localPaymentPubkey: string | undefined
  if (version >= 1) {
    const pubkeyBytes = stream.readBytes(33)
    if (!pubkeyBytes.every(b => b === 0)) {
      localPaymentPubkey = uint8ArrayToHex(pubkeyBytes)
    }
  }

  // V2+: multisig funding privkey
  let multisigFundingPrivkey: string | undefined
  if (version >= 2) {
    const privkeyBytes = stream.readBytes(32)
    if (!privkeyBytes.every(b => b === 0)) {
      multisigFundingPrivkey = uint8ArrayToHex(privkeyBytes)
    }
  }

  // Metadados
  let createdAt = Date.now()
  if (stream.hasMore()) {
    createdAt = Number(stream.readU64())
  }

  // Derivar channelId do funding
  const channelId = deriveChannelIdFromFunding(fundingTxid, fundingOutputIndex)

  return {
    channelId,
    nodeId,
    fundingTxid,
    fundingOutputIndex,
    channelSeed,
    localPrivkey,
    multisigFundingPrivkey,
    isInitiator,
    localDelay,
    remoteDelay,
    remotePaymentPubkey,
    remoteRevocationPubkey,
    localPaymentPubkey,
    host,
    port,
    createdAt,
    fundingAddress: fundingAddress || undefined,
  }
}

/**
 * Serializa backup completo (múltiplos canais)
 */
export function serializeFullBackup(backup: FullBackup): Uint8Array {
  const stream = new BackupDataStream()

  // Header
  stream.writeU16(backup.version)
  stream.writeU64(BigInt(backup.createdAt))

  // Node privkey (opcional)
  if (backup.nodePrivkey) {
    stream.writeBoolean(true)
    stream.writeBytes(hexToUint8Array(backup.nodePrivkey), 32)
  } else {
    stream.writeBoolean(false)
  }

  // Número de canais
  stream.writeVarInt(backup.channels.length)

  // Cada canal serializado
  for (const channel of backup.channels) {
    const channelBytes = serializeChannelBackup(channel)
    stream.writeVarInt(channelBytes.length)
    stream.writeBytes(channelBytes)
  }

  return stream.toBytes()
}

/**
 * Deserializa backup completo
 */
export function deserializeFullBackup(data: Uint8Array): FullBackup {
  const stream = new BackupDataStream(data)

  // Header
  const version = stream.readU16()
  const createdAt = Number(stream.readU64())

  // Node privkey
  let nodePrivkey: string | undefined
  if (stream.readBoolean()) {
    nodePrivkey = uint8ArrayToHex(stream.readBytes(32))
  }

  // Canais
  const numChannels = stream.readVarInt()
  const channels: ChannelBackupData[] = []

  for (let i = 0; i < numChannels; i++) {
    const channelLength = stream.readVarInt()
    const channelBytes = stream.readBytes(channelLength)
    channels.push(deserializeChannelBackup(channelBytes))
  }

  return {
    version,
    createdAt,
    nodePrivkey,
    channels,
  }
}

// ==========================================
// ENCRYPTION
// ==========================================

/**
 * Deriva chave de encriptação a partir de senha usando PBKDF2
 */
function deriveEncryptionKey(password: string, salt: Uint8Array): Uint8Array {
  return pbkdf2(sha256, password, salt, {
    c: 100000, // iterations
    dkLen: 32, // 256 bits
  })
}

/**
 * Encripta backup usando AES-256-GCM
 */
export function encryptBackup(data: Uint8Array, password: string): EncryptedBackup {
  // Gerar salt e nonce aleatórios
  const salt = randomBytes(16)
  const nonce = randomBytes(12)

  // Derivar chave
  const key = deriveEncryptionKey(password, salt)

  // Encriptar com AES-GCM
  const aes = gcm(key, nonce)
  const ciphertext = aes.encrypt(data)

  return {
    magic: BACKUP_MAGIC,
    version: CHANNEL_BACKUP_VERSION,
    salt: uint8ArrayToHex(salt),
    nonce: uint8ArrayToHex(nonce),
    ciphertext: uint8ArrayToHex(ciphertext),
    mac: '', // MAC está incluído no ciphertext no AES-GCM
  }
}

/**
 * Decripta backup
 */
export function decryptBackup(encrypted: EncryptedBackup, password: string): Uint8Array {
  if (encrypted.magic !== BACKUP_MAGIC) {
    throw new Error('Invalid backup magic bytes')
  }

  const salt = hexToUint8Array(encrypted.salt)
  const nonce = hexToUint8Array(encrypted.nonce)
  const ciphertext = hexToUint8Array(encrypted.ciphertext)

  // Derivar chave
  const key = deriveEncryptionKey(password, salt)

  // Decriptar com AES-GCM
  const aes = gcm(key, nonce)
  try {
    return aes.decrypt(ciphertext)
  } catch {
    throw new Error('Decryption failed - invalid password or corrupted backup')
  }
}

/**
 * Exporta backup como string encriptada
 */
export function exportEncryptedBackup(backup: FullBackup, password: string): string {
  const serialized = serializeFullBackup(backup)
  const encrypted = encryptBackup(serialized, password)
  return (
    BACKUP_MAGIC +
    JSON.stringify({
      v: encrypted.version,
      s: encrypted.salt,
      n: encrypted.nonce,
      c: encrypted.ciphertext,
    })
  )
}

/**
 * Importa backup de string encriptada
 */
export function importEncryptedBackup(data: string, password: string): FullBackup {
  if (!data.startsWith(BACKUP_MAGIC)) {
    throw new Error('Invalid backup format - missing magic bytes')
  }

  const jsonStr = data.slice(BACKUP_MAGIC.length)
  let parsed: { v: number; s: string; n: string; c: string }

  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('Invalid backup format - malformed JSON')
  }

  const encrypted: EncryptedBackup = {
    magic: BACKUP_MAGIC,
    version: parsed.v,
    salt: parsed.s,
    nonce: parsed.n,
    ciphertext: parsed.c,
    mac: '',
  }

  const decrypted = decryptBackup(encrypted, password)
  return deserializeFullBackup(decrypted)
}

/**
 * Exporta backup de canal único como string encriptada
 * Formato compatível com Electrum: channel_backup:...
 */
export function exportSingleChannelBackup(backup: ChannelBackupData, password: string): string {
  const serialized = serializeChannelBackup(backup)
  const encrypted = encryptBackup(serialized, password)
  return (
    'channel_backup:' +
    JSON.stringify({
      v: encrypted.version,
      s: encrypted.salt,
      n: encrypted.nonce,
      c: encrypted.ciphertext,
    })
  )
}

/**
 * Importa backup de canal único
 */
export function importSingleChannelBackup(data: string, password: string): ChannelBackupData {
  if (!data.startsWith('channel_backup:')) {
    throw new Error('Invalid channel backup format')
  }

  const jsonStr = data.slice(15)
  const parsed = JSON.parse(jsonStr)

  const encrypted: EncryptedBackup = {
    magic: BACKUP_MAGIC,
    version: parsed.v,
    salt: parsed.s,
    nonce: parsed.n,
    ciphertext: parsed.c,
    mac: '',
  }

  const decrypted = decryptBackup(encrypted, password)
  return deserializeChannelBackup(decrypted)
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Deriva Channel ID a partir do funding outpoint
 * Per BOLT #2: channel_id = funding_txid XOR funding_output_index
 */
export function deriveChannelIdFromFunding(fundingTxid: string, outputIndex: number): string {
  const txidBytes = hexToUint8Array(fundingTxid)

  // Reverse para little-endian (como usado no Bitcoin)
  const reversed = new Uint8Array(txidBytes).reverse()

  // XOR com output index nos últimos 2 bytes
  reversed[30] ^= (outputIndex >> 8) & 0xff
  reversed[31] ^= outputIndex & 0xff

  return uint8ArrayToHex(reversed)
}

/**
 * Valida estrutura de backup de canal
 */
export function validateChannelBackup(backup: ChannelBackupData): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Validar campos obrigatórios
  if (!backup.channelId || backup.channelId.length !== 64) {
    errors.push('Invalid channelId')
  }
  if (!backup.nodeId || backup.nodeId.length !== 66) {
    errors.push('Invalid nodeId (must be 33 bytes hex)')
  }
  if (!backup.fundingTxid || backup.fundingTxid.length !== 64) {
    errors.push('Invalid fundingTxid')
  }
  if (backup.fundingOutputIndex < 0 || backup.fundingOutputIndex > 0xffff) {
    errors.push('Invalid fundingOutputIndex')
  }
  if (!backup.channelSeed || backup.channelSeed.length !== 64) {
    errors.push('Invalid channelSeed (must be 32 bytes hex)')
  }
  if (!backup.localPrivkey || backup.localPrivkey.length !== 64) {
    errors.push('Invalid localPrivkey (must be 32 bytes hex)')
  }
  if (!backup.remotePaymentPubkey || backup.remotePaymentPubkey.length !== 66) {
    errors.push('Invalid remotePaymentPubkey')
  }
  if (!backup.remoteRevocationPubkey || backup.remoteRevocationPubkey.length !== 66) {
    errors.push('Invalid remoteRevocationPubkey')
  }
  if (backup.localDelay < 0 || backup.localDelay > 0xffff) {
    errors.push('Invalid localDelay')
  }
  if (backup.remoteDelay < 0 || backup.remoteDelay > 0xffff) {
    errors.push('Invalid remoteDelay')
  }
  if (!backup.host) {
    errors.push('Invalid host')
  }
  if (backup.port < 1 || backup.port > 65535) {
    errors.push('Invalid port')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Gera hash de verificação do backup
 */
export function getBackupChecksum(backup: FullBackup): string {
  const serialized = serializeFullBackup(backup)
  return uint8ArrayToHex(sha256(serialized))
}

/**
 * Calcula endereço Bitcoin a partir de scriptPubKey
 * Suporta P2WSH (usado em canais Lightning)
 */
function scriptPubKeyToAddress(scriptPubKeyHex: string): string {
  const script = hexToUint8Array(scriptPubKeyHex)

  // Check if it's a P2WSH script (OP_0 <32-byte-hash>)
  if (script.length === 34 && script[0] === 0x00 && script[1] === 0x20) {
    // Extract the 32-byte script hash
    const scriptHash = script.slice(2)
    // Convert to bech32 address
    const words = bech32.toWords(scriptHash)
    return bech32.encode('bc', [0, ...words]) // version 0 for P2WSH
  }

  // For other script types, return empty string (not implemented)
  // Could be extended to support P2PKH, P2SH, etc.
  return ''
}

/**
 * Cria backup a partir de dados do canal persistido
 */
export function createBackupFromPersistedChannel(
  channel: {
    channelId: string
    nodeId: string
    fundingTxid?: string
    fundingOutputIndex?: number
    fundingScriptPubKey?: string
    localConfig: {
      toSelfDelay?: number
      paymentBasepoint?: string
    }
    remoteConfig: {
      toSelfDelay?: number
      paymentBasepoint?: string
      revocationBasepoint?: string
    }
    isInitiator?: boolean
    createdAt?: number
  },
  secrets: {
    localPrivkey: string
    channelSeed: string
    multisigFundingPrivkey?: string
  },
  peerInfo: {
    host: string
    port: number
  },
): ChannelBackupData {
  if (!channel.fundingTxid || channel.fundingOutputIndex === undefined) {
    throw new Error('Channel not funded - cannot create backup')
  }

  // Derive actual keys from channel seed
  const channelSeedBytes = hexToUint8Array(secrets.channelSeed)

  // Derive keys using the same method as worker.ts
  const fundingPrivKey = sha256(new Uint8Array([...channelSeedBytes, 0]))
  const paymentBasepointPrivKey = sha256(new Uint8Array([...channelSeedBytes, 1]))

  // Derive public keys from private keys
  const paymentBasepoint = createPublicKey(paymentBasepointPrivKey)

  // Calculate funding address from scriptPubKey if available
  let fundingAddress: string | undefined
  if (channel.fundingScriptPubKey) {
    fundingAddress = scriptPubKeyToAddress(channel.fundingScriptPubKey)
  }

  return {
    channelId: channel.channelId,
    nodeId: channel.nodeId,
    fundingTxid: channel.fundingTxid,
    fundingOutputIndex: channel.fundingOutputIndex,
    channelSeed: secrets.channelSeed, // Keep original seed for reference
    localPrivkey: secrets.localPrivkey,
    multisigFundingPrivkey: uint8ArrayToHex(fundingPrivKey), // Use derived funding key
    isInitiator: channel.isInitiator ?? true,
    localDelay: channel.localConfig.toSelfDelay || 144,
    remoteDelay: channel.remoteConfig.toSelfDelay || 144,
    remotePaymentPubkey: channel.remoteConfig.paymentBasepoint || '',
    remoteRevocationPubkey: channel.remoteConfig.revocationBasepoint || '',
    localPaymentPubkey: uint8ArrayToHex(paymentBasepoint), // Use derived payment pubkey
    host: peerInfo.host,
    port: peerInfo.port,
    createdAt: channel.createdAt || Date.now(),
    fundingAddress,
  }
} // ==========================================
// CHANNEL RESTORE
// ==========================================

/**
 * Estado de restauração do canal
 */
export enum RestoreState {
  PENDING = 'pending', // Aguardando início
  CONNECTING = 'connecting', // Conectando ao peer
  REQUESTING_CLOSE = 'requesting_close', // Solicitando force-close ao peer
  MONITORING = 'monitoring', // Monitorando blockchain
  COMPLETED = 'completed', // Fundos recuperados
  FAILED = 'failed', // Falha na recuperação
}

/**
 * Resultado da restauração
 */
export interface RestoreResult {
  channelId: string
  state: RestoreState
  error?: string
  closingTxid?: string
  sweepTxid?: string
  recoveredAmount?: bigint
}

/**
 * Contexto de restauração do canal
 */
export interface RestoreContext {
  backup: ChannelBackupData
  state: RestoreState
  attempts: number
  lastAttempt?: number
  closingTxid?: string
  error?: string
}

/**
 * Prepara um canal para restauração a partir do backup
 *
 * NOTA: A restauração de canal via SCB requer que:
 * 1. Conectamos ao peer remoto
 * 2. Enviamos channel_reestablish com next_commitment_number = 0
 * 3. O peer detecta que perdemos estado
 * 4. O peer é forçado a fazer force-close (per BOLT #2)
 * 5. Monitoramos a blockchain para varrer nossos fundos
 */
export function prepareChannelRestore(backup: ChannelBackupData): RestoreContext {
  // Validar backup antes de tentar restaurar
  const validation = validateChannelBackup(backup)
  if (!validation.valid) {
    return {
      backup,
      state: RestoreState.FAILED,
      attempts: 0,
      error: `Invalid backup: ${validation.errors.join(', ')}`,
    }
  }

  return {
    backup,
    state: RestoreState.PENDING,
    attempts: 0,
  }
}

/**
 * Gera mensagem channel_reestablish para recuperação
 *
 * Per BOLT #2: Se enviamos next_commitment_number = 0,
 * o peer sabe que perdemos todo o estado e deve fazer force-close.
 *
 * Esta é a mensagem "Data Loss Protect" (DLP).
 */
export function createRestoreReestablishMessage(backup: ChannelBackupData): {
  channelId: Uint8Array
  nextCommitmentNumber: bigint
  nextRevocationNumber: bigint
  yourLastPerCommitmentSecret: Uint8Array
  myCurrentPerCommitmentPoint: Uint8Array
} {
  // Per BOLT #2: Se option_data_loss_protect está ativo,
  // enviamos commitment_number = 0 para indicar perda de dados
  return {
    channelId: hexToUint8Array(backup.channelId),
    nextCommitmentNumber: 0n, // Indica perda total de estado
    nextRevocationNumber: 0n,
    yourLastPerCommitmentSecret: new Uint8Array(32), // Zeros = não temos segredo
    myCurrentPerCommitmentPoint: new Uint8Array(33), // Será preenchido com chave derivada
  }
}

/**
 * Informações necessárias para varrer fundos após force-close
 */
export interface SweepInfo {
  // Outpoint do funding
  fundingTxid: string
  fundingOutputIndex: number

  // Chaves para gastar
  localDelayedPrivkey: string
  revocationPrivkey?: string

  // Parâmetros do script
  toSelfDelay: number
  localPaymentPubkey: string
  remotePaymentPubkey: string
  remoteRevocationPubkey: string
}

/**
 * Prepara informações para sweep após identificar close tx
 *
 * @param backup - Dados do backup
 * @param closingTxid - TXID da transação de fechamento
 * @returns Informações para sweep
 */
export function prepareSweepInfo(backup: ChannelBackupData, closingTxid: string): SweepInfo {
  // TODO: Derivar chaves reais usando channelSeed
  // Por enquanto retornamos placeholder
  return {
    fundingTxid: backup.fundingTxid,
    fundingOutputIndex: backup.fundingOutputIndex,
    localDelayedPrivkey: '', // Derivar de channelSeed
    toSelfDelay: backup.remoteDelay, // Nosso delay (definido pelo remoto)
    localPaymentPubkey: backup.localPaymentPubkey || '',
    remotePaymentPubkey: backup.remotePaymentPubkey,
    remoteRevocationPubkey: backup.remoteRevocationPubkey,
  }
}

/**
 * Verifica se uma transação na blockchain é o fechamento do nosso canal
 */
export function isChannelCloseTransaction(txid: string, backup: ChannelBackupData): boolean {
  // A transação de fechamento gasta o funding outpoint
  // Isso requer verificar os inputs da transação
  // Por ora, apenas placeholder
  return false
}

/**
 * Calcula o endereço de recebimento para sweep
 * Baseado no to_local output da commitment transaction
 */
export function calculateSweepAddress(
  backup: ChannelBackupData,
  _network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
): string {
  // TODO: Implementar cálculo real do endereço
  // O endereço é derivado do to_local script:
  // OP_IF
  //   <revocationpubkey>
  // OP_ELSE
  //   <to_self_delay>
  //   OP_CHECKSEQUENCEVERIFY
  //   OP_DROP
  //   <local_delayedpubkey>
  // OP_ENDIF
  // OP_CHECKSIG

  return `bcrt1q${backup.channelId.slice(0, 40)}` // Placeholder
}

/**
 * Resumo de restauração para UI
 */
export interface RestoreSummary {
  totalChannels: number
  pendingChannels: number
  completedChannels: number
  failedChannels: number
  totalRecovered: bigint
  contexts: RestoreContext[]
}

/**
 * Cria resumo de restauração a partir de múltiplos contextos
 */
export function createRestoreSummary(contexts: RestoreContext[]): RestoreSummary {
  return {
    totalChannels: contexts.length,
    pendingChannels: contexts.filter(
      c => c.state === RestoreState.PENDING || c.state === RestoreState.CONNECTING,
    ).length,
    completedChannels: contexts.filter(c => c.state === RestoreState.COMPLETED).length,
    failedChannels: contexts.filter(c => c.state === RestoreState.FAILED).length,
    totalRecovered: 0n, // Calculado após sweep
    contexts,
  }
}
