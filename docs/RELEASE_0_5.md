# MoonMMDB v0.5.0

提供 Windows/Linux x64 原生命令行工具，解压后可直接执行 metadata、lookup、project 和 enrich-many，无需 Node.js、Python 或 MoonBit 工具链。查询和日志处理逻辑使用 MoonBit，C 仅用于系统输入输出。

- 联合日志补充支持 1–4 份数据库，保留原始数字文本，区分未命中、字段缺失和各源错误，并输出数据库 SHA-256 与完成汇总。
- 有界流式输入、输出等待、Unicode 路径及管道关闭处理；Linux 非普通文件预检避免被命名管道阻塞。
- Windows ZIP、Linux tar.gz 内含可执行程序、离线人工样例、快速入门和许可证，提供整体及逐文件 SHA-256。

下载对应系统的压缩包，参照其中 QUICKSTART.md 运行。Linux 构建基线为 Ubuntu 22.04 / glibc 2.35，验证范围包括 Ubuntu 24.04；不声明 macOS、ARM64、Alpine 或 MSVC 支持。

Native JSON 最大嵌套 128 层，固定 MoonBit 解析器拒绝未配对的 Unicode 代理项转义；这类输入与 Node JSON.parse 存在明确差异。Native 尚不提供 enrich、diff 或 analytics 命令，原有 Node 工具继续提供对应功能。v0.4.0 的默认 Node RSS 门槛失败记录继续保留。

[验证报告](https://github.com/HhWw96/moonmmdb/blob/main/docs/VERIFICATION_0_5.md) · [离线演示](https://github.com/HhWw96/moonmmdb/blob/main/docs/DEMO_0_5.md) · [Mooncakes](https://mooncakes.io/docs/HhWw96/moonmmdb@0.5.0/)
