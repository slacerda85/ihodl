// Error Recovery Service
// Implements circuit breaker pattern and exponential backoff for Lightning operations
// Provides health monitoring and automatic recovery mechanisms

import EventEmitter from 'eventemitter3'

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface CircuitBreakerConfig {
  failureThreshold: number // Number of failures before opening circuit
  recoveryTimeout: number // Time to wait before attempting recovery (ms)
  monitoringPeriod: number // Time window for failure counting (ms)
  successThreshold: number // Number of successes needed to close circuit
}

export interface RetryConfig {
  maxAttempts: number
  baseDelay: number // Base delay in ms
  maxDelay: number // Maximum delay in ms
  backoffFactor: number // Exponential backoff multiplier
  jitter: boolean // Add random jitter to delay
}

export interface ErrorRecoveryConfig {
  circuitBreaker: CircuitBreakerConfig
  retry: RetryConfig
  healthCheckInterval: number
  maxConcurrentRecoveries: number
}

export interface CircuitBreakerState {
  name: string
  status: 'closed' | 'open' | 'half-open'
  failures: number
  successes: number
  lastFailureTime: number
  lastSuccessTime: number
  nextAttemptTime: number
}

export interface RecoveryOperation {
  id: string
  name: string
  operation: () => Promise<any>
  priority: 'low' | 'medium' | 'high' | 'critical'
  retryCount: number
  lastAttempt: number
  circuitBreaker?: string
}

export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  circuitBreakers: CircuitBreakerState[]
  activeRecoveries: number
  failedRecoveries: number
  uptime: number
  lastHealthCheck: number
}

export type RecoveryEventType =
  | 'circuit_opened'
  | 'circuit_closed'
  | 'circuit_half_open'
  | 'recovery_started'
  | 'recovery_completed'
  | 'recovery_failed'
  | 'health_check'

export interface RecoveryEvent {
  type: RecoveryEventType
  data?: any
  timestamp: number
}

// ==========================================
// CONSTANTS
// ==========================================

const DEFAULT_CONFIG: ErrorRecoveryConfig = {
  circuitBreaker: {
    failureThreshold: 5,
    recoveryTimeout: 60000, // 1 minute
    monitoringPeriod: 300000, // 5 minutes
    successThreshold: 3,
  },
  retry: {
    maxAttempts: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffFactor: 2,
    jitter: true,
  },
  healthCheckInterval: 30000, // 30 seconds
  maxConcurrentRecoveries: 3,
}

// ==========================================
// CIRCUIT BREAKER
// ==========================================

export class CircuitBreaker {
  private config: CircuitBreakerConfig
  private state: CircuitBreakerState

  constructor(name: string, config: CircuitBreakerConfig) {
    this.config = config
    this.state = {
      name,
      status: 'closed',
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      lastSuccessTime: 0,
      nextAttemptTime: 0,
    }
  }

  /**
   * Execute an operation through the circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.status === 'open') {
      if (Date.now() < this.state.nextAttemptTime) {
        throw new Error(`Circuit breaker '${this.state.name}' is open`)
      }

      // Transition to half-open
      this.state.status = 'half-open'
      console.log(`[CircuitBreaker:${this.state.name}] Transitioned to half-open`)
    }

    try {
      const result = await operation()
      this.recordSuccess()
      return result
    } catch (error) {
      this.recordFailure()
      throw error
    }
  }

  /**
   * Record a successful operation
   */
  private recordSuccess(): void {
    this.state.successes++
    this.state.lastSuccessTime = Date.now()

    if (this.state.status === 'half-open' && this.state.successes >= this.config.successThreshold) {
      this.state.status = 'closed'
      this.state.failures = 0
      this.state.successes = 0
      console.log(
        `[CircuitBreaker:${this.state.name}] Closed after ${this.config.successThreshold} successes`,
      )
    }
  }

