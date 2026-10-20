# 自动提取指标与业务口径验收

## 自动化覆盖

核心、权限、Agent、Ossie 和 PGlite 用例：

```bash
yarn workspace web exec tsx --test \
  scripts/tests/knowledge-extraction.test.ts \
  scripts/tests/knowledge-extraction-permissions.test.ts \
  scripts/tests/agent-assets.test.ts \
  scripts/tests/semantic-model-context.test.ts \
  ../../packages/database/scripts/tests/knowledge-extraction.test.ts \
  ../../packages/database/scripts/tests/knowledge-model.test.ts
```

Postgres 使用显式选定的临时数据库实例；用例创建独立数据库并在结束时清理，不要指向生产实例：

```bash
DORY_EXTRACTION_TEST_POSTGRES_URL=<临时Postgres连接地址> \
yarn workspace web exec tsx --test ../../packages/database/scripts/tests/knowledge-extraction.test.ts
```

覆盖全文末尾、长段落／代码块分片、表格、无内容、结构错误、伪造证据、无证据、提示注入边界、
片段编号引用、未关联数据源、字段校验、草稿不发布、跨文档合并／冲突、人工修改、驳回去重、
来源变化／删除、审核版本变化、禁用、断开、并发认领、租约恢复、重试上限及数据源解绑保护。
已发布知识的新证据需审核后才能进入 Agent；合并草稿中某篇原文变化时，仍由其他当前原文支持的建议会保留。
迁移测试同时覆盖新库和已有 `0033` 数据库；已有 Linear／GitHub 连接及原文保留、默认关闭提取。

浏览器流程用例是模拟后端状态，不冒充真实 Linear 或 AI 联调：

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 \
yarn exec playwright test tests/e2e/knowledge-extraction.spec.ts \
  tests/e2e/linear-knowledge-connector.spec.ts --project=chromium --workers=1
```

Web／database typecheck、相关文件 ESLint、Linear／GitHub provider 和凭据回归也必须通过。

本轮最终检查结果（2026-10-20）：

| 检查 | 结果 |
| --- | --- |
| 核心／权限／Agent／Ossie／PGlite | 43 通过 |
| Postgres 提取／迁移集成 | 10 通过 |
| Linear／GitHub／凭据／PGlite 回归 | 23 通过 |
| Postgres 连接器回归 | 10 通过 |
| Playwright 模拟界面流程 | 2 通过 |
| 真实 Agent：已审核知识／来源变化状态 | 两阶段通过 |
| Web、database typecheck；相关 ESLint；diff whitespace | 通过 |

## 真实电商验收入口

使用 [电商 Linear 准备流程](linear-commerce-acceptance-cn.md) 中的专用合成项目。
在已有“电商”连接上手动开启并补跑，等待全部来源处理完成，再审核净收入、支付成功率、UTC 和 USD。
指标选择已有 `Commerce Agent Evaluation` 数据源；字段填写后应通过实际 Schema 校验。
保留原有实体定义和模型业务背景。

真实验收独立用例默认跳过，不读取 Linear Key，也不拦截 Linear 或 AI 请求：

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 \
E2E_KNOWLEDGE_EXTRACTION_LIVE=1 \
E2E_KNOWLEDGE_EXTRACTION_MODEL_ID=<模型ID> \
E2E_KNOWLEDGE_EXTRACTION_ORGANIZATION_ID=<组织ID> \
yarn exec playwright test tests/e2e/knowledge-extraction-live.spec.ts --project=chromium --workers=1
```

它使用当前登录组织的真实 Agent Chat。组织 ID 必须对应当前 Chat 会话组织。
检查已审核指标、业务口径、来源关系及真实 `search_assets` / `read_asset` 调用，三个回答均需引用 Linear 原文。
运行前需先在界面完成审核；用例不会自动批准知识或操作凭据。

在专用指标文档末尾追加合成测试说明：

> DORY_EXTRACTION_REVIEW_V2：净收入需额外排除测试订单。

确认 Linear 已保存后手动同步，核对原来源 ID 和已发布指标保持不变，产生来源变化和新口径差异草稿。
未确认字段映射前不批准该测试变更。然后使用相同命令并增加：

```bash
E2E_KNOWLEDGE_EXTRACTION_PHASE=source-changed
```

此阶段要求 Agent 收到净收入的 `outdated` 来源状态，同时仍能读取原已审核版本。

## 2026-10-20 本地真实结果

环境：Web 自托管开发服务、PGlite、已配置的组织／全局 AI 网关（`qwen-plus`）、真实 Linear workspace。
Key 始终留在 Dory 凭据服务中；本次未生成、读取或写入报告。

- 模型：`kn_01a15859-05b2-757f-b4a5-16049a1eccad`（电商）。
- 连接器：`kc_01a15896-d957-74f7-bc6e-8a1b573ac374`。
- 专用项目：`be635b76-4b00-4efc-8129-832bc72d15f8`（Dory 电商知识测试）。
- 当前项目有项目说明、三篇原定文档及后来加入的一篇文档，共五条来源；额外文档保留未修改。
- 已有连接开启补跑后，五条来源全部提取成功。原文摘录包含 Markdown 表格、SQL 片段及正文末尾内容。
- 净收入、支付成功率发布为现有定义；UTC、USD 发布为独立业务口径。来源关系和资产计数保留关联。
- 首次真实 Agent 验收通过：实际读取两个指标和时区口径，回答附 Linear 原文链接。
- 修改指标原文、完整同步及再次提取通过：保留原知识源 ID，已发布定义内容和 ID 未被覆盖，生成差异及来源变化建议。
- 第二次真实 Agent 验收通过：净收入携带 `outdated` 状态，旧审核版本仍可读取和引用。
- 测试元数据（项目目的、测试标识等）已驳回，没有发布为业务知识。

本轮发布的正式条目：

| 条目 | ID |
| --- | --- |
| 净收入 | `metric:db264bf5-91d6-4149-9b61-c9b1bd8745e6` |
| 支付成功率 | `metric:0b401ce3-4c07-43e9-9af3-6e786c504a83` |
| 统计时区 | `kbr_01a158fc-0b96-775c-b3fc-260bb9b3ca63` |
| 币种 | `kbr_01a158fc-0ba6-77ba-b44b-dcf71a6a3549` |

机器证据位于被 Git 忽略的 `apps/web/localdata/linear-commerce-acceptance/`：
`extraction-published.json`、`extraction-agent-live.json`、`extraction-source-change.json`、
`extraction-agent-source-changed.json`，以及发布列表／差异审核截图。
只记录 ID、时间、引文、指纹、URL 和断言，不保存任何 Key。

刻意保留原文末尾的测试变更和未发布的净收入差异草稿，便于界面检查；旧正式口径仍标记来源变化。
该合成“测试订单”规则尚未映射到真实字段，不应直接批准为可执行计算。

## 尚未完成的真实验证

- Desktop 客户端实际启动、关闭及休眠恢复；本轮验证了共享 Node worker 和数据库租约恢复，未据此宣称完成 Desktop 实测。
- 完整一小时等待及真实多实例进程竞争；调度／租约由自动化覆盖，本轮不等待一小时。
- 真实 AI 配额耗尽、真实长文超过模型上下文，以及真实 GitHub OAuth/App 项目；对应错误和兼容路径采用自动化覆盖。
