/**
 * Lightning Network Error Handling
 * Implements retry logic, circuit breakers, and recovery mechanisms
 * Following best practices for distributed systems resilience
 */

// ==========================================
// ERROR TYPES
// ==========================================

/**
 * Base Lightning Error
 */
export class LightningError extends Error {
  public readonly code: LightningErrorCode
  public readonly isRecoverable: boolean
  public readonly context?: Record<string, unknown>
  public readonly timestamp: number

  constructor(
    message: string,
    code: LightningErrorCode,
    isRecoverable: boolean = true,
    context?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'LightningError'
    this.code = code
    this.isRecoverable = isRecoverable
    this.context = context
    this.timestamp = Date.now()
  }
}

/**
 * Error codes for Lightning operations
 */
export enum LightningErrorCode {
  // Connection errors (1xx)
  CONNECTION_FAILED = 100,
  CONNECTION_TIMEOUT = 101,
  CONNECTION_CLOSED = 102,
  HANDSHAKE_FAILED = 103,
  TLS_ERROR = 104,

  // Channel errors (2xx)
  CHANNEL_NOT_FOUND = 200,
  CHANNEL_CLOSED = 201,
  CHANNEL_CAPACITY_EXCEEDED = 202,
  CHANNEL_RESERVE_NOT_MET = 203,
  CHANNEL_FUNDING_FAILED = 204,
  CHANNEL_STATE_INVALID = 205,

  // HTLC errors (3xx)
  HTLC_TIMEOUT = 300,
  HTLC_INVALID_PREIMAGE = 301,
  HTLC_AMOUNT_MISMATCH = 302,
  HTLC_EXPIRED = 303,
  HTLC_ROUTING_FAILED = 304,

  // Payment errors (4xx)
  PAYMENT_FAILED = 400,
  PAYMENT_TIMEOUT = 401,
  PAYMENT_NO_ROUTE = 402,
  PAYMENT_INSUFFICIENT_BALANCE = 403,
  PAYMENT_INVOICE_EXPIRED = 404,

  // Network errors (5xx)
  NETWORK_ERROR = 500,
  PEER_DISCONNECTED = 501,
  MESSAGE_DECODE_FAILED = 502,
  MESSAGE_ENCODE_FAILED = 503,

  // Persistence errors (6xx)
  PERSISTENCE_FAILED = 600,
  RESTORE_FAILED = 601,
  DATA_CORRUPTED = 602,

  // Crypto errors (7xx)
  CRYPTO_ERROR = 700,
  SIGNATURE_INVALID = 701,
  DECRYPTION_FAILED = 702,

  // Internal errors (9xx)
  INTERNAL_ERROR = 900,
  NOT_IMPLEMENTED = 901,
  INVALID_STATE = 902,
}

/**
 * Maps error codes to human-readable categories
 */
export function getErrorCategory(code: LightningErrorCode): string {
  if (code >= 100 && code < 200) return 'Connection'
  if (code >= 200 && code < 300) return 'Channel'
  if (code >= 300 && code < 400) return 'HTLC'
  if (code >= 400 && code < 500) return 'Payment'
  if (code >= 500 && code < 600) return 'Network'
  if (code >= 600 && code < 700) return 'Persistence'
  if (code >= 700 && code < 800) return 'Crypto'
  return 'Internal'
}

// ==========================================
// RETRY LOGIC
// ==========================================

/**
 * Retry configuration options
 */
export interface RetryConfig {
  maxAttempts: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  jitterFactor: number // 0-1, adds randomness to delays
  retryableErrors?: LightningErrorCode[]
  onRetry?: (attempt: number, error: Error, delayMs: number) => void
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
  retryableErrors: [
    LightningErrorCode.CONNECTION_TIMEOUT,
    LightningErrorCode.NETWORK_ERROR,
    LightningErrorCode.PEER_DISCONNECTED,
    LightningErrorCode.HTLC_TIMEOUT,
  ],
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  success: boolean
  result?: T
  error?: Error
  attempts: number
  totalDelayMs: number
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1)
  const cappedDelay = Math.min(baseDelay, config.maxDelayMs)

  // Add jitter to prevent thundering herd
  const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1)
  return Math.max(0, Math.floor(cappedDelay + jitter))
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Check if an error is retryable based on config
 */
