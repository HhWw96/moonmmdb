# 0.6.0 验证与发布

2026-09-21：本版本实现、完整回归、Windows/Linux Native 持续运行及 Ubuntu 24.04 产物验收通过。Mooncakes 0.6.0 已上传并通过全新目录注册表安装；GitHub 正式 Release 和下载复验完成。注册表构建包中的本页是上传前快照，最新回执以本仓库为准。

## 绑定与复现

实现提交：`8b91a9f5c935e8c40b9469917bca279e5dc544b6`。之后的发布提交只整理文档和验证回执，不改变已验证实现。

- [完整回归 35582806143](https://github.com/HhWw96/moonmmdb/actions/runs/35582806143)：Windows、Ubuntu 成功。
- [Native 35582806130](https://github.com/HhWw96/moonmmdb/actions/runs/35582806130)：Windows 2022、Ubuntu 22.04 成功；同一个 Ubuntu 22.04 包在 Ubuntu 24.04 的隔离运行验证成功。
- [报告与散列索引](../verification/releases/0.6.0/evidence-index.json)；[发布后回执目录](https://github.com/HhWw96/moonmmdb/tree/main/verification/releases/0.6.0)。

固定 MoonBit `0.10.11+6ff76a5f9`，Node 24，独立 Python maxminddb 3.2.0。Windows 使用 GCC 16.2.0，Linux 使用 Ubuntu GCC 11.4.0。文本换行转换导致平台源码字节散列不同；索引分别记录，公共源文件的差异只有行尾，注册表包从已验证 Windows 字节导出。

复现入口：`node scripts/release-verify.mjs`、`python scripts/inspection-verify.py --native`、`python scripts/inspection-verify.py --native --production`、`node scripts/inspection-cli-verify.mjs --native`、`python scripts/native-soaks.py`。先按照 Native 文档安装固定工具链、构建程序并下载清单中的参考数据。

## 正确性与规模

JS / WasmGC 各通过 48 项核心与 geo 测试；Windows/Linux Native 核心、geo 与独立消费者测试通过。保留 0.5.0 的 44 项核心和 15 项 bridge 公开声明，新增 0.6.0 核心、bridge、geo 冻结基线。参见 [兼容政策](COMPATIBILITY.md)。

73 个固定官方 MMDB 文件逐一验证，文件覆盖不等于移植所有上游实现的完整断言集或所有分支覆盖。原有固定语料有 17,043 次独立查询，强类型样例有 7,860 次比对；新增遍历/检查在 Node、Windows Native、Linux Native 分别完成 53,343 次地址与值核对，并完整导出 65,536 个合成 /16 网段。检查包含网络首、尾、内部地址，CIDR 裁剪、共享子树、映射/6to4、不可达损坏节点、循环、深度与预算边界、游标隔离及错误后的终止行为。

物理树结构预期由独立原始格式解析器给出，正常值使用固定 Python 读取器逐 IP 查询。Anonymous 文件不把 Python 枚举失败视为成功，仍使用官方源数据和逐 IP 参考。名为 `libmaxminddb-corrupt-search-tree.mmdb` 的样本在本检查范围内是合法的 1 个可达、99 个不可达节点；文件名不是错误判据。人工样例另行证明普通查询未经过的非法指针和循环能被发现。

## 真实数据库

固定 DB-IP Lite 2026-09 City + ASN，来源、署名与 SHA-256 见 [数据清单](../verification/production-sources.json)。两平台分别保留每库 7,114 个地址的独立对照，并增加共 68 项确定性网段首尾、内部及边界外核对。以下是全物理树及所有不同引用偏移的解码检查，数据区未引用字节不在范围内。

| 数据库 | 树节点 | 解码记录偏移 | 工作单位 | 辅助缓冲区峰值 | Linux / Windows 耗时 |
|---|---:|---:|---:|---:|---:|
| City | 14,346,080 | 562,485 | 193,656,993 | 32,057,306 B | 24.65 / 32.55 秒 |
| ASN | 1,146,501 | 81,763 | 8,852,914 | 2,622,478 B | 1.45 / 1.91 秒 |

均无不可达节点，完整检查通过。City 的完整解码需要显式 `--max-work 1000000000`；默认一亿工作单位不足时返回 incomplete，不能误报 valid。辅助缓冲区计数不包含数据库快照、当前记录及运行时内存，不是进程内存上限。

## 流式与持续运行

两个 Native 平台各完成 131,072 条遍历输出、慢消费者、100,000 条输出预算终止和提前关闭管道检查；中断不产生完成汇总。旧 enrich-many 的 100,000 行慢消费者及错误输入回归同时通过。Unicode、空格及非 BMP 路径通过。

产品 CLI 的流式持续运行与独立 Native API 消费者各运行 30 分钟，分别采样；两者在同一 CI 宿主同时执行，吞吐不能视为专机最大性能。API 消费者每轮创建、消费并关闭八个游标（包含提前关闭），核对记录并完整检查真实 ASN 库的引用记录；该消费者不是新产品命令。

| 平台 / 负载 | 持续时间 | 工作量 | RSS 后期减前期中位数 | 私有内存中位数变化 | 句柄 / 文件描述符 |
|---|---:|---:|---:|---:|---|
| Windows 产品 CLI | 1,800.06 秒 | 900,000 行 | -55,296 B | 0 B | API 消费者另行计数 |
| Linux 产品 CLI | 1,800.19 秒 | 900,000 行 | 0 B | 0 B | API 消费者另行计数 |
| Windows API 消费者 | 1,800.23 秒 | 2,362 轮 / 18,896 游标 | -1,323,008 B | -34,816 B | 56 → 56 |
| Linux API 消费者 | 1,800.40 秒 | 2,740 轮 / 21,920 游标 | 0 B | 0 B | 3 → 3 |

每 30 秒采样，预热 5 分钟后取前后各十个样本中位数；增长门槛为 64 MiB 或早期中位数 25% 中较大者。所有门槛通过，无崩溃、结果漂移或新增 API 消费者句柄持续增长。Windows 同时使用工作集与私有内存，避免仅靠被系统压低的工作集推断内存稳定性。完整采样见两个平台的 native-soak 和 inspection-soak 报告。

## 交付产物

正式发布复用以下原始 CI 包，不重新构建：

| 产物 | SHA-256 |
|---|---|
| Windows ZIP | `7036ddf0f1614f94101644b8754478e6fea985926b8d0bb492b7a50341cc9752` |
| Linux tar.gz | `6f446d1212118c0557f814d96eb5d67976c6a5a2e44ef951f8d16020a0de2dfc` |
| Windows 可执行程序 | `6e01f5d587d8ec70c94e5522f7cdf2797e05bd3d85af88255030799b0a3f284e` |
| Linux 可执行程序 | `347f5b2e27eb220074c0215f8877a54af99f096143939b58b17d229225a259e5` |

压缩包包含快速入门、离线样例、许可证和第三方声明，9 个隔离命令验收通过，运行 PATH 不依赖 Node.js、Python 或 MoonBit。Windows 检查系统 DLL，Linux 产物实际最高 GLIBC 符号为 2.34，但仅声明最低 glibc 2.35，且只支持 Windows/Linux x64。

## 保留边界

未扫描未引用的数据字节；结构通过不代表定位信息准确；没有真实商业 Enterprise 大库验证；没有在线 demo。既有 Node 默认 RSS 门槛失败记录继续保留，Native 通过不代表该问题已修复。官方固定 Enterprise/Anonymous 样例通过不能扩大为所有商业数据库都已验证。

## 注册表安装回执

[Mooncakes 0.6.0](https://mooncakes.io/docs/HhWw96/moonmmdb@0.6.0/) 下载归档 SHA-256 为 `58cdddb255c733742002b78b92ef083c7be649023b05b3de3d1b07b91fa034ef`，与发布前检查的 839,472 字节归档一致。新目录通过 `moon add HhWw96/moonmmdb@0.6.0` 解析注册表依赖，没有 moon.work 或本地 workspace 替代；JS / WasmGC 各执行并通过一项包含版本、查询、投影、联合查询、游标、检查及 geo 的消费者测试。

[安装回执](../verification/releases/0.6.0/registry-0.6.0.json)、[上传与冻结接口散列](../verification/releases/0.6.0/publication.json)。复现运行 `node verification/releases/0.6.0/registry-consumer-verify.mjs`。此版本专用脚本修正了通用 registry-verify 脚本仅在测试中使用 geo 导入导致的 deny-warn 警告；消费者正式代码也调用 geo，已验证的库源码没有变化。Windows 本次安装使用进程级 Git OpenSSL 后端绕过宿主 Schannel 凭据错误，未修改全局 Git 设置。

发布归档排除了包含本机用户路径的旧编译失败原始日志 `verification/regressions/native-mingw-missing-rand-s.json`；历史失败结论仍保留在仓库文档中。排除项不影响源码、样例、许可证或验证绑定。

## 正式发布与下载复验

[GitHub v0.6.0](https://github.com/HhWw96/moonmmdb/releases/tag/v0.6.0) 于 2026-09-21 10:15:15 UTC 发布，非草稿、非预发布；[发布门槛工作流 35587733106](https://github.com/HhWw96/moonmmdb/actions/runs/35587733106) 成功，目标提交 `90f122eacbc722433a576361084b030df63f24ff`。

再次从公开 Release 下载 Windows ZIP、Linux tar.gz、Mooncakes 源码包及 SHA256SUMS，三个归档与验证产物逐字节散列一致。Windows 下载包在本机隔离目录完成 9 个命令检查，运行 PATH 不包含 Node.js、Python 或 MoonBit。Linux 下载包与已通过 Ubuntu 22.04 / 24.04 验收的同一归档一致，没有在 Windows 上冒称重新运行 Linux 二进制。见 [下载回执](../verification/releases/0.6.0/published-downloads.json)。
