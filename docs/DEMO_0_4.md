# MoonMMDB 0.4.0 验收演示

演示目标：用同一份日志同时补充地域、ASN 和内部标签，得到可核对的统计，再检查数据库更新影响。全部默认材料是人工数据，离线可复现，不展示真实企业日志。

## 1. 构建与环境

从 README 所列公开仓库获取源码；安装 Node.js 与 MoonBit，进入仓库根目录执行：

```text
npm run build
```

验证使用的工具链为 MoonBit 0.10.11+6ff76a5f9、Node.js 24.13.0。日常查询无需 Python、C 查询库或在线 IP 服务。Mooncakes 发布和独立注册表安装是否完成，以版本验证文档的发布状态为准，源码构建不替代注册表安装证明。

## 2. 三库联合补充

```text
node bin/moonmmdb.mjs enrich-many examples/many.json examples/analysis-access.jsonl
```

核对 `enrichment.sources` 中 geo、asn、tags 三个独立结果：

| 输入 IP | 国家 | ASN | 机房标签 |
|---|---|---|---|
| 192.0.2.1 | ZZ | 64512 | lab-a |
| 192.0.2.2 | ZZ | 64512 | lab-a |
| 198.51.100.1 | YY | 64513 | lab-b |
| 203.0.113.1 | 未命中 | 未命中 | 未命中 |

预期退出码 1；stderr 汇总 processed=4，每库 found=3、not_found=1、errors=0。geo/asn 各缺失一个所选字段，tags 缺失两个；缺失字段数不能当作失败行数相加。原始 request_id 从 9007199254740993 起，输出保留原文字，不经过 JavaScript 数值重新编码。

配置由文件路径、源名称和 JSON Pointer 组成，数据库只打开一次；换成自有库时保持同样的操作方式。字段名相同也不会覆盖其他来源。

## 3. MoonBit 日志分析

```text
node examples/log_analytics/run.mjs tests/scenarios/geo.mmdb tests/scenarios/asn.mmdb examples/analysis-access.jsonl
```

预期 requests="4"、valid_ips="4"、invalid_inputs="0"；国家 ZZ 为 2、YY 为 1，ASN 64512 为 2、64513 为 1，另有一条未命中。计数输出为精确十进制字符串。国家/ASN 分组、计数和排序位于独立模块 `examples/log_analytics/analytics.mbt`，Node.js 仅做输入输出。

每个维度最多 10,000 个键，超限明确终止；不保留全部日志。错误行计数与未命中、字段缺失分别呈现。对应测试还覆盖大于 2^53 的计数和并列排序。

## 4. 更新影响抽查

```text
node bin/moonmmdb.mjs diff tests/scenarios/tags.mmdb tests/scenarios/tags-updated.mmdb examples/analysis-access.jsonl --field /site
```

预期前两条从 lab-a 变为 lab-a-new；另外两条不变，汇总 changed=2、unchanged=2、errors=0，退出码 1。这个命令检查输入地址的变化，不声称枚举整库。

## 5. 展示验证证据

- 功能测试：JS/WasmGC 核心、独立消费模块、坏配置、损坏源隔离和 100,000 行流式处理。
- 后端：Windows Native 本地验证，Linux Native 核心及分析模块在 Ubuntu CI 验证；产品 CLI 仍使用 Node.js。
- 独立正确性：Python maxminddb 分别查询每个来源，核对联合结果、前缀和统计；Python 不参与实际产品查询。
- 真实数据：DB-IP 2026-09 City＋ASN 各 7,114 地址；独立入口与署名见 [多库说明](MULTI_SOURCE.md)。
- 持续运行、散列绑定与发布状态：见 [0.4.0 验证报告](VERIFICATION_0_4.md)，其中保留未通过的测试及适用限制。

README、Apache-2.0 许可证、第三方来源、固定数据库散列和提交记录均随仓库公开。初审通过来自参赛者收到的通知，不代表最终验收或奖项结果。
