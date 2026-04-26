pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;

// Re-export generated client account modules so the #[program] macro can find
// them at `crate::__client_accounts_*`.
pub(crate) use instructions::initialize::__client_accounts_initialize;
pub(crate) use instructions::stake::__client_accounts_stake;
pub(crate) use instructions::withdraw::__client_accounts_withdraw;
pub(crate) use instructions::claim_reward::__client_accounts_claim_reward;
pub(crate) use instructions::exit::__client_accounts_exit;
pub(crate) use instructions::configure_reward::__client_accounts_configure_reward;

declare_id!("3EruC8kPD8NoNZarPFFN3wb4fKbQ48b4cFX4DjhNg9Xw");

const PRECISION: u128 = 1_000_000_000_000_000_000; // 1e18

pub fn update_reward(
    pool: &mut state::PoolState,
    user_stake: Option<&mut state::UserStake>,
    clock: &Clock,
) -> Result<()> {
    pool.reward_per_token_stored = reward_per_token(pool, clock)?;
    pool.last_update_time = last_time_reward_applicable(pool, clock);

    if let Some(stake) = user_stake {
        stake.rewards_earned = earned(pool, stake)?;
        stake.reward_per_token_paid = pool.reward_per_token_stored;
    }

    Ok(())
}

fn last_time_reward_applicable(pool: &state::PoolState, clock: &Clock) -> i64 {
    std::cmp::min(clock.unix_timestamp, pool.period_finish)
}

fn reward_per_token(pool: &state::PoolState, clock: &Clock) -> Result<u128> {
    if pool.total_staked == 0 {
        return Ok(pool.reward_per_token_stored);
    }

    let elapsed = (last_time_reward_applicable(pool, clock) as u128)
        .checked_sub(pool.last_update_time as u128)
        .unwrap_or(0);

    let increment = elapsed
        .checked_mul(pool.reward_rate as u128)
        .ok_or(error::StakingError::MathOverflow)?
        .checked_mul(PRECISION)
        .ok_or(error::StakingError::MathOverflow)?
        .checked_div(pool.total_staked as u128)
        .ok_or(error::StakingError::MathOverflow)?;

    pool.reward_per_token_stored
        .checked_add(increment)
        .ok_or_else(|| error!(error::StakingError::MathOverflow))
}

fn earned(pool: &state::PoolState, stake: &state::UserStake) -> Result<u64> {
    let diff = pool
        .reward_per_token_stored
        .checked_sub(stake.reward_per_token_paid)
        .ok_or(error::StakingError::MathOverflow)?;

    let pending = (stake.balance as u128)
        .checked_mul(diff)
        .ok_or(error::StakingError::MathOverflow)?
        .checked_div(PRECISION)
        .ok_or(error::StakingError::MathOverflow)?;

    let total = (stake.rewards_earned as u128)
        .checked_add(pending)
        .ok_or(error::StakingError::MathOverflow)?;

    u64::try_from(total).map_err(|_| error!(error::StakingError::MathOverflow))
}

#[program]
pub mod staking {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        instructions::stake::handler(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount)
    }

    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        instructions::claim_reward::handler(ctx)
    }

    pub fn exit(ctx: Context<Exit>) -> Result<()> {
        instructions::exit::handler(ctx)
    }

    pub fn configure_reward(
        ctx: Context<ConfigureReward>,
        reward_amount: u64,
        duration: u64,
    ) -> Result<()> {
        instructions::configure_reward::handler(ctx, reward_amount, duration)
    }
}
