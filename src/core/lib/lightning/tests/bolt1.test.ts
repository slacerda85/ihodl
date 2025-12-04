/**
 * BOLT #1: Base Protocol Tests
 *
 * Testes abrangentes para o protocolo base de mensagens Lightning
 * - BigSize encoding/decoding
 * - TLV streams
 * - Feature bits
 * - Mensagens Init, Error, Warning, Ping, Pong
 *
 * Total: 95 testes
 */

import {
  // BigSize
  encodeBigSize,
  decodeBigSize,
  isValidBigSize,
  // TLV
  encodeTlvStream,
  decodeTlvStream,
  createTlvRecord,
  findTlv,
  // Feature bits
  hasFeature,
  setFeature,
  clearFeature,
  negotiateFeatures,
  areFeaturesCompatible,
  createFeatureVector,
  listFeatures,
  FEATURE_BITS,
  // Init
  encodeInitMessage,
  decodeInitMessage,
  createInitMessage,
  // Error
  encodeErrorMessage,
  decodeErrorMessage,
  createErrorMessage,
  getErrorString,
  isGlobalError,
  GLOBAL_ERROR_CHANNEL_ID,
  // Warning
  encodeWarningMessage,
  decodeWarningMessage,
  createWarningMessage,
  // Ping/Pong
  encodePingMessage,
  decodePingMessage,
  createPingMessage,
  encodePongMessage,
  decodePongMessage,
  createPongMessage,
  // Message framing
  getMessageType,
  isValidMessageSize,
  decodeLightningMessage,
  encodeLightningMessage,
  // Helpers
  channelIdEquals,
  deriveChannelId,
  channelIdToHex,
  hexToChannelId,
  // Chain hashes
  CHAIN_HASHES,
} from '../bolt1'

import { LightningMessageType, InitTlvType, MAX_MESSAGE_SIZE } from '@/core/models/lightning/base'

// ==========================================
// BIGSIZE ENCODING/DECODING TESTS
// ==========================================

