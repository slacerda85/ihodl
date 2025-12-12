// Tests for Channel Reestablish Service

import { ChannelReestablishService } from '../ln-channel-reestablish-service'
import { ChannelState } from '@/core/models/lightning/channel'
import lightningRepository from '@/core/repositories/lightning'
import { hexToUint8Array } from '@/core/lib/utils/utils'

// Mock the repository
jest.mock('@/core/repositories/lightning')

describe('ChannelReestablishService', () => {
  let service: ChannelReestablishService
  let mockRepository: jest.Mocked<typeof lightningRepository>

  const mockChannelId = hexToUint8Array(
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  )

  beforeEach(() => {
    jest.clearAllMocks()
    mockRepository = lightningRepository as jest.Mocked<typeof lightningRepository>
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
      mockRepository.findChannelById.mockResolvedValue(null)

      const result = await service.reestablishChannel(mockChannelId, 'test-peer')

      expect(result.success).toBe(false)
      expect(result.newState).toBe(ChannelState.CLOSED)
      expect(result.error).toBe('Channel not found in repository')
    })

    it('should fail reestablishment for closed channel', async () => {
      const closedChannelData = { state: ChannelState.CLOSED }
      mockRepository.findChannelById.mockResolvedValue(closedChannelData)

      const result = await service.reestablishChannel(mockChannelId, 'test-peer')

      expect(result.success).toBe(false)
      expect(result.newState).toBe(ChannelState.CLOSED)
      expect(result.error).toBe('Channel is closed or closing')
    })
  })

  describe('Error Handling', () => {
    it('should handle repository errors gracefully', async () => {
      mockRepository.findChannelById.mockRejectedValue(new Error('Database error'))

      const result = await service.reestablishChannel(mockChannelId, 'test-peer')

      expect(result.success).toBe(false)
      expect(result.newState).toBe(ChannelState.ERROR)
      expect(result.error).toBe('Database error')
    })
  })

  describe('Force Close Handling', () => {
    it('should not force close channel without funding tx', async () => {
      const channelData = { fundingTxid: undefined }
      mockRepository.findChannelById.mockResolvedValue(channelData)

      const canForceClose = await (service as any).canSafelyForceClose(mockChannelId, 5n)

      expect(canForceClose).toBe(false)
    })

    it('should initiate force close when requested', async () => {
      const channelData = { fundingTxid: 'valid-txid' }
      mockRepository.findChannelById.mockResolvedValue(channelData)
      mockRepository.saveChannel = jest.fn()

      await (service as any).initiateForceClose(mockChannelId)

      expect(mockRepository.saveChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'force_closing',
        }),
      )
    })
  })
})
