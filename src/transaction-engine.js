const moment = require("moment");
const _ = require("lodash");
const debug = require("debug")("trans");

/**
 * 主算法过程，动能穿透
 * 1. 计算前N日的振幅平均
 * 2. 以今日开盘+前N日平均振幅的百分比P确定买入条件，形成买入交易
 * 3. 以今日开盘-前N日平均振幅的百分比P确定卖出条件，形成卖出交易
 * 4. 止损点：买入点减去前N日波幅的百分比P或者损失比例S，执行卖出
 * @param {*} tradeDate 当前计算交易日
 * @param {*} index 当前日股票数据索引
 * @param {*} stockData 股票数据信息
 * @param {*} stockInfo 股票信息
 * @param {*} capitalData 账户信息
 * @param {*} options 算法参数
 */
async function executeTransaction(
    tradeMethod,
    tradeDate,
    index,
    stockData,
    stockInfo,
    capitalData,
    options
) {
    let translog = null;
    // 首先检查卖出
    // 所有算法首先检查并处理止损
    // 检查是否需要止损
    if (options.stoploss) {
        translog = options.stoploss.checkStoplossTransaction(
            capitalData && capitalData.stock,
            tradeDate,
            index,
            stockData,
            options
        );
        if (
            executeCapitalSettlement(
                tradeDate,
                stockInfo,
                translog,
                capitalData,
                options
            )
        ) {
            debug(
                `卖出止损：${tradeDate.format("YYYYMMDD")}，价格：${formatFxstr(
                    translog.price
                )}元，数量：${
                    translog.count / 100
                }手，总价：${translog.total.toFixed(
                    2
                )}元[佣金${translog.commission.toFixed(
                    2
                )}元，过户费${translog.fee.toFixed(
                    2
                )}，印花税${translog.duty.toFixed(2)}元], ${translog.memo}`
            );
            // return translog;
        }
    }

    // debug("执行卖出检查");
    translog = tradeMethod.checkSellTransaction(
        capitalData && capitalData.stock,
        tradeDate,
        index,
        stockData,
        options
    );
    if (
        executeCapitalSettlement(
            tradeDate,
            stockInfo,
            translog,
            capitalData,
            options
        )
    ) {
        debug(
            `卖出交易：${tradeDate.format(
                "YYYYMMDD"
            )}，价格：${translog.price.toFixed(2)}元，数量：${
                translog.count / 100
            }手，总价：${translog.total.toFixed(
                2
            )}元[佣金${translog.commission.toFixed(
                2
            )}元，过户费${translog.fee.toFixed(
                2
            )}，印花税${translog.duty.toFixed(2)}元], ${translog.memo}`
        );
        // return translog;
    }

    // 检查是否仍然有持仓
    if (capitalData && capitalData.stock && capitalData.stock.count > 0) return;
    // 执行买入
    // debug("执行买入检查");
    let cash = capitalData.balance;
    if (options.fixCash) cash = options.initBalance;
    translog = tradeMethod.checkBuyTransaction(
        cash,
        stockInfo,
        tradeDate,
        index,
        stockData,
        options
    );
    // debug(`买入结果：%o`, translog);
    if (
        executeCapitalSettlement(
            tradeDate,
            stockInfo,
            translog,
            capitalData,
            options
        )
    ) {
        debug(
            `买入交易：${tradeDate.format(
                "YYYYMMDD"
            )}，价格：${translog.price.toFixed(2)}元，数量：${
                translog.count / 100
            }手，总价：${translog.total.toFixed(
                2
            )}元[佣金${translog.commission.toFixed(
                2
            )}元，过户费${translog.fee.toFixed(
                2
            )}，印花税${translog.duty.toFixed(2)}元], ${translog.memo}`
        );
        // debug(`股票信息：%o`, stockInfo);
        // debug(`账户信息：%o`, capitalData);
        // return translog;
    }
}

/**
 * 根据交易记录完成账户清算
 * @param {*} tradeDate 交易日期
 * @param {*} stockInfo 股票信息
 * @param {*} translog 交易记录
 * @param {*} capitalData 账户数据
 */
