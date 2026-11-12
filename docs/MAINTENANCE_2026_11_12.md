# 当前工具链兼容性维护（0.9.5 源码）

本页保留兼容维护阶段的原始记录；0.9.5 正式交付状态与后续验证回执见[版本报告](VERIFICATION_0_9_5.md)。

本次维护从已发布 0.9.4 的提交 `10afd3fac890449cc1e4dd99a50183ddda78fbda` 开始，适配 2026-11-12 下载并实际验证的官方工具链。公开稳定版仍为 0.9.4；本页记录维护源码，不表示已经发布新的 Mooncakes 包、网页或二进制。

## 实际工具链

在隔离安装目录运行 `moon version --all`：

```text
moon 0.1.20261104 (940aa18 2026-11-04)
moonc v0.10.20+65efd5b93 (2026-11-05)
moonrun 0.1.20261104 (940aa18 2026-11-04)
Feature flags enabled: rr_moon_mod,rr_moon_pkg
```

使用[官方安装入口](https://www.moonbitlang.com/download/)，以命令实际输出为准。CI 固定 `0.10.20+65efd5b93`，避免后续工具链变动使本次结果不可复现。本机 Windows 11 x64（10.0.22000）、Node.js 24.13.0、Python 3.12.5；CI 保留 Node.js 24.20.0。Windows C 宿主使用 MSVC 14.44 与 Windows SDK 10.0.22621.0，工具链隔离安装，没有修改 MoonBit 运行时或系统环境。

## 已修复的兼容问题

- 旧源码在当前编译器下使用内置 JSON 转换失败：显式引入 `moonbitlang/core/json`，使用其转换接口；保留自定义类型化 JSON 和精确整数语义。
- 当前格式化器使用 `#derive`、`Int32`／`UInt32` 和更新的外部函数声明格式。同步维护源码、清单和生成接口；冻结的历史 API 基线及其散列保持原样。
- JavaScript 数组与当前 MoonBit `Array` 的表示不同。为导出的桥接函数增加 `FixedArray` 适配，保留原有 MoonBit 公开签名及 JavaScript 导出名称。字段选择、多库配置和强类型独立消费者的真实调用均重新验证。
- Windows Native 当前要求 MSVC／clang-cl 和 Windows SDK。构建脚本自动发现 MSVC，明确拒绝旧 MinGW 配置；Linux 保留系统 C 编译器。打包改为独立读取 PE 导入表，不再依赖 MinGW 的 objdump。
- 兼容检查器识别编译器的等价类型名称和 derive 输出变化，仍拒绝类型、成员、trait、导入身份或字符串签名的实际变化。新增正反例回归，未放宽历史接口约束。
- 保留固定 `moonbitlang/x@0.5.5` 的密码学实现字节，仅适配清单及条件导入，继续核对上游来源、SHA-256 和 AES 修改声明。
- 更新源码版本、命令帮助与工具链 pin；不批量改写历史报告，不将当前构建结果作为历史 Node 内存失败已经解决的证明。

## 本机实际验证

以下均使用上述当前工具链，独立参考使用固定的 Python maxminddb 3.2.0。

| 验证入口 | 本机结果 |
|---|---|
| `node scripts/release-verify.mjs` | 11 个阶段通过；包括格式、构建、API 兼容、参考器、语料、规模、包和基准 |
| JS／WasmGC 核心与附属包 | 每个后端 85 项测试通过；独立消费者和三个离线场景通过 |
| Node CLI 回归 | 66 项通过；包含 MSVC 空格路径、任务、报告复核、日志分析及输入输出边界 |
| 固定官方 MMDB 语料 | 全部 73 个文件按既有正常／损坏预期核对，保留参考器分歧的独立判定 |
| 强类型 City／ASN 独立参考 | 7,860 次比较通过 |
| `node scripts/native-verify.mjs` | 8 个阶段通过；核心 debug／release 各 58 项，geo 8 项及独立消费者通过 |
| Native 全包检查／release 测试 | 全部 85 项通过，包含 analytics、workflow 与桥接层；已加入 Windows／Linux 自动检查 |
| Native CLI／diff 验证 | 分别 39／40 项检查通过，含 100,000 行更新对比 |
| Native analyze／workflow 定向回归 | 21 项通过，含 100,000 行统计与有界诊断 |
| `python scripts/native-package.py` | 解压后在移除开发工具 PATH 的环境运行 23 个命令通过；仅导入 Windows 系统 DLL |
| `npm run typecheck --prefix web`、构建与增量散列 | 通过；25 个散列／分块组合通过；网页与离线 HTML 字节一致 |
| Edge 离线查询／检查／对比 | Edge 157.0.4341.46，73 个语料文件、17,031 次查询及 13 类交互检查通过 |
| Edge 离线跨端任务流程 | 14 类检查通过；四种任务在 Node／Native 执行、报告导回网页并复验 |
| Edge 离线日志分析 | 6 类检查通过，含 100,000 行、64 MiB 边界、取消重载、精确散列及无外网请求 |

本机日志位于忽略提交的 `verification/local/`。自动化报告记录当前源码、核心构建、HTML 和二进制散列；CI 上传对应运行的报告，避免把不同源码的结果混用。

## 源码复现

安装上面固定的官方工具链和 Node.js；Windows Native 另需 MSVC C++ Build Tools 与 Windows SDK，Linux Native 使用 GCC。然后执行：

```text
moon version --all
npm run build
node scripts/release-verify.mjs
node scripts/native-build.mjs
node scripts/native-cli-verify.mjs
node scripts/native-diff-verify.mjs
python scripts/native-package.py
npm ci --prefix web
npm run typecheck --prefix web
npm run build --prefix web
node web/hash-verify.mjs
```

参考检查需先执行 `python -m pip install --target .reference-deps -r requirements-reference.txt`。无 Python／浏览器环境的使用者可先运行 README 中的 Node 或 MoonBit 最小样例。浏览器测试另需 Playwright 浏览器或指定 `BROWSER_EXECUTABLE`；网页与直接 `file://` 打开分别验证。

## 跨平台与发布边界

GitHub 的 Windows／Linux 检查、构建、测试及浏览器工作流使用相同工具链 pin。远端结果及可下载回执见[维护 PR #9](https://github.com/HhWw96/moonmmdb/pull/9) 的 Checks；修复带空格的 MSVC 安装路径后执行最终验证。

历史稳定性对照单独安装 v0.8.0 原用的 `0.10.11+6ff76a5f9` 工具链，避免用新版编译器改写或编译冻结的旧源码。报告同时记录两套工具链；同机 Node 与数据负载保持一致，但编译器输出不作为相同条件。该流程仍须完成原有持续运行门禁后才能用于正式发布。

本机验证不替代 Linux Native 或远端多浏览器验收，也不等同于完成新版 30 分钟持续运行、生产数据库重验及正式发布。已有发布门禁、固定生产数据、历史失败记录和许可证约束继续保留；正式稳定包与下载入口仍指向 0.9.4。
