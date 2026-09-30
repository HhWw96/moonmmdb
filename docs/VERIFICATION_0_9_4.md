# 0.9.4 验证与平台交付

本版减少联合查询桥接的中间 JSON 分配，保持公开 API、完整解码、精确数值、资源限制及结果隔离。新增私有序列化对照覆盖全部值类型、控制字符、Unicode、缺失字段、单库错误及最大解码深度；公开 `to_json` 行为保持不变。

## 可复现检查

工具链固定 `moonc 0.10.14+7d59c7ec9`，正式 Node 检查固定 `24.20.0`。本机 Node `24.13.0` 与 Edge 检查另行记录，不替代正式默认运行门禁。

- `node scripts/release-verify.mjs`：格式、版本、冻结 API、JS/WasmGC、CLI、独立参考、73 个固定官方文件、真实 City/ASN 各 7,114 个地址、十万行、隔离包及边界检查。
- Native 工作流：Windows/Linux 实际程序、流式输出、真实库、持续运行、移除开发工具路径后的解压包使用；Ubuntu 24.04 再验同一 Linux 包。
- 浏览器工作流：Windows/Linux Chromium/Firefox 的网页与断网 `file://`，四种任务与报告复验、十万行、64 MiB 边界及持续运行。两平台测试同一 HTML；本机 Edge 另验其实际下载字节。
- Analytics 工作流：Node/Native 独立聚合、输入散列、精确互斥计数、诊断及实际命令持续运行。
- Default Node stability 工作流：同环境 v0.8.0 基线与三个连续候选；Windows/Linux 的 City＋Country、City＋ASN 分开验证。

所有持续运行门槛保持原配置，不强制 GC、不缩小堆、不改变负载。每 30 秒采样、预热五分钟，比较前后各十个样本中位数，增长上限为 64 MiB 或早期中位数的 25%（取较大值）。Windows 同时检查 RSS 和私有内存；数据文件及辅助状态限制不是进程内存限制。

## 发布与下载复验

[GitHub v0.9.4](https://github.com/HhWw96/moonmmdb/releases/tag/v0.9.4) 的 `FINAL_VERIFICATION.json` 绑定通过的实际 CI 任务、实现提交、构建产物、数据与运行环境。发布之后的下载、安装和在线页面复验由 `POST_PUBLICATION.json` 记录；两类回执不能相互替代。

[官方 Mooncakes 包](https://mooncakes.io/docs/HhWw96/moonmmdb@0.9.4/) 必须经过全新目录的注册表消费者 JS/WasmGC 测试，不使用 workspace 替代安装。公开模块归档与上传包核对 SHA-256。

Windows/Linux 压缩包、离线 HTML、源码包及报告使用 `SHA256SUMS` 校验。网页部署直接下载 Release 中的 HTML；在线与离线必须逐字节一致。下载后的 Native 包移除 Node/Python/MoonBit 路径后验证十个命令及四种任务、两层报告复验。

## 历史记录与支持边界

[0.9.3 验证](VERIFICATION_0_9_3.md) 和旧的 Node 默认运行失败记录保持原结果。0.9.3 最终源码的 Windows City＋Country 私有内存增长未通过门槛，不能将其改为通过；0.9.4 必须独立完成相同门禁。分配诊断用于解释开销，不能替代持续运行结果，也不能单凭 RSS 波动确认或排除泄漏。

应用功能仍为本地查询、检查、指定 IP 更新对比和 JSONL 分析；无上传、账号或地图。人工样例不代表真实 IP 归属。数据库检查不认证地理信息准确性，报告内部自洽和同实现重算不是独立正确性证明。支持声明不扩展到 Safari、ARM64、Alpine 或手机大数据库性能。

内置浏览器可检查实际界面与交互；未返回下载完成事件的写盘动作不记录为通过。下载内容验证以能够实际保存文件的已验证浏览器及独立下载回执为准。
