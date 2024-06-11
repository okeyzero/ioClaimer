const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const dotenv = require("dotenv");
const pino = require("pino");
const pinoCaller = require("pino-caller");
const {
    getWallet,
} = require("./src/utils.js");
dotenv.config();
//pkg -C Gzip -t node18-win-x64 .
const RPC_LIST = process.env.RPC_LIST.split(",") || [
    "https://mainnet-beta.solflare.network",
];
const THREAD = parseInt(process.env.THREAD) || os.cpus().length;

let walletAddressFilePath = "keys.txt";
let successPath = "success.txt";
let callerPath = path.join(__dirname, "src", "caller.js");
let privateKeys = [];
let total;
let logFilePath = "io_Claimer.log";
if (process.pkg) {
    // 如果通过 pkg 打包，则使用这种方式获取路径
    const exePath = path.dirname(process.execPath);
    walletAddressFilePath = path.join(exePath, walletAddressFilePath);
    successPath = path.join(exePath, successPath);
    logFilePath = path.join(exePath, logFilePath);
}

const logger = pinoCaller(
    pino(
        {
            level: "trace",
            timestamp: pino.stdTimeFunctions.isoTime,
        },
        pino.transport({
            targets: [
                {
                    level: "debug",
                    target: "pino-pretty",
                    options: {
                        colorize: true,
                    },
                },
                {
                    level: "trace",
                    target: "pino/file",
                    options: {destination: logFilePath, mkdir: true},
                },
            ],
        })
    ), {
        relativeTo: __dirname,
    }
);

async function handleMintTask() {
    const workerNum = Math.min(privateKeys.length, THREAD);
    for (let i = 0; i < workerNum; i++) {
        logger.info(`Start ${i + 1} child process...`);
        const child = cp.fork(callerPath, [i + 1]);

        child.on("error", (msg) => {
            logger.error(msg);
        });

        child.on("exit", (msg) => {
            logger.info(msg);
        });

        child.on("message", (message) => {
            //logger.debug(`主进程接收到消息: ${JSON.stringify(message)}`);
            switch (message.type) {
                case "requestItem":
                    // 处理子进程请求新任务的逻辑
                    let rpc = randomRpc();
                    let taskNum = privateKeys.length;
                    let privateKey = privateKeys.shift();
                    // 如果 privateKeys 或 buyerPrivateKey 为空，则关闭该子进程
                    if (!privateKey) {
                        // child.kill();
                        //让子进程重试次数
                        child.send({
                            rpc,
                            privateKey,
                            taskNum: 0
                        })
                        break;
                    }
                    child.send({
                        rpc,
                        privateKey,
                        taskNum,
                    });
                    // 假设这里有逻辑来检查是否还有剩余任务，然后发送任务信息给子进程
                    break;
                case "result":
                    // 处理子进程发送的操作结果
                    let messageStatus = message.status;
                    if (messageStatus === true) {
                        total--;
                        //保存成功地址
                        fs.appendFileSync(
                            successPath,
                            `${message.privateKey.address}----${message.privateKey.privateKey}\n`
                        );
                        if (total === 0) {
                            logger.info(`任务执行完毕`);
                            process.exit(0);
                        }
                    }
                    break;
                case "log":
                    // 处理子进程发送的日志信息
                    let level = message.level;
                    logger[level](`第${message.pid} 子进程: ${message.msg}`);
                    break;
                default:
                    console.log("未知消息类型");
            }
        });
    }

    logger.info(`任务执行完毕`);
}

async function getPrivateKeyAndAddress(key) {
    const args = key.split("----");
    const privateKey = args.length >= 2 ? args[1] : args[0];
    let address = args.length >= 2 ? args[0] : null;

    if (!address) {
        try {
            const wallet = await getWallet(privateKey);
            address = wallet.publicKey.toString();
        } catch (error) {
            if (args.length > 0 && args[0] !== "") {
                logger.error(`该数据: ${args}导入私钥失败 错误原因: ${error.message}`);
            }
            return {
                privateKey: null,
                address: null,
            };
        }
    }

    return {privateKey, address};
}

function randomRpc() {
    return RPC_LIST[Math.floor(Math.random() * RPC_LIST.length)];
}

async function filterValidPrivateKeys(buyers) {
    const results = await Promise.all(
        buyers.map(async (key) => {
            const result = await getPrivateKeyAndAddress(key);
            return result.privateKey !== null && result.address !== null
                ? result
                : undefined;
        })
    );
    return results.filter((key) => key !== undefined);
}

async function main() {
    logger.warn(`当前版本为: 1.0.0`);
    logger.warn(`Author:[𝕏] @0xNaiXi`)
    logger.warn(`Author:[𝕏] @0xNaiXi`)
    logger.warn(`Author:[𝕏] @0xNaiXi`)
    //等待初始化完成
    //读取 文件
    const wallets = fs
        .readFileSync(walletAddressFilePath, "utf8")
        .split(/\r?\n/)
        .filter((key) => key);
    privateKeys = await filterValidPrivateKeys(wallets);
    total = privateKeys.length;
    logger.info(`地址数量: ${privateKeys.length}`);
    await handleMintTask();
}

main().catch((err) => {
    logger.error(err);
});
