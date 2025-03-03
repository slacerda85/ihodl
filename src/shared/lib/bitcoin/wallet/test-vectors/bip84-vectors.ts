import { TestVector } from './test-vector'

// BIP84 test vectors
const bip84Vector: TestVector = {
  mnemonic:
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  chains: {
    m: {
      pubKey:
        'zpub6jftahH18ngZxLmXaKw3GSZzZsszmt9WqedkyZdezFtWRFBZqsQH5hyUmb4pCEeZGmVfQuP5bedXTB8is6fTv19U1GQRyQUKQGUTzyHACMF',
      privKey:
        'zprvAWgYBBk7JR8Gjrh4UJQ2uJdG1r3WNRRfURiABBE3RvMXYSrRJL62XuezvGdPvG6GFBZduosCc1YP5wixPox7zhZLfiUm8aunE96BBa4Kei5',
    },
    // account 0, root = "m/84'/0'/0'"
    "m/84'/0'/0'": {
      pubKey:
        'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs',
      privKey:
        'zprvAdG4iTXWBoARxkkzNpNh8r6Qag3irQB8PzEMkAFeTRXxHpbF9z4QgEvBRmfvqWvGp42t42nvgGpNgYSJA9iefm1yYNZKEm7z6qUWCroSQnE',
    },
    // Account 0, first receiving address = m/84'/0'/0'/0/0
    "m/84'/0'/0'/0/0": {
      pubKey: '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c',
      privKey: 'KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d',
      address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    },
    // Account 0, second receiving address = m/84'/0'/0'/0/1
    "m/84'/0'/0'/0/1": {
      pubKey: '03e775fd51f0dfb8cd865d9ff1cca2a158cf651fe997fdc9fee9c1d3b5e995ea77',
      privKey: 'Kxpf5b8p3qX56DKEe5NqWbNUP9MnqoRFzZwHRtsFqhzuvUJsYZCy',
      address: 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g',
    },
    // Account 0, first change address = m/84'/0'/0'/1/0
    "m/84'/0'/0'/1/0": {
      pubKey: '03025324888e429ab8e3dbaf1f7802648b9cd01e9b418485c5fa4c1b9b5700e1a6',
      privKey: 'KxuoxufJL5csa1Wieb2kp29VNdn92Us8CoaUG3aGtPtcF3AzeXvF',
      address: 'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el',
    },
  },
}

const bip84Vectors = [bip84Vector]

export default bip84Vectors
