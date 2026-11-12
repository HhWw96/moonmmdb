# Windows Native 文件验证程序

独立 MoonBit 消费模块，以 Native release 编译为 Windows x64 EXE。MMDB 打开、树查找、值解码和字段提取均调用核心 MoonBit 包；`io.c` 只接入 Unicode 命令行、文件和计时。当前维护源码使用 MoonBit `0.10.20+65efd5b93`、MSVC C++ Build Tools 与 Windows SDK，不修改官方运行时。

在项目根目录：

```text
python scripts/setup-native-windows.py
npm run verify:native
dist\moonmmdb-native-probe.exe DATABASE.mmdb IPS.txt
```

IP 清单为 UTF-8，每行一个地址，支持 LF / CRLF。数据库上限 256 MiB，清单上限 8 MiB。输出 JSONL：元数据、每个 IP 的完整结果与固定 7 路径投影、耗时汇总。查询、投影、序列化和输出均计入循环耗时；文件读取不计入 open_ms。完整协议实现见 main.mbt。

这是自动验证使用的传输程序。打开失败退出 2；单个 IP 查询失败在该行返回 error，程序继续并可退出 0。它与产品 Node CLI 的整批退出状态约定不同，不应直接替代 CLI 的错误处理。

本示例仅声明 Windows x64，并已在当前工具链与 MSVC 下构建和运行；不声明 Linux 或 macOS 支持。使用 Shell32 取得 Unicode 参数，核心库没有加入 Windows 专用依赖。产品级跨平台命令使用 [Native CLI](../../docs/NATIVE_CLI.md)，本次实际工具链和结果见 [维护报告](../../docs/MAINTENANCE_2026_11_12.md)。旧版 GCC 记录继续保留在 [历史验证](../../docs/NATIVE_PRODUCTION.md)。
