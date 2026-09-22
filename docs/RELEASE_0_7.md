# MoonMMDB v0.7.0

Native 新增数据库更新对比：用日志中的 IP 比较旧、新 MMDB 的字段、记录存在性与命中前缀，输出类型化旧值和新值。支持字段选择、嵌套 IP、流式输入及错误优先退出码；保留原始日志中的大整数。完成汇总附带两个数据库的版本及 SHA-256。

```text
moonmmdb diff old.mmdb new.mmdb access.jsonl --field /country/iso_code
moon add HhWw96/moonmmdb@0.7.0
```

下载包包含人工旧、新标签库，可直接复现更新对比。Windows/Linux x64 解压即可使用，无需 Node.js、Python 或 MoonBit；Linux 最低 glibc 2.35。

修复通用注册表验证脚本的 geo 导入警告；保留 0.5.0 / 0.6.0 API 基线。检查范围、退出码和限制见 [Native 使用说明](https://github.com/HhWw96/moonmmdb/blob/main/docs/NATIVE_CLI.md)，独立参考、跨平台与持续运行证据见 [验证报告](https://github.com/HhWw96/moonmmdb/blob/main/docs/VERIFICATION_0_7.md)。diff 仅比较给定 IP，Native 两库合计不超过 256 MiB；旧 Node 默认 RSS 限制记录继续保留。
