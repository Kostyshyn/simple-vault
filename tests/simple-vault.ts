import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { SimpleVault } from '../target/types/simple_vault';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import { before } from 'mocha';
import { expect } from 'chai';
import { VAULT_SIZE, VAULT_KEY, DECIMALS, INITIAL_SUPPLY } from './constants';
import { adjustAmount, createAndMintToken, findPDAForProgram } from './utils';
import {
  getAssociatedTokenAddress,
  getAccount,
  createTransferCheckedInstruction,
  transferChecked
} from '@solana/spl-token';

const getAirdrop = async (
  connection: Connection,
  recipient: PublicKey,
  amount = 1
): Promise<void> => {
  const signature = await connection.requestAirdrop(
    recipient,
    LAMPORTS_PER_SOL * amount
  );
  await connection.confirmTransaction(signature, 'confirmed');
};

describe('Simple Vault', () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.SimpleVault as Program<SimpleVault>;
  const anchorProvider = program.provider as anchor.AnchorProvider;
  const systemProgram = anchor.web3.SystemProgram.programId;
  const wallet = anchorProvider.wallet;

  // Wallets
  const authority = Keypair.generate();
  const primaryOwner = Keypair.generate();
  const secondaryOwner = Keypair.generate();

  const findPDA = findPDAForProgram(program.programId);

  let mint: PublicKey;
  let treasury: PublicKey;

  before(async () => {
    await Promise.all([
      getAirdrop(anchorProvider.connection, authority.publicKey, 10),
      getAirdrop(anchorProvider.connection, primaryOwner.publicKey),
      getAirdrop(anchorProvider.connection, secondaryOwner.publicKey)
    ]);

    const [_mint, _treasury] = await createAndMintToken(
      anchorProvider.connection,
      authority,
      authority.publicKey,
      authority.publicKey,
      DECIMALS,
      authority.publicKey,
      adjustAmount(INITIAL_SUPPLY, DECIMALS)
    );

    mint = _mint;
    treasury = _treasury;

    // const vaultAccountMaxRent = await anchorProvider.connection.getMinimumBalanceForRentExemption(VAULT_SIZE);
  });

  it('Initialize vault', async () => {
    const [vaultAddress, _vaultBump] = findPDA([
      Buffer.from(VAULT_KEY),
      primaryOwner.publicKey.toBuffer(),
      mint.toBuffer()
    ]);

    const vaultTokenAccount = await getAssociatedTokenAddress(
      mint,
      vaultAddress,
      true
    );

    // console.log('tokenAccount', tokenAccount)

    await program.methods
      .initializeVault()
      .accounts({
        vault: vaultAddress,
        vaultTokenAccount,
        owner: primaryOwner.publicKey,
        mint: mint,
        authority: authority.publicKey
      })
      .preInstructions([])
      .signers([authority])
      .rpc();

    const authorityBalance = await anchorProvider.connection.getAccountInfo(
      authority.publicKey
    );

    const vaultAccount = await program.account.vault.fetch(vaultAddress);

    console.log('vaultAddress', vaultAddress);
    console.log('vaultAccount', vaultAccount);

    // const treasuryBalance = await anchorProvider.connection.getTokenAccountBalance(
    //   treasury
    // );
    //
    // console.log('treasuryBalance', treasuryBalance);

    // const vaultTokenBalance = await anchorProvider.connection.getTokenAccountBalance(
    //   vaultTokenAccount
    // );
    //
    // console.log('vaultTokenBalance', vaultTokenBalance);

    // const tokenAccountInfo = await anchorProvider.connection.getAccountInfo(
    //   vaultTokenAccount
    // );
    //
    // console.log('tokenAccountInfo', tokenAccountInfo);

    const tokenAccountSplInfo = await getAccount(
      anchorProvider.connection,
      vaultTokenAccount
    );

    console.log('tokenAccountSplInfo', tokenAccountSplInfo);

    expect(
      vaultAccount.owner.toBase58()
    ).to.equal(
      primaryOwner.publicKey.toBase58()
    );
  });

  it('Deposit', async () => {
    const [vaultAddress, _vaultBump] = findPDA([
      Buffer.from(VAULT_KEY),
      primaryOwner.publicKey.toBuffer(),
      mint.toBuffer()
    ]);

    const vaultTokenAccount = await getAssociatedTokenAddress(
      mint,
      vaultAddress,
      true
    );

    const DEPOSIT_AMOUNT = 100;
    const amount = new anchor.BN(adjustAmount(DEPOSIT_AMOUNT, DECIMALS));

    // let tx = new Transaction();
    // tx.add(
    //   createTransferCheckedInstruction(
    //     treasury, // from
    //     mint, // mint
    //     vaultTokenAccount, // to
    //     authority.publicKey, // authority
    //     adjustAmount(DEPOSIT_AMOUNT, DECIMALS), // amount
    //     DECIMALS // decimals
    //   )
    // );
    //
    // await sendAndConfirmTransaction(anchorProvider.connection, tx, [authority]);

    await program.methods
      .deposit(amount)
      .accounts({
        vault: vaultAddress,
        treasury,
        vaultTokenAccount,
        owner: primaryOwner.publicKey,
        mint: mint,
        authority: authority.publicKey
      })
      .preInstructions([])
      .signers([authority])
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultAddress);

    console.log('vaultAccount - AFTER DEPOSIT', vaultAccount);

    const treasuryBalance = await anchorProvider.connection.getTokenAccountBalance(
      treasury
    );

    console.log('treasuryBalance - AFTER DEPOSIT', treasuryBalance);

    const vaultTokenBalance = await anchorProvider.connection.getTokenAccountBalance(
      vaultTokenAccount
    );

    console.log('vaultTokenBalance - AFTER DEPOSIT', vaultTokenBalance);
  });

  it('Withdraw', async () => {
    const [vaultAddress, _vaultBump] = findPDA([
      Buffer.from(VAULT_KEY),
      primaryOwner.publicKey.toBuffer(),
      mint.toBuffer()
    ]);

    const vaultTokenAccount = await getAssociatedTokenAddress(
      mint,
      vaultAddress,
      true
    );
  });
});
