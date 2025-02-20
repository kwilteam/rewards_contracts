import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("RewardDistributorSingleton", (m) => {
    const singleton = m.contract("RewardDistributor");

    return {singleton};
});
