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
import { adjustAmount, createAndMintToken, findPDAForProgram, getVaultsByOwner } from './utils';
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

describe('Simple Vault', async () => {
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

  // SPL token
  let mint: PublicKey;
  let treasury: PublicKey;

  // Primary owner vault
  let vaultAddress: PublicKey;
  let vaultTokenAccount: PublicKey;
  let vaultBump: number;

  const DEPOSIT_AMOUNT = 100;
  const WITHDRAW_AMOUNT = 25;

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

    const [_vaultAddress, _vaultBump] = findPDA([
      Buffer.from(VAULT_KEY),
      primaryOwner.publicKey.toBuffer(),
      mint.toBuffer()
    ]);

    vaultAddress = _vaultAddress;
    vaultBump = _vaultBump;

    vaultTokenAccount = await getAssociatedTokenAddress(
      mint,
      vaultAddress,
      true
    );

    // const vaultAccountMaxRent = await anchorProvider.connection.getMinimumBalanceForRentExemption(VAULT_SIZE);
  });

  it('Initialize vault instruction', async () => {
    await program.methods
      .initializeVault()
      .accounts({
        vault: vaultAddress,
        vaultTokenAccount,
        owner: primaryOwner.publicKey,
        mint,
        authority: authority.publicKey
      })
      .preInstructions([])
      .signers([authority])
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultAddress);

    const tokenAccountSplInfo = await getAccount(anchorProvider.connection, vaultTokenAccount);

    // Simulate network latency
    await new Promise(r => setTimeout(r, 100));

    expect(vaultAccount.tokenAccount.toBase58(), 'tokenAccount').to.equal(vaultTokenAccount.toBase58());
    expect(vaultAccount.owner.toBase58(), 'vault owner').to.equal(primaryOwner.publicKey.toBase58());
    expect(vaultAccount.mint.toBase58(), 'vault mint').to.equal(mint.toBase58());
    expect(vaultAccount.amount.toNumber(), 'vault amount').to.equal(0);
    expect(vaultAccount.locked, 'locked').to.equal(false);
    expect(vaultAccount.lastDeposit.toNumber(), 'lastDeposit').to.equal(0);
    expect(vaultAccount.lastWithdrawal.toNumber(), 'lastWithdrawal').to.equal(0);
    expect(vaultAccount.createdAt.toNumber(), 'createdAt').to.be.below(Math.floor(Date.now() / 1000));

    expect(tokenAccountSplInfo.address.toBase58(), 'vault token address').to.equal(vaultTokenAccount.toBase58());
    expect(tokenAccountSplInfo.mint.toBase58(), 'vault token mint').to.equal(mint.toBase58());
    expect(tokenAccountSplInfo.owner.toBase58(), 'vault token owner').to.equal(vaultAddress.toBase58());
    expect(tokenAccountSplInfo.amount.toString(), 'vault token amount').to.equal(String(0));
  });

  it('Deposit instruction', async () => {
    const amount = new anchor.BN(adjustAmount(DEPOSIT_AMOUNT, DECIMALS));

    const vaultAccountBefore = await program.account.vault.fetch(vaultAddress);
    const treasuryBalanceBefore = await anchorProvider.connection.getTokenAccountBalance(treasury);
    const vaultTokenBalanceBefore = await anchorProvider.connection.getTokenAccountBalance(vaultTokenAccount);

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
        mint,
        authority: authority.publicKey
      })
      .preInstructions([])
      .signers([authority])
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultAddress);

    console.log('vaultAccount - AFTER DEPOSIT', vaultAccount);

    const treasuryBalance = await anchorProvider.connection.getTokenAccountBalance(treasury);

    console.log('treasuryBalance - AFTER DEPOSIT', treasuryBalance);

    const vaultTokenBalance = await anchorProvider.connection.getTokenAccountBalance(vaultTokenAccount);

    console.log('vaultTokenBalance - AFTER DEPOSIT', vaultTokenBalance);
  });

  it.skip('Withdraw instruction', async () => {
    const ownerTokenAccount = await getAssociatedTokenAddress(
      mint,
      primaryOwner.publicKey
    );

    const amount = new anchor.BN(adjustAmount(WITHDRAW_AMOUNT, DECIMALS));

    // Try to lock vault

    // await program.methods
    //   .lock()
    //   .accounts({
    //     vault: vaultAddress,
    //     owner: primaryOwner.publicKey,
    //     mint,
    //     authority: authority.publicKey
    //   })
    //   .preInstructions([])
    //   .signers([authority])
    //   .rpc();

    // Try to unlock vault

    // await program.methods
    //   .unlock()
    //   .accounts({
    //     vault: vaultAddress,
    //     owner: primaryOwner.publicKey,
    //     mint,
    //     authority: authority.publicKey
    //   })
    //   .preInstructions([])
    //   .signers([authority])
    //   .rpc();

    await program.methods
      .withdraw(amount, vaultBump)
      .accounts({
        vault: vaultAddress,
        vaultTokenAccount,
        ownerTokenAccount,
        owner: primaryOwner.publicKey,
        mint
      })
      .preInstructions([])
      .signers([primaryOwner])
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultAddress);

    console.log('vaultAccount - AFTER WITHDRAWAL', vaultAccount);

    const ownerBalance = await anchorProvider.connection.getTokenAccountBalance(
      ownerTokenAccount
    );

    console.log('ownerBalance - AFTER WITHDRAWAL', ownerBalance);

    const vaultTokenBalance = await anchorProvider.connection.getTokenAccountBalance(
      vaultTokenAccount
    );

    console.log('vaultTokenBalance - AFTER WITHDRAWAL', vaultTokenBalance);

    await getVaultsByOwner(program, primaryOwner.publicKey);
  });
});
