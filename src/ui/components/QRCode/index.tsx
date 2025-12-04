import React, { useState, useEffect, useCallback } from 'react'
import { View, ActivityIndicator, StyleProp, ViewStyle } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import qrcode from 'qrcode-generator'
import IHodlLogo from '@/ui/assets/ihodl-logo'

interface QRCodeProps {
  value: string
  size: number | 'auto'
  color: string
  backgroundColor: string
  showLogo?: boolean
}

export default function QRCode({
  value,
  size,
  color,
  backgroundColor,
  showLogo = true,
}: QRCodeProps) {
  const [qrElements, setQrElements] = useState<React.ReactElement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [containerSize, setContainerSize] = useState(size === 'auto' ? 0 : size)

  const generateQR = useCallback(
    (qrSize: number) => {
      if (qrSize <= 0) return

      setIsLoading(true)
      let qr: any
      try {
        // Use error correction 'H' (high) when showing logo to ensure QR remains scannable
        // 'H' allows up to 30% of the QR code to be damaged/covered
        qr = qrcode(0, showLogo ? 'H' : 'L')
        qr.addData(value)
        qr.make()
      } catch (error) {
        console.error('Error generating QR code:', error)
        setIsLoading(false)
        return
      }

      const moduleCount = qr.getModuleCount()
      const moduleSize = qrSize / moduleCount

      // Calculate center area to exclude when showing logo (approximately 25% of QR size)
      const logoSizeRatio = 0.25
      const logoSize = qrSize * logoSizeRatio
      const logoStart = (qrSize - logoSize) / 2
      const logoEnd = logoStart + logoSize

      const elements = []

      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qr.isDark(row, col)) {
            const x = col * moduleSize
            const y = row * moduleSize

            // Skip modules in the center area where logo will be placed
            if (showLogo) {
              const moduleEndX = x + moduleSize
              const moduleEndY = y + moduleSize
              const isInLogoArea =
                x >= logoStart && moduleEndX <= logoEnd && y >= logoStart && moduleEndY <= logoEnd
              if (isInLogoArea) {
                continue
              }
            }

            elements.push(
              <Rect
                key={`${row}-${col}`}
                x={x}
                y={y}
                width={moduleSize}
                height={moduleSize}
                fill={color}
              />,
            )
          }
        }
      }

      setQrElements(elements)
      setIsLoading(false)
    },
    [value, color, showLogo],
  )

  useEffect(() => {
    const qrSize = size === 'auto' ? containerSize : size
    if (qrSize > 0) {
      setTimeout(() => generateQR(qrSize), 100)
    }
  }, [generateQR, size, containerSize])

  const handleLayout = (event: any) => {
    if (size === 'auto') {
      const { width, height } = event.nativeEvent.layout
      const minSize = Math.min(width, height)
      if (minSize !== containerSize) {
        setContainerSize(minSize)
      }
    }
  }

  const viewStyle: StyleProp<ViewStyle> =
    size === 'auto'
      ? {
          height: '100%',
          width: '100%',
          backgroundColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }
      : {
          width: size,
          height: size,
          backgroundColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }

  if (isLoading) {
    return (
      <View style={viewStyle}>
        <ActivityIndicator size="small" color={color} />
      </View>
    )
  }

  const actualSize = size === 'auto' ? containerSize : size
  const logoDisplaySize = actualSize * 0.22

  return (
    <View style={viewStyle} onLayout={size === 'auto' ? handleLayout : undefined}>
      <Svg
        width={size === 'auto' ? '100%' : containerSize}
        height={size === 'auto' ? '100%' : containerSize}
        viewBox={size === 'auto' ? `0 0 ${containerSize} ${containerSize}` : undefined}
      >
        {qrElements}
      </Svg>
      {showLogo && (
        <View
          style={{
            position: 'absolute',
            width: logoDisplaySize,
            height: logoDisplaySize,
            backgroundColor,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            borderWidth: 2,
            borderColor: color,
          }}
        >
          <IHodlLogo width={logoDisplaySize * 0.75} height={logoDisplaySize * 0.75} />
        </View>
      )}
    </View>
  )
}
