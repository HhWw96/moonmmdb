# 浏览器本地数据库工作台

0.8.0 增加独立的浏览器产品。[网页入口](https://hhww96.github.io/moonmmdb/)与[独立 HTML](https://github.com/HhWw96/moonmmdb/releases/download/v0.9.1/moonmmdb-0.9.1-offline.html)的公开发布状态见[验证报告](VERIFICATION_0_9_1.md)。

## 使用

网页和离线 HTML 使用同一份构建产物。离线版保存到本机后直接用桌面浏览器打开，无需服务器、Node.js、Python 或 MoonBit。页面内置项目人工样例、帮助及许可证；人工 IP 标签不是实际归属。0.9.1 增加 City＋ASN 日志分析样例，发布状态见 [0.9.1 验证](VERIFICATION_0_9_1.md)。

1. 选择或拖入 `.mmdb` 文件，等待元数据与 SHA-256 计算完成。
2. **IP 查询**：输入一个 IPv4/IPv6 地址；字段框每行一个 JSON Pointer，留空查询完整记录。
3. **数据库检查**：检查所有物理树节点，包含不可达节点；可勾选解码树节点引用的记录。通过不证明信息准确或未引用字节均有效。
4. **更新对比**：指定旧库、新库和一个 IP；默认比较完整记录，或按路径比较字段。不能据此推断整库相同。
5. **日志分析（0.9.1）**：加载两份数据库，明确指定 City、ASN 角色，再选择 JSONL 日志；逐行统计国家与 ASN 请求量。嵌套 IP、输入限制与异常口径见 [日志分析说明](BROWSER_ANALYTICS.md)。
6. 复制结果 JSON，或下载附有工具版本、参数、文件名、散列、时间和实际检查结果的报告。日志分析报告只含统计与来源信息，不含原始日志。

报告的 `version: 1` 是报告封装版本，`result` 保持现有核心类型化 JSON。整数为十进制字符串；浮点带原始位，字节为十六进制。不要在业务代码中无条件转换成 JavaScript Number。未命中、字段缺失、错误及检查未完成各自独立。

取消会终止后台 Worker，清除可用 Reader 和当前结果；点击重新加载恢复。每次只执行一个任务；旧任务的结果不能覆盖新选择。查询和检查针对左侧第一份库；更新对比和日志分析分别通过角色选择框指定两份库。

## 限制

| 项目 | 边界 |
|---|---|
| 数据库 | 1—2 份；单库及合计不超过 256 MiB |
| 字段 | 最多 64 个不同路径；总输入不超过 65,536 字符 |
| 结果 | UTF-8 JSON 最大 8 MiB；页面预览最大 64 KiB |
| 检查工作单位 | 默认 100,000,000；最大 1,000,000,000 |
| 检查辅助状态 | 默认 64 MiB；界面可选 1—256 MiB |
| JSONL 日志 | 默认 8 MiB／10,000 行；最大 64 MiB／1,000,000 行 |
| 日志行与分组 | 每行最大 8 MiB，JSON 深度 128；国家、ASN 各最多 10,000 组 |

文件与辅助状态上限不等于浏览器进程内存上限；Reader 保持原有快照隔离，浏览器还需运行时、界面及序列化内存。预算不足时显示检查未完成，不当作损坏，也不显示通过。页面显示已用时间，不编造总进度。

首版验收桌面 Chromium、Edge、Firefox。Safari 和手机大库性能不在支持声明内；小屏布局可以操作人工样例。没有 Web Worker 或 SHA-256 能力时明确报错；复制权限被拒绝时可改用下载。

## 本地处理边界

应用不上传数据库、文件名或查询 IP，不写入 URL、localStorage、sessionStorage、IndexedDB、Cookie 或查询历史，不接入访问统计。页面 CSP 禁止应用联网，样例、字体策略、脚本与 Worker 均不依赖外部资源。在线页面访问本身仍可能被托管网站记录；主动打开 GitHub 链接会访问外部网站。用户主动下载的报告含查询输入和文件名。

数据库字符串通过 React 文本节点和预览文本显示，不作为 HTML 执行。Blob Worker 与下载 Blob URL 是浏览器本地资源，不是网络上传。取消、替换和清空终止旧 Worker；临时下载地址在触发下载后回收。

## 从源码构建与验证

```text
npm ci --prefix web
node scripts/build.mjs
python scripts/inspection-fixtures.py
npm run typecheck --prefix web
npm run build --prefix web
node web/hash-verify.mjs
python -m pip install --target .reference-deps -r requirements-reference.txt
python scripts/download-production.py
python web/oracle.py --production
cd web
npx playwright install chromium firefox
cd ..
node web/verify.mjs
node web/analytics-verify.mjs --production
node web/analytics-verify.mjs --file --production
```

前端 npm 依赖仅用于浏览器模块，不增加 MoonBit 核心或旧 Node CLI 的运行依赖。使用 Node.js 24 与固定 MoonBit 0.10.11+6ff76a5f9。浏览器测试通过 web 模块内固定 Playwright 执行；CI 安装 Chromium、Firefox，在隔离 runner 中额外执行 `node web/verify.mjs --file`。本机可用 `node web/serve.mjs` 在 http://127.0.0.1:4173/ 预览；服务器只返回生成的 HTML，不提供工作区文件访问。Linux 缺少浏览器系统库时，在隔离测试环境使用 `npx playwright install --with-deps chromium firefox`。

`python web/oracle.py --production` 使用固定 Python maxminddb 3.2.0、原始物理树检查和已审阅异常策略生成答案。Anonymous 等已知参考器枚举缺陷沿用官方源地址；参考失败不会算作通过。真实数据仅用于验证，不内置在 HTML 中。

先安装 `python -m pip install psutil==7.2.2`，再执行 `node web/soak.mjs`，默认 30 分钟，使用隔离 Chromium 进程树，记录 RSS 合计及 Windows 私有内存。进程 RSS 求和可能重复计算共享页，报告明确度量口径。无强制 GC；历史 Node 默认 RSS 失败仍未因此解决。
