# 独立 MoonBit 日志分析示例

从项目根目录运行 `npm run build`，再运行：

```text
node examples/log_analytics/run.mjs tests/scenarios/geo.mmdb tests/scenarios/asn.mmdb examples/analysis-access.jsonl
```

预期四条请求、三条命中、一条未命中；退出码 1。国家和 ASN 的 Top 10、精确计数、错误与缺失状态均由本目录的 MoonBit 模块计算。run.mjs 负责受限文件读取、标准输入、JSONL 传输和输出。

替换前两个数据库参数即可使用自己的 City/ASN 数据。输入可为 `-`，支持 `--ip-path` 与现有流式上限参数。统计接口不是独立数据库格式，始终调用 HhWw96/moonmmdb 的公开 Enricher API。

`moon.work` 用于仓库开发。注册表安装验证由 scripts/registry-verify.mjs 在另一个无 workspace 的目录执行，二者分别记录。
