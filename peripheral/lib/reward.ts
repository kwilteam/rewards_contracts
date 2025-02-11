// This file contains types/functions related to the reward extension.
import {keccak256, AbiCoder, toBigInt, getBytes, Interface, BigNumberish, ethers} from "ethers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { standardLeafHash } from "@openzeppelin/merkle-tree/dist/hashes";
import {assert} from "chai";
import {NodeKwil, Utils} from "../../kwil-js/dist"; // TODO: change this

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

// function ClaimReward(rewardAddress: string, recipient: string, amount: BigNumberish, kwilBlock: BigNumberish, root: string, proof: string[]): string {
//     rewardContract = new ethers.Contract(rewardAddress, RewardContractABI, this.eth)
// }

interface KwilFinalizedReward {
    id: string;
    voters: string[];
    signatures: string[];
    epoch_id: string;
    created_at: number;
    start_height: number;
    end_height: number;
    total_rewards: string;
    reward_root: string,
    safe_nonce: number,
    sign_hash: string,
    contract_id: string,
    block_hash: string,
}

/**
 * declare class KwilRewardPosterAPI { defines the reward distribution system API used by Poster service.
 */
declare class KwilRewardPosterAPI {
    // returns `limit` number of rewards since `afterBlockHeight`
    ListFinalized(afterBlockHeight: number, limit: number): Promise<KwilFinalizedReward[]>
    LatestFinalized(limit: number): Promise<KwilFinalizedReward[]>
}

class KwilAPI implements KwilRewardPosterAPI {
    private kwil: NodeKwil;
    private ns: string;

    constructor(kwilProvider: string, chainID: string, ns: string) {
        this.kwil = new NodeKwil({kwilProvider: kwilProvider, chainId: chainID});
        this.ns = ns;
    }

    async ListFinalized(blockHeight: number, limit: number): Promise<KwilFinalizedReward[]> {
        const callBody = {
            namespace: this.ns,
            name: "list_finalized",
            inputs: [{$param_1: blockHeight,$param_2: limit}]
        }
        // TODO: use stream API?
        const res        = await this.kwil.call(callBody)
        if (!res.data) {
            return [];
        }

        return res.data.map(row => {return row as KwilFinalizedReward;});
    }

    async LatestFinalized(limit: number): Promise<KwilFinalizedReward[]> {
        const callBody = {
            namespace: this.ns,
            name: "latest_finalized",
            inputs: [{$param_1: limit}]
        }
        // TODO: use stream API?
        const res        = await this.kwil.call(callBody);
        if (!res.data) {
            return [];
        }

        return res.data.map(row => {return row as KwilFinalizedReward;});
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
    KwilFinalizedReward,
    KwilAPI,
    KwilRewardPosterAPI
}