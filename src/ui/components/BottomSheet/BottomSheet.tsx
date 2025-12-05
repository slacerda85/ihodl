import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native'

import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'

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
   * Presentation detents (snap points) - not used in fallback
   */
  detents?: ('medium' | 'large' | number)[]
  /**
   * Container style
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
   * Presentation detents (snap points) - not used in fallback
   */
  detents?: ('medium' | 'large' | number)[]
  /**
   * Style for the trigger pressable
   */
  style?: ViewStyle
}

// ============================================================================
// BottomSheet Component (Fallback using Modal)
// ============================================================================

export function BottomSheet({ isOpen, onOpenChange, title, children }: BottomSheetProps) {
  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={() => onOpenChange(false)}
    >
      <Pressable style={styles.backdrop} onPress={() => onOpenChange(false)} />
      <View style={styles.sheet}>
        <View style={styles.dragIndicator} />
        {title && <Text style={styles.title}>{title}</Text>}
        <View style={styles.content}>{children}</View>
      </View>
    </Modal>
  )
}

// ============================================================================
// BottomSheetTrigger Component
// ============================================================================

export function BottomSheetTrigger({
  children,
  title,
  sheetContent,
  style,
}: BottomSheetTriggerProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Pressable onPress={() => setIsOpen(true)} style={style}>
        {children}
      </Pressable>
      <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} title={title}>
        {sheetContent}
      </BottomSheet>
    </>
  )
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: alpha(colors.black, 0.5),
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background.light,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    minHeight: 200,
  },
  dragIndicator: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: alpha(colors.black, 0.2),
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 20,
    marginBottom: 12,
    color: colors.text.light,
  },
  content: {
    paddingHorizontal: 20,
  },
})