function executeCapitalSettlement(
    tradeDate,
    stockInfo,
    translog,
    capitalData,
    options
) {
    // debug(`执行清算 %o`, translog);
    if (_.isEmpty(translog)) return false;
    // 检查当前提供的交易是否可以进行，主要是针对累计账户买卖模式下买入交易是否会造成余额不足
    if (!options.fixCash && translog.total + capitalData.balance < 0) {
        debug(
            `账户余额${capitalData.balance}不足(${
                translog.total
            })，无法完成清算，交易取消! 交易信息: ${
                translog.type === "buy" ? "买入" : "卖出"
            }${stockInfo.ts_code} ${translog.count}股，价格${
                translog.price
            }，共计${translog.total}元[含佣金${translog.commission}元，过户费${
                translog.fee
            }，印花税${translog.duty}元]`
        );
        return false;
    }

    // 处理交易信息
    capitalData.balance += translog.total;
    // 如果当前买入，stock中放置持股信息和买入交易日志，只有卖出发生时才合并生成一条交易记录，包含两个部分
    if (translog.type === "buy") {
        capitalData.stock = {
            info: stockInfo,
            count: translog.count,
            price: translog.price,
            buy: translog,
        };
    } else {
        let settledlog = {
            tradeDate: translog.tradeDate,
            profit: capitalData.stock.buy.total + translog.total,
            income:
                translog.count * translog.price -
                capitalData.stock.count * capitalData.stock.price,
            buy: capitalData.stock.buy,
            sell: translog,
        };
        capitalData.stock = {
            info: null,
            count: 0,
            price: 0,
        };
        capitalData.transactions.push(settledlog);
    }
    // debug("完成清算！");
    return true;
}

/**
 * 创建指定日期和股票信息的卖出交易
 * @param {*} stockInfo
 * @param {*} tradeDate
 * @param {*} tradeDateIndex
 * @param {*} count
 * @param {*} price
 * @param {*} memo
 */
function createSellTransaction(
    stockInfo,
    tradeDate,
    tradeDateIndex,
    count,
    price,
    methodType,
    memo
) {
    // 计算费用
    let total = calculateTransactionFee(false, stockInfo, count, price);
    // 创建卖出交易记录
    return {
        date: tradeDate.format("YYYYMMDD"),
        dateIndex: tradeDateIndex,
        type: "sell",
        count,
        price,
        total: total.total,
        amount: total.amount,
        fee: total.fee,
        commission: total.commission,
        duty: total.duty,
        methodType,
        memo,
    };
}

/**
 * 构建买入交易信息
 * @param {*} stockInfo 股票信息
 * @param {*} tradeDate 交易日期
 * @param {*} tradeDateIndex 交易日期索引（方便用于计算交易日数）
 * @param {*} balance 可用余额
 * @param {*} price 买入价格
 * @param {*} memo 交易备注
 */
function createBuyTransaction(
    stockInfo,
    tradeDate,
    tradeDateIndex,
    balance,
    price,
    methodType,
    memo
) {
    // 计算费用
    let count = parseInt(balance / price / 100) * 100;
    // 最小交易单位为1手，资金不足放弃！
    if (count < 100) return;
    let total = calculateTransactionFee(true, stockInfo, count, price);
    while (total.total + balance < 0) {
        count -= 100;
        if (count < 100) return;
        total = calculateTransactionFee(true, stockInfo, count, price);
    }
    // 创建买入交易记录
    return {
        date: tradeDate.format("YYYYMMDD"),
        dateIndex: tradeDateIndex,
        type: "buy",
        count: count,
        price,
        total: total.total,
        amount: total.amount,
        fee: total.fee,
        commission: total.commission,
        duty: total.duty,
        methodType,
        memo,
    };
}

/**
 * 计算交易价格和费用
 * @param {boolean}} buy 买卖标记
 * @param {*} stockInfo 股票信息
 * @param {*} count 买卖数量
 * @param {*} price 买卖单价
 */
function calculateTransactionFee(buy, stockInfo, count, price) {
    let amount = count * price;
    let commission = (amount * 0.25) / 1000;
    let fee = 0.0;
    let duty = 0.0;
    if (stockInfo.exchange === "SSE") {
        // 上海，过户费千分之0.2
        fee += (amount * 0.02) / 1000;
    } else if (stockInfo.exchange === "SZSE") {
        // 深圳，无
    }
    // 印花税，仅对卖方收取
    if (!buy) {
        duty += (amount * 1) / 1000;
    }

    let total = 0.0;
    if (buy) {
        total = 0 - (amount + commission + fee + duty);
    } else {
        total = amount - commission - fee - duty;
    }

    return { total, amount, commission, fee, duty };
}

