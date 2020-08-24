const { Command, flags } = require("@oclif/command");

// const {
//     readStockList,
//     readStockData,
//     stockDataNames,
// } = require("@wt/lib-wtda-query");
// const { filter } = require("lodash");

const moment = require("moment");
const _ = require("lodash");
const debug = require("debug")("main");

// const mmb = require("./momentum-breakthrough");
// const sl = require("./stoploss");
// const engine = require("./transaction-engine");
const { simulate, stoploss, formatFxstr } = require("@wt/lib-stock");

class StocksimCommand extends Command {
    async run() {
        const { flags } = this.parse(StocksimCommand);
        // const name = args.name;
        // this.log(
        //     `执行算法： ${name}, ${flags.n} ${flags.profit} ${flags.loss} ${flags.stoploss}`
        // );
        this.log(`%o`, flags);

        let options = {
            fixCash: flags.fixcash, // 是否固定头寸
            initBalance: 1000000, // 初始资金余额 或 固定头寸金额

            N: parseInt(flags.n), // 动能平均天数
            P: Number(flags.profit), // 动能突破买入百分比
            L: Number(flags.loss), // 动能突破卖出百分比
            S: Number(flags.stoploss), // 止损比例
            OS: flags.lockprofit, // 是否执行开盘价锁盈
            mmbType: flags.mmbtype, // 波幅类型，hc, hl
            showTrans: flags.showtrans,

            stoploss: stoploss, // 止损算法设置
            selectedStocks: [
                "600489.SH",
                // "600276.SH",
                // "600363.SH",
                // "000725.SZ",
                // "600298.SH",
                // "300027.SZ",
                // "600511.SH",
                // "601606.SH",
                // "601628.SH",
            ],
        };

        // if (!flags.n) options.N = parseInt(flags.n);
        // if (!flags.profit) options.P = Number(flags.profit);
        // if (!flags.loss) options.L = Number(flags.loss);
        // if (!flags.stoploss) options.S = Number(flags.stoploss);

        this.log(
            `参数 初始资金：${formatFxstr(options.initBalance)}元 ${
                options.fixCash
            } ${options.fixCash ? "固定头寸" : "累计账户"}
动能平均天数 ${options.N}, 动能突破买入 ${options.P * 100}%, 动能突破卖出 ${
                options.L * 100
            }%，
止损比例 ${options.S * 100}%, 开盘盈利锁定：${options.OS}, 波幅类型 ${
                options.mmbType === "hc" ? "最高-收盘" : "最高-最低"
            }`
        );

        await simulate(options);

        // // 首先根据设置获得列表，列表内容为需要进行算法计算的各个股票
        // //  TODO: 这里先读取全部的列表
        // let stockListData = await readStockList();
        // if (!stockListData || !stockListData.data) {
        //     this.log(`没有读取到股票列表，无法处理日线数据`);
        //     return;
        // }
        // let stockList = stockListData.data;
        // // 重新过滤可用的
        // stockList = await filterStockList(stockList, options);
        // this.log(`算法执行 ${stockList && stockList.length} 个数据`);
        // // data存放股票列表的基本信息：
        // // {
        // //      ts_code: '000001.SZ', symbol: '000001', name: '平安银行',
        // //      market: '主板', exchange: 'SZSE',
        // //      area: '深圳', industry: '银行', fullname: '平安银行股份有限公司',
        // //      enname: 'Ping An Bank Co., Ltd.', curr_type: 'CNY',
        // //      list_status: 'L', list_date: '19910403', delist_date: null, is_hs: 'S'
        // // }
        // // this.log(`%o`, stockList[0]);
        // // 后续的执行为列表的循环计算，这里的算法因为主要是CPU计算类型，只有输入和输出部分有I/O运算，因此不考虑

        // // 下一步开始按照给出的数据循环进行处理
        // for (let stockItem of stockList) {
        //     // this.log(`处理数据：%o`, stockItem);

        //     // 首先读取日线信息
        //     let stockData = await readStockData(
        //         stockDataNames.daily,
        //         stockItem.ts_code
        //     );
        //     // 准备资金账户数据
        //     let capitalData = {
        //         balance: options.initBalance, // 初始资金
        //         stock: { info: null, count: 0, price: 0 }, // 持有股票信息
        //         transactions: [], // 交易记录 {date: , count: 交易数量, price: 交易价格, total: 总金额, amount: 总价, fee: 交易费用, memo: 备注信息}
        //     };
        //     if (stockData) {
        //         this.log(
        //             `[${stockItem.ts_code}]${
        //                 stockItem.name
        //             } 【数据更新时间：${moment(stockData.updateTime).format(
        //                 "YYYY-MM-DD HH:mm"
        //             )}】`
        //         );
        //         // 日线数据条数 ${
        //         //     stockData.data && stockData.data.length
        //         // }, 从${stockData.startDate}到${
        //         //     stockData.endDate
        //         // }，

        //         // 首先过滤历史数据，这里将日线数据调整为正常日期从历史到现在
        //         stockData = await filterStockData(stockData);

        //         // 全部数据调整为前复权后再执行计算
        //         calculatePrevAdjPrice(stockData);

        //         // 开始按照日期执行交易算法
        //         let startDate = moment("20190101", "YYYYMMDD");
        //         let currentDate = null;
        //         for (let index = 0; index < stockData.data.length; index++) {
        //             let daily = stockData.data[index];
        //             let tradeDate = moment(daily.trade_date, "YYYYMMDD");
        //             if (_.isEmpty(currentDate)) {
        //                 if (startDate.isAfter(tradeDate)) {
        //                     continue;
        //                 }
        //                 debug(
        //                     `找到开始日期，开始执行算法！${index}, ${daily.trade_date}`
        //                 );
        //             }
        //             currentDate = tradeDate;
        //             // this.log(`%o`, engine);
        //             let trans = await engine.executeTransaction(
        //                 mmb,
        //                 currentDate,
        //                 index,
        //                 stockData.data,
        //                 stockItem,
        //                 capitalData,
        //                 options
        //             );
        //         }

        //         engine.logCapitalReport(this.log, capitalData);
        //         // engine.logTransactions(this.log, capitalData);
        //     } else {
        //         this.log(
        //             `[${stockItem.ts_code}]${stockItem.name} 没有日线数据，请检查！`
        //         );
        //     }
        // }
    }
}

