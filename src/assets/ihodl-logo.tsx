import Svg, { Path, G, Rect } from 'react-native-svg'

export default function IHodlLogo({
  width = 128,
  height = 128,
}: {
  width?: number
  height?: number
}) {
  return (
    <Svg viewBox="0 0 100 100" width={width} height={height} role="img" aria-label="Letter H">
      {/* Background layer */}
      {/* <Rect x="0" y="0" width="100" height="100" fill="black" /> */}
      {/* Left vertical bar */}
      <Rect x="20" y="35" width="20" height="45" fill="#F7931A" />
      {/* Right vertical bar */}
      <Rect x="60" y="20" width="20" height="60" fill="#F7931A" />
      {/* Middle horizontal bar */}
      <Rect x="40" y="50" width="20" height="15" fill="#F7931A" />
    </Svg>
  )
}
