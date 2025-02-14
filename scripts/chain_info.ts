import hre from "hardhat";
import dotenv from 'dotenv';
import {parseUnits} from "ethers";
dotenv.config();


async function main() {
    console.log("0.04 ether", parseUnits("0.04", "ether"));

    const [signer] = await hre.ethers.getSigners();
    console.log("Current height: ", await hre.ethers.provider.getBlockNumber())

    console.log("Signer address: ", signer.address);

}

main().catch(console.error)