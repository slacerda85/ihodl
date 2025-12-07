import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { useIsDark } from '@/ui/features/app-provider'

interface AdvancedTransactionOptionsProps {
  enableRBF: boolean
  onEnableRBFChange: (enable: boolean) => void
  selectedSighashType: 'ALL' | 'NONE' | 'SINGLE' | 'ANYONECANPAY'
  onSighashTypeChange: (type: 'ALL' | 'NONE' | 'SINGLE' | 'ANYONECANPAY') => void
}

export default function AdvancedTransactionOptions({
  enableRBF,
  onEnableRBFChange,
  selectedSighashType,
  onSighashTypeChange,
}: AdvancedTransactionOptionsProps) {
  const isDark = useIsDark()
  const [showOptions, setShowOptions] = useState(false)

  const sighashTypes = [
    {
      key: 'ALL' as const,
      label: 'SIGHASH_ALL',
      description: 'Signs all inputs and outputs (default, most secure)',
    },
    {
      key: 'NONE' as const,
      label: 'SIGHASH_NONE',
      description: 'Signs no outputs (allows output modification)',
    },
    {
      key: 'SINGLE' as const,
      label: 'SIGHASH_SINGLE',
      description: 'Signs only corresponding output',
    },
    {
      key: 'ANYONECANPAY' as const,
      label: 'SIGHASH_ANYONECANPAY',
      description: 'Allows additional inputs to be added',
    },
  ]

  const selectedSighashInfo = sighashTypes.find(t => t.key === selectedSighashType)

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.header, isDark && styles.headerDark]}
        onPress={() => setShowOptions(!showOptions)}
      >
        <View style={styles.headerContent}>
          <IconSymbol
            name="gear"
            size={20}
            color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
          />
          <Text style={[styles.headerText, isDark && styles.headerTextDark]}>Advanced Options</Text>
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
            Transaction Features
          </Text>

          <Pressable
            style={[styles.optionRow, isDark && styles.optionRowDark]}
            onPress={() => onEnableRBFChange(!enableRBF)}
          >
            <View style={styles.optionContent}>
              <Text style={[styles.optionLabel, isDark && styles.optionLabelDark]}>
                Replace-By-Fee (RBF)
              </Text>
              <Text style={[styles.optionDescription, isDark && styles.optionDescriptionDark]}>
                Allow this transaction to be replaced with higher fees
              </Text>
            </View>
            <View
              style={[
                styles.checkbox,
                enableRBF && styles.checkboxChecked,
                isDark && styles.checkboxDark,
              ]}
            >
              {enableRBF && <IconSymbol name="checkmark" size={12} color={colors.white} />}
            </View>
          </Pressable>

          <View style={styles.separator} />

          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Sighash Type</Text>

          {sighashTypes.map(type => (
            <Pressable
              key={type.key}
              style={[
                styles.sighashOption,
                selectedSighashType === type.key && styles.sighashOptionSelected,
                isDark && styles.sighashOptionDark,
              ]}
              onPress={() => onSighashTypeChange(type.key)}
            >
              <View style={styles.sighashContent}>
                <Text
                  style={[
                    styles.sighashLabel,
                    selectedSighashType === type.key && styles.sighashLabelSelected,
                    isDark && styles.sighashLabelDark,
                  ]}
                >
                  {type.label}
                </Text>
                <Text style={[styles.sighashDescription, isDark && styles.sighashDescriptionDark]}>
                  {type.description}
                </Text>
              </View>
              {selectedSighashType === type.key && (
                <IconSymbol name="checkmark" size={16} color={colors.primary} />
              )}
            </Pressable>
          ))}

          <View style={styles.warningBox}>
            <IconSymbol
              name="exclamationmark.triangle.fill"
              size={16}
              color={colors.warning}
              style={styles.warningIcon}
            />
            <Text style={[styles.warningText, isDark && styles.warningTextDark]}>
              Advanced sighash types can reduce security. Only use if you understand the
              implications.
            </Text>
          </View>
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
  separator: {
    height: 1,
    backgroundColor: alpha(colors.black, 0.1),
    marginVertical: 16,
  },
  sighashOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  sighashOptionSelected: {
    backgroundColor: alpha(colors.primary, 0.1),
  },
  sighashOptionDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  sighashContent: {
    flex: 1,
  },
  sighashLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 2,
  },
  sighashLabelSelected: {
    color: colors.primary,
  },
  sighashLabelDark: {
    color: colors.text.dark,
  },
  sighashDescription: {
    fontSize: 12,
    color: colors.textSecondary.light,
  },
  sighashDescriptionDark: {
    color: colors.textSecondary.dark,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    marginTop: 16,
    backgroundColor: alpha(colors.warning, 0.1),
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  warningIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: colors.warning,
    lineHeight: 16,
  },
  warningTextDark: {
    color: alpha(colors.warning, 0.9),
  },
})
