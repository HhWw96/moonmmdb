# 0.9.1 验证与发布状态

五组跨平台发布门禁均已通过；Mooncakes 0.9.1 已发布并完成独立注册表安装，GitHub 与网页发布及公开产物复验正在执行。最终公开交付以本页发布回执为准，门禁通过本身不等于已经发布。

验证入口：

- `node scripts/release-verify.mjs`：保留核心、CLI、独立参考、包内容和旧消费者检查。
- `node web/hash-verify.mjs`：增量 SHA-256 与 Node 独立实现对照。
- `node web/analytics-verify.mjs --production`：人工与真实数据、精确报告、十万行、64 MiB、取消与下载。
- `node web/analytics-verify.mjs --file --production`：隔离 CI 中禁用网络直接打开 HTML。
- `node web/soak.mjs`：30 分钟，分析、查询、比较、检查、取消与重载，采样整个浏览器进程树。
- 现有 Windows/Linux Native、正式分析与默认 Node 稳定性门禁继续执行，不以浏览器通过替代历史负载。

前端验证使用仓库 Playwright：当前未提供 Browser 插件及其 browser 技能。记录浏览器实际版本、页面身份、桌面与窄屏截图、控制台、交互、网络请求及报告散列。历史 Node 默认 RSS 和旧配置失败记录完整保留。

## 验证源码与回执

实现提交：`4cce6354cebf23d71a835d6ad22ddffcb64a7162`。

