const { Command, flags } = require("@oclif/command");

const moment = require("moment");
const _ = require("lodash");
const debug = require("debug")("main");

const {
    simulate,
    rules,
    formatFxstr,
    engine,
    reports,
} = require("@wt/lib-stock");

// process.env["NODE_CONFIG_DIR"] = __dirname;
// const options = require("config");

class StocksimCommand extends Command {
    async run() {
        const { flags } = this.parse(StocksimCommand);
        // const name = args.name;
        // this.log(
        //     `执行算法： ${name}, ${flags.n} ${flags.profit} ${flags.loss} ${flags.stoploss}`
        // );
        debug(`%o`, flags);

        // 通过配置文件获得对应的基础配置信息
        const options = require("config");

        // 通过命令后参数，对配置参数进行一些调整
        if (flags.startdate) options.startDate = flags.startdate;
        if (flags.fixcash !== undefined) options.fixCash = flags.fixcash;
        if (flags.showtrans !== undefined) options.showTrans = flags.showtrans;
        if (flags.showworkdays !== undefined)
            options.showWorkdays = flags.showworkdays;

        if (flags.stoploss) options.stoploss.S = Number(flags.stoploss);

        // let options = {
        //     // 基本数据设置
        //     startDate: flags.startdate, // 模拟计算的启动日期
        //     fixCash: flags.fixcash, // 是否固定头寸
        //     initBalance: 1000000, // 初始资金余额 或 固定头寸金额
        //     showTrans: flags.showtrans,
        //     showWorkdays: flags.showworkdays,

        //     // 算法选择
        //     // 基准测试
        //     rules: {
        //         buy: [rules.benchmark],
        //         // sell: [rules.stoploss, rules.benchmark],
        //         sell: [rules.benchmark],
        //     },
        //     // mmb
        //     // rules: {
        //     //     buy: [rules.mmb],
        //     //     sell: [rules.stoploss, rules.mmb],
        //     // },
        //     mmb: {
        //         N: parseInt(flags.n), // 动能平均天数
        //         P: Number(flags.profit), // 动能突破买入百分比
        //         L: Number(flags.loss), // 动能突破卖出百分比
        //         nommb1: flags.nommb1, // 是否执行开盘价锁盈
        //         nommb2: !flags.mmb2, //  是否动能突破买入符合禁止卖出
        //         // nommbsell: flags.nommbsell, // 如果动能突破，则禁止卖出
        //         mmbType: flags.mmbtype, // 波幅类型，hc, hl
        //     },
        //     stoploss: {
        //         S: Number(flags.stoploss), // 止损比例
        //     },
        //     benchmark: {
        //         sellPrice: "open", //"close", // 卖出价位
        //     },

        //     selectedStocks: [
        //         "600489.SH", // 中金黄金
        //         "600276.SH", // 恒瑞医药
        //         "600363.SH", // 联创光电
        //         "000725.SZ", // 京东方A
        //         "600298.SH", // 安琪酵母
        //         "300027.SZ", // 华谊兄弟
        //         "600511.SH", // 国药股份
        //         "601606.SH", // 长城军工
        //         "601628.SH", // 中国人寿
        //         "000568.SZ", // 泸州老窖
        //     ],
        // };

        let buys = "";
        let usedRules = {};
        for (let rule of options.rules.buy) {
            buys += `${rule.name}, `;
            if (!(rule.label in usedRules)) {
                usedRules[rule.label] = rule;
            }
        }

        let sells = "";
        for (let rule of options.rules.sell) {
            sells += `${rule.name}, `;
            if (!(rule.label in usedRules)) {
                usedRules[rule.label] = rule;
            }
        }

        let rules_desc = "";
        for (let label in usedRules) {
            rules_desc += usedRules[label].showOptions(options);
        }

        this.log(
            `初始资金:        ${formatFxstr(options.initBalance)}元 
测试交易资金模式:  ${options.fixCash ? "固定头寸" : "累计账户"}

规则：
买入模型：${buys}
卖出模型：${sells}

${rules_desc}
`
        );
        // 模型 ${rules.mmb.name} 参数：
        // 波幅类型 [${options.mmb.mmbType === "hc" ? "最高-收盘" : "最高-最低"}]
        // 动能平均天数: ${options.mmb.N}
        // 动能突破买入比例: ${options.mmb.P * 100}%
        // 动能突破卖出比例: ${options.mmb.L * 100}%
        // 规则：
        // 1. [${options.mmb.nommb1 ? "🚫" : "✅"}] 开盘盈利锁定
        // 2. [${options.mmb.nommb2 ? "🚫" : "✅"}] 动能向下突破卖出

        // 模型 ${rules.stoploss.name} 参数：
        // 止损比例: ${options.stoploss.S * 100}%
        // `
        // 2. [${options.nommbsell ? "🚫" : "✅"}] 满足动能突破买入时不再卖出

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
        // default: "20190101",
    }),
    n: flags.string({
        char: "n",
        description: "动能突破平均天数",
        // default: "1",
    }),
    profit: flags.string({
        char: "p",
        description: "动能突破买入波幅比例",
        // default: "0.5",
    }),
    loss: flags.string({
        char: "l",
        description: "动能突破卖出波幅比例",
        // default: "0.5",
    }),
    stoploss: flags.string({
        char: "s",
        description: "止损比例",
        // default: "0.1",
    }),
    fixcash: flags.boolean({
        // char: "f",
        description: "是否固定头寸",
        // default: true,
        allowNo: true,
    }),
    mmbtype: flags.string({
        char: "t",
        description: "MMB算法波幅类型，hc|hl",
        // default: "hl",
    }),
    showtrans: flags.boolean({
        description: "是否显示交易列表",
        // default: false,
        allowNo: true,
    }),
    showworkdays: flags.boolean({
        description: "是否显示工作日报表",
        // default: false,
        allowNo: true,
    }),
    nommb1: flags.boolean({
        description: "卖出规则不使用开盘盈利锁定",
        // default: false,
        allowNo: true,
    }),
    mmb2: flags.boolean({
        description: "卖出规则使用动能突破",
        // default: false,
        allowNo: true,
    }),
    // nommbsell: flags.boolean({
    //     description: "不使用规则：如果当日符合动能突破买入，则不卖出",
    //     default: false,
    // }),
};

module.exports = StocksimCommand;
