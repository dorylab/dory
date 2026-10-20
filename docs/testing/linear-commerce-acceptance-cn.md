# 电商 Linear API Key 真实联调

将真实 Linear 项目接到已有“电商”知识模型，关联数据源为 `Commerce Agent Evaluation`。
测试不覆盖现有模型定义，不新增生产写入接口，不导入 Issue 或附件。

## 资料与 Key 准备

1. 在已登录的 Linear workspace 中使用唯一团队，新建项目 **Dory 电商知识测试**。
2. 项目短简介填写：`电商知识首次同步；Commerce Agent Evaluation 合成数据；DORY_LINEAR_COMMERCE_PROJECT_V1`。
3. 完整说明使用 [项目说明](../../tests/fixtures/linear-commerce/项目说明.md)。
4. 在项目资源中创建以下原生文档，标题使用文件名，正文完整复制对应文件内容：

| 标题                  | 内容文件                                                                            | 验证重点                                 |
| --------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| 电商指标口径.md       | [电商指标口径.md](../../tests/fixtures/linear-commerce/电商指标口径.md)             | 标题、列表、表格、SQL 代码块、净收入口径 |
| 退款与支付说明.txt    | [退款与支付说明.txt](../../tests/fixtures/linear-commerce/退款与支付说明.txt)       | 纯文本、退款分母、支付重试计数           |
| 运营日历与异常说明.md | [运营日历与异常说明.md](../../tests/fixtures/linear-commerce/运营日历与异常说明.md) | UTC、USD、完整时间范围及背景资料         |

这些是 Linear 原生文档。`.txt` 表示测试正文为纯文本，不是上传附件；同步到 Dory 后统一显示 Markdown 格式。
正文均为合成测试资料，禁止混入生产信息。重复准备时复用本次项目及文档 UUID，避免按标题批量修改其他项目。

进入 Linear **Settings → Account → Security & access → Personal API keys**，准备：

- 名称：`Dory Commerce Knowledge Test`。
- 权限：仅 **Read**。
- 团队：仅上述测试团队。

凭据最终生成由用户在 Linear 中完成，直接输入本地 Dory；不发到聊天，不保存到仓库，不放入命令行参数、URL、报告、trace 或截图。
项目和文档通过 Linear 界面创建，连接器和只读 Key 无需写权限。

在 Dory 的“电商”模型打开 **知识来源 → 添加来源 → 连接知识库 → Linear**，验证 Key、确认 workspace，
只选择专用测试项目并确认共享范围。完成后应有项目说明加三篇文档，共四条只读来源，并可以打开原文。

## 真实联调入口