| 门禁 | 当前状态 | 运行记录 |
|---|---|---|
| 核心、独立参考、CLI、打包及旧消费者 | 两平台通过 | [36139544456](https://github.com/HhWw96/moonmmdb/actions/runs/36139544456) |
| Native 完整验收 | Windows/Linux 通过，Ubuntu 24.04 解压复验通过 | [36139544371](https://github.com/HhWw96/moonmmdb/actions/runs/36139544371) |
| 浏览器产品与持续运行 | Windows/Linux 通过 | [36139545098](https://github.com/HhWw96/moonmmdb/actions/runs/36139545098) |
| 正式分析产品 | Windows/Linux Node、Native 均通过 | [36139579064](https://github.com/HhWw96/moonmmdb/actions/runs/36139579064) |
| 默认 Node 连续稳定性 | 两平台、两种负载各连续三次通过 | [36139583916](https://github.com/HhWw96/moonmmdb/actions/runs/36139583916) |

本机 Edge 153.0.4234.48 已完成 73 份固定语料和两份真实库的 31,259 次浏览器查询检查，以及新分析流程的十万行、64 MiB、原始字节散列、读取错误、取消恢复、报告下载和每库 7,114 个地址独立对照。跨平台正式报告统一使用固定 Node 24.20.0。

本机 Edge 完整持续运行 1800.16 秒，通过 4550 批分析，最大 Worker 数量为 1。RSS 早期／后期中位数分别为 476628992／452614144 字节；私有内存为 489922560／464070656 字节，均通过原有增长门槛。该记录不能替代 Windows/Linux Chromium 或默认 Node 历史负载门禁。

## 浏览器验收

Windows 与 Linux 均使用 Chromium 145.0.7632.6、Firefox 146.0.1，分别验证网页与 `file://` 离线入口。每种组合保留 73 份官方文件加两份固定真实数据库的查询／检查验证；新增分析验证包括每库 7,114 个地址的独立聚合、100,000 行、64 MiB 文件、原始输入散列、读取故障和取消重载。实际请求列表与控制台结果保存在原始报告中。

| 持续运行环境 | 实际秒数 | 分析批数 | 最大 Worker | RSS 中位数增长 | 允许增长 |
|---|---:|---:|---:|---:|---:|
| Linux Chromium | 1800.12 | 7,542 | 1 | 18,489,344 字节 | 184,676,352 字节 |
| Windows Chromium | 1800.14 | 7,942 | 1 | 3,422,208 字节 | 85,521,920 字节 |
| 本机 Edge | 1800.16 | 4,550 | 1 | -24,014,848 字节 | 119,157,248 字节 |

Windows Chromium 私有内存增长 21,301,248 字节，低于允许的 87,809,536 字节；本机 Edge 私有内存增长为 -25,851,904 字节。采样间隔 30 秒，预热五分钟后比较前后各十个样本中位数，不强制 GC。RSS 为整个浏览器进程树求和，可能重复计算共享页；该结果不是进程内存上限承诺。

## 原有分析与 Native 回归

Windows/Linux 的 Node 与 Native `analyze` 分别完成 180,000 行、至少 1800 秒持续运行，四项均通过；Node 的 RSS 中位数增长分别为 -219,136 和 4,976,640 字节，Native 分别为 -8,192 和 0 字节。Windows 另检查私有内存：Node 增长 4,341,760 字节，Native 为 0。完整采样与结果见 [`analytics-soak-summary.json`](../verification/releases/0.9.1/analytics-soak-summary.json)。这些结果不替代默认 Node 的多库历史负载门禁。

Native 原有联合补充、diff、游标／检查持续运行均在两平台完成至少 1800 秒。每个平台的实际 Native 程序继续通过固定 City＋ASN 的 14,228 次独立查询对照；正式分析另外通过每库 7,114 个地址的 Python 独立聚合。Windows 包只需要声明的系统 DLL，Linux 包在 Ubuntu 22.04 构建并于 Ubuntu 24.04 解压复验。

版本选择逻辑新增 `0.9.1`、`0.9.10` 等数字比较用例；实际旧版本兼容入口还在全新临时目录安装 0.5.0，JS/WasmGC 消费均通过，见 [`registry-old-0.5.0.json`](../verification/releases/0.9.1/registry-old-0.5.0.json)。私有临时目录路径已省略；历史接口基线未改写。

## 默认 Node 稳定性

固定 Node 24.20.0，在 Windows 2022 和 Ubuntu 22.04 分别运行 City＋Country、City＋ASN；每组先运行 v0.8.0 基线，再连续执行三次本版本候选。四次基线和十二次候选均完成至少 1800 秒，原始报告内部散列与下载文件逐一匹配。候选的最大 RSS 中位数增量为 409,600 字节，Windows 最大私有内存中位数增量为 335,872 字节，均通过原有门槛。

无强制 GC、无堆缩小参数，保留 RSS、堆、外部内存、ArrayBuffer 和 Windows 私有内存的实际采样。完整数据见 [`stability-summary.json`](../verification/releases/0.9.1/stability-summary.json) 和其链接的原始回执。本轮 v0.8.0 基线也通过，不能据此宣称重现或修复了旧 Windows／Node 24.13.0 机器的失败；历史失败记录继续保留。

## 发布产物身份

下列文件已经过对应 CI 验证，尚不代表已公开发布。正式发布使用 Linux 构建的同一份 HTML 作为网页及离线下载；Windows 构建另有独立散列和验证记录。

该 Linux CI HTML 还在本机 Edge 153.0.4234.48 经仅提供该文件的本地 HTTP 入口复验，通过完整 31,259 次查询、14 项工作台检查及七组日志分析验收（含真实库、100,000 行和 64 MiB）。这两份回执的 HTML 散列与待发布文件一致，见 [`release-html-edge`](../verification/releases/0.9.1/release-html-edge)。本机最初的 30 分钟记录绑定本地构建；正式 Chromium 持续运行分别绑定各 CI 平台构建，不混用散列。

| 产物 | SHA-256 |
|---|---|
| 离线 HTML（442,333 字节） | `3d856d3aece27b2978239868f43b4f393cc65072d32fe8feb71b12f78b1b4b7a` |
| Windows x64 ZIP | `e02af7c89dedee9e4c8ce56718af7e0d006f5b91c350041df404eeb8aca3e68d` |
| Linux x64 tar.gz | `19b14b41b9fe3a16708b4b278fd593063ed9d3afab4fe3110af437ca475571a6` |

原始回执位于 [`verification/releases/0.9.1`](../verification/releases/0.9.1)。源码身份以实现提交和各平台报告中的散列共同绑定；不同平台的换行和生成代码字节可能不同，不据此宣称二进制可复现。

[`validation-original-bytes.zip`](../verification/releases/0.9.1/validation-original-bytes.zip) 保留 CI 和本机浏览器回执的原始字节，用于复核报告内部散列；Git 中单独列出的 JSON 可能经过文本换行转换。最终证据索引另按提交中的 Git blob 字节计算，不混淆这两种散列口径。

## 注册表发布与安装

`HhWw96/moonmmdb@0.9.1` 已由服务端返回 200 OK。重新下载的公开归档与上传文件逐字节相同，SHA-256 为 `3dffd46868f2569f93839e35677f3968b9ff1e1651689423f81cff7f1cf32126`，3,059,439 字节、852 个文件；源码、样例、许可证和公开接口声明核对通过。打包来源提交为 `2eb0be8c805fedb61c54e94072aa6ce15434528f`，只排除包含私人用户路径的历史编译日志，完整原因见 [发布凭据](../verification/releases/0.9.1/publication.json)。

在仓库之外的全新临时目录从注册表添加精确版本，验证版本、查询、geo、遍历、结构检查与 analytics，JS/WasmGC 均通过；没有本地 workspace 替代依赖。回执见 [`registry-0.9.1.json`](../verification/releases/0.9.1/registry-0.9.1.json)。
