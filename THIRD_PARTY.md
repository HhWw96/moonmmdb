# 来源与许可

| 内容 | 来源与固定版本 | 处理 |
|---|---|---|
| MMDB 格式 | https://maxmind.github.io/MaxMind-DB/ | 规范作为实现依据；规范文字自身为 CC BY-SA 3.0，没有把规范全文作为本项目代码许可的一部分 |
| 测试数据库 | maxmind/MaxMind-DB，7fcd868842970b2d0657af799807cbe722fb738d | 官方人工测试数据，Apache-2.0 OR MIT；tests/fixtures 内保留两份许可证、来源与散列值 |
| 嵌入测试字节 | 同上 | src/fixtures_wbtest.mbt、examples/log_consumer/fixture.mbt 为脚本生成，保留来源标记，不作为原创代码行数宣传 |
| Python 参考读取器 | maxminddb 3.2.0，https://github.com/maxmind/MaxMind-DB-Reader-python | Apache-2.0；仅在验证环境使用，不作为运行时依赖 |
| MoonBit core | 官方工具链 core 包 | Apache-2.0；使用 UTF-8、JSON、数值等基础能力 |
| 真实验证数据库 | DB-IP Lite Country / City，2026-09；https://db-ip.com/db/lite.php | CC BY 4.0；署名 IP Geolocation by DB-IP https://db-ip.com/；原始数据库只存本地忽略目录，工程交付包包含来源与固定散列值及下载脚本 |
| Native C 编译工具 | w64devkit 2.10.0 / GCC 16.2.0；https://github.com/skeeto/w64devkit/releases/tag/v2.10.0 | 外部验证工具，不捆绑工具链；各组件遵循上游各自许可证，GCC 运行库例外按上游条款适用 |
| 编译工具解压器 | 7-Zip Reduced 26.03；https://www.7-zip.org/ | 仅在忽略目录解压固定散列值的工具归档，不作为项目运行时依赖 |

MaxMind 测试数据版权归 MaxMind, Inc.。原始文件的散列值在 tests/fixtures/manifest.json 与 adversarial/manifest.json。项目未捆绑生产 GeoLite2/GeoIP2 全量数据库。

代码参考规范与官方项目进行实现和验证，不宣称格式、查找树或 MMDB 算法为首创。AI 辅助参与代码、测试与说明的编写；参赛者需自行理解实现、核对许可并人工撰写最终申报材料。

tests/scenarios 中的四份数据库由本项目 scripts/prepare-scenarios.py 确定性生成，按项目 Apache-2.0 许可提供；生成脚本只支持测试语料，不是公开 MMDB 写入功能。它们使用文档用途地址和人工标签，不包含真实企业信息，独立参考验证其读取结果。
