import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default  buildModule("RewardDistributorFactory", (m) => {
    // const deployer = m.getAccount(0);
    const factory = m.contract("RewardDistributorFactory",
        [m.getParameter("owner"), m.getParameter("imp")],
        // {from: deployer}
    );

    return {factory};
});

// export default RewardDistributorFactoryModule;
