pub mod errors;
pub mod events;
pub mod instructions;
pub mod states;

use anchor_lang::prelude::*;

pub use instructions::*;

// Re-export generated client account modules so the #[program] macro can find
// them at `crate::__client_accounts_*`.
pub(crate) use instructions::initialize::__client_accounts_initialize;
pub(crate) use instructions::deposit::__client_accounts_deposit;
pub(crate) use instructions::release::__client_accounts_release;
pub(crate) use instructions::revoke::__client_accounts_revoke;

declare_id!("ossKvVnmERA1f2JfoUT3ADg7zBhJa52sg34xUPnh9bi");

#[program]
pub mod vesting {
    use super::*;

    /// Creates a new vesting schedule.
    /// Equivalent to VestingWallet constructor + VestingWalletCliff constructor in Solidity.
    pub fn initialize(
        ctx: Context<Initialize>,
        start_time: u64,
        duration: u64,
        cliff_duration: u64,
        revocable: bool,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, start_time, duration, cliff_duration, revocable)
    }

    /// Deposits SPL tokens into the vesting vault.
    /// Equivalent to receiving ERC20 tokens in VestingWallet.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    /// Releases vested tokens to the beneficiary.
    /// Equivalent to `release(address token)` in VestingWallet.sol.
    pub fn release(ctx: Context<Release>) -> Result<()> {
        instructions::release::handler(ctx)
    }

    /// Revokes the vesting schedule and returns unvested tokens to authority.
    /// Optional feature — not in OpenZeppelin's VestingWallet but common in practice.
    pub fn revoke(ctx: Context<Revoke>) -> Result<()> {
        instructions::revoke::handler(ctx)
    }
}
