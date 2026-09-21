# 独立强类型消费示例

这是 0.6.0 的独立源码示例，通过本地 workspace 使用 `HhWw96/moonmmdb/geo`。Node.js 只负责文件与输入输出；MoonBit 复用 Reader 并处理 ASN、国家、城市及本地化名称。

从仓库根目录运行：

```text
node examples/typed_consumer/run.mjs city tests/fixtures/GeoIP2-City-Test.mmdb 2001:218:: en
node examples/typed_consumer/run.mjs asn tests/fixtures/GeoLite2-ASN-Test.mmdb 1.0.0.1
```

详细类型和错误语义见 [geo 说明](../../docs/GEO.md)。JSON 示例将可选字段输出为值或 null；ASN 输出十进制字符串。本示例不是 Native CLI 新命令，也不是注册表安装验证。
