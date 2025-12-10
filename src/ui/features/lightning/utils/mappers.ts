/**
 * Funções de mapeamento para converter dados do service para a UI
 */

import type { Invoice, Payment } from '../types'
import type { InvoiceState, PaymentState } from '@/core/services/ln-service'

/**
 * Mapeia uma InvoiceState do service para Invoice da UI
 */
export function mapServiceInvoice(inv: InvoiceState): Invoice {
  return {
    paymentHash: inv.paymentHash,
    invoice: inv.invoice,
    amount: inv.amount,
    description: inv.description,
    status: inv.status,
    createdAt: inv.createdAt,
    expiresAt: inv.expiresAt,
  }
}

/**
 * Mapeia uma PaymentState do service para Payment da UI
 */
export function mapServicePayment(pay: PaymentState): Payment {
  return {
    paymentHash: pay.paymentHash,
    amount: pay.amount,
    status: pay.status,
    direction: pay.direction,
    createdAt: pay.createdAt,
    resolvedAt: pay.resolvedAt,
  }
}

/**
 * Mapeia um array de InvoiceState para Invoice[]
 */
export function mapServiceInvoices(invoices: InvoiceState[]): Invoice[] {
  return invoices.map(mapServiceInvoice)
}

/**
 * Mapeia um array de PaymentState para Payment[]
 */
export function mapServicePayments(payments: PaymentState[]): Payment[] {
  return payments.map(mapServicePayment)
}