describe('BOLT #1: BigSize Encoding', () => {
  describe('encodeBigSize', () => {
    it('deve codificar valores de 0 a 0xFC em 1 byte', () => {
      expect(encodeBigSize(0n)).toEqual(new Uint8Array([0x00]))
      expect(encodeBigSize(1n)).toEqual(new Uint8Array([0x01]))
      expect(encodeBigSize(0xfcn)).toEqual(new Uint8Array([0xfc]))
    })

    it('deve codificar valores de 0xFD a 0xFFFF em 3 bytes', () => {
      expect(encodeBigSize(0xfdn)).toEqual(new Uint8Array([0xfd, 0x00, 0xfd]))
      expect(encodeBigSize(0xfen)).toEqual(new Uint8Array([0xfd, 0x00, 0xfe]))
      expect(encodeBigSize(0x100n)).toEqual(new Uint8Array([0xfd, 0x01, 0x00]))
      expect(encodeBigSize(0xffffn)).toEqual(new Uint8Array([0xfd, 0xff, 0xff]))
    })

    it('deve codificar valores de 0x10000 a 0xFFFFFFFF em 5 bytes', () => {
      expect(encodeBigSize(0x10000n)).toEqual(new Uint8Array([0xfe, 0x00, 0x01, 0x00, 0x00]))
      expect(encodeBigSize(0xffffffffn)).toEqual(new Uint8Array([0xfe, 0xff, 0xff, 0xff, 0xff]))
    })

    it('deve codificar valores de 0x100000000 a max em 9 bytes', () => {
      expect(encodeBigSize(0x100000000n)).toEqual(
        new Uint8Array([0xff, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
      )
    })

    it('deve rejeitar valores negativos', () => {
      expect(() => encodeBigSize(-1n)).toThrow('BigSize cannot be negative')
    })
  })

  describe('decodeBigSize', () => {
    it('deve decodificar valores de 1 byte', () => {
      expect(decodeBigSize(new Uint8Array([0x00]))).toEqual({ value: 0n, bytesRead: 1 })
      expect(decodeBigSize(new Uint8Array([0x01]))).toEqual({ value: 1n, bytesRead: 1 })
      expect(decodeBigSize(new Uint8Array([0xfc]))).toEqual({ value: 0xfcn, bytesRead: 1 })
    })

    it('deve decodificar valores de 3 bytes', () => {
      expect(decodeBigSize(new Uint8Array([0xfd, 0x00, 0xfd]))).toEqual({
        value: 0xfdn,
        bytesRead: 3,
      })
      expect(decodeBigSize(new Uint8Array([0xfd, 0xff, 0xff]))).toEqual({
        value: 0xffffn,
        bytesRead: 3,
      })
    })

    it('deve decodificar valores de 5 bytes', () => {
      expect(decodeBigSize(new Uint8Array([0xfe, 0x00, 0x01, 0x00, 0x00]))).toEqual({
        value: 0x10000n,
        bytesRead: 5,
      })
      expect(decodeBigSize(new Uint8Array([0xfe, 0xff, 0xff, 0xff, 0xff]))).toEqual({
        value: 0xffffffffn,
        bytesRead: 5,
      })
    })

    it('deve decodificar valores de 9 bytes', () => {
      expect(
        decodeBigSize(new Uint8Array([0xff, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00])),
      ).toEqual({ value: 0x100000000n, bytesRead: 9 })
    })

    it('deve rejeitar dados vazios', () => {
      expect(() => decodeBigSize(new Uint8Array([]))).toThrow('Cannot decode BigSize: empty data')
    })

    it('deve rejeitar dados insuficientes para 3 bytes', () => {
      expect(() => decodeBigSize(new Uint8Array([0xfd, 0x00]))).toThrow(
        'Cannot decode BigSize: insufficient data',
      )
    })

    it('deve rejeitar dados insuficientes para 5 bytes', () => {
      expect(() => decodeBigSize(new Uint8Array([0xfe, 0x00, 0x00, 0x00]))).toThrow(
        'Cannot decode BigSize: insufficient data',
      )
    })

    it('deve rejeitar dados insuficientes para 9 bytes', () => {
      expect(() => decodeBigSize(new Uint8Array([0xff, 0x00, 0x00, 0x00, 0x00]))).toThrow(
        'Cannot decode BigSize: insufficient data',
      )
    })

    it('deve rejeitar codificação não-canônica (3 bytes para valor < 0xFD)', () => {
      expect(() => decodeBigSize(new Uint8Array([0xfd, 0x00, 0x01]))).toThrow(
        'Non-canonical BigSize encoding',
      )
    })

    it('deve rejeitar codificação não-canônica (5 bytes para valor <= 0xFFFF)', () => {
      expect(() => decodeBigSize(new Uint8Array([0xfe, 0x00, 0x00, 0xff, 0xff]))).toThrow(
        'Non-canonical BigSize encoding',
      )
    })

    it('deve rejeitar codificação não-canônica (9 bytes para valor <= 0xFFFFFFFF)', () => {
      expect(() =>
        decodeBigSize(new Uint8Array([0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff])),
      ).toThrow('Non-canonical BigSize encoding')
    })
  })

  describe('isValidBigSize', () => {
    it('deve validar codificações corretas', () => {
      expect(isValidBigSize(new Uint8Array([0x00]))).toBe(true)
      expect(isValidBigSize(new Uint8Array([0xfd, 0x00, 0xfd]))).toBe(true)
      expect(isValidBigSize(new Uint8Array([0xfe, 0x00, 0x01, 0x00, 0x00]))).toBe(true)
    })

    it('deve rejeitar codificações inválidas', () => {
      expect(isValidBigSize(new Uint8Array([]))).toBe(false)
      expect(isValidBigSize(new Uint8Array([0xfd, 0x00, 0x01]))).toBe(false) // non-canonical
    })
  })

  describe('roundtrip', () => {
    it('deve fazer roundtrip de valores diversos', () => {
      const values = [0n, 1n, 0xfcn, 0xfdn, 0xffen, 0xffffn, 0x10000n, 0xffffffffn, 0x100000000n]

      for (const value of values) {
        const encoded = encodeBigSize(value)
        const decoded = decodeBigSize(encoded)
        expect(decoded.value).toBe(value)
        expect(decoded.bytesRead).toBe(encoded.length)
      }
    })
  })
})

// ==========================================
// TLV STREAM TESTS
// ==========================================

describe('BOLT #1: TLV Streams', () => {
  describe('createTlvRecord', () => {
    it('deve criar TLV record com tipo e valor', () => {
      const record = createTlvRecord(1, new Uint8Array([0x01, 0x02, 0x03]))
      expect(record.type).toBe(1n)
      expect(record.length).toBe(3n)
      expect(record.value).toEqual(new Uint8Array([0x01, 0x02, 0x03]))
    })

    it('deve aceitar tipo como bigint', () => {
      const record = createTlvRecord(100n, new Uint8Array([0xff]))
      expect(record.type).toBe(100n)
    })
  })

  describe('encodeTlvStream', () => {
    it('deve codificar stream vazio', () => {
      expect(encodeTlvStream([])).toEqual(new Uint8Array(0))
    })

    it('deve codificar TLV único', () => {
      const tlvs = [createTlvRecord(1, new Uint8Array([0x00, 0x01]))]
      const encoded = encodeTlvStream(tlvs)
      // type=1, length=2, value=0001
      expect(encoded).toEqual(new Uint8Array([0x01, 0x02, 0x00, 0x01]))
    })

    it('deve ordenar TLVs por tipo', () => {
      const tlvs = [
        createTlvRecord(3, new Uint8Array([0x33])),
        createTlvRecord(1, new Uint8Array([0x11])),
        createTlvRecord(2, new Uint8Array([0x22])),
      ]
      const encoded = encodeTlvStream(tlvs)
      // Deve estar ordenado: type 1, type 2, type 3
      expect(encoded[0]).toBe(0x01) // type 1
      expect(encoded[3]).toBe(0x02) // type 2
      expect(encoded[6]).toBe(0x03) // type 3
    })

    it('deve rejeitar tipos duplicados', () => {
      const tlvs = [
        createTlvRecord(1, new Uint8Array([0x11])),
        createTlvRecord(1, new Uint8Array([0x22])),
      ]
      expect(() => encodeTlvStream(tlvs)).toThrow('Duplicate TLV type')
    })
  })

  describe('decodeTlvStream', () => {
    it('deve decodificar stream vazio', () => {
      expect(decodeTlvStream(new Uint8Array(0))).toEqual([])
    })

    it('deve decodificar TLV único', () => {
      const data = new Uint8Array([0x01, 0x02, 0x00, 0x01])
      const tlvs = decodeTlvStream(data)
      expect(tlvs.length).toBe(1)
      expect(tlvs[0].type).toBe(1n)
      expect(tlvs[0].value).toEqual(new Uint8Array([0x00, 0x01]))
    })

    it('deve decodificar múltiplos TLVs', () => {
      const data = new Uint8Array([0x01, 0x01, 0x11, 0x02, 0x01, 0x22, 0x03, 0x01, 0x33])
      const tlvs = decodeTlvStream(data)
      expect(tlvs.length).toBe(3)
      expect(tlvs[0].type).toBe(1n)
      expect(tlvs[1].type).toBe(2n)
      expect(tlvs[2].type).toBe(3n)
    })

    it('deve rejeitar ordem não crescente', () => {
      const data = new Uint8Array([0x02, 0x01, 0x22, 0x01, 0x01, 0x11])
      expect(() => decodeTlvStream(data)).toThrow('not in strictly increasing order')
    })

    it('deve rejeitar tipos iguais', () => {
      const data = new Uint8Array([0x01, 0x01, 0x11, 0x01, 0x01, 0x22])
      expect(() => decodeTlvStream(data)).toThrow('not in strictly increasing order')
    })

    it('deve rejeitar valor que excede dados', () => {
      const data = new Uint8Array([0x01, 0x10, 0x11]) // length=16, mas só tem 1 byte
      expect(() => decodeTlvStream(data)).toThrow('value exceeds data length')
    })
  })

  describe('findTlv', () => {
    it('deve encontrar TLV existente', () => {
      const tlvs = [
        createTlvRecord(1, new Uint8Array([0x11])),
        createTlvRecord(2, new Uint8Array([0x22])),
        createTlvRecord(3, new Uint8Array([0x33])),
      ]
      const found = findTlv(tlvs, 2)
      expect(found).toBeDefined()
      expect(found!.value).toEqual(new Uint8Array([0x22]))
    })

    it('deve retornar undefined para TLV não existente', () => {
      const tlvs = [createTlvRecord(1, new Uint8Array([0x11]))]
      const found = findTlv(tlvs, 99)
      expect(found).toBeUndefined()
    })

    it('deve aceitar tipo como bigint', () => {
      const tlvs = [createTlvRecord(100n, new Uint8Array([0xaa]))]
      const found = findTlv(tlvs, 100n)
      expect(found).toBeDefined()
    })
  })

  describe('roundtrip', () => {
    it('deve fazer roundtrip de TLV stream', () => {
      const original = [
        createTlvRecord(1, new Uint8Array([0x01, 0x02, 0x03, 0x04])),
        createTlvRecord(2, new Uint8Array([0xff])),
        createTlvRecord(100, new Uint8Array(new Array(50).fill(0xaa))),
      ]

      const encoded = encodeTlvStream(original)
      const decoded = decodeTlvStream(encoded)

      expect(decoded.length).toBe(original.length)
      for (let i = 0; i < original.length; i++) {
        expect(decoded[i].type).toBe(original[i].type)
        expect(decoded[i].value).toEqual(original[i].value)
      }
    })
  })
})

// ==========================================
// FEATURE BITS TESTS
// ==========================================

describe('BOLT #1: Feature Bits', () => {
  describe('hasFeature', () => {
    it('deve detectar feature bit definido', () => {
      const features = new Uint8Array([0b00000010]) // bit 1 set
      expect(hasFeature(features, 1)).toBe(true)
      expect(hasFeature(features, 0)).toBe(false)
    })

    it('deve funcionar com múltiplos bytes', () => {
      const features = new Uint8Array([0b00000001, 0b00000000]) // bit 8 set
      expect(hasFeature(features, 8)).toBe(true)
      expect(hasFeature(features, 0)).toBe(false)
    })

    it('deve retornar false para bit além do array', () => {
      const features = new Uint8Array([0xff])
      expect(hasFeature(features, 100)).toBe(false)
    })
  })

  describe('setFeature', () => {
    it('deve definir feature bit', () => {
      const features = new Uint8Array([0b00000000])
      const result = setFeature(features, 0)
      expect(hasFeature(result, 0)).toBe(true)
    })

    it('deve expandir array se necessário', () => {
      const features = new Uint8Array([0b00000000])
      const result = setFeature(features, 15)
      expect(result.length).toBe(2)
      expect(hasFeature(result, 15)).toBe(true)
    })

    it('deve preservar outros bits', () => {
      const features = new Uint8Array([0b00000001])
      const result = setFeature(features, 1)
      expect(hasFeature(result, 0)).toBe(true)
      expect(hasFeature(result, 1)).toBe(true)
    })
  })

  describe('clearFeature', () => {
    it('deve limpar feature bit', () => {
      const features = new Uint8Array([0b00000011])
      const result = clearFeature(features, 0)
      expect(hasFeature(result, 0)).toBe(false)
      expect(hasFeature(result, 1)).toBe(true)
    })

    it('deve ignorar bit além do array', () => {
      const features = new Uint8Array([0xff])
      const result = clearFeature(features, 100)
      expect(result).toEqual(features)
    })
  })

  describe('createFeatureVector', () => {
    it('deve criar vetor de features vazio', () => {
      const result = createFeatureVector([])
      expect(result.length).toBe(0)
    })

    it('deve criar vetor com features definidos', () => {
      const result = createFeatureVector([0, 3, 8])
      expect(hasFeature(result, 0)).toBe(true)
      expect(hasFeature(result, 3)).toBe(true)
      expect(hasFeature(result, 8)).toBe(true)
      expect(hasFeature(result, 1)).toBe(false)
    })
  })

  describe('listFeatures', () => {
    it('deve listar todos os bits definidos', () => {
      const features = createFeatureVector([0, 3, 8, 15])
      const bits = listFeatures(features)
      expect(bits).toEqual([0, 3, 8, 15])
    })

    it('deve retornar array vazio para features zerados', () => {
      const features = new Uint8Array([0, 0])
      expect(listFeatures(features)).toEqual([])
    })
  })

  describe('negotiateFeatures', () => {
    it('deve retornar AND dos features', () => {
      const local = createFeatureVector([0, 1, 3])
      const remote = createFeatureVector([1, 2, 3])
      const result = negotiateFeatures(local, remote)
      expect(hasFeature(result, 0)).toBe(false)
      expect(hasFeature(result, 1)).toBe(true)
      expect(hasFeature(result, 2)).toBe(false)
      expect(hasFeature(result, 3)).toBe(true)
    })

    it('deve lidar com tamanhos diferentes', () => {
      const local = createFeatureVector([0, 1])
      const remote = createFeatureVector([1, 20])
      const result = negotiateFeatures(local, remote)
      expect(hasFeature(result, 1)).toBe(true)
      expect(hasFeature(result, 20)).toBe(false)
    })
  })

  describe('areFeaturesCompatible', () => {
    it('deve retornar true para features compatíveis', () => {
      // Ambos suportam os mesmos features obrigatórios
      const local = createFeatureVector([FEATURE_BITS.VAR_ONION_OPTIN, FEATURE_BITS.PAYMENT_SECRET])
      const remote = createFeatureVector([
        FEATURE_BITS.VAR_ONION_OPTIN,
        FEATURE_BITS.PAYMENT_SECRET,
      ])
      expect(areFeaturesCompatible(local, remote)).toBe(true)
    })

    it('deve retornar false se remote requer feature não suportado', () => {
      const local = createFeatureVector([FEATURE_BITS.VAR_ONION_OPTIN]) // bit 8
      // Remote requer feature no bit 0 (par = obrigatório)
      const remote = createFeatureVector([0])
      expect(areFeaturesCompatible(local, remote)).toBe(false)
    })

    it('deve aceitar feature opcional (ímpar) não suportado', () => {
      const local = createFeatureVector([1]) // opcional
      const remote = createFeatureVector([3]) // outro opcional
      expect(areFeaturesCompatible(local, remote)).toBe(true)
    })
  })

  describe('FEATURE_BITS constants', () => {
    it('deve ter valores conhecidos definidos', () => {
      expect(FEATURE_BITS.OPTION_DATA_LOSS_PROTECT).toBe(0)
      expect(FEATURE_BITS.VAR_ONION_OPTIN).toBe(8)
      expect(FEATURE_BITS.PAYMENT_SECRET).toBe(14)
      expect(FEATURE_BITS.BASIC_MPP).toBe(16)
      expect(FEATURE_BITS.KEYSEND).toBe(54)
    })
  })
})

// ==========================================
// INIT MESSAGE TESTS
// ==========================================

describe('BOLT #1: Init Message', () => {
  describe('createInitMessage', () => {
    it('deve criar mensagem init básica', () => {
      const features = createFeatureVector([FEATURE_BITS.VAR_ONION_OPTIN])
      const msg = createInitMessage(features)
      expect(msg.type).toBe(LightningMessageType.INIT)
      expect(msg.globalfeatures.length).toBe(0)
      expect(msg.features).toEqual(features)
    })

    it('deve incluir chains se fornecidas', () => {
      const features = new Uint8Array([])
      const msg = createInitMessage(features, [CHAIN_HASHES.MAINNET])
      expect(msg.tlvs.length).toBe(1)
      expect(msg.tlvs[0].type).toBe(InitTlvType.NETWORKS)
    })
  })

  describe('encodeInitMessage / decodeInitMessage', () => {
    it('deve fazer roundtrip de init message simples', () => {
      const features = createFeatureVector([
        FEATURE_BITS.VAR_ONION_OPTIN,
        FEATURE_BITS.PAYMENT_SECRET,
      ])
      const original = createInitMessage(features)

      const encoded = encodeInitMessage(original)
      const decoded = decodeInitMessage(encoded)

      expect(decoded.type).toBe(LightningMessageType.INIT)
      expect(decoded.features).toEqual(original.features)
      expect(decoded.globalfeatures).toEqual(original.globalfeatures)
    })

    it('deve fazer roundtrip com TLVs', () => {
      const features = new Uint8Array([0x02, 0x0a]) // bits 1, 3, 9, 11
      const original = createInitMessage(features, [CHAIN_HASHES.MAINNET, CHAIN_HASHES.TESTNET])

      const encoded = encodeInitMessage(original)
      const decoded = decodeInitMessage(encoded)

      expect(decoded.tlvs.length).toBe(1)
      const networksTlv = decoded.tlvs[0]
      expect(networksTlv.type).toBe(InitTlvType.NETWORKS)
      if (networksTlv.type === InitTlvType.NETWORKS) {
        expect(networksTlv.chains.length).toBe(2)
        expect(networksTlv.chains[0]).toEqual(CHAIN_HASHES.MAINNET)
        expect(networksTlv.chains[1]).toEqual(CHAIN_HASHES.TESTNET)
      }
    })

    it('deve rejeitar mensagem muito curta', () => {
      expect(() => decodeInitMessage(new Uint8Array([0x00, 0x10]))).toThrow('too short')
    })

    it('deve rejeitar tipo errado', () => {
      const data = new Uint8Array([0x00, 0x11, 0x00, 0x00, 0x00, 0x00])
      expect(() => decodeInitMessage(data)).toThrow('Expected INIT message type')
    })
  })

  describe('CHAIN_HASHES', () => {
    it('deve ter hashes de 32 bytes', () => {
      expect(CHAIN_HASHES.MAINNET.length).toBe(32)
      expect(CHAIN_HASHES.TESTNET.length).toBe(32)
      expect(CHAIN_HASHES.SIGNET.length).toBe(32)
      expect(CHAIN_HASHES.REGTEST.length).toBe(32)
    })
  })
})

// ==========================================
// ERROR MESSAGE TESTS
// ==========================================

describe('BOLT #1: Error Message', () => {
  describe('createErrorMessage', () => {
    it('deve criar error message com string', () => {
      const channelId = new Uint8Array(32).fill(0x01)
      const msg = createErrorMessage(channelId, 'Test error')
      expect(msg.type).toBe(LightningMessageType.ERROR)
      expect(msg.channelId).toEqual(channelId)
      expect(new TextDecoder().decode(msg.data)).toBe('Test error')
    })

    it('deve criar error message com bytes', () => {
      const channelId = new Uint8Array(32).fill(0x02)
      const data = new Uint8Array([0x01, 0x02, 0x03])
      const msg = createErrorMessage(channelId, data)
      expect(msg.data).toEqual(data)
    })
  })

  describe('encodeErrorMessage / decodeErrorMessage', () => {
    it('deve fazer roundtrip de error message', () => {
      const channelId = new Uint8Array(32).fill(0xab)
      const original = createErrorMessage(channelId, 'Connection timeout')

      const encoded = encodeErrorMessage(original)
      const decoded = decodeErrorMessage(encoded)

      expect(decoded.type).toBe(LightningMessageType.ERROR)
      expect(decoded.channelId).toEqual(channelId)
      expect(getErrorString(decoded)).toBe('Connection timeout')
    })

    it('deve rejeitar mensagem muito curta', () => {
      expect(() => decodeErrorMessage(new Uint8Array(20))).toThrow('too short')
    })
  })

  describe('getErrorString', () => {
    it('deve converter data para string', () => {
      const msg = createErrorMessage(new Uint8Array(32), 'Hello World')
      expect(getErrorString(msg)).toBe('Hello World')
    })
  })

  describe('isGlobalError', () => {
    it('deve retornar true para channel ID zerado', () => {
      const msg = createErrorMessage(GLOBAL_ERROR_CHANNEL_ID, 'Global error')
      expect(isGlobalError(msg)).toBe(true)
    })

    it('deve retornar false para channel ID não-zerado', () => {
      const channelId = new Uint8Array(32).fill(0x01)
      const msg = createErrorMessage(channelId, 'Channel error')
      expect(isGlobalError(msg)).toBe(false)
    })
  })
})

// ==========================================
// WARNING MESSAGE TESTS
// ==========================================

describe('BOLT #1: Warning Message', () => {
  describe('createWarningMessage', () => {
    it('deve criar warning message', () => {
      const channelId = new Uint8Array(32).fill(0xcc)
      const msg = createWarningMessage(channelId, 'Low balance')
      expect(msg.type).toBe(LightningMessageType.WARNING)
      expect(msg.channelId).toEqual(channelId)
    })
  })

  describe('encodeWarningMessage / decodeWarningMessage', () => {
    it('deve fazer roundtrip de warning message', () => {
      const channelId = new Uint8Array(32).fill(0xdd)
      const original = createWarningMessage(channelId, 'Capacity warning')

      const encoded = encodeWarningMessage(original)
      const decoded = decodeWarningMessage(encoded)

      expect(decoded.type).toBe(LightningMessageType.WARNING)
      expect(decoded.channelId).toEqual(channelId)
      expect(new TextDecoder().decode(decoded.data)).toBe('Capacity warning')
    })

    it('deve rejeitar mensagem muito curta', () => {
      expect(() => decodeWarningMessage(new Uint8Array(20))).toThrow('too short')
    })
  })
})

// ==========================================
// PING/PONG MESSAGE TESTS
// ==========================================

describe('BOLT #1: Ping/Pong Messages', () => {
  describe('createPingMessage', () => {
    it('deve criar ping message padrão', () => {
      const msg = createPingMessage()
      expect(msg.type).toBe(LightningMessageType.PING)
      expect(msg.numPongBytes).toBe(0)
      expect(msg.byteslen).toBe(0)
    })

    it('deve criar ping message com parâmetros', () => {
      const msg = createPingMessage(100, 50)
      expect(msg.numPongBytes).toBe(100)
      expect(msg.byteslen).toBe(50)
      expect(msg.ignored.length).toBe(50)
    })
  })

  describe('encodePingMessage / decodePingMessage', () => {
    it('deve fazer roundtrip de ping message', () => {
      const original = createPingMessage(200, 100)

      const encoded = encodePingMessage(original)
      const decoded = decodePingMessage(encoded)

      expect(decoded.type).toBe(LightningMessageType.PING)
      expect(decoded.numPongBytes).toBe(200)
      expect(decoded.byteslen).toBe(100)
      expect(decoded.ignored.length).toBe(100)
    })

    it('deve rejeitar mensagem muito curta', () => {
      expect(() => decodePingMessage(new Uint8Array(4))).toThrow('too short')
    })
  })

  describe('createPongMessage', () => {
    it('deve criar pong em resposta a ping', () => {
      const ping = createPingMessage(150, 50)
      const pong = createPongMessage(ping)
      expect(pong.type).toBe(LightningMessageType.PONG)
      expect(pong.byteslen).toBe(150)
      expect(pong.ignored.length).toBe(150)
    })

    it('deve limitar byteslen ao máximo permitido', () => {
      const ping = createPingMessage(MAX_MESSAGE_SIZE, 0)
      const pong = createPongMessage(ping)
      expect(pong.byteslen).toBe(MAX_MESSAGE_SIZE - 4)
    })
  })

  describe('encodePongMessage / decodePongMessage', () => {
    it('deve fazer roundtrip de pong message', () => {
      const ping = createPingMessage(64, 0)
      const original = createPongMessage(ping)

      const encoded = encodePongMessage(original)
      const decoded = decodePongMessage(encoded)

      expect(decoded.type).toBe(LightningMessageType.PONG)
      expect(decoded.byteslen).toBe(64)
    })

    it('deve rejeitar mensagem muito curta', () => {
      expect(() => decodePongMessage(new Uint8Array(2))).toThrow('too short')
    })
  })
})

// ==========================================
// MESSAGE FRAMING TESTS
// ==========================================

describe('BOLT #1: Message Framing', () => {
  describe('getMessageType', () => {
    it('deve retornar tipo correto', () => {
      const init = encodeInitMessage(createInitMessage(new Uint8Array([])))
      expect(getMessageType(init)).toBe(LightningMessageType.INIT)

      const error = encodeErrorMessage(createErrorMessage(new Uint8Array(32), 'test'))
      expect(getMessageType(error)).toBe(LightningMessageType.ERROR)

      const ping = encodePingMessage(createPingMessage())
      expect(getMessageType(ping)).toBe(LightningMessageType.PING)
    })

    it('deve rejeitar dados muito curtos', () => {
      expect(() => getMessageType(new Uint8Array([0x00]))).toThrow('too short')
    })
  })

  describe('isValidMessageSize', () => {
    it('deve aceitar mensagens dentro do limite', () => {
      expect(isValidMessageSize(new Uint8Array(100))).toBe(true)
      expect(isValidMessageSize(new Uint8Array(MAX_MESSAGE_SIZE))).toBe(true)
    })

    it('deve rejeitar mensagens além do limite', () => {
      expect(isValidMessageSize(new Uint8Array(MAX_MESSAGE_SIZE + 1))).toBe(false)
    })
  })

  describe('decodeLightningMessage', () => {
    it('deve decodificar init message', () => {
      const original = createInitMessage(new Uint8Array([0x02]))
      const encoded = encodeInitMessage(original)
      const decoded = decodeLightningMessage(encoded)
      expect(decoded.type).toBe(LightningMessageType.INIT)
    })

    it('deve decodificar error message', () => {
      const original = createErrorMessage(new Uint8Array(32), 'error')
      const encoded = encodeErrorMessage(original)
      const decoded = decodeLightningMessage(encoded)
      expect(decoded.type).toBe(LightningMessageType.ERROR)
    })

    it('deve decodificar warning message', () => {
      const original = createWarningMessage(new Uint8Array(32), 'warning')
      const encoded = encodeWarningMessage(original)
      const decoded = decodeLightningMessage(encoded)
      expect(decoded.type).toBe(LightningMessageType.WARNING)
    })

    it('deve decodificar ping message', () => {
      const original = createPingMessage(10, 5)
      const encoded = encodePingMessage(original)
      const decoded = decodeLightningMessage(encoded)
      expect(decoded.type).toBe(LightningMessageType.PING)
    })

    it('deve decodificar pong message', () => {
      const original = createPongMessage(createPingMessage(10))
      const encoded = encodePongMessage(original)
      const decoded = decodeLightningMessage(encoded)
      expect(decoded.type).toBe(LightningMessageType.PONG)
    })

    it('deve rejeitar tipo não suportado', () => {
      // OPEN_CHANNEL = 32
      const data = new Uint8Array([0x00, 0x20, 0x00, 0x00])
      expect(() => decodeLightningMessage(data)).toThrow('Unsupported message type')
    })
  })

  describe('encodeLightningMessage', () => {
    it('deve codificar qualquer mensagem suportada', () => {
      const init = createInitMessage(new Uint8Array([0x01]))
      const error = createErrorMessage(new Uint8Array(32), 'e')
      const warning = createWarningMessage(new Uint8Array(32), 'w')
      const ping = createPingMessage()
      const pong = createPongMessage(ping)

      expect(encodeLightningMessage(init)).toBeDefined()
      expect(encodeLightningMessage(error)).toBeDefined()
      expect(encodeLightningMessage(warning)).toBeDefined()
      expect(encodeLightningMessage(ping)).toBeDefined()
      expect(encodeLightningMessage(pong)).toBeDefined()
    })
  })
})

// ==========================================
// CHANNEL ID HELPERS TESTS
// ==========================================

describe('BOLT #1: Channel ID Helpers', () => {
  describe('channelIdEquals', () => {
    it('deve comparar channel IDs iguais', () => {
      const a = new Uint8Array(32).fill(0x11)
      const b = new Uint8Array(32).fill(0x11)
      expect(channelIdEquals(a, b)).toBe(true)
    })

    it('deve comparar channel IDs diferentes', () => {
      const a = new Uint8Array(32).fill(0x11)
      const b = new Uint8Array(32).fill(0x22)
      expect(channelIdEquals(a, b)).toBe(false)
    })

    it('deve comparar arrays de tamanhos diferentes', () => {
      const a = new Uint8Array(32).fill(0x11)
      const b = new Uint8Array(16).fill(0x11)
      expect(channelIdEquals(a, b)).toBe(false)
    })
  })

  describe('deriveChannelId', () => {
    it('deve derivar channel ID de funding tx', () => {
      const fundingTxid = new Uint8Array(32).fill(0xaa)
      const channelId = deriveChannelId(fundingTxid, 0)
      expect(channelId.length).toBe(32)
      // Os primeiros 30 bytes devem ser iguais ao txid
      expect(channelId.subarray(0, 30)).toEqual(fundingTxid.subarray(0, 30))
    })

    it('deve XOR output index nos últimos 2 bytes', () => {
      const fundingTxid = new Uint8Array(32).fill(0x00)
      const channelId = deriveChannelId(fundingTxid, 0x0102)
      // Últimos 2 bytes devem ser 0x0102 XOR 0x0000 = 0x0102
      expect(channelId[30]).toBe(0x01)
      expect(channelId[31]).toBe(0x02)
    })

    it('deve rejeitar txid inválido', () => {
      expect(() => deriveChannelId(new Uint8Array(16), 0)).toThrow('must be 32 bytes')
    })
  })

  describe('channelIdToHex / hexToChannelId', () => {
    it('deve converter para hex e voltar', () => {
      const original = new Uint8Array(32)
      for (let i = 0; i < 32; i++) {
        original[i] = i * 8
      }

      const hex = channelIdToHex(original)
      expect(hex.length).toBe(64)

      const restored = hexToChannelId(hex)
      expect(restored).toEqual(original)
    })

    it('deve rejeitar hex com tamanho incorreto', () => {
      expect(() => hexToChannelId('aabb')).toThrow('must be 64 characters')
    })
  })
})

// ==========================================
// INTEGRATION TESTS
// ==========================================

describe('BOLT #1: Integration', () => {
  it('deve processar handshake init completo', () => {
    // Node A cria init com features (usando versões opcionais - bits ímpares)
    // VAR_ONION_OPTIN=8 (par/obrigatório) ou 9 (ímpar/opcional)
    const nodeAFeatures = createFeatureVector([
      FEATURE_BITS.VAR_ONION_OPTIN + 1, // bit 9 - opcional
      FEATURE_BITS.PAYMENT_SECRET + 1, // bit 15 - opcional
      FEATURE_BITS.BASIC_MPP + 1, // bit 17 - opcional
    ])
    const nodeAInit = createInitMessage(nodeAFeatures, [CHAIN_HASHES.MAINNET])

    // Serializa e envia
    const nodeAData = encodeInitMessage(nodeAInit)
    expect(isValidMessageSize(nodeAData)).toBe(true)

    // Node B recebe e decodifica
    const receivedA = decodeInitMessage(nodeAData)
    expect(receivedA.type).toBe(LightningMessageType.INIT)

    // Node B cria resposta com features compatíveis (também opcionais)
    const nodeBFeatures = createFeatureVector([
      FEATURE_BITS.VAR_ONION_OPTIN + 1, // bit 9
      FEATURE_BITS.PAYMENT_SECRET + 1, // bit 15
    ])
    const nodeBInit = createInitMessage(nodeBFeatures, [CHAIN_HASHES.MAINNET])
    const nodeBData = encodeInitMessage(nodeBInit)

    // Node A recebe
    const receivedB = decodeInitMessage(nodeBData)

    // Verificar compatibilidade (features opcionais são sempre compatíveis)
    expect(areFeaturesCompatible(receivedA.features, receivedB.features)).toBe(true)

    // Negociar features
    const negotiated = negotiateFeatures(receivedA.features, receivedB.features)
    expect(hasFeature(negotiated, FEATURE_BITS.VAR_ONION_OPTIN + 1)).toBe(true)
    expect(hasFeature(negotiated, FEATURE_BITS.PAYMENT_SECRET + 1)).toBe(true)
    expect(hasFeature(negotiated, FEATURE_BITS.BASIC_MPP + 1)).toBe(false) // B não suporta
  })

  it('deve processar ping/pong para keep-alive', () => {
    // Node A envia ping pedindo 100 bytes de pong
    const ping = createPingMessage(100, 32)
    const pingData = encodePingMessage(ping)
    expect(isValidMessageSize(pingData)).toBe(true)

    // Node B recebe e responde
    const receivedPing = decodePingMessage(pingData)
    const pong = createPongMessage(receivedPing)
    const pongData = encodePongMessage(pong)

    // Node A recebe pong
    const receivedPong = decodePongMessage(pongData)
    expect(receivedPong.byteslen).toBe(100)
  })

  it('deve processar error message para fechamento de canal', () => {
    // Canal sendo fechado por erro
    const channelId = deriveChannelId(new Uint8Array(32).fill(0xab), 1)
    const error = createErrorMessage(channelId, 'Channel breach detected')
    const errorData = encodeErrorMessage(error)

    // Outro node recebe
    const received = decodeErrorMessage(errorData)
    expect(received.channelId).toEqual(channelId)
    expect(isGlobalError(received)).toBe(false)
    expect(getErrorString(received)).toBe('Channel breach detected')
  })

  it('deve enviar warning sem fechar conexão', () => {
    const channelId = new Uint8Array(32).fill(0xcc)
    const warning = createWarningMessage(channelId, 'High fee detected')
    const warningData = encodeWarningMessage(warning)

    const received = decodeWarningMessage(warningData)
    expect(received.type).toBe(LightningMessageType.WARNING)
    expect(new TextDecoder().decode(received.data)).toBe('High fee detected')
  })
})
