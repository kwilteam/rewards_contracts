import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("RewardDistributorSingleton", (m) => {
    // const deployer = m.getAccount(0);
    // const rd = m.contract("RewardDistributor",
    //     [m.getParameter("safe"), m.getParameter("posterFee"), m.getParameter("rewardToken")],
    //     // {from: deployer}
    // );

    const singleton = m.contract("RewardDistributor");

    return {singleton};
});

// export default RewardDistributorSingletonModule;
