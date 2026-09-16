# 来源与许可

| 内容 | 来源与固定版本 | 处理 |
|---|---|---|
| MMDB 格式 | https://maxmind.github.io/MaxMind-DB/ | 规范作为实现依据；规范文字自身为 CC BY-SA 3.0，没有把规范全文作为本项目代码许可的一部分 |
| 测试数据库 | maxmind/MaxMind-DB，7fcd868842970b2d0657af799807cbe722fb738d | 官方人工测试数据，Apache-2.0 OR MIT；tests/fixtures 内保留两份许可证、来源与散列值 |
| 嵌入测试字节 | 同上 | src/fixtures_wbtest.mbt、examples/log_consumer/fixture.mbt 为脚本生成，保留来源标记，不作为原创代码行数宣传 |
| Python 参考读取器 | maxminddb 3.2.0，https://github.com/maxmind/MaxMind-DB-Reader-python | Apache-2.0；仅在验证环境使用，不作为运行时依赖 |
| MoonBit core | 官方工具链 core 包 | Apache-2.0；使用 UTF-8、JSON、数值等基础能力 |

MaxMind 测试数据版权归 MaxMind, Inc.。原始文件的散列值在 tests/fixtures/manifest.json 与 adversarial/manifest.json。项目未捆绑生产 GeoLite2/GeoIP2 全量数据库。

代码参考规范与官方项目进行实现和验证，不宣称格式、查找树或 MMDB 算法为首创。AI 辅助参与代码、测试与说明的编写；参赛者需自行理解实现、核对许可并人工撰写最终申报材料。
