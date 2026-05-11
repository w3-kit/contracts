# Subscription Contract

A minimal template subscription contract built with Solidity and Hardhat.

## What's inside

- ERC20 token based recurring payments
- Merchant registration and plan management
- Subscriber controls — pause, resume, and cancel
- Manual Renewal
- Merchant withdrawal logic
- Hardhat test suite

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
npx hardhat ignition deploy ignition/modules/SUBSCRIPTIONDeploy.ts --network sepolia
```

## Learn

See [.learn.md](./.learn.md) for a breakdown of the subscription mechanics, assumptions, and security considerations.

## Stack

Solidity | Hardhat | OpenZeppelin | Ethers.js | TypeScript
