import React, { useState, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { useIsDark } from '@/ui/features/app-provider'
import { transactionService } from '@/core/services'

interface TaprootAddressSelectorProps {
  selectedAddressType: 'legacy' | 'segwit' | 'taproot'
  onAddressTypeChange: (type: 'legacy' | 'segwit' | 'taproot') => void
  onTaprootAddressGenerated?: (address: string) => void
}

export default function TaprootAddressSelector({
  selectedAddressType,
  onAddressTypeChange,
  onTaprootAddressGenerated,
}: TaprootAddressSelectorProps) {
  const isDark = useIsDark()
  const [showOptions, setShowOptions] = useState(false)
  const [taprootAddress, setTaprootAddress] = useState<string>('')

  const addressTypes = [
    {
      key: 'segwit' as const,
      label: 'SegWit (P2WPKH)',
      description: 'Modern address format with lower fees',
      prefix: 'bc1q',
    },
    {
      key: 'taproot' as const,
      label: 'Taproot (P2TR)',
      description: 'Latest Bitcoin upgrade with enhanced privacy and smart contracts',
      prefix: 'bc1p',
    },
  ]

  const selectedTypeInfo = addressTypes.find(t => t.key === selectedAddressType)

  const generateTaprootAddress = useCallback(async () => {
    try {
      const address = transactionService.generateTaprootAddress()
      setTaprootAddress(address)
      onTaprootAddressGenerated?.(address)
    } catch (error) {
      console.error('Failed to generate Taproot address:', error)
      Alert.alert('Error', 'Failed to generate Taproot address')
    }
  }, [onTaprootAddressGenerated])

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.header, isDark && styles.headerDark]}
        onPress={() => setShowOptions(!showOptions)}
      >
        <View style={styles.headerContent}>
          <IconSymbol
            name="bitcoinsign.circle"
            size={20}
            color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
          />
          <Text style={[styles.headerText, isDark && styles.headerTextDark]}>
            Address Type: {selectedTypeInfo?.label || 'SegWit'}
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
            Choose Address Format
          </Text>

          {addressTypes.map(type => (
            <Pressable
              key={type.key}
              style={[
                styles.addressTypeOption,
                selectedAddressType === type.key && styles.addressTypeOptionSelected,
                isDark && styles.addressTypeOptionDark,
              ]}
              onPress={() => onAddressTypeChange(type.key)}
            >
              <View style={styles.typeContent}>
                <Text
                  style={[
                    styles.typeLabel,
                    selectedAddressType === type.key && styles.typeLabelSelected,
                    isDark && styles.typeLabelDark,
                  ]}
                >
                  {type.label}
                </Text>
                <Text style={[styles.typeDescription, isDark && styles.typeDescriptionDark]}>
                  {type.description}
                </Text>
                <Text style={[styles.typePrefix, isDark && styles.typePrefixDark]}>
                  Format: {type.prefix}...
                </Text>
              </View>
              {selectedAddressType === type.key && (
                <IconSymbol name="checkmark" size={16} color={colors.primary} />
              )}
            </Pressable>
          ))}

          {selectedAddressType === 'taproot' && taprootAddress && (
            <View style={styles.taprootPreview}>
              <Text style={[styles.previewLabel, isDark && styles.previewLabelDark]}>
                Generated Taproot Address:
              </Text>
              <Text style={[styles.previewAddress, isDark && styles.previewAddressDark]}>
                {taprootAddress}
              </Text>
              <Pressable
                style={[styles.regenerateButton, isDark && styles.regenerateButtonDark]}
                onPress={generateTaprootAddress}
              >
                <IconSymbol name="arrow.clockwise" size={14} color={colors.primary} />
                <Text style={styles.regenerateText}>Generate New</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.infoBox}>
            <IconSymbol
              name="info.circle.fill"
              size={16}
              style={styles.infoIcon}
              color={colors.info}
            />
            <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
              Taproot addresses provide better privacy and enable advanced smart contract
              functionality. Not all wallets support Taproot yet.
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
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  addressTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  addressTypeOptionSelected: {
    backgroundColor: alpha(colors.primary, 0.1),
  },
  addressTypeOptionDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  typeContent: {
    flex: 1,
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 2,
  },
  typeLabelSelected: {
    color: colors.primary,
  },
  typeLabelDark: {
    color: colors.text.dark,
  },
  typeDescription: {
    fontSize: 12,
    color: colors.textSecondary.light,
    marginBottom: 4,
  },
  typeDescriptionDark: {
    color: colors.textSecondary.dark,
  },
  typePrefix: {
    fontSize: 11,
    color: colors.textSecondary.light,
    fontFamily: 'monospace',
  },
  typePrefixDark: {
    color: colors.textSecondary.dark,
  },
  taprootPreview: {
    marginTop: 16,
    padding: 12,
    backgroundColor: alpha(colors.primary, 0.05),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.2),
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary.light,
    marginBottom: 4,
  },
  previewLabelDark: {
    color: colors.textSecondary.dark,
  },
  previewAddress: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text.light,
    marginBottom: 8,
    lineHeight: 18,
  },
  previewAddressDark: {
    color: colors.text.dark,
  },
  regenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: alpha(colors.primary, 0.1),
    borderRadius: 6,
    gap: 4,
  },
  regenerateButtonDark: {
    backgroundColor: alpha(colors.primary, 0.2),
  },
  regenerateText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    marginTop: 16,
    backgroundColor: alpha(colors.info, 0.1),
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: colors.info,
  },
  infoIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: colors.info,
    lineHeight: 16,
  },
  infoTextDark: {
    color: alpha(colors.info, 0.9),
  },
})
