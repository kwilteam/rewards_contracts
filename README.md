# Kwil Reward Distribution

### Development with Sepolia testnet

Since we're using Safe, and it's hard to deploy a local full stack Safe
service, we're going to use Safe on Sepolia.

First copy `.env.example` to `.env` and fill in your mnemonic and rpc. Make sure you have
enough ETH(at least 0.1) on Sepolia.

Go https://app.safe.global/home and create a Safe Wallet on Sepolia network, with
the first few derived wallets(from the mnemonic) as the owners of the Safe Wallet
(those wallets will be used in the tests/scripts), and use the 1/x setting.
After creation, write the Safe Wallet address to .env file.

After that, run `npm run redeploy:sepolia` to deploy RewardDistributor contract to
the Sepolia network. This will also deploy a mock erc20 token as the reward token.
Then write the contract address and mock token address to .env file.

Then config a test wallet private key and its address to .env(for simplicity, use the first
wallet from the mnemonic).

> If by the time you use this we haven't put reward extension in to kwil-db, you'll
> need to build a special docker image in erc20-reward-extension by running `make docker`.

Now you have everything you need to use ./dev.sh, which runs everything in docker container.
This script has two functions:
- build: build signerSvc/posterSvc docker images.
- run-fresh: start a fresh environment, with db/kwild/signerSvc/posterSvc. All data will be deleted on stop.

So, if this is your first time, type:
```shell
./dev.sh build
./dev.sh run-fresh
```

### Documentations

- [overview](./docs/README.md)
- [proxy contract](./docs/RewardDistributor.md)

### Audits

- [by HashEx](./docs/RewardDistributor_HashEx_Audit.pdf)