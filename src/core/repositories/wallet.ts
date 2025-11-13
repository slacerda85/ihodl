import { Wallet } from '../models/wallet'

interface WalletRepositoryInterface {
  save(wallet: Wallet): Promise<void>
  findById(id: string): Promise<Wallet | null>
  delete(id: string): Promise<void>
}
