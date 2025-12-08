// Payment Processor Service
// Headless payment processing for Lightning Network
// Handles background invoice monitoring and automatic payment fulfillment

import EventEmitter from 'eventemitter3'
import LightningService from './lightning'
import { LightningRepository } from '../repositories/lightning'

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface PaymentProcessorConfig {
  /** Enable automatic invoice monitoring */
  enableInvoiceMonitoring: boolean
  /** Enable automatic payment processing */
  enableAutoPayments: boolean
  /** Invoice check interval in milliseconds */
  invoiceCheckInterval: number
  /** Payment timeout in milliseconds */
  paymentTimeout: number
  /** Maximum concurrent payments */
  maxConcurrentPayments: number
  /** Enable background processing */
  enableBackgroundProcessing: boolean
}

export interface PaymentJob {
  id: string
  type: 'invoice_monitoring' | 'payment_processing' | 'refund_processing'
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  invoice?: string
  paymentHash?: string
  amount?: bigint
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
  retryCount: number
  maxRetries: number
}

export interface PaymentResult {
  success: boolean
  paymentHash?: string
  preimage?: string
  feePaid?: bigint
  error?: string
}

export interface InvoiceMonitorResult {
  invoice: string
  status: 'pending' | 'paid' | 'expired'
  amount?: bigint
  paymentHash?: string
  paidAt?: number
}

// ==========================================
// CONSTANTS
// ==========================================

const DEFAULT_CONFIG: PaymentProcessorConfig = {
  enableInvoiceMonitoring: true,
  enableAutoPayments: false, // Disabled by default for security
  invoiceCheckInterval: 30000, // 30 seconds
  paymentTimeout: 300000, // 5 minutes
  maxConcurrentPayments: 3,
  enableBackgroundProcessing: true,
}

// ==========================================
// PAYMENT PROCESSOR SERVICE
// ==========================================

export class PaymentProcessorService extends EventEmitter {
  private config: PaymentProcessorConfig
  private lightningService?: LightningService
  private repository: LightningRepository
  private invoiceCheckTimer?: ReturnType<typeof setInterval>
  private paymentQueue: PaymentJob[] = []
  private activePayments: Set<string> = new Set()
  private isRunning: boolean = false

  constructor(lightningService?: LightningService, config: Partial<PaymentProcessorConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.lightningService = lightningService
    this.repository = new LightningRepository()
  }

  // ==========================================
  // PUBLIC API
  // ==========================================

  /**
   * Start the payment processor
   */
  async start(): Promise<void> {
    if (this.isRunning) return

    console.log('[PaymentProcessor] Starting payment processing service...')

    this.isRunning = true

    // Start invoice monitoring if enabled
    if (this.config.enableInvoiceMonitoring) {
      this.startInvoiceMonitoring()
    }

    // Start payment processing
    this.startPaymentProcessing()

    console.log('[PaymentProcessor] Payment processing service started')
  }

  /**
   * Stop the payment processor
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return

    console.log('[PaymentProcessor] Stopping payment processing service...')

    this.isRunning = false

    // Clear timers
    if (this.invoiceCheckTimer) {
      clearInterval(this.invoiceCheckTimer)
      this.invoiceCheckTimer = undefined
    }

    // Cancel active payments
    for (const jobId of this.activePayments) {
      await this.cancelPaymentJob(jobId)
    }

    console.log('[PaymentProcessor] Payment processing service stopped')
  }

  /**
   * Queue a payment for processing
   */
  async queuePayment(
    invoice: string,
    priority: 'low' | 'normal' | 'high' = 'normal',
  ): Promise<string> {
    if (!this.lightningService) {
      throw new Error('LightningService not available')
    }

    const jobId = this.generateJobId()

    const job: PaymentJob = {
      id: jobId,
      type: 'payment_processing',
      status: 'pending',
      invoice,
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
    }

    // Add to queue with priority
    this.addToQueue(job, priority)
    this.emit('payment_queued', job)

    console.log(`[PaymentProcessor] Payment queued: ${jobId}`)

    return jobId
  }

  /**
   * Get payment job status
   */
  getPaymentJobStatus(jobId: string): PaymentJob | null {
    // Check active payments
    const activeJob = Array.from(this.activePayments).find(id => id === jobId)
    if (activeJob) {
      // Find in queue or active processing
      return this.paymentQueue.find(job => job.id === jobId) || null
    }

    // Check queue
    return this.paymentQueue.find(job => job.id === jobId) || null
  }

  /**
   * Cancel a payment job
   */
  async cancelPaymentJob(jobId: string): Promise<boolean> {
    const job = this.paymentQueue.find(j => j.id === jobId)
    if (!job) return false

    job.status = 'cancelled'
    this.activePayments.delete(jobId)
    this.emit('payment_cancelled', job)

    console.log(`[PaymentProcessor] Payment cancelled: ${jobId}`)
    return true
  }

