import hre from "hardhat";
import KwilMockToken from "../ignition/modules/KwilMockToken";

async function main() {
    console.log("Current height: ", await hre.ethers.provider.getBlockNumber())
    console.log("Current chainId: ", hre.network.config.chainId ?? "")
    console.log("Current network: ", hre.network.name)

    const [deployer] = await hre.ethers.getSigners();
    const {mockToken} = await hre.ignition.deploy(KwilMockToken, {
        defaultSender: deployer.address,
        parameters: {
            KwilMockToken: {
                owner: deployer.address,
            }
        },
        config: {
            requiredConfirmations: 1,
        },
    });

    console.log(`MockToken deployed: ${await mockToken.getAddress()}`);
}

main().catch(console.error)