import { describe, it, expect, beforeEach } from '@jest/globals'
import LightningService from '../ln-service'
import { createInitialReadinessState } from '../../models/lightning/readiness'

describe('LightningService Readiness Guards', () => {
  let service: LightningService

  beforeEach(() => {
    service = new LightningService()
    // Reset readiness state to initial state
    service.updateReadinessState(createInitialReadinessState())
  })

  describe('sendPayment readiness guard', () => {
    it('should reject sendPayment when readiness level is NOT_READY', async () => {
      // Given: service readiness is NOT_READY (default state)
      const isInitializedSpy = jest.spyOn(service, 'isInitialized').mockReturnValue(true)

      // When: trying to send payment
      const result = await service.sendPayment({
        invoice: 'lnbc1...', // Invalid invoice, but should fail before validation
      })

      // Then: should fail with readiness error
      expect(result.success).toBe(false)
      expect(result.error).toContain('Cannot send payment')
      expect(isInitializedSpy).toHaveBeenCalled()
    })

    it('should reject sendPayment when readiness level is CAN_RECEIVE', async () => {
      // Given: service is initialized and readiness allows receiving but not sending
      const isInitializedSpy = jest.spyOn(service, 'isInitialized').mockReturnValue(true)
      service.updateReadinessState({
        isWalletLoaded: true,
        isTransportConnected: true,
      })

      // When: trying to send payment
      const result = await service.sendPayment({
        invoice: 'lnbc1...', // Invalid invoice, but should fail before validation
      })

      // Then: should fail with readiness error
      expect(result.success).toBe(false)
      expect(result.error).toContain('Cannot send payment')
      expect(isInitializedSpy).toHaveBeenCalled()
    })

    it('should allow sendPayment when readiness level is CAN_SEND', async () => {
      // Given: service is initialized and readiness allows sending
      const isInitializedSpy = jest.spyOn(service, 'isInitialized').mockReturnValue(true)
      service.updateReadinessState({
        isWalletLoaded: true,
        isTransportConnected: true,
        isPeerConnected: true,
        isGossipSynced: true,
      })

      // When: trying to send payment
      const result = await service.sendPayment({
        invoice: 'lnbc1...', // Invalid invoice, but should pass readiness check
      })

      // Then: should fail due to invalid invoice, not readiness
      expect(result.success).toBe(false)
      expect(result.error).not.toContain('Cannot send payment')
      expect(isInitializedSpy).toHaveBeenCalled()
    })

    it('should allow sendPayment when readiness level is FULLY_READY', async () => {
      // Given: service is fully ready
      const isInitializedSpy = jest.spyOn(service, 'isInitialized').mockReturnValue(true)
      service.updateReadinessState({
        isWalletLoaded: true,
        isTransportConnected: true,
        isPeerConnected: true,
        isGossipSynced: true,
      })

      // When: trying to send payment
      const result = await service.sendPayment({
        invoice: 'lnbc1...', // Invalid invoice, but should pass readiness check
      })

      // Then: should fail due to invalid invoice, not readiness
      expect(result.success).toBe(false)
      expect(result.error).not.toContain('Cannot send payment')
      expect(isInitializedSpy).toHaveBeenCalled()
    })
  })

  describe('generateInvoice readiness guard', () => {
    it('should reject generateInvoice when readiness level is NOT_READY', async () => {
      // Given: service readiness is NOT_READY (default state)
      const isInitializedSpy = jest.spyOn(service, 'isInitialized').mockReturnValue(true)

      // When & Then: trying to generate invoice should throw readiness error
      await expect(
        service.generateInvoice({
          amount: 1000n,
          description: 'Test invoice',
        }),
      ).rejects.toThrow('Cannot generate invoice')
      expect(isInitializedSpy).toHaveBeenCalled()
    })

    it('should allow generateInvoice when readiness level is CAN_RECEIVE', async () => {
      // Given: service is initialized and readiness allows receiving
      const isInitializedSpy = jest.spyOn(service, 'isInitialized').mockReturnValue(true)
      service.updateReadinessState({
        isWalletLoaded: true,
        isTransportConnected: true,
      })

      // When & Then: trying to generate invoice should succeed (may fail for other reasons)
      await expect(
        service.generateInvoice({
          amount: 1000n,
          description: 'Test invoice',
        }),
      ).rejects.not.toThrow('Cannot generate invoice')
      expect(isInitializedSpy).toHaveBeenCalled()
    })

    it('should allow generateInvoice when readiness level is CAN_SEND', async () => {
      // Given: service is initialized and readiness allows sending
      const isInitializedSpy = jest.spyOn(service, 'isInitialized').mockReturnValue(true)
      service.updateReadinessState({
        isWalletLoaded: true,
        isTransportConnected: true,
        isPeerConnected: true,
      })

      // When & Then: trying to generate invoice should succeed (may fail for other reasons)
      await expect(
        service.generateInvoice({
          amount: 1000n,
          description: 'Test invoice',
        }),
      ).rejects.not.toThrow('Cannot generate invoice')
      expect(isInitializedSpy).toHaveBeenCalled()
    })

    it('should allow generateInvoice when readiness level is FULLY_READY', async () => {
      // Given: service is fully ready
      const isInitializedSpy = jest.spyOn(service, 'isInitialized').mockReturnValue(true)
      service.updateReadinessState({
        isWalletLoaded: true,
        isTransportConnected: true,
        isPeerConnected: true,
        isGossipSynced: true,
      })

      // When & Then: trying to generate invoice should succeed (may fail for other reasons)
      await expect(
        service.generateInvoice({
          amount: 1000n,
          description: 'Test invoice',
        }),
      ).rejects.not.toThrow('Cannot generate invoice')
      expect(isInitializedSpy).toHaveBeenCalled()
    })
  })

  describe('readiness state management', () => {
    it('should return initial readiness state', () => {
      // Given: service with default state

      // When: getting readiness state
      const state = service.getReadinessState()

      // Then: should return initial state
      expect(state).toEqual(createInitialReadinessState())
    })

    it('should update readiness state', () => {
      // Given: service with initial state
      const initialState = service.getReadinessState()

      // When: updating readiness state
      service.updateReadinessState({
        isWalletLoaded: true,
        isTransportConnected: true,
      })

      // Then: state should be updated
      const updatedState = service.getReadinessState()
      expect(updatedState.isWalletLoaded).toBe(true)
      expect(updatedState.isTransportConnected).toBe(true)
      expect(updatedState.isPeerConnected).toBe(initialState.isPeerConnected) // Should remain unchanged
    })
  })
})