  /**
   * Get processing statistics
   */
  getProcessingStats(): {
    queuedPayments: number
    activePayments: number
    completedPayments: number
    failedPayments: number
  } {
    const queued = this.paymentQueue.filter(job => job.status === 'pending').length
    const active = this.activePayments.size
    const completed = this.paymentQueue.filter(job => job.status === 'completed').length
    const failed = this.paymentQueue.filter(job => job.status === 'failed').length

    return {
      queuedPayments: queued,
      activePayments: active,
      completedPayments: completed,
      failedPayments: failed,
    }
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  private startInvoiceMonitoring(): void {
    console.log('[PaymentProcessor] Starting invoice monitoring...')

    this.invoiceCheckTimer = setInterval(async () => {
      if (!this.isRunning || !this.lightningService) return

      try {
        await this.checkInvoices()
      } catch (error) {
        console.error('[PaymentProcessor] Error checking invoices:', error)
      }
    }, this.config.invoiceCheckInterval)
  }

  private startPaymentProcessing(): void {
    console.log('[PaymentProcessor] Starting payment processing...')

    // Process queue continuously
    setImmediate(async () => {
      while (this.isRunning) {
        await this.processPaymentQueue()
        await new Promise(resolve => setTimeout(resolve, 1000)) // Check every second
      }
    })
  }

  private async checkInvoices(): Promise<void> {
    if (!this.lightningService) return

    try {
      const invoices = await this.lightningService.getInvoices()

      for (const invoice of invoices) {
        const result: InvoiceMonitorResult = {
          invoice: invoice.invoice,
          status: invoice.status,
          amount: invoice.amount,
          paymentHash: invoice.paymentHash,
        }

        // Emit events based on status changes
        if (invoice.status === 'paid') {
          result.paidAt = invoice.createdAt // Approximate
          this.emit('invoice_paid', result)
        } else if (invoice.status === 'expired') {
          this.emit('invoice_expired', result)
        }

        // TODO: Implement auto-actions based on invoice status
        // e.g., auto-refund expired invoices, notify on payments, etc.
      }
    } catch (error) {
      console.error('[PaymentProcessor] Error monitoring invoices:', error)
    }
  }

  private async processPaymentQueue(): Promise<void> {
    if (!this.lightningService || this.activePayments.size >= this.config.maxConcurrentPayments) {
      return
    }

    // Find next pending payment
    const nextJob = this.paymentQueue.find(job => job.status === 'pending')
    if (!nextJob) return

    // Start processing
    nextJob.status = 'processing'
    nextJob.startedAt = Date.now()
    this.activePayments.add(nextJob.id)
    this.emit('payment_started', nextJob)

    try {
      const result = await this.processPayment(nextJob)

      if (result.success) {
        nextJob.status = 'completed'
        nextJob.completedAt = Date.now()
        this.emit('payment_completed', { job: nextJob, result })
      } else {
        await this.handlePaymentFailure(nextJob, result.error)
      }
    } catch (error) {
      await this.handlePaymentFailure(
        nextJob,
        error instanceof Error ? error.message : 'Unknown error',
      )
    } finally {
      this.activePayments.delete(nextJob.id)
    }
  }

  private async processPayment(job: PaymentJob): Promise<PaymentResult> {
    if (!this.lightningService || !job.invoice) {
      return { success: false, error: 'Invalid payment job' }
    }

    try {
      // Decode invoice first
      const decoded = await this.lightningService.decodeInvoice(job.invoice)

      // Check if expired
      if (decoded.isExpired) {
        return { success: false, error: 'Invoice expired' }
      }

      // Attempt payment
      const paymentResult = await this.lightningService.sendPayment({
        invoice: job.invoice,
        maxFee: decoded.amount ? decoded.amount / 100n : undefined, // Max 1% fee
      })

      return {
        success: paymentResult.success,
        paymentHash: paymentResult.paymentHash,
        preimage: paymentResult.preimage,
        feePaid: paymentResult.feePaid,
        error: paymentResult.error,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment processing failed',
      }
    }
  }

  private async handlePaymentFailure(job: PaymentJob, error?: string): Promise<void> {
    job.error = error
    job.retryCount++

    if (job.retryCount < job.maxRetries) {
      // Retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, job.retryCount), 30000) // Max 30 seconds
      console.log(
        `[PaymentProcessor] Retrying payment ${job.id} in ${delay}ms (attempt ${job.retryCount + 1})`,
      )

      setTimeout(() => {
        job.status = 'pending' // Reset to pending for retry
        this.emit('payment_retry', job)
      }, delay)
    } else {
      job.status = 'failed'
      this.emit('payment_failed', job)
      console.error(`[PaymentProcessor] Payment failed permanently: ${job.id}`, error)
    }
  }

  private addToQueue(job: PaymentJob, priority: 'low' | 'normal' | 'high'): void {
    // Simple priority queue implementation
    const priorityOrder = { high: 0, normal: 1, low: 2 }
    const insertIndex = this.paymentQueue.findIndex(
      existing => priorityOrder[priority] < priorityOrder[this.getJobPriority(existing)],
    )

    if (insertIndex === -1) {
      this.paymentQueue.push(job)
    } else {
      this.paymentQueue.splice(insertIndex, 0, job)
    }
  }

  private getJobPriority(job: PaymentJob): 'low' | 'normal' | 'high' {
    // For now, all jobs are normal priority
    // Could be extended to consider amount, type, etc.
    return 'normal'
  }

  private generateJobId(): string {
    return `payment_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// ==========================================
// FACTORY FUNCTION
// ==========================================

export function createPaymentProcessorService(
  lightningService?: LightningService,
  config?: Partial<PaymentProcessorConfig>,
): PaymentProcessorService {
  return new PaymentProcessorService(lightningService, config)
}

// ==========================================
// DEFAULT EXPORT
// ==========================================

export default PaymentProcessorService
