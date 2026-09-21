# City 与 ASN 强类型接口

自 0.6.0 提供；0.5.0 包不包含 `geo`。安装 `HhWw96/moonmmdb@0.6.0` 后可导入此可选包。在本仓库运行完整独立消费示例：

```text
node examples/typed_consumer/run.mjs city tests/fixtures/GeoIP2-City-Test.mmdb 2001:218:: en
node examples/typed_consumer/run.mjs asn tests/fixtures/GeoLite2-ASN-Test.mmdb 1.0.0.1
```

`examples/typed_consumer` 是独立 MoonBit 模块，通过本地 workspace 消费公开接口；Node 负责读取文件和传递输入，业务字段提取由 MoonBit 完成。这不冒充注册表安装验证。

## 导入与查询

```moonbit
// moon.pkg:
// import { "HhWw96/moonmmdb" @mmdb, "HhWw96/moonmmdb/geo" }
let reader = @mmdb.open_bytes(database_bytes)
let result = @geo.lookup_asn(reader, "1.0.0.1")
match result.record {
  Some(asn) => println(asn.autonomous_system_number)
  None => println("IP not found")
}
```

复用已有 Reader，继续使用核心的每次查询资源预算。`lookup_city` 和 `lookup_asn` 返回记录及匹配前缀；`record=None` 表示 IP 未命中，`Some(record)` 中的可选字段为 None 表示该字段缺失。

| 类型 | 内容 |
|---|---|
| AsnRecord | 精确 UInt ASN 编号、组织名称 |
| CityRecord | 洲代码、国家、注册国家、城市、行政区数组、邮编、位置 |
| Country / Place / Subdivision | 地理 ID、多语言名称，以及相应的国家或行政区代码 |
| Location | 经纬度、精度半径、时区、metro_code |

所有字段以数据库实际内容为准。名称通过 `names.get("zh-CN")` 或 `names.get("en")` 获取，不静默回退语言。邮编保持字符串，避免丢失前导零；ASN 不转换成有符号 Int。小型 unsigned 类型和不超过 UInt32 范围的 UInt64 可安全转换，负数、数字字符串和溢出均拒绝。

## 错误与边界

- 已知字段类型不符时抛出 GeoError，`code()` 为 `schema-mismatch`，`path()` 指向字段；不会把类型错误混同缺失字段。
- 数据库错误以 `DatabaseError(MmdbError)` 保留，原错误码和信息可用，非法 IP、读取器资源限制仍然有效。
- 经纬度要求有限值且位于合法范围；未知扩展字段忽略。没有假定 database_type 必须包含某个厂商品牌，因此 DB-IP 的相容记录同样适用。
- 根值必须为 map；一个空 map 是命中但字段缺失，不是未命中。该层不判定数据库产品身份，也不保证地理信息正确。
- `from_value` 可转换已有 Value；调用方自行构造的值不享有 Reader 的解码资源预算。转换后的名称 map、行政区数组为独立结果，修改结果不会污染下一次查询。
- 这是常用字段适配层，不是完整 GeoIP2 SDK。匿名 IP、Enterprise 专有字段暂使用通用 Value/Projection；没有自动下载数据库或付费数据库授权。

完整声明见 `src/geo/pkg.generated.mbti`；版本规则见 [兼容政策](COMPATIBILITY.md)。
