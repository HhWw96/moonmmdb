# MoonMMDB v0.6.0

新增按 CIDR 逐条导出网络记录及数据库全树检查。普通 IP 查询未触及的损坏节点现在可通过 `validate` 检出；工作预算耗尽明确报告未完成。

Windows/Linux Native 和 Node 均提供 `networks`、`validate`。本版本同时提供 City/ASN 强类型可选包、固定官方完整文件语料和 API 兼容政策。

```text
moonmmdb networks examples/asn.mmdb 192.0.2.0/24
moonmmdb validate examples/asn.mmdb --decode-data
moon add HhWw96/moonmmdb@0.6.0
```

Native 程序解压即可使用，无需 Node.js、Python 或 MoonBit；支持 Windows/Linux x64，Linux 最低 glibc 2.35。请核对 SHA256SUMS。

检查范围、预算、退出码及人工损坏演示见 [使用说明](https://github.com/HhWw96/moonmmdb/blob/main/docs/INSPECTION.md)，与源码、二进制和数据绑定的证据见 [版本验证](https://github.com/HhWw96/moonmmdb/blob/main/docs/VERIFICATION_0_6.md)。结构通过不代表定位数据准确；未验证商业数据库或未引用的数据字节。既有 Node 默认 RSS 限制仍保留。
