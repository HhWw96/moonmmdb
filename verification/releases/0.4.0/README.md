# 0.4.0 固定验证证据

这些 JSON 是 2026-09-20 的实际报告，包含数据库散列、构建产物散列和抽样/内存记录；不是自动更新的状态页。

- production.json：Country / City / ASN 各 5,000 个地址，JS 与 Windows Native。
- enrichment-production.json：City＋ASN 各 7,114 个地址，JS 与 Windows Native 联合结果及独立分析统计。
- soak-default.json：默认 Node 配置，City＋Country，30 分钟；结果稳定，但 RSS 中位数增长门槛失败，原样保留。
- soak-gc.json：City＋Country，采样前显式回收的 30 分钟诊断；不是产品默认 GC 行为。
- soak-bounded.json：City＋ASN，固定 Node 堆参数的 30 分钟查询与序列化；不代表进程 RSS 上限。

soak 报告中的 databases 保留字段选择、数据库 SHA-256 与构建时间。City＋ASN 复现配置为 examples/production-many.json；Country 诊断把第二个源改为 Country 数据库，并仅选择 /country/iso_code。机器环境和运行参数见报告。

不得删除未通过报告、把运行参数不同的结果合并成默认配置通过，或把查询次数当作独立参考核对次数。三个持续运行报告使用相同核心产物散列；独立正确性由另外两个参考报告及 CI 验证承担。详细解释见 docs/VERIFICATION_0_4.md。
