import fs from "fs";

interface EpochVote {
    voter: string
    nonce: number
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
    records: EpochRecord[];

    constructor(path: string = '') {
        this.path = path;
        this.records = [];
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
                rewards: this.records,
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

    // Adds new record to the state
    async newRecord(e: EpochRecord) {
        this.records.push(e);
        this.index.set(e.epoch.root, this.records.length - 1);
        this._sync();
    }

    async updateResult(root: string, result: TxInfo) {
        const index = this.index.get(root);
        if (index === undefined) {
            throw new Error('Epoch not found');
        }

        this.records[index].result = result;

        this._sync();
    }

    // Static method to load state from the given file
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
            const record = state.records[i];
            if (record.epoch!.root !== undefined) {
                state.index.set(record.epoch!.root, i);
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