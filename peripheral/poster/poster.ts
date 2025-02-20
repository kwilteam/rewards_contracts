import {ethers, parseUnits, toBigInt} from "ethers";
import pino from "pino";

import {KwilAPI, KwilEpoch} from "../lib/reward";
import {RewardSafe, SafeMeta} from "../lib/gnosis";
import {getTxRevertMessage} from "../lib/utils";
import {FinalizedEpoch, EpochRecord, State, EpochVote} from "./state";

const CONSTANTS = {
    FETCH_KWIL_REWARD_BATCH_LIMIT: 10,
    NUM_OF_CONFIRMATION: 10, // 140s with 14s block time
    NUM_OF_WAIT_TOO_LONG: 270, // roughly 1 hour
    EXTRA_TIP_IN_GWEI: 3,
} as const

function base64ToBytes32(s: string): string {
    return '0x' + Buffer.from(s, 'base64').toString('hex')
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// EVMPoster is the transaction poster for EVM compatible chains.
// It works by syncing all finalized rewards from Kwil network, then proposing and
// executing GnosisSafe transaction.
// If the provided state.lastBlock is set, it will sync from that block.
class EVMPoster {
    private readonly rewardContract: ethers.Contract
    private readonly eth: ethers.Provider
    private readonly safe: RewardSafe
    private readonly kwil: KwilAPI
    private readonly state: State
    private logger: pino.Logger
    private signer: ethers.Wallet

    constructor(
      rewardSafe: RewardSafe,
      rewardContract: ethers.Contract,
      signer: ethers.Wallet,
      kwil: KwilAPI,
      ethProvider: ethers.Provider,
      state: State = new State(), // default to memory state
      logger: pino.Logger,
    ) {
        this.kwil = kwil
        this.state = state
        this.signer = signer
        this.eth = ethProvider
        this.safe = rewardSafe
        this.rewardContract = rewardContract
        this.logger = logger;
    }

    // get a list of finalized rewards and handle them in batch.
    // we CANNOT use `LatestFinalized` as it will skip some rewards.
    async fetchActiveFinalizedEpoch(safeMeta: SafeMeta): Promise<FinalizedEpoch | null> {
        this.logger.debug('Fetching active epoch')
        const reqs: KwilEpoch[] = await this.kwil.GetActiveEpochs()

        if (reqs.length === 0) {
            throw new Error('no active epochs')
        }

        if (reqs.length == 1) {
            // this only happens on the very first epoch, we just skip and wait until it finalizes
            return null;
        }

        if (reqs.length != 2) {
            throw new Error('unexpected number of active epochs')
        }

        // the first one has finalized
        const reqEpoch = reqs[0];

        if (reqEpoch.voters === null) {
            return null
        }

        const epoch: FinalizedEpoch = {
            root: base64ToBytes32(reqEpoch.reward_root),
            total: reqEpoch.reward_amount,
            block: reqEpoch.end_height, // the height when epoch reward is created
            votes: reqEpoch.voters.map((v, idx): EpochVote=> {
                if (reqEpoch.voters !== null) {
                    return {
                        voter: reqEpoch.voters[idx],
                        nonce: reqEpoch.vote_nonces[idx],
                        signature: reqEpoch.voter_signatures[idx]
                    } as EpochVote;
                }

                return {} as EpochVote;
            }),
        };

        epoch.votes = epoch.votes.filter(v => v.nonce.toString() === safeMeta.nonce.toString());
        if (epoch.votes.length < safeMeta.threshold) {
            return null;
        }

        // TODO: also we can verify the signature, to filter out invalid signature

        return epoch;
    }

    async postEpoch(epoch: FinalizedEpoch, safeMeta: SafeMeta, prioritizeTipInGwei: number = 0, prioritizeNonce: number, prioritize: boolean) {
        let root: string = epoch.root;
        // amount and nonce match
        const eligibleVotes = epoch.votes.filter(
            v => v.nonce.toString() === safeMeta.nonce.toString())

        const proposer = eligibleVotes[0].voter
        const proposerSignature = eligibleVotes[0].signature
        let proposeAmount: string = epoch.total

        console.log("000000000sig.    ", proposerSignature, base64ToBytes32(proposerSignature))

        // TODO: check if the contract has enough token, i.e. `token.balanceOf(epoch.ContractAddress) >= epoch.request.amount`

        // NOTE: maybe Kwil API can also return the safeTxHash associated with Reward? seems not necessary
        // propose GnosisSafe tx
        const safeTxHash = await this.safe.proposeRewardWithSignature(root, proposeAmount,
            proposer, base64ToBytes32(proposerSignature));

        this.logger.info({ root: root, amount: proposeAmount, safeNonce: safeMeta.nonce,
             safeTxHash: safeTxHash, proposer: proposer}, "Propose safe tx")

        // confirm GnosisSafe tx; TODO: maybe only use least required signatures, to safe gas.
        for (const vote of eligibleVotes) {
            // await this.safe.confirmRewardWithSignature(root, amount, ethers.toQuantity(signature));
            await this.safe.confirmTx(safeTxHash, base64ToBytes32(vote.signature));
            this.logger.info({safeNonce: safeMeta.nonce, safeTxHash: safeTxHash, signer: vote.voter},
                "Confirm safe tx")
        }

        const feeData = await this.eth.getFeeData();

        // execute GnosisSafe tx
        const currentBlock = await this.eth.getBlockNumber()
        const accountNonce = await this.eth.getTransactionCount(this.signer.address)
        const txHash = await this.safe.executeTx(safeTxHash, this.signer.privateKey, this.signer.address,
            feeData.maxFeePerGas!.toString(),
            (feeData.maxPriorityFeePerGas! + toBigInt(prioritizeTipInGwei)).toString(),
            prioritize ? prioritizeNonce : undefined);

        this.logger.info({ root: root, amount: proposeAmount,
            safeTxHash: safeTxHash, txHash: txHash, block: currentBlock},
            "Execute safe tx, post reward")

        // get posted tx info
        const tx = await this.eth.getTransaction(txHash);

        await this.state.newRecord({
            epoch: epoch,
            result: {
                        hash: txHash,
                        fee: (tx!.gasPrice * tx!.gasLimit).toString(),
                        gasPrice: tx!.gasPrice.toString(),
                        postBlock: currentBlock,
                        includeBlock: 0,
                        accountNonce: accountNonce,
                        safeNonce: safeMeta.nonce
                    }})
    }

    async runOnce() {
        const safeMeta = await this.safe.getMetadata()
        // we always use the latest epoch from Kwil, since there might be more vote
        const newEpoch = await this.fetchActiveFinalizedEpoch(safeMeta);
        if (newEpoch === null) {
            this.logger.info('No postable finalized epoch found')
            return
        }

        // we get one epoch with enough votes, and the epoch could be in those state:
        // - totally new to posterSvc;
        // - posterSvc has posted this epoch; If posterSvc see this, we know it's not confirmed on Kwil; then we either wait or re-submit with higher gas tip

        // if no state, then this is the first epoch posterSvc ever seen
        if (this.state.records.length === 0) {
            this.logger.info('First epoch, posting it')
            await this.postEpoch(newEpoch, safeMeta, 0, 0, false);
            return
        }

        const lastRecord = this.state.records[this.state.records.length - 1];

        if (lastRecord  && lastRecord.epoch.root !== newEpoch.root) {
            this.logger.info({ root: newEpoch.root, nonce: safeMeta.nonce }, 'New epoch, posting it')
            // new epoch for posterSvc; so we know last epoch is confirmed
            // We use Kwil's state not posterSvc's state to determine whether an epoch is confirmed.
            await this.postEpoch(newEpoch , safeMeta, 0, 0, false);
        } else {
            this.logger.info({ root: newEpoch.root, nonce: safeMeta.nonce }, 'Posted epoch, checking status')

            // NOTE: what if Safe is updated(nonce changed) after posterSvc submit the tx?
            // If that's the case, the tx will fail eventually. Although we waste some gas, but this is simpler mental model.
            // So we just wait the tx to fail, and re-submit with newer safe nonce.

            const currentBlock = await this.eth.getBlockNumber()
            const tx = await this.eth.getTransaction(lastRecord.result!.hash);
            // If tx is still pending, i.e. in EVM mempool
            if (tx!.blockNumber === null) {
                if (currentBlock - lastRecord.result!.postBlock > CONSTANTS.NUM_OF_WAIT_TOO_LONG) {
                    this.logger.info( { root: lastRecord.epoch.root, tx: lastRecord.result!.hash, waited: currentBlock - lastRecord.result!.postBlock}, 'tx has been pending for too long, prioritize it. ')
                    const lastRecordTxNonce = lastRecord.result!.accountNonce!;
                    await this.postEpoch(lastRecord.epoch, safeMeta, CONSTANTS.EXTRA_TIP_IN_GWEI, lastRecord.result!.accountNonce, true);
                    return
                }

                this.logger.info({ root: lastRecord.epoch.root, tx: lastRecord.result!.hash, waited: currentBlock - lastRecord.result!.postBlock }, 'Tx still pending, hash:')
                return
            }

            // If tx is included in a block
            const txReceipt = await this.eth.getTransactionReceipt(lastRecord.result!.hash);

            // If tx succeeds
            if (txReceipt!.status === 1) {
                if (currentBlock - txReceipt!.blockNumber! > CONSTANTS.NUM_OF_CONFIRMATION) {
                    this.logger.info({ root: lastRecord.epoch.root, tx: lastRecord.result!.hash, block: txReceipt!.blockNumber! }, "rewalastRecord Tx confirmed ")
                    await this.state.updateResult(lastRecord.epoch.root, {
                        hash: lastRecord.result!.hash,
                        fee: txReceipt!.fee!.toString(),
                        gasPrice: txReceipt!.gasPrice.toString(),
                        postBlock: lastRecord.result!.postBlock,
                        includeBlock: txReceipt!.blockNumber!,
                        accountNonce: lastRecord.result?.accountNonce!,
                        safeNonce: lastRecord.result?.safeNonce!,
                    })

                    return
                }

                this.logger.info({ root: lastRecord.epoch.root, tx: lastRecord.result!.hash, block: txReceipt!.blockNumber! }, "rewalastRecord Tx included but not confirmed yet")
                return
            }

            // Then tx fail
            const revertMsg = await getTxRevertMessage(this.eth, tx!);
            // const txResp = await txReceipt?.getResult();
            this.logger.info({ tx: lastRecord.result!.hash, waited: currentBlock - lastRecord.result!.postBlock, err: revertMsg }, 'Tx failed',)
            // most likely due to the safe nonce issue. we re-post it with new safe metadata
            await this.postEpoch(newEpoch , safeMeta, 0, 0,false);
        }
    }

    // this just shows how the poster should run. Don't run this
    async _run(interval: number)
    {
        setInterval(async () => {
            await this.runOnce()
        }, interval) // should be long enough so that TX is posted and stated is synced to disk, before the next round of checking
    }

}

export { KwilAPI, EVMPoster, base64ToBytes32}