# MoonMMDB

MoonBit 原生离线 IP 数据库查询库，读取 MaxMind DB（`.mmdb`）格式。

**当前发布版本：0.4.0。** [Mooncakes 包与 API 文档](https://mooncakes.io/docs/HhWw96/moonmmdb@0.4.0/)。查询、解码、字段选择、联合查询和日志统计使用 MoonBit 实现。支持同时补充地域、ASN 与内部标签。[多库查询与分析](docs/MULTI_SOURCE.md) · [实用操作示例](docs/OPERATIONS.md) · [版本验证](docs/VERIFICATION_0_4.md) · [支持范围](docs/SUPPORT.md)

从头演示三个离线场景并核对结果：[验收演示步骤](docs/DEMO_0_4.md)。正式发布与 Mooncakes 安装状态以版本验证页为准。

源码仓库：[HhWw96/moonmmdb](https://github.com/HhWw96/moonmmdb)。

读取调用方提供的数据库，返回 IP 对应的记录、匹配前缀和明确错误。无需在线查询服务；国家、ASN 或组织自定义字段由数据库决定。随项目提供的是官方人工测试数据，**不代表这些 IP 当前的真实归属**。

## Native 命令行工具

v0.5.0 开发版本新增无需 Node.js 的 Windows/Linux x64 可执行程序，支持 `metadata`、`lookup`、`project` 和 `enrich-many`。当前正在进行完整验收，稳定发布仍为上方标明的 v0.4.0。

```text
node scripts/native-build.mjs
```

Windows 需先准备固定编译器；构建、用法与边界见 [Native 说明](docs/NATIVE_CLI.md) 和 [0.5.0 验证状态](docs/VERIFICATION_0_5.md)。下载包通过全部门槛后才加入正式 Release。

## 从源码运行 Node.js 工具

需要 Node.js 22+ 和 MoonBit 工具链。本轮使用 Node.js 24.13.0、`moonc v0.10.11+6ff76a5f9`。将 `moon` 加入 PATH 或设置 `MOON_HOME`；个人工具链配置 `.local-toolchain.json` 不随仓库提交。

```text
git clone https://github.com/HhWw96/moonmmdb.git
cd moonmmdb
```

在本项目目录执行：

```text
npm run build
npm run demo
```

无 npm 运行时依赖，不需要 `npm install`。演示读取元数据、查询 IPv4/IPv6、补充日志字段，并运行多库联合查询、国家/ASN 统计和内部标签更新检查。未命中或发现差异的退出码 1 由演示脚本按预期处理。

```text
node bin/moonmmdb.mjs metadata tests/fixtures/GeoLite2-ASN-Test.mmdb
node bin/moonmmdb.mjs lookup tests/fixtures/GeoLite2-ASN-Test.mmdb 1.0.0.1 1.128.0.1
node bin/moonmmdb.mjs lookup tests/fixtures/GeoIP2-City-Test.mmdb 2001:218::
node bin/moonmmdb.mjs project tests/fixtures/GeoIP2-City-Test.mmdb 2001:218:: /country/iso_code /location/latitude
node bin/moonmmdb.mjs enrich tests/fixtures/GeoLite2-ASN-Test.mmdb examples/access.jsonl
node bin/moonmmdb.mjs enrich tests/fixtures/GeoLite2-ASN-Test.mmdb examples/access.jsonl --field /autonomous_system_number
node bin/moonmmdb.mjs enrich tests/fixtures/MaxMind-DB-test-ipv4-24.mmdb examples/nested-access.jsonl --ip-path /client/ip --field /ip
node bin/moonmmdb.mjs diff tests/fixtures/MaxMind-DB-test-ipv4-24.mmdb tests/fixtures/MaxMind-DB-test-ipv4-32.mmdb examples/database-check.jsonl
node bin/moonmmdb.mjs enrich-many examples/many.json examples/analysis-access.jsonl
node examples/log_analytics/run.mjs tests/scenarios/geo.mmdb tests/scenarios/asn.mmdb examples/analysis-access.jsonl
```

换成自己的 `.mmdb` 路径即可查询自己的数据库。路径含空格时加引号。`enrich` 默认读取每行对象的 `ip` 字符串，可用 `--ip-path /client/ip` 指定嵌套字段，输入路径 `-` 表示标准输入。逐行输出保留原对象，并增加查询结果；错误行单独报告，最终退出码不会被后面的成功记录覆盖。默认最多 8 MiB、10,000 行，可按需提高总输入和记录上限，详见操作示例。

原输入 JSON 直接嵌入结果，保留大整数、负零、指数和转义写法；下游读取器仍须正确处理精度。输出等待消费者接收，管道关闭时报告 host-output-error。`project` / `--field` 使用路径提取字段，missing 表示字段缺失，not_found 表示 IP 未命中；字段缺失本身不产生退出码 1。

| 退出码 | 含义 |
|---|---|
| 0 | 打开成功，或全部查询命中 |
| 1 | 至少一条未命中，无运行或输入错误 |
| 2 | 至少一条输入、文件读取或查询错误；优先于 1 |

`diff` 使用专门的退出码含义：0 为检查范围内无差异，1 为有差异，2 为有错误。每行输出位于 `diff` 字段，完整处理结束后在 stderr 输出计数汇总；不能据有限地址的结果判断整库一致。

## 在 MoonBit 中使用

核心包名为 `HhWw96/moonmmdb`。在自己的 MoonBit 项目中从 Mooncakes 安装：

```text
moon add HhWw96/moonmmdb@0.4.0
```

完整例子在 `examples/log_consumer` 和 `examples/log_analytics`；它们有独立的 `moon.mod`，只调用核心公开接口。仓库内示例使用本地 workspace 便于开发，注册表安装验证另在全新目录执行。发布和安装结果见 [版本验证](docs/VERIFICATION_0_4.md)。

```moonbit
// moon.pkg: import { "HhWw96/moonmmdb" @mmdb }
let reader = @mmdb.open_bytes(database_bytes)
let result = reader.lookup("1.0.0.1")
match result.value {
  Some(record) => println(record.to_tagged_json().stringify())
  None => println("not found")
}
let selected = reader.project("1.0.0.1", ["/autonomous_system_number"])
println(selected.to_json().stringify())
let fields = @mmdb.prepare_fields(["/autonomous_system_number"])
let repeated = reader.project_prepared("1.0.0.1", fields)
println(repeated.to_json().stringify())
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
- 按路径提取国家、ASN、坐标、数组元素和自定义字段；IP 与字段的缺失状态分开。
- 越界、截断、非法类型、坏指针、循环和资源预算错误。
- 离线 CLI、JSONL 日志字段补充和独立 MoonBit ASN 汇总示例。
- 可复用 FieldSelector，配置与返回结果独立，查询仍使用自己的资源预算。
- 标准输入和文件流式处理、嵌套 IP 字段、可配置的输入/单行/记录上限。
- 按输入 IP 比较两份数据库的命中状态、匹配前缀和字段值，提供差异明细及汇总。
- 按名称组合 1—4 个数据源，分别保留结果、缺失状态和错误；配置错误在读取日志前返回。
- 独立 MoonBit 日志分析模块：国家/ASN Top 10、精确计数和有界分组；人工内部标签与更新影响演示。

当前不提供数据库写入、自动更新、整库遍历、惰性字段解码、内存映射、在线 IP 情报或网页界面。字段提取先完整解码一次，再选择输出，错误和资源预算不能被跳过。已经验证约 31 MB、65,536 网段的合成库，以及 DB-IP Lite 2026-09 Country、City、ASN 三库各 5,000 个地址的单源查询；City＋ASN 联合查询每库核对 7,114 个地址，JS 和 Windows Native 均与独立 Python 参考一致。付费 GeoIP2 大库与长期生产服务负载尚未验证。详见 [支持矩阵](docs/SUPPORT.md)。

从 0.1.0 升级：MoonBit `Real32` / `Real64` 现在携带 `Float32Value` / `Float64Value`，使用 `.bits` 获取原始位，`.number()` 获取运算值，避免 signaling NaN 转换改变原始位。CLI 的浮点 JSON 结构不变。

## 验证

```text
npm run verify
python -m pip install --target .reference-deps -r requirements-reference.txt
python scripts/reference-verify.py
node scripts/benchmark.mjs
python scripts/scale-verify.py
node scripts/release-verify.mjs
```

`verify` 包含格式、类型、JS/Wasm GC 核心测试、构建、CLI、流式输入与差异检查、官方资源耗尽样例、确定性变异输入、独立消费模块和演示。Python 只用于独立验证，不参与运行时查询。

`release-verify` 顺序执行完整验证、查询与差异的独立参考、规模比较、隔离包消费和性能测试，将源码、构建产物与报告的 SHA-256 绑定到 release.json。可将 Python 路径作为第一个参数传入。

测试数据固定到 MaxMind-DB 提交 `7fcd868842970b2d0657af799807cbe722fb738d`，原始字节和 SHA-256 已随库保存。重新获取可运行 `python scripts/prepare-fixtures.py`，它核对整个归档散列值；生成测试源码后用 `moon fmt` 整理格式。

本版本证据与限制见 [0.4.0 验证报告](docs/VERIFICATION_0_4.md)。[多库功能 GitHub Actions 验证](https://github.com/HhWw96/moonmmdb/actions/runs/35484457274)在 Ubuntu 与 Windows 上均通过，覆盖 JS/Wasm GC、独立参考、规模对照和隔离包消费，Ubuntu 另外执行 Linux Native 核心与分析模块测试；[后续运行状态](https://github.com/HhWw96/moonmmdb/actions)。Windows Native 宿主和真实数据库另行本地验证。参考 C 扩展在本机一个 UInt32 边界上与纯 Python 路径不一致，记录已保留，未把该差异伪报为两者全部一致。

Windows Native 与真实数据库补充验证（需 Python 3.12 参考环境，首次下载工具链和数据）：

```text
python scripts/setup-native-windows.py
python scripts/download-production.py
node scripts/extended-verify.mjs
```

也可把 Python 可执行文件路径作为 extended-verify.mjs 的第一个参数传入。该流程重新执行完整发布验证，再执行 Native、宿主路径、官方异常样例与真实库对照，将源码、EXE、JS 和报告散列值绑定到 extended.json。数据来源和工具链固定版本见 [补充报告](docs/NATIVE_PRODUCTION.md)。下载辅助脚本只用于验证，不是运行时自动更新功能。

## 来源与生态边界

实现依据 [MMDB 规范](https://maxmind.github.io/MaxMind-DB/)，参考官方测试数据和读取器进行验证。MMDB 格式及查询算法不是本项目首创；本项目贡献是 MoonBit 实现、原生 API、资源限制、消费示例与验证工程。

已有地理地址库、CIDR 规则工具和 PCAP 解析库分别负责相邻功能；本项目处理 MMDB 记录读取。已提供人工内部标签库的读取和更新影响示例；MoonCap 集成仍是后续场景，目前未取得第三方采用。详见 [参赛准备事实](docs/COMPETITION.md)。

项目代码采用 Apache-2.0。官方测试数据保留 Apache-2.0 / MIT 许可文件；实际使用的数据库须另行确认使用权限。[第三方说明](THIRD_PARTY.md)
