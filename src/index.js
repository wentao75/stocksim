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
        // this.log(`%o`, stockList.data[0]);
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
                balance: 100000, // 初始资金
                stock: { count: 0, price: 0 }, // 持有股票信息
                transactions: [], // 交易记录 {date: , count: 交易数量, price: 交易价格, amount: 总价, fee: 交易费用,}
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
                this.log("第一天的数据：%o", stockData.data[0]);
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
    retStockList.push(stockList[0]);
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
 * @param {*} tradeDate
 * @param {*} index
 * @param {*} stockData
 * @param {*} capitalData
 */
async function executeTransaction(
    tradeDate,
    index,
    stockData,
    capitalData,
    options
) {
    return null;
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
