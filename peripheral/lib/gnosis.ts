import SafeApiKit from '@safe-global/api-kit';
import Safe from '@safe-global/protocol-kit';
import {
    MetaTransactionData,
    OperationType,
} from '@safe-global/types-kit';

import {genPostRewardTxData, genUpdatePosterFeeTxData} from "./reward";
import {RequestArguments} from "@safe-global/protocol-kit/dist/src/types/safeProvider";

type Eip1193Provider = {
    request: (args: RequestArguments) => Promise<unknown>;
};

type BigNumberish = string | number | bigint;

interface SafeMeta {
    nonce: number;
    threshold: number;
    owners: string[];
}

/**
 * RewardSafe is a wrapper on Safe core SDK to call RewardDistributor contract.
 */
class RewardSafe {
    rpc: Eip1193Provider | string;
    safeAddress: string;
    rewardAddress: string;

    safeApiKit: SafeApiKit;

    constructor(rpc: Eip1193Provider | string, chainID: bigint,rewardAddress: string, safeAddress: string,  safeTxServiceUrl?: string) {
        this.rpc = rpc;
        this.safeAddress = safeAddress;
        this.rewardAddress = rewardAddress;
        this.safeApiKit = new SafeApiKit({
            chainId: chainID,
            txServiceUrl: safeTxServiceUrl // only will be set when local test
        })
    }

    // generate a GnosisSafe transaction hash to call `postReward` function on RewardContract
    async genPostRewardSafeTx(root: string, amount: BigNumberish, nonce?: number) {
        const safe = await Safe.init({
            provider: this.rpc,
            safeAddress: this.safeAddress,
        })

        const txData: MetaTransactionData = {
            to: this.rewardAddress,
            value: '0',
            data: genPostRewardTxData(root, amount),
            operation: OperationType.Call
        }

        const transactions = [txData];

        const safeTx = await safe.createTransaction({
            transactions: transactions,
            options: {
                // safeTxGas?: string;
                // baseGas?: string;
                // gasPrice?: string;
                // gasToken?: string;
                // refundReceiver?: string;
                nonce: nonce,
            },
        })

        const safeTxHash = await safe.getTransactionHash(safeTx);
        return {safeTx, transactions, safeTxHash}
    }

    // generate a GnosisSafe transaction hash to call `updatePosterFee` function on RewardContract
    async genUpdatePosterFeeSafeTx(fee: BigNumberish) {
        const safe = await Safe.init({
            provider: this.rpc,
            safeAddress: this.safeAddress,
        })

        const txData: MetaTransactionData = {
            to: this.rewardAddress,
            value: '0',
            data: genUpdatePosterFeeTxData(fee),
            operation: OperationType.Call
        }

        const safeTx = await safe.createTransaction({
            transactions: [txData]
        })

        const safeTxHash = await safe.getTransactionHash(safeTx);
        return {safeTx, safeTxHash}
    }

    // generate the signature for a new transaction to upload Reward.
    // As long as we have signature, we can propose/confirm a transaction from non-signer wallet.
    async signPostReward(root: string, amount: BigNumberish, signerPK: string, nonce?: number) : Promise<{safeTxHash: string, signature: string}> {
        const safeSigner = await Safe.init({
            provider: this.rpc,
            safeAddress: this.safeAddress,
            signer: signerPK
        })

        const {safeTxHash} = await this.genPostRewardSafeTx(root, amount, nonce);
        const safeSignature = await safeSigner.signHash(safeTxHash)
        return {safeTxHash, signature: safeSignature.data}
    }

    async signUpdatePosterFee(fee: BigNumberish, signerPK: string) : Promise<{safeTxHash: string, signature: string}> {
        const safeSigner = await Safe.init({
            provider: this.rpc,
            safeAddress: this.safeAddress,
            signer: signerPK
        })

        const {safeTxHash} = await this.genUpdatePosterFeeSafeTx(fee);
        const safeSignature = await safeSigner.signHash(safeTxHash)
        return {safeTxHash, signature: safeSignature.data}
    }

