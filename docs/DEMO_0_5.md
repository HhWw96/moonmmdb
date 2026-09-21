# Native 版本离线验收演示

以下步骤针对正式分发包的目录结构；发布前可先使用 `python scripts/native-package.py` 生成本地包。下载与发布状态以 [版本验证](VERIFICATION_0_5.md) 为准。

解压后进入包含 `moonmmdb.exe` 或 `moonmmdb` 的目录。Windows 示例使用 PowerShell；Linux 将 `.\moonmmdb.exe` 换成 `./moonmmdb`。

## 1. 确认版本和数据库

```powershell
.\moonmmdb.exe --version
.\moonmmdb.exe metadata examples/geo.mmdb
```

版本应为 `0.5.0`；元数据状态为 `opened`，数据库类型为 `MoonMMDB-Synthetic-geo`。

全部示例数据库使用人工标签和文档用途地址。`ZZ`、`YY`、ASN 64512/64513、lab-a/lab-b 均用于演示，不是实际网络归属。

## 2. 查询和字段选择

```powershell
.\moonmmdb.exe lookup examples/asn.mmdb 192.0.2.1 198.51.100.1
.\moonmmdb.exe project examples/tags.mmdb 192.0.2.1 /site /purpose
```

两个查询分别返回 ASN 字符串 `64512`、`64513`。投影结果为 site=`lab-a`、purpose=`synthetic-demo`，匹配前缀均为 24。整数以带类型的十进制字符串返回。

## 3. 同时补充三个数据库

```powershell
.\moonmmdb.exe enrich-many examples/many.json examples/access.jsonl
$LASTEXITCODE
```

输出四行；原始 request_id 的 `9007199254740993` 等数字文本保持不变。最后一条 IP 未命中，所以退出码应为 **1**。

stderr 的完成汇总应满足：

| 项目 | 预期 |
|---|---:|
| processed / valid_ips | 4 / 4 |
| invalid_inputs | 0 |
| geo / asn / tags 各自 found | 3 |
| geo / asn / tags 各自 not_found | 1 |
| 三个源各自 errors | 0 |
| geo / asn missing_fields | 各 1 |
| tags missing_fields | 2 |

tags 选择两个字段，因此一条未命中会增加两个缺失字段计数。完成汇总还包含每份数据库的字节数、类型、构建时间及 SHA-256。

## 4. 接入管道和自己的数据库

```powershell
Get-Content examples/access.jsonl | .\moonmmdb.exe enrich-many examples/many.json -
```

Linux：

```sh
cat examples/access.jsonl | ./moonmmdb enrich-many examples/many.json -
```

将配置的 database 改为自己的 City、ASN 或自定义 MMDB 文件；相对路径以配置文件目录为准。字段根据实际数据库结构填写，不保证任意数据库都具有国家或 ASN 字段。嵌套输入字段通过 `--ip-path /client/ip` 指定。

规模更大的日志可设置 `--max-records 100000 --max-input-bytes 134217728`。请同时检查退出码和完成汇总，避免将中途输出当成完整成功。

## 5. 验证交付内容

下载包中的 `MANIFEST.json` 记录每个文件的 SHA-256；Release 的 `SHA256SUMS` 用于核对压缩包。Windows 可使用 `Get-FileHash -Algorithm SHA256`，Linux 可使用 `sha256sum`。运行程序本身不需要开发工具、在线服务或自动下载数据库。

配置错误在消费日志前报错；无效日志行返回错误且使退出码为 2。管道关闭、UTF-8 损坏或资源超限会中断处理并取消完成汇总。Native 的 128 层嵌套限制、Unicode 代理项要求及系统支持范围见 [Native 说明](NATIVE_CLI.md)。