function isRetryable(error: unknown, config: RetryConfig): boolean {
  if (error instanceof LightningError) {
    if (!error.isRecoverable) return false
    if (config.retryableErrors && config.retryableErrors.length > 0) {
      return config.retryableErrors.includes(error.code)
    }
    return error.isRecoverable
  }
  // For generic errors, retry network-related ones
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('econnreset') ||
      message.includes('enotfound')
    )
  }
  return false
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<RetryResult<T>> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  let lastError: Error | undefined
  let totalDelayMs = 0

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    try {
      const result = await operation()
      return {
        success: true,
        result,
        attempts: attempt,
        totalDelayMs,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Check if we should retry
      if (attempt < fullConfig.maxAttempts && isRetryable(error, fullConfig)) {
        const delayMs = calculateDelay(attempt, fullConfig)
        totalDelayMs += delayMs

        if (fullConfig.onRetry) {
          fullConfig.onRetry(attempt, lastError, delayMs)
        }

        console.log(
          `[retry] Attempt ${attempt}/${fullConfig.maxAttempts} failed, retrying in ${delayMs}ms: ${lastError.message}`,
        )

        await sleep(delayMs)
      } else {
        // No more retries or error is not retryable
        break
      }
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: fullConfig.maxAttempts,
    totalDelayMs,
  }
}

// ==========================================
// CIRCUIT BREAKER
// ==========================================

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed', // Normal operation
  OPEN = 'open', // Failing, reject requests
  HALF_OPEN = 'half_open', // Testing recovery
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number // Number of failures before opening
  successThreshold: number // Successes needed to close from half-open
  timeout: number // Time in ms before attempting recovery
  volumeThreshold: number // Minimum requests before tripping
  errorFilter?: (error: Error) => boolean // Custom filter for errors that trip breaker
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  volumeThreshold: 5,
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitState
  failures: number
  successes: number
  totalRequests: number
  lastFailureTime?: number
  lastStateChange: number
}

/**
 * Circuit Breaker implementation
 * Prevents cascading failures by failing fast when a service is unhealthy
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failures: number = 0
  private successes: number = 0
  private totalRequests: number = 0
  private lastFailureTime?: number
  private lastStateChange: number = Date.now()
  private readonly config: CircuitBreakerConfig
  private readonly name: string

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config }
  }

  /**
   * Get current state and statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
    }
  }

  /**
   * Check if circuit allows requests
   */
  isAllowed(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true
    }

    if (this.state === CircuitState.OPEN) {
      // Check if timeout has elapsed
      const elapsed = Date.now() - this.lastStateChange
      if (elapsed >= this.config.timeout) {
        this.transitionTo(CircuitState.HALF_OPEN)
        return true
      }
      return false
    }

    // Half-open: allow limited requests
    return true
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this.totalRequests++
    this.successes++

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes >= this.config.successThreshold) {
        this.reset()
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failures = 0
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(error?: Error): void {
    this.totalRequests++
    this.failures++
    this.lastFailureTime = Date.now()

    // Check if error should trip breaker
    if (error && this.config.errorFilter && !this.config.errorFilter(error)) {
      return
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open goes back to open
      this.transitionTo(CircuitState.OPEN)
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we've hit the threshold
      if (
        this.totalRequests >= this.config.volumeThreshold &&
        this.failures >= this.config.failureThreshold
      ) {
        this.transitionTo(CircuitState.OPEN)
      }
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    console.log(`[circuit-breaker:${this.name}] ${this.state} -> ${newState}`)
    this.state = newState
    this.lastStateChange = Date.now()

    if (newState === CircuitState.HALF_OPEN) {
      this.successes = 0
    }
  }

  /**
   * Reset the circuit breaker to initial state
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED)
    this.failures = 0
    this.successes = 0
  }

  /**
   * Force the circuit to open
   */
  trip(): void {
    this.transitionTo(CircuitState.OPEN)
  }

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.isAllowed()) {
      throw new LightningError(
        `Circuit breaker '${this.name}' is open`,
        LightningErrorCode.INTERNAL_ERROR,
        true,
        { circuitState: this.state },
      )
    }

    try {
      const result = await operation()
      this.recordSuccess()
      return result
    } catch (error) {
      this.recordFailure(error instanceof Error ? error : undefined)
      throw error
    }
  }
}

