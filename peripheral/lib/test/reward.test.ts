import { expect } from "chai";
import { keccak256, toQuantity } from "ethers";
import fs from "fs";
import {MerkleTree} from "merkletreejs";

import {
    genRewardMerkleTree,
    getMTreeProof,
    genRewardLeaf,
    genPostRewardTxData
} from "../reward";


// mtjs is a demonstration using merkletreejs to generate OpenZeppelin compatible tree
function mtjs(): string {
    const networkOwner = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const user1 = "0x976EA74026E726554dB657fA54763abd0C3a0aa9";
    const user2 = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955";
    const user3 = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f";
    const user4 = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720";
    const contract = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

    const kwilBlockHash = '0x' + '1'.repeat(64);

    const l1 = genRewardLeaf(user1, "100", contract, kwilBlockHash);
    const l2 = genRewardLeaf(user2, "200", contract, kwilBlockHash);
    const l3 = genRewardLeaf(user3, "100", contract, kwilBlockHash);

    const leaves = [l1,l2,l3];
    // the OpenZeppelin Standard Merkle Tree uses an opinionated double leaf hashing algorithm
    // and the odd leaf is unchanged and be used for next pairing.
    // So any Go/JS library has similar implementation should be compatible.
    const tree = new MerkleTree(leaves, keccak256, { hashLeaves: true, sortLeaves: true, sortPairs: true})
    // console.log("tree--", tree.toString()) // show the tree structure
    const root = tree.getRoot().toString('hex')
    return root
}

