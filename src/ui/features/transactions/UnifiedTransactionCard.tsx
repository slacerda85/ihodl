/**
 * Componente de Card de Transação Unificado
 *
 * Renderiza transações de diferentes ativos (BTC on-chain, Lightning, RGB)
 * com ícones e cores apropriadas para cada tipo.
 */

import React from 'react'
import { StyleSheet, Text, View, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useRouter } from 'expo-router'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import BitcoinLogo from '@/ui/assets/bitcoin-logo'
import { formatBalance } from '../wallet/utils'
import { truncateAddress } from './utils'
import type { UnifiedTransaction, AssetType } from './types'
import { ASSET_CONFIG } from './types'

// ==========================================
// TYPES
// ==========================================

interface UnifiedTransactionCardProps {
  transaction: UnifiedTransaction
  isDark: boolean
  isFirst?: boolean
  isLast?: boolean
}

// ==========================================
// HELPERS
// ==========================================

function getDirectionLabel(transaction: UnifiedTransaction): string {
  switch (transaction.direction) {
    case 'received':
      return 'Recebido'
    case 'sent':
      return 'Enviado'
    case 'self':
      return 'Transferência'
    default:
      return 'Transação'
  }
}

function getStatusLabel(transaction: UnifiedTransaction): string | null {
  // Para transações da mempool, mostrar label especial
  if (transaction.isMempool) {
    return 'Na Mempool'
  }

  switch (transaction.status) {
    case 'pending':
      return 'Pendente'
    case 'failed':
      return 'Falhou'
    case 'expired':
      return 'Expirado'
    default:
      return null // confirmed não precisa de label
  }
}

