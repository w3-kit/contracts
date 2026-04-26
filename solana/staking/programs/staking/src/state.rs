use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PoolState {
    pub authority: Pubkey,
    pub staking_mint: Pubkey,
    pub reward_mint: Pubkey,
    pub staking_vault: Pubkey,
    pub reward_vault: Pubkey,
    pub reward_rate: u64,
    pub period_finish: i64,
    pub last_update_time: i64,
    pub reward_per_token_stored: u128,
    pub total_staked: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserStake {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub balance: u64,
    pub reward_per_token_paid: u128,
    pub rewards_earned: u64,
    pub bump: u8,
}
