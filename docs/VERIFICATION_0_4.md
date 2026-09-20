# 0.4.0 验证与发布状态

本版本实现多库联合查询、流式日志补充和独立 MoonBit 国家/ASN 统计。以下结果来自 2026-09-20 实际运行，旧版本证据不替代新增能力验证。验收操作和预期输出见 [演示步骤](DEMO_0_4.md)。

## 功能、后端与独立对照

| 检查 | 实际结果与边界 |
|---|---|
| 核心回归 | JS / WasmGC 各 30 项；Windows Native debug / release 各 30 项 |
| 独立分析模块 | JS / WasmGC / Windows Native 各 4 项，覆盖精确计数、并列排序、分组上限及类型错误 |
| CLI / 输入输出 | 31 项，包括坏配置、四源损坏隔离、嵌套 IP、错误行、超限、慢消费者及提前关闭输出 |
| 持续流式输入 | 实际处理 100,000 行，不累积输入日志或完整输出；核对行数和完成汇总 |
| 人工三库参考 | Python maxminddb 3.2.0 分别查询三源，共 3,090 次对照，并独立核对统计 Top 10 |
| 真实单库参考 | DB-IP Lite 2026-09 Country / City / ASN，各 5,000 地址，JS 与 Windows Native 分别核对记录、投影和元数据 |
| 真实联合参考 | City＋ASN 每库 7,114 地址；JS 共 14,228 次、Windows Native 共 14,228 次核对，失败数 0；分析统计另由 Python 核对 |
| 原有工程验证 | 保留 7,749 项基础参考、1,099 项差异对照、29 个官方异常场景、2,048 个变异输入及约 31 MB / 65,536 网段的规模测试 |
| 安装包 | 新打包并从隔离本地目录消费成功；包内包含源码、场景及许可文件，排除本地工具链、生产数据库与私人材料；这不是注册表安装 |
| Linux Native | Ubuntu CI 执行核心 debug / release 和独立分析模块；未交付 Linux Native 产品 CLI |

