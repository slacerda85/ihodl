import React, { useEffect, useMemo } from 'react'
import { Animated, ViewStyle, StyleSheet } from 'react-native'
import { useActiveColorMode } from '@/ui/features/app-provider'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'

interface SkeletonProps {
  width?: number | string
  height?: number | string
  borderRadius?: number
  style?: ViewStyle
}

const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style,
}) => {
  const colorMode = useActiveColorMode()
  const opacity = useMemo(() => new Animated.Value(0.3), [])

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    )
    animation.start()

    return () => animation.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[
        styles[colorMode],
        { width: width as any, height: height as any, borderRadius, opacity },
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  light: {
    backgroundColor: alpha(colors.black, 0.1),
  },
  dark: {
    backgroundColor: alpha(colors.white, 0.1),
  },
})

export default Skeleton
