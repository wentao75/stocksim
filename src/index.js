const { Command, flags } = require("@oclif/command");

const {
    readStockList,
    readStockData,
    stockDataNames,
} = require("@wt/lib-wtda-query");
const { filter } = require("lodash");

const moment = require("moment");
const _ = require("lodash");
const debug = require("debug")("main");

const mmb = require("./momentum-breakthrough");
const sl = require("./stoploss");
const engine = require("./transaction-engine");
class StocksimCommand extends Command {
    async run() {
        const { args, flags } = this.parse(StocksimCommand);
        const name = args.name;
        // this.log(
        //     `执行算法： ${name}, ${flags.n} ${flags.profit} ${flags.loss} ${flags.stoploss}`
        // );

        let options = {
            fixCash: flags.fixcash, // 是否固定头寸
            initBalance: 1000000, // 初始资金余额

            N: parseInt(flags.n), // 动能平均天数
            P: Number(flags.profit), // 动能突破买入百分比
            L: Number(flags.loss), // 动能突破卖出百分比
            S: Number(flags.stoploss), // 止损比例
            OS: flags.lockprofit, // 是否执行开盘价锁盈

            mmbType: "hl", // 波幅类型，hc, hl
            stoploss: sl, // 止损算法设置
            selectedStocks: [
                "600489.SH",
                "600276.SH",
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
                flags.fixcash ? "固定头寸" : "累计账户"
            }
动能平均天数 ${options.N}, 动能突破买入 ${options.P * 100}%, 动能突破卖出 ${
                options.L * 100
            }%，
止损比例 ${options.S * 100}%, 开盘盈利锁定：${options.OS}, 波幅类型 ${
                options.mmbType === "hc" ? "最高-收盘" : "最高-最低"
            }`
        );

        // 首先根据设置获得列表，列表内容为需要进行算法计算的各个股票
        //  TODO: 这里先读取全部的列表
        let stockListData = await readStockList();
        if (!stockListData || !stockListData.data) {
            this.log(`没有读取到股票列表，无法处理日线数据`);
            return;
        }
        let stockList = stockListData.data;
        // 重新过滤可用的
        stockList = await filterStockList(stockList, options);
        this.log(`算法执行 ${stockList && stockList.length} 个数据`);
        // data存放股票列表的基本信息：
        // {
        //      ts_code: '000001.SZ', symbol: '000001', name: '平安银行',
        //      market: '主板', exchange: 'SZSE',
        //      area: '深圳', industry: '银行', fullname: '平安银行股份有限公司',
        //      enname: 'Ping An Bank Co., Ltd.', curr_type: 'CNY',
        //      list_status: 'L', list_date: '19910403', delist_date: null, is_hs: 'S'
        // }
        // this.log(`%o`, stockList[0]);
        // 后续的执行为列表的循环计算，这里的算法因为主要是CPU计算类型，只有输入和输出部分有I/O运算，因此不考虑

        // 下一步开始按照给出的数据循环进行处理
        for (let stockItem of stockList) {
            // this.log(`处理数据：%o`, stockItem);

            // 首先读取日线信息
            let stockData = await readStockData(
                stockDataNames.daily,
                stockItem.ts_code
            );
            // 准备资金账户数据
            let capitalData = {
                balance: options.initBalance, // 初始资金
                stock: { info: null, count: 0, price: 0 }, // 持有股票信息
                transactions: [], // 交易记录 {date: , count: 交易数量, price: 交易价格, total: 总金额, amount: 总价, fee: 交易费用, memo: 备注信息}
            };
            if (stockData) {
                this.log(
                    `[${stockItem.ts_code}]${
                        stockItem.name
                    } 【数据更新时间：${moment(stockData.updateTime).format(
                        "YYYY-MM-DD HH:mm"
                    )}】`
                );
                // 日线数据条数 ${
                //     stockData.data && stockData.data.length
                // }, 从${stockData.startDate}到${
                //     stockData.endDate
                // }，

                // 首先过滤历史数据，这里将日线数据调整为正常日期从历史到现在
                stockData = await filterStockData(stockData);

                // 全部数据调整为前复权后再执行计算
                calculatePrevAdjPrice(stockData);

                // 开始按照日期执行交易算法
                let startDate = moment("20180101", "YYYYMMDD");
                let currentDate = null;
                for (let index = 0; index < stockData.data.length; index++) {
                    let daily = stockData.data[index];
                    let tradeDate = moment(daily.trade_date, "YYYYMMDD");
                    if (_.isEmpty(currentDate)) {
                        if (startDate.isAfter(tradeDate)) {
                            continue;
                        }
                        debug(
                            `找到开始日期，开始执行算法！${index}, ${daily.trade_date}`
                        );
                    }
                    currentDate = tradeDate;
                    // this.log(`%o`, engine);
                    let trans = await engine.executeTransaction(
                        mmb,
                        currentDate,
                        index,
                        stockData.data,
                        stockItem,
                        capitalData,
                        options
                    );
                }

                engine.logCapitalReport(this.log, capitalData);
                engine.logTransactions(this.log, capitalData);
            } else {
                this.log(
                    `[${stockItem.ts_code}]${stockItem.name} 没有日线数据，请检查！`
                );
            }
        }
    }
}

function calculatePrevAdjPrice(dailyData, digits = 3) {
    if (dailyData && dailyData.data && dailyData.data.length > 0) {
        dailyData.data.forEach((item) => {
            if (item.prevadj_factor) {
                item.open = Number(
                    (item.open * item.prevadj_factor).toFixed(digits)
                );
                item.close = Number(
                    (item.close * item.prevadj_factor).toFixed(digits)
                );
                item.high = Number(
                    (item.high * item.prevadj_factor).toFixed(digits)
                );
                item.low = Number(
                    (item.low * item.prevadj_factor).toFixed(digits)
                );
                item.pre_close = Number(
                    (item.pre_close * item.prevadj_factor).toFixed(digits)
                );
                item.change = Number(
                    (item.change * item.prevadj_factor).toFixed(digits)
                );
            }
        });
    }
}

/**
 * 这里定义一个过滤列表的接口方法，利用options来过滤后续使用的股票
 * 返回为一个符合条件的列表
 * 这里后续考虑调整一下接口定义，目前暂时简化处理
 */
async function filterStockList(stockList, options) {
    // let retStockList = [];
    return options.selectedStocks.map((tsCode) => {
        let tmp = stockList.filter((item) => {
            return item.ts_code === tsCode;
        });
        // console.log(`${tmp && tmp.length}, %o`, tmp[0]);
        return tmp[0];
    });
    // stockList.filter((item) => {
    //     return options.selectedStocks.indexOf(item.ts_code) >= 0;
    // });
    // retStockList.push(stockList[3000]);
    // return retStockList;
}

/**
 * 这里提供对单个数据的调整，主要应当是一些额外的数据计算添加，周期过滤等
 *
 * @param {*} stockData 股票日线数据对象
 * @param {*} options 数据过滤条件
 */
async function filterStockData(stockData, options) {
    stockData.data.reverse();
    return stockData;
}

function formatFxstr(num) {
    return num.toLocaleString("zh-CN"); //, { style: "currency", currency: "CNY" });
}

// /**
//  * 主算法过程，动能穿透
//  * 1. 计算前N日的振幅平均
//  * 2. 以今日开盘+前N日平均振幅的百分比P确定买入条件，形成买入交易
//  * 3. 以今日开盘-前N日平均振幅的百分比P确定卖出条件，形成卖出交易
//  * 4. 止损点：买入点减去前N日波幅的百分比P或者损失比例S，执行卖出
//  * @param {*} tradeDate 当前计算交易日
//  * @param {*} index 当前日股票数据索引
//  * @param {*} stockData 股票数据信息
//  * @param {*} stockInfo 股票信息
//  * @param {*} capitalData 账户信息
//  * @param {*} options 算法参数
//  */
// async function executeTransaction(
//     tradeMethod,
//     tradeDate,
//     index,
//     stockData,
//     stockInfo,
//     capitalData,
//     options
// ) {
//     // 首先检查卖出
//     // debug("执行卖出检查");
//     let translog = tradeMethod.checkSellTransaction(
//         capitalData && capitalData.stock,
//         tradeDate,
//         index,
//         stockData,
//         options
//     );
//     if (executeCapitalSettlement(tradeDate, stockInfo, translog, capitalData)) {
//         console.log(
//             `卖出交易：${tradeDate.format(
//                 "YYYYMMDD"
//             )}，价格：${translog.price.toFixed(2)}元，数量：${
//                 translog.count / 100
//             }手，总价：${translog.total.toFixed(
//                 2
//             )}元[佣金${translog.commission.toFixed(
//                 2
//             )}元，过户费${translog.fee.toFixed(
//                 2
//             )}，印花税${translog.duty.toFixed(2)}元], ${translog.memo}`
//         );
//         // return translog;
//     }

//     // 检查止损
//     // debug("执行止损检查");
//     translog = checkStoplossTransaction(
//         capitalData && capitalData.stock,
//         tradeDate,
//         index,
//         stockData,
//         options
//     );
//     if (executeCapitalSettlement(tradeDate, stockInfo, translog, capitalData)) {
//         console.log(
//             `卖出交易：${tradeDate.format(
//                 "YYYYMMDD"
//             )}，价格：${translog.price.toFixed(2)}元，数量：${
//                 translog.count / 100
//             }手，总价：${translog.total.toFixed(
//                 2
//             )}元[佣金${translog.commission.toFixed(
//                 2
//             )}元，过户费${translog.fee.toFixed(
//                 2
//             )}，印花税${translog.duty.toFixed(2)}元], ${translog.memo}`
//         );
//         // return translog;
//     }

//     // 执行买入
//     // debug("执行买入检查");
//     translog = checkMMBBuyTransaction(
//         capitalData.balance,
//         stockInfo,
//         tradeDate,
//         index,
//         stockData,
//         options
//     );
//     // debug(`买入结果：%o`, translog);
//     if (executeCapitalSettlement(tradeDate, stockInfo, translog, capitalData)) {
//         console.log(
//             `买入交易：${tradeDate.format(
//                 "YYYYMMDD"
//             )}，价格：${translog.price.toFixed(2)}元，数量：${
//                 translog.count / 100
//             }手，总价：${translog.total.toFixed(
//                 2
//             )}元[佣金${translog.commission.toFixed(
//                 2
//             )}元，过户费${translog.fee.toFixed(
//                 2
//             )}，印花税${translog.duty.toFixed(2)}元], ${translog.memo}`
//         );
//         // debug(`股票信息：%o`, stockInfo);
//         // debug(`账户信息：%o`, capitalData);
//         // return translog;
//     }
// }

// /**
//  * 检查买入条件
//  * @param {double} balance 账户余额
//  * @param {*} tradeDate 交易日期
//  * @param {int} index 交易日数据索引位置
//  * @param {*} stockData 数据
//  * @param {*} options 算法参数
//  */
// function checkMMBBuyTransaction(
//     balance,
//     stockInfo,
//     tradeDate,
//     index,
//     stockData,
//     options
// ) {
//     if (balance <= 0) return;
//     // debug(`买入检查: %o, ${index}`, stockData);

//     // 平均波幅的计算日数
//     let N = (options && options.N) || 1;
//     // 波幅突破的百分比
//     let P = (options && options.P) || 0.5;

//     let moment = 0;
//     for (let i = 0; i < N; i++) {
//         if (index - i - 1 >= 0) {
//             let tmp = stockData[index - i - 1];
//             moment += tmp.high - tmp.low;
//         }
//     }
//     moment = moment / N;

//     let currentData = stockData[index];
//     let targetPrice = currentData.open + moment * P;

//     debug(
//         `买入条件检查${tradeDate.format("YYYYMMDD")}: ${targetPrice}=${
//             currentData.open
//         }+${moment.toFixed(2)}*${P} [o: ${currentData.open}, h: ${
//             currentData.high
//         }, l: ${currentData.low}]`
//     );
//     if (currentData.high >= targetPrice && currentData.low <= targetPrice) {
//         // 执行买入交易
//         debug(`符合条件：${tradeDate.format("YYYYMMDD")}`);
//         return createBuyTransaction(
//             stockInfo,
//             tradeDate,
//             balance,
//             targetPrice,
//             `动能突破买入 ${targetPrice.toFixed(2)} (=${
//                 currentData.open
//             }+${moment.toFixed(2)}*${(P * 100).toFixed(2)}%)`
//         );
//     }
// }

// /**
//  * 检查是否可以生成卖出交易，如果可以卖出，产生卖出交易记录
//  *
//  * @param {*} stock 持仓信息
//  * @param {*} tradeDate 交易日
//  * @param {*} index 今日数据索引位置
//  * @param {*} stockData 日线数据
//  * @param {*} options 算法参数
//  */
// function checkMMBSellTransaction(stock, tradeDate, index, stockData, options) {
//     if (_.isEmpty(stock) || stock.count <= 0) return;

//     // 平均波幅的计算日数
//     let N = (options && options.N) || 1;
//     // 止损使用的波幅下降百分比
//     let L = (options && options.L) || 0.5;
//     let currentData = stockData[index];

//     // 目前有持仓，检查是否达到盈利卖出条件
//     if (currentData.open > stock.price) {
//         // 采用第二天开盘价盈利就卖出的策略
//         return createSellTransaction(
//             stock.info,
//             tradeDate,
//             stock.count,
//             currentData.open,
//             `开盘盈利卖出 ${currentData.open} (> ${stock.price.toFixed(2)})`
//         );
//     }

//     // // 有持仓，检查是否达到卖出条件
//     // // 第一个卖出条件是买入后按照买入价格及波动数据的反向百分比设置
//     // let moment = 0;
//     // for (let i = 0; i < N; i++) {
//     //     if (index - i - 1 >= 0) {
//     //         let tmp = stockData[index - i - 1];
//     //         moment += tmp.high - tmp.low;
//     //     }
//     // }
//     // moment = moment / N;

//     // let targetPrice = currentData.open - moment * L;
//     // // let targetPrice2 = stock.price - moment * L;
//     // // let targetPrice =
//     // //     targetPrice1 >= targetPrice2 ? targetPrice1 : targetPrice2;

//     // if (targetPrice <= currentData.high && targetPrice >= currentData.low) {
//     //     // 执行波动卖出
//     //     return createSellTransaction(
//     //         stock.info,
//     //         tradeDate,
//     //         stock.count,
//     //         targetPrice,
//     //         `动能突破卖出：${targetPrice.toFixed(2)} (= ${
//     //             currentData.open
//     //         }-${moment.toFixed(2)}*${L * 100}%)`
//     //     );
//     // }
// }

// /**
//  * 检查是否需要执行止损
//  * @param {*} stock 持仓信息
//  * @param {*} tradeDate 交易日期
//  * @param {int} index 交易日索引位置
//  * @param {*} stockData 日线数据
//  */
// function checkStoplossTransaction(stock, tradeDate, index, stockData, options) {
//     if (_.isEmpty(stock) || stock.count <= 0) return;
//     let currentData = stockData[index];
//     // 止损最大损失比例
//     let S = (options && options.S) || 0.1;

//     // 这里检查纯粹的百分比止损
//     let lossPrice = stock.price * (1 - S);
//     if (currentData.high >= lossPrice && currentData.low <= lossPrice) {
//         // 当日价格范围达到止损值
//         return createSellTransaction(
//             stock.info,
//             tradeDate,
//             stock.count,
//             lossPrice,
//             `止损 ${lossPrice.toFixed(2)} (=${stock.price.toFixed(2)}*(1-${
//                 S * 100
//             }%))`
//         );
//     }
// }

// /**
//  * 根据交易记录完成账户清算
//  * @param {*} tradeDate 交易日期
//  * @param {*} stockInfo 股票信息
//  * @param {*} translog 交易记录
//  * @param {*} capitalData 账户数据
//  */
// function executeCapitalSettlement(tradeDate, stockInfo, translog, capitalData) {
//     // debug(`执行清算 %o`, translog);
//     if (_.isEmpty(translog)) return false;
//     if (translog.total + capitalData.balance < 0) {
//         console.log(
//             `账户余额${capitalData.balance}不足(${
//                 translog.total
//             })，无法完成清算，交易取消! 交易信息: ${
//                 translog.type === "buy" ? "买入" : "卖出"
//             }${stockInfo.ts_code} ${translog.count}股，价格${
//                 translog.price
//             }，共计${translog.total}元[含佣金${translog.commission}元，过户费${
//                 translog.fee
//             }，印花税${translog.duty}元]`
//         );
//         return false;
//     }
//     capitalData.balance += translog.total;
//     if (translog.type === "buy") {
//         capitalData.stock = {
//             info: stockInfo,
//             count: translog.count,
//             price: translog.price,
//         };
//     } else {
//         capitalData.stock = {
//             info: null,
//             count: 0,
//             price: 0,
//         };
//     }
//     capitalData.transactions.push(translog);
//     // debug("完成清算！");
//     return true;
// }

// /**
//  * 创建指定日期和股票信息的卖出交易
//  * @param {*} stockInfo
//  * @param {*} tradeDate
//  * @param {*} count
//  * @param {*} price
//  */
// function createSellTransaction(stockInfo, tradeDate, count, price, memo) {
//     // 计算费用
//     let total = calculateTransactionFee(false, stockInfo, count, price);
//     // 创建卖出交易记录
//     return {
//         date: tradeDate.format("YYYYMMDD"),
//         type: "sell",
//         count,
//         price,
//         total: total.total,
//         amount: total.amount,
//         fee: total.fee,
//         commission: total.commission,
//         duty: total.duty,
//         memo,
//     };
// }

// /**
//  * 构建买入交易信息
//  * @param {*} stockInfo 股票信息
//  * @param {*} tradeDate 交易日期
//  * @param {*} balance 可用余额
//  * @param {*} price 买入价格
//  */
// function createBuyTransaction(stockInfo, tradeDate, balance, price, memo) {
//     // 计算费用
//     let count = parseInt(balance / price / 100) * 100;
//     // 最小交易单位为1手，资金不足放弃！
//     if (count < 100) return;
//     let total = calculateTransactionFee(true, stockInfo, count, price);
//     // 创建买入交易记录
//     return {
//         date: tradeDate.format("YYYYMMDD"),
//         type: "buy",
//         count: count,
//         price,
//         total: total.total,
//         amount: total.amount,
//         fee: total.fee,
//         commission: total.commission,
//         duty: total.duty,
//         memo,
//     };
// }

// /**
//  * 计算交易价格和费用
//  * @param {boolean}} buy 买卖标记
//  * @param {*} stockInfo 股票信息
//  * @param {*} count 买卖数量
//  * @param {*} price 买卖单价
//  */
// function calculateTransactionFee(buy, stockInfo, count, price) {
//     let amount = count * price;
//     let commission = (amount * 0.25) / 1000;
//     let fee = 0.0;
//     let duty = 0.0;
//     if (stockInfo.exchange === "SSE") {
//         // 上海，过户费千分之0.2
//         fee += (amount * 0.02) / 1000;
//     } else if (stockInfo.exchange === "SZSE") {
//         // 深圳，无
//     }
//     // 印花税，仅对卖方收取
//     if (!buy) {
//         duty += (amount * 1) / 1000;
//     }

//     let total = 0.0;
//     if (buy) {
//         total = 0 - (amount + commission + fee + duty);
//     } else {
//         total = amount - commission - fee - duty;
//     }

//     return { total, amount, commission, fee, duty };
// }

StocksimCommand.description = `Describe the command here
...
数据分析算法入口
`;

StocksimCommand.args = [
    {
        name: "name",
        required: false,
        description: "算法代码，用于指定执行哪个算法",
    },
];

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
    }),
    fixcash: flags.boolean({
        char: "f",
        description: "是否固定头寸",
        default: true,
    }),
};

module.exports = StocksimCommand;
