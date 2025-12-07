/**
 * PSBT (Partially Signed Bitcoin Transactions) implementation for ihodl.
 * Based on BIP-174, inspired by Electrum's PartialTransaction.
 */

import { uint8ArrayToHex, hexToUint8Array } from '@/core/lib/utils'

// PSBT Global Types
export const PSBT_GLOBAL_TYPES = {
  UNSIGNED_TX: 0x00,
  XPUB: 0x01,
  TX_MODIFIABLE: 0x02,
  VERSION: 0xfb,
} as const

// PSBT Input Types
export const PSBT_IN_TYPES = {
  NON_WITNESS_UTXO: 0x00,
  WITNESS_UTXO: 0x01,
  PARTIAL_SIG: 0x02,
  SIGHASH_TYPE: 0x03,
  REDEEM_SCRIPT: 0x04,
  WITNESS_SCRIPT: 0x05,
  BIP32_DERIVATION: 0x06,
  FINAL_SCRIPTSIG: 0x07,
  FINAL_SCRIPTWITNESS: 0x08,
  POR_COMMITMENT: 0x09,
  RIPEMD160: 0x0a,
  SHA256: 0x0b,
  HASH160: 0x0c,
  HASH256: 0x0d,
  TXID: 0x0e,
  TXMOD_TXID: 0x0f,
} as const

// PSBT Output Types
export const PSBT_OUT_TYPES = {
  REDEEM_SCRIPT: 0x00,
  WITNESS_SCRIPT: 0x01,
  BIP32_DERIVATION: 0x02,
  TXID: 0x0e,
  TXMOD_TXID: 0x0f,
} as const

/**
 * Key Origin Info for PSBT, representing BIP-32 derivation path and fingerprint.
 */
export class KeyOriginInfo {
  constructor(
    public fingerprint: number,
    public path: number[],
  ) {}

  /**
   * Serialize to bytes for PSBT.
   */
  serialize(): Uint8Array {
    const buffer = new Uint8Array(4 + this.path.length * 4)
    const view = new DataView(buffer.buffer)
    view.setUint32(0, this.fingerprint, false) // big-endian
    for (let i = 0; i < this.path.length; i++) {
      view.setUint32(4 + i * 4, this.path[i], false)
    }
    return buffer
  }

  /**
   * Deserialize from bytes.
   */
  static deserialize(data: Uint8Array): KeyOriginInfo {
    if (data.length < 4 || (data.length - 4) % 4 !== 0) {
      throw new Error('Invalid KeyOriginInfo data')
    }
    const view = new DataView(data.buffer)
    const fingerprint = view.getUint32(0, false)
    const path: number[] = []
    for (let i = 4; i < data.length; i += 4) {
      path.push(view.getUint32(i, false))
    }
    return new KeyOriginInfo(fingerprint, path)
  }
}

/**
 * PSBT Input structure.
 */
export interface PsbtInput {
  nonWitnessUtxo?: Uint8Array
  witnessUtxo?: { script: Uint8Array; amount: bigint }
  partialSig?: Map<Uint8Array, Uint8Array> // pubkey -> signature
  sighashType?: number
  redeemScript?: Uint8Array
  witnessScript?: Uint8Array
  bip32Derivation?: Map<Uint8Array, KeyOriginInfo> // pubkey -> origin
  finalScriptSig?: Uint8Array
  finalScriptWitness?: Uint8Array
}

/**
 * PSBT Output structure.
 */
export interface PsbtOutput {
  redeemScript?: Uint8Array
  witnessScript?: Uint8Array
  bip32Derivation?: Map<Uint8Array, KeyOriginInfo>
}

/**
 * PartialTransaction class for handling PSBT.
 */
export class PartialTransaction {
  public globalMap: Map<number, Uint8Array> = new Map()
  public inputs: PsbtInput[] = []
  public outputs: PsbtOutput[] = []

  constructor(psbtHex?: string) {
    if (psbtHex) {
      this.deserialize(psbtHex)
    }
  }

