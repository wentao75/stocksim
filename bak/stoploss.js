const _ = require("lodash");
const engine = require("./transaction-engine");

/**
 * 检查是否需要执行止损
 * @param {*} stock 持仓信息
 * @param {*} tradeDate 交易日期
 * @param {int} index 交易日索引位置
 * @param {*} stockData 日线数据
 */
function checkStoplossTransaction(stock, tradeDate, index, stockData, options) {
    if (_.isEmpty(stock) || stock.count <= 0) return;
    let currentData = stockData[index];
    // 止损最大损失比例
    let S = (options && options.S) || 0.1;

    // 这里检查纯粹的百分比止损
    let lossPrice = stock.price * (1 - S);
    if (currentData.low <= lossPrice) {
        // 当日价格范围达到止损值
        return engine.createSellTransaction(
            stock.info,
            tradeDate,
            index,
            stock.count,
            lossPrice,
            "stoploss",
            `止损 ${lossPrice.toFixed(2)} (=${stock.price.toFixed(2)}*(1-${
                S * 100
            }%))`
        );
    }
}

module.exports = {
    name: "SL",
    description: "止损",
    methodTypes: {
        stoploss: "止损卖出",
    },
    checkStoplossTransaction,
};
