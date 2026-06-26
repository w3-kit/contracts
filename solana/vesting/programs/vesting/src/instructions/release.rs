use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TokenAccount, TokenInterface, TransferChecked};

use crate::error::VestingError;
use crate::events::TokensReleased;
use crate::state::VestingSchedule;

/// Releases vested tokens to the beneficiary.
/// Equivalent to `release(address token)` in VestingWallet.sol.
///
/// Vesting formula (from Solidity _vestingSchedule):
///   if now < start + cliff        → vested = 0
///   elif now >= start + duration   → vested = total_deposited
///   else                           → vested = total_deposited * (now - start) / duration
///
///   releasable = vested - released_amount
pub(crate) fn handler(ctx: Context<Release>) -> Result<()> {
    let schedule = &ctx.accounts.vesting_schedule;

    // Defensive check: cannot release from a revoked schedule
    require!(!schedule.revoked, VestingError::AlreadyRevoked);

    let clock = Clock::get()?;
    let now = clock.unix_timestamp as u64;

    // Calculate releasable amount
    let releasable = compute_releasable(schedule, now)?;
    require!(releasable > 0, VestingError::NothingToRelease);

    // Transfer from vault to beneficiary using vesting_schedule PDA as authority
    let authority_key = ctx.accounts.vesting_schedule.authority;
    let beneficiary_key = ctx.accounts.vesting_schedule.beneficiary;
    let mint_key = ctx.accounts.vesting_schedule.mint;
    let schedule_id_bytes = ctx.accounts.vesting_schedule.schedule_id.to_le_bytes();
    let bump = ctx.accounts.vesting_schedule.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        VestingSchedule::VESTING_SEED.as_bytes(),
        authority_key.as_ref(),
        beneficiary_key.as_ref(),
        mint_key.as_ref(),
        &schedule_id_bytes,
        &[bump],
    ]];

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
    token_interface::transfer_checked(cpi_ctx, releasable, ctx.accounts.mint.decimals)?;

    // Update state
    let schedule = &mut ctx.accounts.vesting_schedule;
    schedule.released_amount = schedule
        .released_amount
        .checked_add(releasable)
        .ok_or(VestingError::Overflow)?;

    // Emit event
    emit!(TokensReleased {
        beneficiary: ctx.accounts.beneficiary.key(),
        mint: schedule.mint,
        amount: releasable,
    });

    Ok(())
}

/// Computes the releasable amount based on the vesting schedule.
/// Mirrors `_vestingSchedule` + cliff logic from Solidity.
pub fn compute_releasable(schedule: &VestingSchedule, now: u64) -> Result<u64> {
    let vested = compute_vested_amount(schedule, now)?;
    Ok(vested.saturating_sub(schedule.released_amount))
}

/// Computes the total vested amount at a given timestamp.
/// Equivalent to `vestedAmount(token, timestamp)` in VestingWallet.sol
/// combined with cliff check from VestingWalletCliff.sol.
pub fn compute_vested_amount(schedule: &VestingSchedule, now: u64) -> Result<u64> {
    let start = schedule.start_time;
    let duration = schedule.duration;
    let cliff_end = start
        .checked_add(schedule.cliff_duration)
        .ok_or(VestingError::Overflow)?;
    let end = start
        .checked_add(duration)
        .ok_or(VestingError::Overflow)?;

    // Before cliff: nothing vested (VestingWalletCliff logic)
    if now < cliff_end {
        return Ok(0);
    }

    // After end: everything vested
    if now >= end {
        return Ok(schedule.total_deposited);
    }

    // Linear vesting: total_deposited * (now - start) / duration
    let elapsed = (now - start) as u128;
    let total = schedule.total_deposited as u128;
    let dur = duration as u128;

    let vested = total
        .checked_mul(elapsed)
        .ok_or(VestingError::Overflow)?
        .checked_div(dur)
        .ok_or(VestingError::Overflow)?;

    Ok(vested as u64)
}

#[derive(Accounts)]
pub struct Release<'info> {
    /// Anyone can crank release (permissionless, like OZ VestingWallet).
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Anyone can crank release; tokens always go to the beneficiary.
    /// Matches OZ VestingWallet.release() semantics (permissionless).
    /// CHECK: Validated via has_one constraint on vesting_schedule.
    pub beneficiary: UncheckedAccount<'info>,

    /// The vesting schedule
    #[account(
        mut,
        has_one = beneficiary,
        seeds = [VestingSchedule::VESTING_SEED.as_bytes(), vesting_schedule.authority.as_ref(), vesting_schedule.beneficiary.as_ref(), vesting_schedule.mint.as_ref(), &vesting_schedule.schedule_id.to_le_bytes()],
        bump = vesting_schedule.bump
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,

    /// Mint of the vesting token
    #[account(
        constraint = mint.key() == vesting_schedule.mint
    )]
    pub mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,

    /// Beneficiary's token account to receive released tokens
    #[account(
        mut,
        constraint = beneficiary_token_account.mint == vesting_schedule.mint,
        constraint = beneficiary_token_account.owner == vesting_schedule.beneficiary @ VestingError::InvalidBeneficiaryOwner
    )]
    pub beneficiary_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Vault holding the vesting tokens (also the signer for transfer)
    #[account(
        mut,
        seeds = [b"vault", vesting_schedule.key().as_ref()],
        bump = vesting_schedule.vault_bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}
