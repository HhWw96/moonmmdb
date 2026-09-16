# 0.1.0 支持范围

## 格式与查询

| 项目 | 支持状态 |
|---|---|
| MMDB 主版本 2 | 支持；保留 minor，不拒绝未知元数据字段 |
| 24/28/32 位节点 | 支持，官方 IPv4/IPv6/mixed 样例验证 |
| 更宽合法节点 | 不支持，返回 unsupported-record-size |
| IPv4 与 IPv6 | 支持严格文本解析；无 DNS、zone id、CIDR、方括号或带前导零 IPv4 |
| IPv4 查询 IPv6 库 | 按高 96 位零遍历；返回 IPv4 地址族前缀长度 |
| IPv6 查询 IPv4 库 | 返回 ip-version-mismatch |
| 映射/6to4 地址 | 遵循数据库别名；不自行重写 Teredo 或其他过渡地址 |
| 元数据指针 | 以元数据段为基址，区别于记录数据段 |
| 未命中 | Lookup.value=None，保留终止前缀长度 |
| 整库合法性认证 | 不提供；open 只验证元数据、布局及分隔符，lookup 验证实际访问路径 |

## 类型与 JSON

Value 区分 Text、Blob、Boolean、Unsigned16/32/64/128、Signed32、Real32/64、List、Object。UInt128 使用精确十进制字符串；UInt64 使用 MoonBit UInt64。map 保留原条目顺序；重复 key 被本读取器策略拒绝，不宣称所有此类编码都违反格式。

CLI 使用带类型 JSON，例如 `{"type":"uint128","value":"340282366920938463463374607431768211455"}`。所有整数的 value 都是字符串；字符串与布尔保留对应 JSON 类型；bytes 是小写十六进制；map 的 value 是对象，array 的 value 是数组。浮点包含 type、展示用 value 字符串、精确 bits 十六进制，可保留非有限值和负零。

JSON 编码是 MoonMMDB 的接口约定，不保证与其他 CLI 的无类型输出相同。用户自行构造的 Value 不经过读取器的资源限制；限制承诺针对通过 Reader 解码得到的结果。

## 资源策略

| 参数 | 默认值 | 可配置上限 |
|---|---:|---:|
| max_depth | 128 | 256 |
| max_values | 65,536 | 1,000,000 |
| max_payload_bytes | 2 MiB | 64 MiB |
| max_file_bytes | 256 MiB | 512 MiB |

每次 open 或 lookup 使用自己的预算。max_values 是解码工作量计数，容器、键、值及指针控制也计数；与规范示例中不单独计指针的计数方式不同，可能更早拒绝指针密集数据。max_payload_bytes 按每次展开的字符串/bytes 字节收费，在复制和 UTF-8 解码前检查；不是整个进程的 RSS 上限。查找树最多遍历 32/128 位，未终止则报错。数组/map 在进入子项前预检声明数量，避免由声明长度直接大规模分配。

Reader 打开时保存输入快照，避免 JS 宿主修改原始 Uint8Array 后使已验证布局失效；这会增加打开时间和一份数据库存储。当前未做缓存、mmap 或惰性字段解码。

CLI 固定数据库上限 256 MiB、JSONL 上限 8 MiB 和 10,000 条。JSONL 输入逐行输出，某行错误不撤销此前输出，最终退出码 2 表示整次运行存在错误。消费者不能只看最后一行判断成功。

## 错误

主要 code：invalid-ip、ip-version-mismatch、missing-metadata、invalid-metadata、unsupported-version、unsupported-record-size、invalid-layout、invalid-separator、invalid-tree、invalid-tree-pointer、out-of-bounds、invalid-size、invalid-utf8、invalid-map-key、duplicate-key、unsupported-type、pointer-to-pointer、pointer-cycle、depth-limit、value-limit、payload-limit、file-limit、invalid-limits。CLI 的 host-input-error 与 invalid-jsonl 属于宿主输入层。

offset 以整份文件的字节位置计数；无法定位到具体编码字段的树/非文件错误返回 -1。错误不会转为 not_found 或部分记录。

## 后端

已在 Windows 的 JavaScript、Wasm GC 后端执行核心测试。CLI 使用 Node.js，属于 JS 后端。Native 本轮因本机没有 C 编译器而未能建立构建计划；没有将其标为通过。未声称支持 Linux/macOS 实机、浏览器 UI、WASI Component 或全数据库规模负载。
