import { StyleSheet } from 'react-native'
import colors from '@/shared/ui/colors'
import { alpha } from '@/shared/theme/utils'

const defaultStyles: Record<string, ReturnType<typeof StyleSheet.create>> = {
  // button
  button: StyleSheet.create({
    primary: {
      flex: 1,
      padding: 16,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
}
