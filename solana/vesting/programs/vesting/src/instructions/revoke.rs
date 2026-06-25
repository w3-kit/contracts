use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TokenAccount, TokenInterface, TransferChecked};

use crate::error::VestingError;
use crate::events::VestingRevoked;
use crate::instructions::release::compute_vested_amount;
use crate::state::VestingSchedule;

/// Revokes the vesting schedule.
/// Sends already-vested tokens to beneficiary, returns unvested tokens to authority.
/// This feature does not exist in OpenZeppelin's VestingWallet but is common in practice.
pub(crate) fn handler(ctx: Context<Revoke>) -> Result<()> {
    let schedule = &ctx.accounts.vesting_schedule;

    // Validate
    require!(schedule.revocable, VestingError::NotRevocable);
    require!(!schedule.revoked, VestingError::AlreadyRevoked);

    let clock = Clock::get()?;
    let now = clock.unix_timestamp as u64;

    // Calculate vested and unvested portions
    let vested = compute_vested_amount(schedule, now)?;
    let vested_unreleased = vested.saturating_sub(schedule.released_amount);
    let unvested = schedule.total_deposited.saturating_sub(vested);

    // PDA signer seeds — vesting_schedule is the vault's token authority
    let auth_key = ctx.accounts.vesting_schedule.authority;
    let benef_key = ctx.accounts.vesting_schedule.beneficiary;
    let mint_key = ctx.accounts.vesting_schedule.mint;
    let schedule_id_bytes = ctx.accounts.vesting_schedule.schedule_id.to_le_bytes();
    let bump = ctx.accounts.vesting_schedule.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        VestingSchedule::VESTING_SEED.as_bytes(),
        auth_key.as_ref(),
        benef_key.as_ref(),
        mint_key.as_ref(),
        &schedule_id_bytes,
        &[bump],
    ]];

    // Transfer vested (unreleased) portion to beneficiary
    if vested_unreleased > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.beneficiary_token_account.to_account_info(),
            authority: ctx.accounts.vesting_schedule.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            signer_seeds,
        );
        token_interface::transfer_checked(cpi_ctx, vested_unreleased, ctx.accounts.mint.decimals)?;
    }

    // Transfer unvested portion back to authority
    if unvested > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.authority_token_account.to_account_info(),
            authority: ctx.accounts.vesting_schedule.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            signer_seeds,
        );
        token_interface::transfer_checked(cpi_ctx, unvested, ctx.accounts.mint.decimals)?;
    }

    // Update state
    let schedule = &mut ctx.accounts.vesting_schedule;
    schedule.revoked = true;
    schedule.released_amount = schedule
        .released_amount
        .checked_add(vested_unreleased)
        .ok_or(VestingError::Overflow)?;

    // Emit event
    emit!(VestingRevoked {
        authority: ctx.accounts.authority.key(),
        beneficiary: schedule.beneficiary,
        unvested_returned: unvested,
        vested_released: vested_unreleased,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Revoke<'info> {
    /// The authority revoking the schedule
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The vesting schedule being revoked
    #[account(
        mut,
        has_one = authority,
        seeds = [VestingSchedule::VESTING_SEED.as_bytes(), vesting_schedule.authority.as_ref(), vesting_schedule.beneficiary.as_ref(), vesting_schedule.mint.as_ref(), &vesting_schedule.schedule_id.to_le_bytes()],
        bump = vesting_schedule.bump
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,

    /// Mint of the vesting token
    #[account(
        constraint = mint.key() == vesting_schedule.mint
    )]
    pub mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,

    /// Authority's token account to receive unvested tokens back
    #[account(
        mut,
        constraint = authority_token_account.mint == vesting_schedule.mint,
        constraint = authority_token_account.owner == vesting_schedule.authority
    )]
    pub authority_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Beneficiary's token account to receive any already-vested tokens
    #[account(
        mut,
        constraint = beneficiary_token_account.mint == vesting_schedule.mint,
        constraint = beneficiary_token_account.owner == vesting_schedule.beneficiary
    )]
    pub beneficiary_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Vault holding the vesting tokens
    #[account(
        mut,
        seeds = [b"vault", vesting_schedule.key().as_ref()],
        bump = vesting_schedule.vault_bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}
