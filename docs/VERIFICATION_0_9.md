# 0.9.0 验证记录

0.9.0 已完成全部验证并正式发布到 GitHub、Mooncakes 和 GitHub Pages。公开下载后的校验、三平台 Native 隔离运行和全新目录注册表安装均通过；打包前验证与发布后复验分别记录。

本版本实现正式 `analytics` 包、Native/Node `analyze` 命令、精确互斥计数及原始输入来源信息。
固定 MoonBit 0.10.11+6ff76a5f9；正式 Node 对照固定 24.20.0。功能定义见 [日志分析](ANALYTICS.md)。

## 本地核对

- JS/WasmGC/Windows Native 各 60 项 MoonBit 测试通过，其中包含 analytics 的 9 项测试。
- Node 和 Windows Native 各 11 项分析 CLI 检查通过，包含 100000 行、慢输入、提前关闭输出、Unicode 路径、原始字节散列及资源限制；覆盖记录解码超限立即终止和普通记录损坏继续计错的区别。
- 两个宿主均通过固定 DB-IP City/ASN 每库 7114 个确定性地址的独立 Python 3.2.0 查询与聚合对照。
- Windows 候选 ZIP 在移除 Node/Python/MoonBit 路径依赖后通过 11 项解压运行检查。
- 本地 Node 24.13.0 的分阶段抽样诊断显示，20000 次查询的主要分配来自解码；优化小字典查重、递归偏移传递及短整数运算后，查询阶段抽样分配量约由 1.04 GB 降至 0.71 GB。该数据不是默认内存门禁，也不等于精确分配字节数或稳定性证明。

## 正式门禁

实现提交 `462389566a65d1a343e9ef731d95adfa6938ae30` 的以下检查全部通过。它包含 `66101e3` 的解码优化、独立消费者导入修复和记录预算超限的致命错误处理；先前提交的通过记录不能代替本次完整重跑。

