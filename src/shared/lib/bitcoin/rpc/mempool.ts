import mempoolJS from '@mempool/mempool.js'

export async function getAddressTxChain(address: string) {
  const {
    bitcoin: { addresses },
  } = mempoolJS({
    hostname: 'mempool.space',
  })

  const txChain = await addresses.getAddressTxsChain({ address })

  return txChain
}
