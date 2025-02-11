import {parseUnits} from "ethers";
import hre from "hardhat";


async function main() {
    const [deployer] = await hre.ethers.getSigners();

    const tokenAddr = "0x5e4ba745f8444bD1924d5467943C7b6375a09a47";
    const tokenAmt = "1000";
    const recipient = "0xdCb880336A3C37449783a84B23a2Bf245A4e794b";

    const token = await hre.ethers.getContractAt("ERC20", tokenAddr);

    console.log("Recipient's current token balance", await token.balanceOf(recipient));

    const txResp = await token.connect(deployer).transfer(recipient, parseUnits(tokenAmt, "ether"));
    const txReceipt = await txResp.wait();

    console.log("Recipient's new token balance    ", await token.balanceOf(recipient));
}

main().catch(console.error)