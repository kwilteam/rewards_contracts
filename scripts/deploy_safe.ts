import hre from "hardhat";
import Safe, {
    PredictedSafeProps,
    SafeAccountConfig,
} from '@safe-global/protocol-kit'
import {GenHDWallets} from "../peripheral/lib/wallet";
import {HardhatNetworkHDAccountsConfig, HardhatNetworkConfig} from "hardhat/src/types/config";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// This script will deploy a new Gnosis Safe wallet on the forked network.
// Not very useful though if you want to test with Gnosis transaction service,
// as the Gnosis transaction service cannot rewind posted transactions.
async function deploySafe(owners: string[], threshold: number) {
    console.log(`Deploy safe on ${hre.network.name}/${hre.network.config.chainId}`)
    console.log("Current block: ", await hre.ethers.provider.getBlockNumber())

    if (owners.length < 1) {
        throw new Error("Owners cannot be empty");
    }

    if (threshold > owners.length) {
        throw new Error("Threshold cannot be greater than owners");
    }

    if (threshold < 1) {
        throw new Error("Threshold cannot be less than 1");
    }
    owners.map(owner => {
        if (owner === "") {
            throw new Error("Owner cannot be empty");
        }
    })

    let actConfig: HardhatNetworkHDAccountsConfig = hre.network.config.accounts as HardhatNetworkHDAccountsConfig;

    const [deployerWallet] = GenHDWallets(actConfig.mnemonic,1);
    const [deployer] = (await hre.ethers.getSigners());

    const safeAccountConfig: SafeAccountConfig = {
        owners: owners,
        threshold: threshold,
        // More optional properties
    }
    const predictedSafe: PredictedSafeProps = {
        safeAccountConfig
        // More optional properties
    }
    const protocolKit = await Safe.init({
        provider: hre.network.provider,
        signer: deployerWallet.privateKey,
        predictedSafe,
    })

    await delay(1000); // avoid alchemy API choking

    // predicted address
    const safeAddress = await protocolKit.getAddress()
    console.log("Predicted safe address: ", safeAddress);
    const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction()
    const txResp = await deployer.sendTransaction({
        to: deploymentTransaction.to,
        value: BigInt(deploymentTransaction.value),
        data: deploymentTransaction.data as `0x${string}`,
        chainId: hre.network.config.chainId,
    })

    const txReceipt = await txResp.wait()

    const newProtocolKit = await protocolKit.connect({
        safeAddress
    })

    const isSafeDeployed = await newProtocolKit.isSafeDeployed() // True
    const _safeAddress = await newProtocolKit.getAddress()
    const _safeOwners = await newProtocolKit.getOwners()
    const _safeThreshold = await newProtocolKit.getThreshold()

    console.log("Safe deployed: ", isSafeDeployed);
    console.log("Safe address: ", _safeAddress);
    console.log("Safe owners: ", _safeOwners);
    console.log("Safe threshold: ", _safeThreshold);
}

async function main() {
    await deploySafe(
        [""],
        1,
    );
}

main().catch(console.error)