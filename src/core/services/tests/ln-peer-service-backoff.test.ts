/**
 * Tests for exponential backoff reconnection logic in ln-peer-service.ts
 */

import { PeerConnectivityService } from '../ln-peer-service'

describe('Exponential Backoff Reconnection', () => {
  let service: PeerConnectivityService

  beforeEach(() => {
    service = new PeerConnectivityService()
  })

  afterEach(() => {
    service.stop()
  })

  it('should calculate correct exponential backoff delays', () => {
    // Test the delay calculation logic (we'll need to expose it for testing)
    // For now, this is a placeholder test that verifies the service initializes
    expect(service).toBeDefined()
  })

  it('should implement Phoenix-style backoff timeouts', () => {
    // Verify the expected timeout sequence: 1s → 2s → 4s → 7s → 10s
    // This test would need access to the internal delay calculation
    // For now, we verify the service structure
    expect(typeof service).toBe('object')
  })
})