function getStatusColor(status: UnifiedTransaction['status'], isMempool?: boolean): string {
  // Cor especial para mempool (azul/ciano para destacar)
  if (isMempool) {
    return '#00BCD4' // Cyan - indica algo "em trânsito"
  }

  switch (status) {
    case 'confirmed':
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

function formatAmount(amount: number, assetType: AssetType): string {
  if (assetType === 'rgb') {
    // Para RGB, mostrar valor direto (unidade do ativo)
    return amount.toLocaleString('pt-BR')
  }
  // Para BTC/Lightning, usar formatBalance existente
  return formatBalance(amount, 'BTC') ?? '0'
}

// ==========================================
// ASSET ICON COMPONENT
// ==========================================

interface AssetIconProps {
  assetType: AssetType
  direction: UnifiedTransaction['direction']
}

function AssetIcon({ assetType, direction }: AssetIconProps) {
  const config = ASSET_CONFIG[assetType]

  // Para BTC on-chain, usar o logo Bitcoin existente
  if (assetType === 'btc-onchain') {
    return <BitcoinLogo width={32} height={32} />
  }

  // Para Lightning e RGB, usar ícone com indicador de direção
  const directionIcon = direction === 'received' ? 'arrow.down.left' : 'arrow.up.right'

  return (
    <View style={[iconStyles.container, { backgroundColor: alpha(config.color, 0.15) }]}>
      <IconSymbol name={config.icon as any} size={18} color={config.color} />
      <View style={[iconStyles.directionBadge, { backgroundColor: config.color }]}>
        <IconSymbol name={directionIcon as any} size={8} color={colors.white} />
      </View>
    </View>
  )
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export function UnifiedTransactionCard({
  transaction,
  isDark,
  isFirst = false,
  isLast = false,
}: UnifiedTransactionCardProps) {
  const router = useRouter()

  const secondaryColor = isDark ? colors.textSecondary.dark : colors.textSecondary.light

  const isPositive = transaction.direction === 'received'
  const prefix = isPositive ? '+' : '-'

  const statusLabel = getStatusLabel(transaction)
  const config = ASSET_CONFIG[transaction.assetType]

  const handlePress = () => {
    // Navegar para detalhes baseado no tipo
    if (transaction.assetType === 'btc-onchain') {
      router.push(`/transactions/${transaction.nativeId}` as any)
    } else if (transaction.assetType === 'lightning') {
      // TODO: Criar rota de detalhes Lightning
      router.push(`/transactions/${transaction.nativeId}` as any)
    }
    // RGB: implementar quando disponível
  }

  return (
    <Pressable onPress={handlePress}>
      <View
        style={[
          styles.container,
          isDark && styles.containerDark,
          isFirst && styles.first,
          isLast && styles.last,
        ]}
      >
        {/* Icon */}
        <View style={styles.iconWrapper}>
          <AssetIcon assetType={transaction.assetType} direction={transaction.direction} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={styles.titleRow}>
              <Text style={[styles.type, isDark && styles.typeDark]}>
                {getDirectionLabel(transaction)}
              </Text>
              {/* Asset type badge */}
              <View style={[styles.assetBadge, { backgroundColor: alpha(config.color, 0.15) }]}>
                <Text style={[styles.assetBadgeText, { color: config.color }]}>
                  {config.shortLabel}
                </Text>
              </View>
            </View>
            {/* Amount */}
            <Text
              style={[
                styles.amount,
                isDark && styles.amountDark,
                isPositive ? styles.amountPositive : styles.amountNegative,
              ]}
            >
              {prefix}
              {formatAmount(transaction.amount, transaction.assetType)} BTC
            </Text>
          </View>

          <View style={styles.bottomRow}>
            {/* Address or description */}
            <Text style={[styles.address, { color: secondaryColor }]} numberOfLines={1}>
              {transaction.description ||
                (transaction.displayAddress
                  ? `${transaction.direction === 'received' ? 'De' : 'Para'} ${truncateAddress(transaction.displayAddress, 4)}`
                  : '')}
            </Text>

            {/* Status badge if not confirmed */}
            {statusLabel && (
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: alpha(
                      getStatusColor(transaction.status, transaction.isMempool),
                      0.15,
                    ),
                  },
                  transaction.isMempool && styles.mempoolBadge,
                ]}
              >
                {transaction.isMempool && (
                  <IconSymbol
                    name="clock.arrow.circlepath"
                    size={10}
                    color={getStatusColor(transaction.status, transaction.isMempool)}
                    style={{ marginRight: 4 }}
                  />
                )}
                <Text
                  style={[
                    styles.statusText,
                    { color: getStatusColor(transaction.status, transaction.isMempool) },
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  )
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  } as ViewStyle,
  containerDark: {
    backgroundColor: alpha(colors.white, 0.08),
  } as ViewStyle,
  first: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  } as ViewStyle,
  last: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  } as ViewStyle,
  iconWrapper: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  content: {
    flex: 1,
    gap: 4,
  } as ViewStyle,
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as ViewStyle,
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  type: {
    fontSize: 16,
    color: colors.text.light,
  } as TextStyle,
  typeDark: {
    color: colors.text.dark,
  } as TextStyle,
  assetBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  } as ViewStyle,
  assetBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  } as TextStyle,
  amount: {
    fontSize: 16,
    color: colors.text.light,
  } as TextStyle,
  amountDark: {
    color: colors.text.dark,
  } as TextStyle,
  amountPositive: {
    color: colors.success,
    fontWeight: '600',
  } as TextStyle,
  amountNegative: {
    color: colors.textSecondary.light,
    fontWeight: '500',
  } as TextStyle,
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as ViewStyle,
  address: {
    fontSize: 14,
    flex: 1,
  } as TextStyle,
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,
  mempoolBadge: {
    borderWidth: 1,
    borderColor: alpha('#00BCD4', 0.3),
    borderStyle: 'dashed',
  } as ViewStyle,
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  } as TextStyle,
})

const iconStyles = StyleSheet.create({
  container: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  } as ViewStyle,
  directionBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
})

export default UnifiedTransactionCard
