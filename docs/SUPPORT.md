# 支持范围

v0.9.0 支持范围见本页；Native 产品宿主已通过跨平台验收，使用与结果见 [Native 说明](NATIVE_CLI.md) 和 [版本验证](VERIFICATION_0_9.md)。

0.6.0 包含 [完整官方语料验证](CORPUS.md)、[City／ASN 可选包](GEO.md) 和 [网段导出与数据库检查](INSPECTION.md)。后续正式版本遵循 [兼容政策](COMPATIBILITY.md)。

## 多库查询与分析

Enricher 支持 1—4 个命名数据源；非法 IP 为整条输入错误，各库查询错误单独保留。单库投影与资源策略不变。enrich-many 先检查所有配置和数据库，再读取日志；单库和合计文件上限均为 256 MiB。完整处理结束才输出汇总，异常终止不会报告成功完成。配置、状态、退出码与独立分析模块限制见 [多库说明](MULTI_SOURCE.md)。新增 source-limit、invalid-source、duplicate-source、invalid-config 与分析示例的 group-limit 错误。

## 格式与查询

| 项目 | 支持状态 |
|---|---|
| MMDB 主版本 2 | 支持；保留 minor，不拒绝未知元数据字段 |
| 24/28/32 位节点 | 支持，官方 IPv4/IPv6/mixed 样例验证 |
| 更宽合法节点 | 不支持，返回 unsupported-record-size |
| IPv4 与 IPv6 | 支持严格文本解析；无 DNS、zone id、CIDR、方括号或带前导零 IPv4 |
| IPv4 查询 IPv6 库 | 按高 96 位零遍历；返回 IPv4 地址族前缀长度 |
| IPv6 查询 IPv4 库 | 返回 ip-version-mismatch |
| 映射/6to4 地址 | 遵循数据库别名；不自行重写 Teredo 或其他过渡地址 |
| 元数据指针 | 以元数据段为基址，区别于记录数据段 |
| 未命中 | Lookup.value=None，保留终止前缀长度 |
| 物理树与引用记录检查 | validate 检查全部物理树节点，可选解码全部被引用的不同数据偏移；不认证地理准确性或未引用数据字节。open / lookup 原有检查范围不变 |

## 类型与 JSON

Value 区分 Text、Blob、Boolean、Unsigned16/32/64/128、Signed32、Real32/64、List、Object。UInt128 使用精确十进制字符串；UInt64 使用 MoonBit UInt64。Real32 / Real64 携带 Float32Value / Float64Value：bits 保存原始位，number() 提供运算数值。这是相对 0.1.0 的类型变更，可保留 signaling NaN 的原始位。map 保留原条目顺序；重复 key 被本读取器策略拒绝，不宣称所有此类编码都违反格式。

CLI 使用带类型 JSON，例如 `{"type":"uint128","value":"340282366920938463463374607431768211455"}`。所有整数的 value 都是字符串；字符串与布尔保留对应 JSON 类型；bytes 是小写十六进制；map 的 value 是对象，array 的 value 是数组。浮点包含 type、展示用 value 字符串、精确 bits 十六进制，可保留非有限值和负零。

JSON 编码是 MoonMMDB 的接口约定，不保证与其他 CLI 的无类型输出相同。用户自行构造的 Value 不经过读取器的资源限制；限制承诺针对通过 Reader 解码得到的结果。

## 资源策略

| 参数 | 默认值 | 可配置上限 |
|---|---:|---:|
| max_depth | 128 | 256 |
| max_values | 65,536 | 1,000,000 |
| max_payload_bytes | 2 MiB | 64 MiB |
| max_file_bytes | 256 MiB | 512 MiB |

每次 open 或 lookup 使用自己的预算。max_values 是解码工作量计数，容器、键、值及指针控制也计数；与规范示例中不单独计指针的计数方式不同，可能更早拒绝指针密集数据。max_payload_bytes 按每次展开的字符串/bytes 字节收费，在复制和 UTF-8 解码前检查；不是整个进程的 RSS 上限。查找树最多遍历 32/128 位，未终止则报错。数组/map 在进入子项前预检声明数量，避免由声明长度直接大规模分配。

Reader 打开时保存输入快照，避免 JS 宿主修改原始 Uint8Array 后使已验证布局失效；这会增加打开时间和一份数据库存储。当前未做缓存、mmap 或惰性字段解码。

CLI 数据库上限固定为每份 256 MiB。JSONL 从普通文件或标准输入逐行读取，默认总量 8 MiB、单行 8 MiB、10,000 行；总量可配置至 1 GiB，记录数可配置至 1,000,000，单行最多 8 MiB（包含 CR，不包含 LF）。等待每行输出完成后再继续处理。输入缓冲区有界，但数据库快照、解码结果和输出字符串仍占内存，这不是进程 RSS 上限。

某行错误不撤销此前输出，最终退出码 2 表示运行存在错误。超限、损坏 UTF-8 或输出失败会停止读取；整次处理可能已产生部分输出。空白行是错误，最后一行可以没有换行；仅文件起始的 UTF-8 BOM 被移除。原 JSON 对象直接嵌入结果，数值不重新编码。默认取 /ip，可用 --ip-path 读取嵌套属性和数组；只访问对象自身属性，JSON.parse 的重复键取末值语义保持不变。输出管道失败尽可能记录在 stderr，退出码 2。

## 字段提取

`Value.at_pointer`、`Reader.project`、`validate_paths` 使用 [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901) 字符串形式，支持 `/country/iso_code`、`/array/0`、空路径（根记录）、~0 与 ~1。不提供 URI fragment 形式；数组前导零、负数、越界或非数字下标作为未解析字段。不存在的键、标量的子字段返回 None / missing；语法错误返回 invalid-path。对象键按原字符比较，不做 Unicode 归一化。

