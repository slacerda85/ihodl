function truncateAddress(address: string, length: number = 6): string {
  if (address.length <= length * 2) return address
  return `${address.slice(0, length)}...${address.slice(-length)}`
}

export {
  truncateAddress,
  // Add any other utility functions you need here
}