    // propose a new `postReward` transaction, with proposer's signature, to GnosisSafe tx service.
    async proposeRewardWithSignature(root: string, amount:BigNumberish, signerAddress: string, signerSignature: string): Promise<string>  {
        // const safe = await Safe.init({
        //     provider: this.rpc,
        //     safeAddress: this.safeAddress,
        // })

        const {safeTx, safeTxHash} = await this.genPostRewardSafeTx(root, amount);
        await this.safeApiKit.proposeTransaction({
            safeAddress: this.safeAddress,
            safeTransactionData: safeTx.data,
            safeTxHash,
            senderAddress: signerAddress,
            senderSignature: signerSignature,
        })

        return safeTxHash
    }

    // confirm a new `postReward` transaction, with confirmer's signature, to GnosisSafe tx service.
    async confirmRewardWithSignature(root: string, amount:BigNumberish, signature: string) {
        // const safe = await Safe.init({
        //     provider: this.rpc,
        //     safeAddress: this.safeAddress
        // })

        const {safeTxHash} = await this.genPostRewardSafeTx(root, amount);
        await this.safeApiKit.confirmTransaction(
            safeTxHash,
            signature
        )

        return safeTxHash
    }

    // propose a new transaction, with signature.
    async _proposeTxWithSignature(safeTxHash: string, signerAddress: string, signerSignature: string): Promise<string>  {
        const tx = await this.safeApiKit.getTransaction(safeTxHash);
        const txData = await this.safeApiKit.decodeData(tx.data!)
        await this.safeApiKit.proposeTransaction({
            safeAddress: this.safeAddress,
            safeTransactionData: txData,
            safeTxHash,
            senderAddress: signerAddress,
            senderSignature: signerSignature,
        })

        return safeTxHash
    }

    // confirm a new transaction. with signature.
    async _confirmTxWithSignature(safeTxHash: string, signature: string) {
        await this.safeApiKit.confirmTransaction(
            safeTxHash,
            signature
        )

        return safeTxHash
    }

    async confirmTx(safeTxHash:string, signature:string) {
        await this.safeApiKit.confirmTransaction(
            safeTxHash,
            signature
        )

        return safeTxHash
    }


    // execute a GnosisSafe transaction (assume the threshold has reached).
    // Since safeTxHash represents an off-chain transaction, the signer can be any
    // wallet, as long as it pays the tx fee.
    async executeTx(safeTxHash:string, signerPK: string, signerAddress: string,
                    maxFeePerGas:string, maxPriorityFeePerGas:string, nonce?: number) : Promise<string>     {
        const safeSigner = await Safe.init({
            provider: this.rpc,
            signer: signerPK,
            safeAddress: this.safeAddress
        })

        const signedTransaction = await this.safeApiKit.getTransaction(safeTxHash);

        // NOTE: if get 'execution reverted', mostly likely because signer doesn't have enough ETH balance to pay gas.
        const transactionResponse = await safeSigner.executeTransaction(signedTransaction,
            {
                maxFeePerGas: maxFeePerGas,
                maxPriorityFeePerGas: maxPriorityFeePerGas,
                from: signerAddress,
                nonce: nonce,
            });

        return transactionResponse.hash
    }

    async queryTx(safeTxHash: string) {
        const transactions = await this.safeApiKit.getMultisigTransactions(this.safeAddress)
        if (transactions.results.length > 0) {
            console.log('Last executed transaction', transactions.results[0])
        }
    }

    async getNonce() {
        const safe = await Safe.init({
            provider: this.rpc,
            safeAddress: this.safeAddress,
        })

        return await safe.getNonce();
    }

    async getMetadata() : Promise<SafeMeta> {
        const safe = await Safe.init({
            provider: this.rpc,
            safeAddress: this.safeAddress,
        })

        // TODO: maybe use multicall3
        return {nonce: await safe.getNonce(),
                threshold: await safe.getThreshold(),
                owners: await safe.getOwners()} as SafeMeta;
    }
}

export { RewardSafe , SafeMeta}