// Mock socket before any imports that need it
import { LightningMessageType } from '@/core/models/lightning/base'
import type {
  TxAddInputMessage,
  TxAddOutputMessage,
  TxRemoveInputMessage,
  TxRemoveOutputMessage,
  TxCompleteMessage,
  TxSignaturesMessage,
  TxInitRbfMessage,
  TxAckRbfMessage,
  TxAbortMessage,
  OpenChannelMessage,
  AcceptChannelMessage,
  ChannelReestablishMessage,
  Witness,
} from '@/core/models/lightning/peer'
import {
  encodeTxAddInputMessage,
  decodeTxAddInputMessage,
  encodeTxAddOutputMessage,
  decodeTxAddOutputMessage,
  encodeTxRemoveInputMessage,
  decodeTxRemoveInputMessage,
  encodeTxRemoveOutputMessage,
  decodeTxRemoveOutputMessage,
  encodeTxCompleteMessage,
  decodeTxCompleteMessage,
  encodeTxSignaturesMessage,
  decodeTxSignaturesMessage,
  encodeTxInitRbfMessage,
  decodeTxInitRbfMessage,
  encodeTxAckRbfMessage,
  decodeTxAckRbfMessage,
  encodeTxAbortMessage,
  decodeTxAbortMessage,
  encodeOpenChannelMessage,
  decodeOpenChannelMessage,
  encodeAcceptChannelMessage,
  decodeAcceptChannelMessage,
  encodeChannelReestablishMessage,
  decodeChannelReestablishMessage,
  createChannelReestablishMessage,
} from '../peer'
import { encodeBigSize } from '@/core/lib/lightning/base'

jest.mock('@/core/lib/network/socket', () => ({
  createLightningSocket: jest.fn().mockResolvedValue({}),
  createElectrumSocket: jest.fn().mockResolvedValue({}),
}))

