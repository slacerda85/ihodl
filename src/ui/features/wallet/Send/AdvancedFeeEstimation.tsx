import React, { useState, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import { useIsDark } from '@/ui/features/app-provider'
import { useNetwork } from '../../network/NetworkProvider'
import { transactionService } from '@/core/services'

interface FeeEstimationData {
  slow: {
    feeRate: number
    estimatedBlocks: number
    estimatedTime: string
  }
  normal: {
    feeRate: number
    estimatedBlocks: number
    estimatedTime: string
  }
  fast: {
    feeRate: number
    estimatedBlocks: number
    estimatedTime: string
  }
  urgent: {
    feeRate: number
    estimatedBlocks: number
    estimatedTime: string
  }
}

interface AdvancedFeeEstimationProps {
  selectedFeeRate: 'slow' | 'normal' | 'fast' | 'urgent'
  onFeeRateChange: (rate: 'slow' | 'normal' | 'fast' | 'urgent') => void
  customFeeRate?: number
  onCustomFeeRateChange?: (rate: number) => void
  enableCustomFee?: boolean
  onEnableCustomFeeChange?: (enabled: boolean) => void
}

export default function AdvancedFeeEstimation({
  selectedFeeRate,
  onFeeRateChange,
  customFeeRate,
  onCustomFeeRateChange,
  enableCustomFee = false,
  onEnableCustomFeeChange,
}: AdvancedFeeEstimationProps) {
  const isDark = useIsDark()
  const { getConnection } = useNetwork()

  const [feeData, setFeeData] = useState<FeeEstimationData | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [showDetails, setShowDetails] = useState<boolean>(false)

  // Fetch fee estimation data
  const fetchFeeEstimation = async () => {
    setLoading(true)
    try {
      const connection = await getConnection()
      const rates = await transactionService.getFeeRates(connection)

      // Estimate confirmation times based on fee rates
      const feeData: FeeEstimationData = {
        slow: {
          feeRate: rates.slow,
          estimatedBlocks: 20,
          estimatedTime: '~3-4 hours',
        },
        normal: {
          feeRate: rates.normal,
          estimatedBlocks: 6,
          estimatedTime: '~1 hour',
        },
        fast: {
          feeRate: rates.fast,
          estimatedBlocks: 2,
          estimatedTime: '~20 minutes',
        },
        urgent: {
          feeRate: rates.urgent,
          estimatedBlocks: 1,
          estimatedTime: '~10 minutes',
        },
      }

      setFeeData(feeData)
    } catch (error) {
      console.error('Failed to fetch fee estimation:', error)
      // Fallback data
      const fallbackData: FeeEstimationData = {
        slow: { feeRate: 1, estimatedBlocks: 20, estimatedTime: '~3-4 hours' },
        normal: { feeRate: 2, estimatedBlocks: 6, estimatedTime: '~1 hour' },
        fast: { feeRate: 5, estimatedBlocks: 2, estimatedTime: '~20 minutes' },
        urgent: { feeRate: 10, estimatedBlocks: 1, estimatedTime: '~10 minutes' },
      }
      setFeeData(fallbackData)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFeeEstimation()
  }, [])

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>
          Loading fee estimation...
        </Text>
      </View>
    )
  }

  if (!feeData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={[styles.errorText, isDark && styles.errorTextDark]}>
          Unable to load fee estimation data
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, isDark && styles.titleDark]}>Fee Estimation</Text>
        <Pressable onPress={() => setShowDetails(!showDetails)} style={styles.detailsToggle}>
          <Text style={[styles.detailsText, isDark && styles.detailsTextDark]}>
            {showDetails ? 'Hide Details' : 'Show Details'}
          </Text>
          <IconSymbol
            name={showDetails ? 'chevron.up' : 'chevron.down'}
            size={14}
            color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
          />
        </Pressable>
      </View>

      {/* Fee Rate Options */}
      <View style={styles.feeOptions}>
        {Object.entries(feeData).map(([key, data]) => (
          <Pressable
            key={key}
            style={[
              styles.feeOption,
              selectedFeeRate === key && styles.feeOptionSelected,
              isDark && styles.feeOptionDark,
            ]}
            onPress={() => onFeeRateChange(key as 'slow' | 'normal' | 'fast' | 'urgent')}
          >
            <View style={styles.feeOptionHeader}>
              <Text style={[styles.feeOptionLabel, isDark && styles.feeOptionLabelDark]}>
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </Text>
              <Text style={[styles.feeRate, isDark && styles.feeRateDark]}>
                {data.feeRate} sat/vB
              </Text>
            </View>
            <Text style={[styles.estimatedTime, isDark && styles.estimatedTimeDark]}>
              {data.estimatedTime}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Detailed Information */}
      {showDetails && (
        <View style={[styles.detailsContainer, isDark && styles.detailsContainerDark]}>
          <Text style={[styles.detailsTitle, isDark && styles.detailsTitleDark]}>
            Network Conditions
          </Text>

          <View style={styles.networkStats}>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>
                Current Block Height
              </Text>
              <Text style={[styles.statValue, isDark && styles.statValueDark]}>Loading...</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Mempool Size</Text>
              <Text style={[styles.statValue, isDark && styles.statValueDark]}>Loading...</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>
                Recommended Fee
              </Text>
              <Text style={[styles.statValue, isDark && styles.statValueDark]}>
                {feeData.normal.feeRate} sat/vB
              </Text>
            </View>
          </View>

          <View style={styles.feeChart}>
            <Text style={[styles.chartTitle, isDark && styles.chartTitleDark]}>
              Fee Rate Distribution
            </Text>
            {/* Placeholder for fee rate histogram */}
            <View style={[styles.chartPlaceholder, isDark && styles.chartPlaceholderDark]}>
              <IconSymbol name="chart.bar.fill" size={48} color={colors.textSecondary.light} />
              <Text style={[styles.placeholderText, isDark && styles.placeholderTextDark]}>
                Fee rate distribution chart would be displayed here
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Custom Fee Option */}
      {enableCustomFee && (
        <View style={[styles.customFeeContainer, isDark && styles.customFeeContainerDark]}>
          <Text style={[styles.customFeeLabel, isDark && styles.customFeeLabelDark]}>
            Custom Fee Rate (sat/vB)
          </Text>
          {/* Custom fee input would go here */}
          <Text style={[styles.customFeeNote, isDark && styles.customFeeNoteDark]}>
            Custom fee rates may result in slower or faster confirmation times.
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.light,
  },
  titleDark: {
    color: colors.text.dark,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailsText: {
    fontSize: 14,
    color: colors.primary,
  },
  detailsTextDark: {
    color: colors.primary,
  },
  feeOptions: {
    gap: 8,
  },
  feeOption: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: alpha(colors.black, 0.05),
    borderWidth: 1,
    borderColor: 'transparent',
  },
  feeOptionDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  feeOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: alpha(colors.primary, 0.1),
  },
  feeOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  feeOptionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.light,
  },
  feeOptionLabelDark: {
    color: colors.text.dark,
  },
  feeRate: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  feeRateDark: {
    color: colors.primary,
  },
  estimatedTime: {
    fontSize: 12,
    color: colors.textSecondary.light,
  },
  estimatedTimeDark: {
    color: colors.textSecondary.dark,
  },
  detailsContainer: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: alpha(colors.black, 0.05),
  },
  detailsContainerDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.light,
    marginBottom: 12,
  },
  detailsTitleDark: {
    color: colors.text.dark,
  },
  networkStats: {
    marginBottom: 16,
  },
  statItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statLabel: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  statLabelDark: {
    color: colors.textSecondary.dark,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.light,
  },
  statValueDark: {
    color: colors.text.dark,
  },
  feeChart: {
    marginTop: 16,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 8,
  },
  chartTitleDark: {
    color: colors.text.dark,
  },
  chartPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: 8,
    backgroundColor: alpha(colors.black, 0.05),
  },
  chartPlaceholderDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  placeholderText: {
    fontSize: 12,
    color: colors.textSecondary.light,
    marginTop: 8,
    textAlign: 'center',
  },
  placeholderTextDark: {
    color: colors.textSecondary.dark,
  },
  customFeeContainer: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: alpha(colors.warning, 0.1),
    borderWidth: 1,
    borderColor: colors.warning,
  },
  customFeeContainerDark: {
    backgroundColor: alpha(colors.warning, 0.1),
  },
  customFeeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 8,
  },
  customFeeLabelDark: {
    color: colors.text.dark,
  },
  customFeeNote: {
    fontSize: 12,
    color: colors.textSecondary.light,
  },
  customFeeNoteDark: {
    color: colors.textSecondary.dark,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  loadingTextDark: {
    color: colors.textSecondary.dark,
  },
  errorContainer: {
    padding: 16,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
  },
  errorTextDark: {
    color: colors.error,
  },
})
