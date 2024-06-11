const Worker = require("../src/worker.js");
const {Logger} = require("./newLog.js");
const index = process.argv[2];
const logger = new Logger(index);
let counts = 5;

async function processMessage(message) {
    if (message.taskNum > 0) {
        counts = 5;
        try {
            const {rpc, privateKey} = message;
            logger.debug(`交易获取到地址: ${privateKey.address} `);

            if (rpc && privateKey.privateKey) {
                const p = new Worker(index, rpc, privateKey.privateKey);
                const initResult = await p.init();
                if (!initResult) {
                    throw new Error("任务初始化失败");
                }
                const {success} = await p.work();
                if (!success) {
                    logger.info(`地址: ${privateKey.address} 领取失败`);
                } else {
                    process.send({
                        type: "result",
                        privateKey: privateKey,
                        status: true,
                    });
                    logger.info(`地址: ${privateKey.address} 领取成功`);
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
            process.send({type: "requestItem"});
        } catch (error) {
            logger.error(`出现错误 ${error}`);
            process.exit(1);
        }
    } else {
        counts--;
        if (counts === 0) {
            logger.info(`任务执行完毕`);
            process.exit(0);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        process.send({type: "requestItem"});
    }
}

process.on("message", processMessage);
process.send({type: "requestItem"});