function formatFxstr(num) {
    return num.toLocaleString("zh-CN"); //, { style: "currency", currency: "CNY" });
}

function parseCapital(capitalData) {
    if (_.isEmpty(capitalData)) return;
    // 账户信息中主要需分析交易过程，正常都是为一次买入，一次卖出，这样作为一组交易，获得一次盈利结果
    let count = capitalData.transactions.length;
    let count_win = 0;
    let total_win = 0;
    let count_loss = 0;
    let total_loss = 0;
    let total_profit = 0;
    let total_fee = 0;
    let max_profit = 0;
    let max_loss = 0;
    let average_profit = 0;
    let average_win = 0;
    let average_loss = 0;
    let max_wintimes = 0; // 连续盈利次数
    let max_losstimes = 0; // 连续亏损次数
    let max_windays = 0;
    let max_lossdays = 0;
    let average_windays = 0;
    let average_lossdays = 0;
    // {times: 总次数, win_times: 盈利次数, loss_times: 损失次数}
    let selltypes = {};
    //let selltype_times = {};

    let currentType = 0;
    let tmp_times = 0;
    let tmp_windays = 0;
    let tmp_lossdays = 0;
    for (let log of capitalData.transactions) {
        let days = log.sell.dateIndex - log.buy.dateIndex + 1;

        let selltype = selltypes[log.sell.methodType];
        if (!selltype) {
            selltypes[log.sell.methodType] = {
                times: 1,
                win_times: 0,
                loss_times: 0,
            };
        }
        selltypes[log.sell.methodType].times += 1;

        if (log.profit >= 0) {
            count_win++;
            total_win += log.profit;
            if (max_profit < log.profit) max_profit = log.profit;

            tmp_windays += days;
            if (max_windays < days) max_windays = days;

            // 连续计数
            if (currentType === 1) {
                tmp_times++;
            } else {
                if (currentType === -1) {
                    if (max_losstimes < tmp_times) max_losstimes = tmp_times;
                }
                // 初始化
                currentType = 1;
                tmp_times = 1;
            }

            selltypes[log.sell.methodType].win_times += 1;
        } else {
            count_loss++;
            total_loss += log.profit;
            if (max_loss > log.profit) max_loss = log.profit;

            tmp_lossdays += days;
            if (max_lossdays < days) max_lossdays = days;

            // 连续计数
            if (currentType === -1) {
                tmp_times++;
            } else {
                if (currentType === 1) {
                    if (max_wintimes < tmp_times) max_wintimes = tmp_times;
                }
                // 初始化
                currentType = -1;
                tmp_times = 1;
            }

            selltypes[log.sell.methodType].loss_times += 1;
        }
        total_profit += log.profit;
        total_fee +=
            log.buy.commission +
            log.buy.fee +
            log.buy.duty +
            (log.sell.commission + log.sell.fee + log.sell.duty);
    }

    if (currentType === 1) {
        if (max_wintimes < tmp_times) max_wintimes = tmp_times;
    } else if (currentType === -1) {
        if (max_losstimes < tmp_times) max_losstimes = tmp_times;
    }

    average_profit = total_profit / count;
    average_win = total_win / count_win;
    average_loss = -total_loss / count_loss;

    average_windays = Number((tmp_windays / count_win).toFixed(1));
    average_lossdays = Number((tmp_lossdays / count_loss).toFixed(1));

    return {
        count,
        total_profit,
        total_fee,
        count_win,
        total_win,
        count_loss,
        total_loss,
        max_profit,
        max_loss,
        average_profit,
        average_win,
        average_loss,
        max_wintimes,
        max_losstimes,
        max_windays,
        max_lossdays,
        average_windays,
        average_lossdays,
        selltypes,
    };
}

