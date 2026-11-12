MoonMMDB v0.9.5 适配当前官方 MoonBit 0.10.20+65efd5b93，保持已有公开接口、CLI 参数和类型化结果语义。

- 显式使用 core/json 转换接口，更新派生语法和等价类型名称。
- 使用 FixedArray 适配 JavaScript 数组边界，修复字段提取、多库配置和独立强类型消费者调用。
- Windows Native 使用 MSVC 与 Windows SDK，完善自动发现、空格路径处理及系统 DLL 验证；Linux x64 保持 GCC 和 glibc 2.35 支持范围。
- 保留全部冻结 API 基线及上游 crypto 实现字节，继续检查许可证与来源。

- 减少联合查询固定 JSON 片段、逐行错误和解码工作数组扩容带来的临时分配，保持完整校验、精确结果及资源边界。未选中小映射的键通过已校验字节区间检查重复，避免不需要的字符串分配；输出使用固定 64 槽片段区分块连接，IP 解析直接消费迭代器。

安装：`moon add HhWw96/moonmmdb@0.9.5`。也可下载 Windows/Linux x64 程序或独立离线 HTML，或打开 https://hhww96.github.io/moonmmdb/。

最终通过的验证、产物和数据库散列由 FINAL_VERIFICATION.json 绑定；发布后的下载、注册表安装与在线页面复验另见 POST_PUBLICATION.json。SHA256SUMS 校验实际发行文件。历史失败记录保持原样。

原始持续运行及跨端验收记录见 `DEFAULT_NODE_REPORTS.zip` 和 `VALIDATION_REPORTS.zip`；额外验证文件的散列见 `EVIDENCE_SHA256SUMS`。
