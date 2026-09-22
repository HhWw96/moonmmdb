# 0.7.0 验证与发布

本版本增加 Native `diff`，使用现有 MoonBit 公开比较接口；Node 原有命令和核心 API 保持兼容。2026-09-22：实现、完整回归、Windows/Linux 三项 30 分钟持续运行及 Ubuntu 24.04 产物验收全部通过。Mooncakes 全新安装、GitHub 正式发布与重新下载验收已完成；注册表包内文档是上传前快照，最新状态以仓库公开回执为准。

## 验证绑定

实现提交：`efe606a2b77c919d8a42cc9b1cd795cf3f91860a`。

- [完整回归 35685029726](https://github.com/HhWw96/moonmmdb/actions/runs/35685029726)：Windows、Ubuntu 成功。
- [Native 验证 35685029670](https://github.com/HhWw96/moonmmdb/actions/runs/35685029670)：Windows 2022、Ubuntu 22.04 和 Ubuntu 24.04 产物验收均成功。
- [报告索引](../verification/releases/0.7.0/evidence-index.json)。

沿用 MoonBit `0.10.11+6ff76a5f9`，独立 Python maxminddb 3.2.0；Windows 使用固定 GCC 16.2.0，Linux 在 Ubuntu 22.04 构建，最低声明 glibc 2.35。数据库清单、来源、署名和散列沿用 [固定生产数据](../verification/production-sources.json)。

## 范围与方法

本轮核心 API 没有新增或更改，0.5.0 核心/bridge 和 0.6.0 核心/bridge/geo 冻结基线全部保留。完整回归的 JS / WasmGC 各通过 48 项测试，Node 旧命令、官方语料、独立参考、合成规模、包消费与分析示例继续通过。

Native diff 专项包含 40 项检查：与 Node 逐行语义及计数比较、字段变化、记录增删、前缀变化、双方未命中、IPv4/IPv6、损坏查询分支和错误侧标识、坏库与字段预检、Unicode 路径、原始数字、BOM/CRLF/末行、嵌套 IP、错误行继续、输入/行/记录/两库合计限制、慢消费者与提前关闭。坏配置保持 stdin 开放且不供数据，仍须及时退出，证明没有先消费日志。

独立 Python 对每个旧、新查询结果分别计算记录存在性、前缀和字段差异，再核对 Native 输出；不以 Node 或 Native 自己的 diff 结果作为参考答案。官方节点布局及明确人工变异/标签样例共 1,425 项。真实数据固定 7,114 个地址，分别执行 City 与自身、ASN 与自身、City 与 ASN 三组，共 21,342 项；核对两侧值、缺失、前缀、汇总和文件散列。后者用于验证规模和不同字段结构，不是实际跨月更新的证据。

十万行测试使用受控的慢消费者，逐条核对行号、变化字段和原始大整数文本；提前关闭输出必须退出 2 且无完成汇总。默认预算、JSON 嵌套 128 及两库合计 256 MiB 都是显式行为。Native 汇总比 Node 多出 fields 和 databases 归因信息，旧字段含义不变；Native 顶层诊断仍写 stderr。

## 复现入口

```text
node scripts/build.mjs
node scripts/native-build.mjs
node scripts/native-diff-verify.mjs
python scripts/native-diff-reference.py
python scripts/native-diff-reference.py --production
python scripts/native-soaks.py
python scripts/native-package.py
```

先安装固定工具链与 requirements-reference.txt，运行 scripts/download-production.py 获得匹配清单的生产数据；生产数据库不随包分发。注册表独立安装使用 `node scripts/registry-verify.mjs 0.7.0`，只在版本实际上传后运行，不能用 workspace 替代。

## 持续运行与发布

Native 工作流对旧 enrich-many、新 diff 产品命令、网段/检查 API 消费者分别运行 30 分钟，同时使用同一 CI 宿主，但独立采样各自进程。输入速率上限 500 行/秒，不表示最大吞吐；每 30 秒采样、预热五分钟，前后各十个样本中位数增长不得超过 64 MiB 与早期值 25% 的较大者。Windows 记录工作集和私有内存，Linux 记录 RSS 与附加 RssAnon；句柄/文件描述符后期中位数不得增加超过两个。以下为绑定本次实现及 CI 二进制的最终结果；三种负载在同一宿主并发运行，不是专机最大性能测试。

## 保留限制

`diff` 只比较给定 IP，不输出数据库全部变更，不对位置准确性作保证。没有浏览器演示、商业 Enterprise 大库或实际企业采用验证；不扩大到 macOS、ARM64、Alpine 或 MSVC。旧 Node 默认 RSS 失败记录继续保留，Native 通过不能替代该问题的修复。

| 平台 / 负载 | 秒数 | 工作量 | RSS 中位数变化 | 私有内存 / RssAnon 变化 | 句柄 / FD |
|---|---:|---:|---:|---:|---|
| Windows diff | 1800.16 | 900,000 行 | -10,240 B | 0 B | 50 → 50 |
| Windows enrich-many | 1800.01 | 900,000 行 | -22,528 B | 20,480 B | 50 → 50 |
| Windows 游标与检查 | 1800.78 | 2,335 轮 / 18,680 游标 | -1,933,312 B | -69,632 B | 56 → 56 |
| Linux diff | 1800.01 | 900,000 行 | 0 B | 0 B | 3 → 3 |
| Linux enrich-many | 1800.01 | 900,000 行 | 0 B | 0 B | 3 → 3 |
| Linux 游标与检查 | 1800.32 | 2,737 轮 / 21,896 游标 | 0 B | 0 B | 3 → 3 |

全部趋势门槛通过，无崩溃或结果漂移。Windows diff RSS 高水位为 259,039,232 B，Linux 为 256,507,904 B；启动期峰值与预热后中位数是不同指标。不能以 Windows 被系统回收的工作集单独证明内存稳定，私有内存同时核对。

## 原始 CI 发行包

| 平台 | 压缩包 SHA-256 | 可执行程序 SHA-256 |
|---|---|---|
| Windows x64 | `4039de5252fa13f6dc75b0763cda2fbbb01846a35c68e47dcb06bf7134c981f9` | `ededf73e789d08ded387259e81d6840603799ddc7c86face84dff337a6ecf02b` |
| Linux x64 | `075f9671bf95826b967be7fa0a63b92a6b3b5775fee6a85c5af0a28c6dcc4fea` | `60cb29ba344f1e634114aa13cf1a76b0471e79c4c041278e832683a9d1c570c5` |

原始 CI 压缩包各通过 10 个隔离命令检查，运行 PATH 不依赖 Node.js、Python 或 MoonBit，包含许可证、第三方声明和旧/新标签样例。Linux 的相同包又在 Ubuntu 24.04 验收，实际最高 GLIBC 符号 2.34，但仍只声明最低 glibc 2.35。正式 Release 直接复用原始 CI 包。

新 diff 的十万行慢消费者测试，Linux 用时 1.92 秒，Windows 5.40 秒；这些数字包含本测试的输入、输出和人工样例，不能外推为真实业务吞吐。

## Mooncakes 发布与全新安装

[HhWw96/moonmmdb@0.7.0](https://mooncakes.io/docs/HhWw96/moonmmdb@0.7.0/) 已上传。912,362 字节归档 SHA-256 为 `fb62b907b8d086e780f952ea6a5196416c96be68180d6208ce05035bb223fb2d`，重新下载后逐字节散列与准备包一致。

独立临时目录使用 `moon add HhWw96/moonmmdb@0.7.0` 解析注册表依赖，没有 moon.work 或本地 workspace；JS / WasmGC 各通过一项消费者测试，包含版本、查询、投影、联合查询、游标、结构检查及 geo。修复后的通用 `scripts/registry-verify.mjs` 可直接复现，无需版本专用替代脚本。回执见 [注册表安装](../verification/releases/0.7.0/registry-0.7.0.json) 和 [上传散列](../verification/releases/0.7.0/publication.json)。

源码包源自文档提交 `17bba68718eefb30261dd6eed0db807c9e6746a3`，实现源码散列与已通过的 Windows CI 一致，0.6.0 冻结接口逐文件散列保持一致。平台间文本换行会造成不同源码字节散列，报告分别保留。包内包含源码、样例和许可证，排除生产数据库、工具链和凭据；包含私人路径的历史原始编译失败日志没有打包，其失败说明仍保留于历史文档。

## GitHub 正式发布与下载复验

[GitHub v0.7.0](https://github.com/HhWw96/moonmmdb/releases/tag/v0.7.0) 于 2026-09-22 04:39:53 UTC 正式发布，非草稿、非预发布。发布提交 `d2c5a4a56e72c75cd68229f5dfd47fef8f11baee`，[发布门槛工作流 35687720751](https://github.com/HhWw96/moonmmdb/actions/runs/35687720751) 成功；实现验证后只有文档和公开回执变化。

重新下载 Windows ZIP、Linux tar.gz、Mooncakes 源码归档及 SHA256SUMS，三个归档与准备产物散列一致。Windows 下载包在移除开发工具 PATH 的隔离环境重新通过 10 个命令；Linux 下载归档与 Ubuntu 22.04 / 24.04 已验收的同一文件一致，没有声称在 Windows 上运行 Linux 程序。见 [下载验收回执](../verification/releases/0.7.0/published-downloads.json)。
