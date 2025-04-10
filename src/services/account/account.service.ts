import api from '@/shared/api'
import { CoinType, Purpose } from '@/models/account'
import { deriveAccount } from '@/services/key'

function discover(
  extendedKey: Uint8Array,
  purpose: Purpose,
  coinType: CoinType,
  accountIndex = 0,
  gapLimit: number = 20,
  multiAccount = false,
) {
  const addresses = []
}
