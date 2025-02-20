import {ethers} from "ethers";

interface Wallet {
    address: string;
    privateKey: string;
}

/**
 * GenHDWallets is a helper function to generate an array of Wallet.
 * @param mnemonic
 * @param num
 * @constructor
 */
function GenHDWallets(mnemonic: string, num: number=4): Wallet[] {
    // https://github.com/ethers-io/ethers.js/discussions/4148#discussioncomment-6184999
    // m/purpose/coin_type/account/change/index;
    const mm = ethers.Mnemonic.fromPhrase(mnemonic);

    // https://docs.ethers.org/v6/api/wallet/#hd-wallets
    return Array.from({ length: num }).map((_, i):Wallet => {
        const wallet = ethers.HDNodeWallet.fromMnemonic(mm, ethers.getIndexedAccountPath(i));
        return {
            address: wallet.address,
            privateKey: wallet.privateKey
        };
    });
}


export {
    Wallet,
    GenHDWallets
};