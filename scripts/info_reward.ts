import hre from "hardhat";
import dotenv from 'dotenv';
dotenv.config();


async function info(addr: string) {
    const rd = await hre.ethers.getContractAt("RewardDistributor", addr);

    console.log(`RewardToken: ${await rd.rewardToken()}`)
    console.log(`Nonce: ${await rd.nonce()}`);
}

async function main() {
    const addr = "0x55EAC662C9D77cb537DBc9A57C0aDa90eB88132d";

    info(addr);
}

main().catch(console.error)