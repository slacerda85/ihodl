import { Account, AccountDetails, Purpose } from '../models/account'
import { AddressService } from './address'
import { KeyService } from './key'
import { SeedService } from './seed'

const GAP_LIMIT = 20

interface AccountServiceInterface {
  discover(props: Account & { walletId: string }): Promise<AccountDetails[]>
}

export class AccountService implements AccountServiceInterface {
  private async discoverAddressesForAccount(
    walletId: string,
    purpose: Purpose,
    coinType: number,
    accountIndex: number,
  ): Promise<AccountDetails[]> {
    const seedService = new SeedService()
    const seed = await seedService.getSeedByWalletId(walletId)
    const keyService = new KeyService()
    const masterKey = await keyService.createMasterKey(seed)
    const { receivingAccountKey, changeAccountKey } = keyService.deriveAccountKeys({
      masterKey,
      purpose,
      coinType,
      accountIndex,
    })

    // Discover receiving addresses
    const receivingAddresses = await this.discoverChainAddresses(
      receivingAccountKey,
      purpose,
      coinType,
      accountIndex,
      0, // change = 0 for receiving
    )

    // Discover change addresses
    const changeAddresses = await this.discoverChainAddresses(
      changeAccountKey,
      purpose,
      coinType,
      accountIndex,
      1, // change = 1 for change
    )

    return [...receivingAddresses, ...changeAddresses]
  }

  private async discoverChainAddresses(
    accountKey: any,
    purpose: number,
    coinType: number,
    accountIndex: number,
    change: number,
  ): Promise<AccountDetails[]> {
    const addressService = new AddressService()
    const keyService = new KeyService()
    const discovered: AccountDetails[] = []
    let startIndex = 0
    let hasUsedInBatch = true

    while (hasUsedInBatch) {
      const batch: AccountDetails[] = []
      for (let i = startIndex; i < startIndex + GAP_LIMIT; i++) {
        const { addressKey } = keyService.deriveAddressKeys(accountKey, i)
        const publicKey = keyService.deriveAddressPublicKey(addressKey)
        const address = await addressService.createAddress(publicKey)
        const accountDetail: AccountDetails = {
          purpose,
          coinType,
          accountIndex,
          change,
          addressIndex: i,
          address,
          txs: [],
        }
        batch.push(accountDetail)
        discovered.push(accountDetail)
      }

      // Fetch histories for batch
      const histories = await Promise.all(
        batch.map(async detail => {
          const txs = await addressService.getAddressHistory(detail.address)
          return { address: detail.address, txs }
        }),
      )

      // Update txs in batch (which are already in discovered)
      for (let i = 0; i < batch.length; i++) {
        batch[i].txs = histories[i].txs
      }

      // Check if batch has used addresses
      hasUsedInBatch = histories.some(h => h.txs.length > 0)
      startIndex += GAP_LIMIT
    }

    return discovered
  }

  async discover({
    walletId,
    purpose,
    coinType,
    accountIndex,
  }: Account & { walletId: string }): Promise<AccountDetails[]> {
    return this.discoverAddressesForAccount(walletId, purpose, coinType, accountIndex)
  }
}
