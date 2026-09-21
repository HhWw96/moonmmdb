# 0.6.0 验证与发布

版本范围：受限网段遍历、全树结构检查、引用记录解码、City/ASN 强类型包和兼容政策。源码与二进制验证、注册表安装及正式发布分别记录；未完成的门槛不能记为通过。

实现与本机初步检查已完成。正式发布仍需本版本完整回归、Windows/Linux Native 产品与同进程 API 消费者的 30 分钟持续运行，以及最终下载产物和注册表安装验证。本页会在这些门槛完成后记录绑定提交及证据。

验证入口：`node scripts/release-verify.mjs`、`python scripts/inspection-verify.py --native`、`python scripts/inspection-verify.py --native --production`、`node scripts/inspection-cli-verify.mjs --native`、`python scripts/native-soaks.py`。固定 MoonBit 0.10.11+6ff76a5f9，独立 Python maxminddb 3.2.0，固定 DB-IP 2026-09 数据及散列沿用生产数据清单。

产品 CLI 的流式持续运行与独立 Native API 消费者分别执行、分别采样；在同一 CI 宿主同时运行，两份报告会记录各自进程的内存。API 消费者每轮创建/消费/关闭八个游标，并完整检查真实 ASN 库的引用记录；它不是一个新产品命令。

保留限制：未扫描未引用的数据字节；没有商业 Enterprise 大库验证；没有在线 demo；既有 Node 默认 RSS 门槛失败记录继续保留，不用 Native 通过替代该问题的修复。
