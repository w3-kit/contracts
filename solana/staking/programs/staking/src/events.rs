use anchor_lang::prelude::*;

#[event]
pub struct Staked {
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Withdrawn {
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct RewardClaimed {
    pub user: Pubkey,
    pub reward: u64,
}

#[event]
pub struct RewardConfigured {
    pub reward_amount: u64,
    pub duration: u64,
}
