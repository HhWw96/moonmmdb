# Native 后端与真实数据库补充验证

日期：2026-09-16。版本：MoonMMDB 0.2.0。结论：固定 Windows x64 工具链的 Native 核心及实际文件读取通过；两套真实 DB-IP Lite 数据库的抽样结果与独立参考一致。本轮新增验证与宿主接入，没有修改 MMDB 核心算法或公开 API。

## 实际执行范围

| 检查 | 结果 |
|---|---|
| Native 核心 debug | 18/18，警告作为错误 |
| Native 核心 release | 18/18，警告作为错误 |
| 独立 MoonBit 消费模块 | 1/1 ASN 汇总测试 |
| Native 官方异常与边界文件 | 29/29；完整 lookup 和 project 均按预期返回，含应接受的边界样本 |
| Native 宿主回归 | 4/4；独立 EXE、中文/空格/非 BMP 路径、CRLF、缺失文件、文件大小上限及非法 UTF-8 |
| 真实 Country 文件 | 8,340,464 字节；5,000 地址，3,870 IPv4 + 1,130 IPv6，命中 4,801，未命中 199 |
| 真实 City 文件 | 127,339,927 字节；5,000 地址，3,945 IPv4 + 1,055 IPv6，命中 4,807，未命中 193 |
| 实现间一致性 | Native、JS 分别与 maxminddb 3.2.0 纯 Python 比较；C 扩展独立比较同一组 10,000 地址，零分歧 |

每库的 5,000 地址固定随机种子 `0x50524f44`，包含全部指定公共 DNS、私网、回环、链路本地、多播、IPv4 映射及 6to4 地址；从随机 IP 查询得到的网段加入首尾和相邻地址，再作确定性抽样。不是仅测试 8.8.8.8，也不是整库记录穷举。

两个后端合计执行 20,000 次完整记录比较、20,000 次投影比较及其中 140,000 项字段检查；这些数字存在包含关系，不能相加宣传为独立测试用例。验证内容为数据库元数据、命中状态、完整记录值、匹配前缀，以及 `/country/iso_code`、`/country/names/zh-CN`、`/city/names/en`、`/location/latitude`、两个 ASN 字段与不存在字段。Country/City 中缺少的 ASN 字段应返回 missing；本轮未获取真实 ASN 库。

读取的是完整发布文件，查询对照覆盖抽样地址。国家名称的多语言字符串和经纬度也参与完整记录比较，浮点依据原始位还原后与参考值比较。

## 工具链与修复

本机原先没有 C 编译器。工作区内准备固定 w64devkit 2.10.0 / GCC 16.2.0，使用已有 `moonc v0.10.11+6ff76a5f9`、moon `0.1.20260827`。没有改系统 PATH、注册表或 MoonBit 运行时。

遇到并修复两个实际阻断：

1. 该运行时调用的 `rand_s` 在 MinGW 头文件中需要 `_CRT_RAND_S` 才声明。编译启动器为 GCC 增加此宏并正确转发含中文、空格的参数；没有替换随机数实现。
2. 固定运行时的 MinGW `env.args` 分支明确使用不安全的 ANSI 路径。Native 验证程序在宿主边界读取 Windows Unicode 命令行，并用宽字符文件接口打开路径；MMDB 解码仍全部使用 MoonBit。原失败报告保留在 `verification/regressions/native-unicode-*.json`。

`examples/native_probe` 是独立 MoonBit 模块，产出 `dist/moonmmdb-native-probe.exe`。C 文件仅负责路径、文件读取和计时；不是 libmaxminddb 封装。其链接配置针对 Windows GCC，尚未测 MSVC。

新增宿主用例第一次把人工样例中的 `1.128.0.1` 误判为未命中；实际应为 ASN 1221。使用纯 Python 参考核实后修正测试预期，并另加确实未命中的 `1.1.1.1`。错误预期的失败报告也保留；这不是读取器错误，也未将它隐去后宣称全部首次通过。

