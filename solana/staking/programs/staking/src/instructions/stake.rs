use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::StakingError;
use crate::events;
use crate::state::{PoolState, UserStake};
use crate::update_reward;

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.staking_mint.as_ref(), pool.reward_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, PoolState>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserStake::INIT_SPACE,
        seeds = [b"user_stake", pool.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub user_stake: Account<'info, UserStake>,

    #[account(
        mut,
        associated_token::mint = pool.staking_mint,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = staking_vault.key() == pool.staking_vault,
    )]
    pub staking_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Stake>, amount: u64) -> Result<()> {
    require!(amount > 0, StakingError::ZeroAmount);

    let clock = Clock::get()?;
    let pool = &mut ctx.accounts.pool;
    let user_stake = &mut ctx.accounts.user_stake;

    if user_stake.pool == Pubkey::default() {
        user_stake.pool = pool.key();
        user_stake.owner = ctx.accounts.user.key();
        user_stake.balance = 0;
        user_stake.reward_per_token_paid = 0;
        user_stake.rewards_earned = 0;
        user_stake.bump = ctx.bumps.user_stake;
    }

    update_reward(pool, Some(user_stake), &clock)?;

    pool.total_staked = pool
        .total_staked
        .checked_add(amount)
        .ok_or(StakingError::MathOverflow)?;
    user_stake.balance = user_stake
        .balance
        .checked_add(amount)
        .ok_or(StakingError::MathOverflow)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.staking_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    emit!(events::Staked {
        user: ctx.accounts.user.key(),
        amount,
    });

    Ok(())
}
