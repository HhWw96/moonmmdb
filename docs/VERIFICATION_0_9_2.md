# 0.9.2 验证与交付

最终源码的五组发布门禁全部通过，Mooncakes 已发布并完成全新目录安装。GitHub、Pages 与公开下载复验状态由文末交付回执单独记录。

## 源码与正式门禁

最终验证源码：`4fa0e30b1fd93b1abe126cd34fe9a19ecf418318`。固定 MoonBit `0.10.11+6ff76a5f9`、正式 Node `24.20.0`；本机 Edge 运行使用独立回执，不替代跨平台门禁。

| 门禁 | 结果与记录 |
|---|---|
| 核心、Node、兼容性与独立参考 | [通过：36315911777](https://github.com/HhWw96/moonmmdb/actions/runs/36315911777) |
| Windows/Linux Native 与 Ubuntu 24.04 解压验收 | [通过：36315911795](https://github.com/HhWw96/moonmmdb/actions/runs/36315911795) |
| Windows/Linux 浏览器及离线流程 | [通过：36315911895](https://github.com/HhWw96/moonmmdb/actions/runs/36315911895) |
| Node/Native 分析、诊断与报告复验 | [通过：36315926466](https://github.com/HhWw96/moonmmdb/actions/runs/36315926466) |
| 默认 Node 历史及 City/ASN 连续稳定性 | [通过：36315937514](https://github.com/HhWw96/moonmmdb/actions/runs/36315937514) |

每个平台保留 67 项 JS、67 项 WasmGC MoonBit 测试和 59 项 Node 测试。Native 运行共享分析、诊断及工作流测试；新增命令的任务绑定、输出安全、报告篡改、十万行诊断和原有分析边界在 Node/Native 使用同一组测试。兼容检查保留 0.5.0、0.6.0、0.9.0、0.9.1 和新增 0.9.2 基线。

保留全部 73 个固定官方文件的适用查询与检查预期，以及固定 DB-IP City/ASN 每库 7,114 个地址的 Python 独立聚合。四种网页任务均实际导出到 Node/Native 执行，再导回网页核对原文件；覆盖错误/替换来源、诊断截断、精确遗漏计数、旧报告、深层报告、原子输出、输入别名保护、键盘和错误焦点。

## 浏览器与持续运行

两个平台验证同一份 HTML：593,636 字节，SHA-256 `f60fbbf567c123d435389e38f037e86b36cad61748a7e17c948b4528885c9d69`。Chromium、Firefox 均验证 HTTP 和禁用网络的 file 入口，包含 100,000 行、64 MiB 边界及每库 7,114 个地址。实际版本和完整检查列表保存在各平台原始回执中。

| 环境 | 秒数 | 循环 | 最大 Worker | RSS 增长 / 允许增长（字节） |
|---|---:|---:|---:|---:|
| ubuntu-22.04 / 145.0.7632.6 | 1800.108 | 6,645 | 1 | 7,876,608 / 182,270,976 |
| windows-2022 / 145.0.7632.6 | 1800.091 | 6,042 | 1 | -2,777,088 / 83,534,848 |
| local-windows-edge / 154.0.4258.37 | 1800.103 | 7,606 | 1 | 26,791,936 / 130,772,480 |

每 30 秒采样，预热五分钟后比较前后各十个样本中位数；不强制 GC。Windows 另记录私有内存并通过同一门槛。Edge 回执绑定的 HTML 与最终产物逐字节相同，维护检查器修正未改变这份 HTML；没有把新源码身份冒充一次新的 Edge 运行。完整数据见 [浏览器汇总](../verification/releases/0.9.2/browser-summary.json)。

## 正式分析与默认 Node 稳定性

Windows/Linux 的 Node、Native 四项分析均处理 180,000 行并持续至少 1800 秒，诊断满容量后仍保持精确统计；原文件报告复验一致，句柄早晚中位数增长均为 0。内存、采样及重算见 [分析持续运行汇总](../verification/releases/0.9.2/analytics-soak-summary.json)。

默认 Node 在两平台分别执行 City＋Country、City＋ASN；每组先跑 v0.8.0 基线，再连续跑三次候选。四次基线和十二次候选均完成至少 1800 秒并通过。候选最大 RSS 中位数增长 32,768 字节，Windows 最大私有内存增长 638,976 字节，低于原定“64 MiB 或早期中位数 25%，取较大值”门槛。无强制 GC、无缩小堆参数；报告内部散列与原始字节逐一核对。见 [稳定性汇总](../verification/releases/0.9.2/stability-summary.json)。

历史 Node 24.13.0 RSS 失败完整保留。本次 v0.8.0 基线也通过，不据此宣称重现或修复旧操作系统/机器/运行时组合的失败。浏览器和正式分析通过不能替代历史负载门禁。

## 产物与注册表来源

| 产物 | 字节数 | SHA-256 |
|---|---:|---|
| moonmmdb-0.9.2-windows-x64.zip | 375,986 | `a04200540037992a3e3b4fb217c8d910a5dbbefc1f5dc29979576685e1a06372` |
| moonmmdb-0.9.2-linux-x64.tar.gz | 381,943 | `6251b4c28cfb96de65033a32e48ad50e3e66d902ff231ab89a82d26e96b9fe7a` |
| 网页/离线 HTML | 593,636 | `f60fbbf567c123d435389e38f037e86b36cad61748a7e17c948b4528885c9d69` |
| Mooncakes 注册表归档 | 3,934,106 | `8d2a525644e6124f70442bb19f9ed1e265f600b35b0ddce9466f82cf64251b49` |

两份 Native 包包含许可证、第三方声明和四种离线任务；JSONL 样例统一 LF，用户自己的输入仍按原始字节散列。下载 Windows 包在移除开发工具路径的目录通过 23 项命令检查，另核对异常日志固定报告。Linux 同一包在 Ubuntu 24.04 解压验收；声明支持下限仍为 glibc 2.35。

Mooncakes `HhWw96/moonmmdb@0.9.2` 已返回 200 OK；公开归档与上传文件逐字节相同，1,035 个文件，源码、样例和许可证检查通过。打包来源提交为 `45428a1c6ed4b3707fb3d897f81ff76b25c466df`。只排除含私人用户路径的历史编译日志，原始项目历史保持不变。

首次安装遭遇注册表索引连接失败；随后严格消费者发现普通模块未使用 workflow 导入的验证脚本缺陷。该脚本已在最终 GitHub 源码修正，重新从注册表安装、JS/WasmGC 消费通过；失败回执分别保留在 [索引失败](../verification/releases/0.9.2/registry-first-attempt.json)和[消费者失败](../verification/releases/0.9.2/registry-consumer-failure.json)，私人临时路径已脱敏。

注册表归档保持不可变，其中 123 个运行源码文件与最终源码逐字节相同；维护脚本保留上传时版本。复验使用 GitHub 当前源码中的 `scripts/registry-verify.mjs`，不要把注册表归档等同于最终 GitHub 树的每个文件。新版本安装回执见 [registry-0.9.2.json](../verification/releases/0.9.2/registry-0.9.2.json)；旧 0.5.0 的新目录安装也通过，见 [旧版回执](../verification/releases/0.9.2/registry-old-0.5.0.json)。

## 复现与证据边界

使用步骤、参数、资源限制和退出码见 [WORKFLOWS.md](WORKFLOWS.md)。内部自洽、散列匹配和同实现重算一致均不是独立正确性证明。完整验证入口为 `node scripts/release-verify.mjs`、`node --test tests/workflow.test.mjs`、`node web/workflow-verify.mjs`、`node web/analytics-verify.mjs --production`、`python scripts/analytics-soak.py --host node` 和 `node web/soak.mjs`；Native 分析验证使用 --host native；具体选项按各脚本说明执行。

原始 CI 和 Edge 回执字节保存在 `validation-original-bytes.zip`，用于核对报告内部散列；Git 单独列出的 JSON 可能经过文本换行转换，最终证据索引按提交中的 Git blob 字节计算。安装检查器修正前已经通过的一组完整门禁保存在 `prior-validation/`，不作为最终源码门禁的替代。支持结论仅覆盖记录的平台、数据、版本和负载。

## 公开交付复验

GitHub、Pages、公开下载和发布后注册表安装回执正在补齐；以 [publication.json](../verification/releases/0.9.2/publication.json) 的状态为准。
