import Svg, { Circle, Path, RadialGradient, Stop } from 'react-native-svg'

interface LightningLogoProps {
  width: number
  height: number
}

export default function LightningLogo({ width = 128, height = 128 }: LightningLogoProps) {
  const cx = 2045.635 // Centro x do viewBox (4091.27 / 2)
  const cy = 2045.865 // Centro y do viewBox (4091.73 / 2)

  return (
    <Svg
      width={width}
      height={height}
      shape-rendering="geometricPrecision"
      text-rendering="geometricPrecision"
      image-rendering="optimizeQuality"
      fill-rule="evenodd"
      clip-rule="evenodd"
      viewBox="0 0 4091.27 4091.73"
    >
      {/* Gradiente radial para o fundo circular */}
      <RadialGradient id="grad" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <Stop offset="0%" stopColor="#2A0E5A" />
        <Stop offset="100%" stopColor="#5C2D91" />
      </RadialGradient>
      {/* Círculo de fundo */}
      <Circle cx={cx} cy={cy} r={2045.635} fill="url(#grad)" />
      {/* Símbolo do raio */}
      <Path
        fill="#FFFFFF"
        d="M1845.635 1245.865 L2345.635 1845.865 L2145.635 1845.865 L2545.635 2045.865 L2145.635 2245.865 L2345.635 2245.865 L1845.635 2845.865 L1645.635 2245.865 L1845.635 2245.865 L1445.635 2045.865 L1845.635 1845.865 L1645.635 1845.865 Z"
      />
    </Svg>
  )
}
