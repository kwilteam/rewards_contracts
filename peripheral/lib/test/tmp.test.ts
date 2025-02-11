import { KwilAPI } from "../reward"



async function test() {
    const kwil = new KwilAPI("http://localhost:8484", "kwil-testnet", "rewards")
    const res = await kwil.ListPending(1, 1000)
    console.log(res)
}

test().catch(console.error)