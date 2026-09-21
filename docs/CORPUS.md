# 官方语料覆盖范围

语料固定于 MaxMind-DB 提交 `7fcd868842970b2d0657af799807cbe722fb738d`，整包与各文件 SHA-256、原始路径、许可及检查分类见 `tests/fixtures/corpus.json`。

已纳入该提交 `test-data/` 与 `bad-data/` 中全部 **73 个 MMDB 文件**，并纳入 `maps-with-pointers.raw` 的六段共享指针记录。包括 Enterprise、Anonymous-IP、Residential Proxy、Country/City、ASN、ISP，以及损坏指针、损坏搜索树、大小边界和资源放大样本。

这表示固定版本的文件清单完整，不表示每个字节、每条路径或代码分支都被覆盖，也不是逐条移植所有官方语言读取器的完整测试套件。大型商业数据库仍没有完整验证证据。

## 验证方式

```text
python scripts/prepare-corpus.py
node scripts/moon.mjs fmt
node scripts/build.mjs
python scripts/corpus-verify.py
node scripts/native-build.mjs
python scripts/corpus-verify.py --native
```

通常运行验证无需重新下载；所有固定样本已随库保存并保留 Apache-2.0 / MIT 许可证。参考环境依赖 `requirements-reference.txt` 中的固定版本。

正常样本通过独立 Python maxminddb 3.2.0 获得元数据、网段边界内外地址和查询答案，再分别比较 MoonBit JS 或实际 Native CLI 的结果与前缀。每库在独立限时进程中进行参考计算；Native 同时核对退出码。样本数量或散列不一致、未分类文件、进程超时、输出不完整和结果不一致都失败。

恶意与资源样本只运行明确的预期拒绝检查，不交给无资源保护的独立参考器展开。既有八个恶意和二十一个边界场景继续执行，新增样本有独立分类理由。原始指针记录还在 MoonBit JS、WasmGC、Native 核心测试中比较值与结束位置。

## 已知策略差异

- Python 3.2.0 遍历两个 Anonymous 数据库时会在 IPv6 别名处抛出 host-bits-set 错误。此时从固定官方 source-data JSON 生成地址边界，仍使用其独立 `get_with_prefix_len` 获取答案；不以 MoonMMDB 结果生成预期值。
- `decode-path-shared-budget` 样本含重复 map 键。MoonMMDB 按既有策略返回 duplicate-key；本库没有局部惰性解码接口，不能声称已经验证了上游局部解码共享预算的全部行为。
- `corrupt-search-tree` 的根节点直接命中记录；不可达节点的损坏不会被逐 IP 查询访问。当前检查可达结果与参考一致，不把 open 成功描述为全树合法性认证。
- 本库解码工作计数包含指针等控制工作，部分边界样本会比上游平面值计数更早拒绝；策略差异保留在支持文档中。

报告输出 `verification/local/corpus.json` 和 `corpus-native.json`。JS 完整回归及 Windows/Linux Native CI 都运行此检查；新语料不能仅下载而不执行。
