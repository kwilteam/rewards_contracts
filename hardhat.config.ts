import { HardhatUserConfig, vars } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import dotenv from 'dotenv';
dotenv.config();

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const SEPOLIA_MNEMONIC = process.env.SEPOLIA_MNEMONIC;

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      hardfork: "merge", // https://ethereum.org/en/history/#paris
      gasPrice: 1000000000,
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      // accounts: [SEPOLIA_PRIVATE_KEY]
      accounts: {
        mnemonic: SEPOLIA_MNEMONIC,
        initialIndex: 0,
        count: 4,
      }
    },
  },
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: `paris`, // https://github.com/NomicFoundation/hardhat/issues/4232
    }
  },
};

export default config;
