import { HardhatUserConfig, vars } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import dotenv from 'dotenv';
dotenv.config();

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      hardfork: "merge", // https://ethereum.org/en/history/#paris
      gasPrice: 1000000000,
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC,
      // accounts: [SEPOLIA_PRIVATE_KEY]
      accounts: {
        mnemonic: process.env.SEPOLIA_MNEMONIC,
        initialIndex: 0,
        count: 4,
      },
        chainId: 11155111,  // chainId must be the same as the forking network
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
  etherscan: {
      apiKey: process.env.ETHERSCAN_API,
  }
};

export default config;