  /**
   * Record a failed operation
   */
  private recordFailure(): void {
    this.state.failures++
    this.state.lastFailureTime = Date.now()

    // Reset success count on failure
    this.state.successes = 0

    if (this.state.status === 'half-open' || this.state.failures >= this.config.failureThreshold) {
      this.state.status = 'open'
      this.state.nextAttemptTime = Date.now() + this.config.recoveryTimeout
      console.log(
        `[CircuitBreaker:${this.state.name}] Opened after ${this.state.failures} failures`,
      )
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return { ...this.state }
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = {
      ...this.state,
      status: 'closed',
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      lastSuccessTime: 0,
      nextAttemptTime: 0,
    }
    console.log(`[CircuitBreaker:${this.state.name}] Reset`)
  }
}

// ==========================================
// ERROR RECOVERY SERVICE
// ==========================================

export class ErrorRecoveryService extends EventEmitter {
  private config: ErrorRecoveryConfig
  private circuitBreakers: Map<string, CircuitBreaker> = new Map()
  private recoveryQueue: RecoveryOperation[] = []
  private activeRecoveries: Set<string> = new Set()
  private healthCheckTimer?: any
  private startTime: number = 0
  private isRunning: boolean = false

  constructor(config: Partial<ErrorRecoveryConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ==========================================
  // PUBLIC API
  // ==========================================

  /**
   * Start the error recovery service
   */
  async start(): Promise<void> {
    if (this.isRunning) return

    this.isRunning = true
    this.startTime = Date.now()

    console.log('[ErrorRecovery] Starting error recovery service...')

    // Start health monitoring
    this.startHealthMonitoring()

    console.log('[ErrorRecovery] Error recovery service started')
  }

  /**
   * Stop the error recovery service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return

    this.isRunning = false

    console.log('[ErrorRecovery] Stopping error recovery service...')

    // Stop health monitoring
    this.stopHealthMonitoring()

    // Cancel all pending recoveries
    this.recoveryQueue = []
    this.activeRecoveries.clear()

    console.log('[ErrorRecovery] Error recovery service stopped')
  }

  /**
   * Create or get a circuit breaker
   */
  getCircuitBreaker(name: string): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      const breaker = new CircuitBreaker(name, this.config.circuitBreaker)
      this.circuitBreakers.set(name, breaker)
    }
    return this.circuitBreakers.get(name)!
  }

