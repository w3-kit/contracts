# SPL Token Staking Program

## What is Staking?

Staking lets users lock SPL tokens in a program to earn rewards over time. The program distributes a fixed pool of reward tokens to stakers proportionally — the more you stake relative to the total pool, the larger your share of rewards.

This pattern is used across DeFi: liquidity mining, protocol incentives, governance participation, and yield farming all build on this foundation.

## How It Works

1. **Authority funds the reward vault** with reward tokens and sets a reward period (e.g. 10,000 RWD over 7 days)
2. **Users stake** their tokens — rewards start accruing immediately based on their share of the pool
3. **Rewards accrue per second** — the program tracks a running `reward_per_token` accumulator
4. **Users claim** rewards at any time, or **exit** to withdraw their stake + rewards in one instruction

## This Template

Based on the [Synthetix StakingRewards](https://solidity-by-example.org/defi/staking-rewards/) pattern — the most battle-tested staking design in DeFi — ported to Solana using the Anchor framework.

### Key Features

- **Separate staking and reward tokens** — stake token A, earn token B
- **Time-based reward distribution** — rewards accrue per second using the Clock sysvar
- **Proportional rewards** — your share of rewards matches your share of the staking pool
- **PDA-owned vaults** — token vaults are owned by a Program Derived Address, removing single-key custody risk
- **Multiple pools** — PDA seeds include both mints, supporting multiple independent staking pools
- **Checked arithmetic** — all math uses `checked_add/sub/mul/div` to prevent overflow panics

### Instructions

| Instruction | Access | Description |
|:------------|:-------|:------------|
| `initialize` | Authority | Create pool PDA and token vaults |
| `stake(amount)` | Anyone | Deposit staking tokens |
| `withdraw(amount)` | Anyone | Withdraw staking tokens |
| `claim_reward` | Anyone | Claim all pending rewards |
| `exit` | Anyone | Withdraw full stake + claim rewards |
| `configure_reward(amount, duration)` | Authority | Start a new reward period |

### Accounts

| Account | Type | Description |
|:--------|:-----|:------------|
| `PoolState` | PDA `[b"pool", staking_mint, reward_mint]` | Global pool configuration and reward state |
| `UserStake` | PDA `[b"user_stake", pool, user]` | Per-user staking balance and reward snapshot |
| Staking Vault | ATA owned by pool PDA | Holds all staked tokens |
| Reward Vault | ATA owned by pool PDA | Holds reward tokens for distribution |

## Security Considerations

**Reward Funding**
The reward vault must hold enough tokens before `configure_reward` is called. The program verifies the vault balance covers the announced reward amount.

**Reward Rate Truncation**
`reward_rate = reward_amount / duration` uses integer division. A small amount of tokens may be undistributed (dust). For example, 10,000 tokens over 604,800 seconds loses up to 604,799 lamports.

**Separate Mints Required**
The program enforces `staking_mint != reward_mint` at initialization. This prevents vault accounting confusion.

**Authority Centralization**
The authority controls when and how much reward is distributed. In production, consider using a multisig or governance program as the authority.

**No Lock Period**
Users can withdraw at any time. If you need a lock-up period, extend the program.

**No Reentrancy Risk**
Unlike EVM contracts, Solana programs process instructions atomically. CPI calls to the Token program are safe by design — the runtime enforces account ownership and prevents reentrancy.

## Deployment

From the `solana/staking` directory:

```bash
npm install
anchor build
```

Deploy to devnet:

```bash
anchor deploy --provider.cluster devnet
```

After deployment, create the pool and start rewards:

```bash
# 1. Call initialize with staking_mint and reward_mint
# 2. Transfer reward tokens to the reward vault (ATA owned by pool PDA)
# 3. Call configure_reward(reward_amount, duration_in_seconds)
```

## Testing

```bash
anchor test --validator legacy
```

Tests cover:

- Initialization and constructor validation
- Staking (single user, multiple users, multiple stakes)
- Withdrawal (full, partial, edge cases)
- Reward configuration and access control
- Reward accrual over time
- Proportional reward distribution
- Reward claiming
- Exit (withdraw + claim)
- Re-configuration after period ends
