use anchor_lang::prelude::*;

/// Vesting schedule state stored in a PDA.
/// Combines VestingWallet + VestingWalletCliff state into a single account.
#[account]
#[derive(InitSpace)]
pub struct VestingSchedule {
    /// The authority who created the vesting schedule (can revoke if revocable)
    pub authority: Pubkey,
    /// The beneficiary who receives vested tokens
    pub beneficiary: Pubkey,
    /// SPL Token mint address
    pub mint: Pubkey,
    /// Start timestamp (unix)
    pub start_time: u64,
    /// Vesting duration in seconds
    pub duration: u64,
    /// Cliff duration in seconds (0 = no cliff)
    pub cliff_duration: u64,
    /// Total amount deposited into the vault
    pub total_deposited: u64,
    /// Amount already released to beneficiary
    pub released_amount: u64,
    /// Whether the schedule can be revoked by authority
    pub revocable: bool,
    /// Whether the schedule has been revoked
    pub revoked: bool,
    /// Bump seed for the vesting schedule PDA
    pub bump: u8,
    /// Bump seed for the token vault PDA
    pub vault_bump: u8,
}

impl VestingSchedule {
    pub const VESTING_SEED: &'static str = "vesting";
    pub const VAULT_SEED: &'static [u8] = b"vault";
}
