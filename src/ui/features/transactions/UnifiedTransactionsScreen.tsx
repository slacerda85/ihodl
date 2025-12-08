/**
 * Unified Transactions Screen
 *
 * Tela de histórico de transações unificado para múltiplos ativos:
 * - Bitcoin On-chain
 * - Lightning Network
 * - RGB Assets (futuro)
 */

import React, { useCallback, useMemo } from 'react'
import { Text, View, FlatList, StyleSheet, RefreshControl } from 'react-native'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { useHeaderHeight } from '@react-navigation/elements'
import { useActiveColorMode } from '@/ui/features/app-provider'
import { iosTabBarHeight } from '@/ui/tokens'
import UnifiedTransactionsLoading from './UnifiedTransactionsLoading'
import { AssetFilterChips } from './AssetFilterChips'
import { UnifiedTransactionCard } from './UnifiedTransactionCard'
import { useUnifiedTransactions } from './useUnifiedTransactions'
import type { TransactionListItem } from './types'

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function TransactionsScreen() {
  const headerHeight = useHeaderHeight()
  const colorMode = useActiveColorMode()

  const {
    listItems,
    totalCount,
    isLoading,
    filters,
    toggleAsset,
    assetCounts,
    refresh,
    isRefreshing,
  } = useUnifiedTransactions()

  // ==========================================
  // RENDER HELPERS
  // ==========================================

  const renderItem = useCallback(
    ({ item, index }: { item: TransactionListItem; index: number }) => {
      if (item.type === 'date-header') {
        return (
          <View style={styles[colorMode].dateContainer}>
            <Text style={styles[colorMode].date}>{item.displayDate}</Text>
          </View>
        )
      }

      // Determine position for rounded corners
      const isFirst = index === 0 || listItems[index - 1].type === 'date-header'
      const isLast = index === listItems.length - 1 || listItems[index + 1]?.type === 'date-header'

      return (
        <UnifiedTransactionCard
          transaction={item.transaction}
          // isDark={isDark}
          isFirst={isFirst}
          isLast={isLast}
        />
      )
    },
    [colorMode, listItems],
  )

  const keyExtractor = useCallback((item: TransactionListItem, index: number) => {
    if (item.type === 'date-header') {
      return `date-${item.date}`
    }
    return `tx-${item.transaction.id}-${index}`
  }, [])

  const dateIndices = useMemo(() => {
    const indices: number[] = []
    listItems.forEach((item, index) => {
      if (item.type === 'date-header') {
        indices.push(index)
      }
    })
    return indices
  }, [listItems])

  // ==========================================
  // LOADING STATE
  // ==========================================

  if (isLoading) {
    return <UnifiedTransactionsLoading />
  }

  // ==========================================
  // EMPTY STATE
  // ==========================================

  if (totalCount === 0) {
    return (
      <View style={[styles[colorMode].emptyContainer, { paddingTop: headerHeight + 16 }]}>
        <View style={styles[colorMode].empty}>
          <Text style={styles[colorMode].emptyIcon}>📋</Text>
          <Text style={styles[colorMode].emptyText}>Nenhuma transação encontrada</Text>
          <Text style={styles[colorMode].emptySubText}>
            Suas transações de Bitcoin, Lightning e outros ativos aparecerão aqui
          </Text>
        </View>
      </View>
    )
  }

  // ==========================================
  // MAIN RENDER
  // ==========================================

  return (
    <View style={styles[colorMode].container}>
      {/* Header */}
      <View style={styles[colorMode].header}>
        <Text style={styles[colorMode].subtitle}>
          {totalCount} transação{totalCount !== 1 ? 'ões' : ''}
        </Text>
      </View>

      {/* Asset Filters */}
      <View style={styles[colorMode].filtersContainer}>
        <AssetFilterChips
          selectedAssets={filters.assets}
          onToggle={toggleAsset}
          assetCounts={assetCounts}
        />
      </View>

      {/* Transaction List */}
      <FlatList
        data={listItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        stickyHeaderIndices={dateIndices}
        contentContainerStyle={{ paddingBottom: iosTabBarHeight }}
        ItemSeparatorComponent={() => (
          <View
            style={{
              borderBottomWidth: 1,
              borderBottomColor: alpha(
                colorMode === 'dark' ? colors.textSecondary.dark : colors.textSecondary.light,
                0.1,
              ),
            }}
          />
        )}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles[colorMode].filteredEmpty}>
            <Text style={styles[colorMode].filteredEmptyText}>
              Nenhuma transação corresponde aos filtros selecionados
            </Text>
          </View>
        }
      />
    </View>
  )
}

// ==========================================
// STYLES
// ==========================================

const light = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: alpha(colors.textSecondary.light, 0.7),
  },
  subtitle: {
    fontSize: 14,
    color: alpha(colors.textSecondary.light, 0.5),
    marginTop: 2,
  },
  filtersContainer: {
    paddingBottom: 8,
  },
  // Date headers
  dateContainer: {
    backgroundColor: colors.background.light,
    paddingVertical: 8,
  },
  date: {
    paddingLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: alpha(colors.textSecondary.light, 0.5),
  },
  // Empty states
  emptyContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  empty: {
    flex: 1,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: 24,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.light,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    color: colors.textSecondary.light,
    textAlign: 'center',
  },
  filteredEmpty: {
    padding: 32,
    alignItems: 'center',
  },
  filteredEmptyText: {
    fontSize: 14,
    color: colors.textSecondary.light,
    textAlign: 'center',
  },
})

const dark: typeof light = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: alpha(colors.textSecondary.dark, 0.7),
  },
  subtitle: {
    fontSize: 14,
    color: alpha(colors.textSecondary.dark, 0.5),
    marginTop: 2,
  },
  filtersContainer: {
    paddingBottom: 8,
  },
  // Date headers
  dateContainer: {
    backgroundColor: colors.background.dark,
    paddingVertical: 8,
  },
  date: {
    paddingLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: alpha(colors.textSecondary.dark, 0.5),
  },
  // Empty states
  emptyContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  empty: {
    flex: 1,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: alpha(colors.background.light, 0.05),
    padding: 24,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.dark,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    color: colors.textSecondary.dark,
    textAlign: 'center',
  },
  filteredEmpty: {
    padding: 32,
    alignItems: 'center',
  },
  filteredEmptyText: {
    fontSize: 14,
    color: colors.textSecondary.dark,
    textAlign: 'center',
  },
})

const styles = { light, dark }
