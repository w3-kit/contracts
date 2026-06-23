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
| `release` | beneficiary | Claims vested tokens |
| `revoke` | authority | Cancels schedule, splits tokens fairly |

## PDA Seeds

| Account | Seeds |
|---------|-------|
| `vesting_schedule` | `"vesting"` + authority + beneficiary + mint |
| `vault` | `"vault"` + vesting_schedule address |

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

## Build

```bash
anchor build
```

## Test

```bash
anchor test
```

Tests cover both Token Program and Token-2022 across all instructions.

## Project Structure

```
programs/vesting-template/src/
├── lib.rs                  Program entry point
├── states.rs               VestingSchedule account definition
├── errors.rs               Custom error codes
├── events.rs               Event definitions
└── instructions/
    ├── mod.rs              Module re-exports
    ├── initialize.rs       Create schedule + vault
    ├── deposit.rs          Fund the vault
    ├── release.rs          Claim vested tokens
    └── revoke.rs           Cancel and split tokens
```

## License

MIT
