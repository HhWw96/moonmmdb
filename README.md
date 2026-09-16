# MoonMMDB

MoonBit 原生离线 IP 数据库查询库，读取 MaxMind DB（`.mmdb`）格式。

**第一版：0.1.0。本地实现与验证已完成，尚未发布 GitHub / Mooncakes，也未提交赛事复审。** “原生”指查询和解码使用 MoonBit 实现；已验证 JavaScript 与 Wasm GC 后端，Native 后端尚未验证。

读取调用方提供的数据库，返回 IP 对应的记录、匹配前缀和明确错误。无需在线查询服务；国家、ASN 或组织自定义字段由数据库决定。随项目提供的是官方人工测试数据，**不代表这些 IP 当前的真实归属**。

## 立即试用

需要 Node.js 22+ 和 MoonBit 工具链。本轮使用 Node.js 24.13.0、`moonc v0.10.11+6ff76a5f9`。将 `moon` 加入 PATH 或设置 `MOON_HOME`；本机已有忽略提交的 `.local-toolchain.json`，可以直接运行。

在本项目目录执行：

```text
npm run build
npm run demo
```

无 npm 运行时依赖，不需要 `npm install`。演示依次读取元数据、查询 IPv4/IPv6、补充日志字段，再运行独立 MoonBit 模块汇总 ASN。未命中样例的退出码 1 由演示脚本按预期处理。

```text
node bin/moonmmdb.mjs metadata tests/fixtures/GeoLite2-ASN-Test.mmdb
node bin/moonmmdb.mjs lookup tests/fixtures/GeoLite2-ASN-Test.mmdb 1.0.0.1 1.128.0.1
node bin/moonmmdb.mjs lookup tests/fixtures/GeoIP2-City-Test.mmdb 2001:218::
node bin/moonmmdb.mjs enrich tests/fixtures/GeoLite2-ASN-Test.mmdb examples/access.jsonl
```

换成自己的 `.mmdb` 路径即可查询自己的数据库。路径含空格时加引号。`enrich` 接受每行含 `ip` 字符串的 JSON 对象，输出保留原对象，并增加查询结果；错误行单独报告，最终退出码不会被后面的成功记录覆盖。

| 退出码 | 含义 |
|---|---|
| 0 | 打开成功，或全部查询命中 |
| 1 | 至少一条未命中，无运行或输入错误 |
| 2 | 至少一条输入、文件读取或查询错误；优先于 1 |

## 在 MoonBit 中使用

核心包名为 `WeiR-h/moonmmdb`。发布前使用本地 workspace，完整例子在 `examples/log_consumer`；它有独立的 `moon.mod`，只调用核心公开接口。

```moonbit
// moon.pkg: import { "WeiR-h/moonmmdb" @mmdb }
let reader = @mmdb.open_bytes(database_bytes)
let result = reader.lookup("1.0.0.1")
match result.value {
  Some(record) => println(record.to_tagged_json().stringify())
  None => println("not found")
}
```

`open_bytes` 和 `lookup` 会抛出 `MmdbError`，调用方应捕获或在可抛错函数中传播。通过 `code()`、`offset()`、`message()` 获取诊断；非文件错误的 offset 为 -1。打开一次 Reader 可重复查询；每次查询使用独立资源预算。

```text
node scripts/consumer-verify.mjs
```

公开 API 见 `src/pkg.generated.mbti`；类型、输出编码及错误说明见 [支持范围](docs/SUPPORT.md)。

## 当前能力

- MMDB 格式主版本 2；24/28/32 位搜索节点。
- IPv4、IPv6，以及 IPv6 数据库中的 IPv4 查询；别名按数据库里的实际树边处理。
- 元数据、匹配前缀、有类型的字符串/字节/布尔/整数/浮点/数组/map。
- UInt64/UInt128 精确保留；JSON 整数用十进制字符串，浮点附带原始位表示，字节用十六进制。
- 越界、截断、非法类型、坏指针、循环和资源预算错误。
- 离线 CLI、JSONL 日志字段补充和独立 MoonBit ASN 汇总示例。

第一版不提供数据库写入、自动下载更新、整库遍历、字段选择解码、内存映射、在线 IP 情报或网页界面。完整 GeoLite2/GeoIP2 大库与真实生产负载尚未验证。详见 [支持矩阵](docs/SUPPORT.md)。

## 验证

```text
npm run verify
python -m pip install --target .reference-deps -r requirements-reference.txt
python scripts/reference-verify.py
node scripts/benchmark.mjs
```

`verify` 包含格式、类型、JS/Wasm GC 核心测试、构建、CLI、官方资源耗尽样例、确定性变异输入、独立消费模块和演示。Python 只用于独立验证，不参与运行时查询。

测试数据固定到 MaxMind-DB 提交 `7fcd868842970b2d0657af799807cbe722fb738d`，原始字节和 SHA-256 已随库保存。重新获取可运行 `python scripts/prepare-fixtures.py`，它核对整个归档散列值；生成测试源码后用 `moon fmt` 整理格式。

本地验证结果与限制见 [验证报告](docs/VERIFICATION.md)。GitHub Actions 配置已经准备，尚无远端运行结果。参考 C 扩展在本机一个 UInt32 边界上与纯 Python 路径不一致，记录已保留，未把该差异伪报为两者全部一致。

## 来源与生态边界

实现依据 [MMDB 规范](https://maxmind.github.io/MaxMind-DB/)，参考官方测试数据和读取器进行验证。MMDB 格式及查询算法不是本项目首创；本项目贡献是 MoonBit 实现、原生 API、资源限制、消费示例与验证工程。

已有地理地址库、CIDR 规则工具和 PCAP 解析库分别负责相邻功能；本项目处理 MMDB 记录读取。MoonCap 集成与组织标签数据库是后续场景，目前未实现集成或取得第三方采用。详见 [参赛准备事实](docs/COMPETITION.md)。

项目代码采用 Apache-2.0。官方测试数据保留 Apache-2.0 / MIT 许可文件；实际使用的数据库须另行确认使用权限。[第三方说明](THIRD_PARTY.md)
