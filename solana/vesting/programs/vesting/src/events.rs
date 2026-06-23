use anchor_lang::prelude::*;

/// Emitted when tokens are released to beneficiary.
/// Equivalent to `ERC20Released(address indexed token, uint256 amount)` in Solidity.
#[event]
pub struct TokensReleased {
    pub beneficiary: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

/// Emitted when a vesting schedule is revoked.
#[event]
pub struct VestingRevoked {
    pub authority: Pubkey,
    pub beneficiary: Pubkey,
    pub unvested_returned: u64,
    pub vested_released: u64,
}

/// Emitted when tokens are deposited into the vesting vault.
#[event]
pub struct TokensDeposited {
    pub depositor: Pubkey,
    pub amount: u64,
    pub total_deposited: u64,
}
