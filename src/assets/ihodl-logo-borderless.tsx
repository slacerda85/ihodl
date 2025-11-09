import Svg, { Rect } from 'react-native-svg'

export default function IHodlLogoBorderLess({
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
      <Rect x="5" y="20" width="30" height="75" fill="#F7931A" />
      {/* Right vertical bar */}
      <Rect x="65" y="5" width="30" height="90" fill="#F7931A" />
      {/* Middle horizontal bar */}
      <Rect x="35" y="45" width="30" height="25" fill="#F7931A" />
    </Svg>
  )
}
