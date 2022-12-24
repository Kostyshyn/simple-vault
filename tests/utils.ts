import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { Buffer } from 'buffer';
import Decimal from 'decimal.js';

export const findPDAForProgram = (programId: PublicKey) => (seeds: Array<Buffer | Uint8Array>): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    seeds,
    programId
  );
};

export const findAssociatedTokenAddress = async (
  owner: PublicKey,
  mint: PublicKey
): Promise<PublicKey> => {
  return PublicKey.findProgramAddressSync(
    [
      owner.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer()
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
};

export const adjustAmount = (amount: number, decimals: number): number => {
  return new Decimal(amount).mul(new Decimal(10).pow(decimals)).toNumber();
};

export const createAndMintToken = async (
  connection: Connection,
  payer: Keypair,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey = null,
  decimals: number,
  destination: PublicKey,
  amount: number
): Promise<[PublicKey, PublicKey]> => {
  // Create new token mint

  const mintAddress = await createMint(
    connection,
    payer,
    mintAuthority,
    freezeAuthority,
    decimals
  );

  // Get the token account of the mintTo address, and if it does not exist, create it
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintAddress,
    destination
  );

  // Mint new token to the tokenAccount we just created
  await mintTo(
    connection,
    payer,
    mintAddress,
    tokenAccount.address,
    mintAuthority,
    amount
  );

  return [mintAddress, tokenAccount.address];
};

