# 日志接入与数据库更新检查

以下命令在仓库根目录运行，先执行 `npm run build`。官方测试数据库中的归属信息仅供测试，换成自己获准使用的数据库后才用于实际分析。

## 复用 MoonBit 字段选择配置

```moonbit
let selector = @mmdb.prepare_fields(["/country/iso_code", "/city/names/en"])
let first = reader.project_prepared("1.1.1.1", selector)
let second = reader.project_prepared("8.8.8.8", selector)
```

路径在准备时验证一次。可以把同一选择器用于多个 Reader；每次查询仍完整、有界地解码记录，不复用上一次结果，不跳过数据错误。现有 `reader.project(ip, paths)` 保持可用。

## 接入嵌套 IP 日志

```text
node bin/moonmmdb.mjs enrich tests/fixtures/MaxMind-DB-test-ipv4-24.mmdb examples/nested-access.jsonl --ip-path /client/ip --field /ip
```

输出中的 `input` 保留原始 JSON 对象，包括大整数、负零和转义写法；`mmdb` 包含结果。本例最后一条未命中，退出码 1。`--ip-path` 和 `--field` 使用 JSON Pointer，分别定位输入日志 IP 与数据库字段。`/a~1b` 表示键 `a/b`，`/~0key` 表示键 `~key`；数组用 `/clients/0/ip`。

## 读取管道与较大的日志

把输入文件参数替换成 `-`，即可接收上游程序的 UTF-8 标准输出。

```text
node bin/moonmmdb.mjs enrich your.mmdb - --ip-path /client/ip --field /country/iso_code --max-records 100000 --max-input-bytes 134217728 --max-line-bytes 1048576
```

上例允许最多 100,000 行、128 MiB 总输入、1 MiB 单行。默认仍为 10,000 行与 8 MiB 总输入；无需一次读入全部日志。支持 LF、CRLF、跨块中文及无末尾换行。空白行、无 IP 字段和无效 JSON 单独报告；字节限制、行限制、UTF-8 损坏和管道故障会终止处理。

每行等待下游接收后才继续输出。流式运行可能先输出若干成功行再遇到错误，因此自动化任务必须检查最终退出码，不能把部分输出当成完整成功。参数上限是资源策略，不代表已做过 1 GiB 全规模压力验证。

## 检查数据库更新影响

```text
node bin/moonmmdb.mjs diff tests/fixtures/MaxMind-DB-test-ipv4-24.mmdb tests/fixtures/MaxMind-DB-test-ipv4-32.mmdb examples/database-check.jsonl
node bin/moonmmdb.mjs diff old.mmdb new.mmdb your-sample.jsonl --field /country/iso_code --field /autonomous_system_number
```

第一条比较不同节点编码的等价官方样本，结果为无差异、退出码 0。第二条用于自己的更新候选文件：每行输出 `diff.before`、`diff.after`、`record_changed`、`prefix_changed` 和 `changed_fields`。未选择字段不参与值比较，但命中状态与网段前缀仍参与。没有 --field 时比较完整记录；map 键顺序不算变化，类型、数组顺序和浮点位变化会被报告。

处理完成后 stderr 输出一条 JSON 汇总，包含处理行数、变化数、无变化数及错误数。stdout 只保留逐行结果。退出码 0 表示样本无差异，1 表示发现差异，2 表示存在输入或查询错误；有错误时不能认定比较成功。元数据可以分别用 metadata 检查。这是样本检查，不是整库一致性证明，也不会自动替换线上文件。

MoonBit 中可使用：

```moonbit
let selector = @mmdb.prepare_fields(["/country/iso_code"])
let difference = old_reader.compare_prepared(new_reader, "1.1.1.1", selector)
println(difference.to_json().stringify())
```

Node.js 流式处理依据 [Stream 文档](https://nodejs.org/api/stream.html#consuming-readable-streams-with-async-iterators)，字段路径依据 [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901.html)。完整参数及失败语义见 [支持范围](SUPPORT.md)。
