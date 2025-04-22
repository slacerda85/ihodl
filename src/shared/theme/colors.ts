type Colors = {
  background: ColorScheme
  black: string
  border: ColorScheme
  disabled: string
  divider: string
  error: string
  info: string
  modal: ColorScheme
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

export function rbgToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export function rgbaToHex(rgbaString: string): string {
  const rgba = rgbaString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?\)/)
  if (!rgba) return ''
  const r = parseInt(rgba[1])
  const g = parseInt(rgba[2])
  const b = parseInt(rgba[3])
  return rbgToHex(r, g, b)
}

export function hexToRgb(hex: string): [number, number, number] {
  const bigint = parseInt(hex.slice(1), 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return [r, g, b]
}

// color scheme based on Bitcoin.org colors
const colors: Colors = {
  primary: '#F7931A',
  secondary: '#142850',
  background: {
    light: '#F2F2F7', // iOS standard background color for light mode
    dark: '#111113', // iOS standard background color for dark mode
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
  modal: {
    light: '#FFFFFF', // iOS standard modal background color for light mode
    dark: '#151517', // '#1C1C1E', // iOS standard modal background color for dark mode
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
