# 0.9.2 验证及交付状态

当前为开发候选，尚未发布。稳定版保留 0.9.1。本文件随实际证据更新，不将本机冒烟测试代替正式门禁。

交付目标：四种操作的跨端任务复用、有界异常定位、报告内部检查与原文件重新计算，以及 Node diff 合计资源限制和网页键盘操作修复。

正式发布要求保留原有回归、固定官方语料、独立 Python 参考、生产 City/ASN 各 7,114 个地址、JS/WasmGC/Windows/Linux Native、跨浏览器在线及离线验收。新增任务流程须覆盖 100,000 行及诊断满容量，持续运行的内存与句柄门槛不得降低。

既有默认 Node 历史负载与 City/ASN 每个平台连续三次 30 分钟门禁继续执行。历史 Node 24.13.0 RSS 失败记录保留；本轮正式 Node 固定 24.20.0，不使用强制 GC。

只有全部门禁通过，才能发布 GitHub、Mooncakes、Pages、同字节离线 HTML 和 Native 包，并补齐新目录注册表安装、公网下载校验和隔离执行回执。

## 验证来源

候选实现提交：`c174f699a052820256a169c05845b0ef59bc116c`。下列门禁均绑定该提交；文档和发布凭据允许在功能冻结后补充，代码变更必须重新验证。

