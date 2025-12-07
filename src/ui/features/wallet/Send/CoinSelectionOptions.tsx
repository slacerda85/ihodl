import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { useIsDark } from '@/ui/features/app-provider'

interface CoinSelectionOptionsProps {
  selectedAlgorithm:
    | 'largest_first'
    | 'smallest_first'
    | 'branch_and_bound'
    | 'random'
    | 'privacy_focused'
  onAlgorithmChange: (
    algorithm:
      | 'largest_first'
      | 'smallest_first'
      | 'branch_and_bound'
      | 'random'
      | 'privacy_focused',
  ) => void
  avoidAddressReuse: boolean
  onAvoidAddressReuseChange: (avoid: boolean) => void
  consolidateSmallUtxos: boolean
  onConsolidateSmallUtxosChange: (consolidate: boolean) => void
}

export default function CoinSelectionOptions({
  selectedAlgorithm,
  onAlgorithmChange,
  avoidAddressReuse,
  onAvoidAddressReuseChange,
  consolidateSmallUtxos,
  onConsolidateSmallUtxosChange,
}: CoinSelectionOptionsProps) {
  const isDark = useIsDark()
  const [showOptions, setShowOptions] = useState(false)

  const algorithms = [
    {
      key: 'branch_and_bound' as const,
      label: 'Branch & Bound',
      description: 'Optimal selection with minimal waste',
    },
    {
      key: 'largest_first' as const,
      label: 'Largest First',
      description: 'Fast, uses largest UTXOs first',
    },
    {
      key: 'privacy_focused' as const,
      label: 'Privacy Focused',
      description: 'Maximizes address diversity',
    },
    {
      key: 'smallest_first' as const,
      label: 'Smallest First',
      description: 'Consolidates small UTXOs',
    },
    { key: 'random' as const, label: 'Random', description: 'Random selection for privacy' },
  ]

  const selectedAlgorithmInfo = algorithms.find(a => a.key === selectedAlgorithm)

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.header, isDark && styles.headerDark]}
        onPress={() => setShowOptions(!showOptions)}
      >
        <View style={styles.headerContent}>
          <IconSymbol
            name="cpu"
            size={20}
            color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
          />
          <Text style={[styles.headerText, isDark && styles.headerTextDark]}>
            Coin Selection: {selectedAlgorithmInfo?.label}
          </Text>
        </View>
        <IconSymbol
          name={showOptions ? 'chevron.up' : 'chevron.down'}
          size={16}
          color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
        />
      </Pressable>

      {showOptions && (
        <View style={[styles.optionsContainer, isDark && styles.optionsContainerDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            Selection Algorithm
          </Text>

          {algorithms.map(algorithm => (
            <Pressable
              key={algorithm.key}
              style={[
                styles.algorithmOption,
                selectedAlgorithm === algorithm.key && styles.algorithmOptionSelected,
                isDark && styles.algorithmOptionDark,
              ]}
              onPress={() => onAlgorithmChange(algorithm.key)}
            >
              <View style={styles.algorithmContent}>
                <Text
                  style={[
                    styles.algorithmLabel,
                    selectedAlgorithm === algorithm.key && styles.algorithmLabelSelected,
                    isDark && styles.algorithmLabelDark,
                  ]}
                >
                  {algorithm.label}
                </Text>
                <Text
                  style={[styles.algorithmDescription, isDark && styles.algorithmDescriptionDark]}
                >
                  {algorithm.description}
                </Text>
              </View>
              {selectedAlgorithm === algorithm.key && (
                <IconSymbol name="checkmark" size={16} color={colors.primary} />
              )}
            </Pressable>
          ))}

          <View style={styles.separator} />

          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            Privacy Options
          </Text>

          <Pressable
            style={[styles.optionRow, isDark && styles.optionRowDark]}
            onPress={() => onAvoidAddressReuseChange(!avoidAddressReuse)}
          >
            <View style={styles.optionContent}>
              <Text style={[styles.optionLabel, isDark && styles.optionLabelDark]}>
                Avoid Address Reuse
              </Text>
              <Text style={[styles.optionDescription, isDark && styles.optionDescriptionDark]}>
                Prefer UTXOs from different addresses for better privacy
              </Text>
            </View>
            <View
              style={[
                styles.checkbox,
                avoidAddressReuse && styles.checkboxChecked,
                isDark && styles.checkboxDark,
              ]}
            >
              {avoidAddressReuse && <IconSymbol name="checkmark" size={12} color={colors.white} />}
            </View>
          </Pressable>

          <Pressable
            style={[styles.optionRow, isDark && styles.optionRowDark]}
            onPress={() => onConsolidateSmallUtxosChange(!consolidateSmallUtxos)}
          >
            <View style={styles.optionContent}>
              <Text style={[styles.optionLabel, isDark && styles.optionLabelDark]}>
                Consolidate Small UTXOs
              </Text>
              <Text style={[styles.optionDescription, isDark && styles.optionDescriptionDark]}>
                Include dust UTXOs for consolidation when beneficial
              </Text>
            </View>
            <View
              style={[
                styles.checkbox,
                consolidateSmallUtxos && styles.checkboxChecked,
                isDark && styles.checkboxDark,
              ]}
            >
              {consolidateSmallUtxos && (
                <IconSymbol name="checkmark" size={12} color={colors.white} />
              )}
            </View>
          </Pressable>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: alpha(colors.black, 0.05),
    borderRadius: 12,
  },
  headerDark: {
    backgroundColor: alpha(colors.white, 0.1),
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary.light,
  },
  headerTextDark: {
    color: colors.textSecondary.dark,
  },
  optionsContainer: {
    marginTop: 8,
    padding: 16,
    backgroundColor: alpha(colors.black, 0.03),
    borderRadius: 12,
  },
  optionsContainerDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.light,
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  algorithmOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  algorithmOptionSelected: {
    backgroundColor: alpha(colors.primary, 0.1),
  },
  algorithmOptionDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  algorithmContent: {
    flex: 1,
  },
  algorithmLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 2,
  },
  algorithmLabelSelected: {
    color: colors.primary,
  },
  algorithmLabelDark: {
    color: colors.text.dark,
  },
  algorithmDescription: {
    fontSize: 12,
    color: colors.textSecondary.light,
  },
  algorithmDescriptionDark: {
    color: colors.textSecondary.dark,
  },
  separator: {
    height: 1,
    backgroundColor: alpha(colors.black, 0.1),
    marginVertical: 16,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  optionRowDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 2,
  },
  optionLabelDark: {
    color: colors.text.dark,
  },
  optionDescription: {
    fontSize: 12,
    color: colors.textSecondary.light,
  },
  optionDescriptionDark: {
    color: colors.textSecondary.dark,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.textSecondary.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxDark: {
    borderColor: colors.textSecondary.dark,
  },
})
