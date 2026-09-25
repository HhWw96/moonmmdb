# 日志分析

0.9.0 新增功能；下载与安装回执见 [版本验证](VERIFICATION_0_9_1.md)。无需预先生成联合补充日志：

```text
moonmmdb analyze CITY.mmdb ASN.mmdb access.jsonl --ip-path /client/ip --top 10
node bin/moonmmdb.mjs analyze CITY.mmdb ASN.mmdb access.jsonl --ip-path /client/ip --top 10
```

Native 离线包演示：`moonmmdb analyze examples/geo.mmdb examples/asn.mmdb examples/access.jsonl`。
源码演示：`node bin/moonmmdb.mjs analyze tests/scenarios/geo.mmdb tests/scenarios/asn.mmdb examples/analysis-access.jsonl`。
人工样例预期 4 次请求、国家 ZZ 两次、YY 一次，另一次未命中，退出 1；不代表真实 IP 归属。
标准输入使用 `-`。每行一个 JSON 对象，默认读取 `/ip` 字符串。

## 报告口径

报告仅在完整读取输入后向 stdout 输出一次，诊断向 stderr 输出。`status: complete` 表示输入正常结束、统计已完成，
不代表所有行都正确。正常 EOF 无法识别上游静默截断；同时检查退出码和输入 SHA-256。

- `requests = valid_ips + invalid_inputs`，统计请求次数，不对 IP 去重、不推断人数。
- 每个国家/ASN 维度的 `counted + not_found + missing_field + type_error + query_error = valid_ips`。
- `not_found`：IP 无记录；`missing_field`：有记录，但指定字段不存在；两者不会重复计数。
- `type_error`：国家字段不是字符串，或 ASN 不是无符号 16/32/64 位整数。空字符串是字符串分组，0 是合法无符号 ASN 键；不额外验证地理学语义。
- `query_error`：有效 IP 的该库查询失败，包括地址族不适用、损坏记录等非资源错误。另一维度仍独立统计。数据库记录触发解码或投影预算上限时，整次分析立即终止，不输出完成报告。
- `top` 按次数降序，同数按键的 UTF-16 字典序排序；例如 ASN `"10"` 在 `"9"` 前。
- `group_count` 为完整有效分组数，`other_requests` 为 Top N 以外的成功计数。
- 所有计数使用精确 UInt64，JSON 中输出十进制字符串。限制参数和退出码为普通整数。

报告附带 `tool_version`、实际 `parameters`、两库类型/构建时间/字节数/SHA-256，以及原始 `input.bytes` 和
`input.sha256`。输入散列包含 BOM、CR、LF、空行及末行原始字节；不将 JSON 重新编码后计算散列。
原始日志不写入报告或存储在分析器中。

退出码：0 无未命中和错误；1 有未命中；2 有非法输入、查询错误或类型错误，优先级最高。
字段缺失单独统计，不改变退出码。空输入输出零计数报告，退出 0。
非法 JSON、缺失 IP 字段或非法 IP 算错误行并继续；打开数据库失败、UTF-8 损坏、读取失败、资源超限及输出失败立即终止，
不输出完整报告。输出可能因操作系统写入失败而只出现片段，不能忽略最终退出码。

## 资源与生命周期

`--top N` 默认 10、范围 1..100；`--max-groups N` 默认 10000、每维上限 10000。
单组键上限 256 UTF-8 字节；新增分组前检查预算。分组或计数溢出后分析器停止接受数据。
单库及两库合计上限 256 MiB，不代表进程内存上限。两个库各打开一次并保留隔离快照。

沿用 `--max-records`（默认 10000、上限 1000000）、`--max-input-bytes`（默认 8 MiB、上限 1 GiB）、
`--max-line-bytes`（默认及上限 8 MiB，不包含 LF，包含 CR）；JSON 深度上限 128。
支持 UTF-8、首行 BOM、CRLF、末行无换行、中文/非 BMP 路径和嵌套 JSON Pointer。
不接受 `--field`；两个字段固定为 `/country/iso_code` 和 `/autonomous_system_number`。
全部参数及数据库在消费日志前验证。输入逐行累计，内存不会随日志总行数保存副本。

MoonBit API 见 [analytics 包](../src/analytics/README.md)。旧分析示例的重叠计数口径保持不变；
不要直接比较旧示例的 `missing_fields` 与新报告的 `missing_field`。

## 验证入口

`node --test tests/analyze.test.mjs` 验证 Node；设置 `MOONMMDB_TEST_NATIVE=1` 验证 Native。
`python scripts/analytics-reference.py --native --production` 使用固定 Python 参考独立聚合每库 7114 个地址。
`python scripts/analytics-soak.py --host node` / `--host native` 分别运行实际命令 30 分钟。
默认 Node 历史负载的 A/B 和三次连续门禁由 `Default Node stability` 工作流执行；
历史失败报告仍保留，不以新分析命令通过替代旧负载结论。