project 允许 1–64 个不同路径，每个最长 2,048 个 UTF-16 码元、128 段；超出返回 path-limit。先完整解码并验证记录一次，再选字段。每条结果保留 record_found / prefix_length，字段缺失独立表达。投影全部字段的值数与载荷另用一份同额预算，重叠路径重复计数，不允许借多次输出放大载荷。这个预算针对数据内容，不是 JSON 输出长度或进程总 RSS。CLI enrich 在读取记录前验证路径，因此空文件不会掩盖错误配置。

prepare_fields 返回不透明 FieldSelector，保存路径数组的副本并预先解析路径。Reader.project_prepared 可跨查询和 Reader 复用选择器；不缓存数据库记录，修改调用方的配置数组或上一次返回结果不会污染下一次查询。Reader.project 作为兼容入口仍可使用。

## 数据库差异检查

Reader.compare / compare_prepared 对同一个 IP 查询两份 Reader，分别应用各自的解码与选择预算。返回 RecordDiff，独立报告 record_changed、prefix_changed 和 changed_fields，并包含 before / after 字段值。map 顺序不参与比较，数组顺序、整数类型、字节与浮点原始位参与比较。仅选择 /country/iso_code 时，不报告未选择的城市字段变化；命中状态与前缀仍参与比较，包括两侧均未命中但终止前缀不同的情况。

CLI diff 未给 --field 时选择整个记录（空路径），只检查输入中的 IP，不枚举整个数据库。stdout 每行包含 input 与 diff，完成后 stderr 给出 processed / changed / unchanged / errors 汇总。退出码为 0 无差异、1 有差异、2 有错误；发生输入流中断时不输出完成汇总。数据库类型、构建时间等元数据不作为 IP 记录差异，可通过 metadata 单独检查。两份完整数据库与快照同时驻留内存。

## 错误

主要 code：invalid-ip、ip-version-mismatch、missing-metadata、invalid-metadata、unsupported-version、unsupported-record-size、invalid-layout、invalid-separator、invalid-tree、invalid-tree-pointer、out-of-bounds、invalid-size、invalid-utf8、invalid-map-key、duplicate-key、unsupported-type、pointer-to-pointer、pointer-cycle、depth-limit、value-limit、payload-limit、file-limit、invalid-limits。CLI 的 host-input-error 与 invalid-jsonl 属于宿主输入层。

新增 code：invalid-path、path-limit、host-output-error；流式宿主还报告 input-limit、line-limit、record-limit、invalid-utf8，并在可定位时给出行号。offset 以整份文件的字节位置计数；无法定位到具体编码字段的树/路径/非文件错误返回 -1。错误不会转为 not_found 或无差异。

## 后端

后端验证范围为 JavaScript、WasmGC 及固定 MoonBit 0.10.11 的 Windows/Linux x64 Native。Windows 使用 GCC 16.2.0；Linux 在 Ubuntu 22.04 构建，最低声明 glibc 2.35，同一压缩包另在 Ubuntu 24.04 验证。未声明最新 nightly、MSVC、macOS、ARM64、Alpine 或 WASI Component 支持。

Native 产品提供 metadata、lookup、project、enrich-many、networks、validate、diff、analyze；Node.js 保留 enrich、diff 和分析示例等完整功能。Native 的参数、JSON、查询与统计在 MoonBit 实现，C 只负责宿主输入输出，不依赖 C/Python MMDB 读取器。Unicode 路径、十万行流式输入、慢消费者与提前关闭管道已在 Windows/Linux 验证。Native JSON 上限 128 层，拒绝未配对 Unicode 代理项转义，其他边界见 [Native 说明](NATIVE_CLI.md)。

两个平台的实际 Native CLI 分别完成 City＋ASN 每库 7,114 个确定性地址、共 14,228 次独立 Python 参考对照；各完成 30 分钟 / 900,000 行持续运行。报告包含二进制、源码、数据库散列与环境。此前 Country/City/ASN 各 5,000 地址的单库证据仍见 [0.4.0 报告](VERIFICATION_0_4.md)；新增产品证据见 [0.5.0 报告](VERIFICATION_0_5.md)。抽样与限速持续运行不代表全记录正确性、定位准确率、商业数据库或长期生产部署；v0.4.0 默认 Node RSS 门槛失败记录继续保留。

Native 0.7.0 增加 `diff`，按输入 IP 比较两个快照；字段选择、变化状态、文件合计限制及完成汇总见 [更新对比](NATIVE_DIFF.md)。

浏览器工作台已通过 Windows/Linux Chromium、Firefox 的网页与离线验收，以及本机 Edge 基础验证；实际支持范围与发布验证见 [浏览器说明](BROWSER.md) 和 [0.9.0 验证](VERIFICATION_0_9.md)。不扩大到 Safari 或手机大数据库性能。

正式 `analytics` 包与 Native/Node `analyze` 的互斥计数、精确整数、来源散列及资源边界见 [日志分析](ANALYTICS.md)。旧分析示例输出保持不变。

0.9.0 默认 Node 稳定性在固定 Node 24.20.0 的 Windows/Linux City＋Country 和 City＋ASN 负载下各连续通过三次 30 分钟验证；本轮 v0.8.0 基线也通过。该结论不覆盖所有 Node 版本，也不撤销历史 Node 24.13.0 失败记录，详见 [0.9.0 验证](VERIFICATION_0_9.md)。
