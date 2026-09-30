# 0.9.3 验证与平台交付

官方 [Mooncakes 0.9.3](https://mooncakes.io/docs/HhWw96/moonmmdb@0.9.3/) 已发布；全新目录注册表安装及 JS/WasmGC 消费者测试通过。公开归档与上传包逐字节一致，见 [发布回执](../verification/releases/0.9.3/mooncakes-publication.json)。[GitHub v0.9.3](https://github.com/HhWw96/moonmmdb/releases/tag/v0.9.3) 提供 Native 与离线 HTML 下载；正式验证与状态更新继续绑定实际任务，不修改历史失败记录。

## 编译器及兼容

固定 `moonc 0.10.14+7d59c7ec9`，满足参赛者提供的“不低于 0.10.14”要求。来自官方固定版本地址的 Windows 工具链、core 压缩包散列见 [工具链回执](../verification/releases/0.9.3/toolchain.json)。版本检查绑定完整修订号，CI 安装声明与构建检查保持一致。

显式声明过去隐式提供的派生类型方法；既有 0.5.0、0.6.0、0.9.0、0.9.1、0.9.2 冻结接口检查通过，历史基线保持原字节。网络游标关闭时替换底层数组，避免新 Array.clear 行为保留已不用的引用。第三方 AES 恢复上游数组构造语法，文件内保留修改通知及来源散列，算法未改变。

本机 Node 24.13.0、Windows x64、Edge 154.0.4258.37 验证；正式 CI 仍固定 Node 24.20.0。本机与正式稳定性条件分开记录，不以本机通过替代发布门禁。

本机补充 Native 检查执行核心 debug/release 各 43 项、geo 8 项、独立强类型消费者 1 项、日志消费者 1 项和分析示例 4 项；八个验证步骤通过。原脚本仍断言 40 项而误报失败，已修正并保留回执，见 [Native 核心](../verification/releases/0.9.3/local-native-core.json)。解压包移除开发工具路径后 23 个命令通过，真实 City/ASN 各 7,114 个地址与独立 Python 参考一致。

## 浏览器导出

任务与报告共用 8 MiB 下载边界，下载链接附加到页面后触发，并提供可再次点击的保存链接。仅提示“已发起下载”；页面无法证明浏览器最终已写入磁盘。取消、清空、修改参数或替换文件会释放旧临时地址。

Edge 已实际保存四种任务和 Node/Native 重算后的报告，验证再次保存内容逐字节一致；导入报告、绑定原文件、重新计算均通过，覆盖十万行和诊断容量。详见 [本机回执](../verification/releases/0.9.3/local-edge-workflow.json)。

Codex 内置浏览器已确认 ASN 查询和保存入口显示；下载与再次保存均未返回下载完成事件。因此内置浏览器写盘尚未确认，不能记为通过。项目支持声明仍为已验证的桌面 Chromium、Edge 和 Firefox。

## 发布门禁

本节以下保留早期候选的验证记录；当前源码和交付状态以末尾的实际运行入口、Mooncakes 发布回执，以及 Release 附件 `FINAL_VERIFICATION.json` 为准。

保留完整回归、Native、浏览器、正式分析与默认 Node 稳定性五组门禁；本版本不缩短持续运行、不强制 GC、不降低资源和内存趋势门槛。旧版本及历史失败报告保持不变。新编译器下任何门禁未通过时，继续保留 0.9.2 为公开稳定版本。

2026-09-30 源码 `6c5a37254e52256e55df6e31d673d750e7039e39` 的核心、Native、浏览器及分析门禁通过；[默认 Node 门禁](https://github.com/HhWw96/moonmmdb/actions/runs/36699865080) 的 Linux 两组通过，Windows Country 第三次候选及 ASN 第二次候选的组合内存门禁失败，因此本版本仍不能发布。完整采样显示 RSS 与结果稳定性通过，Windows 私有内存分别增长 70,031,360 和 71,321,600 字节，超过 67,108,864 字节门槛。堆容量扩大而外部内存相对稳定，不能据此认定对象泄漏或排除泄漏。事实、原报告散列及采样见 [失败回执](../verification/releases/0.9.3/stability-first-failure.json)，保留本次记录。

候选修复复用单次 IP 解析，直接包装已经填充的 JSON 映射，避免二次复制。返回的映射仍为每次调用新建；完整解码、每库资源限制和公开接口保持不变。新增四库跨地址族对照与 JSON 修改隔离回归。本机 JS、WasmGC、Windows Native 及独立参考回归通过；正式 Node 24.20.0 同负载、同门槛的两平台持续验证仍需重新完成，不能用本机短期分配诊断替代。

## 当前源码与验证入口

实现提交 `2064211626dae08bd7449914c4357a4a00618d22`；公开二进制来自其父提交 `45c81c38ca5b7d666ebbe73348fb8417e0713724`，合并未修改实现。

| 检查 | 实际运行 |
|---|---|
| 核心与独立参考 | [36741729577](https://github.com/HhWw96/moonmmdb/actions/runs/36741729577) |
| Native 与 Ubuntu 24.04 复验 | [36741729670](https://github.com/HhWw96/moonmmdb/actions/runs/36741729670) |
| Chromium/Firefox 在线与离线 | [36741729646](https://github.com/HhWw96/moonmmdb/actions/runs/36741729646) |
| Node/Native 分析 | [36741825783](https://github.com/HhWw96/moonmmdb/actions/runs/36741825783) |
| 默认 Node 连续稳定性 | [36741834100](https://github.com/HhWw96/moonmmdb/actions/runs/36741834100) |

网页部署校验兼容 Windows 生成的 CRLF 校验清单，保留 SHA-256 校验与失败终止；网页必须直接使用 Release 附件的相同 HTML 字节。

公开 Windows/Linux 可执行文件与最终主分支 CI 生成的程序逐字节一致；公开 HTML 与两平台共享测试 HTML 也一致。压缩包本身可能因构建元数据不同而有不同散列，程序及网页的对应散列分别核对；不以“源码相同”代替实际字节比较。最终摘要见 Release 附件 `FINAL_VERIFICATION.json`，早期的 `VALIDATION_STATUS.json` 仍作为发布时快照保留。
