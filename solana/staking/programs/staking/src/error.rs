use anchor_lang::prelude::*;

#[error_code]
pub enum StakingError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Duration must be greater than zero")]
    ZeroDuration,

    #[msg("Previous reward period has not finished")]
    RewardPeriodNotFinished,

    #[msg("Reward vault has insufficient balance")]
    InsufficientRewardBalance,

    #[msg("User has nothing staked")]
    NothingStaked,

    #[msg("Withdraw amount exceeds staked balance")]
    InsufficientStake,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Staking and reward mints must be different")]
    SameMint,
}
