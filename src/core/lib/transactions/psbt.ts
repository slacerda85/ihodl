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
    // Should return a Transaction object, placeholder
    const txData = this.globalMap.get(PSBT_GLOBAL_TYPES.UNSIGNED_TX)
    if (!txData) return null
    // Parse transaction from txData
    // Placeholder: return parsed transaction
    return null
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
   * Combine with another PSBT.
   */
  combine(other: PartialTransaction): void {
    // Merge global maps (simple merge, assuming no conflicts)
    for (const [key, value] of other.globalMap) {
      this.globalMap.set(key, value)
    }

    // Merge inputs
    for (let i = 0; i < Math.max(this.inputs.length, other.inputs.length); i++) {
      if (i >= this.inputs.length) {
        this.inputs.push(other.inputs[i])
      } else if (i < other.inputs.length) {
        this.mergeInput(this.inputs[i], other.inputs[i])
      }
    }

    // Merge outputs
    for (let i = 0; i < Math.max(this.outputs.length, other.outputs.length); i++) {
      if (i >= this.outputs.length) {
        this.outputs.push(other.outputs[i])
      } else if (i < other.outputs.length) {
        this.mergeOutput(this.outputs[i], other.outputs[i])
      }
    }
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
