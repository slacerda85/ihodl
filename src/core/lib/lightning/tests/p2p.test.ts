// BOLT #7: P2P Node and Channel Discovery - Tests

import {
  verifySignature,
  signMessage,
  crc32c,
  encodeShortChannelIds,
  decodeShortChannelIds,
  encodeQueryFlags,
  decodeQueryFlags,
  validateAnnouncementSignatures,
  validateChannelAnnouncement,
  isValidAddressDescriptor,
  calculateHtlcFee,
  isHtlcFeeAcceptable,
  shouldPruneChannel,
  shouldPruneNode,
  encodeAnnouncementSignaturesMessage,
  decodeAnnouncementSignaturesMessage,
  encodeChannelAnnouncementMessage,
  decodeChannelAnnouncementMessage,
  encodeChannelUpdateMessage,
  decodeChannelUpdateMessage,
} from '../p2p'
import {
  GossipMessageType,
  BITCOIN_CHAIN_HASH,
  MIN_CHANNEL_ANNOUNCEMENT_CONFIRMATIONS,
  STALE_CHANNEL_UPDATE_SECONDS,
  EncodingType,
  AddressType,
} from '@/core/models/lightning/p2p'
import { ShortChannelId, Point } from '@/core/models/lightning/base'
import { hash256 } from '../../crypto'

