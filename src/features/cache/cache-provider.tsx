import { SWRConfig } from 'swr'

export default function CacheProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        refreshInterval: 1000 * 60 * 5, // 5 minutes
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      }}
    >
      {children}
    </SWRConfig>
  )
}
