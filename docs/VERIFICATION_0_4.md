# 0.4.0 验证与发布状态

本版本增加多库联合查询与独立 MoonBit 日志统计。验证结果以对应源码、构建产物和报告散列值为准。0.3.0 的历史证据不作为新增能力验证的替代品。

已运行的检查包含 JS/WasmGC 核心 30 项、独立分析模块 4 项、10 万行流式输入、慢消费者及输出关闭；人工语料共 3,090 次独立 Python 对照并核对统计 Top 10。

完整发布入口：

```text
node scripts/release-verify.mjs
node scripts/extended-verify.mjs
python scripts/enrichment-verify.py --production --native dist/moonmmdb-native-probe.exe
node scripts/soak.mjs verification/local/soak-sources.json 1800
node scripts/registry-verify.mjs 0.4.0
```

release-verify 包含人工联合查询参考及原有查询、差异、规模、异常、变异和隔离包检查。extended-verify 补充固定 Windows Native 与真实库单源验证；新增生产联合对照和持续查询报告单独绑定产物散列值。CI 增加 Linux Native 核心与独立分析测试，不据此声称已交付 Native 产品 CLI。

持续查询以实际经过 1,800 秒为门槛，使用固定 City＋Country 两库与 9 个输入，逐次比对启动时的输出；独立正确性由参考检查承担。每 30 秒采样内存，预热 5 分钟后比较前后各 10 个样本的 RSS 中位数，增长不得超过 64 MiB 或初期中位数的 25%（取较大值）。这不是生产服务 SLA、并发压力或完整数据库认证。

发布与外部授权状态将在实际验证完成后记录；不能把可运行的本地包等同于已发布的 Mooncakes 包。
