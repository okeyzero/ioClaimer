// const Logger = require("@youpaichris/logger");
const anchor = require("@coral-xyz/anchor");
const {
    constants,
    getWallet,
    toBytes32Array,
    getATA,
    findClaimStatusKey
} = require("./utils.js");
const axios = require("axios");
const axiosRetry = require("axios-retry").default;
const {Logger} = require("./newLog.js");
const {
    Keypair,
    PublicKey,
    Message,
    VersionedTransaction,
    sendAndConfirmTransaction,
    Transaction,
    TransactionInstruction,
    ComputeBudgetProgram,
    SYSVAR_RENT_PUBKEY,
    SystemProgram,
    LAMPORTS_PER_SOL,
    SYSVAR_CLOCK_PUBKEY,
    TransactionMessage,
} = require("@solana/web3.js");
const dotenv = require("dotenv");
dotenv.config();

let logger;
const {
    TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddress,
    createTransferInstruction,
    createCloseAccountInstruction,
} = require("@solana/spl-token");

// //导入 idl.json
const idl = require("./idl.json");
const {getEventAuthorityPda, feeAcc} = require("./utils");
const gasPrice = parseFloat(process.env.GASPRICE) * LAMPORTS_PER_SOL || 100000;
const gasLimit = parseInt(process.env.GASLIMIT) || 200000;

const apiDistributor = process.env.DISTRIBUTOR || "6Zv2VRjEvjZXSRb6phxnSJkPPiVsF3vg19LCfrhNd8hn";
const instance = axios.create({
    timeout: 30000, // 设置超时时间为 10 秒
    // httpsAgent: agent,
});

axiosRetry(instance, {
    retries: 3, // 设置重试次数为 10 次
    retryDelay: axiosRetry.exponentialDelay, // 设置重试延迟为指数增长
});


async function getClaimProof(address) {
    try {
        // IO项目方代币分在了4个地址中，从链上看，是官方从主地址分发到下面4个地址里，如果你地址不在第一个查询入口的话，就依次更换为下面3个链接，把你地址粘贴到“/”后面再次查询即可
        // https://app.streamflow.finance/airdrop/solana/mainnet/DaxHHvEF5o5Jc1594zPbDNpG6mmjrmfW6kwWtT5J2qaS/
        // https://app.streamflow.finance/airdrop/solana/mainnet/6Zv2VRjEvjZXSRb6phxnSJkPPiVsF3vg19LCfrhNd8hn/
        // https://app.streamflow.finance/airdrop/solana/mainnet/7SxrF5GXTTfkPxdxfKGx2wuVtfGYrdaGjaqX3YFPf9sJ/
        // https://app.streamflow.finance/airdrop/solana/mainnet/BPush3myMcgq1FbPs8f7JSZvieWA4bDbPinaZEatEEQ1/
        const url = `https://api.streamflow.finance/v2/api/airdrops/${apiDistributor}/claimants/${address}`
        const headers = {
            'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://app.streamflow.finance/',
            //'baggage': 'sentry-environment=production,sentry-release=sf-3d4279dc,sentry-public_key=ffe6dfabe4ea43d9947978472d9f11d6,sentry-trace_id=aa7fe4a08d994b10a01ff82d72c9ab45',
            //'sentry-trace': 'aa7fe4a08d994b10a01ff82d72c9ab45-bf7c94da9c8240a6',
            'sec-ch-ua-platform': '"macOS"'
        }

        const response = await instance.get(url, {
            headers: headers
        });
        return response.data;
    } catch (error) {
        logger.error(`获取claimProof失败: ${error}`);
        return null
    }
}


class Worker {
    constructor(index, rpc, privateKey) {
        this.privateKey = privateKey;
        this.index = index;
        this.rpc = rpc;
    }

