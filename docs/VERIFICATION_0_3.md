# 0.3.0 验证范围

2026-09-20 完成本地扩展复验，`node scripts/extended-verify.mjs` 总结果为 passed。流程分别记录发布回归、Native、宿主边界、官方异常文件和真实数据库抽样，最后核对源码与产物散列。

| 检查 | 结果 |
|---|---|
| MoonBit 核心 | JS 26/26，Wasm GC 26/26 |
| 宿主与 CLI | 24/24；覆盖旧命令、选择器、流式输入、差异检查及源码证据 |
| 查询与字段投影的独立 Python 对照 | 7,749 项，MoonMMDB 对照失败 0 |
| 数据库差异的独立 Python 对照 | 1,099 项；258 有变化、841 无变化，失败 0 |
| 资源与格式边界 | 29 个官方场景通过；2,048 次确定性变异输入检查通过 |
| 规模库 | 约 31 MB、65,536 网段，5,000 次查询对照通过 |
| 隔离包消费 | HhWw96/moonmmdb 0.3.0 打包后在新目录通过 JS/Wasm GC 示例测试 |
| Windows x64 Native | debug 26/26，release 26/26，独立消费示例 1/1 |
| Native 文件与宿主边界 | 29 个异常/边界文件、4 项宿主回归通过 |
| 真实 DB-IP Lite Country/City | 每库 5,000 个地址；Native、JS 与 Python/C 对照零分歧 |

流式回归实际处理 11,000 条、超过 8 MiB 的输入，并验证接收 EOF 前即可输出、中文跨块、CRLF、无末尾换行、坏 UTF-8、字节/单行/记录限制、慢消费者和输出管道关闭。不能把允许配置至 1 GiB 解读为已经完成该规模压力验证。

官方人工样本中的一个 UInt32 边界案例，Windows C 扩展与纯 Python 参考仍有已知分歧；完整记录保留在 reference.json，不计为 MoonMMDB 与 Python 的对照失败。该分歧没有出现在上述两套真实库抽样中。

本地 evidence 入口为 `verification/local/extended.json`，其中关联每份报告散列。执行源码指纹（计算范围见 scripts/evidence.mjs）：`243935ed793c34b46169965a5ea19d39a0a39bae288e7af801604d518ddeb1ad`；JS 产物：`7adf39407692eed91bcd643dbdb4de972175488341f9ae3ab5721a5052d11f24`；Native 产物：`aab39c519132ca6ded99628c56aa36a49b8713278461c9240541edbaf518df17`。

新增检查涵盖字段选择配置隔离、流式输入边界、数据库差异语义，以及独立 Python 对照。0.2.0 历史验证报告继续保留，不能用旧报告替代新版本的源码绑定记录。

复验命令：

```text
python -m pip install --target .reference-deps -r requirements-reference.txt
node scripts/extended-verify.mjs
```

Native 仍限定固定 Windows x64、MoonBit 0.10.11、GCC 16.2.0；真实数据仍为已固定散列的 DB-IP Lite 2026-09 Country/City，并非新下载的数据快照。差异检查的独立参考使用官方样本及明确修改的字符串记录，不代表已经穷举两套真实数据库版本差异。

[GitHub CI](https://github.com/HhWw96/moonmmdb/actions)运行 Ubuntu、Windows 的发布检查，其中包含新的差异参考步骤；Native 和真实库下载不在 CI 工作流内，使用上述本地扩展入口复现。各版本的实际 CI 状态以对应运行记录为准。
