# 下一版本源码验证：官方语料、兼容检查与强类型接口

状态：本轮能力已实现并推送，尚未发布新版本；Mooncakes 和 Native 下载仍为 v0.5.0。实现提交：`0c1a95fde09760124b584e331b8061a75af9b348`。

## 已验证结果

| 项目 | 结果 |
|---|---|
| 官方固定语料清单 | 73 个 MMDB 文件全部分类执行；另有共享指针 raw 样本六段记录 |
| JS 全语料 | 17,043 次查询检查通过，含独立正常数据对照和明确拒绝策略 |
| Windows Native 全语料 | 同样 17,043 次通过，使用实际 Native CLI |
| 核心与 geo 单元测试 | JS、WasmGC 各 39 项；Windows Native 核心 debug/release 各 31 项，geo release 8 项 |
| 强类型官方样本对照 | 八类 City/Enterprise/ASN 样本，三个语言选项，共 7,860 次通过 |
| 强类型真实数据对照 | DB-IP City＋ASN 2026-09，每库 7,114 地址，共 14,228 次通过 |
| 兼容检查 | 0.5.0 核心 44 个、bridge 15 个既有公开声明均无变化；反例测试通过 |
| 独立消费与归档 | 原有和新增消费者均通过；从新打包归档解压后在隔离 workspace 通过 JS/WasmGC 消费 |
| 原有完整回归 | CLI、流式、差异、分析、独立参考、规模库与基准全部通过 |
| 远端完整回归 | [Windows/Ubuntu CI](https://github.com/HhWw96/moonmmdb/actions/runs/35564700809) 均通过，含 Linux Native 核心、geo 与消费者 |

机器可读报告见 [证据目录](../verification/releases/development-2026-09-21/README.md)。新模块为可选包，没有增加核心读取库依赖或改变原有公开接口。

## 新增 Native 长时复验

[Native 产品 CI](https://github.com/HhWw96/moonmmdb/actions/runs/35564700839) 已启动，包含新增语料、真实数据和原有 30 分钟持续运行。本文记录时仍在执行，不能记作通过。本机此次构建的 Native CLI 与此前完成 30 分钟运行的本机 0.5.0 二进制逐字节相同（SHA-256 `a75eefe784bdb9a2b87f31bb9486a67c0a988f859f661747b28d50db48342b06`）；这项身份比较不替代本次 CI 完成结果，也不宣称可选 geo 包已经过长时服务负载测试。

## 范围与限制

完整语料指固定提交中的文件清单完整，不等于逐条移植所有官方语言读取器测试，或全记录、全分支覆盖。真实商业 Enterprise 大库仍未验证。[语料说明](CORPUS.md)列出独立参考器的 Anonymous 遍历问题及本库既有资源策略差异。

新 geo 包的八项测试覆盖缺失字段、类型错误、整数溢出、Unicode 名称、坐标范围/NaN、修改隔离、IP 未命中、非法 IP 和 Reader 资源错误传播。独立 Python 对照验证的是示例输出中的常用业务字段，不证明所有供应商扩展字段都已强类型建模。

兼容检查是公开声明检查；行为继续由回归承担。在线交互 demo、完整 GeoIP2 SDK、商业数据库验证和新版本正式发布未计作本轮已交付。既有默认 Node RSS 门槛失败记录继续保留。