// ==========================================
// RECOVERY MECHANISMS
// ==========================================

/**
 * Recovery strategy types
 */
export enum RecoveryStrategy {
  RETRY = 'retry',
  RECONNECT = 'reconnect',
  FALLBACK = 'fallback',
  SKIP = 'skip',
  ABORT = 'abort',
}

/**
 * Recovery action configuration
 */
export interface RecoveryAction {
  strategy: RecoveryStrategy
  execute: () => Promise<void>
  condition?: () => boolean
  priority: number
}

/**
 * Recovery context
 */
export interface RecoveryContext {
  error: Error
  operation: string
  attempt: number
  timestamp: number
  channelId?: string
  peerId?: string
}

/**
 * Recovery handler result
 */
export interface RecoveryResult {
  recovered: boolean
  strategy: RecoveryStrategy
  message: string
}

/**
 * Recovery Manager
 * Coordinates recovery strategies for different failure scenarios
 */
export class RecoveryManager {
  private recoveryActions: Map<LightningErrorCode, RecoveryAction[]> = new Map()
  private recoveryHistory: RecoveryContext[] = []
  private maxHistorySize: number = 100

  /**
   * Register a recovery action for an error code
   */
  registerRecoveryAction(errorCode: LightningErrorCode, action: RecoveryAction): void {
    const actions = this.recoveryActions.get(errorCode) || []
    actions.push(action)
    // Sort by priority (lower = higher priority)
    actions.sort((a, b) => a.priority - b.priority)
    this.recoveryActions.set(errorCode, actions)
  }

  /**
   * Attempt to recover from an error
   */
  async recover(context: RecoveryContext): Promise<RecoveryResult> {
    this.addToHistory(context)

    const errorCode =
      context.error instanceof LightningError
        ? context.error.code
        : LightningErrorCode.INTERNAL_ERROR

    const actions = this.recoveryActions.get(errorCode) || []

    for (const action of actions) {
      // Check condition if present
      if (action.condition && !action.condition()) {
        continue
      }

      try {
        console.log(`[recovery] Attempting ${action.strategy} recovery for ${context.operation}`)
        await action.execute()
        return {
          recovered: true,
          strategy: action.strategy,
          message: `Successfully recovered using ${action.strategy} strategy`,
        }
      } catch (error) {
        console.error(`[recovery] ${action.strategy} recovery failed:`, error)
        continue
      }
    }

    return {
      recovered: false,
      strategy: RecoveryStrategy.ABORT,
      message: `All recovery strategies exhausted for ${context.operation}`,
    }
  }

  /**
   * Add recovery attempt to history
   */
  private addToHistory(context: RecoveryContext): void {
    this.recoveryHistory.push(context)
    if (this.recoveryHistory.length > this.maxHistorySize) {
      this.recoveryHistory.shift()
    }
  }

  /**
   * Get recent recovery history
   */
  getHistory(limit: number = 10): RecoveryContext[] {
    return this.recoveryHistory.slice(-limit)
  }

  /**
   * Get failure frequency for an operation
   */
  getFailureFrequency(operation: string, windowMs: number = 60000): number {
    const cutoff = Date.now() - windowMs
    return this.recoveryHistory.filter(ctx => ctx.operation === operation && ctx.timestamp > cutoff)
      .length
  }

  /**
   * Clear recovery history
   */
  clearHistory(): void {
    this.recoveryHistory = []
  }
}

// ==========================================
// ERROR AGGREGATOR
// ==========================================

/**
 * Aggregated error statistics
 */
