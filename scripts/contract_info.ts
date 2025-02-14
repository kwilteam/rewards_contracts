import hre from "hardhat";
import dotenv from 'dotenv';
import {formatUnits, parseUnits} from "ethers";
dotenv.config();


async function info(addr: string) {
    console.log("0.04 ether", parseUnits("0.04", "ether"));

    const rd = await hre.ethers.getContractAt("RewardDistributor", addr);

    console.log(`RewardToken: ${await rd.rewardToken()}`)
    console.log(`PosterFee: ${formatUnits(await rd.posterFee(), "ether")} eth`);
}

async function main() {
    const addr = "0x9de82e19b14f2f9be115dec63dd24d611d2b06bc ";

    console.log("Current height: ", await hre.ethers.provider.getBlockNumber())

    info(addr);
}

main().catch(console.error)