function logCapitalReport(log, capitalData) {
    log(
        `******************************************************************************************`
    );
    // log(
    //     "*                                                                                                                      *"
    // );
    if (capitalData.stock && capitalData.stock.count > 0) {
        log(
            `  账户价值 ${formatFxstr(
                capitalData.balance +
                    capitalData.stock.count * capitalData.stock.price
            )}元  【余额 ${formatFxstr(capitalData.balance)}元, 持股：${
                capitalData.stock.info.name
            } ${formatFxstr(
                capitalData.stock.count * capitalData.stock.price
            )}元】`
        );
    } else {
        log(`  账户余额 ${formatFxstr(capitalData.balance)}元`);
    }

    let capitalResult = parseCapital(capitalData);
    // log(``);
    log(`  总净利润：${formatFxstr(capitalResult.total_profit)}`);
    log(
        `  毛利润： ${formatFxstr(
            capitalResult.total_win
        )},  总亏损：${formatFxstr(capitalResult.total_loss)}`
    );
    log("");
    log(
        `  总交易次数： ${capitalResult.count},  利润率：${(
            (capitalResult.count_win * 100) /
            capitalResult.count
        ).toFixed(1)}%`
    );
    log(
        `  总盈利次数： ${capitalResult.count_win},  总亏损次数：${capitalResult.count_loss}`
    );
    log("");
    log(
        `  最大单笔盈利： ${formatFxstr(
            capitalResult.max_profit
        )},  最大单笔亏损：${formatFxstr(capitalResult.max_loss)}`
    );
    log(
        `  平均盈利： ${formatFxstr(
            capitalResult.average_win
        )},  平均亏损：${formatFxstr(capitalResult.average_loss)}`
    );
    log(
        `  平均盈利/平均亏损： ${(
            capitalResult.average_win / capitalResult.average_loss
        ).toFixed(2)},  平均每笔总盈利：${formatFxstr(
            capitalResult.average_profit
        )}`
    );
    log("");
    log(
        `  最多连续盈利次数： ${capitalResult.max_wintimes},  最多连续亏损次数：${capitalResult.max_losstimes}`
    );
    log(
        `  盈利最多持有天数： ${capitalResult.max_windays},  亏损最多持有天数：${capitalResult.max_lossdays}`
    );
    log(
        `  盈利平均持有天数： ${capitalResult.average_windays},  亏损平均持有天数：${capitalResult.average_lossdays}`
    );

    log("");
    for (let methodType in capitalResult.selltypes) {
        let selltype = capitalResult.selltypes[methodType];
        log(
            `  卖出类型${methodType} 共${selltype.times}次,  盈利${selltype.win_times}次， 损失${selltype.loss_times}次`
        );
    }
    // log(
    //     "*                                                                                                                      *"
    // );
    log(
        `******************************************************************************************`
    );
    log("");
}

function logTransactions(log, capitalData) {
    log(`  交易日志分析
******************************************************************************************`);
    for (let translog of capitalData.transactions) {
        log(logTransaction(translog));
    }

    log(
        `******************************************************************************************`
    );
}

// settledlog = {
//     tradeDate: translog.tradeDate,
//     profit: capitalData.stock.buy.total + translog.total,
//     income:
//         translog.count * translog.price -
//         capitalData.stock.count * capitalData.stock.price,
//     buy: capitalData.stock.buy,
//     sell: translog,
// };
// trans: {
// date: tradeDate.format("YYYYMMDD"),
// dateIndex: tradeDateIndex,
// type: "sell",
// count,
// price,
// total: total.total,
// amount: total.amount,
// fee: total.fee,
// commission: total.commission,
// duty: total.duty,
// methodType,
// memo,
// }
function logTransaction(translog) {
    if (!translog) return "";
    let buy = translog.buy;
    let sell = translog.sell;
    return `收入：${formatFxstr(translog.profit)}, 持有 ${
        sell.dateIndex - buy.dateIndex + 1
    }天，盈利 ${(-(translog.profit * 100) / buy.total).toFixed(2)}%
       [买入 ${buy.date}, ${formatFxstr(buy.price)}, ${
        buy.count
    }, ${formatFxstr(buy.total)}] 
       [卖出 ${sell.date}, ${formatFxstr(sell.price)}, ${
        sell.count
    }, ${formatFxstr(sell.total)}, ${sell.methodType}, ${sell.memo}]`;
}

module.exports = {
    executeTransaction,
    executeCapitalSettlement,
    createSellTransaction,
    createBuyTransaction,
    calculateTransactionFee,
    parseCapital,
    logCapitalReport,
    logTransactions,
};
