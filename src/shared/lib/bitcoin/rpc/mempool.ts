import mempoolJS from '@mempool/mempool.js'

export async function getAddressTxChain(address: string) {
  try {
    const {
      bitcoin: { addresses },
    } = mempoolJS({
      hostname: 'mempool.space',
    })

    const txChain = await addresses.getAddressTxsChain({ address })
    return txChain
  } catch (error) {
    console.error((error as Error).message)
    return []
  }
}