[源码提交 2133534 的远端 CI](https://github.com/HhWw96/moonmmdb/actions/runs/35485395753)已在 Windows 与 Ubuntu 全部通过，包括 Linux Native 步骤。Windows 本地使用 MoonBit 0.10.11+6ff76a5f9、GCC 16.2.0、Node.js 24.13.0。当前工具链验证不等于所有未来版本兼容。

本地完整验证的源码散列为 `f4cf971815846d81ea4e4976f9dfeae44da8556402ca7755748bba43611df798`；JS 核心散列为 `eeae0c1e805345377efcc99c994cfe88ae93347c5aec762d4e4ee8d2df57b1c7`，Windows Native 验证程序散列为 `95aeb3c0a16e433e39b3aa1099315c7ff0061c8140ae40b5cfec4ed00c11c6a3`。源码散列算法见 scripts/evidence.mjs，覆盖代码、测试、脚本、示例、CI、主要清单和生产来源表；不覆盖本页等说明文档。跨平台文本换行差异可能改变源码散列。

原有一个 UInt32 边界在 Python/C 参考路径之间存在分歧，验证明确保留该记录，未将其描述成两种参考完全一致。新增联合与真实数据对照未出现差异。

## 真实数据库来源

City 为 127,339,927 字节，ASN 为 9,511,026 字节。ASN 的下载源为 lwpk110/free-geoip-databases 的 dbip-20260915 公开附件，原始文件 SHA-1 与 MD5 均与 DB-IP 官方 2026-09 下载页一致；City / Country 来自 Framasoft 镜像。各库精确 SHA-256、来源 URL 和日期见 [来源清单](../verification/production-sources.json)。

署名：IP Geolocation by DB-IP https://db-ip.com/，许可 CC BY 4.0。真实数据库只在本地忽略目录使用，不随库分发。结果是固定数据版本的抽样读取正确性证据，不是定位准确率、全库认证或付费库兼容保证。

## 30 分钟持续查询

每次运行实际经过至少 1,800 秒，以固定 9 个输入持续查询并序列化结果，逐次比对启动时输出；独立正确性由前述 Python 对照承担。每 30 秒记录内存，预热 5 分钟后比较前后各 10 个 RSS 样本的中位数，增长上限为 64 MiB 或早期中位数的 25%（取较大值）。不会因为报告未通过而删除它或降低门槛。

首轮默认配置 City＋Country 运行完成 22,108,000 次查询，无结果漂移，但 RSS 中位数增长 82,649,088 字节，超过 67,108,864 字节门槛，报告状态为 failed。峰值 RSS 为 223,420,416 字节；Windows 驻留内存曾先明显下降后回升，因此这项失败不能单独证明存在对象泄漏。

另外两次复验均实际完成，三个报告的核心产物散列一致：

| 运行配置 | 时长（秒） | 查询次数 | 峰值 RSS（字节） | RSS 门槛 |
|---|---:|---:|---:|---|
| 默认 Node；City＋Country | 1800.046 | 22,108,000 | 223,420,416 | 未通过 |
| 固定堆参数；City＋ASN | 1800.027 | 37,577,000 | 227,160,064 | 通过 |
| 采样前显式回收；City＋Country | 1800.069 | 31,320,000 | 322,699,264 | 通过 |

固定堆参数为 `--max-old-space-size=64 --max-semi-space-size=4`，平均约 20,876 次联合查询及序列化/秒。诊断运行使用 `--expose-gc`，每次采样前回收；预热后存活堆内存为 6,484,056—6,536,760 字节，未观察到随查询次数持续积累。两次复验均无崩溃或结果漂移。RSS 出现 Windows 驻留内存回落，不能用末值下降宣称产品内存优化或证明所有运行环境无泄漏。

原始采样与失败报告已保留在 [固定证据目录](../verification/releases/0.4.0/README.md)。上述结论仅适用于所列运行配置，不把默认配置的首次失败改写成通过。堆参数不限制数据库缓冲区或整个进程 RSS；诊断用显式 GC 不属于产品默认行为。

这些运行覆盖 JS 核心联合查询与类型化 JSON 序列化，不是并发服务、完整产品管道吞吐或生产 SLA。性能数字也受同机验证任务影响，不作为竞品性能排名。

## 复现入口

```text
node scripts/release-verify.mjs
node scripts/extended-verify.mjs
python scripts/enrichment-verify.py --production --native dist/moonmmdb-native-probe.exe
node --max-old-space-size=64 --max-semi-space-size=4 scripts/soak.mjs examples/production-many.json 1800 soak-city-asn
node scripts/registry-verify.mjs 0.4.0
```

Python 参考、生产数据和 Windows Native 工具准备见 README。extended-verify 包含完整发布验证、Windows Native、三份真实库及 City＋ASN 联合结果，核对源码与产物散列。最后一条需要该版本已实际发布到 Mooncakes；它在全新临时目录从注册表获取依赖，不使用本地 moon.work 替代。

## 发布门槛与状态

- GitHub 稳定版 [v0.3.0](https://github.com/HhWw96/moonmmdb/releases/tag/v0.3.0) 已发布，对应提交 3838833；附件 SHA-256 为 `017e3dde90e7992d9cd14e8c5ce94a2b135ff209b58dc9ab3820adf709f5719a`。
- v0.3.0 已发布到 Mooncakes，全新注册表消费项目的 JS / WasmGC 测试均通过。
- [v0.4.0 已发布到 Mooncakes](https://mooncakes.io/docs/HhWw96/moonmmdb@0.4.0/)，全新目录从注册表安装后通过 JS / WasmGC 测试，核对版本、精确 ASN 结果与 Enricher 接口；没有本地 moon.work 替代依赖。两版本的实际回执见 [0.3.0](../verification/releases/0.4.0/registry-0.3.0.json) / [0.4.0](../verification/releases/0.4.0/registry-0.4.0.json)。
- 发布验证修正了注册表消费脚本的测试文件归类；该脚本修正后的源码散列为 `b1576404b7bfe49439b23a82ee0da3e64be9b2e230911887308664aebd9f7121`，核心源码与 JS 产物未改变，前述查询及持续运行证据仍对应同一核心。回执中的路径已去除个人目录信息。
- Mooncakes 0.4.0 上传源码包 SHA-256 为 `0773cf22cfe8bf6f6307745f42f6dbe98c69916c3a8963e049ff6a23d85567e4`。注册表保存打包时的说明快照，发布完成后的回执和状态说明在 GitHub 更新；GitHub 发布附件使用同一上传包。
- 默认配置首次 RSS 门槛未通过的限制继续保留；正式发布不把限定配置的复验外推为所有默认运行环境通过。
- 根据参赛者收到的通知，已通过报名初审；本报告不声称最终验收或获奖。
