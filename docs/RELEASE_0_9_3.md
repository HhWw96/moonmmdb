MoonMMDB v0.9.3 固定 MoonBit `0.10.14+7d59c7ec9`，保留既有接口及查询结果语义，并改善浏览器任务与报告保存。

- 固定完整编译器修订号，自动检查 CI、源码构建和 Native 构建的一致性。
- 显式保留派生类型方法，关闭网段游标时释放底层数组引用。
- 统一任务与报告的下载大小限制，提供再次保存入口，清理过期临时地址。
- 补齐第三方文件的修改通知、上游语法与来源散列。
- 多库查询只解析一次 IP，减少类型化 JSON 序列化的容器复制；保持逐库资源限制和返回结果隔离。
- 网页部署兼容 CRLF 校验清单，继续核对公开 HTML 的 SHA-256。

安装核心库：`moon add HhWw96/moonmmdb@0.9.3`。官方 [Mooncakes 包与 API 文档](https://mooncakes.io/docs/HhWw96/moonmmdb@0.9.3/)。

使用 [本地数据库工作台](https://hhww96.github.io/moonmmdb/)，或下载附件中的独立 HTML 断网运行。Windows/Linux x64 Native 包解压即可执行十个命令，无需安装开发工具；Linux 最低 glibc 2.35。在线与离线 HTML 使用相同内容，数据库和日志均在本机处理。

完整验证与产物绑定见附件 `FINAL_VERIFICATION.json` 和 [版本验证](https://github.com/HhWw96/moonmmdb/blob/main/docs/VERIFICATION_0_9_3.md)。`SHA256SUMS` 提供当前附件校验值；早期发布快照、历史失败记录和兼容基线保留。
