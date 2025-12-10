// Tests for Channel Reestablish Service

import { ChannelReestablishService } from '../ln-channel-reestablish-service'

describe('ChannelReestablishService', () => {
  it('should instantiate', () => {
    const service = new ChannelReestablishService()
    expect(service).toBeDefined()
  })
})
