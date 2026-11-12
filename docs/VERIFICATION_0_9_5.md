# 0.9.5 验证与平台交付

本版适配 MoonBit 官方当前工具链，修复 JSON 转换、JavaScript 数组桥接和 Windows Native 构建，减少解码工作数组扩容与联合查询序列化的临时分配；未选中小映射用已验证 UTF-8 区间检查重复键，所有值、指针和预算仍完整验证；输出采用固定 64 槽片段区分块连接，IP 解析避免临时分段数组。保持既有公开函数、CLI 参数、退出码和类型化结果语义；冻结 API 基线及上游 crypto 实现字节保持原样。

## 实际环境与实现来源

固定工具链 `moonc v0.10.20+65efd5b93`；`moon`、`moonrun` 均为 `0.1.20261104 (940aa18 2026-11-04)`。正式 CI Node.js 为 `24.20.0`。本机早期功能回归使用全局 Node.js `24.13.0`；最终下载产物的隔离 Edge 复验使用固定 Node.js `24.20.0`，实际 Edge 为 `157.0.4341.46`。Windows/Linux CI 的实际浏览器为 Chromium `145.0.7632.6` 与 Firefox `146.0.1`。Windows Native 使用 MSVC 与 Windows SDK，Linux 在 Ubuntu 22.04 使用 GCC 构建、最低 glibc 2.35，并在 Ubuntu 24.04 复验同一包。

已验证实现提交：`c4a4844f235b4c742906d663d6d0f97aa23c4383`。发布回执和说明可能在其后补充，发布门禁禁止未重新验证的实现变化。

| 检查 | 实际运行 | 结果 |
|---|---|---|
| 默认 Node 四组负载与连续三次候选验证 | [43290594886](https://github.com/HhWw96/moonmmdb/actions/runs/43290594886) | 通过 |
| Node/Native 正式日志分析 | [43290587523](https://github.com/HhWw96/moonmmdb/actions/runs/43290587523) | 通过 |
| 核心、CLI、语料与独立参考回归 | [43290581786](https://github.com/HhWw96/moonmmdb/actions/runs/43290581786) | 通过 |
| Windows/Linux Native 与 Ubuntu 24.04 产物复验 | [43290581581](https://github.com/HhWw96/moonmmdb/actions/runs/43290581581) | 通过 |
| Windows/Linux Chromium、Firefox、网页与离线 | [43290581558](https://github.com/HhWw96/moonmmdb/actions/runs/43290581558) | 通过 |

## 验证口径

JS、WasmGC、Native 各执行全包 92 项测试；保留核心、geo、analytics、workflow、桥接、Node/Native CLI、输入输出边界和独立消费者检查。固定 73 个官方文件按正常或损坏预期逐项核对；已知参考器异常使用既有独立判定。真实 DB-IP City/ASN 每库 7,114 个确定性地址与 Python maxminddb 3.2.0 分别查询、聚合核对，数据库版本、来源、散列和署名保持固定。

最终主分支的下载产物另在本机隔离 Edge 中断网打开：75 份语料、31,259 次查询及 35 项定向检查通过，覆盖四种任务与 Node/Native 互转；Windows 压缩包在移除开发工具 PATH 后通过 23 项运行检查。桌面与 390 像素宽度截图已核对，未发现控制台错误。

十万行流式处理、慢消费者、输出关闭、诊断截断、报告复验、浏览器 64 MiB 边界均覆盖。Windows/Linux 的 Native 三类持续运行和浏览器进程树观察分别跑满 30 分钟；正式 Node/Native 分析命令另各完成 30 分钟。

默认 Node 矩阵在 Windows/Linux 的 City＋Country 和 City＋ASN 下，先运行 v0.8.0 基线，再连续运行三次当前候选，每次 30 分钟。旧源码独立使用原 `0.10.11+6ff76a5f9` 编译器，候选使用当前工具链；运行时和数据负载一致，编译器输出并非固定不变，不将其表述为单因素优化效果。

内存门槛不变：每 30 秒采样，预热五分钟，比较前后各十个样本中位数，增长不超过 64 MiB 或早期中位数 25%（取较大值）；Windows 同时检查私有内存。不强制 GC、不限制堆大小、不降低负载。文件和辅助状态上限不代表进程内存上限。历史默认 Node 失败记录完整保留，包括本次适配后、优化前的 [Windows City＋Country 私有内存增长失败](https://github.com/HhWw96/moonmmdb/actions/runs/43228471211)。该次 RSS 通过而私有内存增长 71,577,600 字节，超过 67,108,864 字节；新结果不能改写此记录。随后 [ef52d29 的 Windows City＋ASN](https://github.com/HhWw96/moonmmdb/actions/runs/43260603543) 私有内存增长 70,852,608 字节，亦超过同一门槛，记录同样保留。

## 发布与独立复验

[GitHub v0.9.5](https://github.com/HhWw96/moonmmdb/releases/tag/v0.9.5) 的 FINAL_VERIFICATION.json 绑定五组门禁、实现、数据库及产物。POST_PUBLICATION.json 记录实际发布后的下载、安装和网页结果；不能以候选构建或 CI 成功替代公开交付状态。

[官方 Mooncakes](https://mooncakes.io/docs/HhWw96/moonmmdb@0.9.5/) 使用 `moon add HhWw96/moonmmdb@0.9.5`，在全新目录验证 JS/WasmGC，不使用 workspace 替代注册表。公开 ZIP 与实际上传文件核对 SHA-256。

Windows/Linux 压缩包、源码包、离线 HTML 以 SHA256SUMS 核对；下载后的 Native 程序在移除开发工具 PATH 的目录执行。Pages 从同一 Release 下载 HTML，在线页面与离线文件必须逐字节一致。具体复现命令见[兼容维护记录](MAINTENANCE_2026_11_12.md)、[Native 说明](NATIVE_CLI.md)和[浏览器说明](BROWSER.md)。

## 支持边界

功能仍为本地查询、结构检查、指定 IP 更新对比、JSONL 分析与任务/报告复核。人工样例不代表真实归属；结构检查不认证地理准确性；报告自洽和同实现重算不是独立正确性证明。没有扩大到 Safari、ARM64、Alpine、macOS 或手机大数据库性能。
