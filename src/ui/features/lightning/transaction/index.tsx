/**
 * Lightning Transaction History Screen
 *
 * Tela para visualização do histórico de transações Lightning.
 * Lista pagamentos enviados e recebidos com filtros.
 */

import React, { useState, useCallback, useMemo } from 'react'
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  type ViewStyle,
  type TextStyle,
  type ListRenderItem,
} from 'react-native'
import { useRouter } from 'expo-router'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import {
  useLightningPayments,
  useLightningInvoices,
  useLightningActions,
} from '@/ui/features/app-provider'
import { useActiveColorMode } from '@/ui/features/app-provider'
import type { PaymentStatus, PaymentDirection, InvoiceStatus, Millisatoshis } from '../types'

// ==========================================
// TYPES
// ==========================================

type ColorMode = 'light' | 'dark'

type FilterType = 'all' | 'sent' | 'received' | 'pending'

interface TransactionItem {
  id: string
  type: 'payment' | 'invoice'
  direction: PaymentDirection
  amount: Millisatoshis
  status: PaymentStatus | InvoiceStatus
  createdAt: number
  description?: string
  paymentHash: string
}

interface TransactionCardProps {
  item: TransactionItem
  colorMode: ColorMode
  onPress: (item: TransactionItem) => void
}

// ==========================================
// HELPERS
// ==========================================

function formatMsat(msat: Millisatoshis): string {
  const sats = Number(msat) / 1000
  if (sats >= 100000000) {
    return `${(sats / 100000000).toFixed(8)} BTC`
  } else if (sats >= 1000000) {
    return `${(sats / 1000000).toFixed(2)} M sats`
  } else if (sats >= 1000) {
    return `${(sats / 1000).toFixed(1)} K sats`
  }
  return `${sats.toFixed(0)} sats`
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Agora'
  if (diffMins < 60) return `${diffMins} min atrás`
  if (diffHours < 24) return `${diffHours}h atrás`
  if (diffDays < 7) return `${diffDays}d atrás`
  return date.toLocaleDateString('pt-BR')
}

function getStatusColor(status: PaymentStatus | InvoiceStatus): string {
  switch (status) {
    case 'succeeded':
    case 'paid':
      return colors.success
    case 'pending':
      return colors.warning
    case 'failed':
    case 'expired':
      return colors.error
    default:
      return colors.placeholder
  }
}

function getStatusLabel(status: PaymentStatus | InvoiceStatus): string {
  switch (status) {
    case 'succeeded':
      return 'Sucesso'
    case 'paid':
      return 'Pago'
    case 'pending':
      return 'Pendente'
    case 'failed':
      return 'Falhou'
    case 'expired':
      return 'Expirado'
    default:
      return 'Desconhecido'
  }
}

// ==========================================
// TRANSACTION CARD COMPONENT
// ==========================================

