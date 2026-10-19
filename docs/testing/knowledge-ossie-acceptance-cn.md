# Knowledge + Apache Ossie 0.2.0.dev0 验收方案

[English](./knowledge-ossie-acceptance.md) | [简体中文](./knowledge-ossie-acceptance-cn.md)

## 目标

验证 Knowledge 不只是一个可编辑目录，而是在完整分析流程中提供可观察、可复现、可追溯的语义约束：

1. 合法的 Ossie 0.2.0.dev0 YAML 能导入、展示、编辑和无损导出。
2. Agent 会按当前连接和问题自动选中相关模型，并注入 Metrics、Relationships 与 AI Context。
3. Agent 会生成符合业务口径的 SQL 和答案。
4. 每个 Agent Run 记录精确的规范版本、模型内容 revision、命中的语义构造和 Knowledge 深链。
5. 模型不可用时查询 fail-open：分析继续、错误可观察，且无关或未验证模型不会污染上下文。

## 规范版本与升级

Dory 使用 **0.2.0.dev0 开发规范**，固定采用 Apache Ossie 提交 [`32c293c79a80b0c11e01bd76357950284aeaf3f8`](https://github.com/apache/ossie/blob/32c293c79a80b0c11e01bd76357950284aeaf3f8/core-spec/ossie-schema.json)，不代表最终的 0.2.0 正式版。模型使用根节点结构：

```yaml
version: 0.2.0.dev0
name: commerce
datasets:
    - name: orders
      source: public.orders
```

文件导入仅接受此版本和结构，拒绝 0.1.1、旧 `semantic_model` 包装、混合结构和未知版本。库内已有模型在 Knowledge 初始化时通过事务迁移，与文件导入相互独立。迁移保留定义 ID、连接、验证状态和扩展，同步生成新版 JSON/YAML；历史 Agent Run 的 revision 和资产快照不变。任一模型转换失败会回滚整批转换并报告模型 ID。

验收须覆盖所有声明方言、`datatype`、任意厂商扩展及多方言表达式在编辑和导出后的保留。时间类型默认视为时间维度，显式 `is_time: false` 优先；支持声明方言不代表新增对应执行引擎。

## 经典验收数据

仓库提供一套确定性、无个人数据的 Northwind 风格电商经营数据。生成器使用固定随机种子，因此每次重建都会得到相同答案。

| 数据集            | 粒度             |     固定规模 | 主要用途                      |
| ----------------- | ---------------- | -----------: | ----------------------------- |
| `customers`       | 每客户一行       |        1,200 | 获客、区域、分层、复购        |
| `products`        | 每 SKU 一行      |           48 | 六个商品品类                  |
| `orders`          | 每订单一行       |        8,000 | GMV、收入、订单、客单价、退款 |
| `order_items`     | 每订单商品行一行 |   大于 8,000 | 订单到商品的桥接关系          |
| `payments`        | 每支付尝试一行   | 不少于 8,000 | 渠道、重试、成功率和事故      |
| `support_tickets` | 每工单一行       |        1,800 | 优先级、解决时长、积压事故    |
| `events`          | 每行为事件一行   |       36,000 | 获客和漏斗探索                |

配套 Knowledge Model 是原生 Apache Ossie 0.2.0.dev0 文档，包含：

- 7 个 datasets 和完整字段定义；
- 8 个 metrics；
- 7 条带列映射的 relationships；
- 中英文 synonyms、示例问题和业务 instructions；
- Dory `COMMON` extensions 中的 verified 状态、稳定 ID 和 connection 绑定；
- 5 条相邻的 Verified Queries，以及指标词典、经营日历和事故背景 Knowledge Sources。

## 固定问题与金标准

| 场景     | 用户问题                                            | 必须命中的语义                                      | 金标准                                                           |
| -------- | --------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| 月度经营 | 2026 年每月净收入、订单数和客单价趋势如何？         | `net_revenue`、`order_count`、`average_order_value` | 6 行；1 月净收入 189,376.21；6 月 181,273.27                     |
| 支付事故 | 2026-05-11 至 2026-05-17 哪个支付渠道的失败率异常？ | `payment_success_rate`、`payments_order`            | `atlas_pay` 为 14 / 38，失败率 36.84%；其他渠道为 6.82% 和 2.33% |
| 品类退款 | 哪些商品品类的退款金额占比最高？                    | `refund_rate`、两条订单明细桥接关系                 | `Premium Wearables` 第一，23.11%                                 |
| 渠道复购 | 不同获客渠道的购买转化和复购表现如何？              | `repeat_purchase_rate`、`orders_customer`           | affiliate 购买率 95.42%，复购率 0%；其余渠道均高于 99%           |
| 工单积压 | 2026 年 6 月高优先级工单的解决时长是否恶化？        | `ticket_resolution_hours`                           | critical 最差：28 单，平均 75.11 小时                            |

问题、SQL、预期语义 ID 和预期事实的机器可读来源是 [commerce-agent-evaluation-knowledge.ts](../../apps/web/lib/demo/commerce-agent-evaluation-knowledge.ts)。不要在测试中维护另一份会漂移的金标准答案。

## 准备本地环境

启动并登录本地 Dory，确保已有组织。从仓库根目录执行：

```bash
yarn workspace web commerce:evaluation:seed --organization-id <organizationId> --user-id <userId>
```

请使用当前登录测试组织和用户的 ID。命令会校验用户属于该组织；不要同时运行应用和另一个写入同一 PGlite 目录的进程，导入前停止本地开发服务，导入后重启。如果修改了 MCP facade 源码，先执行 `yarn workspace @dory/server-core build` 重建共享运行时。

该命令会：

- 复用 `apps/web/localdata/commerce-agent-evaluation.sqlite`；仅显式传入 `--reset` 时重建；
- 创建或更新 `Commerce Agent Evaluation` SQLite 连接；
- 导入 `Commerce Operations Knowledge` 的 Ossie 0.2.0.dev0 YAML，并保留 verified 状态；
- 创建 4 个 Knowledge Sources 和 5 条 Verified Queries；
- 输出 `connectionId`、`knowledgeModelId`、`ossieVersion` 和完整 `modelRevision`；
- 导出 YAML、4 份来源文档、包含完整标准结果的 `scenarios.json` 和 `manifest.json` 到 `apps/web/localdata/commerce-knowledge-acceptance`（可通过 `--output-dir` 修改）。

它只应在开发或测试组织运行。`--reset` 只会重建专用 SQLite fixture，不会修改业务数据库。

## 测试分层

### P0：契约与数据正确性

执行：

```bash
yarn workspace web commerce:evaluation:test
yarn workspace web exec tsx --test ../../packages/database/scripts/tests/knowledge-model.test.ts
```

验收项：

- 文档通过官方 Ossie 0.2.0.dev0 schema 和 Dory profile。
- 全部评估定义为 verified，并绑定同一测试 connection。
- dataset、metric、relationship 和列映射数量正确。
- 每条金标准 SQL 都返回确定性结果。
- 没有断裂的外键引用。
- 契约回归覆盖错误版本、Cube YAML、多模型文档、空 dataset、重复名称、断裂引用、列映射不等长和 round trip。

### P0：Knowledge UI

人工检查：

1. 打开 **Knowledge**，确认没有单独的 Ossie 产品入口。
2. 打开 `Commerce Operations Knowledge`，确认显示 `Apache Ossie 0.2.0.dev0 · rev <8 位哈希>`。
3. 在 Definitions 中检查 datasets、fields、8 个 metrics、7 条 relationships 及关系列映射。
4. 检查 AI Context 的 instructions、synonyms 和 examples。
5. 打开 YAML，确认它是 Ossie 文档且没有 `cubes:` 键。
6. 只编辑一个字段描述后保存并重新打开 YAML；其他 dialects、AI Context 和 extensions 不得丢失。
7. 重新导入仅格式变化的 YAML，revision 应不变；改变 metric expression 后 revision 必须变化。

可选浏览器冒烟：

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 E2E_COMMERCE_EVALUATION=1 yarn test:e2e tests/e2e/commerce-agent-evaluation.spec.ts
```

### P0：自动语义上下文

针对每个固定问题创建 Agent 查询。在 SQL 生成前检查调试输出或 MCP 返回：

- `semanticContext` 包含独立的 `Semantic Model Context` 区块。
- 模型名、Ossie 规范版本和 revision 都存在。
- 所需 metric、fields、relationship 方向和列映射都存在。
- 相关 instructions、synonyms 或 examples 都存在。
- Agent 在显式 search/read Knowledge 前已经获得基础语义上下文。
- 重复运行时模型选择和上下文截断稳定。

MCP 重放：

```bash
DORY_MCP_TOKEN=<只读服务账号令牌> \
DORY_COMMERCE_EVALUATION_CONNECTION_ID=<seed 输出的 connectionId> \
yarn workspace web commerce:evaluation:mcp
```

重放脚本为五个固定场景分别创建 Agent Run，先断言自动返回场景要求的语义、Ossie 0.2.0.dev0 和 revision，再执行资产检索、schema 探索和标准 SQL。所有结果行必须匹配共享 `expectedRows`（持久化单元格中的数字字符串仅在对应标准列为数字时转换），随后读回 Artifact 核验内容和 Run 归属，最后用实测结果保存 finding。失败场景标记 error，命令以非零状态退出；记录保存至 `mcp-results.json`。这验证 MCP Agent 执行链路；UI Chat 自主生成 SQL 仍需单独验收。

复购率的分母是至少购买一次的客户数，购买转化率的分母是渠道全部客户数；无购买客户时复购率为 NULL。

### P0：Agent Run 追溯

完成 MCP 重放或 UI Chat 后，打开对应 Agent Run：

1. Context 卡片显示 `Commerce Operations Knowledge · Ossie 0.2.0.dev0 · rev <8 位哈希>`。
2. 卡片深链回同一个 Knowledge Model。
3. 快照包含命中的 metrics 和 relationships。
4. 修改模型后新 Run 记录新 revision；旧 Run 仍显示原 revision 和快照。
5. 如果同一 Run 实际使用两个模型 revision，两条 asset reference 都必须独立保留。

### P1：隔离、相关性与失败路径

| 用例                            | 预期                                                          |
| ------------------------------- | ------------------------------------------------------------- |
| 同名 metric 绑定另一 connection | 不注入                                                        |
| 唯一 ready 模型、问题无文本命中 | 允许 connection 级 fallback                                   |
| 多个 ready 模型、均无正向命中   | 不注入                                                        |
| synonym “payment success” 命中  | 选择 `payment_success_rate`                                   |
| 完整事故示例命中                | 选择支付模型和相关 relationship                               |
| definition 为 unverified        | 不进入上下文                                                  |
| Resolver 抛错                   | SQL/普通回答继续；记录错误事件；不写 semantic-model asset     |
| 上下文超过预算                  | 最多 3 个模型、12 metrics、12 datasets、16,000 字符；稳定截断 |
| 导入 `cubes:` 或错误版本        | 明确提示仅支持 Apache Ossie 0.2.0.dev0                        |

`apps/web/scripts/tests/semantic-model-context.test.ts` 和 MCP facade 测试覆盖确定性路径。发布前仍应人工抽查一次 connection 隔离和一次 fail-open 行为。

## 发布门槛

全部 P0 检查通过才能发布。保存以下证据：

- seed 输出：`connectionId`、`knowledgeModelId` 和 `modelRevision`；
- 五个固定问题的回答、SQL 和 Artifact 链接；
- 支付事故 Agent Run Context 卡片截图；
- 自动化命令结果；
- 任何失败所属层：契约、检索、上下文、SQL、结果或追溯。

不能只比较自然语言答案。通过条件是：语义命中正确、SQL 口径正确、数值匹配金标准数据，并且 Agent Run 中的模型 revision 可追溯。