describe("MerkleTree", function () {
    // same as hardhat signers
    const networkOwner = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const user1 = "0x976EA74026E726554dB657fA54763abd0C3a0aa9";
    const user2 = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955";
    const user3 = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f";
    const user4 = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720";
    const user5 = "0xBcd4042DE499D14e55001CcbB24a551F3b954096";
    const contract = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

    const treeLeafs3 = `{"format":"standard-v1","leafEncoding":["address","uint256","address","bytes32"],"tree":["0xe36a471baa3e0c7b7d0cd9760fcb034a1e407e871ba2c7b5b0e893599726a1ce","0x103b40fa3ff3c0e485a3db71b76bc042d37ec423f8c8d7434158505860b4f4cf","0x82219da5ff9a5ea9e35efdbe1e5a3d01d82c86fc892d8f0d038697fec7ba8227","0x644f999664d65d1d2a3feefade54d643dc2b9696971e9070c36f0ec788e55f5b","0x231c2dd2ffc144d64393fc3272162eaacbb2ee3e998c2bd67f57dfc32b791315"],"values":[{"value":["0x976EA74026E726554dB657fA54763abd0C3a0aa9","100","0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512","0x1111111111111111111111111111111111111111111111111111111111111111"],"treeIndex":3},{"value":["0x14dC79964da2C08b23698B3D3cc7Ca32193d9955","200","0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512","0x1111111111111111111111111111111111111111111111111111111111111111"],"treeIndex":4},{"value":["0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f","100","0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512","0x1111111111111111111111111111111111111111111111111111111111111111"],"treeIndex":2}]}`;
    const treeLeafs4 = `{"format":"standard-v1","leafEncoding":["address","uint256","address","bytes32"],"tree":["0x4b3a147975c7ab8323d6d0f9f53676da6aedda99cedec4cf65591523d4ef2375","0x7b13c67e72aef776185910769cd2eb4133917ed5b1f0c8f7213d8c8ee7e0b35d","0x103b40fa3ff3c0e485a3db71b76bc042d37ec423f8c8d7434158505860b4f4cf","0xb0104dd20dedc5a758a1445cbf0e20c3afbeb1868a2f239520f3defcc356dae4","0x82219da5ff9a5ea9e35efdbe1e5a3d01d82c86fc892d8f0d038697fec7ba8227","0x644f999664d65d1d2a3feefade54d643dc2b9696971e9070c36f0ec788e55f5b","0x231c2dd2ffc144d64393fc3272162eaacbb2ee3e998c2bd67f57dfc32b791315"],"values":[{"value":["0x976EA74026E726554dB657fA54763abd0C3a0aa9","100","0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512","0x1111111111111111111111111111111111111111111111111111111111111111"],"treeIndex":5},{"value":["0x14dC79964da2C08b23698B3D3cc7Ca32193d9955","200","0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512","0x1111111111111111111111111111111111111111111111111111111111111111"],"treeIndex":6},{"value":["0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f","100","0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512","0x1111111111111111111111111111111111111111111111111111111111111111"],"treeIndex":4},{"value":["0xa0Ee7A142d267C1f36714E4a8F75612F20a79720","200","0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512","0x1111111111111111111111111111111111111111111111111111111111111111"],"treeIndex":3}]}`;
    const treeLeafs5 = `{"format":"standard-v1","leafEncoding":["address","uint256","address","bytes32"],"tree":["0xc77e670bf878bdab7c70ad0709f8ad63db53e96ec3d12043ca93ea2b5991b76d","0x8d356f223c2b28319687d22a5c6818f2045837481a58c31047124f3c81bdeabf","0x7b13c67e72aef776185910769cd2eb4133917ed5b1f0c8f7213d8c8ee7e0b35d","0x103b40fa3ff3c0e485a3db71b76bc042d37ec423f8c8d7434158505860b4f4cf","0xfcc5bdb85d3a66a2eebd787677b2aedc61216ebe25a4b2feb16c0084b9254e4a","0xb0104dd20dedc5a758a1445cbf0e20c3afbeb1868a2f239520f3defcc356dae4","0x82219da5ff9a5ea9e35efdbe1e5a3d01d82c86fc892d8f0d038697fec7ba8227","0x644f999664d65d1d2a3feefade54d643dc2b9696971e9070c36f0ec788e55f5b","0x231c2dd2ffc144d64393fc3272162eaacbb2ee3e998c2bd67f57dfc32b791315"],"values":[{"value":["0x976EA74026E726554dB657fA54763abd0C3a0aa9","100","0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512","0x1111111111111111111111111111111111111111111111111111111111111111"],"treeIndex":7},{"value":["0x14dC79964da2C08b23698B3D3cc7Ca32193d9955","200","0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512","0x1111111111111111111111111111111111111111111111111111111111111111"],"treeIndex":8},{"value":["0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f","100","0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512","0x1111111111111111111111111111111111111111111111111111111111111111"],"treeIndex":6},{"value":["0xa0Ee7A142d267C1f36714E4a8F75612F20a79720","200","0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512","0x1111111111111111111111111111111111111111111111111111111111111111"],"treeIndex":5},{"value":["0xBcd4042DE499D14e55001CcbB24a551F3b954096","100","0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512","0x1111111111111111111111111111111111111111111111111111111111111111"],"treeIndex":4}]}`;

    const kwilBlockHash = '0x' + '1'.repeat(64);

    it("Should generate a merkle tree leaf", async () => {
        const l1 = genRewardLeaf(user1, "100", contract, kwilBlockHash);
        expect(toQuantity(l1)).to.equal("0x9a2c5c61e9e86d1d1a61c4990be44a1236b9c562b4677da0ac92f122aef6518");

        const l2 = genRewardLeaf(user2, "200", contract, kwilBlockHash);
        expect(toQuantity(l2)).to.equal("0x6cb5c5a227d38526f9e059d8b4f427e231f2f406f8e425d72de78da9d48c0094");

        const l3 = genRewardLeaf(user3, "100", contract, kwilBlockHash);
        expect(toQuantity(l3)).to.equal("0x9df4692259102c9019b0f84ab62c0ba161d1fd836bf0a0c748853a03479c2d23");

        const t = genRewardMerkleTree(
            [user1, user2, user3], [100, 200, 100], contract, kwilBlockHash);
        expect(t.tree.root).to.equal("0xe36a471baa3e0c7b7d0cd9760fcb034a1e407e871ba2c7b5b0e893599726a1ce"); // same as mtjs output
        expect(mtjs()).to.equal("e36a471baa3e0c7b7d0cd9760fcb034a1e407e871ba2c7b5b0e893599726a1ce");
    })

    it("Should generate a merkle tree with 3 leafs", async () => {
        const t = genRewardMerkleTree(
            [user1, user2, user3], [100, 200, 100], contract, kwilBlockHash);
        expect(JSON.stringify(t.tree.dump())).to.equal(treeLeafs3);
        expect(t.tree.root).to.equal("0xe36a471baa3e0c7b7d0cd9760fcb034a1e407e871ba2c7b5b0e893599726a1ce"); // same as mtjs output

        const p = getMTreeProof(t.tree, user2)
        expect(p.proof).to.deep.equal([
            '0x644f999664d65d1d2a3feefade54d643dc2b9696971e9070c36f0ec788e55f5b',
            '0x82219da5ff9a5ea9e35efdbe1e5a3d01d82c86fc892d8f0d038697fec7ba8227'
        ]);
        expect(p.leaf).to.equal('0x231c2dd2ffc144d64393fc3272162eaacbb2ee3e998c2bd67f57dfc32b791315');
    });
    it("Should generate a merkle tree with 4 leafs", async () => {
        const t = genRewardMerkleTree(
            [user1, user2, user3, user4], [100, 200, 100, 200], contract, kwilBlockHash);
        expect(JSON.stringify(t.tree.dump())).to.equal(treeLeafs4);
        expect(t.tree.root).to.equal("0x4b3a147975c7ab8323d6d0f9f53676da6aedda99cedec4cf65591523d4ef2375");

        const p = getMTreeProof(t.tree, user2)
        expect(p.proof).to.deep.equal([
            '0x644f999664d65d1d2a3feefade54d643dc2b9696971e9070c36f0ec788e55f5b',
            '0x7b13c67e72aef776185910769cd2eb4133917ed5b1f0c8f7213d8c8ee7e0b35d'
        ]);
        expect(p.leaf).to.equal('0x231c2dd2ffc144d64393fc3272162eaacbb2ee3e998c2bd67f57dfc32b791315');
    });
    it("Should generate a merkle tree with 5 leafs", async () => {
        const t = genRewardMerkleTree(
            [user1, user2, user3, user4, user5], [100, 200, 100, 200, 100], contract, kwilBlockHash);
        expect(JSON.stringify(t.tree.dump())).to.equal(treeLeafs5);
        expect(t.tree.root).to.equal("0xc77e670bf878bdab7c70ad0709f8ad63db53e96ec3d12043ca93ea2b5991b76d");

        const p = getMTreeProof(t.tree, user2)
        expect(p.proof).to.deep.equal([
            '0x644f999664d65d1d2a3feefade54d643dc2b9696971e9070c36f0ec788e55f5b',
            '0xfcc5bdb85d3a66a2eebd787677b2aedc61216ebe25a4b2feb16c0084b9254e4a',
            '0x7b13c67e72aef776185910769cd2eb4133917ed5b1f0c8f7213d8c8ee7e0b35d'
        ]);
        expect(p.leaf).to.equal('0x231c2dd2ffc144d64393fc3272162eaacbb2ee3e998c2bd67f57dfc32b791315');
    });
})