    async work() {
        const balance = await this.checkBalance(this.wallet.publicKey);

        if (balance < 0.003 * LAMPORTS_PER_SOL) {
            logger.error(`${this.wallet.publicKey.toBase58()} 余额不足`);
            throw new Error("余额不足");
        }
        logger.info(`${this.wallet.publicKey.toBase58()}  正在初始化钱包...`);

        let initDate = false;
        let claimInfo;

        let retryCounts = 5;
        while (retryCounts > 0) {
            if (!initDate) {
                claimInfo = await getClaimProof(this.wallet.publicKey.toBase58());
                logger.debug(`${this.wallet.publicKey.toBase58()} claimInfo: ${JSON.stringify(claimInfo)}`);
                if (!claimInfo) {
                    logger.error(`${this.wallet.publicKey.toBase58()} 获取领取数据失败!`);
                    return {success: false};
                }
                initDate = true;
            }
            logger.info(`${this.wallet.publicKey.toBase58()}  开始领取...`);
            let success = await this.claim(
                claimInfo
            );
            if (!success) {
                retryCounts--;
                logger.error(`${this.wallet.publicKey.toString()} 未能成功领取`);
                await new Promise((resolve) => setTimeout(resolve, 5000));
            } else {
                return {success: true};
            }
        }
        return {success: false};
    }

    async init() {
        try {
            logger = new Logger(this.index);
            const connection = new anchor.web3.Connection(this.rpc, "confirmed");
            const wallet = await getWallet(this.privateKey);
            const provider = new anchor.AnchorProvider(connection, wallet, {
                commitment: "processed",
            });
            this.connection = connection;
            this.provider = provider;
            this.address = wallet.publicKey.toString();
            this.wallet = wallet;

            return true;
        } catch (error) {
            logger.error(`初始化 Error: ${error.message}`);
            return false;
        }
    }

    async checkBalance(publicKey) {
        for (let index = 0; index < 5; index++) {
            try {
                const balance = await this.connection.getBalance(publicKey);
                logger.info(
                    `${publicKey.toBase58()} 当前余额 ${balance / LAMPORTS_PER_SOL} SOL`
                );
                return balance;
            } catch (error) {
                logger.error(
                    `${publicKey.toBase58()} 获取余额失败,正在重试...${index + 1}`
                );
            }
        }
        return 0;
    }


    async createClaimInstruction(token_address, wallet, claimInfo) {
        const claimProgram = new anchor.Program(idl, constants.CLAIM_PROGRAM_ID, this.provider);
        const distributorAccountPDA = new PublicKey(claimInfo.distributorAddress);
        const [claimStatusPDA] = await findClaimStatusKey(wallet.publicKey, distributorAccountPDA);
        const destinationAccount = await getATA(token_address, wallet.publicKey);
        const distributorATA = await getAssociatedTokenAddress(
            token_address,
            distributorAccountPDA,
            true,
        );
        const [eventAuthority] = await getEventAuthorityPda();
        //claimInfo.amountLocked = 0;
        return claimProgram.methods.newClaim(
            new anchor.BN(claimInfo.amountUnlocked),
            new anchor.BN(claimInfo.amountLocked),
            claimInfo.proof.map((p) => toBytes32Array(Buffer.from(p))),
        ).accounts(
            {
                distributor: distributorAccountPDA,
                claimStatus: claimStatusPDA,
                from: distributorATA,
                to: destinationAccount,
                claimant: wallet.publicKey,
                mint: token_address,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                eventAuthority: eventAuthority,
                program: constants.CLAIM_PROGRAM_ID,
            }
        );
    }

    async claim(claimInfo) {
        try {
            const accountATA = await getATA(constants.TOKEN_MINT, this.wallet.publicKey);
            const createAtaInstruction = createAssociatedTokenAccountInstruction(
                this.wallet.publicKey,
                accountATA,
                this.wallet.publicKey,
                constants.TOKEN_MINT
            )
            const claimer = await this.createClaimInstruction(constants.TOKEN_MINT, this.wallet, claimInfo);
            const signature = await claimer
                .preInstructions([
                    ComputeBudgetProgram.setComputeUnitPrice({
                        microLamports: gasPrice,
                    }),
                    ComputeBudgetProgram.setComputeUnitLimit({units: gasLimit}),
                    createAtaInstruction
                ])
                .rpc()
            const status = await this.connection.confirmTransaction(signature, "finalized");
            logger.info(`${this.wallet.publicKey.toBase58()} 领取成功,hash: ${signature}`);
            return true;
        } catch (error) {
            if (JSON.stringify(error).includes("already in use")) {
                logger.error(`${this.wallet.publicKey.toBase58()} 已经领取过`);
                return true;
            } else {
                logger.error(`${this.wallet.publicKey.toBase58()} 领取失败: ${error.message}`);
                return false;
            }
        }
    }

}

// export default Worker;
module.exports = Worker;
