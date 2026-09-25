# 参赛准备事实（不是人工申报书）

项目：MoonMMDB——MoonBit 原生离线 IP 数据库查询库。当前版本 0.9.1；浏览器日志分析已通过发布门禁，公开交付状态见 [验证回执](VERIFICATION_0_9_1.md)。

根据参赛者收到的通知，已通过报名初审。此状态来自参赛者提供的组委会邮件；最终验收和奖项结果尚未确认。

v0.6.0 增加受限 CIDR 网段导出、全部物理树节点检查、引用记录解码检查，并交付 City/ASN 强类型可选包及 API 兼容政策。Node、Windows/Linux Native 均可使用；跨平台、真实数据库和 30 分钟持续运行通过。交付状态与可复验证据见 [0.6.0 验证](VERIFICATION_0_6.md)。

v0.7.0 增加 Native 数据库更新对比，直接使用日志检查旧、新快照的字段、记录存在性及前缀变化；Windows/Linux 独立参考、十万行和 30 分钟持续运行通过。见 [0.7.0 验证](VERIFICATION_0_7.md)。

v0.8.0 增加浏览器本地工作台和独立离线 HTML，支持查询、检查和指定 IP 更新对比；数据库不上传，在线与离线使用同一份 HTML。见 [0.8.0 验证](VERIFICATION_0_8.md)。

v0.9.0 将日志分析提升为正式 Native/Node 命令和独立 analytics 包，使用精确计数、互斥异常统计与输入散列。在固定 Node 24.20.0 的 Windows/Linux City＋Country、City＋ASN 负载下分别连续通过三次 30 分钟门槛；历史 Node 24.13.0 失败记录保留。见 [0.9.0 验证](VERIFICATION_0_9.md)。

## 已完成的技术贡献

- MoonBit 多库联合查询和独立日志分析，提供按源错误隔离、配置容量限制、精确统计及人工标签更新演示。见 [多库说明](MULTI_SOURCE.md)。

- 可复用 FieldSelector、标准输入流式日志处理与嵌套 IP 路径，以及按输入 IP 比较数据库更新的 MoonBit 核心接口和 diff 命令。使用示例见 [操作说明](OPERATIONS.md)，版本复验见 [0.3.0 验证范围](VERIFICATION_0_3.md)。
- MoonBit 实现 MMDB 元数据、搜索树和类型解码；没有调用 C/Python/在线服务完成运行时查询。
- 原生 Reader / Value / Lookup / Projection / MmdbError 接口，以及类型化 JSON；0.2.0 浮点容器类型变更见支持说明。
- 值、深度和载荷预算；官方异常样例验证。
- CLI 查询、字段路径提取与保留原始数字的 JSONL 字段补充；独立 MoonBit 模块消费与 ASN 汇总。
- 73 个固定官方 MMDB 文件逐一检查：17,043 次查询参考对照，新增遍历 53,343 次地址与值核对；异常样本、变异输入、资源限制和兼容基线持续回归。文件覆盖不代表所有上游实现的全部断言都已移植。
- 约 31 MB / 65,536 网段合成规模库，5,000 次独立对照；源码、产物与证据散列绑定。
- Windows x64 Native 在固定 MoonBit 0.10.11 + GCC 16.2.0 下验证；真实 DB-IP Lite Country / City / ASN 每库抽查 5,000 地址，另对 City＋ASN 联合查询每库核对 7,114 地址，Native、JS 与独立参考一致。Linux Native 核心与分析模块进入 Ubuntu CI。见 [0.4.0 验证报告](VERIFICATION_0_4.md)。

## 使用场景与实际边界

1. 访问日志分析：读取 IP 字段，打开 City 与 ASN 库各一次并多次查询，再分别统计国家与 ASN Top N。已实现多库 JSONL 补充、独立 MoonBit 包、Native/Node 正式命令以及错误/缺失统计；浏览器 JSONL 入口的交付状态以 0.9.1 验证回执为准。
2. 离线网络流量：由 MoonCap 等上游提取源/目的 IP，再调用本库补充 ASN/地域记录。当前仅为拟集成场景，没有上游采用证明。
3. 组织内部标签：读取组织借助其他工具生成的 MMDB，查询机房、用途等字段。已提供人工 lab-a/lab-b 标签及更新影响演示，未声称已有企业部署。

4. 指定网段导出：流式获取规范化 CIDR 和类型化值，受记录数和累计工作预算约束；已有离线命令示例。
5. 数据库巡检：发现普通 IP 查询未经过的非法指针、循环等结构问题；人工隐藏损坏样例及真实 City/ASN 全树检查均可复现。

## 同类与互补

2026-09-16 公开查重未发现直接的 MoonBit MMDB 读取库；不排除未公开或未索引项目。moonbitgeodb 提供中文地址/空间能力，mooncidr-audit 提供 CIDR 规则分析，mooncap 提供抓包解析，分别应说明边界。其他语言已有 libmaxminddb、Python maxminddb、mmdbinspect 和 Rust/Wasm 工具；离线、批量、浏览器运行本身不作为独创卖点。

检索依据与来源见同级研究目录“MoonMMDB-深度核验-2026-09-16”，正式提交前应刷新查重。

## 尚需完成的外部事项

已完成 GitHub 公开发布：[HhWw96/moonmmdb](https://github.com/HhWw96/moonmmdb)，源码与提交历史均可见。[首次远端 CI](https://github.com/HhWw96/moonmmdb/actions/runs/35109825863)在 Ubuntu 与 Windows 两个环境通过。外部交付与验收状态如下：

- Mooncakes 与 GitHub 各版本的真实发布、全新注册表安装和下载验收状态，以 [0.9.1 当前版本](VERIFICATION_0_9_1.md) 与 [0.9.0 历史版本](VERIFICATION_0_9.md) 的公开回执为准。
- 保持已通过初审的申报方向，提交与最终版本一致的成果。
- 由赛方给出最终验收及奖项结果。

代码完成、测试通过和 GitHub 发布均不能替代主办方审核。当前版本未声称已有实际企业用户、MoonCap 集成或长期生产服务稳定性；真实数据库验证仅覆盖报告所列版本及抽样地址。
