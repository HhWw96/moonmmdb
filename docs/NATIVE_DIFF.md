# 用日志检查数据库更新影响

`diff` 对同一批输入 IP 查询旧、新数据库，输出字段、记录存在性及匹配前缀的变化。Node 已有此命令；Native 自 0.7.0 提供。它不列出整库所有变化，也不修改数据库。

## 离线演示

在 Native 压缩包的解压目录执行：

```text
moonmmdb diff examples/tags.mmdb examples/tags-updated.mmdb examples/access.jsonl --field /site
```

PowerShell 使用 `.\moonmmdb.exe`，Linux 使用 `./moonmmdb`。标签库是项目人工生成的机房标签示例，使用文档保留地址，不代表真实企业或真实地理数据。输出里的旧、新字段和值由 MoonBit 比较接口产生。

在源码目录运行同一场景：

```text
node bin/moonmmdb.mjs diff tests/scenarios/tags.mmdb tests/scenarios/tags-updated.mmdb examples/analysis-access.jsonl --field /site
```

## 检查自己的数据

假设日志每行是 `{"client":{"ip":"192.0.2.1"},"request_id":9007199254740993}`：

```text
moonmmdb diff old-city.mmdb new-city.mmdb access.jsonl --ip-path /client/ip --field /country/iso_code --field /city/names/en
```

传 `-` 读取标准输入；先验证全部选项、字段和两份数据库，再消费日志。两库各打开一次，逐行读取、比较并等待结果写完，不保存整份日志。原始 `input` 中的数字表达和转义保留，不把大整数转换成浮点数。

不指定 `--field` 时比较完整记录；可重复指定最多 64 个不同的 JSON Pointer。选择字段时，未选择的字段变化不会触发 changed；记录的存在性和命中前缀变化仍参与比较。

## 结果解释

| 字段 / 状态 | 含义 |
|---|---|
| diff.status | changed、unchanged 或 error |
| record_changed | 旧、新库是否存在记录发生变化 |
| prefix_changed | 匹配前缀长度变化，即使选中字段没变也报告 |
| changed_fields | 发生变化的 JSON Pointer，完整记录使用空字符串 |
| before / after | 旧、新查询结果；字段分别标明 present / missing |

Map 的键顺序不影响比较；数组顺序、整数/浮点类型和浮点原始位参与比较。双方都未命中且前缀相同可以是 unchanged，不会误判成业务错误。缺失字段和非法 IP 也有不同状态。

Native 在 stderr 完成汇总中提供 processed、changed、unchanged、errors、fields 和 databases.before/after 的类型、构建时间、字节数及 SHA-256。可用散列核对本次实际比较的数据库；库的构建时间并不代表下载时间。

## 退出码与中断

| 退出码 | 含义 |
|---:|---|
| 0 | 完整处理，无变化、无错误（空输入也为 0） |
| 1 | 完整处理，存在变化，无错误 |
| 2 | 存在输入/查询错误，或读写、中断、资源限制错误 |

非法 JSON/缺少 IP/非法 IP 按行报告并继续，最终错误优先。UTF-8 损坏、文件读取失败、输出关闭或超限立即停止；之前可能已有部分输出，且不会产生完成汇总。自动化脚本应同时检查退出码和完成汇总。命令读取到正常 EOF 并不能证明上游命令业务成功，管道使用者仍应检查上游退出状态。

## 边界

- 两个 Native 数据库分别及合计最多 256 MiB，超限在读取日志前拒绝；Node diff 保留历史每库 256 MiB 行为。文件大小限制不是进程内存上限。
- 默认最多 10,000 行、总输入 8 MiB、单行 8 MiB；可通过 `--max-records`、`--max-input-bytes` 提高到 1,000,000 行及 1 GiB。单行上限不能超过 8 MiB，CR 计入、LF 不计入。
- 支持 UTF-8、文件首 BOM、CRLF、末行无换行，以及中文、空格、非 BMP 路径。Native JSON 最多 128 层，不接受未配对的 Unicode 代理项。
- Native 顶层错误写 stderr；Node 旧命令部分顶层错误写 stdout。结果语义、错误类别和退出码对应，系统错误文字不保证相同。
- 真实验证使用固定同月 City/ASN 快照：验证同库结果不变及不同结构库的差异；人工标签和定点变异样例验证更新。没有将这些测试描述为真实跨月变更审核或生产企业采用。

验证入口：`node scripts/native-diff-verify.mjs`、`python scripts/native-diff-reference.py`、`python scripts/native-diff-reference.py --production`；30 分钟负载使用 `python scripts/native-soak.py --mode diff`。本版本结果见 [验证报告](VERIFICATION_0_7.md)。
