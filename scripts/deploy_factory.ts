import hre from "hardhat";
import dotenv from 'dotenv';
import RewardDistributorFactoryModule from "../ignition/modules/RewardDistributorFactory";
import {HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";
import RewardDistributorSingletonModule from "../ignition/modules/RewardDistributorSingleton";

dotenv.config();

async function deployFactory(deployer: HardhatEthersSigner) {
    console.log('Owner address: ', deployer.address);

    const { singleton } = await hre.ignition.deploy(RewardDistributorSingletonModule, {
        defaultSender: deployer.address,
        config: {
            requiredConfirmations: 1,
        },
    });

    console.log(`Singleton contract deployed to: ${await singleton.getAddress()}`);

    const {factory} = await hre.ignition.deploy(RewardDistributorFactoryModule, {
        config: {
            requiredConfirmations: 1,
        },
        defaultSender: deployer.address,
        parameters: {
            RewardDistributorFactory: {
                owner: deployer.address,
                imp: await singleton.getAddress(),
            },
        },
    })

    console.log(`Factory Contract deployed to: ${await factory.getAddress()}`);
}

async function main() {
    console.log("Current height: ", await hre.ethers.provider.getBlockNumber())

    switch (hre.network.config.chainId) {
        case 11155111: { // sepolia
            const [deployer] = await hre.ethers.getSigners();
            await deployFactory(deployer);
            break;
        }
        default: {
            // const rewardToken = await hre.ethers.getContractAt("ERC20", );
            console.log(`deploy to '${hre.network.name}' network is not supported yet`);
        }
    }
}

main().catch(console.error)