use anchor_lang::prelude::*;

#[error_code]
pub enum VestingError {
    #[msg("Cliff duration cannot exceed total vesting duration")]
    InvalidCliffDuration,
    #[msg("Vesting duration must be greater than zero")]
    InvalidDuration,
    #[msg("Start time must not be zero")]
    InvalidStartTime,
    #[msg("No tokens available to release")]
    NothingToRelease,
    #[msg("Vesting schedule is not revocable")]
    NotRevocable,
    #[msg("Vesting schedule has already been revoked")]
    AlreadyRevoked,
    #[msg("Deposit amount must be greater than zero")]
    InvalidDepositAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
}
