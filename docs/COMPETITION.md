# 参赛准备事实（不是人工申报书）

项目：MoonMMDB——MoonBit 原生离线 IP 数据库查询库，0.5.0。

根据参赛者收到的通知，已通过报名初审。此状态来自参赛者提供的组委会邮件；最终验收和奖项结果尚未确认。

v0.5.0 增加 Windows/Linux x64 Native 产品命令，跨平台、十万行流式与 30 分钟持续运行验收均已通过。交付状态与可复验证据见 [0.5.0 验证](VERIFICATION_0_5.md)。

## 已完成的技术贡献

- MoonBit 多库联合查询和独立日志分析，提供按源错误隔离、配置容量限制、精确统计及人工标签更新演示。见 [多库说明](MULTI_SOURCE.md)。

- 可复用 FieldSelector、标准输入流式日志处理与嵌套 IP 路径，以及按输入 IP 比较数据库更新的 MoonBit 核心接口和 diff 命令。使用示例见 [操作说明](OPERATIONS.md)，版本复验见 [0.3.0 验证范围](VERIFICATION_0_3.md)。
- MoonBit 实现 MMDB 元数据、搜索树和类型解码；没有调用 C/Python/在线服务完成运行时查询。
- 原生 Reader / Value / Lookup / Projection / MmdbError 接口，以及类型化 JSON；0.2.0 浮点容器类型变更见支持说明。
- 值、深度和载荷预算；官方异常样例验证。
- CLI 查询、字段路径提取与保留原始数字的 JSONL 字段补充；独立 MoonBit 模块消费与 ASN 汇总。
- 固定版本官方样本、7,749 项独立参考比对、29 个官方资源/格式边界场景、变异输入测试及性能记录。
- 约 31 MB / 65,536 网段合成规模库，5,000 次独立对照；源码、产物与证据散列绑定。
- Windows x64 Native 在固定 MoonBit 0.10.11 + GCC 16.2.0 下验证；真实 DB-IP Lite Country / City / ASN 每库抽查 5,000 地址，另对 City＋ASN 联合查询每库核对 7,114 地址，Native、JS 与独立参考一致。Linux Native 核心与分析模块进入 Ubuntu CI。见 [0.4.0 验证报告](VERIFICATION_0_4.md)。

## 三个完整预期使用场景

1. 访问日志分析：读取 IP 字段，打开 City 与 ASN 库各一次并多次查询，再分别统计国家与 ASN Top 10。已实现多库 JSONL 补充、独立 MoonBit 模块汇总以及错误/缺失统计。
2. 离线网络流量：由 MoonCap 等上游提取源/目的 IP，再调用本库补充 ASN/地域记录。当前仅为拟集成场景，没有上游采用证明。
3. 组织内部标签：读取组织借助其他工具生成的 MMDB，查询机房、用途等字段。已提供人工 lab-a/lab-b 标签及更新影响演示，未声称已有企业部署。

## 同类与互补

2026-09-16 公开查重未发现直接的 MoonBit MMDB 读取库；不排除未公开或未索引项目。moonbitgeodb 提供中文地址/空间能力，mooncidr-audit 提供 CIDR 规则分析，mooncap 提供抓包解析，分别应说明边界。其他语言已有 libmaxminddb、Python maxminddb、mmdbinspect 和 Rust/Wasm 工具；离线、批量、浏览器运行本身不作为独创卖点。

检索依据与来源见同级研究目录“MoonMMDB-深度核验-2026-09-16”，正式提交前应刷新查重。

## 尚需完成的外部事项

已完成 GitHub 公开发布：[HhWw96/moonmmdb](https://github.com/HhWw96/moonmmdb)，源码与提交历史均可见。[首次远端 CI](https://github.com/HhWw96/moonmmdb/actions/runs/35109825863)在 Ubuntu 与 Windows 两个环境通过。外部交付与验收状态如下：

- 已发布 [Mooncakes 0.5.0](https://mooncakes.io/docs/HhWw96/moonmmdb@0.5.0/)，完成全新注册表安装及 JS / WasmGC 消费验证；回执见 [版本验证](VERIFICATION_0_5.md)。
- 保持已通过初审的申报方向，提交与最终版本一致的成果。
- 由赛方给出最终验收及奖项结果。

代码完成、测试通过和 GitHub 发布均不能替代主办方审核。当前版本未声称已有实际企业用户、MoonCap 集成或长期生产服务稳定性；真实数据库验证仅覆盖报告所列版本及抽样地址。
