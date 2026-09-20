# 多库查询与日志分析

适用于需要在同一批日志中查询国家、城市、ASN 或组织内部标签的场景。数据库、字段和结果以数据源名称区分；不把不同供应商的同名字段自动覆盖。所有 MMDB 查询由 MoonBit 完成。

## 快速运行

从仓库根目录执行 `npm run build`，然后分别执行：

```text
node bin/moonmmdb.mjs enrich-many examples/many.json examples/analysis-access.jsonl
node examples/log_analytics/run.mjs tests/scenarios/geo.mmdb tests/scenarios/asn.mmdb examples/analysis-access.jsonl
node bin/moonmmdb.mjs diff tests/scenarios/tags.mmdb tests/scenarios/tags-updated.mmdb examples/analysis-access.jsonl --field /site
```

这三个命令的预期退出码均为 1：前两个样例有一个 IP 未命中，第三个发现标签变化。样例地址为文档用途地址，国家 ZZ/YY、ASN 64512/64513、lab-a/lab-b 标签均为人工测试值，不能用于判断真实 IP 归属。

日志共四条：国家 ZZ 计数 2、YY 计数 1；ASN 64512 计数 2、64513 计数 1；另有一条未命中。更新样例把前两条地址的标签从 lab-a 改为 lab-a-new。

## 配置

```json
{
  "version": 1,
  "sources": [
    {"name": "geo", "database": "data/city.mmdb", "fields": ["/country/iso_code", "/city/names/en"]},
    {"name": "asn", "database": "data/asn.mmdb", "fields": ["/autonomous_system_number", "/autonomous_system_organization"]}
  ]
}
```

相对数据库路径按配置文件所在目录解析。配置最多 64 KiB，必须包含 version 和 sources；每项仅接受 name、database、fields，未知字段拒绝。源名称匹配 `[A-Za-z][A-Za-z0-9_-]{0,31}`，区分大小写，不能重复。1—4 个源，每个源 1—64 个不同 JSON Pointer；空字符串表示完整记录。JSON 重复对象键沿用 JSON.parse 的末值语义。

所有配置和数据库先校验，再读取日志。单库与所有库文件的合计上限均为 256 MiB，不是 RSS 上限；Reader 保存输入快照。解析或某次查询出错不会被当作未命中。

```text
node bin/moonmmdb.mjs enrich-many sources.json access.jsonl --ip-path /client/ip --max-records 100000 --max-input-bytes 67108864
```

输入 `-` 表示标准输入；其他流式限制与 enrich 相同，`--field` 不适用于 enrich-many，应在配置里按源选择字段。输出等待消费者接收，不累计所有输入行。每行保留原始 JSON 数字与转义，结果位于 enrichment.sources；整数的类型化 value 是十进制字符串。

退出码 0 表示所有有效查询命中，1 表示存在未命中，2 表示存在输入或查询错误；字段缺失单独计数。完成后 stderr 输出 summary，包含 processed、valid_ips、invalid_inputs 和每个源的 found、not_found、errors、missing_fields，以及数据库类型、build_epoch、SHA-256。missing_fields 是缺失字段数量，包括未命中记录的所选字段，不能与记录数相加。传输中断或超限时没有完成汇总，此前已输出的行不会撤销。

## MoonBit 公开接口

```moonbit
let fields = @mmdb.prepare_fields(["/country/iso_code"])
let query = @mmdb.Enricher::new([
  { name: "geo", reader: @mmdb.open_bytes(city_bytes), fields },
])
let result = query.lookup("1.1.1.1")
println(result.to_json().stringify())
```

创建和非法 IP 会抛出 MmdbError。Enrichment.sources 保存名称与 SourceResult：Selected(Projection) 或 Failed(MmdbError)。单库失败仍保留其他源的结果，每个源应用自己的 Reader 解码/投影预算；status_code() 对应上述 0/1/2。只复制配置，不缓存查询结果。

## 分析示例

examples/log_analytics 是独立 MoonBit 模块，只使用公开 API。固定提取国家代码和 ASN，逐条汇总，所有计数用 UInt64 并输出十进制字符串；Top 10 按计数降序、同数量按键的字符串顺序排列。每个维度最多 10,000 个不同键，超限为 group-limit，停止后不输出成功统计。字段存在但类型不符合预期时计为错误，和缺失字段区分。requests 统计行数，valid_ips 统计合法 IP 的行数，不是去重 IP 数。

更换为自己的 City 和 ASN 文件即可处理真实日志；原始生产数据库不随仓库或发布包分发。DB-IP 数据应保留 `IP Geolocation by DB-IP https://db-ip.com/` 署名。项目不据此推断真实个人身份、连接来源可信度或当前定位精度。

## 固定真实数据库入口

默认演示不联网。需要复现 2026-09 DB-IP City＋ASN 时，先执行下面的显式下载步骤；脚本核对固定散列值，再用独立配置读取自己的日志。

```text
python scripts/download-production.py
node bin/moonmmdb.mjs enrich-many examples/production-many.json your-access.jsonl
node examples/log_analytics/run.mjs verification/local/production/dbip-city-lite-2026-09.mmdb verification/local/production/dbip-asn-lite-2026-09.mmdb your-access.jsonl
python scripts/enrichment-verify.py --production --native dist/moonmmdb-native-probe.exe
```

最后一条是验证入口，需要先按 README 准备 Python 参考环境并构建 Windows Native 验证程序；日常查询不依赖 Python 或 Native 程序。下载来源和许可证见 THIRD_PARTY.md 与 verification/production-sources.json；镜像附件不可用时会明确失败，不静默替换版本。
