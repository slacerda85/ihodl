import { Account, AccountDetails } from '../models/account'
import { AddressService } from './address'
import { KeyService } from './key'
import { SeedService } from './seed'

const GAP_LIMIT = 20

interface AccountServiceInterface {
  discover(
    props: Account & {
      walletId: string
    },
  ): Promise<AccountDetails[]>
}

class AccountService implements AccountServiceInterface {
  async discover({
    walletId,
    purpose,
    coinType,
    accountIndex,
  }: Account & { walletId: string }): Promise<AccountDetails[]> {
    // get seed
    const seedService = new SeedService()
    const seed = await seedService.getSeedByWalletId(walletId)
    // derive account
    const keyService = new KeyService()
    const masterKey = await keyService.createMasterKey(seed)
    const { receivingAccountKey, changeAccountKey } = keyService.deriveAccountKeys({
      masterKey,
      purpose,
      coinType,
      accountIndex,
    })

    // derive addresses until GAP_LIMIT is reached (bip44 account discovery loop)
    let startIndex = 0
    const discovered: AccountDetails[] = []
    let hasUsedInBatch = true

    const addressService = new AddressService()

    while (hasUsedInBatch) {
      const batchStart = discovered.length
      for (let i = startIndex; i < startIndex + GAP_LIMIT; i++) {
        // derive receiving address
        const { addressIndexKey: receivingAddressKey } = keyService.deriveAddressIndexKeys(
          receivingAccountKey,
          i,
        )
        const receivingPublicKey = keyService.deriveAddressPublicKey(receivingAddressKey)
        const receivingAddress = await addressService.createAddress(receivingPublicKey)
        // derive change address
        const { addressIndexKey: changeAddressKey } = keyService.deriveAddressIndexKeys(
          changeAccountKey,
          i,
        )
        const changePublicKey = keyService.deriveAddressPublicKey(changeAddressKey)
        const changeAddress = await addressService.createAddress(changePublicKey)

        // first, save both addresses as discovered, save in repository, with empty txs
        discovered.push({
          purpose,
          coinType,
          accountIndex,
          change: 0,
          addressIndex: i,
          address: receivingAddress,
          txs: [],
        })
        discovered.push({
          purpose,
          coinType,
          accountIndex,
          change: 1,
          addressIndex: i,
          address: changeAddress,
          txs: [],
        })
      }
      startIndex += GAP_LIMIT

      // fetch history for the new batch only
      const newBatch = discovered.slice(batchStart)
      const addressHistory = await Promise.all(
        newBatch.map(async accountDetail => {
          const txs = await addressService.getAddressHistory(accountDetail.address)
          return { address: accountDetail.address, txs }
        }),
      )

      // check if any address in the new batch has transactions
      hasUsedInBatch = addressHistory.some(history => history.txs.length > 0)

      // update txs in discovered
      for (const history of addressHistory) {
        const accountDetail = discovered.find(ad => ad.address === history.address)
        if (accountDetail) {
          accountDetail.txs = history.txs
        }
      }
    }
    return discovered
  }
}
