import { Pressable, PressableProps, View, Text } from 'react-native'
import { GlassView } from 'expo-glass-effect'
import colors from '@/ui/colors'

interface ButtonProps extends PressableProps {
  children: React.ReactNode
  tintColor?: string
  isInteractive?: boolean
  glassStyle?: any
  startIcon?: React.ReactNode
  endIcon?: React.ReactNode
  variant?: 'glass' | 'solid'
  backgroundColor?: string
  color?: string
}

export default function Button({
  children,
  tintColor,
  isInteractive = true,
  glassStyle,
  startIcon,
  endIcon,
  variant = 'glass',
  backgroundColor,
  color,
  ...props
}: ButtonProps) {
  const defaultTintColor = undefined

  const finalTintColor = tintColor ?? defaultTintColor

  const defaultGlassStyle = {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  }

  const finalGlassStyle = [defaultGlassStyle, glassStyle].filter(Boolean)

  const textColor =
    color ||
    (variant === 'solid' && backgroundColor === colors.primary ? colors.white : colors.text.light)

  const content = (
    <>
      {startIcon}
      <Text style={{ color: textColor, fontWeight: '500', fontSize: 16 }}>{children}</Text>
      {endIcon}
    </>
  )

  if (variant === 'solid') {
    const solidStyle = [
      defaultGlassStyle,
      { backgroundColor: backgroundColor || colors.white },
      glassStyle,
    ].filter(Boolean)
    return (
      <Pressable {...props}>
        <View style={solidStyle}>{content}</View>
      </Pressable>
    )
  }

  return (
    <Pressable {...props}>
      <GlassView isInteractive={isInteractive} style={finalGlassStyle} tintColor={finalTintColor}>
        {content}
      </GlassView>
    </Pressable>
  )
}