  /**
   * Deserialize PSBT from hex string.
   */
  deserialize(psbtHex: string): void {
    const data = hexToUint8Array(psbtHex)
    let offset = 0

    // Magic bytes
    if (data.length < 5 || uint8ArrayToHex(data.subarray(0, 5)) !== '70736274ff') {
      throw new Error('Invalid PSBT magic bytes')
    }
    offset += 5

    // Global map
    const globalMap = this.parseKeyValueMap(data, offset)
    offset = globalMap.newOffset
    this.globalMap = globalMap.map

    // Inputs
    const inputCount = this.getUnsignedTx()?.inputs.length || 0
    for (let i = 0; i < inputCount; i++) {
      const inputMap = this.parseKeyValueMap(data, offset)
      offset = inputMap.newOffset
      this.inputs.push(this.parseInputMap(inputMap.map))
    }

    // Outputs
    const outputCount = this.getUnsignedTx()?.outputs.length || 0
    for (let i = 0; i < outputCount; i++) {
      const outputMap = this.parseKeyValueMap(data, offset)
      offset = outputMap.newOffset
      this.outputs.push(this.parseOutputMap(outputMap.map))
    }

    if (offset !== data.length) {
      throw new Error('Extra data after PSBT')
    }
  }

  /**
   * Serialize PSBT to hex string.
   */
  serialize(): string {
    const parts: Uint8Array[] = []

    // Magic bytes
    parts.push(hexToUint8Array('70736274ff'))

    // Global map
    parts.push(this.serializeKeyValueMap(this.globalMap))

    // Inputs
    for (const input of this.inputs) {
      parts.push(this.serializeKeyValueMap(this.serializeInputMap(input)))
    }

    // Outputs
    for (const output of this.outputs) {
      parts.push(this.serializeKeyValueMap(this.serializeOutputMap(output)))
    }

    // Combine all
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const part of parts) {
      result.set(part, offset)
      offset += part.length
    }