// Tests for genPostRewardTxData
describe("genPostRewardTxData", () => {
    const root = "0x2b99d11a9a089537b17930650ae00cadce38788df0b095c1e9f350d7088d24bb";
    const functionSelector = "0xeb630dd3";

    it("Should generate correct tx data with number amount", () => {
        const txData = genPostRewardTxData(root, 100);
        // First 4 bytes are function selector for postReward(bytes32,uint256)
        expect(txData.slice(0,10)).to.equal(functionSelector);
        // Remaining data contains encoded root and amount parameters
        expect(txData.length).to.equal(138); // 0x + function selector + 32 bytes root + 32 bytes amount

        expect(txData).to.equal("0xeb630dd32b99d11a9a089537b17930650ae00cadce38788df0b095c1e9f350d7088d24bb0000000000000000000000000000000000000000000000000000000000000064");
    });

    it("Should generate correct tx data with string amount", () => {
        const txData = genPostRewardTxData(root, "200");
        expect(txData.slice(0,10)).to.equal(functionSelector);
        expect(txData.length).to.equal(138); // 0x + function selector + 32 bytes root + 32 bytes amount
        expect(txData).to.equal("0xeb630dd32b99d11a9a089537b17930650ae00cadce38788df0b095c1e9f350d7088d24bb00000000000000000000000000000000000000000000000000000000000000c8");
    });

    it("Should handle large numbers correctly", () => {
        const txData = genPostRewardTxData(root, "1000000000000000000"); // 1 ETH in wei
        expect(txData.slice(0,10)).to.equal(functionSelector);
        expect(txData.length).to.equal(138); // 0x + function selector + 32 bytes root + 32 bytes amount
        expect(txData).to.equal("0xeb630dd32b99d11a9a089537b17930650ae00cadce38788df0b095c1e9f350d7088d24bb0000000000000000000000000000000000000000000000000de0b6b3a7640000");
    });
});