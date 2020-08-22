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
    // 首先检查卖出
    // debug("执行卖出检查");
    let translog = tradeMethod.checkSellTransaction(
        capitalData && capitalData.stock,
        tradeDate,
        index,
        stockData,
        options
    );
    if (executeCapitalSettlement(tradeDate, stockInfo, translog, capitalData)) {
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

    // // 检查止损
    // // debug("执行止损检查");
    // translog = slMethod.checkSellTransaction(
    //     capitalData && capitalData.stock,
    //     tradeDate,
    //     index,
    //     stockData,
    //     options
    // );
    // if (executeCapitalSettlement(tradeDate, stockInfo, translog, capitalData)) {
    //     console.log(
    //         `卖出交易：${tradeDate.format(
    //             "YYYYMMDD"
    //         )}，价格：${translog.price.toFixed(2)}元，数量：${
    //             translog.count / 100
    //         }手，总价：${translog.total.toFixed(
    //             2
    //         )}元[佣金${translog.commission.toFixed(
    //             2
    //         )}元，过户费${translog.fee.toFixed(
    //             2
    //         )}，印花税${translog.duty.toFixed(2)}元], ${translog.memo}`
    //     );
    //     // return translog;
    // }

    if (capitalData && capitalData.stock && capitalData.stock.count > 0) return;
    // 执行买入
    // debug("执行买入检查");
    translog = tradeMethod.checkBuyTransaction(
        capitalData.balance,
        stockInfo,
        tradeDate,
        index,
        stockData,
        options
    );
    // debug(`买入结果：%o`, translog);
    if (executeCapitalSettlement(tradeDate, stockInfo, translog, capitalData)) {
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
function executeCapitalSettlement(tradeDate, stockInfo, translog, capitalData) {
    // debug(`执行清算 %o`, translog);
    if (_.isEmpty(translog)) return false;
    if (translog.total + capitalData.balance < 0) {
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
    capitalData.balance += translog.total;
    if (translog.type === "buy") {
        capitalData.stock = {
            info: stockInfo,
            count: translog.count,
            price: translog.price,
        };
    } else {
        capitalData.stock = {
            info: null,
            count: 0,
            price: 0,
        };
    }
    capitalData.transactions.push(translog);
    // debug("完成清算！");
    return true;
}

/**
 * 创建指定日期和股票信息的卖出交易
 * @param {*} stockInfo
 * @param {*} tradeDate
 * @param {*} count
 * @param {*} price
 */
function createSellTransaction(stockInfo, tradeDate, count, price, memo) {
    // 计算费用
    let total = calculateTransactionFee(false, stockInfo, count, price);
    // 创建卖出交易记录
    return {
        date: tradeDate.format("YYYYMMDD"),
        type: "sell",
        count,
        price,
        total: total.total,
        amount: total.amount,
        fee: total.fee,
        commission: total.commission,
        duty: total.duty,
        memo,
    };
}

/**
 * 构建买入交易信息
 * @param {*} stockInfo 股票信息
 * @param {*} tradeDate 交易日期
 * @param {*} balance 可用余额
 * @param {*} price 买入价格
 */
function createBuyTransaction(stockInfo, tradeDate, balance, price, memo) {
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
        type: "buy",
        count: count,
        price,
        total: total.total,
        amount: total.amount,
        fee: total.fee,
        commission: total.commission,
        duty: total.duty,
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

module.exports = {
    executeTransaction,
    executeCapitalSettlement,
    createSellTransaction,
    createBuyTransaction,
    calculateTransactionFee,
};
