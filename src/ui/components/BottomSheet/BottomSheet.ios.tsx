import { useState } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, ViewStyle } from 'react-native'
import { BottomSheet as ExpoBottomSheet, Host, Text } from '@expo/ui/swift-ui'
import { padding } from '@expo/ui/swift-ui/modifiers'

// ============================================================================
// Types
// ============================================================================

export interface BottomSheetProps {
  /**
   * Whether the BottomSheet is visible
   */
  isOpen: boolean
  /**
   * Callback when the BottomSheet open state changes
   */
  onOpenChange: (isOpen: boolean) => void
  /**
   * Title displayed at the top of the BottomSheet
   */
  title?: string
  /**
   * Content to display in the BottomSheet
   */
  children: React.ReactNode
  /**
   * Presentation detents (snap points)
   * @default ['medium']
   */
  detents?: ('medium' | 'large' | number)[]
  /**
   * Container style for the Host wrapper
   */
  style?: ViewStyle
}

export interface BottomSheetTriggerProps {
  /**
   * Content to render as the trigger
   */
  children: React.ReactNode
  /**
   * Title displayed at the top of the BottomSheet
   */
  title?: string
  /**
   * Content to display in the BottomSheet when opened
   */
  sheetContent: React.ReactNode
  /**
   * Presentation detents (snap points)
   * @default ['medium']
   */
  detents?: ('medium' | 'large' | number)[]
  /**
   * Style for the trigger pressable
   */
  style?: ViewStyle
}

// ============================================================================
// BottomSheet Component
// ============================================================================

export function BottomSheet({
  isOpen,
  onOpenChange,
  title,
  children,
  detents = ['medium'],
  style,
}: BottomSheetProps) {
  const { width } = useWindowDimensions()

  return (
    <Host style={[styles.host, { width }, style]}>
      <ExpoBottomSheet
        isOpened={isOpen}
        onIsOpenedChange={onOpenChange}
        presentationDetents={detents}
        presentationDragIndicator="visible"
      >
        {title && <Text modifiers={[padding({ bottom: 8 })]}>{title}</Text>}
        {children}
      </ExpoBottomSheet>
    </Host>
  )
}

// ============================================================================
// BottomSheetTrigger Component
// ============================================================================

export function BottomSheetTrigger({
  children,
  title,
  sheetContent,
  detents = ['medium'],
  style,
}: BottomSheetTriggerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { width } = useWindowDimensions()

  return (
    <>
      <Pressable onPress={() => setIsOpen(true)} style={style}>
        {children}
      </Pressable>
      <Host style={[styles.host, { width }]}>
        <ExpoBottomSheet
          isOpened={isOpen}
          onIsOpenedChange={setIsOpen}
          presentationDetents={detents}
          presentationDragIndicator="visible"
        >
          {title && <Text modifiers={[padding({ top: 24 })]}>{title}</Text>}
          {sheetContent}
        </ExpoBottomSheet>
      </Host>
    </>
  )
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
  },
})
