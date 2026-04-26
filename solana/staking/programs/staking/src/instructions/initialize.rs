use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::error::StakingError;
use crate::state::PoolState;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub staking_mint: Account<'info, Mint>,
    pub reward_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = 8 + PoolState::INIT_SPACE,
        seeds = [b"pool", staking_mint.key().as_ref(), reward_mint.key().as_ref()],
        bump,
    )]
    pub pool: Account<'info, PoolState>,

    #[account(
        init,
        payer = authority,
        associated_token::mint = staking_mint,
        associated_token::authority = pool,
    )]
    pub staking_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        associated_token::mint = reward_mint,
        associated_token::authority = pool,
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    require!(
        ctx.accounts.staking_mint.key() != ctx.accounts.reward_mint.key(),
        StakingError::SameMint
    );

    let pool = &mut ctx.accounts.pool;
    pool.authority = ctx.accounts.authority.key();
    pool.staking_mint = ctx.accounts.staking_mint.key();
    pool.reward_mint = ctx.accounts.reward_mint.key();
    pool.staking_vault = ctx.accounts.staking_vault.key();
    pool.reward_vault = ctx.accounts.reward_vault.key();
    pool.bump = ctx.bumps.pool;

    Ok(())
}
