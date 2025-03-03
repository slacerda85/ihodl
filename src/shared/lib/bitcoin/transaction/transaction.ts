interface Input {
  previousTransactionHash: Buffer
  previousTransactionOutputIndex: Buffer
  scriptSig: Buffer // Renomeado de 'signatureScriptBytes' para clareza
  sequence?: Buffer
  witness?: Buffer[] // Adicionado para SegWit transactions
}

interface Output {
  value: Buffer
  outputScript: Buffer // Combina length e script
}

export default class Transaction {
  readonly #version = Buffer.from([0x02, 0x00, 0x00, 0x00]) // Versão 2 para compatibilidade SegWit
  readonly #locktime = Buffer.from([0x00, 0x00, 0x00, 0x00])
  readonly #inputSequence = Buffer.from([0xff, 0xff, 0xff, 0xff])

  #numberOfInputs: Buffer
  #inputs: Buffer
  #numberOfOutputs: Buffer
  #outputs: Buffer
  #witnesses: Buffer[] = [] // Armazena os dados de testemunha (witness)

  #transactionBytes: Buffer
  #serialized: string

  constructor(inputs: Input[], outputs: Output[]) {
    // Check if there's at least one SegWit input
    const hasSegWitInput = inputs.some(input => input.witness)

    // calculate number of inputs and outputs
    this.#numberOfInputs = Buffer.alloc(1)
    this.#numberOfInputs.writeUInt8(inputs.length)
    this.#numberOfOutputs = Buffer.alloc(1)
    this.#numberOfOutputs.writeUInt8(outputs.length)

    // Convert inputs to bytes
    this.#inputs = Buffer.concat(
      inputs.map(input => {
        const scriptSigLength = Buffer.alloc(1, input.scriptSig ? input.scriptSig.length : 0)
        return Buffer.concat([
          input.previousTransactionHash,
          input.previousTransactionOutputIndex,
          scriptSigLength,
          input.scriptSig || Buffer.alloc(0), // scriptSig pode ser vazio em SegWit
          input.sequence || this.#inputSequence,
        ])
      }),
    )

    // Convert outputs to bytes
    this.#outputs = Buffer.concat(
      outputs.map(output => {
        const scriptLength = Buffer.alloc(1, output.outputScript.length)
        return Buffer.concat([output.value, scriptLength, output.outputScript])
      }),
    )

    // Handle SegWit serialization
    if (hasSegWitInput) {
      // Segregated Witness format
      this.#witnesses = inputs.map(input =>
        input.witness
          ? Buffer.concat([Buffer.from([input.witness.length]), ...input.witness])
          : Buffer.alloc(0),
      )

      // Transaction format with SegWit marker and flag
      this.#transactionBytes = Buffer.concat([
        this.#version,
        Buffer.from([0x00, 0x01]), // SegWit marker and flag
        this.#numberOfInputs,
        this.#inputs,
        this.#numberOfOutputs,
        this.#outputs,
        ...this.#witnesses, // Adicionar dados de testemunha
        this.#locktime,
      ])
    } else {
      // Legacy transaction format
      this.#transactionBytes = Buffer.concat([
        this.#version,
        this.#numberOfInputs,
        this.#inputs,
        this.#numberOfOutputs,
        this.#outputs,
        this.#locktime,
      ])
    }

    // Serialize transaction
    this.#serialized = this.#transactionBytes.toString('hex')
  }

  get serialized() {
    return this.#serialized
  }
}
