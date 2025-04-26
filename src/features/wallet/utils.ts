const formatBalance = (balance: number, unit: string) => {
  if (unit === 'sats') {
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
