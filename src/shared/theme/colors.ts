type Colors = {
  background: ColorScheme
  black: string
  border: ColorScheme
  disabled: string
  divider: string
  error: string
  info: string
  negative: string
  placeholder: string
  positive: string
  primary: string
  secondary: string
  success: string
  text: ColorScheme
  textSecondary: ColorScheme
  transparent: string
  warning: string
  white: string
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
    light: '#F2F2F7', // iOS standard background color for settings in light mode
    dark: '#000000', // '#121212',
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
    light: '#1D1D1D',
    dark: '#9CA3AF',
  },
  success: '#34D399',
  error: '#EF4444',
  negative: '#EF4444',
  positive: '#34D399',
  warning: '#F59E0B',
  info: '#3B82F6',
  disabled: '#D1D5DB',
  placeholder: '#9CA3AF',
  divider: '#E5E7EB',
  black: '#000000',
  white: '#FFFFFF',
  transparent: 'transparent',
}

export default colors
