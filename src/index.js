const { Command, flags } = require("@oclif/command");

const moment = require("moment");
const _ = require("lodash");
const debug = require("debug")("main");

const { simulate, stoploss, formatFxstr } = require("@wt/lib-stock");

class StocksimCommand extends Command {
    async run() {
        const { flags } = this.parse(StocksimCommand);
        // const name = args.name;
        // this.log(
        //     `执行算法： ${name}, ${flags.n} ${flags.profit} ${flags.loss} ${flags.stoploss}`
        // );
        debug(`%o`, flags);

        let options = {
            startDate: flags.startdate, // 模拟计算的启动日期
            fixCash: flags.fixcash, // 是否固定头寸
            initBalance: 1000000, // 初始资金余额 或 固定头寸金额

            N: parseInt(flags.n), // 动能平均天数
            P: Number(flags.profit), // 动能突破买入百分比
            L: Number(flags.loss), // 动能突破卖出百分比
            S: Number(flags.stoploss), // 止损比例
            nommb1: flags.nommb1, // 是否执行开盘价锁盈
            nommb2: flags.nommb2, //  是否动能突破买入符合禁止卖出
            nommbsell: flags.nommbsell, // 如果动能突破，则禁止卖出
            mmbType: flags.mmbtype, // 波幅类型，hc, hl
            showTrans: flags.showtrans,

            stoploss: stoploss, // 止损算法设置
            selectedStocks: [
                "600489.SH", // 中金黄金
                "600276.SH", // 恒瑞医药
                "600363.SH", // 联创光电
                "000725.SZ", // 京东方A
                "600298.SH", // 安琪酵母
                "300027.SZ", // 华谊兄弟
                "600511.SH", // 国药股份
                "601606.SH", // 长城军工
                "601628.SH", // 中国人寿
                "000568.SZ", // 泸州老窖
            ],
        };

        this.log(
            `初始资金:        ${formatFxstr(options.initBalance)}元 
测试交易资金模式:  ${options.fixCash ? "固定头寸" : "累计账户"}

模型参数：
波幅类型 [${options.mmbType === "hc" ? "最高-收盘" : "最高-最低"}]
动能平均天数: ${options.N}
动能突破买入比例: ${options.P * 100}%
动能突破卖出比例: ${options.L * 100}%
止损比例: ${options.S * 100}%

卖出规则：
1. [✅] 止损
2. [${options.nommbsell ? "🚫" : "✅"}] 满足动能突破买入时不再卖出
3. [${options.nommb1 ? "🚫" : "✅"}] 开盘盈利锁定
4. [${options.nommb2 ? "🚫" : "✅"}] 动能向下突破卖出
`
        );

        await simulate(options);
    }
}

StocksimCommand.description = `Describe the command here
...
数据分析算法入口
`;

// StocksimCommand.args = [
//     {
//         name: "name",
//         required: false,
//         description: "算法代码，用于指定执行哪个算法",
//     },
// ];

StocksimCommand.flags = {
    // add --version flag to show CLI version
    version: flags.version({ char: "v" }),
    // add --help flag to show CLI version
    help: flags.help({ char: "h" }),

    startdate: flags.string({
        char: "d",
        description: "模拟计算的启动日期",
        default: "20190101",
    }),
    n: flags.string({
        char: "n",
        description: "动能突破平均天数",
        default: "1",
    }),
    profit: flags.string({
        char: "p",
        description: "动能突破买入波幅比例",
        default: "0.5",
    }),
    loss: flags.string({
        char: "l",
        description: "动能突破卖出波幅比例",
        default: "0.5",
    }),
    stoploss: flags.string({
        char: "s",
        description: "止损比例",
        default: "0.1",
    }),
    fixcash: flags.boolean({
        // char: "f",
        description: "是否固定头寸",
        default: true,
        allowNo: true,
    }),
    mmbtype: flags.string({
        char: "t",
        description: "MMB算法波幅类型，hc|hl",
        default: "hl",
    }),
    showtrans: flags.boolean({
        description: "是否显示交易列表",
        default: false,
    }),
    nommb1: flags.boolean({
        description: "卖出规则不使用开盘盈利锁定",
        default: false,
    }),
    nommb2: flags.boolean({
        description: "卖出规则不使用动能突破",
        default: false,
    }),
    nommbsell: flags.boolean({
        description: "不使用规则：如果当日符合动能突破买入，则不卖出",
        default: false,
    }),
};

module.exports = StocksimCommand;
