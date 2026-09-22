# MoonMMDB Native 快速入门

解压后直接运行 `moonmmdb.exe`（Windows）或 `./moonmmdb`（Linux）。
无需安装 Node.js、Python 或 MoonBit。Linux x64 的最低 glibc 版本为 2.35。

以下 Linux 示例在 Windows 中将 `./moonmmdb` 替换为 `.\moonmmdb.exe`：

```text
./moonmmdb --version
./moonmmdb metadata examples/geo.mmdb
./moonmmdb lookup examples/geo.mmdb 192.0.2.1 198.51.100.1
./moonmmdb project examples/asn.mmdb 192.0.2.1 /autonomous_system_number
./moonmmdb enrich-many examples/many.json examples/access.jsonl
```

示例库由项目人工生成，使用文档保留地址，不代表真实地域、运营商或企业。
示例包含未命中，所以退出码可能为 1；这不是程序异常。

实际使用时，把配置中的 database 改为自己的 MMDB 路径。相对路径以配置文件目录为准。
配置只接受 version: 1 和 sources；每个源包含 name、database、fields。
支持 1–4 个源，名称唯一，每源 1–64 个 JSON Pointer 字段。

```json
{"version":1,"sources":[{"name":"geo","database":"city.mmdb","fields":["/country/iso_code"]},{"name":"asn","database":"asn.mmdb","fields":["/autonomous_system_number"]}]}
```

`enrich-many CONFIG -` 从标准输入流式读取。每行必须是带 ip 字符串的 JSON 对象。
选项：`--ip-path /client/ip`、`--max-records N`、`--max-input-bytes N`、`--max-line-bytes N`。
不接受 `--field`；字段由配置指定。每个选项只能出现一次。

默认最多 10,000 行和 8 MiB 输入，单行最多 8 MiB（不含 LF，包含 CR）。
可分别增加至 1,000,000 行和 1 GiB 输入；单行不能超过 8 MiB。
配置最多 64 KiB；单个数据库以及所有数据库合计最多 256 MiB。
这不是进程内存上限：读取器保存数据库快照，解析和输出也会占用内存。
JSON 嵌套最多 128 层；支持 UTF-8、首行 BOM、LF/CRLF、末行无换行。

stdout 为逐条 JSON 结果，原始日志保存在 input 下，联合结果在 enrichment.sources 下。
大整数的原始文本保留；MMDB 类型化整数以十进制字符串表示。
有效 IP 的库查询失败不会覆盖其他源结果；未命中和字段缺失单独计数。
每源 missing_fields 统计缺失字段数量，包含未命中记录中选择的字段。

退出码：0 全部命中；1 存在未命中；2 存在输入、查询或读写错误，优先级最高。
错误行可继续处理；传输、UTF-8、资源上限或管道中断导致终止。
只有正常读完且结果已成功写出，stderr 才包含 status: summary 的最终汇总。
汇总包括行数、各库计数、数据库类型、构建时间及 SHA-256。请同时检查退出码和汇总。

Native 不提供 enrich 或 analytics 命令；对应功能仍可使用项目的 Node.js 工具。
目前只交付 Windows/Linux x64，不声明 macOS、ARM64、Alpine 或 MSVC 支持。

项目与源码：https://github.com/HhWw96/moonmmdb
许可证及第三方来源见 LICENSE、THIRD_PARTY.md、licenses/。

## 网段与检查

`moonmmdb networks examples/asn.mmdb 192.0.2.0/24` 按地址顺序输出 CIDR 与类型化记录。
`moonmmdb validate examples/asn.mmdb --decode-data` 检查全部树节点与引用记录。
`moonmmdb lookup examples/hidden-corruption.mmdb 1.1.1.1` 命中人工数据，但 `moonmmdb validate examples/hidden-corruption.mmdb` 发现不可达节点的损坏指针，预期退出 2。

networks 默认最多 100000 条，`--max-records` 上限 1000000；两命令 `--max-work` 默认 100000000，上限 1000000000。validate 的 `--max-state-bytes` 默认 64 MiB，上限 256 MiB，只限制辅助状态缓冲区，不是进程内存上限。
networks 完整执行有命中退出 0，无命中退出 1；错误或超限退出 2，且无完成汇总。validate 报告 valid/invalid/incomplete/error，只有 valid 退出 0。资源不足不是数据库损坏的证明。
City Lite 大库完整解码建议显式 `--max-work 1000000000`。更多说明见源码 docs/INSPECTION.md。

## 数据库更新对比

```text
./moonmmdb diff examples/tags.mmdb examples/tags-updated.mmdb examples/access.jsonl --field /site
./moonmmdb diff old.mmdb new.mmdb access.jsonl --ip-path /client/ip --field /country/iso_code --field /city/names/en
```

对输入日志中的 IP 比较旧、新快照，默认比较完整记录；重复 `--field` 最多选择 64 个不同字段。逐行输出 `input` 和 `diff`，包含旧值、新值、变化字段、记录存在性与命中前缀变化。两边都没有记录可以是 unchanged；这不是整库差异枚举。标签样例为人工数据，预期有变化时退出 1。

退出码：0 全部未变化；1 存在变化；2 存在错误，优先级最高。错误行继续，UTF-8、资源、读写或管道错误立即终止。只在完整完成时输出 stderr 汇总，包含 processed、changed、unchanged、errors、fields 及 databases.before/after 的版本与 SHA-256。即使已有输出，也必须检查最终退出码。

继承上述 JSONL 限制和 128 层嵌套限制。两个数据库每个最多 256 MiB，合计最多 256 MiB；全部参数、字段及数据库验证后才消费日志，两个快照各打开一次。Node diff 的既有单库上限保持不变；Native 合计上限更严格。Map 键顺序不影响比较，数组顺序、数值类型和浮点原始位参与比较。
