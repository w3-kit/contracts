# Solana / Anchor testing convention

This repo uses a shared layout and helpers so every Anchor program tests the same way.

## Directory layout

```
solana/
├── test-utils/              # shared TypeScript helpers (provider, airdrop, PDA, clock)
└── <program-name>/          # one Anchor workspace per template
    ├── Anchor.toml
    ├── programs/<name>/
    ├── tests/
    │   ├── <program-name>.ts    # main mocha suite (matches program name)
    │   └── helpers/               # program-only helpers (PDAs, fixtures)
    ├── package.json
    └── tsconfig.json
```

- Test entry file: `tests/<program-name>.ts` (e.g. `tests/staking.ts`).
- Reuse `solana/test-utils` for provider setup, funding, generic PDAs, and time helpers.
- Put seeds and fixtures that are specific to one program under `tests/helpers/`.

## Shared test utilities

Package: `solana/test-utils` (`@w3-kit/solana-test-utils`).

| Helper | Purpose |
|--------|---------|
| `setupProvider()` | `AnchorProvider.env()` + returns `connection` and `payer` |
| `loadProgram(name)` | Typed `anchor.workspace` program handle |
| `fundKeypairs(connection, keypairs, sol?)` | Parallel airdrops with confirmation |
| `findPda(programId, seeds)` | `PublicKey.findProgramAddressSync` wrapper |
| `getChainClock(connection)` | Current slot + unix timestamp for assertions |
| `waitSeconds` / `waitScaledSeconds` | Real-time waits when the program uses `Clock` sysvar |

Wire it in `package.json`:

```json
{
  "dependencies": {
    "@w3-kit/solana-test-utils": "file:../test-utils"
  }
}
```

## Typical test file skeleton

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { expect } from "chai";
import {
  setupProvider,
  fundKeypairs,
} from "@w3-kit/solana-test-utils";
import { MyProgram } from "../target/types/my_program";

describe("my-program", () => {
  const { connection, payer } = setupProvider();
  const program = anchor.workspace.MyProgram as Program<MyProgram>;

  const user = Keypair.generate();

  before(async () => {
    await fundKeypairs(connection, [user]);
  });

  it("does something", async () => {
    // ...
  });
});
```

## Program-specific PDAs

Keep seed lists next to the program under `tests/helpers/`:

```typescript
import { PublicKey } from "@solana/web3.js";
import { findPda } from "@w3-kit/solana-test-utils";

export function poolPda(
  programId: PublicKey,
  stakingMint: PublicKey,
  rewardMint: PublicKey
) {
  return findPda(programId, ["pool", stakingMint.toBuffer(), rewardMint.toBuffer()]);
}
```

## Clock and slots

Many programs use `Clock::get()` for `unix_timestamp` or slot-based logic.

| Approach | When to use |
|----------|-------------|
| **Short periods + `waitScaledSeconds`** | Default for `anchor test` on localnet (see `staking` tests) |
| **`getChainClock`** | Assert block time before/after an instruction |
| **Bankrun / LiteSVM** | Deterministic warp without real sleeps (add when tests become flaky or slow) |

On the validator started by `anchor test`, you cannot warp unix time through the standard RPC. Prefer short reward periods in tests (seconds, not days) and optional `ANCHOR_TEST_TIME_SCALE=0.5` in CI to trim waits.

Example (real time wait):

```typescript
import { waitScaledSeconds } from "@w3-kit/solana-test-utils";

await fundVaultAndConfigure(..., new BN(1_000_000), new BN(5));
await waitScaledSeconds(6); // past a 5-second reward period
```

## Running tests locally

From the program directory (e.g. `solana/staking`):

```bash
npm ci
anchor test
```

`anchor test` builds the program, starts a local validator, deploys, and runs the mocha suite defined in `Anchor.toml`:

```toml
[scripts]
test = "npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

## Adding tests for a new program

1. Copy layout from `solana/staking` (Anchor.toml, `programs/`, `tests/`, `package.json`).
2. Add `"@w3-kit/solana-test-utils": "file:../test-utils"` to `package.json`.
3. Create `tests/<program-name>.ts` using `setupProvider` and `fundKeypairs`.
4. Add program PDAs under `tests/helpers/`.
5. CI picks up any directory under `solana/` that contains `Anchor.toml` (see `.github/workflows/ci.yml`).

## Reference implementation

`solana/staking` is the canonical example: full suite in `tests/staking.ts`, PDAs in `tests/helpers/staking.ts`, shared utils for provider, airdrop, and time waits.
