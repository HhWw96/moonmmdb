# 下一版本开发证据（未发布）

实现提交 `0c1a95fde09760124b584e331b8061a75af9b348`；[完整解释](../../../docs/VERIFICATION_NEXT.md)。

- `release.json`：本机完整验证链及源码/报告散列绑定。
- `api-compat.json`：已发布 0.5.0 的公开接口基线对照。
- `corpus.json`、`corpus-native.json`：完整固定官方语料在 JS 与本机 Windows Native 的独立参考/策略检查。
- `typed.json`、`typed-production.json`：强类型消费示例的官方及真实数据库对照。
- `native-tests.json`：本机 Native 测试计数，去除私有路径，仅保留结论与身份字段。
- `package.json`：本地归档及隔离消费验证摘要，省略带私有路径的命令日志。它不是 Mooncakes 发布回执。

远端完整回归：https://github.com/HhWw96/moonmmdb/actions/runs/35564700809 。Native 扩展流水线：https://github.com/HhWw96/moonmmdb/actions/runs/35564700839 ，其长时运行结果在报告编写时尚未完成。