export interface ErrorStats {
  totalErrors: number
  errorsByCode: Map<LightningErrorCode, number>
  errorsByCategory: Map<string, number>
  recentErrors: {
    error: LightningError
    timestamp: number
  }[]
  errorRate: number // errors per minute
}

/**
 * Error Aggregator
 * Collects and analyzes error patterns
 */
export class ErrorAggregator {
  private errors: { error: LightningError; timestamp: number }[] = []
  private maxErrors: number = 1000
  private windowMs: number = 60000 // 1 minute for rate calculation

  /**
   * Record an error
   */
  record(error: Error): void {
    const lightningError =
      error instanceof LightningError
        ? error
        : new LightningError(error.message, LightningErrorCode.INTERNAL_ERROR, true)

    this.errors.push({
      error: lightningError,
      timestamp: Date.now(),
    })

    // Trim old errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors)
    }
  }

  /**
   * Get error statistics
   */
  getStats(): ErrorStats {
    const errorsByCode = new Map<LightningErrorCode, number>()
    const errorsByCategory = new Map<string, number>()
    const cutoff = Date.now() - this.windowMs

    for (const { error } of this.errors) {
      // Count by code
      const codeCount = errorsByCode.get(error.code) || 0
      errorsByCode.set(error.code, codeCount + 1)

      // Count by category
      const category = getErrorCategory(error.code)
      const categoryCount = errorsByCategory.get(category) || 0
      errorsByCategory.set(category, categoryCount + 1)
    }

    // Calculate error rate (errors in last window)
    const recentErrorCount = this.errors.filter(e => e.timestamp > cutoff).length
    const errorRate = (recentErrorCount / this.windowMs) * 60000 // per minute

    return {
      totalErrors: this.errors.length,
      errorsByCode,
      errorsByCategory,
      recentErrors: this.errors.slice(-10),
      errorRate,
    }
  }

  /**
   * Check if error rate exceeds threshold
   */
  isErrorRateHigh(threshold: number = 10): boolean {
    return this.getStats().errorRate > threshold
  }

  /**
   * Get most common error codes
   */
  getMostCommonErrors(limit: number = 5): { code: LightningErrorCode; count: number }[] {
    const stats = this.getStats()
    return Array.from(stats.errorsByCode.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }

  /**
   * Clear all recorded errors
   */
  clear(): void {
    this.errors = []
  }
}

// ==========================================
// HEALTH CHECK
// ==========================================

/**
 * Component health status
 */
export interface HealthStatus {
  healthy: boolean
  status: 'healthy' | 'degraded' | 'unhealthy'
  message: string
  lastCheck: number
  details?: Record<string, unknown>
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  name: string
  check: () => Promise<boolean>
  interval: number
  timeout: number
  onStatusChange?: (status: HealthStatus) => void
}

/**
 * Health Monitor
 * Monitors system health and triggers alerts
 */
export class HealthMonitor {
  private checks: Map<string, HealthCheckConfig> = new Map()
  private status: Map<string, HealthStatus> = new Map()
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map()

  /**
   * Register a health check
   */
  registerCheck(config: HealthCheckConfig): void {
    this.checks.set(config.name, config)
    this.status.set(config.name, {
      healthy: true,
      status: 'healthy',
      message: 'Not checked yet',
      lastCheck: 0,
    })
  }

