use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TokenAccount, TokenInterface, TransferChecked};

use crate::error::VestingError;
use crate::events::TokensDeposited;
use crate::state::VestingSchedule;

/// Deposits SPL tokens into the vesting vault.
/// Equivalent to transferring ERC20 tokens to the VestingWallet contract in Solidity.
pub(crate) fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, VestingError::InvalidDepositAmount);
    require!(!ctx.accounts.vesting_schedule.revoked, VestingError::AlreadyRevoked);

    // Transfer tokens from depositor to vault
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.depositor_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    token_interface::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

    // Update state
    let schedule = &mut ctx.accounts.vesting_schedule;
    schedule.total_deposited = schedule
        .total_deposited
        .checked_add(amount)
        .ok_or(VestingError::Overflow)?;

    // Emit event
    emit!(TokensDeposited {
        depositor: ctx.accounts.depositor.key(),
        amount,
        total_deposited: schedule.total_deposited,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    /// The depositor (usually the authority)
    #[account(mut)]
    pub depositor: Signer<'info>,

    /// The vesting schedule to deposit into
    #[account(
        mut,
        seeds = [VestingSchedule::VESTING_SEED.as_bytes(), vesting_schedule.authority.as_ref(), vesting_schedule.beneficiary.as_ref(), vesting_schedule.mint.as_ref(), &vesting_schedule.schedule_id.to_le_bytes()],
        bump = vesting_schedule.bump
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,

    /// Mint of the token being deposited
    #[account(
        constraint = mint.key() == vesting_schedule.mint
    )]
    pub mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,

    /// Depositor's token account (source)
    #[account(
        mut,
        constraint = depositor_token_account.mint == vesting_schedule.mint
    )]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Vault that holds the vesting tokens (destination)
    #[account(
        mut,
        seeds = [b"vault", vesting_schedule.key().as_ref()],
        bump = vesting_schedule.vault_bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}
