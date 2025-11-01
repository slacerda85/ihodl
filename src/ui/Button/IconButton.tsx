import { PressableProps } from 'react-native'
import Button from './Button'

interface IconButtonProps extends Omit<PressableProps, 'disabled'> {
  icon: React.ReactNode
  tintColor?: string
  isInteractive?: boolean
  glassStyle?: any
  variant?: 'glass' | 'solid'
  backgroundColor?: string
  disabled?: boolean
}

export default function IconButton({
  icon,
  tintColor,
  isInteractive = true,
  glassStyle,
  variant = 'glass',
  backgroundColor,
  ...props
}: IconButtonProps) {
  const defaultIconGlassStyle = {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  }

  const finalGlassStyle = [defaultIconGlassStyle, glassStyle].filter(Boolean)

  return (
    <Button
      tintColor={tintColor}
      isInteractive={isInteractive}
      glassStyle={finalGlassStyle}
      variant={variant}
      backgroundColor={backgroundColor}
      {...props}
    >
      {icon}
    </Button>
  )
}