[MoonBit 最新工具链文档](https://docs.moonbitlang.com/en/latest/toolchain/moon/package.html#default-c-compiler-and-compiler-flags-for-the-native-backend)当前要求 Windows 使用 MSVC 兼容工具链并不支持 MinGW。因此本次结论严格限定于已实际运行的固定版本，不能写成“最新 MoonBit Windows Native 全面兼容”。

## 数据来源与可复现性

使用 [DB-IP Lite Country](https://db-ip.com/db/download/ip-to-country-lite) 和 [DB-IP Lite City](https://db-ip.com/db/download/ip-to-city-lite) 2026 年 9 月公开版本。它们是实际 IP 地理数据的免费子集，[许可为 CC BY 4.0](https://db-ip.com/db/lite.php)，覆盖率和精度与付费库存在差别。署名：**IP Geolocation by DB-IP — https://db-ip.com/**。

官方直链在本环境返回 HTTP 403，从 [Framasoft 公共镜像](https://dbip.mirror.framasoft.org/) 获取，再核对官方页面公布的未压缩文件 MD5 / SHA-1。另记录下载文件和原始文件 SHA-256，详细来源、时间与散列值在 `verification/production-sources.json`。

| 文件 | 原始文件 SHA-256 |
|---|---|
| dbip-country-lite-2026-09.mmdb | d284ae2e7427fe33d83465e1506b2b21aae47eb8a9b099f8f4dac6a98c99f041 |
| dbip-city-lite-2026-09.mmdb | 05a10861259c7966cb54d7181ef8c360de8c8829d182098c0e62a9b7d54cd50d |

真实库存在 `verification/local/production`，未加入 Git 或工程交付包。下载脚本锁定本次文件及散列值；若镜像未来下架，脚本会失败，不会悄悄改用另一版。工具链同样固定下载散列值，存放 `verification/local/toolchains`。

## 重跑

准备固定 MoonBit 工具链及 Node.js 22+、Python 3.12：

```text
python -m pip install --target .reference-deps -r requirements-reference.txt
python scripts/setup-native-windows.py
python scripts/download-production.py
node scripts/extended-verify.mjs
```

本机可将 Python 完整路径作为最后一条命令的第一个参数。已有下载会先检查散列值，再复用。完整流程重跑已有 JS/WasmGC 发布验证、Native 两种配置与独立消费者、Unicode 路径和文件错误检查、29 个异常样例、真实库双后端对照。`extended.json` 绑定源码、JS、EXE 及所有报告 SHA-256，任何步骤失败均不会输出 passed。

独立运行 Native 文件程序：

```text
dist\moonmmdb-native-probe.exe verification\local\production\dbip-city-lite-2026-09.mmdb verification\local\production\dbip-city-lite-2026-09.ips.txt
```

程序是验证传输层，输出元数据、逐 IP 完整结果/投影及计时。单条 IP 错误保留在输出行，成功完成循环可能仍退出 0；产品 Node CLI 的整批退出码约定不适用于这个探针。

## 性能观测与限制

本机首次真实库对照：Native Country 打开约 6.7 ms，City 约 114.4 ms；各 5,000 地址的双查询、JSON 编码和输出合计约 0.81 s / 1.22 s。打开不含宿主文件读取，包含 Reader 快照复制；循环时间包含完整查询和投影各一次及输出传输。后续重跑的实际数值以 production.json 为准。没有把这些数字作为纯查找吞吐、跨语言性能排名或服务 SLA。

每条记录默认解码资源限制有效；Native 官方样例另设每进程 8 秒超时，未施加操作系统级 RSS 上限。文件整体读入内存并由 Reader 保存快照，不支持 mmap。

尚未验证：真实 ASN 库、付费 GeoIP2、数据库每条记录穷举、现实定位准确率、Linux/macOS、MSVC、长期并发服务与多日稳定性。使用本报告可证明具体实现和数据上的本地读取正确性，不能据此声称无缺陷、生产服务已经上线、赛事复审已通过或保证获奖。
