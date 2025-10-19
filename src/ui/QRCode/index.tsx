import React, { useState, useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import qrcode from 'qrcode-generator'

interface QRCodeProps {
  value: string
  size: number
  color: string
  backgroundColor: string
}

export default function QRCode({ value, size, color, backgroundColor }: QRCodeProps) {
  const [qrElements, setQrElements] = useState<React.ReactElement[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Generate QR code asynchronously to avoid blocking UI
    const generateQR = () => {
      setIsLoading(true)
      // Use setTimeout to defer generation to next tick
      setTimeout(() => {
        const qr = qrcode(0, 'L') // Type 0, error correction L
        qr.addData(value)
        qr.make()

        const moduleCount = qr.getModuleCount()
        const moduleSize = size / moduleCount

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
      }, 0)
    }

    generateQR()
  }, [value, size, color]) // Regenerate when props change

  if (isLoading) {
    return (
      <View
        style={{
          width: size,
          height: size,
          backgroundColor,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="small" color={color} />
      </View>
    )
  }

  return (
    <View style={{ width: size, height: size, backgroundColor }}>
      <Svg width={size} height={size}>
        {qrElements}
      </Svg>
    </View>
  )
}
