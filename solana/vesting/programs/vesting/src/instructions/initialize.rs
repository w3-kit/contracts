use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::error::VestingError;
use crate::state::VestingSchedule;

/// Creates a new vesting schedule.
/// Equivalent to deploying VestingWallet + VestingWalletCliff in Solidity.
pub(crate) fn handler(
    ctx: Context<Initialize>,
    schedule_id: u64,
    start_time: u64,
    duration: u64,
    cliff_duration: u64,
    revocable: bool,
) -> Result<()> {
    // Validation
    require!(start_time != 0, VestingError::InvalidStartTime);
    require!(duration > 0, VestingError::InvalidDuration);
    require!(cliff_duration <= duration, VestingError::InvalidCliffDuration);

    // Set state
    let schedule = &mut ctx.accounts.vesting_schedule;
    schedule.authority = ctx.accounts.authority.key();
    schedule.beneficiary = ctx.accounts.beneficiary.key();
    schedule.mint = ctx.accounts.mint.key();
    schedule.start_time = start_time;
    schedule.duration = duration;
    schedule.cliff_duration = cliff_duration;
    schedule.total_deposited = 0;
    schedule.released_amount = 0;
    schedule.revocable = revocable;
    schedule.revoked = false;
    schedule.schedule_id = schedule_id;
    schedule.bump = ctx.bumps.vesting_schedule;
    schedule.vault_bump = ctx.bumps.vault;

    Ok(())
}

#[derive(Accounts)]
#[instruction(schedule_id: u64)]
pub struct Initialize<'info> {
    /// Authority who creates and (optionally) can revoke the schedule
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Beneficiary who will receive the vested tokens
    /// CHECK: We only store their pubkey, no data is read from this account
    pub beneficiary: UncheckedAccount<'info>,

    /// The SPL token mint (supports Token and Token-2022)
    pub mint: InterfaceAccount<'info, Mint>,

    /// The vesting schedule PDA
    #[account(
        init,
        payer = authority,
        space = 8 + VestingSchedule::INIT_SPACE,
        seeds = [VestingSchedule::VESTING_SEED.as_bytes(), authority.key().as_ref(), beneficiary.key().as_ref(), mint.key().as_ref(), &schedule_id.to_le_bytes()],
        bump
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,

    /// Token vault PDA that holds the vesting tokens
    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = vesting_schedule,
        seeds = [b"vault", vesting_schedule.key().as_ref()],
        bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub rent: Sysvar<'info, Rent>,
}
