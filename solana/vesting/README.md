# Solana Vesting Program

An Anchor-based token vesting program with configurable cliff and linear unlock, inspired by OpenZeppelin's [VestingWallet](https://docs.openzeppelin.com/contracts/5.x/api/finance#VestingWallet) and [VestingWalletCliff](https://docs.openzeppelin.com/contracts/5.x/api/finance#VestingWalletCliff).

## Features

- Configurable start time, duration, and cliff
- Linear vesting curve after cliff period
- Supports both Token Program and Token-2022 (via `InterfaceAccount`)
- Optional revocability by authority
- Multiple deposits per schedule
- PDA-based vault (no separate keypair needed)

## Architecture

```
┌─────────────┐       ┌──────────────────┐       ┌───────────┐
│  Authority   │──────▶│ VestingSchedule  │◀──────│Beneficiary│
│  (creates)   │       │     (PDA)        │       │ (claims)  │
└─────────────┘       └────────┬─────────┘       └───────────┘
                               │ owns
                        ┌──────▼──────┐
                        │  Token Vault │
                        │    (PDA)     │
                        └─────────────┘
```

## Instructions

| Instruction | Signer | Description |
|-------------|--------|-------------|
| `initialize` | authority | Creates a vesting schedule + vault |
| `deposit` | depositor | Transfers tokens into the vault |
| `release` | any (permissionless) | Releases vested tokens to beneficiary |
| `revoke` | authority | Cancels schedule, splits tokens fairly |

## PDA Seeds

| Account | Seeds |
|---------|-------|
| `vesting_schedule` | `"vesting"` + authority + beneficiary + mint + schedule_id |
| `vault` | `"vault"` + vesting_schedule address |

> **Note:** The `schedule_id` seed allows multiple concurrent vesting schedules for the same (authority, beneficiary, mint) triple. Use different `schedule_id` values (0, 1, 2, ...) to create parallel grants.

## Vesting Formula

```
if now < start + cliff_duration:
    vested = 0
elif now >= start + duration:
    vested = total_deposited
else:
    vested = total_deposited * (now - start) / duration

releasable = vested - released_amount
```

> **Warning — Retroactive Deposit Semantics:** Tokens deposited mid-schedule become proportionally vested immediately. For example, if 50% of the duration has elapsed and 1,000 tokens are deposited, 500 are instantly releasable. This matches OpenZeppelin's `VestingWallet` behavior (where deposits are external ERC-20 transfers) but can be a UX footgun. Operators should deposit the full grant amount at or before `start_time` to avoid confusion.

## Build

```bash
anchor build
```

## Test

```bash
npm test
```

Tests cover both Token Program and Token-2022 across all instructions.

## Project Structure

```
programs/vesting/src/
├── lib.rs                  Program entry point
├── state.rs                VestingSchedule account definition
├── error.rs                Custom error codes
├── events.rs               Event definitions
└── instructions/
    ├── mod.rs              Module re-exports
    ├── initialize.rs       Create schedule + vault
    ├── deposit.rs          Fund the vault
    ├── release.rs          Claim vested tokens (permissionless)
    └── revoke.rs           Cancel and split tokens
```

## License

MIT
