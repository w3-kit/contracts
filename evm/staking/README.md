# ERC-20 Staking Contract

## What is Staking?

Staking lets users lock ERC-20 tokens in a smart contract to earn rewards over time. The contract distributes a fixed pool of reward tokens to stakers proportionally — the more you stake relative to the total pool, the larger your share of rewards.

This pattern is used across DeFi: liquidity mining, protocol incentives, governance participation, and yield farming all build on this foundation.

## How It Works

1. **Owner funds the contract** with reward tokens and sets a reward period (e.g. 10,000 RWD over 7 days)
2. **Users stake** their tokens — rewards start accruing immediately based on their share of the pool
3. **Rewards accrue per second** — the contract tracks a running `rewardPerToken` accumulator
4. **Users claim** rewards at any time, or **exit** to withdraw their stake + rewards in one call

## This Template

Based on the [Synthetix StakingRewards](https://github.com/Synthetixio/synthetix/blob/develop/contracts/StakingRewards.sol) pattern — the most battle-tested staking design in DeFi.

### Key Features

- **Separate staking and reward tokens** — stake token A, earn token B
- **Time-based reward distribution** — rewards accrue per second, not per block
- **Proportional rewards** — your share of rewards matches your share of the staking pool
- **ReentrancyGuard** — protection against reentrancy attacks on stake/withdraw/claim
- **SafeERC20** — safe token transfers that handle non-standard ERC-20 implementations

### Functions

| Function | Access | Description |
|:---------|:-------|:------------|
| `stake(amount)` | Anyone | Deposit staking tokens |
| `withdraw(amount)` | Anyone | Withdraw staking tokens |
| `claimReward()` | Anyone | Claim all pending rewards |
| `exit()` | Anyone | Withdraw full stake + claim rewards |
| `configureReward(amount, duration)` | Owner | Start a new reward period |
| `earned(account)` | View | Check pending rewards |
| `rewardPerToken()` | View | Current reward accumulator |

## Security Considerations

**Reward Funding**
The contract must hold enough reward tokens before `configureReward` is called. If tokens are removed or the balance is insufficient, reward claims will revert.

**Reward Rate Truncation**
`rewardRate = rewardAmount / duration` uses integer division. A small number of wei may be lost (dust). For example, 10,000 tokens over 604,800 seconds loses up to 604,799 wei (~0.0000000000006 tokens).

**Same Token Staking and Rewards**
If staking and reward tokens are the same ERC-20, the reward balance check in `configureReward` includes staked tokens. This is not recommended — use separate tokens.

**Owner Centralization**
The owner controls when and how much reward is distributed. In production, consider transferring ownership to a multisig or timelock contract.

**No Lock Period**
Users can withdraw at any time. If you need a lock-up period, extend the contract.

**Reentrancy**
All state-changing functions use `ReentrancyGuard` and follow checks-effects-interactions.

## Deployment

From the `evm/staking` directory:

```bash
npm install
```

Deploy with Hardhat Ignition:

```bash
npx hardhat ignition deploy ignition/modules/StakingDeploy.ts --network sepolia --parameters ./deploy-params.json
```

Example `deploy-params.json`:

```json
{
  "StakingModule": {
    "stakingToken": "0x...",
    "rewardToken": "0x..."
  }
}
```

Constructor parameters:

- `_owner` — address that will own the contract (set automatically to deployer in the ignition module)
- `_stakingToken` — ERC-20 token address that users will stake
- `_rewardToken` — ERC-20 token address distributed as rewards

After deployment, fund the contract and start rewards:

```bash
# Transfer reward tokens to the contract, then call:
# staking.configureReward(rewardAmount, durationInSeconds)
```

## Verification

```bash
npx hardhat verify --network sepolia DEPLOYED_ADDRESS "OWNER_ADDRESS" "STAKING_TOKEN_ADDRESS" "REWARD_TOKEN_ADDRESS"
```

## Testing

```bash
npx hardhat test
```

Tests cover:

- Deployment and constructor validation
- Staking (single user, multiple users, multiple stakes)
- Withdrawal (full, partial, edge cases)
- Reward configuration and access control
- Reward accrual over time
- Proportional reward distribution
- Reward claiming
- Exit (withdraw + claim)
- Ownership management
