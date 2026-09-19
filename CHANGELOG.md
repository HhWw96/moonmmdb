# Changelog

## 0.2.0 — 2026-09-16

- 修复 JSONL 大整数重编码、输出积压与管道关闭处理。
- 新增公开字段路径提取、project 命令、enrich --field 与独立模块接入。
- 修复 signaling NaN 原始位丢失：Real32 / Real64 参数改为 Float32Value / Float64Value；CLI JSON 结构兼容。
- 增加 21 个官方边界场景、规模数据库及字段投影独立对照。
- 验证与源码/产物散列绑定；归档按确切版本选择，从隔离目录复验。

## 0.1.0 — 2026-09-16

- 支持 MMDB 2.x、24/28/32 位节点、IPv4/IPv6 和精确类型读取。
- 每次操作独立预算，分离未命中与错误；JS 宿主输入快照。
- 离线 CLI、JSONL 日志补充、独立 MoonBit ASN 汇总示例。
- JS/Wasm GC 验证，固定官方数据库、独立参考、恶意样例与变异测试。
