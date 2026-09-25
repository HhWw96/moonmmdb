# 0.9.1 验证与发布状态

当前为候选版本；跨平台发布门槛尚未完成，0.9.0 继续作为公开稳定版。此文件随实际验证回执更新，构建成功不代表正式发布。

验证入口：

- `node scripts/release-verify.mjs`：保留核心、CLI、独立参考、包内容和旧消费者检查。
- `node web/hash-verify.mjs`：增量 SHA-256 与 Node 独立实现对照。
- `node web/analytics-verify.mjs --production`：人工与真实数据、精确报告、十万行、64 MiB、取消与下载。
- `node web/analytics-verify.mjs --file --production`：隔离 CI 中禁用网络直接打开 HTML。
- `node web/soak.mjs`：30 分钟，分析、查询、比较、检查、取消与重载，采样整个浏览器进程树。
- 现有 Windows/Linux Native、正式分析与默认 Node 稳定性门禁继续执行，不以浏览器通过替代历史负载。

前端验证使用仓库 Playwright：当前未提供 Browser 插件及其 browser 技能。记录浏览器实际版本、页面身份、桌面与窄屏截图、控制台、交互、网络请求及报告散列。历史 Node 默认 RSS 和旧配置失败记录完整保留。
