# MoonMMDB v0.9.1

浏览器工作台新增本地 JSONL 日志分析。选择 City、ASN 数据库及日志后，可查看国家／ASN 分布、精确请求数与互斥异常统计，并导出包含输入散列的报告；在线入口与离线 HTML 使用相同文件。

日志按 64 KiB 分块读取，支持嵌套 IP 路径、UTF-8 BOM、CRLF、错误行计数、取消及重新加载。默认日志上限 8 MiB／10,000 行，可提高至 64 MiB／1,000,000 行。

版本机制统一到主模块，支持 0.9.1、0.9.2 等末位递增版本；保留既有接口、命令和统计口径。完整验证状态与发布回执见 `docs/VERIFICATION_0_9_1.md`。

[打开工作台](https://hhww96.github.io/moonmmdb/) · [下载离线 HTML](https://github.com/HhWw96/moonmmdb/releases/download/v0.9.1/moonmmdb-0.9.1-offline.html) · [日志分析说明](https://github.com/HhWw96/moonmmdb/blob/main/docs/BROWSER_ANALYTICS.md)

Windows/Linux Chromium、Firefox 和本机 Edge 验证通过；覆盖十万行、64 MiB、固定真实库独立对照及持续运行。默认 Node 24.20.0 的两平台、两种负载各连续三次 30 分钟通过。发布后的三个系统 Native 下载验收、网页散列及独立 Mooncakes 安装也已通过，详见 [完整验证回执](https://github.com/HhWw96/moonmmdb/blob/main/docs/VERIFICATION_0_9_1.md)。历史失败记录继续保留。
