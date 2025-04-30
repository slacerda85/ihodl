/**
 * Converts a hex color string to an rgba color string with the specified alpha value.
 * @param color - A hex color string (e.g., "#fff", "#00FF00")
 * @param opacity - A number between 0 and 1, where 0 is transparent and 1 is opaque
 * @returns An rgba color string
 */
export function alpha(color: string, opacity: number): string {
  if (opacity < 0 || opacity > 1) {
    throw new Error('Opacity must be between 0 and 1')
  }

  // Remove the # if it exists
  const hex = color.replace('#', '')

  // Convert to RGB
  let r, g, b
  if (hex.length === 3) {
    // Convert 3-digit hex to 6-digit
    r = parseInt(hex[0] + hex[0], 16)
    g = parseInt(hex[1] + hex[1], 16)
    b = parseInt(hex[2] + hex[2], 16)
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16)
    g = parseInt(hex.substring(2, 4), 16)
    b = parseInt(hex.substring(4, 6), 16)
  } else {
    throw new Error('Invalid hex color format')
  }

  // Return rgba string
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}
