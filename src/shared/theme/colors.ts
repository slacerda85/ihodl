import { alpha } from './utils'

type Colors = {
  primary: string
  secondary: string
  background: ColorScheme
  text: ColorScheme
  textSecondary: ColorScheme
  border: ColorScheme
  shadow: string
  success: string
  error: string
  warning: string
  info: string
  disabled: string
  placeholder: string
  overlay: string
  divider: string
  black: string
  white: string
  transparent: string
}

type ColorScheme = {
  light: string
  dark: string
}

// color scheme based on Bitcoin.org colors
const colors: Colors = {
  primary: '#F7931A',
  secondary: '#142850',
  background: {
    light: '#F8F8F8',
    dark: '#121212',
  },
  text: {
    light: '#1D1D1D',
    dark: '#F8F8F8',
  },
  textSecondary: {
    light: '#6B7280',
    dark: '#9CA3AF',
  },
  border: {
    light: '#E5E7EB',
    dark: '#374151',
  },
  shadow: 'rgba(0, 0, 0, 0.1)',
  success: '#34D399',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  disabled: '#D1D5DB',
  placeholder: '#9CA3AF',
  overlay: alpha('#000000', 0.7),
  divider: '#E5E7EB',
  black: '#000000',
  white: '#FFFFFF',
  transparent: 'transparent',
}

export default colors
