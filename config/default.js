const { rules } = require("@wt/lib-stock");

module.exports = {
    // 基本数据设置
    startDate: "20190101", // 模拟计算的启动日期
    fixCash: true, // 是否固定头寸
    initBalance: 1000000, // 初始资金余额 或 固定头寸金额
    showTrans: false,
    showWorkdays: false,

    // 算法选择
    // 基准测试
    rules: {
        buy: [rules.outsideday],
        // buy: [rules.benchmark],
        sell: [rules.stoploss, rules.opensell],
        // sell: [rules.benchmark],
    },
    // mmb
    // rules: {
    //     buy: [rules.mmb],
    //     sell: [rules.stoploss, rules.mmb],
    // },
    mmb: {
        N: 1, // 动能平均天数
        P: 0.5, // 动能突破买入百分比
        L: 0.5, // 动能突破卖出百分比
        nommb1: false, // 是否执行开盘价锁盈
        nommb2: true, //  是否动能突破买入符合禁止卖出
        // nommbsell: flags.nommbsell, // 如果动能突破，则禁止卖出
        mmbType: "hl", // 波幅类型，hc, hl
    },
    stoploss: {
        S: 0.1, // 止损比例
    },
    benchmark: {
        sellPrice: "close", //"close", // 卖出价位
    },

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
