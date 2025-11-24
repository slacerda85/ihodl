const formatBalance = (balance: number = 0, unit: 'BTC' | 'Sats' = 'BTC') => {
  if (unit === 'Sats') {
    return `${(balance * 1e8).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`
  }
  if (unit === 'BTC') {
    return `${balance.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 8,
    })}`
  }
}

export { formatBalance }
