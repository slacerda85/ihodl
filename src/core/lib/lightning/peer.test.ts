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
} from './peer'
import { encodeBigSize } from '@/core/lib/lightning/base'

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
        channel_id: channelId,
        serial_id: 0n, // even for initiator
        prevtx_len: 100,
        prevtx: new Uint8Array(100).fill(0x05),
        prevtx_vout: 0,
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
        channel_id: channelId,
        serial_id: 1n, // odd for non-initiator
        prevtx_len: 50,
        prevtx: new Uint8Array(50).fill(0x06),
        prevtx_vout: 1,
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
        channel_id: channelId,
        serial_id: 0n,
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
        channel_id: channelId,
        serial_id: 1n,
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
        channel_id: channelId,
        serial_id: 0n,
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
        channel_id: channelId,
        serial_id: 0n,
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
        channel_id: channelId,
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
        { len: 10, witness_data: new Uint8Array(10).fill(0x09) },
        { len: 20, witness_data: new Uint8Array(20).fill(0x0a) },
      ]

      const msg: TxSignaturesMessage = {
        type: LightningMessageType.TX_SIGNATURES,
        channel_id: channelId,
        txid: sha256,
        num_witnesses: 2,
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
        channel_id: channelId,
        txid: sha256,
        num_witnesses: 0,
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
        channel_id: channelId,
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
        channel_id: channelId,
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
        channel_id: channelId,
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
        channel_id: channelId,
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
        channel_id: channelId,
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
        channel_id: channelId,
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
        chain_hash: chainHash,
        temporary_channel_id: channelId,
        funding_satoshis: 1000000n,
        push_msat: 0n,
        dust_limit_satoshis: 546n,
        max_htlc_value_in_flight_msat: 1000000000n,
        channel_reserve_satoshis: 10000n,
        htlc_minimum_msat: 1000n,
        feerate_per_kw: 1000,
        to_self_delay: 144,
        max_accepted_htlcs: 483,
        funding_pubkey: point,
        revocation_basepoint: point,
        payment_basepoint: point,
        delayed_payment_basepoint: point,
        htlc_basepoint: point,
        first_per_commitment_point: point,
        channel_flags: 0,
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
        chain_hash: chainHash,
        temporary_channel_id: channelId,
        funding_satoshis: 2000000n,
        push_msat: 100000n,
        dust_limit_satoshis: 1000n,
        max_htlc_value_in_flight_msat: 2000000000n,
        channel_reserve_satoshis: 20000n,
        htlc_minimum_msat: 2000n,
        feerate_per_kw: 1500,
        to_self_delay: 200,
        max_accepted_htlcs: 400,
        funding_pubkey: point,
        revocation_basepoint: point,
        payment_basepoint: point,
        delayed_payment_basepoint: point,
        htlc_basepoint: point,
        first_per_commitment_point: point,
        channel_flags: 1,
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
        temporary_channel_id: channelId,
        dust_limit_satoshis: 1000n,
        max_htlc_value_in_flight_msat: 1500000000n,
        channel_reserve_satoshis: 15000n,
        htlc_minimum_msat: 1500n,
        minimum_depth: 6,
        to_self_delay: 150,
        max_accepted_htlcs: 450,
        funding_pubkey: point,
        revocation_basepoint: point,
        payment_basepoint: point,
        delayed_payment_basepoint: point,
        htlc_basepoint: point,
        first_per_commitment_point: point,
        tlvs: [],
      }

      const encoded = encodeAcceptChannelMessage(msg)
      const decoded = decodeAcceptChannelMessage(encoded)

      expect(decoded).toEqual(msg)
    })

    it('should handle TLVs', () => {
      const msg: AcceptChannelMessage = {
        type: LightningMessageType.ACCEPT_CHANNEL,
        temporary_channel_id: channelId,
        dust_limit_satoshis: 2000n,
        max_htlc_value_in_flight_msat: 2500000000n,
        channel_reserve_satoshis: 25000n,
        htlc_minimum_msat: 2500n,
        minimum_depth: 3,
        to_self_delay: 250,
        max_accepted_htlcs: 350,
        funding_pubkey: point,
        revocation_basepoint: point,
        payment_basepoint: point,
        delayed_payment_basepoint: point,
        htlc_basepoint: point,
        first_per_commitment_point: point,
        tlvs: [{ type: 1n, length: 4n, value: new Uint8Array([0x00, 0x00, 0x00, 0x01]) }],
      }

      const encoded = encodeAcceptChannelMessage(msg)
      const decoded = decodeAcceptChannelMessage(encoded)

      expect(decoded).toEqual(msg)
    })
  })
})
