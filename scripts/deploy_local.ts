import hre from "hardhat";
import RewardDistributorSingletonModule from "../ignition/modules/RewardDistributorSingleton";
import RewardDistributorFactoryModule from "../ignition/modules/RewardDistributorFacotry";
import {HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";
import KwilMockToken from "../ignition/modules/KwilMockToken";
import {getChainSpecificDefaultSaltNonce} from "../peripheral/lib/reward";
import {parseUnits} from "ethers";

async function deploy_factory(deployer: HardhatEthersSigner)  {
    const { singleton } = await hre.ignition.deploy(RewardDistributorSingletonModule, {
        defaultSender: deployer.address,
        config: {
            requiredConfirmations: 1,
        },
    });

    console.log(`Singleton contract deployed to: ${await singleton.getAddress()}`);
    console.log('Owner address: ', deployer.address);

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

    return {singleton, factory};
}

async function deploy_clone(chainId: number, deployer: HardhatEthersSigner, safeAddr: string, factoryAddr: string) {
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

    const factory= await hre.ethers.getContractAt("RewardDistributorFactory", factoryAddr);

    const predictAddr = await factory.predicateAddr(getChainSpecificDefaultSaltNonce(chainId));
    const txResp = await factory.connect(deployer).create(
        safeAddr, parseUnits("0.001", "ether"), await mockToken.getAddress(), getChainSpecificDefaultSaltNonce(chainId))

    await txResp.wait();

    const newRD = await hre.ethers.getContractAt("RewardDistributor", predictAddr);

    await mockToken.transfer(newRD, parseUnits("1000", "ether"));

    console.log("Contract", await newRD.getAddress());
    console.log("Contract's safe", await newRD.safe());
    console.log("Contract's posterFee", await newRD.posterFee());
    console.log("Contract's rewardToken", await newRD.rewardToken());
    console.log("Contract's initial token balance", await mockToken.balanceOf(newRD));
}

async function main() {
    console.log("Current height: ", await hre.ethers.provider.getBlockNumber())
    console.log("Current chainId: ", hre.network.config.chainId ?? "")
    console.log("Current network: ", hre.network.name)

    const chainId = hre.network.config.chainId ?? 31337;

    const [deployer, fakeSafe] = await hre.ethers.getSigners();

    console.log("deployer", deployer.address)
    console.log("fakeSafe", fakeSafe.address)

    const {singleton, factory} = await deploy_factory(deployer)

    await deploy_clone(chainId, deployer, fakeSafe.address, await factory.getAddress());
}

main().catch(console.error)