新用例为 `tests/e2e/commerce-linear-live.spec.ts`。默认跳过，必须显式启用；不拦截或模拟 Linear/知识来源请求。
它复用 Dory 已保存的凭据，不读取或传递真实 Linear Key。输入专用项目的 UUID，而不是项目 URL 或 slug：

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 \
E2E_LINEAR_COMMERCE=1 \
E2E_LINEAR_COMMERCE_PROJECT_ID=<项目UUID> \
yarn exec playwright test tests/e2e/commerce-linear-live.spec.ts --project=chromium --workers=1
```

默认使用模型名“电商”；同名模型不唯一时显式设置 `E2E_LINEAR_COMMERCE_MODEL_ID`。
如需选择当前登录组织之外的已授权组织，设置 `E2E_LINEAR_COMMERCE_ORGANIZATION_ID`。
用例会检查模型关联了 `Commerce Agent Evaluation`，拒绝给混合项目范围的连接器运行生命周期测试。
它不会创建模型、重导语义定义、修改既有项目范围或删除保留的演示连接器。

基线验证包括：

- 立即同步后四条来源的完整正文、末尾标识、稳定实体路径和 Linear 原文 URL。
- 界面只读标记，以及现有模型定义版本未改变。
- 保存故意无效的测试 Key 失败，原有凭据元数据和来源 ID 保持不变。

报告默认在被 Git 忽略的 `apps/web/localdata/linear-commerce-acceptance/` 中。
`baseline.json` 仅保存模型、连接器、项目及来源 ID、标题、原文 URL、正文 SHA-256、同步时间和通过项目。
仅成功完成真实同步后才生成通过报告。自动化判定器的单元测试不计为真实 Linear 联调。

## 修改、空文档与删除

按顺序在 Linear 界面操作，每一步使用同一命令并设置对应的 `E2E_LINEAR_COMMERCE_PHASE`：

| 阶段        | Linear 中的操作                                                                              | 断言                                           |
| ----------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `baseline`  | 保留最初三篇文档                                                                             | 建立四条来源和稳定 ID 的基线                   |
| `updated`   | 将指标文档改名为 `电商指标口径（已更新）.md`，正文末尾添加 `DORY_LINEAR_COMMERCE_UPDATED_V2` | 标题、正文更新，来源 ID 不变                   |
| `temporary` | 保留三篇资料，新增 `临时生命周期测试.md`，正文为 `DORY_LINEAR_COMMERCE_TEMP_V1`              | 来源增至五条                                   |
| `empty`     | 将该临时文档正文清空，保留文档                                                               | 仍有五条来源，临时文档稳定路径和来源 ID 保留   |
| `deleted`   | 将该临时文档移入 Linear 垃圾箱                                                               | 完整成功同步后恢复为四条来源，其他来源 ID 不变 |

每个阶段会保存同名 JSON 证据，失败不能覆盖该阶段之前的成功报告。
修改后可将指标文档恢复原标题和正文再运行 `baseline`。最终保留专用项目、三篇资料和演示连接器。

### 独立撤销与恢复测试

同一 Dory 组织、同一 Linear workspace 共用凭据，另建知识模型不能隔离 Key 撤销影响。
必须使用**独立 Dory 测试组织**、独立模型、同一测试数据源的测试连接，以及独立临时 Read Key。
测试用户需要同时拥有这些组织的管理权限；没有这种隔离环境时，记录“撤销真实联调待完成”，不要撤销演示 Key。

为隔离环境设置独立的 `E2E_LINEAR_COMMERCE_OUTPUT_DIR`，先运行它的 `baseline`，然后在 Linear 中撤销临时 Key。
`revoked` 阶段额外要求：

- `E2E_LINEAR_COMMERCE_ORGANIZATION_ID`：独立测试组织。
- `E2E_LINEAR_COMMERCE_PROTECTED_ORGANIZATION_ID`：保留演示连接器的组织；必须与测试组织不同。
- `E2E_LINEAR_COMMERCE_MODEL_ID`：独立模型。
- `E2E_LINEAR_COMMERCE_OUTPUT_DIR`：独立证据目录。

该阶段验证连接器暂停、凭据失效，原有内容和最后成功时间保留。
在独立组织中更新临时 Key 后运行 `recovered`，检查连接器恢复且来源 ID 不变。
保留演示连接器的 Key 不参与该流程。

## Agent 来源验证与结果边界

同一套用例提供真实 `dory_search_assets`、`dory_read_asset` 验证：

1. “净收入如何计算？”命中指标口径，读取到 `net_amount - refunded_amount`。
2. “支付成功率如何计数？”命中支付说明，读取到每次重试是独立支付尝试。
3. “统计使用什么时区？”命中运营日历，读取到 UTC。

每次都校验专属正文标识、`untrustedContent` 和引用中的 Linear 原文 URL。
默认通过当前用户已登录的 Dory Agent 聊天入口验证真实 `search_assets`、`read_asset` 调用及回答中的原文引用，
不另建 MCP 凭据。沿用应用已有 AI 配置；AI 不可用或没有实际读取来源时，此子用例失败，不能标记为通过。
聊天验收使用当前活动组织；对显式指定的独立组织，改用该组织已有的 MCP Token。

如本地已有 `DORY_MCP_TOKEN`，用例改为直接调用真实 `dory_search_assets`、`dory_read_asset`，
Token 需要能读取对应测试数据源和知识模型。测试文件关闭 trace、视频和失败截图，不记录请求头、Token 或聊天原始流。
报告仅保留问题、来源 ref、Linear 原文 URL 和聊天 ID，详细调用可在 Dory Agent Run 中查看。

本轮不等待完整一小时，不将“手动刷新”标记为“真实小时同步已验证”。
小时调度、租约及重启恢复沿用现有数据库自动化覆盖；实际等待一小时、Desktop 实机休眠恢复单独记录。

## 2026-10-20 真实联调记录

本次使用本地 Web 服务和真实 Linear Read Key，未模拟 Linear 请求。

- Linear workspace：Jeffrey；团队：Jeffrey（JEF）。
- [测试项目](https://linear.app/jeffreyh/project/dory-电商知识测试-83395ade1844/overview)：`be635b76-4b00-4efc-8129-832bc72d15f8`。
- 知识模型：`kn_01a15859-05b2-757f-b4a5-16049a1eccad`（电商）。
- 保留连接器：`kc_01a15896-d957-74f7-bc6e-8a1b573ac374`。

| 验收项目                         | 结果                                                            |
| -------------------------------- | --------------------------------------------------------------- |
| 首次及重复完整同步               | 通过；项目说明加三篇原生文档，共四条只读来源                    |
| Markdown 与纯文本完整正文        | 通过；包括表格、SQL、末尾标识、项目简介及完整说明               |
| Agent 搜索、全文读取及原文引用   | 三个问题全部通过，证据在 `baseline-agent.json`                  |
| 无效 Key 保存                    | 失败且保留原有效凭据及来源                                      |
| 重命名与正文更新                 | 通过；原文 URL 随标题更新，知识源 ID 不变                       |
| 临时文档新增、清空、删除         | 通过；来源数依次为五、五、四，其他来源 ID 不变                  |
| 保留模型定义                     | 通过；模型版本未改变                                            |
| 独立临时 Key 撤销                | 通过；凭据失效、同步暂停，四条来源正文与 ID、最后成功时间均保留 |
| 演示连接不受临时 Key 撤销影响    | 通过；原 Key 再次真实同步成功，来源 ID 和正文 SHA-256 未改变    |
| 真实等待一小时、Desktop 实机恢复 | 本轮未执行                                                      |

保留来源 ID：

| 内容                  | Linear 实体 ID                         | Dory 来源 ID                              |
| --------------------- | -------------------------------------- | ----------------------------------------- |
| 项目说明              | `be635b76-4b00-4efc-8129-832bc72d15f8` | `ks_01a15896-dc85-72cc-8437-da5d54f45f71` |
| 电商指标口径.md       | `8827a40e-f836-42a3-8e07-8f07d6f2488e` | `ks_01a15896-dc8b-759b-bd7e-c5b942dc8579` |
| 退款与支付说明.txt    | `bee4edac-0307-4c54-8464-347ca1307869` | `ks_01a15896-dc8a-7516-9c49-8345a4fe5091` |
| 运营日历与异常说明.md | `7ebfe93b-7374-4f85-acd3-c2c91d764c25` | `ks_01a15896-dc89-76ba-a022-a357fe956e10` |

联调修复了两个问题：知识来源日期元数据改为 ISO 字符串，避免 AI SDK 拒绝后续消息；
包含归档的文档查询显式读取 `trashed`，过滤垃圾箱文档并保留普通归档内容。
这两个修复均有回归测试，并已在真实连接中复验。

机器可读证据包含 `baseline.json`、`baseline-agent.json`、`updated.json`、`temporary.json`、`empty.json`、`deleted.json`。
每个报告保存自己的实际检查时间和最后成功同步时间；证据目录被 Git 忽略，不保存 Key。
最终已恢复指标文档原标题、正文及三篇资料的固定范围，临时生命周期文档保留在 Linear 可恢复垃圾箱中。

撤销验证使用独立 Dory 组织 `AUwvxfIAGx5QuV09B5B6q7mKcforypRk`，模型
`kn_01a1589e-8e2f-75cb-82e6-f4d478c4d904`，连接器 `kc_01a158a5-1cfe-71fb-8b48-195d32ad9c37`。
用户即时确认后撤销 `Dory Commerce Revocation TEMP`，真实同步将其凭据标为失效并暂停连接器。
界面显示“请更新 Linear API Key 以恢复同步”，禁用立即同步，保留四条原文可追溯的只读来源。
最后成功同步时间保留为 2026-10-20 17:30:15（Asia/Shanghai）。
保留的“电商”演示连接在 17:32:52 再次同步成功，证明两个组织的凭据隔离生效。
完整证据见 `revocation/baseline.json`、`revocation/revoked.json`、
`demonstration-after-revocation/baseline.json` 和 `revocation-summary.json`。
隔离测试连接保持暂停以供检查；本轮未更新被撤销的临时 Key，真实换 Key 恢复不计为已验证。
