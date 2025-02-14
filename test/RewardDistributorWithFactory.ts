import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import {toBigInt, parseUnits, formatEther, formatUnits, ethers, BaseContract, AbiCoder} from "ethers";
import { zeroAddress } from "ethereumjs-util";
import {IERC20, RewardDistributor, RewardDistributorFactory} from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
    genRewardMerkleTree, getChainSpecificDefaultSaltNonce,
    getMTreeProof,
} from "../peripheral/lib/reward";

// Unit tests for RewardDistributor contract, without using GnosisSafe.
// Thus, the Poster wallet will be acting as safe wallet, i.e.,
// `poster -> rewardContract` instead of `poster -> safe -> rewardContract`
describe("RewardDistributor UnitTest", function () {
    if  (hre.network.name != "hardhat") {
        console.log("Only work on forking network. Skip on network: " + hre.network.name);
        return;
    }

    const chainId = hre.network.config.chainId ?? 31337;
    const deploySalt = getChainSpecificDefaultSaltNonce(chainId);

    // setups
    const emptyRewardRoot = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const posterFee1 = parseUnits("1000000", "gwei")
    const posterFee2 = parseUnits("2000000", "gwei")

    const kwilFirstRewardBlockHash = '0x' + '1'.repeat(64);

    let rewardToken: IERC20;

    let rewardSingleton: RewardDistributor;
    let rewardDistFactory: RewardDistributorFactory;

    // networkOwner: kwil network owner, also the owner of the mock reward token
    let networkOwner: HardhatEthersSigner,
        gnosisSafe: HardhatEthersSigner, // mimic the safe wallet; also act as gnosisSafe
        user1: HardhatEthersSigner,
        user2: HardhatEthersSigner,
        user3: HardhatEthersSigner,
        rewardClaimer: HardhatEthersSigner;

    before(async function () {
        [networkOwner, gnosisSafe,
            user1, user2, user3, rewardClaimer] = await hre.ethers.getSigners();

        const RewardToken = await hre.ethers.getContractFactory("KwilMockToken");
        rewardToken = await RewardToken.connect(networkOwner).deploy(networkOwner);


        const RewardDist = await hre.ethers.getContractFactory("RewardDistributor");
        rewardSingleton = await RewardDist.connect(networkOwner).deploy();

        const RewardDistFactory = await hre.ethers.getContractFactory("RewardDistributorFactory");
        rewardDistFactory = await RewardDistFactory.connect(networkOwner).deploy(networkOwner, rewardSingleton);
    });

    // ------------

    async function beforeDeployRewardContractFixture() {
        // need to make a tx
        await user1.sendTransaction({to: user1.address, value: parseUnits("0.1", "ether")});
    }

    async function deployRewardContractFixture() {
        await loadFixture(beforeDeployRewardContractFixture);

        const predictAddr = await rewardDistFactory.predicateAddr(deploySalt);
        console.log("deploy rd predictAddr: ++++", predictAddr);
        const txResp = await rewardDistFactory.connect(networkOwner).create(
            gnosisSafe, posterFee1, await rewardToken.getAddress(), deploySalt);
        await txResp.wait();

        const rewardDist = await hre.ethers.getContractAt("RewardDistributor", predictAddr);

        return {rewardDist, posterFee: posterFee1, rewardToken};
    }

    describe("Deployment", function(){
        it("Should revert if invalid safe(empty address)", async function(){
            await expect(rewardDistFactory.connect(networkOwner).create(
                zeroAddress(), posterFee1, rewardToken, deploySalt)).to.be.revertedWith("ZERO ADDRESS");
        })

        it("Should revert if invalid rewardToken(empty address)", async function(){
            await expect(rewardDistFactory.connect(networkOwner).create(
                gnosisSafe, posterFee1, zeroAddress(), deploySalt)).to.be.revertedWith("ZERO ADDRESS");
        })

        it("Should revert if posterFee = 0", async function(){
            await expect(rewardDistFactory.connect(networkOwner).create(
                gnosisSafe, 0, rewardToken, deploySalt)).to.be.revertedWith("PostFee zero");
        })

        it("Should create same reward contract with same salt", async function(){
            const {rewardDist, posterFee, rewardToken} = await loadFixture(deployRewardContractFixture);

            expect(await rewardDist.rewardToken()).changeTokenBalance(rewardToken, rewardDist, 0);
            expect(await rewardDist.posterFee()).to.equal(posterFee);
            expect(await rewardDist.rewardToken()).to.equal(rewardToken);
            expect(await rewardDist.safe()).to.equal(gnosisSafe.address);

            const {rewardDist:rewardDist1} = await loadFixture(deployRewardContractFixture);
            expect(rewardDist1).to.equal(rewardDist);
        })

        it("Should init correctly", async function(){
            const {rewardDist, posterFee, rewardToken} = await loadFixture(deployRewardContractFixture);

            expect(await rewardDist.rewardToken()).changeTokenBalance(rewardToken, rewardDist, 0);
            expect(await rewardDist.posterFee()).to.equal(posterFee);
            expect(await rewardDist.rewardToken()).to.equal(rewardToken);
            expect(await rewardDist.safe()).to.equal(gnosisSafe.address);
        });
    });

    async function deployRewardContractAndFund1000TokenFixture() {
        const {rewardDist, posterFee, rewardToken} = await loadFixture(deployRewardContractFixture);
        await rewardToken.transfer((await rewardDist.getAddress()), parseUnits("1000", "ether"));
        return {rewardDist, posterFee, rewardToken};
    }

    // post the very first reward, with total 400 on three users
    async function postFirstRewardFixture() {
        const {rewardDist} = await loadFixture(deployRewardContractAndFund1000TokenFixture);

        const contractOldTokenBalance = await rewardToken.balanceOf(rewardDist)
        const oldPostedRewards = await rewardDist.postedRewards();

        // generate first reward merkle tree
        const _firstTree = genRewardMerkleTree([user1.address, user2.address, user3.address],
            [100,200,100], await rewardDist.getAddress(), kwilFirstRewardBlockHash.toString());
        const reward = {tree: _firstTree.tree, root: _firstTree.tree.root, amount: _firstTree.amount, user1Amount: 100};

        const txResp = await rewardDist.connect(gnosisSafe).postReward(
            reward.root,
            reward.amount)

        return {rewardDist, reward, txResp, contractOldTokenBalance, oldPostedRewards};
    }

    // post the very first reward, with total 400 on three users. But the contract has not been funded.
    async function postFirstRewardToNotFundedContractFixture() {
        const {rewardDist} = await loadFixture(deployRewardContractFixture);

        const contractOldTokenBalance = await rewardToken.balanceOf(rewardDist)

        // generate first reward merkle tree
        const _firstTree = genRewardMerkleTree([user1.address, user2.address, user3.address],
            [100,200,100], await rewardDist.getAddress(), kwilFirstRewardBlockHash.toString());
        const reward = {tree: _firstTree.tree, root: _firstTree.tree.root, amount: _firstTree.amount};

        const txResp =  await rewardDist.connect(gnosisSafe).postReward(
            reward.root,
            reward.amount)

        return {rewardDist, reward, txResp, contractOldTokenBalance};
    }

    describe("Post reward", function(){
        it("Should revert if transaction is not send from safe", async function(){
            const {rewardDist} = await loadFixture(deployRewardContractAndFund1000TokenFixture);
            await expect(rewardDist.connect(networkOwner).postReward(emptyRewardRoot, 0))
                .to.be.revertedWith("Not allowed");
        });

        it("Should revert if totalAmount is zero", async function(){
            const {rewardDist} = await loadFixture(deployRewardContractAndFund1000TokenFixture);
            await expect(rewardDist.connect(gnosisSafe).postReward(emptyRewardRoot, 0))
                .to.be.revertedWith("Total amount zero");
        });

        it("Should revert if reward root already posted (or replay)", async function(){
            const {rewardDist, reward} = await loadFixture(postFirstRewardFixture);

            await expect(rewardDist.connect(gnosisSafe).postReward(reward.root, reward.amount))
                .to.be.revertedWith("Already posted");
        });

        it("Should revert if reward amount exceeds contract balance", async function(){
            const {rewardDist} = await loadFixture(deployRewardContractAndFund1000TokenFixture);

            const totalRewardBalance = await rewardToken.balanceOf(await rewardDist.getAddress());
            expect(totalRewardBalance).to.equal(parseUnits("1000", "ether"));

            await expect(rewardDist.connect(gnosisSafe).postReward(emptyRewardRoot, parseUnits("1001", "ether")))
                .to.be.revertedWith("Insufficient contract reward balance");
        });

        it("Should succeed", async function(){
            const {rewardDist, reward, txResp, contractOldTokenBalance, oldPostedRewards} = await loadFixture(postFirstRewardFixture);

            await expect(txResp.wait())
                .to.emit(rewardDist, "RewardPosted")
                .withArgs(reward.root, reward.amount, gnosisSafe);
            expect(await rewardDist.rewardPoster(reward.root)).to.equal(gnosisSafe.address);
            expect(await rewardDist.postedRewards()).to.equal(reward.amount + oldPostedRewards);
            expect(await rewardDist.unpostedRewards()).to.equal(contractOldTokenBalance - reward.amount);
        });
    });

    async function claimUser1FirstRewardFixture() {
        const {rewardDist, reward} = await loadFixture(postFirstRewardFixture);

        const claimerOldBalance = await hre.ethers.provider.getBalance(rewardClaimer.address);
        const posterOldBalance = await hre.ethers.provider.getBalance(gnosisSafe.address);
        const oldTotalPostedReward = await rewardDist.postedRewards();
        const recipient = user1.address;
        const recipientOldTokenBalance = await rewardToken.balanceOf(recipient);
        const contractOldTokenBalance = await rewardToken.balanceOf(rewardDist)

        const amount = toBigInt(reward.user1Amount);
        const {proof, leaf} = getMTreeProof(reward.tree, recipient);
        const minEthValue = await rewardDist.posterFee();
        const txResp = await rewardDist.connect(rewardClaimer).claimReward(
            recipient, amount, kwilFirstRewardBlockHash, reward.root, proof, {value: minEthValue});
        return {rewardDist, rewardRoot: reward.root, proof, leaf, recipient, rewardClaimer, amount, txResp,
            paid: minEthValue, claimerOldBalance, posterOldBalance, oldTotalPostedReward,
            recipientOldTokenBalance, contractOldTokenBalance};
    }

    async function claimUser1FirstRewardPay2xFixture() {
        const {rewardDist, reward} = await loadFixture(postFirstRewardFixture);

        const claimerOldBalance = await hre.ethers.provider.getBalance(rewardClaimer.address);
        const posterOldBalance = await hre.ethers.provider.getBalance(gnosisSafe.address);
        const oldTotalPostedReward = await rewardDist.postedRewards();
        const recipient = user1.address;
        const recipientOldTokenBalance = await rewardToken.balanceOf(recipient);
        const contractOldTokenBalance = await rewardToken.balanceOf(rewardDist)

        const amount = toBigInt(100); // need to be the same as what's in the tree.
        const {proof, leaf} = getMTreeProof(reward.tree, recipient);
        const minEthValue = await rewardDist.posterFee();
        const txResp = await rewardDist.connect(rewardClaimer).claimReward(
            recipient, amount,kwilFirstRewardBlockHash, reward.root, proof, {value: minEthValue * toBigInt(2)});

        return {rewardDist, rewardRoot: reward.root, leaf, recipient, rewardClaimer, amount, txResp,
            paid2x: minEthValue*toBigInt(2), claimerOldBalance, posterOldBalance, oldTotalPostedReward,
            recipientOldTokenBalance, contractOldTokenBalance};
    }

    describe("Claim reward", function () {
        it("Should revert if reward root is not posted", async () => {
            const {rewardDist} = await loadFixture(postFirstRewardFixture);

            await expect(rewardDist.connect(rewardClaimer).claimReward(
                user1.address, 100, kwilFirstRewardBlockHash, emptyRewardRoot, [], {value: 10})).to.be.revertedWith("Reward root not posted");
        });

        it("Should revert if reward already claimed", async function(){
            const {rewardDist, rewardRoot, proof, txResp, recipient, amount, paid} = await loadFixture(claimUser1FirstRewardFixture);
            await expect(txResp.wait()).to.emit(rewardDist, "RewardClaimed").withArgs(recipient, amount, rewardClaimer);

            await expect(rewardDist.connect(rewardClaimer).claimReward(
                recipient, amount, kwilFirstRewardBlockHash, rewardRoot, proof, {value: paid})).to.be.revertedWith("Reward already claimed");
        });

        it("Should revert if invalid proof(wrong leaf)", async () => {
            const {rewardDist, reward} = await loadFixture(postFirstRewardFixture);

            const recipient = user1.address;
            const amount = toBigInt(50); // not the same as in leaf
            const {proof, leaf} = getMTreeProof(reward.tree, recipient);
            const minEthValue = await rewardDist.posterFee();

            await expect(rewardDist.connect(rewardClaimer).claimReward(
                recipient, amount, kwilFirstRewardBlockHash, reward.root, proof, {value: minEthValue})).to.be.revertedWith("Invalid proof");
        });

        it("Should revert if invalid proof(wrong proof)", async () => {
            const {rewardDist, reward} = await loadFixture(postFirstRewardFixture);

            const recipient = user1.address;
            const amount = toBigInt(100);
            const minEthValue = await rewardDist.posterFee();

            await expect(rewardDist.connect(rewardClaimer).claimReward(
                recipient, amount, kwilFirstRewardBlockHash, reward.root, [], {value: minEthValue})).to.be.revertedWith("Invalid proof");
        })

        it("Should revert if insufficient payment", async () => {
            const {rewardDist, reward} = await loadFixture(postFirstRewardFixture);

            const recipient = user1.address;
            const amount = toBigInt(100);
            const {proof, leaf} = getMTreeProof(reward.tree, recipient);
            const minEthValue = await rewardDist.posterFee();

            await expect(rewardDist.connect(rewardClaimer).claimReward(
                recipient, amount, kwilFirstRewardBlockHash, reward.root, proof, {value: minEthValue - toBigInt(1000)}))
                .to.be.revertedWith("Insufficient payment for poster");
        })

        // TODO: revert if transfer/refund failed, maybe due to insufficient eth balance to continue execute.

        it("Should succeed", async function(){
            const {rewardDist, rewardRoot, leaf, recipient, rewardClaimer, amount, txResp,
                paid, claimerOldBalance, posterOldBalance, oldTotalPostedReward,
                recipientOldTokenBalance, contractOldTokenBalance} = await loadFixture(claimUser1FirstRewardFixture);
            const txReceipt = await txResp.wait();
            expect(txReceipt).to.emit(rewardDist, "RewardClaimed").withArgs(recipient, amount, rewardClaimer);

            // @ts-ignore
            expect(await hre.ethers.provider.getBalance(rewardClaimer.address))
                .to.equal(claimerOldBalance - paid - txReceipt!.fee);
            expect(await hre.ethers.provider.getBalance(gnosisSafe.address))
                .to.equal(posterOldBalance + paid);
            expect(await rewardDist.isRewardClaimed(rewardRoot, leaf)).to.equal(true);
            expect(await rewardDist.postedRewards()).to.equal(oldTotalPostedReward - amount);
            expect(await rewardToken.balanceOf(recipient)).to.equal(recipientOldTokenBalance + amount);
            expect(await rewardToken.balanceOf(rewardDist)).to.equal(contractOldTokenBalance - amount);
        })

        it("Should succeed with refund", async function(){
            const {rewardDist, rewardRoot, leaf, recipient, rewardClaimer, amount, txResp,
                paid2x, claimerOldBalance, posterOldBalance, oldTotalPostedReward,
                recipientOldTokenBalance, contractOldTokenBalance} = await loadFixture(claimUser1FirstRewardPay2xFixture);
            const txReceipt = await txResp.wait();

            expect(txReceipt).to.emit(rewardDist, "RewardClaimed").withArgs(recipient, rewardClaimer, amount);
            // @ts-ignore
            expect(await hre.ethers.provider.getBalance(rewardClaimer.address))
                .to.equal(claimerOldBalance - paid2x/toBigInt(2) - txReceipt!.fee);
            expect(await hre.ethers.provider.getBalance(gnosisSafe.address))
                .to.equal(posterOldBalance + paid2x/toBigInt(2));
            expect(await rewardDist.isRewardClaimed(rewardRoot, leaf)).to.equal(true);
            expect(await rewardDist.postedRewards()).to.equal(oldTotalPostedReward - amount);
            expect(await rewardToken.balanceOf(recipient)).to.equal(recipientOldTokenBalance + amount);
            expect(await rewardToken.balanceOf(rewardDist)).to.equal(contractOldTokenBalance - amount);
        })
    })

    async function updatePosterFeeFixture() {
        const {rewardDist} = await loadFixture(deployRewardContractFixture);

        const oldFee = await rewardDist.posterFee();
        const newFee = posterFee2;
        const txResp = await rewardDist.connect(gnosisSafe).updatePosterFee(newFee);
        return {rewardDist, oldFee, newFee, txResp};
    };

    describe("Update poster fee", () => {
        it("Should revert if not from safe wallet", async () => {
            const {rewardDist} = await loadFixture(deployRewardContractFixture);

            await expect(rewardDist.connect(networkOwner).updatePosterFee(0)).to.be.revertedWith("Not allowed");
        });

        it("Should revert if fee is 0", async () => {
            const {rewardDist} = await loadFixture(deployRewardContractFixture);

            await expect(rewardDist.connect(gnosisSafe).updatePosterFee(0)).to.be.revertedWith("Fee zero");
        });

        it("Should succeed", async function(){
            const {rewardDist, oldFee, newFee, txResp} = await loadFixture(updatePosterFeeFixture);

            await expect(txResp.wait()).to.emit(rewardDist, "PosterFeeUpdated").withArgs(oldFee, newFee);
            expect(await rewardDist.posterFee()).to.equal(newFee);
        });
    });

    describe("Transfer eth", function (){
        it("Should revert if transfer eth with msg.data", async function() {
            const {rewardDist} = await loadFixture(deployRewardContractFixture);
            await expect(networkOwner.sendTransaction({
                to: rewardDist,
                value: parseUnits("1", "ether"),
                data: "0x00",
            })).to.revertedWith("Ether transfers not allowed");
        });
        it("Should revert if transfer eth without msg.data", async function() {
            const {rewardDist} = await loadFixture(deployRewardContractFixture);
            await expect(networkOwner.sendTransaction({
                to: rewardDist,
                value: parseUnits("1", "ether"),
            })).to.revertedWith("Ether transfers not allowed");
        });
    });


    async function testGasFee(threshold: number) {
        console.log("With threshold(also merkle tree leafs) = ", threshold);
        const _signers = await hre.ethers.getSigners();
        const allSigners = _signers.slice(0, threshold);
        const allSignerAddrs = allSigners.map(signer => signer.address);
        const allAmounts = allSigners.map((_, i) => (i+1)*100);

        // deploy reward contract
        const predictAddr = await rewardDistFactory.predicateAddr(deploySalt);
        const txResp = await rewardDistFactory.connect(networkOwner).create(
            gnosisSafe, posterFee1, await rewardToken.getAddress(), deploySalt);
        const createTxReceipt = await txResp.wait();
        const rewardDist = await hre.ethers.getContractAt("RewardDistributor", predictAddr);

        console.log(`Create contract     `, formatEther(createTxReceipt!.fee),
            ` ether = ${createTxReceipt!.gasUsed} * ${formatUnits(createTxReceipt!.gasPrice, 'gwei')} gwei`);

        // fund reward contract
        await rewardToken.transfer((await rewardDist.getAddress()), parseUnits("1000", "ether"));

        // post reward
        const _firstTree = genRewardMerkleTree(
            allSignerAddrs,
            allAmounts, await rewardDist.getAddress(), kwilFirstRewardBlockHash.toString());
        const reward = {tree: _firstTree.tree, root: _firstTree.tree.root, amount: _firstTree.amount};
        const postRewardTxResp = await rewardDist.connect(gnosisSafe).postReward(
            reward.root,
            reward.amount,);
        const postRewardTxReceipt = await postRewardTxResp.wait();

        console.log(`Post reward Fee     `, formatEther(postRewardTxReceipt!.fee),
            ` ether = ${postRewardTxReceipt!.gasUsed} * ${formatUnits(postRewardTxReceipt!.gasPrice, 'gwei')} gwei`);

        // claim reward (threshold doesn't matter, tree structure matters)
        const recipient = allSignerAddrs[2];
        const amount = toBigInt(300); // need to be the same as what's in the tree.
        const {proof, leaf} = getMTreeProof(reward.tree, recipient);
        const minEthValue = await rewardDist.posterFee();
        const claimRewardTxResp = await rewardDist.connect(rewardClaimer).claimReward(
            recipient, amount, kwilFirstRewardBlockHash, reward.root, proof, {value: minEthValue});
        const claimRewardTxReceipt = await claimRewardTxResp.wait();

        console.log(`Claim reward Fee    `, formatEther(claimRewardTxReceipt!.fee),
            ` ether = ${claimRewardTxReceipt!.gasUsed} * ${formatUnits(claimRewardTxReceipt!.gasPrice, 'gwei')} gwei`);

        // update poster fee
        const fee = posterFee2;
        const updatePosterFeeTxResp = await rewardDist.connect(gnosisSafe).updatePosterFee(fee);
        const updatePosterFeeTxReceipt = await updatePosterFeeTxResp.wait();

        console.log(`Update posterFee Fee`, formatEther(updatePosterFeeTxReceipt!.fee),
            ` ether = ${updatePosterFeeTxReceipt!.gasUsed} * ${formatUnits(updatePosterFeeTxReceipt!.gasPrice, 'gwei')} gwei`);
    }

    // This is not a test, it just shows the gas cost with different threshold signature.
    // To simplify, `threshold` equals `len(merkle tree leafs)`
    describe("Gas Fee without GnosisSafe", function () {
        it("threshold 20", async ()=>{
            await loadFixture(beforeDeployRewardContractFixture);
            // console.log("current block number = ", await hre.ethers.provider.getBlockNumber());

            await testGasFee(20);
        });

        it("threshold 10", async ()=>{
            await loadFixture(beforeDeployRewardContractFixture);
            // console.log("current block number = ", await hre.ethers.provider.getBlockNumber());

            await testGasFee(10);
        });

        it("threshold 5", async ()=>{
            await loadFixture(beforeDeployRewardContractFixture);
            // console.log("current block number = ", await hre.ethers.provider.getBlockNumber());

            await testGasFee(5);
        });
    })

    // hardhat config:
    //   solidity: {
    //     version: "0.8.27",
    //     settings: {
    //       optimizer: {
    //         enabled: true,
    //         runs: 200
    //       },
    //       evmVersion: `paris`, // https://github.com/NomicFoundation/hardhat/issues/4232
    //     }
    //   },
    //
    //         Gas Fee without GnosisSafe
    // With threshold(also merkle tree leafs) =  20
    // 0xf0964db39931fd46285056828d1fada99d8daf46
    // Create contract      0.000142783  ether = 142783 * 1.0 gwei
    // Post reward Fee      0.0000809  ether = 80900 * 1.0 gwei
    // Claim reward Fee     0.000130528  ether = 130528 * 1.0 gwei
    // Update posterFee Fee 0.000032681  ether = 32681 * 1.0 gwei
    //       ✔ threshold 20
    // With threshold(also merkle tree leafs) =  10
    // 0xf0964db39931fd46285056828d1fada99d8daf46
    // Create contract      0.000142783  ether = 142783 * 1.0 gwei
    // Post reward Fee      0.0000809  ether = 80900 * 1.0 gwei
    // Claim reward Fee     0.000129775  ether = 129775 * 1.0 gwei
    // Update posterFee Fee 0.000032681  ether = 32681 * 1.0 gwei
    //       ✔ threshold 10
    // With threshold(also merkle tree leafs) =  5
    // 0xf0964db39931fd46285056828d1fada99d8daf46
    // Create contract      0.000142783  ether = 142783 * 1.0 gwei
    // Post reward Fee      0.0000809  ether = 80900 * 1.0 gwei
    // Claim reward Fee     0.000129  ether = 129000 * 1.0 gwei
    // Update posterFee Fee 0.000032681  ether = 32681 * 1.0 gwei
    //       ✔ threshold 5
    //
});


// This if goimpl reference.
describe("OpenZeppelin Sign message", () => {
    it("Should have expect signature", async () => {
        const msg = "sosup";
        const [n, signer1] = await hre.ethers.getSigners();

        expect(await signer1.signMessage(msg)).to.equal("0x1fc551d4d1f0901b64432dc59f372beb231adfa2021e1fa5a2cc314df7d98f114ff8afa4603ceee05f768532b615807df8ac358b64b318baaeef5237301240771b")
    });
})
