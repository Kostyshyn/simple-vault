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

        vault.token_account = ctx.accounts.vault_token_account.key();
        vault.owner = ctx.accounts.owner.key();
        vault.mint = ctx.accounts.mint.key();
        vault.amount = 0;
        vault.locked = false;
        vault.created_at = clock.unix_timestamp;

        msg!("Initialize vault {:#?}", vault.clone());

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        if amount <= 0 {
            return Err(ErrorCode::InvalidAmount.into());
        }

        // let cpi_program = ctx.accounts.token_program.to_account_info();
        // let cpi_accounts = Transfer {
        //     from: ctx.accounts.treasury.to_account_info(),
        //     to: ctx.accounts.vault_token_account.to_account_info(),
        //     authority: ctx.accounts.authority.to_account_info()
        // };
        // let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        // token::transfer(cpi_ctx, amount)?;

        token::transfer(ctx.accounts.deposit_ctx(), amount)?;

        let clock: Clock = Clock::get().unwrap();
        let vault: &mut Account<Vault> = &mut ctx.accounts.vault;
        let token_account: &mut Account<TokenAccount> = &mut ctx.accounts.vault_token_account;
        let current_amount = token_account.amount;

        msg!("Deposit to vault {}", vault.key());
        msg!("Current amount {}", current_amount);
        msg!("Deposit amount {}", amount);

        vault.amount = current_amount + amount;
        vault.last_deposit = clock.unix_timestamp;

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64, vault_bump: u8) -> Result<()> {
        if ctx.accounts.vault.locked {
            return Err(ErrorCode::LockedVault.into());
        }

        if amount <= 0 {
            return Err(ErrorCode::InvalidAmount.into());
        }

        let token_account: &Account<TokenAccount> = &ctx.accounts.vault_token_account;
        let current_amount = token_account.amount;

        if amount > current_amount {
            return Err(ErrorCode::InsufficientFunds.into());
        }

        let owner = ctx.accounts.owner.key();
        let mint = ctx.accounts.mint.key();

        // https://solana.stackexchange.com/questions/4685/withdraw-nft-from-pda-tokenaccount-anchor-lang/4687#4687

        let seeds = &[
            VAULT_KEY.as_ref(),
            owner.as_ref(),
            mint.as_ref(),
            &[vault_bump]
        ];
        let signer = &[&seeds[..]];

        // let cpi_program = ctx.accounts.token_program.to_account_info();
        // let cpi_accounts = Transfer {
        //     from: ctx.accounts.vault_token_account.to_account_info(),
        //     to: ctx.accounts.owner_token_account.to_account_info(),
        //     authority: ctx.accounts.vault.to_account_info()
        // };
        // let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts).with_signer(signer);
        // token::transfer(cpi_ctx, amount)?;

        token::transfer(ctx.accounts.withdraw_ctx().with_signer(signer), amount)?;

        let vault: &mut Account<Vault> = &mut ctx.accounts.vault;
        let clock: Clock = Clock::get().unwrap();

        msg!("Withdraw from vault {}", vault.key());
        msg!("Current amount {}", current_amount);
        msg!("Withdraw amount {}", amount);

        vault.amount = current_amount - amount;
        vault.last_withdrawal = clock.unix_timestamp;

        Ok(())
    }

    pub fn lock(ctx: Context<Lock>) -> Result<()> {
        let vault: &mut Account<Vault> = &mut ctx.accounts.vault;

        if vault.locked {
            return Err(ErrorCode::LockedVault.into());
        }

        vault.locked = true;

        msg!("Lock vault {}", vault.key());

        Ok(())
    }

    pub fn unlock(ctx: Context<Unlock>) -> Result<()> {
        let vault: &mut Account<Vault> = &mut ctx.accounts.vault;

        if !vault.locked {
            return Err(ErrorCode::UnlockedVault.into());
        }

        vault.locked = false;

        msg!("Unlock vault {}", vault.key());

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
    pub vault_token_account: Account<'info, TokenAccount>,

    /// CHECK: none
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
        has_one = owner,
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
    pub vault_token_account: Account<'info, TokenAccount>,

    /// CHECK: none
    pub owner: AccountInfo<'info>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, Token>
}

impl<'info> Deposit<'info> {
    fn deposit_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.treasury.to_account_info(),
                to: self.vault_token_account.to_account_info(),
                authority: self.authority.to_account_info()
            }
        )
    }
}

#[derive(Accounts)]
#[instruction(amount: u64, vault_bump: u8)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        has_one = owner,
        seeds = [
            VAULT_KEY.as_ref(),
            owner.key().as_ref(),
            mint.key().as_ref()
        ],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        has_one = owner,
        associated_token::mint = mint,
        associated_token::authority = owner,
        payer = owner
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub rent: Sysvar<'info, Rent>
}

impl<'info> Withdraw<'info> {
    fn withdraw_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.vault_token_account.to_account_info(),
                to: self.owner_token_account.to_account_info(),
                authority: self.vault.to_account_info()
            }
        )
    }
}

#[derive(Accounts)]
pub struct Lock<'info> {
    #[account(
        mut,
        has_one = owner,
        seeds = [
            VAULT_KEY.as_ref(),
            owner.key().as_ref(),
            mint.key().as_ref()
        ],
        bump
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: none
    pub owner: AccountInfo<'info>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>
}

#[derive(Accounts)]
pub struct Unlock<'info> {
    #[account(
        mut,
        has_one = owner,
        seeds = [
            VAULT_KEY.as_ref(),
            owner.key().as_ref(),
            mint.key().as_ref()
        ],
        bump
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: none
    pub owner: AccountInfo<'info>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>
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

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Vault is locked")]
    LockedVault,
    #[msg("Vault is not locked")]
    UnlockedVault
}
