# 跨端任务、异常定位与报告复核

适用于 0.9.2 及后续兼容版本；正式发布与支持结论以版本验证报告为准。网页和离线 HTML 使用相同内容，所有文件在本机处理。

## 从网页转到命令行

1. 选择数据库角色与操作参数。查询、检查明确选择目标库；对比分别选择 before、after；分析分别选择 city、asn、input。
2. 点击“导出任务”或“在命令行运行”。任务保存操作、参数、文件名提示和已知 SHA-256，不含文件原文、绝对路径或脚本。尚未完整读取的日志没有散列。
3. 在解压后的程序目录运行，用 `--bind` 明确绑定每个角色。文件名提示不是路径，也不是文件相同的依据。

```text
moonmmdb run-task examples/tasks/analyze.json --bind city examples/geo.mmdb --bind asn examples/asn.mmdb --bind input examples/access.jsonl --output analysis-report.json
moonmmdb verify-report analysis-report.json
moonmmdb verify-report analysis-report.json --bind city examples/geo.mmdb --bind asn examples/asn.mmdb --bind input examples/access.jsonl
```

PowerShell 使用 `.\moonmmdb.exe`，Linux 使用 `./moonmmdb`。源码版使用 `node bin/moonmmdb.mjs` 前缀，源码中的库位于 `tests/scenarios/`，日志位于 `examples/analysis-access.jsonl`。

`examples/tasks/` 提供四种任务。`--bind` 只接受本次明确给出的普通文件，不能从任务中取路径；不接受标准输入 `-`。流式管道继续使用原有 `analyze` 命令。

`--output` 以 UTF-8 写完整报告，默认拒绝覆盖；明确传入 `--overwrite` 才可替换普通文件。任务、报告、数据库和日志的路径或硬链接不能作为输出。使用同目录临时文件，写入成功后才发布目标文件；失败不留下可被当作完成报告的目标。已有文件在失败时保持原状。

## 任务格式 version 1

```json
{
  "format": "moonmmdb-task",
  "version": 1,
  "operation": "lookup",
  "parameters": {"ip": "192.0.2.1", "fields": ["/autonomous_system_number"]},
  "files": [{"role": "database", "name": "asn.mmdb"}]
}
```

操作与角色：lookup/validate 使用 database；compare 使用 before、after；analyze 使用 city、asn、input。文件项可附 `bytes` 十进制字符串和 `sha256` 小写十六进制。运行时必须核对已给出的大小和散列；改名不影响匹配，文件内容变化会失败。

lookup/compare 参数为 `ip` 和 `fields`。validate 为 `decode_data`、`max_work`、`max_state_bytes`。analyze 为 `ip_path`、`top`、`max_groups`、`max_records`、`max_input_bytes`、`max_line_bytes`，可附 `max_json_depth:128` 和 `diagnostic_limit`。完整例子见任务文件。

任务最多 64 KiB、JSON 深度 128；未知字段、版本、角色、重复角色或无效预算会拒绝。导入网页只恢复配置，不自动运行。超过浏览器 64 MiB 日志预算的任务可导出供命令行使用，但网页不会因此提高限制。数据库单库及合计仍不超过 256 MiB。

## 异常定位

```text
moonmmdb analyze CITY.mmdb ASN.mmdb access.jsonl --diagnostic-limit 100
```

CLI 默认关闭诊断，范围 0—1,000；网页默认保留 100 条。上限同时受 512 KiB 诊断缓冲区约束。每条异常行只存一项，其中可同时列出 country、asn 的异常；`retained` 与 `omitted` 都统计异常行，不是异常事件数。达到容量后继续完成统计。

行号从 1 开始。`start`、`end` 是原始输入流的零起点、左闭右开字节范围，包含该行原有的 BOM、CR 和 LF。末行无换行时截止 EOF。分类区分无效 JSON、IP 缺失、IP 类型错误、非法 IP、未命中、字段缺失、字段类型错误和查询错误；适用时附核心代码与数据库偏移。UTF-8 损坏、读取失败和资源超限仍是致命错误，没有完成报告。

诊断不保存原行或 IP。网页只有持有本次分析的原日志，或者原文件复验通过，才允许按范围临时查看原行（最多预览 64 KiB）；有效 IP 可带入查询，并明确选择查询库。导出任务里的单 IP 查询参数、数据库记录本身可能包含 IP 或其他业务信息，分享前应按实际内容判断。

## 重新打开报告

支持 0.9.1 浏览器报告、正式 analyze 报告，以及带 `format:"moonmmdb-report",version:1,task,result` 的新报告。完整报告与导入文件最多 8 MiB，JSON 深度最多 128；预览最多 64 KiB。

- **内部检查**：只检查格式、精确整数、计数关系、排名、来源声明、范围和状态是否自洽。通过后显示“内部检查通过，尚未重新计算”。
- **原文件复验**：绑定全部角色，检查散列后重新运行，比较任务参数和结果，给出一致、不一致或未完成。缺少任一文件不能当作部分复验通过。

语义比较保留带类型整数、浮点位、数组顺序和错误类别，忽略 JSON 对象键顺序及报告外层时间、文件名提示、宿主路径。历史报告没有的诊断不强制补齐比较。内部检查不能检测所有自洽篡改，散列匹配也不是独立正确性证明；独立 Python 参考仍属于发布验证。

`run-task` 沿用对应操作退出码。`verify-report`：0 内部检查通过或重新计算一致；1 来源/结果不一致；2 格式、绑定或运行错误。查看输出中的 `level` 和 `recomputed`，不能只凭退出码 0 推断已重新计算。

## 共享实现和兼容

`HhWw96/moonmmdb/workflow` 负责任务、报告校验与语义比较；`analytics.Analyzer.push_detailed` 通过一次查询返回 `AnalysisRowOutcome`，保留原有 push、finish、报告类型与口径。宿主只负责文件、散列、输入输出和调用。未启用诊断时仍走原来的逐行接口。

Node diff 的两库合计限制收紧至 256 MiB，与 Native 一致，读取前和读取过程中都检查。历史未受此约束的大文件组合需要拆分或降低库大小；文件限制不是进程内存上限。
