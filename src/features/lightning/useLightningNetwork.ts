import { useContext } from 'react'
import { LightningContext } from './LightningProvider'

export const useLightningNetwork = () => {
  const context = useContext(LightningContext)
  if (!context) {
    throw new Error('useLightningNetwork must be used within a LightningProvider')
  }
  return context
}