| 门禁 | 状态 | 运行记录 |
|---|---|---|
| 核心、Node、独立参考和兼容性 | 两平台通过 | [36308877854](https://github.com/HhWw96/moonmmdb/actions/runs/36308877854) |
| Windows/Linux Native 产品 | 两平台通过，Ubuntu 24.04 解压复验通过 | [36308877878](https://github.com/HhWw96/moonmmdb/actions/runs/36308877878) |
| Windows/Linux 浏览器产品 | 两平台通过 | [36308877841](https://github.com/HhWw96/moonmmdb/actions/runs/36308877841) |
| Node/Native 正式分析与报告复验 | 两平台、两种宿主通过 | [36308948170](https://github.com/HhWw96/moonmmdb/actions/runs/36308948170) |
| 默认 Node 历史及 City/ASN 连续稳定性 | 正在执行 | [36308955862](https://github.com/HhWw96/moonmmdb/actions/runs/36308955862) |

常规回归已在两个平台通过：每个平台 67 项 JS、67 项 WasmGC MoonBit 测试及 59 项 Node 测试通过，保留原有独立参考、固定官方语料、兼容基线和隔离消费者验证。原始回执位于 [证据目录](../verification/releases/0.9.2/)。未完成门禁与发布回执仍在收集，不能据此表格推断已经发布。

## 跨端验收

网页构建先生成一份不可变 HTML，再交给 Windows/Linux 的 Chromium、Firefox 验证；不再将不同平台独立构建的 HTML 当作同一个发布文件。候选 HTML 为 593,636 字节，SHA-256：`f60fbbf567c123d435389e38f037e86b36cad61748a7e17c948b4528885c9d69`。

本机 Edge 154.0.4258.37 已通过这份下载产物的 14 项任务流程检查，包括四种网页任务到 Node/Native 的执行、报告重新导入及原文件复验、异常原行预览、替换来源、篡改拒绝、键盘操作和 100,000 行诊断。实际网页验证另保留 73 个官方文件与两份固定真实库的 31,259 次查询检查。短时通过不是持续运行结论。

随包人工 JSONL 统一为 LF 字节，配套固定报告可在 Windows/Linux 复验；用户文件仍按原始字节计算散列，CRLF、BOM 或末行换行的差异不会被掩盖。深层完整记录如果会使报告超过 128 层，两端都明确拒绝导出；可提取较浅字段后重新生成报告。

Windows/Linux 的 Chromium 和 Firefox 均已完成 HTTP 与禁用网络的 file 入口验收。两平台使用同一 HTML SHA-256，保留旧功能、独立参考、7114 地址分析、十万行、64 MiB、任务互操作和报告复验。浏览器持续运行结果如下，采样间隔 30 秒，预热五分钟后比较前后各十个样本中位数：

| 环境 | 实际秒数 | RSS 增长 | 允许增长 |
|---|---:|---:|---:|
| Linux Chromium | 1800.149 | 7,553,024 字节 | 184,242,688 字节 |
| Windows Chromium | 1800.026 | -14,221,312 字节 | 89,703,424 字节 |
| 本机 Edge | 1800.103 | 26,791,936 字节 | 130,772,480 字节 |

三项均通过，最大 Worker 数为 1。Windows Chromium 私有内存增长 -3,276,800 字节，允许 91,955,200 字节；Edge 私有内存增长 33,216,512 字节，允许 120,998,912 字节。不强制 GC，不把数据库或状态预算称作进程内存上限。完整采样和实际浏览器版本见 [浏览器汇总](../verification/releases/0.9.2/browser-summary.json)。

## 正式分析持续运行

正式分析门禁另在 Windows/Linux 的 Node、Native 四种组合各完成 180,000 行和至少 1800 秒持续输入，并检查诊断容量、精确遗漏计数、独立聚合、原始字节散列和结束后的报告原文件复验。四项重算均一致，句柄早晚中位数增长均为 0。Linux Node RSS 增长 927,744 字节、Native 增长 0；Windows Node RSS 增长 -7,731,200 字节、私有内存增长 4,890,624 字节；Windows Native RSS 增长 -65,536 字节、私有内存增长 0。四项允许增长均为 67,108,864 字节，全部通过。采样与回执见 [分析持续运行汇总](../verification/releases/0.9.2/analytics-soak-summary.json)。这些结果不替代默认 Node 历史负载门禁。

## 下载候选包复验

以下为已通过 CI 的候选资产，尚不是公开发行回执：

| 产物 | 字节数 | SHA-256 |
|---|---:|---|
| Windows x64 ZIP | 375,986 | `0749a106e7d159d98f43303ed89953e5d8aa6971ba3d3128d0f9a6799e3e812d` |
| Linux x64 tar.gz | 381,922 | `eafb67662f34563e06273ef0e6dfea5250aa5c9e7d12798a415808caa3d3d16c` |
| 网页/离线 HTML | 593,636 | `f60fbbf567c123d435389e38f037e86b36cad61748a7e17c948b4528885c9d69` |

Windows 下载包已在移除 Node/Python/MoonBit 路径的独立目录通过 23 项运行检查，另复验随包异常日志的固定报告一致。Linux 同一压缩包已在 Ubuntu 24.04 解压复验。两包的人工日志字节与固定源文件一致，包含许可证、第三方声明和四种任务；不含工具链或生产数据库。详细回执见 [候选包验收](../verification/releases/0.9.2/candidate-packages.json)。正式发行后仍须重新从公开发布页下载复验。

## 可复现入口与边界

- `node --test tests/workflow.test.mjs`：四种任务、报告内部检查/重算、计数与来源篡改、输出安全、十万行诊断及随包预期报告。
- 设置 `MOONMMDB_TEST_NATIVE=1` 后运行同一测试：实际 Native 程序的对应行为。
- `node web/workflow-verify.mjs`：真实界面导出任务、两端执行、导回网页重算及异常定位；隔离 CI 另运行 `--file` 断网入口。
- `node web/analytics-verify.mjs --production`：保留 City/ASN 每库 7,114 个地址的独立聚合及浏览器输入边界。
- `python scripts/analytics-soak.py --host node` 或 `--host native`：实际分析命令持续运行、诊断满容量、内存/句柄趋势与结束后的报告原文件复验。
- `node web/soak.mjs`：同一浏览器进程中交替执行任务、诊断、报告复验、取消重载和原有操作，不强制 GC。

报告内部自洽、文件散列相同和使用同一实现重算一致，均不能替代独立参考正确性检查。验证只覆盖列出的平台、数据和负载；商业数据库支持及历史 Node 24.13.0 RSS 失败边界继续保留。