function TransactionCard({ item, colorMode, onPress }: TransactionCardProps) {
  const textColor = colors.text[colorMode]
  const secondaryColor = alpha(textColor, 0.6)
  const surfaceColor = colorMode === 'dark' ? alpha(colors.white, 0.05) : colors.white

  const isSent = item.direction === 'sent'
  const amountPrefix = isSent ? '-' : '+'
  const amountColor = isSent ? colors.error : colors.success

  return (
    <TouchableOpacity
      style={[cardStyles.container, { backgroundColor: surfaceColor }]}
      onPress={() => onPress(item)}
    >
      {/* Direction Icon */}
      <View style={[cardStyles.iconContainer, { backgroundColor: alpha(amountColor, 0.15) }]}>
        <IconSymbol
          name={isSent ? 'arrow.up.right' : 'arrow.down.left'}
          size={20}
          color={amountColor}
        />
      </View>

      {/* Content */}
      <View style={cardStyles.content}>
        <View style={cardStyles.topRow}>
          <Text style={[cardStyles.title, { color: textColor }]}>
            {isSent ? 'Enviado' : 'Recebido'}
          </Text>
          <Text style={[cardStyles.amount, { color: amountColor }]}>
            {amountPrefix}
            {formatMsat(item.amount)}
          </Text>
        </View>
        <View style={cardStyles.bottomRow}>
          <Text style={[cardStyles.date, { color: secondaryColor }]}>
            {formatDate(item.createdAt)}
          </Text>
          <View
            style={[
              cardStyles.statusBadge,
              { backgroundColor: alpha(getStatusColor(item.status), 0.15) },
            ]}
          >
            <Text style={[cardStyles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusLabel(item.status)}
            </Text>
          </View>
        </View>
        {item.description && (
          <Text style={[cardStyles.description, { color: secondaryColor }]} numberOfLines={1}>
            {item.description}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

// ==========================================
// FILTER TABS COMPONENT
// ==========================================

function FilterTabs({
  activeFilter,
  onFilterChange,
  colorMode,
}: {
  activeFilter: FilterType
  onFilterChange: (filter: FilterType) => void
  colorMode: ColorMode
}) {
  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'sent', label: 'Enviados' },
    { key: 'received', label: 'Recebidos' },
    { key: 'pending', label: 'Pendentes' },
  ]

  const textColor = colors.text[colorMode]

  return (
    <View style={filterStyles.container}>
      {filters.map(filter => (
        <TouchableOpacity
          key={filter.key}
          style={[filterStyles.tab, activeFilter === filter.key && filterStyles.activeTab]}
          onPress={() => onFilterChange(filter.key)}
        >
          <Text
            style={[
              filterStyles.tabText,
              { color: activeFilter === filter.key ? colors.primary : alpha(textColor, 0.6) },
            ]}
          >
            {filter.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function TransactionHistoryScreen() {
  const router = useRouter()
  const colorMode = useActiveColorMode()
  const payments = useLightningPayments()
  const invoices = useLightningInvoices()
  const { refreshPayments, refreshInvoices } = useLightningActions()

  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // ==========================================
  // DATA TRANSFORMATION
  // ==========================================

  const transactions = useMemo((): TransactionItem[] => {
    const paymentItems: TransactionItem[] = payments.map(p => ({
      id: `payment-${p.paymentHash}`,
      type: 'payment' as const,
      direction: p.direction,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt,
      paymentHash: p.paymentHash,
    }))

    const invoiceItems: TransactionItem[] = invoices
      .filter(i => i.status === 'paid')
      .map(i => ({
        id: `invoice-${i.paymentHash}`,
        type: 'invoice' as const,
        direction: 'received' as PaymentDirection,
        amount: i.amount,
        status: i.status,
        createdAt: i.createdAt,
        description: i.description,
        paymentHash: i.paymentHash,
      }))

    return [...paymentItems, ...invoiceItems].sort((a, b) => b.createdAt - a.createdAt)
  }, [payments, invoices])

  const filteredTransactions = useMemo(() => {
    switch (activeFilter) {
      case 'sent':
        return transactions.filter(t => t.direction === 'sent')
      case 'received':
        return transactions.filter(t => t.direction === 'received')
      case 'pending':
        return transactions.filter(t => t.status === 'pending')
      default:
        return transactions
    }
  }, [transactions, activeFilter])

  // ==========================================
  // ACTIONS
  // ==========================================

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([refreshPayments(), refreshInvoices()])
    } finally {
      setIsRefreshing(false)
    }
  }, [refreshPayments, refreshInvoices])

  const handleTransactionPress = useCallback(
    (item: TransactionItem) => {
      // TODO: Navigate to transaction details
      router.push({
        pathname: '/lightning/transaction/[id]' as any,
        params: { id: item.paymentHash },
      })
    },
    [router],
  )

  // ==========================================
  // RENDER
  // ==========================================

  const textColor = colors.text[colorMode]
  const secondaryColor = alpha(textColor, 0.6)
  const bgColor = colors.background[colorMode]

  const renderItem: ListRenderItem<TransactionItem> = useCallback(
    ({ item }) => (
      <TransactionCard item={item} colorMode={colorMode} onPress={handleTransactionPress} />
    ),
    [colorMode, handleTransactionPress],
  )

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>⚡</Text>
      <Text style={[styles.emptyTitle, { color: textColor }]}>Sem transações</Text>
      <Text style={[styles.emptyDescription, { color: secondaryColor }]}>
        {activeFilter === 'all'
          ? 'Suas transações Lightning aparecerão aqui'
          : `Nenhuma transação ${activeFilter === 'sent' ? 'enviada' : activeFilter === 'received' ? 'recebida' : 'pendente'}`}
      </Text>
    </View>
  )

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: textColor }]}>Histórico</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Filter Tabs */}
      <FilterTabs
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        colorMode={colorMode}
      />

      {/* Transaction List */}
      <FlatList
        data={filteredTransactions}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  } as ViewStyle,
  backButton: {
    padding: 8,
  } as ViewStyle,
  title: {
    fontSize: 20,
    fontWeight: '600',
  } as TextStyle,
  placeholder: {
    width: 40,
  } as ViewStyle,
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
  } as ViewStyle,
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  } as ViewStyle,
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  } as TextStyle,
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  } as TextStyle,
  emptyDescription: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  } as TextStyle,
})

const filterStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  } as ViewStyle,
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: alpha(colors.placeholder, 0.1),
  } as ViewStyle,
  activeTab: {
    backgroundColor: alpha(colors.primary, 0.15),
  } as ViewStyle,
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  } as TextStyle,
})

const cardStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  } as ViewStyle,
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  } as ViewStyle,
  content: {
    flex: 1,
  } as ViewStyle,
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  } as ViewStyle,
  title: {
    fontSize: 16,
    fontWeight: '600',
  } as TextStyle,
  amount: {
    fontSize: 16,
    fontWeight: '600',
  } as TextStyle,
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as ViewStyle,
  date: {
    fontSize: 12,
  } as TextStyle,
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  } as ViewStyle,
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  } as TextStyle,
  description: {
    fontSize: 12,
    marginTop: 4,
  } as TextStyle,
})
