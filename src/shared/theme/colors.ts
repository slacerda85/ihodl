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
    light: '#F2F2F7', // iOS standard background color for light mode
    dark: '#000000', // iOS standard background color for dark mode
  },
  text: {
    light: '#000000', // iOS standard text color for light mode
    dark: '#FFFFFF', // iOS standard text color for dark mode
  },
  textSecondary: {
    light: '#6C6C70', // iOS standard secondary text color for light mode
    dark: '#8E8E93', // iOS standard secondary text color for dark mode
  },
  border: {
    light: '#E5E5EA', // iOS standard separator color for light mode
    dark: '#38383A', // iOS standard separator color for dark mode
  },
  success: '#34C759', // iOS system green
  error: '#FF3B30', // iOS system red
  negative: '#FF3B30', // iOS system red
  positive: '#34C759', // iOS system green
  warning: '#FF9500', // iOS system orange
  info: '#007AFF', // iOS system blue
  disabled: '#C7C7CC', // iOS light gray
  placeholder: '#8E8E93', // iOS gray
  divider: '#E5E5EA', // iOS separator light
  black: '#000000',
  white: '#FFFFFF',
  transparent: 'transparent',
}

export default colors