  /**
   * Execute an operation with circuit breaker protection
   */
  async executeWithCircuitBreaker<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const breaker = this.getCircuitBreaker(name)
    return breaker.execute(operation)
  }

  /**
   * Execute an operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    customConfig?: Partial<RetryConfig>,
  ): Promise<T> {
    const config = { ...this.config.retry, ...customConfig }
    let lastError: Error

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error

        if (attempt === config.maxAttempts) {
          break
        }

        const delay = this.calculateDelay(attempt, config)
        console.log(`[ErrorRecovery] Retry attempt ${attempt} failed, waiting ${delay}ms:`, error)
        await this.delay(delay)
      }
    }

    throw lastError!
  }

  /**
   * Schedule a recovery operation
   */
  scheduleRecovery(
    name: string,
    operation: () => Promise<any>,
    priority: RecoveryOperation['priority'] = 'medium',
    circuitBreaker?: string,
  ): string {
    const recoveryOp: RecoveryOperation = {
      id: `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      operation,
      priority,
      retryCount: 0,
      lastAttempt: 0,
      circuitBreaker,
    }

    // Insert based on priority
    const insertIndex = this.recoveryQueue.findIndex(
      op => this.getPriorityValue(op.priority) < this.getPriorityValue(priority),
    )
    if (insertIndex === -1) {
      this.recoveryQueue.push(recoveryOp)
    } else {
      this.recoveryQueue.splice(insertIndex, 0, recoveryOp)
    }

    console.log(`[ErrorRecovery] Scheduled recovery: ${name} (${priority})`)

    // Try to execute immediately if possible
    this.processRecoveryQueue()

    return recoveryOp.id
  }

  /**
   * Cancel a scheduled recovery operation
   */
  cancelRecovery(recoveryId: string): boolean {
    const index = this.recoveryQueue.findIndex(op => op.id === recoveryId)
    if (index === -1) return false

    this.recoveryQueue.splice(index, 1)
    console.log(`[ErrorRecovery] Cancelled recovery: ${recoveryId}`)
    return true
  }

  /**
   * Get current health status
   */
  getHealthStatus(): HealthStatus {
    const circuitBreakers = Array.from(this.circuitBreakers.values()).map(cb => cb.getState())

    // Determine overall health
    const openCircuits = circuitBreakers.filter(cb => cb.status === 'open').length
    const totalCircuits = circuitBreakers.length

    let overall: HealthStatus['overall'] = 'healthy'
    if (openCircuits > 0) {
      overall = openCircuits === totalCircuits ? 'unhealthy' : 'degraded'
    }

    return {
      overall,
      circuitBreakers,
      activeRecoveries: this.activeRecoveries.size,
      failedRecoveries: 0, // TODO: Track failed recoveries
      uptime: this.isRunning ? Date.now() - this.startTime : 0,
      lastHealthCheck: Date.now(),
    }
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(() => {
      const status = this.getHealthStatus()
      console.log('[ErrorRecovery] Health check:', status)

      this.emit('health_check', { status, timestamp: Date.now() })
    }, this.config.healthCheckInterval)
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = undefined
    }
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1)
    delay = Math.min(delay, config.maxDelay)

    if (config.jitter) {
      // Add random jitter (±25%)
      const jitterRange = delay * 0.25
      delay += (Math.random() - 0.5) * 2 * jitterRange
    }

    return Math.max(0, Math.floor(delay))
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private getPriorityValue(priority: RecoveryOperation['priority']): number {
    switch (priority) {
      case 'critical':
        return 4
      case 'high':
        return 3
      case 'medium':
        return 2
      case 'low':
        return 1
      default:
        return 0
    }
  }

  private async processRecoveryQueue(): Promise<void> {
    if (this.activeRecoveries.size >= this.config.maxConcurrentRecoveries) {
      return // Max concurrent recoveries reached
    }

    const nextRecovery = this.recoveryQueue.shift()
    if (!nextRecovery) return

    if (this.activeRecoveries.has(nextRecovery.id)) {
      return // Already being processed
    }

    this.activeRecoveries.add(nextRecovery.id)

    this.emit('recovery_started', {
      recovery: nextRecovery,
      timestamp: Date.now(),
    })

    try {
      // Check circuit breaker if specified
      if (nextRecovery.circuitBreaker) {
        const breaker = this.getCircuitBreaker(nextRecovery.circuitBreaker)
        await breaker.execute(nextRecovery.operation)
      } else {
        await nextRecovery.operation()
      }

      console.log(`[ErrorRecovery] Recovery completed: ${nextRecovery.name}`)

      this.emit('recovery_completed', {
        recovery: nextRecovery,
        timestamp: Date.now(),
      })
    } catch (error) {
      console.error(`[ErrorRecovery] Recovery failed: ${nextRecovery.name}:`, error)

      nextRecovery.retryCount++
      nextRecovery.lastAttempt = Date.now()

      // Reschedule if retries remaining
      if (nextRecovery.retryCount < this.config.retry.maxAttempts) {
        // Add back to queue with lower priority
        nextRecovery.priority = 'low'
        this.recoveryQueue.push(nextRecovery)
      }

      this.emit('recovery_failed', {
        recovery: nextRecovery,
        error,
        timestamp: Date.now(),
      })
    } finally {
      this.activeRecoveries.delete(nextRecovery.id)

      // Process next recovery
      setImmediate(() => this.processRecoveryQueue())
    }
  }
}

// ==========================================
// FACTORY FUNCTION
// ==========================================

export function createErrorRecoveryService(
  config?: Partial<ErrorRecoveryConfig>,
): ErrorRecoveryService {
  return new ErrorRecoveryService(config)
}
