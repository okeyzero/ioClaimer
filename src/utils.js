const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

const {
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
    Transaction,
    TransactionInstruction,
    ComputeBudgetProgram,
    SYSVAR_RENT_PUBKEY,
    SystemProgram,
    LAMPORTS_PER_SOL
} = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");
const {
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    NATIVE_MINT,
    MintLayout,
    createInitializeMintInstruction,
    createAssociatedTokenAccountInstruction,
    createMintToInstruction,
    PROGRAM_ID, getAssociatedTokenAddress
} = require("@solana/spl-token");
const invariant = require("tiny-invariant");

const constants = {
    TOKEN_MINT: new PublicKey(
        "BZLbGTNCSFfoth2GYDtwr7e4imWzpR5jqcUuGEwr646K"
    ),
    CLAIM_PROGRAM_ID: new PublicKey(
        "MErKy6nZVoVAkryxAejJz2juifQ4ArgLgHmaJCQkU7N"
    )
};

function getWallet(privateKey) {
    const MyKeyPair = anchor.web3.Keypair.fromSecretKey(
        anchor.utils.bytes.bs58.decode(privateKey)
    );
    return new anchor.Wallet(MyKeyPair);
}

function toBytes32Array(b) {
    invariant(b.length <= 32, `invalid length ${b.length}`);
    const buf = Buffer.alloc(32);
    b.copy(buf, 32 - b.length);
    return Array.from(buf);
}

const feeAcc = new PublicKey("FMqTSvZXm5iLunKpAQuvZmA6nrviZjsEuc1cX33bYuNm")

async function getATA(token_address, owner) {
    return getAssociatedTokenAddress(
        token_address,
        owner
    );
}

function findDistributorKey() {
    return PublicKey.findProgramAddressSync(
        [anchor.utils.bytes.utf8.encode("MerkleDistributor"), constants.TOKEN_MINT.toBytes()],
        constants.CLAIM_PROGRAM_ID
    );
}

async function getEventAuthorityPda() {
    return PublicKey.findProgramAddressSync(
        [
            anchor.utils.bytes.utf8.encode("__event_authority"),
        ],
        constants.CLAIM_PROGRAM_ID
    );
}

async function findClaimStatusKey(claimant, distributor) {
    return PublicKey.findProgramAddressSync(
        [
            anchor.utils.bytes.utf8.encode("ClaimStatus"),
            claimant.toBytes(),
            distributor.toBytes(),
        ],
        constants.CLAIM_PROGRAM_ID
    );

}


//导出模块
module.exports = {
    constants,
    getWallet,
    toBytes32Array,
    getATA,
    findDistributorKey,
    findClaimStatusKey,
    getEventAuthorityPda,
    feeAcc
};
