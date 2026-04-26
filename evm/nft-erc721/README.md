# NFT ERC-721

A production-ready ERC-721 NFT contract built with Solidity and Hardhat.

## What's inside

- ERC-721 with Metadata URI and Enumerable extension
- Royalties via ERC-2981
- Hardhat test suite
- Deploy script for Sepolia

## Setup

```bash
npm install
```

## Test

```bash
npx hardhat test
```

## Deploy

```bash
npx hardhat ignition deploy ignition/modules/NFT721Deploy.ts --network sepolia
```

## Learn

See [.learn.md](./.learn.md) for a breakdown of the ERC-721 standard, metadata patterns, and royalty enforcement.

## Stack

Solidity | Hardhat | OpenZeppelin | Ethers.js | TypeScript
