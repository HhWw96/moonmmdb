# Native CLI 构建与验证

Native 工具的入口为 `native_cli` 独立模块。核心查询和 JSON 处理在 MoonBit 中，C 文件仅提供 Windows/Linux 的文件、参数及流传输。公开核心 API 保持兼容。

## 使用与构建

七个命令及离线样例见 [随包快速入门](../native_cli/QUICKSTART.md)。本目录的原生程序与 `examples/native_probe` 验证探针用途不同：产品命令有完整参数、退出码、输入上限、错误隔离和输出完成检查。

开发环境沿用 MoonBit 0.10.11+6ff76a5f9；Windows 使用固定 w64devkit 2.10.0 / GCC 16.2.0，Linux 在 Ubuntu 22.04 构建。Node.js/Python 只用于开发、构建和验证，不是分发二进制的运行依赖。

```text
python scripts/setup-native-windows.py
node scripts/native-build.mjs
node scripts/native-cli-verify.mjs
node scripts/native-diff-verify.mjs
python scripts/inspection-fixtures.py
python scripts/native-package.py
```

Linux 跳过第一个命令，使用 GCC。Windows 不修改系统 PATH 或 MoonBit 运行时。支持使用 `MOON_CC` 指向兼容 GCC；自定义编译器不自动获得已验证工具链的支持声明。

SHA-256 来自固定 `moonbitlang/x@0.5.5`。该版本 crypto 包的旧数组构造语法不能直接通过固定工具链，因此仓库保留其实现子集及四处 AES 构造语法兼容补丁。SHA-256 实现未改动，标准向量、真实数据库散列与宿主参考均参与验证；来源、逐文件散列及许可证保存在 `native_cli/vendor/x`。供应链和第三方实现不计作原创算法。

## 行为边界

- 参数、配置版本、JSON Pointer 和输出字段沿用 Node CLI；JSON 对象键顺序和操作系统错误文字不构成兼容承诺。
- Native 顶层诊断统一写 stderr；Node 旧命令的部分顶层错误仍写 stdout。两者查询结果的错误类别、整批退出码和完成汇总保持对应。
- Native JSON 嵌套上限为 128；这是显式资源限制。固定 MoonBit 解析器还要求 Unicode 代理项转义成对：如 `"\ud800"`、`"\udfff"` 会成为 invalid-jsonl 错误行，而 Node JSON.parse 接受它们。正确配对的 `"\ud800\udc00"` 与普通 Unicode 均可使用。这是明确的输入兼容边界，不宣称任意 JSON 完全等价。坏配置直接终止，坏日志按行报错；非法 UTF-8、传输失败或资源超限终止整次处理。
- 数据库合计上限 256 MiB；打开过程中存在宿主字节、Reader 快照、解码及输出分配，不能把文件上限写成内存上限。
- 输出发生阻塞时等待消费者；管道提前关闭时退出 2，不写完成汇总。EOF 为正常输入终止；不能从 EOF 判断上游进程的业务状态。
- 本轮不提供 Native enrich、analytics、mmap、自动下载和更新功能。

## 验证入口

```text
node scripts/release-verify.mjs
node scripts/native-verify.mjs
python -m pip install --target .reference-deps -r requirements-reference.txt
python scripts/download-production.py
python scripts/native-production-verify.py
python scripts/native-diff-reference.py
python scripts/native-diff-reference.py --production
python scripts/native-soaks.py
python scripts/inspection-fixtures.py
python scripts/native-package.py
```

`native-verify.mjs` 是原有 Windows 后端与探针回归；Linux 核心回归由 CI 运行。生产验证使用固定 DB-IP Lite City 与 ASN，各 7,114 地址，Python 参考独立读取每份库，并核对汇总和散列；另检查 City＋City＋ASN＋ASN 超过合计上限时在读取日志前拒绝。生产数据库不随源码或二进制包分发。

产品 CLI 测试覆盖四源损坏隔离、混用 IPv4/IPv6、原始大整数、字段缺失、Unicode 路径、配置预检、UTF-8、BOM、CRLF、无末尾换行、嵌套字段、限制和管道关闭，并实际处理十万行。

持续测试运行实际 CLI 30 分钟，以每秒最多 500 行的速率输入并持续排空输出，逐条核对结果及最终汇总。该数字是输入限速，不是最大性能。报告每 30 秒记录 RSS、Windows Private Bytes（Linux 对应附加字段为 RssAnon 匿名驻留内存）及句柄/文件描述符，并使用操作系统提供的 RSS 高水位记录启动阶段峰值。私有内存峰值为采样值。预热五分钟后比较前后各十次采样中位数，增长门槛为 64 MiB 或早期中位数的 25%（取较大值）；句柄后期中位数不得比早期增加超过两个。

## 发布门槛

Native CI 先在 Windows 2022、Ubuntu 22.04 构建并验证，再在 Ubuntu 24.04 运行下载的 Linux 包；实际产物通过隔离目录、文件散列与系统动态库检查。报告区分本机验证与 CI，记录具体环境，不外推到 macOS、ARM64、Alpine 或最新 MoonBit/MSVC。

发布流程只接受主分支成功的 Native 与完整回归任务，确认验证之后仅有说明文档或发布回执变化，再使用原始 CI 二进制归档。Mooncakes 上传、全新注册表安装和源码归档散列核对完成后才创建 GitHub 正式版本。

v0.4.0 的默认 Node RSS 门槛失败记录保留在 [历史验证](VERIFICATION_0_4.md)。Native 通过不能解释为该历史问题已经修复。


内存曲线可用 `docs/plot_native_soak.py` 从已保存的 JSON 报告重绘，绘图依赖为 Matplotlib 3.11.2，仅供生成验证材料，Native 程序运行不需要该依赖。

0.6.0 增加 `networks` 与 `validate`，参数、状态和资源边界见 [检查与导出](INSPECTION.md)。

0.7.0 增加 Native `diff BEFORE AFTER INPUT|-`，比较输入 IP 的字段、存在性与前缀变化；不是整库差异枚举。协议与 Node diff 一致，Native 顶层错误写 stderr，完成汇总额外提供 fields 和 databases 来源散列。Native 两库合计 256 MiB，比 Node 历史的每库 256 MiB 更严格。下载包包含人工旧、新标签库。

`native-soaks.py` 同时运行旧联合补充、新 diff 产品命令及网段/检查 API 三个独立进程；各自报告 30 分钟采样及趋势门槛，报告注明并发宿主负载。diff 的真实负载使用固定 City 与 ASN 的不同字段结构，不冒称不同月份数据库的实际更新。
