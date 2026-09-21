# v0.5.0 验证证据

实现提交、CI 链接与压缩包散列见 [validation.json](validation.json)，解释与范围见 [验证报告](../../../docs/VERIFICATION_0_5.md)。

- `windows/`、`linux/`：最终 Native CI 的构建、命令检查、独立生产库对照、30 分钟持续运行及压缩包隔离验收原始报告。
- `local/`：额外 Windows 本机复验。构建路径去除个人目录；早期 soak 的峰值字段明确标注为间隔采样峰值，附 measurement_note，不改变原始数值。
- [publication.json](publication.json)：注册表源码包身份；[registry-0.5.0.json](registry-0.5.0.json)：全新目录安装及 JS/WasmGC 消费回执。

Linux 包另在同一 CI 的 Ubuntu 24.04 作业下载、校验散列并运行。持续运行结果仅适用于报告中的数据库、输入速率、参数、二进制与环境。没有附带真实生产数据库或开发工具链。
