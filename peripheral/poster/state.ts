import fs from "fs";

interface EpochVote {
    voter: string
    nonce: number
    amount: string
    signature: string
}

interface FinalizedEpoch {
    root: string;
    total: string;
    block: number;
    votes: EpochVote[];
    leafCount?: number
}

interface TxInfo {
    hash: string;
    fee: string;
    gasPrice: string;
    postBlock: number;
    includeBlock?: number;
    accountNonce: number;
    safeNonce: number;
}

interface EpochRecord {
    epoch: FinalizedEpoch;
    result?: TxInfo;
}

// Main State class
class State {
    private readonly path: string;

    // in memory index; epochRoot=>idx
    index: Map<string, number>;

    // those will be written to disk
    // lastBlock: number;
    records: EpochRecord[];
    // pending: number[];


    constructor(path: string = '') {
        this.path = path;
        // this.lastBlock = 0;
        this.records = [];
        // this.pending = [];
        this.index = new Map();
    }

    // _sync is a private method that syncs the state to the file system
    private _sync() {
        if (!this.path) {
            return;
        }

        // Create a unique temporary file name using a timestamp and random string
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const tmpPath = `${this.path}.${timestamp}.${random}.tmp`;

        try {
            const data = {
                // lastBlock: this.lastBlock,
                rewards: this.records,
                // pending: this.pending
            };

            // Use synchronous write with fsync to ensure data is written to disk
            const fd = fs.openSync(tmpPath, 'wx', 0o600);
            try {
                fs.writeSync(fd, JSON.stringify(data, null, 2));
                fs.fsyncSync(fd);  // Force writing to disk
            } finally {
                fs.closeSync(fd);  // Ensure file descriptor is closed
            }

            // Atomic rename
            fs.renameSync(tmpPath, this.path);
        } catch (err) {
            // Clean up the temporary file if anything goes wrong
            fs.rmSync(tmpPath, {force: true});
            throw err;
        }
    }

    // Adds rewards to the state, also put them in the pending queue.
    async pendingRewardRecord(...epochs: FinalizedEpoch[]) {
        for (const e of epochs) {
            this.records.push({ epoch: e });
            this.index.set(e.root, this.records.length - 1);
            // this.pending.push(e.block!);
            // this.lastBlock = e.block!;
        }

        this._sync();
    }

    // Adds rewards to the state, without put them in pending queue.
    async syncRewardRecord(...epochs: FinalizedEpoch[]) {
        for (const e of epochs) {
            this.records.push({ epoch: e });
            this.index.set(e.root, this.records.length - 1);
            // this.lastBlock = e.block!;
        }

        this._sync();
    }

    async newRecord(e: EpochRecord) {
        this.records.push(e);
        this.index.set(e.epoch.root, this.records.length - 1);
        // this.pending.push(e.epoch.block!);
        // this.lastBlock = e.epoch.block!;
        this._sync();
    }

    async updateResult(root: string, result: TxInfo) {
        const index = this.index.get(root);
        if (index === undefined) {
            throw new Error('Block not found');
        }

        this.records[index].result = result;

        // if (result.includeBlock !== 0) {
        //     this.pending = this.pending.filter(b => b !== block);
        // }

        this._sync();
    }

    // async skipResult(block: number) {
    //     this.pending = this.pending.filter(b => b !== block);
    //     this._sync();
    // }

    // Static method to load state from file
    static LoadStateFromFile(stateFile: string): State {
        const state = new State(stateFile);

        const data = fs.readFileSync(stateFile, 'utf8').trim();
        if (data.length === 0) {
            return state;
        }


        const parsed = JSON.parse(data);

        if (parsed.rewards) {
            state.records = parsed.rewards;
        }

        // Rebuild index from rewards
        for (let i = 0; i < state.records.length; i++) {
            const reward = state.records[i];
            if (reward.epoch!.root !== undefined) {
                state.index.set(reward.epoch!.root, i);
            }
        }

        return state;
    }
}

export {
    State,
    EpochRecord,
    EpochVote,
    FinalizedEpoch,
    TxInfo
}