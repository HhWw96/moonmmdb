# MoonMMDB 0.9.2

- 新增网页、Node、Native 通用任务文件，以及 run-task 和 verify-report 命令。
- 支持有界异常行定位、临时原行预览、任务导入导出和报告原文件复验。
- 新增原子 UTF-8 报告输出，防止覆盖输入或将不完整写入当作完成报告。
- 修复 Node diff 两库合计 256 MiB 限制，补齐网页标签键盘操作与明确的数据库角色选择。
- 保持既有接口和统计口径；新增声明继续受兼容基线约束。

下载 Windows/Linux 包解压即可使用，或打开[网页](https://hhww96.github.io/moonmmdb/)及本页附带的独立离线 HTML。

```text
moonmmdb run-task examples/tasks/analyze.json --bind city examples/geo.mmdb --bind asn examples/asn.mmdb --bind input examples/access.jsonl --output report.json
moonmmdb verify-report report.json --bind city examples/geo.mmdb --bind asn examples/asn.mmdb --bind input examples/access.jsonl
```

PowerShell 使用 `.\moonmmdb.exe`，Linux 使用 `./moonmmdb`。样例含一次未命中，任务执行预期退出 1；报告复验一致退出 0。

五组发布门禁全部通过，包含独立参考、跨平台离线验收、十万行、诊断满容量、报告重算，以及默认 Node 两种负载各连续三次 30 分钟验证。固定 MoonBit 0.10.11+6ff76a5f9 和正式 Node 24.20.0。

详见[完整使用指南](https://github.com/HhWw96/moonmmdb/blob/v0.9.2/docs/WORKFLOWS.md)及[验证与公开交付回执](https://github.com/HhWw96/moonmmdb/blob/main/docs/VERIFICATION_0_9_2.md)。内部自洽检查、散列匹配及同实现重算不是独立正确性证明；历史失败记录及支持边界保留。