| 门禁 | 状态 | 运行记录 |
|---|---|---|
| 原有核心、独立参考、CLI、包与兼容性回归 | 通过 | [Verify MoonMMDB](https://github.com/HhWw96/moonmmdb/actions/runs/36026354200) |
| Native 旧功能、真实库、持续运行、Windows/Linux 包及 Ubuntu 24.04 复验 | 通过 | [Native product validation](https://github.com/HhWw96/moonmmdb/actions/runs/36026354266) |
| Chromium/Firefox 在线与离线回归、浏览器持续运行 | 通过 | [Browser product validation](https://github.com/HhWw96/moonmmdb/actions/runs/36026354294) |
| 新分析包跨后端、两平台两宿主、十万行与各 30 分钟运行 | 通过 | [Analytics product validation](https://github.com/HhWw96/moonmmdb/actions/runs/36026377613) |
| 默认 Node 两种负载的 v0.8.0 对照和三次连续候选运行 | 通过 | [Default Node stability](https://github.com/HhWw96/moonmmdb/actions/runs/36026364274) |

默认 Node 在同一 runner 中先运行 v0.8.0，再运行三次候选版本，每次 30 分钟；City＋Country 与 City＋ASN 分别验证。
两者的数据库、字段与输入序列固定，未强制 GC、未缩小堆、未降低门槛。每 30 秒记录 RSS、heapUsed/heapTotal、external、arrayBuffers；Windows 另记录私有内存。
预热五分钟后比较前后各十个样本中位数，允许增长 max(64 MiB, 早期中位数的 25%)。

2026-09-20 的历史失败来自 Windows/Node 24.13.0，不能将新 runner、Node 24.20.0 描述为旧环境的完全复现。
另从公开 0.4.0 归档恢复原代码，在本机 Node 24.13.0 重跑原负载 1800 秒：核心 JS、数据库、字段、九个 IP 序列、期望结果散列、Node 版本及 CPU 型号均与历史失败报告相同。
此补充复现完成 31,208,000 次查询，结果无漂移，但 RSS 中位数由 251,371,520 增至 320,499,712 字节，增长 69,128,192 字节，超过 67,108,864 字节门槛，仍为失败。
本次明确记录空 `exec_argv` 和默认 GC；历史报告未记录这两个字段。操作系统补丁、后台负载和机器即时状态无法证明完全相同。
该旧运行时复现与正式 Node 24.20.0 门禁分开记录；本轮优化效果由相同 runner/Node 24.20.0 的两个版本对照判断。
RSS 与堆占用是不同指标，外部内存与 ArrayBuffer 也不能重复求和解释为总进程占用。
解释依据：[Node 24 process.memoryUsage](https://nodejs.org/docs/latest-v24.x/api/process.html#processmemoryusage)。

首次 [稳定性任务](https://github.com/HhWw96/moonmmdb/actions/runs/36009906993) 因新检出的旧版本没有报告目录而提前失败。
`bc0b531` 增加目录初始化并重新完整运行；这次脚本失败不计为持续测试通过，也不属于 RSS 超限。
被新源码取代的重复长任务已停止；不将取消的任务计为成功。

提交 `bc0b531` 的核心、Native、浏览器和正式分析功能四项 CI 均通过。但[默认稳定性检查](https://github.com/HhWw96/moonmmdb/actions/runs/36010331215)的 Windows City＋ASN 首次候选运行未通过：RSS 增长 55,173,120 字节在门槛内，私有内存增长 70,881,280 字节，超过 67,108,864 字节门槛。
同一 runner 的 0.8.0 基线通过。候选的 V8 堆容量在约 8 分钟时从约 76 MB 扩展至约 143 MB，随后保持平台；这不等同于已证明对象泄漏，也不满足当前增长门槛。
失败回执保留在 `attempts/bc0b531/windows-asn`。因此停止发布，改进递归解码的临时分配并以 `66101e3` 完整重跑，不删指标、不延长预热或降低阈值。
补充的本机旧运行时候选运行因开发时核心产物被重建而无效，不能计为稳定性通过或失败；原 0.4.0 历史复现未受影响。

独立注册表消费者的源码预检还发现 `analytics` 导入仅用于白盒测试，严格编译会产生未使用导入警告。
`48fa424` 增加消费者公开调用，预检在 JS/WasmGC 通过。该预检使用本地 workspace，仅验证消费者源码，不能充当发布后的注册表安装回执。

## 默认 Node 连续验证结果

同一 runner 先执行 v0.8.0 基线，再执行三次 0.9.0；四组共 12 次候选运行，每次至少 1800 秒，全部通过。原始报告字节散列，以及数据库/字段、九个 IP 序列、预期结果散列、Node/CPU、空 exec_argv、默认 GC 设置均已逐项核对。

| 环境与负载 | 三次 RSS 增长（字节，按执行顺序） | 三次私有内存增长（字节） |
|---|---|---|
| ubuntu-22.04 / City＋ASN | 12288 / 8192 / 8192 | 不适用 |
| ubuntu-22.04 / City＋Country | 0 / 249856 / 1220608 | 不适用 |
| windows-2022 / City＋ASN | -1189888 / -1316864 / -1085440 | 274432 / 0 / 0 |
| windows-2022 / City＋Country | -1902592 / -1216512 / -1826816 | 327680 / 286720 / 55296 |

各次允许增长使用原始规则 max(67108864 字节, 早期中位数的 25%)，没有强制 GC、堆大小限制、额外预热或降低门槛。完整早期/后期中位数、峰值、heapUsed/heapTotal、external、arrayBuffers、每 30 秒样本与查询吞吐均见 `stability/` 原始报告及 `default-stability-summary.json`。

本轮四次 v0.8.0 基线也全部通过。因此结论是 **0.9.0 在固定 Node 24.20.0、上述平台与负载下连续通过默认运行门槛**，不是已经证明历史 Node 24.13.0 故障被消除，也不是仅凭版本对照就证明旧问题的唯一成因。此前 0.4.0 默认失败及本轮早期候选的私有内存失败继续保留。

### 同环境分阶段分配诊断

固定 20000 次操作，分别测量查询、类型化 JSON 序列化、宿主解析和宿主重新编码/排空输出。以下是 Inspector 抽样分配字节数，不能当作精确分配总量、RSS 降幅或文件管道吞吐。

| 环境 | 阶段 | v0.8.0 | 0.9.0 |
|---|---|---:|---:|
| linux | query | 1091311104 | 698095592 |
| linux | typed_serialization | 325135784 | 330126752 |
| linux | host_parse | 9248424 | 8461512 |
| linux | host_stringify_and_output | 45811888 | 46764640 |
| win32 | query | 1042742976 | 687480744 |
| win32 | typed_serialization | 326899240 | 331900960 |
| win32 | host_parse | 9541328 | 9443040 |
| win32 | host_stringify_and_output | 44004200 | 47155472 |

查询阶段的抽样分配在 Linux 约减少 36%，Windows 约减少 34%；改进集中在解码，类型化序列化及宿主输出的分配没有同等下降。本次没有改变 Reader 快照隔离，没有引入缓存、mmap 或惰性解码。源码、探针产物、数据库散列及各阶段堆指标在对应 `allocation-comparison/before.json`、`after.json` 中。

核心 JS SHA-256：`858874d08c0bf0a221daad4c661f5bbf148fc0cd6ffe20b988d9b6f88ba0b3ee`。最终 Windows/Linux 构建的核心 JS 和网页 HTML 分别一致；产物散列见 `candidate-artifacts.json`。报告的 source_sha256 记录各环境检出文件的实际字节，Git 提交用于绑定实现。

## 正式分析持续运行

最终提交的四个实际 `analyze` 进程各运行至少 1800 秒、处理 180000 行。逐项比较四份结果 JSON：计数、Top N、参数、数据库来源及输入字节数/散列完全相同；每份结果另由 Python 独立聚合核对。
其中有效 IP 147274 行、无效输入 32726 行；每个维度成功计数 81820、未命中 65454，其余三类均为零。测试主动包含错误行，因此正常完成报告的预期退出码为 2。

| 环境 | 命令宿主 | RSS 中位数增长（字节） | 私有内存中位数增长（字节） | 结果 |
|---|---|---:|---:|---|
| Ubuntu 22.04 | Node | 3477504 | 不适用 | 通过 |
| Ubuntu 22.04 | Native | 0 | 不适用 | 通过 |
| Windows 2022 | Node | -2029568 | 4759552 | 通过 |
| Windows 2022 | Native | 0 | 0 | 通过 |

以上四项的增长门槛均为 67108864 字节；采样、预热和中位数规则未改变。Windows 工作集可能低于数据库总字节数，不能据此推断全部数据已释放；同时记录并判定私有内存。
完整来源、采样和结果见 `verification/releases/0.9.0/analytics` 与 `analytics-soak-summary.json`。输入 SHA-256 为 `9e55e861acdd4394be1b6ef69ef18db4b4493bd18c8f13a4884b4b6d63a453d5`。
这是新分析命令的证据，不能替代 City＋Country 历史默认查询负载的三轮验证。

## 发布与安装回执

2026-09-25（UTC+8）正式发布，实际 GitHub 发布时间为 2026-09-24T18:25:17Z。

| 交付 | 验证结果 |
|---|---|
| [GitHub v0.9.0](https://github.com/HhWw96/moonmmdb/releases/tag/v0.9.0) | [发布工作流](https://github.com/HhWw96/moonmmdb/actions/runs/36041063913)核对五项门禁与源码差异后发布四个文件及 SHA256SUMS |
| [Mooncakes 0.9.0](https://mooncakes.io/docs/HhWw96/moonmmdb@0.9.0/) | 两次全新目录直接从注册表安装，JS/WasmGC 消费者均通过；未使用本地 workspace |
| [网页](https://hhww96.github.io/moonmmdb/)与[离线 HTML](https://github.com/HhWw96/moonmmdb/releases/download/v0.9.0/moonmmdb-0.9.0-offline.html) | [部署](https://github.com/HhWw96/moonmmdb/actions/runs/36041163097)通过，实际 HTTP 内容为 0.9.0，325304 字节，和公开离线下载逐字节一致 |
| 公开 Native 下载包 | [发布后验收](https://github.com/HhWw96/moonmmdb/actions/runs/36041324916)在 Windows 2022、Ubuntu 22.04、24.04 各通过 11 项隔离运行检查；本机 Windows 另复验通过 |

公开下载文件均与最终 CI 验证产物一致；注册表源码 ZIP 为 2093212 字节、680 个文件，SHA-256 `231f0b49c97ec30bc1f3996a7668b2c14e545d7d96965601e7ffe2fa55fb11b1`，与审核过的上传文件逐字节一致。
源码包提交 `8e3cc2977d9d00a172dcfa2cdad9305cd0ed6bd0`；GitHub tag 提交 `e9ab1257eeac004f6655cbeebb5f47e347b7a070`，差别为发布回执。它们相对通过验证的实现提交仅修改文档和验证记录。

发布后的验收分支只替换测试工作流，未改产品源码；原始回执包含发布提交、验收提交、下载散列与运行环境。它不替代发布前的五项门禁。
全部发布信息见 `verification/releases/0.9.0/publication.json`，原始验证字节保存在 `validation-original-bytes.zip`，防止换行转换影响内部散列复核。`evidence-index.json` 按所标注提交的 Git blob 字节建立索引，不包含自身。
源码归档无法包含自身上传后的散列与后续回执；最终发布信息以仓库主分支本页及上述回执为准。
历史默认 RSS 失败仍见 [0.4.0 验证](VERIFICATION_0_4.md)，没有删除或改写为已经通过。
