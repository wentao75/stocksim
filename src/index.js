const { Command, flags } = require("@oclif/command");

const {
    readStockList,
    readStockData,
    stockDataNames,
} = require("@wt/lib-wtda-query");
const { filter } = require("lodash");

const moment = require("moment");
const _ = require("lodash");
class StocksimCommand extends Command {
    async run() {
        const { args, flags } = this.parse(StocksimCommand);
        const name = args.name;
        this.log(`执行算法： ${name}`);

        let options = {
            initBalance: 100000, // 初始资金余额
        };

        // 首先根据设置获得列表，列表内容为需要进行算法计算的各个股票
        //  TODO: 这里先读取全部的列表
        let stockListData = await readStockList();
        if (!stockListData || !stockListData.data) {
            this.log(`没有读取到股票列表，无法处理日线数据`);
            return;
        }
        let stockList = stockListData.data;
        // 重新过滤可用的
        stockList = await filterStockList(stockList);
        this.log(`算法执行 ${stockList && stockList.length} 个数据`);
        // data存放股票列表的基本信息：
        // {
        //      ts_code: '000001.SZ', symbol: '000001', name: '平安银行',
        //      market: '主板', exchange: 'SZSE',
        //      area: '深圳', industry: '银行', fullname: '平安银行股份有限公司',
        //      enname: 'Ping An Bank Co., Ltd.', curr_type: 'CNY',
        //      list_status: 'L', list_date: '19910403', delist_date: null, is_hs: 'S'
        // }
        this.log(`%o`, stockList[0]);
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
                stock: { tsCode: null, count: 0, price: 0 }, // 持有股票信息
                transactions: [], // 交易记录 {date: , count: 交易数量, price: 交易价格, total: 总金额, amount: 总价, fee: 交易费用,}
            };
            if (stockData) {
                this.log(
                    `[${stockItem.ts_code}]${stockItem.name} 日线数据条数 ${
                        stockData.data && stockData.data.length
                    }, 从${stockData.startDate}到${
                        stockData.endDate
                    }，更新时间：${stockData.updateTime}`
                );

                // 首先过滤历史数据，这里将日线数据调整为正常日期从历史到现在
                stockData = await filterStockData(stockData);
                for (let i = 0; i < stockData.data.length; i += 1000) {
                    this.log(`第${i}天的数据：%o`, stockData.data[i]);
                }
                // this.log("%o", stockData.data[5000]);
                // let index = 0;
                // for (let index = 0; index < 10; index++) {
                //     this.log(`日数据：%o`, stockData.data[index]);
                // }

                // 开始按照日期执行交易算法
                let startDate = moment("20180101", "YYYYMMDD");
                let currentDate = null;
                for (let index = 0; index < stockData.data.length; index++) {
                    let data = stockData.data[index];
                    let tradeDate = moment(data.trade_date, "YYYYMMDD");
                    if (_.isEmpty(currentDate)) {
                        if (startDate.isAfter(tradeDate)) {
                            continue;
                        }
                    }
                    currentDate = tradeDate;
                    let trans = await executeTransaction(
                        currentDate,
                        index,
                        stockData,
                        stockItem,
                        capitalData
                    );

                    // 返回值代表产生的交易
                    if (trans) {
                        this.log(`${data.trade_date} 产生交易: %o`, trans);
                    } else {
                        // this.log(`${data.trade_date} 没有交易！`);
                    }
                }
            } else {
                this.log(
                    `[${stockItem.ts_code}]${stockItem.name} 没有日线数据，请检查！`
                );
            }
        }
    }
}

/**
 * 这里定义一个过滤列表的接口方法，利用options来过滤后续使用的股票
 * 返回为一个符合条件的列表
 * 这里后续考虑调整一下接口定义，目前暂时简化处理
 */
async function filterStockList(stockList, options) {
    let retStockList = [];
    retStockList.push(stockList[3000]);
    return retStockList;
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
    tradeDate,
    index,
    stockData,
    stockInfo,
    capitalData,
    options
) {
    let transLog = [];
    let currentDayData = stockData.data[index];

    // 平均波幅的计算日数
    let N = (options && options.N) || 1;
    // 波幅突破的百分比
    let P = (options && options.P) || 0.5;
    // 止损使用的波幅下降百分比
    let L = (options && options.L) || 0.5;
    // 止损最大损失比例
    let S = (options && options.S) || 0.1;

    if (capitalData && capitalData.stock && capitalData.stock.count > 0) {
        // 目前有持仓，计算卖出条件或者止损
        if (currentDayData.open > capitalData.stock.price) {
            // 采用第二天开盘价盈利就卖出的策略
            // 计算费用
            let total = calculateTransactionFee(
                false,
                stockInfo,
                capitalData.stock.count,
                currentDayData.open
            );
            // 创建交易记录
            let tranlog = {
                date: tradeDate.format("YYYYMMDD"),
                count: capitalData.stock.count,
                price: currentDayData.open,
                total: total.total,
                amount: total.amount,
                fee: total.fee,
                commission: total.commission,
                duty: total.duty,
            };
        }
    }

    let total_moment = 0;
    for (let i = 0; i < N; i++) {
        if (index - i - 1 >= 0) {
            let tmp = stockData.data[index - i - 1];
            total_moment += tmp.high - tmp.low;
        }
    }

    return null;
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
    let fee = 0;
    let duty = 0;
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

    let total = 0;
    if (buy) {
        total = 0 - amount - commission - fee - duty;
    } else {
        total = amount - commission - fee - duty;
    }

    return { total, amount, commission, fee, duty };
}

StocksimCommand.description = `Describe the command here
...
数据分析算法入口
`;

StocksimCommand.args = [
    {
        name: "name",
        required: true,
        description: "算法代码，用于指定执行哪个算法",
    },
];

StocksimCommand.flags = {
    // add --version flag to show CLI version
    version: flags.version({ char: "v" }),
    // add --help flag to show CLI version
    help: flags.help({ char: "h" }),
};

module.exports = StocksimCommand;