describe('P2P Gossip Protocol', () => {
  describe('Crypto Utilities', () => {
    test('doubleSha256 should hash data twice', () => {
      const data = new Uint8Array([1, 2, 3])
      const result = hash256(data)
      expect(result).toHaveLength(32)
    })

    test('verifySignature should be a function', () => {
      expect(typeof verifySignature).toBe('function')
    })

    test('signMessage should be a function', () => {
      expect(typeof signMessage).toBe('function')
    })

    test('crc32c should return a number', () => {
      const data = new Uint8Array([1, 2, 3])
      const result = crc32c(data)
      expect(typeof result).toBe('number')
    })
  })

  describe('Encoding/Decoding', () => {
    test('encodeShortChannelIds/decodeShortChannelIds roundtrip', () => {
      const ids: ShortChannelId[] = [
        new Uint8Array(8).fill(1) as ShortChannelId,
        new Uint8Array(8).fill(2) as ShortChannelId,
      ]
      const encoded = encodeShortChannelIds(ids, EncodingType.UNCOMPRESSED)
      const decoded = decodeShortChannelIds(encoded, EncodingType.UNCOMPRESSED)
      expect(decoded).toEqual(ids)
    })

    test('encodeQueryFlags/decodeQueryFlags roundtrip', () => {
      const flags = [1n, 2n, 3n]
      const encoded = encodeQueryFlags(flags)
      const decoded = decodeQueryFlags(encoded)
      expect(decoded).toEqual(flags)
    })
  })

  describe('Validation Functions', () => {
    test('validateAnnouncementSignatures should validate correctly', () => {
      const result = validateAnnouncementSignatures(
        {} as any,
        MIN_CHANNEL_ANNOUNCEMENT_CONFIRMATIONS,
        true,
        true,
        false,
      )
      expect(result.valid).toBe(true)
    })

    test('validateChannelAnnouncement should validate basic conditions', () => {
      const msg = {
        chainHash: BITCOIN_CHAIN_HASH,
        shortChannelId: new Uint8Array(8) as ShortChannelId,
        nodeId1: new Uint8Array(33) as Point,
        nodeId2: new Uint8Array(33) as Point,
        bitcoinKey1: new Uint8Array(33) as Point,
        bitcoinKey2: new Uint8Array(33) as Point,
        nodeSignature1: new Uint8Array(64),
        nodeSignature2: new Uint8Array(64),
        bitcoinSignature1: new Uint8Array(64),
        bitcoinSignature2: new Uint8Array(64),
        featuresLen: 0,
        features: new Uint8Array(0),
      } as any

      // Test insufficient confirmations
      const result1 = validateChannelAnnouncement(msg, 3, false)
      expect(result1.valid).toBe(false)
      expect(result1.error).toBe('insufficient confirmations')

      // Test funding output spent
      const result2 = validateChannelAnnouncement(msg, 10, true)
      expect(result2.valid).toBe(false)
      expect(result2.error).toBe('funding output spent')

      // Test wrong chain hash
      const msgWrongChain = { ...msg, chainHash: new Uint8Array(32).fill(1) }
      const result3 = validateChannelAnnouncement(msgWrongChain, 10, false)
      expect(result3.valid).toBe(false)
      expect(result3.error).toBe('unknown chain_hash')
    })

    test('isValidAddressDescriptor should validate IPv4', () => {
      const addr = {
        type: AddressType.IPV4,
        addr: new Uint8Array(4),
        port: 9735,
      } as any
      expect(isValidAddressDescriptor(addr)).toBe(true)
    })

    test('calculateHtlcFee should calculate fee correctly', () => {
      const fee = calculateHtlcFee(1000000n, 1000, 1000)
      expect(fee).toBe(2000n)
    })

    test('isHtlcFeeAcceptable should check fee limits', () => {
      const acceptable = isHtlcFeeAcceptable(1000000n, 1000, 1000, 3000n)
      expect(acceptable).toBe(true)
    })

    test('shouldPruneChannel should check timestamp', () => {
      const shouldPrune = shouldPruneChannel(1000000, 1000000 + STALE_CHANNEL_UPDATE_SECONDS + 1)
      expect(shouldPrune).toBe(true)
    })

    test('shouldPruneNode should check associated channels', () => {
      const shouldPrune = shouldPruneNode([])
      expect(shouldPrune).toBe(true)
    })
  })

  describe('Message Encoding/Decoding', () => {
    test('encodeAnnouncementSignaturesMessage/decodeAnnouncementSignaturesMessage roundtrip', () => {
      const msg = {
        type: GossipMessageType.ANNOUNCEMENT_SIGNATURES,
        channelId: new Uint8Array(32),
        shortChannelId: new Uint8Array(8) as ShortChannelId,
        nodeSignature: new Uint8Array(64),
        bitcoinSignature: new Uint8Array(64),
      } as any
      const encoded = encodeAnnouncementSignaturesMessage(msg)
      const decoded = decodeAnnouncementSignaturesMessage(encoded)
      expect(decoded).toEqual(msg)
    })

    test('encodeChannelAnnouncementMessage/decodeChannelAnnouncementMessage roundtrip', () => {
      const msg = {
        type: GossipMessageType.CHANNEL_ANNOUNCEMENT,
        nodeSignature1: new Uint8Array(64),
        nodeSignature2: new Uint8Array(64),
        bitcoinSignature1: new Uint8Array(64),
        bitcoinSignature2: new Uint8Array(64),
        featuresLen: 0,
        features: new Uint8Array(0),
        chainHash: BITCOIN_CHAIN_HASH,
        shortChannelId: new Uint8Array(8) as ShortChannelId,
        nodeId1: new Uint8Array(33) as Point,
        nodeId2: new Uint8Array(33) as Point,
        bitcoinKey1: new Uint8Array(33) as Point,
        bitcoinKey2: new Uint8Array(33) as Point,
      } as any
      const encoded = encodeChannelAnnouncementMessage(msg)
      const decoded = decodeChannelAnnouncementMessage(encoded)
      expect(decoded).toEqual(msg)
    })

    test('encodeChannelUpdateMessage/decodeChannelUpdateMessage roundtrip', () => {
      const msg = {
        type: GossipMessageType.CHANNEL_UPDATE,
        signature: new Uint8Array(64),
        chainHash: BITCOIN_CHAIN_HASH,
        shortChannelId: new Uint8Array(8) as ShortChannelId,
        timestamp: 1234567890,
        messageFlags: 0,
        channelFlags: 0,
        cltvExpiryDelta: 40,
        htlcMinimumMsat: 1000n,
        feeBaseMsat: 1000,
        feeProportionalMillionths: 1000,
        htlcMaximumMsat: 1000000000n,
      } as any
      const encoded = encodeChannelUpdateMessage(msg)
      const decoded = decodeChannelUpdateMessage(encoded)
      expect(decoded).toEqual(msg)
    })
  })
})
