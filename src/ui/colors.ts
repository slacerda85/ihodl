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
    light: '#F2F2F7', // iOS 26 secondarySystemBackground
    dark: '#000000', // iOS 26 systemGroupedBackground dark
  },
  text: {
    light: '#000000', // iOS 26 label
    dark: '#FFFFFF', // iOS 26 label
  },
  textSecondary: {
    light: '#3C3C43', // iOS 26 secondaryLabel
    dark: '#EBEBF5', // iOS 26 secondaryLabel
  },
  border: {
    light: '#C6C6C8', // iOS 26 separator
    dark: '#38383A', // iOS 26 separator
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
