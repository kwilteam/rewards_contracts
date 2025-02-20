// This file contains types/functions related to the reward extension.
import {keccak256, AbiCoder, toBigInt, getBytes, Interface, BigNumberish, ethers} from "ethers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { standardLeafHash } from "@openzeppelin/merkle-tree/dist/hashes";
import {assert} from "chai";
import {NodeKwil, Utils} from "@kwilteam/kwil-js";

const MerkleLeafEncoding = ["address", "uint256", "address", "bytes32"];

export const PREDETERMINED_SALT_NONCE = keccak256(stringToUtf8Bytes('Kwil Reward Distributor'));

// Utility function to convert a string to UTF-8 bytes
function stringToUtf8Bytes(input: string): Uint8Array {
    return new TextEncoder().encode(input);
}

function getChainSpecificDefaultSaltNonce(chainId: number): string {
    return keccak256(stringToUtf8Bytes(PREDETERMINED_SALT_NONCE + chainId.toString()))
}

function getChainSpecificSaltNonce(chainId: string, deployer: string, deployerNonce: string): string {
    return keccak256(stringToUtf8Bytes(PREDETERMINED_SALT_NONCE + chainId + deployer + deployerNonce))
}

// generate a reward merkle tree with each leaf as `(recipient, amount, contract_address, kwil_block_hash)`
function genRewardMerkleTree(users: string[], amounts: number[], rewardContract: string, kwilBlockHash: string): {tree: StandardMerkleTree<any>, amount: bigint} {
    assert(users.length === amounts.length, "users and amounts should have the same length");
    const values: any[][] = users.map((user, index): any[] => [user, amounts[index].toString(), rewardContract, kwilBlockHash]);
    const tree = StandardMerkleTree.of(values, MerkleLeafEncoding);
    const total: number = amounts.reduce((sum, current) => sum + current, 0);
    return {tree, amount: toBigInt(total)};
}

function getMTreeProof(mtree: StandardMerkleTree<any>, addr: string): {proof: string[], leaf: string} {
    for (const [i, v] of mtree.entries()) {
        if (v[0] === addr) {
            const proof = mtree.getProof(i);
            const leaf = standardLeafHash(MerkleLeafEncoding, v);
            // console.log('-Value:', v);
            // console.log('-Proof:', proof);
            // console.log('-Leaf :', leaf);
            return {proof, leaf};
        }
    }

    return {proof: [], leaf: ""};
}

function genRewardLeaf(recipient: string, amount: string, thisAddress: string, kwilBlockHash: string) {
    const encodedLeaf = AbiCoder.defaultAbiCoder().encode(MerkleLeafEncoding, [recipient, amount, thisAddress, kwilBlockHash]);
    return getBytes(keccak256(encodedLeaf))
}

const RewardContractABI: string[] = [
    "function safe() public view returns (address)",
    "function postReward(bytes32 rewardRoot, uint256 rewardAmount) external",
    "function updatePosterFee(uint256 newFee) external",
    "function rewardPoster(bytes32 root) public view returns (address)",
    "function claimReward(address recipient,uint256 amount,uint256 kwilBlock,bytes32 rewardRoot,bytes32[] calldata proof)"
];

function genPostRewardTxData(root: string, amount: BigNumberish): string {
    // Create contract interface
    const iface = new Interface(RewardContractABI);
    // Encode function data
    return iface.encodeFunctionData('postReward', [root, amount]);
}

function genUpdatePosterFeeTxData(fee: BigNumberish): string {
    // Create contract interface
    const iface = new Interface(RewardContractABI);
    // Encode function data
    return iface.encodeFunctionData('updatePosterFee', [fee]);
}

interface KwilEpoch {
    id: string;
    start_height: number;
    start_timestamp: number;
    end_height: number;
    reward_root: string;
    reward_amount: string;
    end_block_hash: string;
    voters: string[];
    vote_amounts: string[];
    vote_nonces: number[];
    voter_signatures: string[];
}

interface KwilRewardInstanceInfo {
    chain: string;
    escrow: string;
    epoch_period: string;
    erc20: string;
    decimals: number;
    balance: string;
    synced: boolean;
    synced_at: number;
    enabled: boolean;
}

declare class KwilRewardPosterAPI {
    GetActiveEpochs(): Promise<KwilEpoch[]>
    Info(): Promise<KwilRewardInstanceInfo>
}

class KwilAPI implements KwilRewardPosterAPI {
    private kwil: NodeKwil;
    private ns: string;

    constructor(kwilProvider: string, chainID: string, ns: string) {
        this.kwil = new NodeKwil({kwilProvider: kwilProvider, chainId: chainID});
        this.ns = ns;
    }

    async GetActiveEpochs(): Promise<KwilEpoch[]> {
        const callBody = {
            namespace: this.ns,
            name: "get_active_epochs",
            inputs: []
        }
        // TODO: use stream API?
        const res= await this.kwil.call(callBody)
        if (!res.data) {
            return [];
        }

        return res.data.map(row => {return row as KwilEpoch;});
    }

    async Info(): Promise<KwilRewardInstanceInfo> {
        const callBody = {
            namespace: this.ns,
            name: "info",
            inputs: []
        }
        // TODO: use stream API?
        const res = await this.kwil.call(callBody)
        if (!res.data) {
            throw new Error("failed to get reward info");
        }

        return res.data.map(row => {return row as KwilRewardInstanceInfo;})[0];
    }
}

export {
    genRewardMerkleTree,
    getMTreeProof,
    genRewardLeaf,
    genPostRewardTxData,
    genUpdatePosterFeeTxData,
    getChainSpecificDefaultSaltNonce,
    getChainSpecificSaltNonce,
    RewardContractABI,
    // types
    KwilEpoch,
    KwilAPI,
    KwilRewardPosterAPI
}