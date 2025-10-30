import { Pressable, PressableProps, View, Text, ActivityIndicator } from 'react-native'
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
  loading?: boolean
  loadingMessage?: string
  disabled?: boolean
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
  loading = false,
  loadingMessage,
  disabled = false,
  ...props
}: ButtonProps) {
  const defaultTintColor = undefined

  const isDisabled = disabled || loading
  const finalTintColor = loading ? 'rgba(199,199,204,0.3)' : (tintColor ?? defaultTintColor)

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

  let content: React.ReactNode

  if (loading) {
    const spinner = <ActivityIndicator size="small" color={textColor} />
    if (loadingMessage) {
      content = (
        <>
          {spinner}
          <Text style={{ color: textColor, fontWeight: '500', fontSize: 16 }}>
            {loadingMessage}
          </Text>
        </>
      )
    } else {
      content = spinner
    }
  } else {
    content = (
      <>
        {startIcon}
        <Text style={{ color: textColor, fontWeight: '500', fontSize: 16 }}>{children}</Text>
        {endIcon}
      </>
    )
  }

  if (variant === 'solid') {
    const solidStyle = [
      defaultGlassStyle,
      { backgroundColor: backgroundColor || colors.white },
      glassStyle,
    ].filter(Boolean)
    return (
      <Pressable disabled={isDisabled} {...props}>
        <View style={solidStyle}>{content}</View>
      </Pressable>
    )
  }

  return (
    <Pressable disabled={isDisabled} {...props}>
      <GlassView isInteractive={isInteractive} style={finalGlassStyle} tintColor={finalTintColor}>
        {content}
      </GlassView>
    </Pressable>
  )
}
