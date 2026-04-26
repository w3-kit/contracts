use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::StakingError;
use crate::events;
use crate::state::{PoolState, UserStake};
use crate::update_reward;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.staking_mint.as_ref(), pool.reward_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, PoolState>,

    #[account(
        mut,
        seeds = [b"user_stake", pool.key().as_ref(), user.key().as_ref()],
        bump = user_stake.bump,
        constraint = user_stake.owner == user.key() @ StakingError::Unauthorized,
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
}

pub fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, StakingError::ZeroAmount);

    let clock = Clock::get()?;
    let pool = &mut ctx.accounts.pool;
    let user_stake = &mut ctx.accounts.user_stake;

    update_reward(pool, Some(user_stake), &clock)?;

    require!(amount <= user_stake.balance, StakingError::InsufficientStake);

    pool.total_staked = pool
        .total_staked
        .checked_sub(amount)
        .ok_or(StakingError::MathOverflow)?;
    user_stake.balance = user_stake
        .balance
        .checked_sub(amount)
        .ok_or(StakingError::MathOverflow)?;

    let seeds = &[
        b"pool",
        pool.staking_mint.as_ref(),
        pool.reward_mint.as_ref(),
        &[pool.bump],
    ];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.staking_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: pool.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;

    emit!(events::Withdrawn {
        user: ctx.accounts.user.key(),
        amount,
    });

    Ok(())
}
