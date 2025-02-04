import { HardhatUserConfig, vars } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import dotenv from 'dotenv';
dotenv.config();


const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      hardfork: "merge", // https://ethereum.org/en/history/#paris
      forking: {
          url: process.env.SEPOLIA_RPC!,
          blockNumber: 7606599,
      },
      chainId: 11155111,  // chainId must be the same as the forking network
        accounts: {
            mnemonic: process.env.SEPOLIA_MNEMONIC,
            initialIndex: 0,
            count: 4,
        },
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
