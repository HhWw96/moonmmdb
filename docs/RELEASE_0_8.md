# MoonMMDB v0.8.0 — 浏览器本地数据库工作台

新增浏览器 IP 查询、JSON Pointer 字段提取、数据库结构与引用记录检查、指定 IP 的新旧库对比。提供相同内容的静态网页与独立离线 HTML，数据在本机 Worker 中处理，无需安装查询运行时。

包括深色中文界面、三个明确标注的人工样例、SHA-256、可取消操作、精确类型结果、复制与带来源的 JSON 报告下载。保留既有 MoonBit API、Node 和 Windows/Linux Native 七个命令。

数据库单库及合计上限 256 MiB；结果 8 MiB，页面预览 64 KiB。文件上限不是进程内存上限。检查通过不代表信息准确；指定 IP 对比不等于整库相同。历史 Node 默认 RSS 门槛失败保留。

浏览器支持范围、验证结果、独立参考、持续运行和发布后验收见 `docs/VERIFICATION_0_8.md`。Windows/Linux Chromium、Firefox 的网页与 file:// 离线测试全部通过，每组 73 个官方文件及两份真实数据库、31,259 次查询；两平台 Chromium 各通过 30 分钟持续运行。

[打开工作台](https://hhww96.github.io/moonmmdb/) · 下载附件 `moonmmdb-0.8.0-offline.html` 可断网直接打开。网页已上线，下载产物与注册表独立安装均已复验；具体回执见仓库验证报告。