// function calculatePrevAdjPrice(dailyData, digits = 3) {
//     if (dailyData && dailyData.data && dailyData.data.length > 0) {
//         dailyData.data.forEach((item) => {
//             if (item.prevadj_factor) {
//                 item.open = Number(
//                     (item.open * item.prevadj_factor).toFixed(digits)
//                 );
//                 item.close = Number(
//                     (item.close * item.prevadj_factor).toFixed(digits)
//                 );
//                 item.high = Number(
//                     (item.high * item.prevadj_factor).toFixed(digits)
//                 );
//                 item.low = Number(
//                     (item.low * item.prevadj_factor).toFixed(digits)
//                 );
//                 item.pre_close = Number(
//                     (item.pre_close * item.prevadj_factor).toFixed(digits)
//                 );
//                 item.change = Number(
//                     (item.change * item.prevadj_factor).toFixed(digits)
//                 );
//             }
//         });
//     }
// }

// /**
//  * 这里定义一个过滤列表的接口方法，利用options来过滤后续使用的股票
//  * 返回为一个符合条件的列表
//  * 这里后续考虑调整一下接口定义，目前暂时简化处理
//  */
// async function filterStockList(stockList, options) {
//     // let retStockList = [];
//     return options.selectedStocks.map((tsCode) => {
//         let tmp = stockList.filter((item) => {
//             return item.ts_code === tsCode;
//         });
//         // console.log(`${tmp && tmp.length}, %o`, tmp[0]);
//         return tmp[0];
//     });
//     // stockList.filter((item) => {
//     //     return options.selectedStocks.indexOf(item.ts_code) >= 0;
//     // });
//     // retStockList.push(stockList[3000]);
//     // return retStockList;
// }

// /**
//  * 这里提供对单个数据的调整，主要应当是一些额外的数据计算添加，周期过滤等
//  *
//  * @param {*} stockData 股票日线数据对象
//  * @param {*} options 数据过滤条件
//  */
// async function filterStockData(stockData, options) {
//     stockData.data.reverse();
//     return stockData;
// }

// function formatFxstr(num) {
//     return num.toLocaleString("zh-CN"); //, { style: "currency", currency: "CNY" });
// }

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
    lockprofit: flags.boolean({
        char: "o",
        description: "是否开盘盈利锁定",
        default: true,
        allowNo: true,
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
};

module.exports = StocksimCommand;
