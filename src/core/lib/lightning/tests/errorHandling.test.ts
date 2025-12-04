import {
  LightningError,
  LightningErrorCode,
  getErrorCategory,
  withRetry,
  withTimeout,
  withFallback,
  CircuitBreaker,
  CircuitState,
  RecoveryManager,
  RecoveryStrategy,
  ErrorAggregator,
  HealthMonitor,
  RateLimiter,
  DEFAULT_RETRY_CONFIG,
} from '../errorHandling'

describe('Error Handling', () => {
  // ==========================================
  // LightningError
  // ==========================================

  describe('LightningError', () => {
    it('should create error with correct properties', () => {
      const error = new LightningError('Test error', LightningErrorCode.CONNECTION_FAILED, true, {
        test: 'context',
      })

      expect(error.message).toBe('Test error')
      expect(error.code).toBe(LightningErrorCode.CONNECTION_FAILED)
      expect(error.isRecoverable).toBe(true)
      expect(error.context).toEqual({ test: 'context' })
      expect(error.timestamp).toBeGreaterThan(0)
      expect(error.name).toBe('LightningError')
    })

    it('should default to recoverable', () => {
      const error = new LightningError('Test', LightningErrorCode.NETWORK_ERROR)
      expect(error.isRecoverable).toBe(true)
    })
  })

  describe('getErrorCategory', () => {
    it('should return correct categories', () => {
      expect(getErrorCategory(LightningErrorCode.CONNECTION_FAILED)).toBe('Connection')
      expect(getErrorCategory(LightningErrorCode.CHANNEL_NOT_FOUND)).toBe('Channel')
      expect(getErrorCategory(LightningErrorCode.HTLC_TIMEOUT)).toBe('HTLC')
      expect(getErrorCategory(LightningErrorCode.PAYMENT_FAILED)).toBe('Payment')
      expect(getErrorCategory(LightningErrorCode.NETWORK_ERROR)).toBe('Network')
      expect(getErrorCategory(LightningErrorCode.PERSISTENCE_FAILED)).toBe('Persistence')
      expect(getErrorCategory(LightningErrorCode.CRYPTO_ERROR)).toBe('Crypto')
      expect(getErrorCategory(LightningErrorCode.INTERNAL_ERROR)).toBe('Internal')
    })
  })

  // ==========================================
  // Retry Logic
  // ==========================================

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success')

      const result = await withRetry(operation)

      expect(result.success).toBe(true)
      expect(result.result).toBe('success')
      expect(result.attempts).toBe(1)
      expect(operation).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure and eventually succeed', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(
          new LightningError('timeout', LightningErrorCode.CONNECTION_TIMEOUT, true),
        )
        .mockResolvedValueOnce('success')

      const result = await withRetry(operation, {
        maxAttempts: 3,
        initialDelayMs: 10,
      })

      expect(result.success).toBe(true)
      expect(result.result).toBe('success')
      expect(result.attempts).toBe(2)
      expect(operation).toHaveBeenCalledTimes(2)
    })

    it('should fail after max attempts', async () => {
      const error = new LightningError('timeout', LightningErrorCode.CONNECTION_TIMEOUT, true)
      const operation = jest.fn().mockRejectedValue(error)

      const result = await withRetry(operation, {
        maxAttempts: 2,
        initialDelayMs: 10,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe(error)
      expect(result.attempts).toBe(2)
    })

    it('should not retry non-recoverable errors', async () => {
      const error = new LightningError('fatal', LightningErrorCode.INTERNAL_ERROR, false)
      const operation = jest.fn().mockRejectedValue(error)

      const result = await withRetry(operation, {
        maxAttempts: 3,
        initialDelayMs: 10,
      })

      expect(result.success).toBe(false)
      expect(operation).toHaveBeenCalledTimes(1) // No retry
    })

    it('should call onRetry callback', async () => {
      const onRetry = jest.fn()
      const operation = jest
        .fn()
        .mockRejectedValueOnce(
          new LightningError('timeout', LightningErrorCode.CONNECTION_TIMEOUT, true),
        )
        .mockResolvedValueOnce('success')

      await withRetry(operation, {
        maxAttempts: 3,
        initialDelayMs: 10,
        onRetry,
      })

      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number))
    })
  })

  // ==========================================
  // Timeout
  // ==========================================

  describe('withTimeout', () => {
    it('should resolve if operation completes in time', async () => {
      const operation = new Promise<string>(resolve => setTimeout(() => resolve('done'), 10))

      const result = await withTimeout(operation, 1000)

      expect(result).toBe('done')
    })

    it('should reject if operation times out', async () => {
      const operation = new Promise<string>(resolve => setTimeout(() => resolve('done'), 1000))

      await expect(withTimeout(operation, 10, 'Operation timed out')).rejects.toThrow(
        'Operation timed out',
      )
    })
  })

  // ==========================================
  // Fallback
  // ==========================================

  describe('withFallback', () => {
    it('should use primary if it succeeds', async () => {
      const primary = jest.fn().mockResolvedValue('primary')
      const fallback = jest.fn().mockResolvedValue('fallback')

      const result = await withFallback({
        primary,
        fallbacks: [fallback],
      })

      expect(result).toBe('primary')
      expect(fallback).not.toHaveBeenCalled()
    })

    it('should use fallback if primary fails', async () => {
      const primary = jest.fn().mockRejectedValue(new Error('primary failed'))
      const fallback = jest.fn().mockResolvedValue('fallback')

      const result = await withFallback({
        primary,
        fallbacks: [fallback],
      })

      expect(result).toBe('fallback')
      expect(primary).toHaveBeenCalled()
      expect(fallback).toHaveBeenCalled()
    })

    it('should try multiple fallbacks', async () => {
      const primary = jest.fn().mockRejectedValue(new Error('primary failed'))
      const fallback1 = jest.fn().mockRejectedValue(new Error('fallback1 failed'))
      const fallback2 = jest.fn().mockResolvedValue('fallback2')

      const result = await withFallback({
        primary,
        fallbacks: [fallback1, fallback2],
      })

      expect(result).toBe('fallback2')
    })

    it('should throw if all options fail', async () => {
      const primary = jest.fn().mockRejectedValue(new Error('primary failed'))
      const fallback = jest.fn().mockRejectedValue(new Error('fallback failed'))

      await expect(
        withFallback({
          primary,
          fallbacks: [fallback],
        }),
      ).rejects.toThrow('fallback failed')
    })
  })

  // ==========================================
  // Circuit Breaker
  // ==========================================

  describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker

    beforeEach(() => {
      breaker = new CircuitBreaker('test', {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 100,
        volumeThreshold: 3,
      })
    })

    it('should start in closed state', () => {
      expect(breaker.getStats().state).toBe(CircuitState.CLOSED)
    })

    it('should allow requests when closed', () => {
      expect(breaker.isAllowed()).toBe(true)
    })

    it('should record successes', () => {
      breaker.recordSuccess()
      expect(breaker.getStats().successes).toBe(1)
    })

    it('should open after failure threshold', () => {
      // Need to meet volume threshold first
      breaker.recordFailure()
      breaker.recordFailure()
      breaker.recordFailure()

      expect(breaker.getStats().state).toBe(CircuitState.OPEN)
    })

    it('should reject requests when open', () => {
      breaker.recordFailure()
      breaker.recordFailure()
      breaker.recordFailure()

      expect(breaker.isAllowed()).toBe(false)
    })

    it('should transition to half-open after timeout', async () => {
      breaker.recordFailure()
      breaker.recordFailure()
      breaker.recordFailure()

      expect(breaker.getStats().state).toBe(CircuitState.OPEN)

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(breaker.isAllowed()).toBe(true)
      expect(breaker.getStats().state).toBe(CircuitState.HALF_OPEN)
    })

    it('should close after success threshold in half-open', async () => {
      // Open the breaker
      breaker.recordFailure()
      breaker.recordFailure()
      breaker.recordFailure()

      // Wait for timeout to go to half-open
      await new Promise(resolve => setTimeout(resolve, 150))
      breaker.isAllowed() // Trigger transition to half-open

      // Record successes
      breaker.recordSuccess()
      breaker.recordSuccess()

      expect(breaker.getStats().state).toBe(CircuitState.CLOSED)
    })

    it('should reset correctly', () => {
      breaker.recordFailure()
      breaker.recordFailure()
      breaker.recordFailure()

      expect(breaker.getStats().state).toBe(CircuitState.OPEN)

      breaker.reset()

      expect(breaker.getStats().state).toBe(CircuitState.CLOSED)
      expect(breaker.getStats().failures).toBe(0)
    })

    it('should execute with circuit breaker protection', async () => {
      const operation = jest.fn().mockResolvedValue('success')

      const result = await breaker.execute(operation)

      expect(result).toBe('success')
      expect(breaker.getStats().successes).toBe(1)
    })

    it('should throw when circuit is open', async () => {
      breaker.trip()

      await expect(breaker.execute(() => Promise.resolve('success'))).rejects.toThrow(
        "Circuit breaker 'test' is open",
      )
    })
  })

  // ==========================================
  // Recovery Manager
  // ==========================================

  describe('RecoveryManager', () => {
    let manager: RecoveryManager

    beforeEach(() => {
      manager = new RecoveryManager()
    })

    it('should register recovery actions', () => {
      const action = {
        strategy: RecoveryStrategy.RETRY,
        priority: 1,
        execute: jest.fn().mockResolvedValue(undefined),
      }

      manager.registerRecoveryAction(LightningErrorCode.CONNECTION_TIMEOUT, action)

      // Action is registered (internal state)
      expect(manager).toBeDefined()
    })

    it('should recover using registered action', async () => {
      const execute = jest.fn().mockResolvedValue(undefined)
      manager.registerRecoveryAction(LightningErrorCode.CONNECTION_TIMEOUT, {
        strategy: RecoveryStrategy.RETRY,
        priority: 1,
        execute,
      })

      const result = await manager.recover({
        error: new LightningError('timeout', LightningErrorCode.CONNECTION_TIMEOUT, true),
        operation: 'test-operation',
        attempt: 1,
        timestamp: Date.now(),
      })

      expect(result.recovered).toBe(true)
      expect(result.strategy).toBe(RecoveryStrategy.RETRY)
      expect(execute).toHaveBeenCalled()
    })

    it('should return abort if no recovery action works', async () => {
      const result = await manager.recover({
        error: new LightningError('unknown', LightningErrorCode.INTERNAL_ERROR, true),
        operation: 'test-operation',
        attempt: 1,
        timestamp: Date.now(),
      })

      expect(result.recovered).toBe(false)
      expect(result.strategy).toBe(RecoveryStrategy.ABORT)
    })

    it('should maintain recovery history', async () => {
      await manager.recover({
        error: new LightningError('test', LightningErrorCode.NETWORK_ERROR, true),
        operation: 'test-op',
        attempt: 1,
        timestamp: Date.now(),
      })

      const history = manager.getHistory()
      expect(history.length).toBe(1)
      expect(history[0].operation).toBe('test-op')
    })

    it('should calculate failure frequency', async () => {
      const now = Date.now()
      await manager.recover({
        error: new LightningError('test', LightningErrorCode.NETWORK_ERROR, true),
        operation: 'test-op',
        attempt: 1,
        timestamp: now,
      })
      await manager.recover({
        error: new LightningError('test', LightningErrorCode.NETWORK_ERROR, true),
        operation: 'test-op',
        attempt: 1,
        timestamp: now,
      })

      const frequency = manager.getFailureFrequency('test-op')
      expect(frequency).toBe(2)
    })
  })

  // ==========================================
  // Error Aggregator
  // ==========================================

  describe('ErrorAggregator', () => {
    let aggregator: ErrorAggregator

    beforeEach(() => {
      aggregator = new ErrorAggregator()
    })

    it('should record errors', () => {
      aggregator.record(new LightningError('test', LightningErrorCode.NETWORK_ERROR, true))

      const stats = aggregator.getStats()
      expect(stats.totalErrors).toBe(1)
    })

    it('should count errors by code', () => {
      aggregator.record(new LightningError('test', LightningErrorCode.NETWORK_ERROR, true))
      aggregator.record(new LightningError('test', LightningErrorCode.NETWORK_ERROR, true))
      aggregator.record(new LightningError('test', LightningErrorCode.CONNECTION_FAILED, true))

      const stats = aggregator.getStats()
      expect(stats.errorsByCode.get(LightningErrorCode.NETWORK_ERROR)).toBe(2)
      expect(stats.errorsByCode.get(LightningErrorCode.CONNECTION_FAILED)).toBe(1)
    })

    it('should count errors by category', () => {
      aggregator.record(new LightningError('test', LightningErrorCode.NETWORK_ERROR, true))
      aggregator.record(new LightningError('test', LightningErrorCode.PEER_DISCONNECTED, true))
      aggregator.record(new LightningError('test', LightningErrorCode.CHANNEL_NOT_FOUND, true))

      const stats = aggregator.getStats()
      expect(stats.errorsByCategory.get('Network')).toBe(2)
      expect(stats.errorsByCategory.get('Channel')).toBe(1)
    })

    it('should get most common errors', () => {
      for (let i = 0; i < 5; i++) {
        aggregator.record(new LightningError('test', LightningErrorCode.NETWORK_ERROR, true))
      }
      for (let i = 0; i < 3; i++) {
        aggregator.record(new LightningError('test', LightningErrorCode.CONNECTION_FAILED, true))
      }

      const common = aggregator.getMostCommonErrors(2)
      expect(common[0].code).toBe(LightningErrorCode.NETWORK_ERROR)
      expect(common[0].count).toBe(5)
      expect(common[1].code).toBe(LightningErrorCode.CONNECTION_FAILED)
    })

    it('should detect high error rate', () => {
      for (let i = 0; i < 25; i++) {
        aggregator.record(new LightningError('test', LightningErrorCode.NETWORK_ERROR, true))
      }

      expect(aggregator.isErrorRateHigh(20)).toBe(true)
    })

    it('should clear errors', () => {
      aggregator.record(new LightningError('test', LightningErrorCode.NETWORK_ERROR, true))
      aggregator.clear()

      const stats = aggregator.getStats()
      expect(stats.totalErrors).toBe(0)
    })
  })

  // ==========================================
  // Health Monitor
  // ==========================================

  describe('HealthMonitor', () => {
    let monitor: HealthMonitor

    beforeEach(() => {
      monitor = new HealthMonitor()
    })

    afterEach(() => {
      monitor.stop()
    })

    it('should register health checks', () => {
      monitor.registerCheck({
        name: 'test',
        interval: 1000,
        timeout: 100,
        check: async () => true,
      })

      expect(monitor.getStatus().has('test')).toBe(true)
    })

    it('should start and stop monitoring', () => {
      monitor.registerCheck({
        name: 'test',
        interval: 100,
        timeout: 50,
        check: async () => true,
      })

      monitor.start()
      // No assertion needed, just checking no errors
      monitor.stop()
    })

    it('should report overall healthy status', () => {
      monitor.registerCheck({
        name: 'test1',
        interval: 1000,
        timeout: 100,
        check: async () => true,
      })
      monitor.registerCheck({
        name: 'test2',
        interval: 1000,
        timeout: 100,
        check: async () => true,
      })

      expect(monitor.isHealthy()).toBe(true)
      expect(monitor.getOverallStatus()).toBe('healthy')
    })
  })

  // ==========================================
  // Rate Limiter
  // ==========================================

  describe('RateLimiter', () => {
    it('should allow requests under limit', () => {
      const limiter = new RateLimiter(10, 1)

      expect(limiter.tryAcquire()).toBe(true)
      expect(limiter.getTokens()).toBeLessThan(10)
    })

    it('should reject when tokens exhausted', () => {
      const limiter = new RateLimiter(2, 0.001) // Very slow refill

      expect(limiter.tryAcquire()).toBe(true)
      expect(limiter.tryAcquire()).toBe(true)
      expect(limiter.tryAcquire()).toBe(false) // No tokens left
    })

    it('should refill tokens over time', async () => {
      const limiter = new RateLimiter(10, 100) // 100 tokens per second

      // Exhaust some tokens
      limiter.tryAcquire(5)
      expect(limiter.getTokens()).toBeLessThan(10)

      // Wait for refill
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(limiter.getTokens()).toBeGreaterThan(5)
    })

    it('should wait for token availability', async () => {
      const limiter = new RateLimiter(1, 100) // 1 token, fast refill

      limiter.tryAcquire() // Use the token

      const start = Date.now()
      await limiter.acquire()
      const elapsed = Date.now() - start

      expect(elapsed).toBeGreaterThan(0)
    })
  })
})
