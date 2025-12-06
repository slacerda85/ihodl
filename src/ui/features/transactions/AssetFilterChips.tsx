/**
 * Componentes de Filtro para Transações
 *
 * Chips selecionáveis para filtrar por tipo de ativo
 */

import React from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  type ViewStyle,
  type TextStyle,
} from 'react-native'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import type { AssetType } from './types'
import { ASSET_CONFIG } from './types'

// ==========================================
// TYPES
// ==========================================

interface AssetFilterChipsProps {
  /** Ativos atualmente selecionados */
  selectedAssets: AssetType[]
  /** Callback quando um ativo é toggled */
  onToggle: (asset: AssetType) => void
  /** Contagem de transações por ativo */
  assetCounts: Record<AssetType, number>
  /** Modo de cor (light/dark) */
  isDark: boolean
  /** Ativos a exibir (default: todos com count > 0) */
  visibleAssets?: AssetType[]
}

interface AssetChipProps {
  asset: AssetType
  isSelected: boolean
  count: number
  onPress: () => void
  isDark: boolean
}

// ==========================================
// ASSET CHIP COMPONENT
// ==========================================

function AssetChip({ asset, isSelected, count, onPress, isDark }: AssetChipProps) {
  const config = ASSET_CONFIG[asset]
  const textColor = isDark ? colors.text.dark : colors.text.light

  const containerStyle = [
    chipStyles.container,
    {
      backgroundColor: isSelected ? alpha(config.color, 0.2) : alpha(textColor, 0.05),
      borderColor: isSelected ? config.color : 'transparent',
    },
  ]

  const labelStyle = [
    chipStyles.label,
    { color: isSelected ? config.color : alpha(textColor, 0.7) },
  ]

  const countStyle = [
    chipStyles.count,
    { color: isSelected ? config.color : alpha(textColor, 0.5) },
  ]

  return (
    <TouchableOpacity style={containerStyle} onPress={onPress} activeOpacity={0.7}>
      <IconSymbol
        name={config.icon as any}
        size={16}
        color={isSelected ? config.color : alpha(textColor, 0.6)}
      />
      <Text style={labelStyle}>{config.shortLabel}</Text>
      {count > 0 && <Text style={countStyle}>({count})</Text>}
    </TouchableOpacity>
  )
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export function AssetFilterChips({
  selectedAssets,
  onToggle,
  assetCounts,
  isDark,
  visibleAssets,
}: AssetFilterChipsProps) {
  // Determinar quais ativos mostrar
  const assetsToShow =
    visibleAssets ??
    (Object.keys(ASSET_CONFIG) as AssetType[]).filter(asset => assetCounts[asset] > 0)

  // Se só tem um tipo de ativo, não mostrar filtros
  if (assetsToShow.length <= 1) {
    return null
  }

  const textColor = isDark ? colors.text.dark : colors.text.light

  return (
    <View style={styles.container}>
      {/* All button */}
      <TouchableOpacity
        style={[
          chipStyles.container,
          {
            backgroundColor:
              selectedAssets.length === 0 ? alpha(colors.primary, 0.15) : alpha(textColor, 0.05),
            borderColor: selectedAssets.length === 0 ? colors.primary : 'transparent',
          },
        ]}
        onPress={() => {
          // Clear all filters (select all)
          if (selectedAssets.length > 0) {
            for (const asset of selectedAssets) {
              onToggle(asset)
            }
          }
        }}
        activeOpacity={0.7}
      >
        <Text
          style={[
            chipStyles.label,
            { color: selectedAssets.length === 0 ? colors.primary : alpha(textColor, 0.7) },
          ]}
        >
          Todos
        </Text>
      </TouchableOpacity>

      {/* Asset chips */}
      {assetsToShow.map(asset => (
        <AssetChip
          key={asset}
          asset={asset}
          isSelected={selectedAssets.includes(asset)}
          count={assetCounts[asset]}
          onPress={() => onToggle(asset)}
          isDark={isDark}
        />
      ))}
    </View>
  )
}

// ==========================================
// DIRECTION FILTER COMPONENT
// ==========================================

type DirectionFilter = 'all' | 'sent' | 'received'

interface DirectionFilterChipsProps {
  selected: DirectionFilter
  onSelect: (direction: DirectionFilter) => void
  isDark: boolean
}

export function DirectionFilterChips({ selected, onSelect, isDark }: DirectionFilterChipsProps) {
  const textColor = isDark ? colors.text.dark : colors.text.light

  const options: { key: DirectionFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'Todos', icon: 'arrow.left.arrow.right' },
    { key: 'sent', label: 'Enviados', icon: 'arrow.up.right' },
    { key: 'received', label: 'Recebidos', icon: 'arrow.down.left' },
  ]

  return (
    <View style={styles.container}>
      {options.map(option => {
        const isSelected = selected === option.key
        return (
          <TouchableOpacity
            key={option.key}
            style={[
              chipStyles.container,
              {
                backgroundColor: isSelected ? alpha(colors.primary, 0.15) : alpha(textColor, 0.05),
                borderColor: isSelected ? colors.primary : 'transparent',
              },
            ]}
            onPress={() => onSelect(option.key)}
            activeOpacity={0.7}
          >
            <IconSymbol
              name={option.icon as any}
              size={14}
              color={isSelected ? colors.primary : alpha(textColor, 0.6)}
            />
            <Text
              style={[
                chipStyles.label,
                { color: isSelected ? colors.primary : alpha(textColor, 0.7) },
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
  } as ViewStyle,
})

const chipStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  } as ViewStyle,
  label: {
    fontSize: 13,
    fontWeight: '500',
  } as TextStyle,
  count: {
    fontSize: 12,
    fontWeight: '400',
  } as TextStyle,
})

export default AssetFilterChips