    return uint8ArrayToHex(result)
  }

  /**
   * Get the unsigned transaction from global map.
   */
  getUnsignedTx(): any {
    const txData = this.globalMap.get(PSBT_GLOBAL_TYPES.UNSIGNED_TX)
    if (!txData) return null

    // Parse the raw transaction bytes
    return this.parseUnsignedTransaction(txData)
  }

  private parseUnsignedTransaction(txData: Uint8Array): any {
    let offset = 0

    // Version (4 bytes, little endian)
    if (offset + 4 > txData.length) throw new Error('Invalid transaction: missing version')
    const version = new DataView(txData.buffer, txData.byteOffset + offset, 4).getUint32(0, true)
    offset += 4

    // Check for SegWit marker
    let isSegWit = false
    if (offset + 2 <= txData.length && txData[offset] === 0x00 && txData[offset + 1] === 0x01) {
      isSegWit = true
      offset += 2 // Skip marker and flag
    }

    // Input count (varint)
    const inputCountResult = this.readCompactSize(txData, offset)
    const inputCount = inputCountResult.size
    offset = inputCountResult.newOffset

    // Parse inputs
    const inputs = []
    for (let i = 0; i < inputCount; i++) {
      if (offset + 36 > txData.length) throw new Error(`Invalid transaction: input ${i} too short`)

      // Previous txid (32 bytes, reverse for display)
      const txid = uint8ArrayToHex(txData.subarray(offset, offset + 32).reverse())
      offset += 32

      // Previous vout (4 bytes, little endian)
      const vout = new DataView(txData.buffer, txData.byteOffset + offset, 4).getUint32(0, true)
      offset += 4

      // ScriptSig length (varint)
      const scriptSigLenResult = this.readCompactSize(txData, offset)
      const scriptSigLen = scriptSigLenResult.size
      offset = scriptSigLenResult.newOffset

      if (offset + scriptSigLen > txData.length)
        throw new Error(`Invalid transaction: input ${i} scriptSig too short`)
      const scriptSig = txData.subarray(offset, offset + scriptSigLen)
      offset += scriptSigLen

      // Sequence (4 bytes, little endian)
      if (offset + 4 > txData.length)
        throw new Error(`Invalid transaction: input ${i} missing sequence`)
      const sequence = new DataView(txData.buffer, txData.byteOffset + offset, 4).getUint32(0, true)
      offset += 4

      inputs.push({ txid, vout, scriptSig, sequence })
    }

    // Output count (varint)
    const outputCountResult = this.readCompactSize(txData, offset)
    const outputCount = outputCountResult.size
    offset = outputCountResult.newOffset

    // Parse outputs
    const outputs = []
    for (let i = 0; i < outputCount; i++) {
      if (offset + 8 > txData.length) throw new Error(`Invalid transaction: output ${i} too short`)

      // Value (8 bytes, little endian)
      const value = Number(
        new DataView(txData.buffer, txData.byteOffset + offset, 8).getBigUint64(0, true),
      )
      offset += 8

      // ScriptPubKey length (varint)
      const scriptPubKeyLenResult = this.readCompactSize(txData, offset)
      const scriptPubKeyLen = scriptPubKeyLenResult.size
      offset = scriptPubKeyLenResult.newOffset

      if (offset + scriptPubKeyLen > txData.length)
        throw new Error(`Invalid transaction: output ${i} scriptPubKey too short`)
      const scriptPubKey = txData.subarray(offset, offset + scriptPubKeyLen)
      offset += scriptPubKeyLen

      outputs.push({ value, scriptPubKey })
    }

    // Skip witnesses if present (they shouldn't be in unsigned tx)
    if (isSegWit) {
      for (let i = 0; i < inputCount; i++) {
        if (offset >= txData.length) break
        const witnessLenResult = this.readCompactSize(txData, offset)
        offset = witnessLenResult.newOffset
        for (let j = 0; j < witnessLenResult.size; j++) {
          const itemLenResult = this.readCompactSize(txData, offset)
          offset = itemLenResult.newOffset + itemLenResult.size
        }
      }
    }

    // Locktime (4 bytes, little endian)
    if (offset + 4 > txData.length) throw new Error('Invalid transaction: missing locktime')
    const locktime = new DataView(txData.buffer, txData.byteOffset + offset, 4).getUint32(0, true)
    offset += 4

    if (offset !== txData.length) throw new Error('Invalid transaction: extra data after locktime')

    return { version, inputs, outputs, locktime }
  }

  /**
   * Add a signature to an input.
   */
  addSignature(inputIndex: number, pubkey: Uint8Array, signature: Uint8Array): void {
    if (inputIndex >= this.inputs.length) {
      throw new Error('Input index out of range')
    }
    const input = this.inputs[inputIndex]
    if (!input.partialSig) {
      input.partialSig = new Map()
    }
    input.partialSig.set(pubkey, signature)
  }

  /**
   * Finalize the PSBT by moving partial signatures to final fields.
   * This prepares the PSBT for extraction of the final transaction.
   */
  finalize(): void {
    for (let i = 0; i < this.inputs.length; i++) {
      this.finalizeInput(i)
    }
  }

  /**
   * Finalize a specific input by moving partial signatures to final fields.
   */
  private finalizeInput(inputIndex: number): void {
    const input = this.inputs[inputIndex]
    if (!input.partialSig || input.partialSig.size === 0) {
      throw new Error(`Input ${inputIndex} has no partial signatures to finalize`)
    }

    // For P2WPKH, P2TR key path spend, and other single-sig scenarios
    // We'll use the first available signature
    const [pubkey, signature] = input.partialSig.entries().next().value

    // Determine the script type and create appropriate final scripts
    if (input.witnessScript) {
      // P2WSH or P2SH-P2WSH
      this.finalizeWitnessInput(input, pubkey, signature)
    } else if (input.redeemScript) {
      // P2SH
      this.finalizeScriptSigInput(input, pubkey, signature)
    } else {
      // P2WPKH, P2PKH, or P2TR key path spend
      this.finalizeSimpleInput(input, pubkey, signature)
    }
  }

  private finalizeWitnessInput(input: PsbtInput, pubkey: Uint8Array, signature: Uint8Array): void {
    // For witness inputs, set the final script witness
    input.finalScriptWitness = this.createWitness(signature, pubkey)
  }

  private finalizeScriptSigInput(
    input: PsbtInput,
    pubkey: Uint8Array,
    signature: Uint8Array,
  ): void {
    // For P2SH inputs, set the final script sig
    // This is a simplified implementation - full implementation would handle various script types
    const scriptSig = this.createScriptSig(signature, pubkey)
    input.finalScriptSig = scriptSig
  }

  private finalizeSimpleInput(input: PsbtInput, pubkey: Uint8Array, signature: Uint8Array): void {
    // For simple inputs (P2WPKH, P2TR key spend)
    if (input.witnessUtxo) {
      // SegWit input
      input.finalScriptWitness = this.createWitness(signature, pubkey)
    } else {
      // Legacy input
      input.finalScriptSig = this.createScriptSig(signature, pubkey)
    }
  }

  private createWitness(signature: Uint8Array, pubkey: Uint8Array): Uint8Array {
    // Create witness stack: [signature, pubkey]
    const witnessItems = [signature, pubkey]
    return this.serializeWitness(witnessItems)
  }

  private createScriptSig(signature: Uint8Array, pubkey: Uint8Array): Uint8Array {
    // Create script sig for P2PKH: [signature, pubkey]
    const scriptSigItems = [signature, pubkey]
    return this.serializeScript(scriptSigItems)
  }

  private serializeWitness(items: Uint8Array[]): Uint8Array {
    const parts: Uint8Array[] = []
    // Witness stack size
    parts.push(this.writeCompactSize(items.length))
    // Witness items
    for (const item of items) {
      parts.push(this.writeCompactSize(item.length))
      parts.push(item)
    }
    return this.concatUint8Arrays(parts)
  }

  private serializeScript(items: Uint8Array[]): Uint8Array {
    const parts: Uint8Array[] = []
    for (const item of items) {
      parts.push(this.writeCompactSize(item.length))
      parts.push(item)
    }
    return this.concatUint8Arrays(parts)
  }

  private concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const arr of arrays) {
      result.set(arr, offset)
      offset += arr.length
    }
    return result
  }

  /**
   * Extract the final signed transaction from the finalized PSBT.
   * @returns Hex-encoded final transaction
   */
  extractTransaction(): string {
    // Get the unsigned transaction
    const unsignedTx = this.getUnsignedTx()
    if (!unsignedTx) {
      throw new Error('No unsigned transaction in PSBT')
    }

    // Create the final transaction by combining unsigned tx with final scripts
    const finalTx = this.buildFinalTransaction(unsignedTx)
    return finalTx
  }

  private buildFinalTransaction(unsignedTx: any): string {
    // The unsignedTx should be a SimpleTransaction-like object
    // We need to create a final transaction with the scripts from PSBT inputs

    const finalTx: any = {
      version: unsignedTx.version || 2,
      inputs: [],
      outputs: unsignedTx.outputs || [],
      locktime: unsignedTx.locktime || 0,
      witnesses: [],
    }

    // Process each input
    for (let i = 0; i < this.inputs.length; i++) {
      const psbtInput = this.inputs[i]
      const unsignedInput = unsignedTx.inputs[i]

      const finalInput = {
        txid: unsignedInput.txid,
        vout: unsignedInput.vout,
        scriptSig: psbtInput.finalScriptSig || new Uint8Array(0),
        sequence: unsignedInput.sequence,
      }

      finalTx.inputs.push(finalInput)

      // Handle witnesses
      if (psbtInput.finalScriptWitness) {
        // Parse the witness data
        const witness = this.parseWitness(psbtInput.finalScriptWitness)
        finalTx.witnesses.push(witness)
      } else {
        finalTx.witnesses.push([]) // Empty witness for non-SegWit
      }
    }

    // Serialize the final transaction
    const txBytes = this.serializeFinalTransaction(finalTx)
    return uint8ArrayToHex(txBytes)
  }

  private parseWitness(witnessData: Uint8Array): Uint8Array[] {
    const witness: Uint8Array[] = []
    let offset = 0

    // Witness stack size
    const stackSizeResult = this.readCompactSize(witnessData, offset)
    const stackSize = stackSizeResult.size
    offset = stackSizeResult.newOffset

    // Parse witness items
    for (let i = 0; i < stackSize; i++) {
      const itemLenResult = this.readCompactSize(witnessData, offset)
      const itemLen = itemLenResult.size
      offset = itemLenResult.newOffset

      const item = witnessData.subarray(offset, offset + itemLen)
      offset += itemLen
      witness.push(item)
    }

    return witness
  }

  private serializeFinalTransaction(tx: any): Uint8Array {
    const parts: Uint8Array[] = []

    // Version (4 bytes, little endian)
    const versionBytes = new Uint8Array(4)
    new DataView(versionBytes.buffer).setUint32(0, tx.version, true)
    parts.push(versionBytes)

    // Check if we have any witnesses
    const hasWitnesses = tx.witnesses.some((w: Uint8Array[]) => w.length > 0)

    if (hasWitnesses) {
      // SegWit marker (0x00) and flag (0x01)
      parts.push(new Uint8Array([0x00, 0x01]))
    }

    // Input count (varint)
    parts.push(this.writeCompactSize(tx.inputs.length))

    // Inputs
    for (const input of tx.inputs) {
      // Previous txid (32 bytes, little endian)
      parts.push(hexToUint8Array(input.txid).reverse())

      // Previous vout (4 bytes, little endian)
      const voutBytes = new Uint8Array(4)
      new DataView(voutBytes.buffer).setUint32(0, input.vout, true)
      parts.push(voutBytes)

      // ScriptSig length (varint)
      parts.push(this.writeCompactSize(input.scriptSig.length))

      // ScriptSig
      parts.push(input.scriptSig)

      // Sequence (4 bytes, little endian)
      const sequenceBytes = new Uint8Array(4)
      new DataView(sequenceBytes.buffer).setUint32(0, input.sequence, true)
      parts.push(sequenceBytes)
    }

    // Output count (varint)
    parts.push(this.writeCompactSize(tx.outputs.length))

    // Outputs
    for (const output of tx.outputs) {
      // Value (8 bytes, little endian)
      const valueBytes = new Uint8Array(8)
      new DataView(valueBytes.buffer).setBigUint64(0, BigInt(output.value), true)
      parts.push(valueBytes)

      // ScriptPubKey length (varint)
      parts.push(this.writeCompactSize(output.scriptPubKey.length))

      // ScriptPubKey
      parts.push(output.scriptPubKey)
    }

    // Witnesses (for SegWit)
    if (hasWitnesses) {
      for (const witness of tx.witnesses) {
        if (witness.length > 0) {
          parts.push(this.writeCompactSize(witness.length))
          for (const item of witness) {
            parts.push(this.writeCompactSize(item.length))
            parts.push(item)
          }
        } else {
          parts.push(new Uint8Array([0])) // Empty witness
        }
      }
    }

    // Locktime (4 bytes, little endian)
    const locktimeBytes = new Uint8Array(4)
    new DataView(locktimeBytes.buffer).setUint32(0, tx.locktime, true)
    parts.push(locktimeBytes)

    // Combine all parts
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const part of parts) {
      result.set(part, offset)
      offset += part.length
    }

    return result
  }

  private parseKeyValueMap(
    data: Uint8Array,
    startOffset: number,
  ): { map: Map<number, Uint8Array>; newOffset: number } {
    const map = new Map<number, Uint8Array>()
    let offset = startOffset

    while (offset < data.length) {
      const keyLenResult = this.readCompactSize(data, offset)
      const keyLen = keyLenResult.size
      offset = keyLenResult.newOffset

      if (keyLen === 0) break // Separator

      const key = data.subarray(offset, offset + keyLen)
      offset += keyLen

      const valueLenResult = this.readCompactSize(data, offset)
      const valueLen = valueLenResult.size
      offset = valueLenResult.newOffset

      const value = data.subarray(offset, offset + valueLen)
      offset += valueLen

      const keyType = key[0]
      const keyData = key.subarray(1)
      map.set(keyType, keyData.length > 0 ? keyData : value) // For global types, value is after key
    }

    return { map, newOffset: offset }
  }

  private serializeKeyValueMap(map: Map<number, Uint8Array>): Uint8Array {
    const parts: Uint8Array[] = []

    for (const [keyType, value] of map) {
      const key = new Uint8Array([keyType])
      parts.push(this.writeCompactSize(key.length))
      parts.push(key)
      parts.push(this.writeCompactSize(value.length))
      parts.push(value)
    }

    // Separator
    parts.push(new Uint8Array([0x00]))

    const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const part of parts) {
      result.set(part, offset)
      offset += part.length
    }

    return result
  }

  private parseInputMap(map: Map<number, Uint8Array>): PsbtInput {
    const input: PsbtInput = {}

    for (const [type, data] of map) {
      switch (type) {
        case PSBT_IN_TYPES.NON_WITNESS_UTXO:
          input.nonWitnessUtxo = data
          break
        case PSBT_IN_TYPES.WITNESS_UTXO:
          // Parse script and amount (8 bytes amount + script)
          if (data.length < 9) throw new Error('Invalid witness UTXO data')
          const amount = new DataView(data.buffer, data.byteOffset, 8).getBigUint64(0, true)
          const script = data.subarray(8)
          input.witnessUtxo = { script, amount }
          break
        case PSBT_IN_TYPES.PARTIAL_SIG:
          // data is pubkey + sig
          if (data.length < 33) throw new Error('Invalid partial sig data')
          const pubkey = data.subarray(0, 33)
          const sig = data.subarray(33)
          if (!input.partialSig) input.partialSig = new Map()
          input.partialSig.set(pubkey, sig)
          break
        case PSBT_IN_TYPES.SIGHASH_TYPE:
          if (data.length !== 4) throw new Error('Invalid sighash type')
          input.sighashType = new DataView(data.buffer, data.byteOffset).getUint32(0, true)
          break
        case PSBT_IN_TYPES.REDEEM_SCRIPT:
          input.redeemScript = data
          break
        case PSBT_IN_TYPES.WITNESS_SCRIPT:
          input.witnessScript = data
          break
        case PSBT_IN_TYPES.BIP32_DERIVATION:
          // data is pubkey (33 bytes) + KeyOriginInfo
          if (data.length < 33) throw new Error('Invalid BIP32 derivation data')
          const derPubkey = data.subarray(0, 33)
          const originData = data.subarray(33)
          const origin = KeyOriginInfo.deserialize(originData)
          if (!input.bip32Derivation) input.bip32Derivation = new Map()
          input.bip32Derivation.set(derPubkey, origin)
          break
        case PSBT_IN_TYPES.FINAL_SCRIPTSIG:
          input.finalScriptSig = data
          break
        case PSBT_IN_TYPES.FINAL_SCRIPTWITNESS:
          input.finalScriptWitness = data
          break
        // Add other types as needed
      }
    }

    return input
  }

  private serializeInputMap(input: PsbtInput): Map<number, Uint8Array> {
    const map = new Map<number, Uint8Array>()

    if (input.nonWitnessUtxo) {
      map.set(PSBT_IN_TYPES.NON_WITNESS_UTXO, input.nonWitnessUtxo)
    }

    if (input.witnessUtxo) {
      const amountBuffer = new Uint8Array(8)
      new DataView(amountBuffer.buffer).setBigUint64(0, input.witnessUtxo.amount, true)
      const data = new Uint8Array(amountBuffer.length + input.witnessUtxo.script.length)
      data.set(amountBuffer)
      data.set(input.witnessUtxo.script, amountBuffer.length)
      map.set(PSBT_IN_TYPES.WITNESS_UTXO, data)
    }

    if (input.partialSig) {
      for (const [pubkey, sig] of input.partialSig) {
        const data = new Uint8Array(pubkey.length + sig.length)
        data.set(pubkey)
        data.set(sig, pubkey.length)
        map.set(PSBT_IN_TYPES.PARTIAL_SIG, data)
      }
    }

    if (input.sighashType !== undefined) {
      const data = new Uint8Array(4)
      new DataView(data.buffer).setUint32(0, input.sighashType, true)
      map.set(PSBT_IN_TYPES.SIGHASH_TYPE, data)
    }

    if (input.redeemScript) {
      map.set(PSBT_IN_TYPES.REDEEM_SCRIPT, input.redeemScript)
    }

    if (input.witnessScript) {
      map.set(PSBT_IN_TYPES.WITNESS_SCRIPT, input.witnessScript)
    }

    if (input.bip32Derivation) {
      for (const [pubkey, origin] of input.bip32Derivation) {
        const originData = origin.serialize()
        const data = new Uint8Array(pubkey.length + originData.length)
        data.set(pubkey)
        data.set(originData, pubkey.length)
        map.set(PSBT_IN_TYPES.BIP32_DERIVATION, data)
      }
    }

    if (input.finalScriptSig) {
      map.set(PSBT_IN_TYPES.FINAL_SCRIPTSIG, input.finalScriptSig)
    }

    if (input.finalScriptWitness) {
      map.set(PSBT_IN_TYPES.FINAL_SCRIPTWITNESS, input.finalScriptWitness)
    }

    return map
  }

  private parseOutputMap(map: Map<number, Uint8Array>): PsbtOutput {
    const output: PsbtOutput = {}

    for (const [type, data] of map) {
      switch (type) {
        case PSBT_OUT_TYPES.REDEEM_SCRIPT:
          output.redeemScript = data
          break
        case PSBT_OUT_TYPES.WITNESS_SCRIPT:
          output.witnessScript = data
          break
        case PSBT_OUT_TYPES.BIP32_DERIVATION:
          // Similar to input
          if (data.length < 33) throw new Error('Invalid BIP32 derivation data')
          const derPubkey = data.subarray(0, 33)
          const originData = data.subarray(33)
          const origin = KeyOriginInfo.deserialize(originData)
          if (!output.bip32Derivation) output.bip32Derivation = new Map()
          output.bip32Derivation.set(derPubkey, origin)
          break
        // Add other types as needed
      }
    }

    return output
  }

  private serializeOutputMap(output: PsbtOutput): Map<number, Uint8Array> {
    const map = new Map<number, Uint8Array>()

    if (output.redeemScript) {
      map.set(PSBT_OUT_TYPES.REDEEM_SCRIPT, output.redeemScript)
    }

    if (output.witnessScript) {
      map.set(PSBT_OUT_TYPES.WITNESS_SCRIPT, output.witnessScript)
    }

    if (output.bip32Derivation) {
      for (const [pubkey, origin] of output.bip32Derivation) {
        const originData = origin.serialize()
        const data = new Uint8Array(pubkey.length + originData.length)
        data.set(pubkey)
        data.set(originData, pubkey.length)
        map.set(PSBT_OUT_TYPES.BIP32_DERIVATION, data)
      }
    }

    return map
  }

  private mergeInput(target: PsbtInput, source: PsbtInput): void {
    // Merge non-witness UTXO
    if (source.nonWitnessUtxo && !target.nonWitnessUtxo) {
      target.nonWitnessUtxo = source.nonWitnessUtxo
    }

    // Merge witness UTXO
    if (source.witnessUtxo && !target.witnessUtxo) {
      target.witnessUtxo = source.witnessUtxo
    }

    // Merge partial signatures
    if (source.partialSig) {
      if (!target.partialSig) target.partialSig = new Map()
      for (const [pubkey, sig] of source.partialSig) {
        target.partialSig.set(pubkey, sig)
      }
    }

    // Merge BIP32 derivations
    if (source.bip32Derivation) {
      if (!target.bip32Derivation) target.bip32Derivation = new Map()
      for (const [pubkey, origin] of source.bip32Derivation) {
        target.bip32Derivation.set(pubkey, origin)
      }
    }

    // Other fields can be merged similarly if needed
  }

  private mergeOutput(target: PsbtOutput, source: PsbtOutput): void {
    // Similar to input
    if (source.bip32Derivation) {
      if (!target.bip32Derivation) target.bip32Derivation = new Map()
      for (const [pubkey, origin] of source.bip32Derivation) {
        target.bip32Derivation.set(pubkey, origin)
      }
    }
  }

  private readCompactSize(data: Uint8Array, offset: number): { size: number; newOffset: number } {
    if (offset >= data.length) {
      throw new Error('Unexpected end of data')
    }
    const first = data[offset]
    if (first < 0xfd) {
      return { size: first, newOffset: offset + 1 }
    } else if (first === 0xfd) {
      if (offset + 3 > data.length) throw new Error('Unexpected end of data')
      const view = new DataView(data.buffer, data.byteOffset + offset + 1, 2)
      return { size: view.getUint16(0, true), newOffset: offset + 3 }
    } else if (first === 0xfe) {
      if (offset + 5 > data.length) throw new Error('Unexpected end of data')
      const view = new DataView(data.buffer, data.byteOffset + offset + 1, 4)
      return { size: view.getUint32(0, true), newOffset: offset + 5 }
    } else if (first === 0xff) {
      if (offset + 9 > data.length) throw new Error('Unexpected end of data')
      const view = new DataView(data.buffer, data.byteOffset + offset + 1, 8)
      return { size: Number(view.getBigUint64(0, true)), newOffset: offset + 9 }
    }
    throw new Error('Invalid compact size')
  }

  private writeCompactSize(size: number): Uint8Array {
    if (size < 0xfd) {
      return new Uint8Array([size])
    } else if (size <= 0xffff) {
      const buffer = new Uint8Array(3)
      buffer[0] = 0xfd
      const view = new DataView(buffer.buffer, 1, 2)
      view.setUint16(0, size, true)
      return buffer
    } else if (size <= 0xffffffff) {
      const buffer = new Uint8Array(5)
      buffer[0] = 0xfe
      const view = new DataView(buffer.buffer, 1, 4)
      view.setUint32(0, size, true)
      return buffer
    } else {
      const buffer = new Uint8Array(9)
      buffer[0] = 0xff
      const view = new DataView(buffer.buffer, 1, 8)
      view.setBigUint64(0, BigInt(size), true)
      return buffer
    }
  }
}
