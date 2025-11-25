import React, { useState, useEffect, useCallback } from 'react'
import { View, ActivityIndicator } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import qrcode from 'qrcode-generator'

interface QRCodeProps {
  value: string
  size: number | 'auto'
  color: string
  backgroundColor: string
}

export default function QRCode({ value, size, color, backgroundColor }: QRCodeProps) {
  const [qrElements, setQrElements] = useState<React.ReactElement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [containerSize, setContainerSize] = useState(size === 'auto' ? 0 : size)

  const generateQR = useCallback(
    (qrSize: number) => {
      if (qrSize <= 0) return

      setIsLoading(true)
      let qr: any
      try {
        qr = qrcode(0, 'L') // Type 0, error correction L
        qr.addData(value)
        qr.make()
      } catch (error) {
        console.error('Error generating QR code:', error)
        setIsLoading(false)
        return
      }

      const moduleCount = qr.getModuleCount()
      const moduleSize = qrSize / moduleCount

      const elements = []

      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qr.isDark(row, col)) {
            elements.push(
              <Rect
                key={`${row}-${col}`}
                x={col * moduleSize}
                y={row * moduleSize}
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
    [value, color],
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

  const viewStyle =
    size === 'auto' ? { flex: 1, backgroundColor } : { width: size, height: size, backgroundColor }

  if (isLoading) {
    return (
      <View style={viewStyle}>
        <ActivityIndicator size="small" color={color} />
      </View>
    )
  }

  return (
    <View style={viewStyle} onLayout={size === 'auto' ? handleLayout : undefined}>
      <Svg
        width={size === 'auto' ? '100%' : containerSize}
        height={size === 'auto' ? '100%' : containerSize}
        viewBox={size === 'auto' ? `0 0 ${containerSize} ${containerSize}` : undefined}
      >
        {qrElements}
      </Svg>
    </View>
  )
}
