import { PublicKey } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';

export interface Vault {
  tokenAccount: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  amount: BN;
  locked: boolean;
  lastDeposit: BN;
  lastWithdrawal: BN;
  createdAt: BN;
}
