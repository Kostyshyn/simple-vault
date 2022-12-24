use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer}
};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub const DISCRIMINATOR_LENGTH: usize = 8;
pub const PUBLIC_KEY_LENGTH: usize = 32;
pub const MAX_INT_LENGTH: usize = 8; // i64, u64
pub const MAX_BOOL_LENGTH: usize = 1;
pub const VAULT_KEY: &[u8] = b"vault";
pub const TOKEN_ACCOUNT_KEY: &[u8] = b"token_account";

#[program]
pub mod simple_vault {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let clock: Clock = Clock::get().unwrap();
        let vault: &mut Account<Vault> = &mut ctx.accounts.vault;

        vault.token_account = ctx.accounts.token_account.key();
        vault.owner = ctx.accounts.owner.key();
        vault.mint = ctx.accounts.mint.key();
        vault.amount = 0;
        vault.locked = false;
        vault.created_at = clock.unix_timestamp;

        msg!("Vault {:#?}", vault.clone());
        // msg!("LEN of Vault {}", Vault::SIZE);
        // msg!("Size of Vault {}", std::mem::size_of::<Vault>());

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = Transfer {
            from: ctx.accounts.treasury.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info()
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        let clock: Clock = Clock::get().unwrap();
        let vault: &mut Account<Vault> = &mut ctx.accounts.vault;
        let token_account: &mut Account<TokenAccount> = &mut ctx.accounts.token_account;
        let current_amount = token_account.amount;

        // msg!("Token account {:#?}", ctx.accounts.token_account.clone());
        msg!("Current amount {}", current_amount);
        msg!("Deposit amount {}", amount);

        // vault.locked = true;
        vault.amount = current_amount + amount;
        vault.last_deposit = clock.unix_timestamp;

        msg!("Vault {:#?}", vault.clone());

        Ok(())
    }

    pub fn withdraw(_ctx: Context<Withdraw>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        seeds = [
            VAULT_KEY.as_ref(),
            owner.key().as_ref(),
            mint.key().as_ref()
        ],
        bump,
        payer = authority,
        space = Vault::SIZE
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init,
        associated_token::mint = mint,
        associated_token::authority = vault,
        payer = authority
    )]
    pub token_account: Account<'info, TokenAccount>,

    /// CHECK:
    pub owner: AccountInfo<'info>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub rent: Sysvar<'info, Rent>
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [
            VAULT_KEY.as_ref(),
            owner.key().as_ref(),
            mint.key().as_ref()
        ],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut, token::authority = authority)]
    pub treasury: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault
    )]
    pub token_account: Account<'info, TokenAccount>,

    /// CHECK:
    pub owner: AccountInfo<'info>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, Token>
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Withdraw<'info> {
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(Debug)]
pub struct Vault {
    pub token_account: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub locked: bool,
    pub last_deposit: i64,
    pub last_withdrawal: i64,
    pub created_at: i64
}

impl Vault {
    // 137
    pub const SIZE: usize = DISCRIMINATOR_LENGTH
        + PUBLIC_KEY_LENGTH // Token account
        + PUBLIC_KEY_LENGTH // Owner
        + PUBLIC_KEY_LENGTH // Mint
        + MAX_INT_LENGTH    // Amount
        + MAX_BOOL_LENGTH   // Locked
        + MAX_INT_LENGTH    // Last deposit
        + MAX_INT_LENGTH    // Last withdrawal
        + MAX_INT_LENGTH;   // Created At
}