describe('BOLT #2 Peer Protocol Encoding/Decoding', () => {
  // Sample data for tests
  const channelId = new Uint8Array(32).fill(0x01)
  const sha256 = new Uint8Array(32).fill(0x02)
  const point = new Uint8Array(33).fill(0x03)
  const chainHash = sha256

  describe('TxAddInputMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: TxAddInputMessage = {
        type: LightningMessageType.TX_ADD_INPUT,
        channelId: channelId,
        serialId: 0n, // even for initiator
        prevtxLen: 100,
        prevtx: new Uint8Array(100).fill(0x05),
        prevtxVout: 0,
        sequence: 4294967293, // max allowed
      }

      const encoded = encodeTxAddInputMessage(msg)
      const decoded = decodeTxAddInputMessage(encoded)

      expect(decoded).toEqual(msg)
      expect(encoded.length).toBe(2 + 32 + 8 + 2 + 100 + 4 + 4) // type + channel_id + serial_id + prevtx_len + prevtx + prevtx_vout + sequence
    })

    it('should handle different serial_id parity', () => {
      const msg: TxAddInputMessage = {
        type: LightningMessageType.TX_ADD_INPUT,
        channelId: channelId,
        serialId: 1n, // odd for non-initiator
        prevtxLen: 50,
        prevtx: new Uint8Array(50).fill(0x06),
        prevtxVout: 1,
        sequence: 0,
      }

      const encoded = encodeTxAddInputMessage(msg)
      const decoded = decodeTxAddInputMessage(encoded)

      expect(decoded).toEqual(msg)
    })
  })

  describe('TxAddOutputMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: TxAddOutputMessage = {
        type: LightningMessageType.TX_ADD_OUTPUT,
        channelId: channelId,
        serialId: 0n,
        sats: 1000000n,
        scriptlen: 25,
        script: new Uint8Array(25).fill(0x07),
      }

      const encoded = encodeTxAddOutputMessage(msg)
      const decoded = decodeTxAddOutputMessage(encoded)

      expect(decoded).toEqual(msg)
      expect(encoded.length).toBe(2 + 32 + 8 + 8 + 2 + 25)
    })

    it('should handle odd serial_id', () => {
      const msg: TxAddOutputMessage = {
        type: LightningMessageType.TX_ADD_OUTPUT,
        channelId: channelId,
        serialId: 1n,
        sats: 500000n,
        scriptlen: 22,
        script: new Uint8Array(22).fill(0x08),
      }

      const encoded = encodeTxAddOutputMessage(msg)
      const decoded = decodeTxAddOutputMessage(encoded)

      expect(decoded).toEqual(msg)
    })
  })

  describe('TxRemoveInputMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: TxRemoveInputMessage = {
        type: LightningMessageType.TX_REMOVE_INPUT,
        channelId: channelId,
        serialId: 0n,
      }

      const encoded = encodeTxRemoveInputMessage(msg)
      const decoded = decodeTxRemoveInputMessage(encoded)

      expect(decoded).toEqual(msg)
      expect(encoded.length).toBe(2 + 32 + 8)
    })
  })

  describe('TxRemoveOutputMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: TxRemoveOutputMessage = {
        type: LightningMessageType.TX_REMOVE_OUTPUT,
        channelId: channelId,
        serialId: 0n,
      }

      const encoded = encodeTxRemoveOutputMessage(msg)
      const decoded = decodeTxRemoveOutputMessage(encoded)

      expect(decoded).toEqual(msg)
      expect(encoded.length).toBe(2 + 32 + 8)
    })
  })

  describe('TxCompleteMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: TxCompleteMessage = {
        type: LightningMessageType.TX_COMPLETE,
        channelId: channelId,
      }

      const encoded = encodeTxCompleteMessage(msg)
      const decoded = decodeTxCompleteMessage(encoded)

      expect(decoded).toEqual(msg)
      expect(encoded.length).toBe(2 + 32)
    })
  })

  describe('TxSignaturesMessage', () => {
    it('should encode and decode correctly with witnesses', () => {
      const witnesses: Witness[] = [
        { len: 10, witnessData: new Uint8Array(10).fill(0x09) },
        { len: 20, witnessData: new Uint8Array(20).fill(0x0a) },
      ]

      const msg: TxSignaturesMessage = {
        type: LightningMessageType.TX_SIGNATURES,
        channelId: channelId,
        txid: sha256,
        numWitnesses: 2,
        witnesses,
      }

      const encoded = encodeTxSignaturesMessage(msg)
      const decoded = decodeTxSignaturesMessage(encoded)

      expect(decoded).toEqual(msg)
      expect(encoded.length).toBe(2 + 32 + 32 + 2 + 2 + 10 + 2 + 20) // type + channel_id + txid + num_witnesses + witness1(len + data) + witness2(len + data)
    })

    it('should handle empty witnesses', () => {
      const msg: TxSignaturesMessage = {
        type: LightningMessageType.TX_SIGNATURES,
        channelId: channelId,
        txid: sha256,
        numWitnesses: 0,
        witnesses: [],
      }

      const encoded = encodeTxSignaturesMessage(msg)
      const decoded = decodeTxSignaturesMessage(encoded)

      expect(decoded).toEqual(msg)
    })
  })

  describe('TxInitRbfMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: TxInitRbfMessage = {
        type: LightningMessageType.TX_INIT_RBF,
        channelId: channelId,
        locktime: 123456,
        feerate: 1000,
        tlvs: [], // empty TLVs
      }

      const encoded = encodeTxInitRbfMessage(msg)
      const decoded = decodeTxInitRbfMessage(encoded)

      expect(decoded).toEqual(msg)
      expect(encoded.length).toBe(2 + 32 + 4 + 4 + 0) // + TLV length
    })

    it('should handle TLVs', () => {
      const msg: TxInitRbfMessage = {
        type: LightningMessageType.TX_INIT_RBF,
        channelId: channelId,
        locktime: 654321,
        feerate: 2000,
        tlvs: [
          { type: 0n, length: BigInt(encodeBigSize(50000n).length), value: encodeBigSize(50000n) },
          { type: 1n, length: 0n, value: new Uint8Array(0) },
        ],
      }

      const encoded = encodeTxInitRbfMessage(msg)
      const decoded = decodeTxInitRbfMessage(encoded)

      expect(decoded).toEqual(msg)
    })
  })

  describe('TxAckRbfMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: TxAckRbfMessage = {
        type: LightningMessageType.TX_ACK_RBF,
        channelId: channelId,
        tlvs: [],
      }

      const encoded = encodeTxAckRbfMessage(msg)
      const decoded = decodeTxAckRbfMessage(encoded)

      expect(decoded).toEqual(msg)
      expect(encoded.length).toBe(2 + 32 + 0)
    })

    it('should handle TLVs', () => {
      const msg: TxAckRbfMessage = {
        type: LightningMessageType.TX_ACK_RBF,
        channelId: channelId,
        tlvs: [
          { type: 0n, length: BigInt(encodeBigSize(75000n).length), value: encodeBigSize(75000n) },
          { type: 1n, length: 0n, value: new Uint8Array(0) },
        ],
      }

      const encoded = encodeTxAckRbfMessage(msg)
      const decoded = decodeTxAckRbfMessage(encoded)

      expect(decoded).toEqual(msg)
    })
  })

  describe('TxAbortMessage', () => {
    it('should encode and decode correctly', () => {
      const data = new Uint8Array([0x42, 0x43, 0x44])
      const msg: TxAbortMessage = {
        type: LightningMessageType.TX_ABORT,
        channelId: channelId,
        len: 3,
        data,
      }

      const encoded = encodeTxAbortMessage(msg)
      const decoded = decodeTxAbortMessage(encoded)

      expect(decoded).toEqual(msg)
      expect(encoded.length).toBe(2 + 32 + 2 + 3)
    })

    it('should handle empty data', () => {
      const msg: TxAbortMessage = {
        type: LightningMessageType.TX_ABORT,
        channelId: channelId,
        len: 0,
        data: new Uint8Array(0),
      }

      const encoded = encodeTxAbortMessage(msg)
      const decoded = decodeTxAbortMessage(encoded)

      expect(decoded).toEqual(msg)
    })
  })

  describe('OpenChannelMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: OpenChannelMessage = {
        type: LightningMessageType.OPEN_CHANNEL,
        chainHash: chainHash,
        temporaryChannelId: channelId,
        fundingSatoshis: 1000000n,
        pushMsat: 0n,
        dustLimitSatoshis: 546n,
        maxHtlcValueInFlightMsat: 1000000000n,
        channelReserveSatoshis: 10000n,
        htlcMinimumMsat: 1000n,
        feeratePerKw: 1000,
        toSelfDelay: 144,
        maxAcceptedHtlcs: 483,
        fundingPubkey: point,
        revocationBasepoint: point,
        paymentBasepoint: point,
        delayedPaymentBasepoint: point,
        htlcBasepoint: point,
        firstPerCommitmentPoint: point,
        channelFlags: 0,
        tlvs: [],
      }

      const encoded = encodeOpenChannelMessage(msg)
      const decoded = decodeOpenChannelMessage(encoded)

      expect(decoded).toEqual(msg)
      // Length calculation would be complex, but we check equality
    })

    it('should handle TLVs', () => {
      const msg: OpenChannelMessage = {
        type: LightningMessageType.OPEN_CHANNEL,
        chainHash: chainHash,
        temporaryChannelId: channelId,
        fundingSatoshis: 2000000n,
        pushMsat: 100000n,
        dustLimitSatoshis: 1000n,
        maxHtlcValueInFlightMsat: 2000000000n,
        channelReserveSatoshis: 20000n,
        htlcMinimumMsat: 2000n,
        feeratePerKw: 1500,
        toSelfDelay: 200,
        maxAcceptedHtlcs: 400,
        fundingPubkey: point,
        revocationBasepoint: point,
        paymentBasepoint: point,
        delayedPaymentBasepoint: point,
        htlcBasepoint: point,
        firstPerCommitmentPoint: point,
        channelFlags: 1,
        tlvs: [{ type: 1n, length: 4n, value: new Uint8Array([0x00, 0x00, 0x00, 0x00]) }],
      }

      const encoded = encodeOpenChannelMessage(msg)
      const decoded = decodeOpenChannelMessage(encoded)

      expect(decoded).toEqual(msg)
    })
  })

  describe('AcceptChannelMessage', () => {
    it('should encode and decode correctly', () => {
      const msg: AcceptChannelMessage = {
        type: LightningMessageType.ACCEPT_CHANNEL,
        temporaryChannelId: channelId,
        dustLimitSatoshis: 1000n,
        maxHtlcValueInFlightMsat: 1500000000n,
        channelReserveSatoshis: 15000n,
        htlcMinimumMsat: 1500n,
        minimumDepth: 6,
        toSelfDelay: 150,
        maxAcceptedHtlcs: 450,
        fundingPubkey: point,
        revocationBasepoint: point,
        paymentBasepoint: point,
        delayedPaymentBasepoint: point,
        htlcBasepoint: point,
        firstPerCommitmentPoint: point,
        tlvs: [],
      }

      const encoded = encodeAcceptChannelMessage(msg)
      const decoded = decodeAcceptChannelMessage(encoded)

      expect(decoded).toEqual(msg)
    })

    it('should handle TLVs', () => {
      const msg: AcceptChannelMessage = {
        type: LightningMessageType.ACCEPT_CHANNEL,
        temporaryChannelId: channelId,
        dustLimitSatoshis: 2000n,
        maxHtlcValueInFlightMsat: 2500000000n,
        channelReserveSatoshis: 25000n,
        htlcMinimumMsat: 2500n,
        minimumDepth: 3,
        toSelfDelay: 250,
        maxAcceptedHtlcs: 350,
        fundingPubkey: point,
        revocationBasepoint: point,
        paymentBasepoint: point,
        delayedPaymentBasepoint: point,
        htlcBasepoint: point,
        firstPerCommitmentPoint: point,
        tlvs: [{ type: 1n, length: 4n, value: new Uint8Array([0x00, 0x00, 0x00, 0x01]) }],
      }

      const encoded = encodeAcceptChannelMessage(msg)
      const decoded = decodeAcceptChannelMessage(encoded)

      expect(decoded).toEqual(msg)
    })
  })

  describe('channel_reestablish', () => {
    it('should encode and decode basic channel_reestablish message', () => {
      const msg: ChannelReestablishMessage = {
        type: LightningMessageType.CHANNEL_REESTABLISH,
        channelId: channelId,
        nextCommitmentNumber: 5n,
        nextRevocationNumber: 4n,
        yourLastPerCommitmentSecret: sha256,
        myCurrentPerCommitmentPoint: point,
        tlvs: [],
      }

      const encoded = encodeChannelReestablishMessage(msg)
      const decoded = decodeChannelReestablishMessage(encoded)

      expect(decoded.type).toEqual(msg.type)
      expect(decoded.channelId).toEqual(msg.channelId)
      expect(decoded.nextCommitmentNumber).toEqual(msg.nextCommitmentNumber)
      expect(decoded.nextRevocationNumber).toEqual(msg.nextRevocationNumber)
      expect(decoded.yourLastPerCommitmentSecret).toEqual(msg.yourLastPerCommitmentSecret)
      expect(decoded.myCurrentPerCommitmentPoint).toEqual(msg.myCurrentPerCommitmentPoint)
    })

    it('should handle large commitment numbers', () => {
      const msg: ChannelReestablishMessage = {
        type: LightningMessageType.CHANNEL_REESTABLISH,
        channelId: channelId,
        nextCommitmentNumber: 0xffffffffffffffffn, // Max u64
        nextRevocationNumber: 0xfffffffffffffffen,
        yourLastPerCommitmentSecret: sha256,
        myCurrentPerCommitmentPoint: point,
        tlvs: [],
      }

      const encoded = encodeChannelReestablishMessage(msg)
      const decoded = decodeChannelReestablishMessage(encoded)

      expect(decoded.nextCommitmentNumber).toEqual(msg.nextCommitmentNumber)
      expect(decoded.nextRevocationNumber).toEqual(msg.nextRevocationNumber)
    })

    it('should encode with zero secret for first reestablish', () => {
      const zeroSecret = new Uint8Array(32).fill(0) // Zeros when no secret received yet

      const msg: ChannelReestablishMessage = {
        type: LightningMessageType.CHANNEL_REESTABLISH,
        channelId: channelId,
        nextCommitmentNumber: 1n,
        nextRevocationNumber: 0n,
        yourLastPerCommitmentSecret: zeroSecret,
        myCurrentPerCommitmentPoint: point,
        tlvs: [],
      }

      const encoded = encodeChannelReestablishMessage(msg)
      const decoded = decodeChannelReestablishMessage(encoded)

      expect(decoded.yourLastPerCommitmentSecret).toEqual(zeroSecret)
    })

    it('should create message using helper function', () => {
      const created = createChannelReestablishMessage(channelId, 10n, 9n, sha256, point)

      expect(created.type).toEqual(LightningMessageType.CHANNEL_REESTABLISH)
      expect(created.channelId).toEqual(channelId)
      expect(created.nextCommitmentNumber).toEqual(10n)
      expect(created.nextRevocationNumber).toEqual(9n)
      expect(created.yourLastPerCommitmentSecret).toEqual(sha256)
      expect(created.myCurrentPerCommitmentPoint).toEqual(point)
    })

    it('should have correct message type value', () => {
      const msg: ChannelReestablishMessage = {
        type: LightningMessageType.CHANNEL_REESTABLISH,
        channelId: channelId,
        nextCommitmentNumber: 1n,
        nextRevocationNumber: 0n,
        yourLastPerCommitmentSecret: sha256,
        myCurrentPerCommitmentPoint: point,
        tlvs: [],
      }

      const encoded = encodeChannelReestablishMessage(msg)

      // Type should be 136 (0x0088) in first 2 bytes
      expect(encoded[0]).toBe(0x00)
      expect(encoded[1]).toBe(0x88)
    })

    it('should have correct message length without TLVs', () => {
      const msg: ChannelReestablishMessage = {
        type: LightningMessageType.CHANNEL_REESTABLISH,
        channelId: channelId,
        nextCommitmentNumber: 1n,
        nextRevocationNumber: 0n,
        yourLastPerCommitmentSecret: sha256,
        myCurrentPerCommitmentPoint: point,
        tlvs: [],
      }

      const encoded = encodeChannelReestablishMessage(msg)

      // Expected length: 2 (type) + 32 (channel_id) + 8 (next_commitment_number) +
      // 8 (next_revocation_number) + 32 (secret) + 33 (point) = 115 bytes
      expect(encoded.length).toBe(115)
    })
  })
})
