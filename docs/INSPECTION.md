# 网段导出与数据库检查

适用于 0.6.0。查询、遍历、检查与解码全部由 MoonBit 实现，Node/C 负责宿主输入输出。二者不依赖在线服务或 Python 查询器。

## 导出指定 CIDR

```text
moonmmdb networks city.mmdb 81.2.69.0/24
moonmmdb networks city.mmdb 2001:4860:4860::/112 --max-records 200000 --max-work 200000000
node bin/moonmmdb.mjs networks tests/fixtures/MaxMind-DB-test-ipv4-24.mmdb 1.1.1.0/30
```

stdout 为 JSONL，每条含 `network` 和 `value`；value 使用原有类型化 JSON，整数是精确十进制字符串。按地址升序输出命中区间，不合并相邻记录、不输出未命中区间。库中记录大于请求 CIDR 时仅输出交集。CIDR 必须没有主机位，例如 `1.1.1.1/24` 会拒绝，不能静默转换为 `1.1.1.0/24`。

IPv4 请求在 IPv6 库中使用 `::/96` 下的 IPv4 子树；IPv6 请求始终返回 IPv6 CIDR。映射地址与 6to4 依据库中的实际树边输出；不跳过别名、不按共享记录去重，也不做 Teredo 地址转换。IPv6 采用小写十六进制及最长零段压缩，映射地址不改写为点分十进制。此行为与 Python 参考器跳过部分 IPv4 别名的枚举策略不同，因此参考验证逐路径产生网络，再独立查询其首尾地址。

退出码：0 完整执行且有命中；1 完整执行且没有命中；2 参数、数据库、输出或资源错误。只有完整导出且所有记录写出后，stderr 才有 `status: summary`，包含范围、记录数、工作量、数据库类型、构建时间和 SHA-256。已有输出不意味着任务完整；必须检查退出码和完成汇总。

## 检查物理结构与引用记录

```text
moonmmdb validate database.mmdb
moonmmdb validate database.mmdb --decode-data --max-work 1000000000
```

默认先检查全部物理树节点，包含不可达节点中的指针和循环；确认可达路径能在地址位数内终止。共享子树允许重复引用，不能误判为循环。不可达节点本身不判错，报告其数量。

`--decode-data` 在全树结构通过后，按物理节点顺序解码每个不同的树引用数据偏移一次，包括不可达节点的引用。沿用现有解码限制，不缓存全部解码记录，不扫描未被树引用的数据字节。只报遇到的首个错误。

stdout 返回一个报告：`valid` 表示所选范围完整通过，`invalid` 表示发现确定错误，`incomplete` 表示预算不足，`error` 表示使用或运行错误。打开文件等宿主错误写 stderr。只有 valid 退出 0，其他退出 2。成功报告包含范围、检查节点数、可达/不可达节点数、解码记录数、工作量、辅助缓冲区峰值及数据库散列；输出失败仍以最终退出码为准。

结构通过不代表定位数据准确，也不是完整商业数据库、全部字节或全部供应商字段的认证。普通 `open_bytes` 和逐 IP 查询不会自动进行全树检查，其已有行为不变。

## 资源与 API

| 选项 | 默认 | 上限 |
|---|---:|---:|
| networks `--max-records` | 100,000 | 1,000,000 |
| 两命令 `--max-work` | 100,000,000 | 1,000,000,000 |
| validate `--max-state-bytes` | 67,108,864 | 268,435,456 |

参数为正十进制整数，拒绝重复选项。数据库文件上限仍为 256 MiB。一次树边读取、一次解码值处理各计一个单位；每段展开文本/字节按 64 字节向上取整计费，处理前检查预算。检查器也对物理节点扫描计费。每条记录仍单独遵守原有 Reader 解码限制。

状态缓冲区计入节点状态、高度、引用位图与显式栈，栈扩容时同时计算旧/新缓冲区。它不包含数据库快照、当前解码结果、宿主缓冲区及运行时开销，不是进程内存上限。City Lite 2026-09 全解码需要提高工作预算；预算不足返回 incomplete，不能据此判断数据库损坏。

```moonbit
let reader = @mmdb.open_bytes(database_bytes)
let cursor = reader.networks("81.2.69.0/24")
defer cursor.close()
while cursor.next() is Some(record) {
  println(record.to_json().stringify())
}
let report = reader.validate(decode_data=true,
  limits={ max_work: 1000000000, max_state_bytes: 67108864 })
println(report.to_json().stringify())
```

这些调用抛出 MmdbError，需由调用者捕获或传播。游标关闭可重复调用；关闭后 next 返回 None。发生错误后游标释放内部引用并保留错误，后续 next 重抛该错误，包括先 close 再 next 的情况。不同游标、返回的容器相互隔离。CLI 每写完一条才取下一条；库调用方负责及时关闭游标及管理自身输出。

## 两个离线场景

Native 压缩包中执行（Windows 用 `.\moonmmdb.exe`）：

```text
./moonmmdb networks examples/asn.mmdb 192.0.2.0/24
./moonmmdb lookup examples/hidden-corruption.mmdb 1.1.1.1
./moonmmdb validate examples/hidden-corruption.mmdb
```

第一个场景导出人工 ASN 记录；后两个命令演示相同文件普通查询命中，但完整检查发现不可达节点指向分隔区，返回 `invalid-tree-pointer`、退出 2。全部是明确标记的人工数据，不代表真实 IP 归属。

源码复现入口：`python scripts/inspection-fixtures.py`、`python scripts/inspection-verify.py`、`python scripts/inspection-verify.py --native`、`node scripts/inspection-cli-verify.mjs --native`。真实数据另用 `python scripts/inspection-verify.py --native --production`。长时检查见版本验证报告。
