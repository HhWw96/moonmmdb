# MoonMMDB v0.9.0 — 请求日志分析与默认运行稳定性

新增 Native/Node 共用的 `analyze CITY.mmdb ASN.mmdb INPUT.jsonl|-` 命令，一次运行即可得到国家和 ASN 请求量分布。
正式 `analytics` MoonBit 包负责查询、精确计数、互斥异常分类、Top N 排序及报告序列化；宿主只负责输入输出和来源信息。

- 支持嵌套 IP 路径、标准输入、UTF-8/BOM/CRLF、中文及非 BMP 文件路径；默认 Top 10，可配置至 Top 100。
- 明确区分成功计数、IP 未命中、字段缺失、字段类型错误和查询错误，避免重复统计。
- 计数使用 UInt64，JSON 输出十进制字符串；报告包含完整分组数、Top N 以外请求量、实际参数、两库和原始输入 SHA-256。
- 新增分组和键长预算、溢出检查及停止后的状态保护；输入或输出故障不输出完整报告。
- 减少解码小型字典时的重复查重存储，使用操作内偏移状态代替逐值临时返回对，避免短整数和指针的不必要宽化运算，以及字段预算的额外编码缓冲区。保持数据库快照隔离、重复键检测及原有解码限制。
- 保留七个 Native 旧命令、Node 旧命令、旧日志示例语义及 0.5.0/0.6.0 公开接口基线；新增 analytics 的 0.9.0 基线。

用法：

```text
moonmmdb analyze CITY.mmdb ASN.mmdb access.jsonl --ip-path /client/ip --top 10
node bin/moonmmdb.mjs analyze CITY.mmdb ASN.mmdb access.jsonl --ip-path /client/ip --top 10
```

完整说明见 [日志分析](https://github.com/HhWw96/moonmmdb/blob/v0.9.0/docs/ANALYTICS.md) 和 [版本验证](https://github.com/HhWw96/moonmmdb/blob/main/docs/VERIFICATION_0_9.md)。
数据库文件上限和分组预算不代表进程内存上限；统计请求次数，不去重 IP、不推断人数或地理信息准确性。
历史默认 Node RSS 失败记录继续保留；只有相同环境、固定 Node 24.20.0、默认参数下的连续验证才支撑新增稳定性结论。
浏览器功能维持查询、检查和单 IP 对比，网页与离线 HTML 随正式版本同步。
