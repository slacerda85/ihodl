// Tests for Channel Reestablish Service

import { ChannelReestablishService } from '../ln-channel-reestablish-service'
import { ChannelState } from '@/core/models/lightning/channel'
import lightningRepository from '@/core/repositories/lightning'
import { broadcastTransaction } from '@/core/lib/electrum/client'
import { hexToUint8Array } from '@/core/lib/utils/utils'

// Mock the repository
jest.mock('@/core/repositories/lightning')
jest.mock('@/core/lib/electrum/client', () => ({
  broadcastTransaction: jest.fn(),
}))
jest.mock('../ln-transport-service', () => ({
  getTransport: () => ({
    isConnected: true,
    sendMessage: jest.fn(),
  }),
}))

describe('ChannelReestablishService', () => {
  let service: ChannelReestablishService
  let mockRepository: jest.Mocked<typeof lightningRepository>
  let mockBroadcastTransaction: jest.MockedFunction<typeof broadcastTransaction>

  const mockChannelId = hexToUint8Array(
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  )

  beforeEach(() => {
    jest.clearAllMocks()
    mockRepository = lightningRepository as jest.Mocked<typeof lightningRepository>
    mockBroadcastTransaction = broadcastTransaction as jest.MockedFunction<
      typeof broadcastTransaction
    >
    mockBroadcastTransaction.mockResolvedValue('mock-txid')
    service = new ChannelReestablishService()
  })

  describe('Instantiation', () => {
    it('should instantiate correctly', () => {
      expect(service).toBeDefined()
      expect(service).toBeInstanceOf(ChannelReestablishService)
    })
  })

  describe('Normal Reestablishment', () => {
    it('should fail reestablishment for non-existent channel', async () => {
      mockRepository.findChannelById.mockReturnValue(null)

      const result = await service.reestablishChannel(mockChannelId, 'test-peer')

      expect(result.success).toBe(false)
      expect(result.newState).toBe(ChannelState.CLOSED)
      expect(result.error).toBe('Channel not found in repository')
    })

    it('should fail reestablishment for closed channel', async () => {
      const closedChannelData = { state: ChannelState.CLOSED }
      mockRepository.findChannelById.mockReturnValue(closedChannelData)

      const result = await service.reestablishChannel(mockChannelId, 'test-peer')

      expect(result.success).toBe(false)
      expect(result.newState).toBe(ChannelState.CLOSED)
      expect(result.error).toBe('Channel is closed or closing')
    })
  })

  describe('Error Handling', () => {
    it('should handle repository errors gracefully', async () => {
      mockRepository.findChannelById.mockImplementation(() => {
        throw new Error('Database error')
      })

      const result = await service.reestablishChannel(mockChannelId, 'test-peer')

      expect(result.success).toBe(false)
      expect(result.newState).toBe(ChannelState.ERROR)
      expect(result.error).toBe('Database error')
    })
  })

  describe('Force Close Handling', () => {
    it('should not force close channel without funding tx', async () => {
      const channelData = { fundingTxid: undefined }
      mockRepository.findChannelById.mockReturnValue(channelData)

      const canForceClose = await (service as any).canSafelyForceClose(mockChannelId, 5n)

      expect(canForceClose).toBe(false)
    })

    it('should initiate force close when requested', async () => {
      const channelData = { fundingTxid: 'valid-txid', commitmentTxHex: 'deadbeef' }
      mockRepository.findChannelById.mockReturnValue(channelData)
      mockRepository.saveChannel = jest.fn()

      await (service as any).initiateForceClose(mockChannelId)

      expect(mockBroadcastTransaction).toHaveBeenCalledWith('deadbeef')
      expect(mockRepository.saveChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'force_closing',
          commitmentTxid: 'mock-txid',
        }),
      )
    })
  })
})
