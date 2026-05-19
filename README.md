# w3-kit/contracts

[![CI](https://github.com/w3-kit/contracts/actions/workflows/ci.yml/badge.svg)](https://github.com/w3-kit/contracts/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Reusable smart contract templates for EVM (Solidity + Foundry) and Solana (Anchor).

## Structure

`evm/`           # Solidity contract templates (Hardhat + TypeScript tests)
`solana/`        # Anchor programs

## EVM Contracts (Planned)

- ERC-20 token template
- ERC-721 NFT template
- ERC-1155 multi-token template
- Staking contract
- Vesting contract
- Governance (DAO voting)
- Multisig wallet
- Subscription/billing

## Solana Programs

- Staking program (`solana/staking`)
- SPL token creation (planned)
- Vesting program (planned)
- Subscription program (planned)

Anchor integration tests use shared helpers in `solana/test-utils`. See [docs/testing-solana.md](./docs/testing-solana.md) for layout, CI, and how to add tests for a new program.

Every contract includes a .learn.md with explanations and security considerations.
