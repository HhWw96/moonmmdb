# Windows Native 文件验证程序

独立 MoonBit 消费模块，以 Native release 编译为 Windows x64 EXE。MMDB 打开、树查找、值解码和字段提取均调用核心 MoonBit 包；`io.c` 只接入 Unicode 命令行、文件和计时。C 编译器启动器只为固定版本运行时启用 `_CRT_RAND_S` 声明，不修改运行时。

在项目根目录：

```text
python scripts/setup-native-windows.py
npm run verify:native
dist\moonmmdb-native-probe.exe DATABASE.mmdb IPS.txt
```

IP 清单为 UTF-8，每行一个地址，支持 LF / CRLF。数据库上限 256 MiB，清单上限 8 MiB。输出 JSONL：元数据、每个 IP 的完整结果与固定 7 路径投影、耗时汇总。查询、投影、序列化和输出均计入循环耗时；文件读取不计入 open_ms。完整协议实现见 main.mbt。

这是自动验证使用的传输程序。打开失败退出 2；单个 IP 查询失败在该行返回 error，程序继续并可退出 0。它与产品 Node CLI 的整批退出状态约定不同，不应直接替代 CLI 的错误处理。

当前这个示例的链接配置针对 Windows GCC（Shell32）。已验证 MoonBit 0.10.11 + GCC 16.2.0，尚未验证 MSVC、Linux 或 macOS；核心库没有加入 Windows 专用依赖。工具链安装与真实数据对照方法见 ../../docs/NATIVE_PRODUCTION.md。