  /**
   * Start health monitoring
   */
  start(): void {
    for (const [name, config] of this.checks) {
      const interval = setInterval(async () => {
        await this.runCheck(name)
      }, config.interval)
      this.intervals.set(name, interval)

      // Run initial check
      this.runCheck(name)
    }
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval)
    }
    this.intervals.clear()
  }

  /**
   * Run a specific health check
   */
  private async runCheck(name: string): Promise<void> {
    const config = this.checks.get(name)
    if (!config) return

    const previousStatus = this.status.get(name)

    try {
      const result = await Promise.race([
        config.check(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), config.timeout),
        ),
      ])

      const newStatus: HealthStatus = {
        healthy: result,
        status: result ? 'healthy' : 'unhealthy',
        message: result ? 'Check passed' : 'Check failed',
        lastCheck: Date.now(),
      }

      this.status.set(name, newStatus)

      if (previousStatus?.healthy !== newStatus.healthy && config.onStatusChange) {
        config.onStatusChange(newStatus)
      }
    } catch (error) {
      const newStatus: HealthStatus = {
        healthy: false,
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: Date.now(),
      }

      this.status.set(name, newStatus)

      if (previousStatus?.healthy !== false && config.onStatusChange) {
        config.onStatusChange(newStatus)
      }
    }
  }

  /**
   * Get all health statuses
   */
  getStatus(): Map<string, HealthStatus> {
    return new Map(this.status)
  }

  /**
   * Check if all components are healthy
   */
  isHealthy(): boolean {
    for (const status of this.status.values()) {
      if (!status.healthy) return false
    }
    return true
  }

  /**
   * Get overall system status
   */
  getOverallStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    let hasUnhealthy = false
    let hasDegraded = false

    for (const status of this.status.values()) {
      if (status.status === 'unhealthy') hasUnhealthy = true
      if (status.status === 'degraded') hasDegraded = true
    }

    if (hasUnhealthy) return 'unhealthy'
    if (hasDegraded) return 'degraded'
    return 'healthy'
  }
}

// ==========================================
// TIMEOUT WRAPPER
// ==========================================

/**
 * Wrap a promise with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out',
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new LightningError(errorMessage, LightningErrorCode.HTLC_TIMEOUT, true))
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timeoutId!)
    return result
  } catch (error) {
    clearTimeout(timeoutId!)
    throw error
  }
}

// ==========================================
// GRACEFUL DEGRADATION
// ==========================================

/**
 * Fallback configuration
 */
export interface FallbackConfig<T> {
  primary: () => Promise<T>
  fallbacks: (() => Promise<T>)[]
  timeout?: number
}

/**
 * Execute with fallback options
 */
export async function withFallback<T>(config: FallbackConfig<T>): Promise<T> {
  const operations = [config.primary, ...config.fallbacks]
  let lastError: Error | undefined

  for (let i = 0; i < operations.length; i++) {
    try {
      const operation = operations[i]
      if (config.timeout) {
        return await withTimeout(operation(), config.timeout, `Operation ${i + 1} timed out`)
      }
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.log(`[fallback] Option ${i + 1} failed: ${lastError.message}`)
      continue
    }
  }

  throw lastError || new Error('All fallback options exhausted')
}

// ==========================================
// RATE LIMITER
// ==========================================

/**
 * Rate limiter using token bucket algorithm
 */
export class RateLimiter {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number
  private readonly refillRate: number // tokens per second

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens
    this.refillRate = refillRate
    this.tokens = maxTokens
    this.lastRefill = Date.now()
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    const tokensToAdd = elapsed * this.refillRate
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd)
    this.lastRefill = now
  }

  /**
   * Try to acquire a token
   */
  tryAcquire(tokens: number = 1): boolean {
    this.refill()
    if (this.tokens >= tokens) {
      this.tokens -= tokens
      return true
    }
    return false
  }

  /**
   * Wait until token is available
   */
  async acquire(tokens: number = 1): Promise<void> {
    while (!this.tryAcquire(tokens)) {
      const waitTime = ((tokens - this.tokens) / this.refillRate) * 1000
      await sleep(Math.max(10, waitTime))
    }
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill()
    return this.tokens
  }
}

// ==========================================
// EXPORTED UTILITIES
// ==========================================

/**
 * Create a pre-configured retry wrapper for Lightning operations
 */
export function createLightningRetry(customConfig?: Partial<RetryConfig>) {
  const config = { ...DEFAULT_RETRY_CONFIG, ...customConfig }
  return <T>(operation: () => Promise<T>) => withRetry(operation, config)
}

/**
 * Create a circuit breaker for a specific operation type
 */
export function createOperationCircuitBreaker(
  operationType: string,
  customConfig?: Partial<CircuitBreakerConfig>,
): CircuitBreaker {
  return new CircuitBreaker(`lightning-${operationType}`, customConfig)
}
