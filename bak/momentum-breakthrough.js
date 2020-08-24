const _ = require("lodash");
const sl = require("./stoploss");
const engine = require("./transaction-engine");
const { option } = require("@oclif/command/lib/flags");
const debug = require("debug")("mmb");

/**
 * 检查买入条件
 * @param {double} balance 账户余额
 * @param {*} tradeDate 交易日期
 * @param {int} index 交易日数据索引位置
 * @param {*} stockData 数据
 * @param {*} options 算法参数
 */
function checkMMBBuyTransaction(
    balance,
    stockInfo,
    tradeDate,
    index,
    stockData,
    options
) {
    if (balance <= 0) return;
    // debug(`买入检查: ${balance}, ${tradeDate}, %o, ${index}`, stockData);

    // 平均波幅的计算日数
    let N = (options && options.N) || 1;
    // 波幅突破的百分比
    let P = (options && options.P) || 0.5;

    let moment = 0;
    for (let i = 0; i < N; i++) {
        if (index - i - 1 >= 0) {
            let tmp = stockData[index - i - 1];
            if (options.mmbType === "hl") {
                moment += tmp.high - tmp.low;
            } else {
                moment += tmp.high - tmp.close;
            }
        }
    }
    moment = moment / N;

    let currentData = stockData[index];
    // console.log(`跟踪信息： ${stockData.length}, ${index}`, currentData);
    let targetPrice = currentData.open + moment * P;

    debug(
        `买入条件检查${tradeDate.format("YYYYMMDD")}: ${targetPrice.toFixed(
            2
        )}=${currentData.open}+${moment.toFixed(2)}*${P} [o: ${
            currentData.open
        }, h: ${currentData.high}, l: ${currentData.low}, c: ${
            currentData.close
        }, d: ${currentData.tradeDate}]`
    );
    if (currentData.high >= targetPrice && currentData.open <= targetPrice) {
        // 执行买入交易
        debug(`符合条件：${tradeDate.format("YYYYMMDD")}`);
        return engine.createBuyTransaction(
            stockInfo,
            tradeDate,
            index,
            balance,
            targetPrice,
            "mmb",
            `动能突破买入 ${targetPrice.toFixed(2)} (=${
                currentData.open
            }+${moment.toFixed(2)}*${(P * 100).toFixed(2)}%)`
        );
    }
}

/**
 * 检查是否可以生成卖出交易，如果可以卖出，产生卖出交易记录
 *
 * @param {*} stock 持仓信息
 * @param {*} tradeDate 交易日
 * @param {*} index 今日数据索引位置
 * @param {*} stockData 日线数据
 * @param {*} options 算法参数
 */
function checkMMBSellTransaction(stock, tradeDate, index, stockData, options) {
    if (_.isEmpty(stock) || stock.count <= 0) return;

    // 检查是否符合动能突破买入条件
    if (
        !_.isEmpty(
            checkMMBBuyTransaction(
                100000,
                stock.info,
                tradeDate,
                index,
                stockData,
                options
            )
        )
    ) {
        // 可以买入，那么当日保持
        return;
    }

    let currentData = stockData[index];

    // 目前有持仓，检查是否达到盈利卖出条件
    if (options.OS && currentData.open > stock.price) {
        // 采用第二天开盘价盈利就卖出的策略
        debug(
            `开盘盈利策略符合：${currentData.open.toFixed(
                2
            )} (> ${stock.price.toFixed(2)})`
        );
        return engine.createSellTransaction(
            stock.info,
            tradeDate,
            index,
            stock.count,
            currentData.open,
            "mmb1",
            `开盘盈利卖出 ${currentData.open} (> ${stock.price.toFixed(2)})`
        );
    }

    // 平均波幅的计算日数
    let N = (options && options.N) || 1;
    // 止损使用的波幅下降百分比
    let L = (options && options.L) || 0.5;
    // 有持仓，检查是否达到卖出条件
    // 第一个卖出条件是买入后按照买入价格及波动数据的反向百分比设置
    let moment = 0;
    for (let i = 0; i < N; i++) {
        if (index - i - 1 >= 0) {
            let tmp = stockData[index - i - 1];
            if (options.mmbType === "hl") {
                moment += tmp.high - tmp.low;
            } else {
                moment += tmp.high - tmp.close;
            }
        }
    }
    moment = moment / N;

    let targetPrice = currentData.open - moment * L;
    // let targetPrice2 = stock.price - moment * L;
    // let targetPrice =
    //     targetPrice1 >= targetPrice2 ? targetPrice1 : targetPrice2;

    if (targetPrice <= currentData.open && targetPrice >= currentData.low) {
        // 执行波动卖出
        return engine.createSellTransaction(
            stock.info,
            tradeDate,
            index,
            stock.count,
            targetPrice,
            "mmb2",
            `动能突破卖出：${targetPrice.toFixed(2)} (= ${
                currentData.open
            }-${moment.toFixed(2)}*${L * 100}%)`
        );
    }
}

module.exports = {
    name: "MMB",
    description: "动能穿透",
    methodTyps: {
        mmb: "动能突破买入",
        mmb1: "开盘盈利卖出",
        mmb2: "动能突破卖出",
    },
    checkBuyTransaction: checkMMBBuyTransaction,
    checkSellTransaction: checkMMBSellTransaction,
};
