use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::StakingError;
use crate::events;
use crate::state::{PoolState, UserStake};
use crate::update_reward;

#[derive(Accounts)]
pub struct ClaimReward<'info> {
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
        associated_token::mint = pool.reward_mint,
        associated_token::authority = user,
    )]
    pub user_reward_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = reward_vault.key() == pool.reward_vault,
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimReward>) -> Result<()> {
    let clock = Clock::get()?;
    let pool = &mut ctx.accounts.pool;
    let user_stake = &mut ctx.accounts.user_stake;

    update_reward(pool, Some(user_stake), &clock)?;

    let reward = user_stake.rewards_earned;
    if reward > 0 {
        user_stake.rewards_earned = 0;

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
                    from: ctx.accounts.reward_vault.to_account_info(),
                    to: ctx.accounts.user_reward_account.to_account_info(),
                    authority: pool.to_account_info(),
                },
                &[seeds],
            ),
            reward,
        )?;

        emit!(events::RewardClaimed {
            user: ctx.accounts.user.key(),
            reward,
        });
    }

    Ok(())
}
