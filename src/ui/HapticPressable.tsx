import { PlatformPressable } from '@react-navigation/elements'
import * as Haptics from 'expo-haptics'

export function HapticPressable(props: React.ComponentProps<typeof PlatformPressable>) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={ev => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        }
        props.onPressIn?.(ev)
      }}
    >
      {props.children}
    </PlatformPressable>
  )
}
