/**
 * IncomingBalancePopover Component
 *
 * Popover que mostra o saldo on-chain pendente e permite conversão manual
 * para liquidez Lightning.
 */

import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useInboundBalance } from '../hooks/useInboundBalance'
import { useAutoChannelOpening } from '../hooks/useAutoChannel'
import { useWillAutoConvert } from '../hooks/useInboundBalance'
import { useLSPIntegration } from '../hooks/useAutoChannel'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import type { Satoshis } from '../types'

// ==========================================
// TYPES
// ==========================================

interface IncomingBalancePopoverProps {
  /** Se o popover está visível */
  visible: boolean
  /** Callback quando o popover deve ser fechado */
  onClose: () => void
  /** Modo de cor atual */
  colorMode: 'light' | 'dark'
}

// ==========================================
// COMPONENT
// ==========================================

export function IncomingBalancePopover({
  visible,
  onClose,
  colorMode,
}: IncomingBalancePopoverProps) {
  const inboundBalance = useInboundBalance()
  const { openChannelManually } = useAutoChannelOpening()
  const willAutoConvert = useWillAutoConvert()
  const { getAvailableLSPs, estimateChannelFee } = useLSPIntegration()

  const [isConverting, setIsConverting] = useState(false)
  const [selectedLSP, setSelectedLSP] = useState<string | null>(null)

  if (!visible) return null

  const theme = {
    background: colors.background[colorMode],
    surface: colorMode === 'dark' ? alpha(colors.white, 0.05) : colors.white,
    text: colors.text[colorMode],
    textSecondary: colors.textSecondary[colorMode],
    primary: colors.primary,
    border: colors.border[colorMode],
  }
  const pendingAmount = inboundBalance.pendingOnChainBalance

  // Obtém LSPs disponíveis
  const availableLSPs = getAvailableLSPs()

  const handleManualConvert = async () => {
    if (pendingAmount <= 0n) return

    setIsConverting(true)
    try {
      // Usa o primeiro LSP disponível ou o selecionado
      const lspId = selectedLSP || availableLSPs[0]?.lspId

      if (!lspId) {
        Alert.alert('Erro', 'Nenhum LSP disponível para abertura de canal')
        return
      }

      const success = await openChannelManually(pendingAmount, lspId)

      if (success) {
        Alert.alert('Sucesso', 'Canal aberto com sucesso!')
        onClose()
      } else {
        Alert.alert('Erro', 'Falha ao abrir canal. Tente novamente.')
      }
    } catch (error) {
      console.error('Failed to convert balance:', error)
      Alert.alert('Erro', 'Erro inesperado ao converter saldo')
    } finally {
      setIsConverting(false)
    }
  }

  const formatSatoshis = (sats: Satoshis): string => {
    const num = Number(sats)
    if (num >= 100000000) {
      return `${(num / 100000000).toFixed(4)} BTC`
    } else if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M sats`
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k sats`
    }
    return `${num} sats`
  }

  const getEstimatedFee = (): string => {
    if (!selectedLSP && availableLSPs.length === 0) return 'N/A'

    const lspId = selectedLSP || availableLSPs[0].lspId
    const feeEstimate = estimateChannelFee(lspId, pendingAmount)

    return feeEstimate ? formatSatoshis(feeEstimate.totalFee) : 'N/A'
  }

  return (
    <View style={[styles.overlay, { backgroundColor: alpha(theme.background, 0.8) }]}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

      <View style={[styles.popover, { backgroundColor: theme.surface }]}>
        {/* Header */}
        <View style={styles.header}>
          <IconSymbol name="arrow.down.circle.fill" size={24} color={theme.primary} />
          <Text style={[styles.title, { color: theme.text }]}>Saldo On-Chain Pendente</Text>
          <TouchableOpacity onPress={onClose}>
            <IconSymbol name="xmark" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Balance Info */}
        <View style={styles.balanceSection}>
          <Text style={[styles.balanceAmount, { color: theme.primary }]}>
            {formatSatoshis(pendingAmount)}
          </Text>
          <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>
            aguardando conversão
          </Text>
        </View>

        {/* Auto Convert Status */}
        <View style={styles.statusSection}>
          {willAutoConvert ? (
            <View style={styles.statusRow}>
              <IconSymbol name="checkmark.circle.fill" size={16} color={colors.success} />
              <Text style={[styles.statusText, { color: colors.success }]}>
                Conversão automática ativada
              </Text>
            </View>
          ) : (
            <View style={styles.statusRow}>
              <IconSymbol name="clock" size={16} color={theme.textSecondary} />
              <Text style={[styles.statusText, { color: theme.textSecondary }]}>
                {inboundBalance.noAutoConvertReason || 'Conversão manual necessária'}
              </Text>
            </View>
          )}
        </View>

        {/* LSP Selection */}
        {availableLSPs.length > 1 && (
          <View style={styles.lspSection}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Provedor LSP</Text>
            {availableLSPs.map(lsp => (
              <TouchableOpacity
                key={lsp.lspId}
                style={[
                  styles.lspOption,
                  {
                    backgroundColor:
                      selectedLSP === lsp.lspId ? alpha(theme.primary, 0.1) : 'transparent',
                  },
                ]}
                onPress={() => setSelectedLSP(lsp.lspId)}
              >
                <View style={styles.lspInfo}>
                  <Text style={[styles.lspName, { color: theme.text }]}>{lsp.name}</Text>
                  <Text style={[styles.lspDescription, { color: theme.textSecondary }]}>
                    {lsp.description}
                  </Text>
                </View>
                <Text style={[styles.lspFee, { color: theme.primary }]}>
                  {'Taxa: '}
                  {formatSatoshis(estimateChannelFee(lsp.lspId, pendingAmount)?.totalFee || 0n)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Fee Estimate */}
        <View style={styles.feeSection}>
          <Text style={[styles.feeLabel, { color: theme.textSecondary }]}>
            Taxa estimada: {getEstimatedFee()}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[styles.cancelButton, { borderColor: theme.border }]}
            onPress={onClose}
            disabled={isConverting}
          >
            <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancelar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.convertButton,
              {
                backgroundColor: isConverting ? theme.textSecondary : theme.primary,
                opacity: pendingAmount <= 0n || isConverting ? 0.5 : 1,
              },
            ]}
            onPress={handleManualConvert}
            disabled={pendingAmount <= 0n || isConverting}
          >
            {isConverting ? (
              <ActivityIndicator size="small" color={theme.surface} />
            ) : (
              <Text style={[styles.convertButtonText, { color: theme.surface }]}>
                Converter Agora
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  popover: {
    margin: 20,
    borderRadius: 12,
    padding: 20,
    minWidth: 320,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  balanceSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  balanceAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  balanceLabel: {
    fontSize: 14,
  },
  statusSection: {
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  lspSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  lspOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  lspInfo: {
    flex: 1,
  },
  lspName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  lspDescription: {
    fontSize: 12,
  },
  lspFee: {
    fontSize: 12,
    fontWeight: '500',
  },
  feeSection: {
    marginBottom: 20,
  },
  feeLabel: {
    fontSize: 14,
    textAlign: 'center',
  },
  actionsSection: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  convertButton: {
    flex: 2,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  convertButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
})
