import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const isLocalNetwork = !process.env.ALCHEMY_URL;

if (!isLocalNetwork) {
  if (!process.env.ALCHEMY_URL) throw new Error("ALCHEMY_URL not set");
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");
  if (!process.env.ETHERSCAN_API_KEY)
    throw new Error("ETHERSCAN_API_KEY not set");
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./src",
  },
  networks: {
    ...(isLocalNetwork
      ? {}
      : {
          sepolia: {
            url: process.env.ALCHEMY_URL!,
            accounts: [process.env.PRIVATE_KEY!],
          },
        }),
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
