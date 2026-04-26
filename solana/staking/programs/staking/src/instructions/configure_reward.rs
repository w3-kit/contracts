use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::error::StakingError;
use crate::events;
use crate::state::PoolState;
use crate::update_reward;

#[derive(Accounts)]
pub struct ConfigureReward<'info> {
    #[account(
        constraint = authority.key() == pool.authority @ StakingError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.staking_mint.as_ref(), pool.reward_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, PoolState>,

    #[account(
        constraint = reward_vault.key() == pool.reward_vault,
    )]
    pub reward_vault: Account<'info, TokenAccount>,
}

pub fn handler(ctx: Context<ConfigureReward>, reward_amount: u64, duration: u64) -> Result<()> {
    require!(duration > 0, StakingError::ZeroDuration);

    let clock = Clock::get()?;
    let pool = &mut ctx.accounts.pool;

    update_reward(pool, None, &clock)?;

    require!(
        clock.unix_timestamp >= pool.period_finish,
        StakingError::RewardPeriodNotFinished
    );

    let vault_balance = ctx.accounts.reward_vault.amount;
    require!(
        vault_balance >= reward_amount,
        StakingError::InsufficientRewardBalance
    );

    pool.reward_rate = reward_amount
        .checked_div(duration)
        .ok_or(StakingError::MathOverflow)?;
    pool.last_update_time = clock.unix_timestamp;
    pool.period_finish = clock
        .unix_timestamp
        .checked_add(duration as i64)
        .ok_or(StakingError::MathOverflow)?;

    emit!(events::RewardConfigured {
        reward_amount,
        duration,
    });

    Ok(())
}
