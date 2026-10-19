# Olist 完整链路验收

Olist 的匿名真实电商数据独立用于本地研发，不替换现有合成 commerce fixture，也不随产品分发。原始数据采用 [Olist 官方版本 2](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)，许可为 CC BY-NC-SA 4.0。原始文件、SQLite、凭据和报告全部放在已忽略的 `apps/web/localdata/olist-evaluation`。

## 准备与导入

仓库根目录执行，Python 3 标准库即可，无需 pandas 或 Kaggle CLI：

```bash
yarn workspace web olist:evaluation:prepare --download --as-of 2026-10-15
# 或使用自行从官方下载的完整 9 个 CSV：
yarn workspace web olist:evaluation:prepare --input-dir /absolute/olist-csv --as-of 2026-10-15
```

下载固定 `datasetVersionNumber=2`；失败不会换源。必须显式指定 `--as-of`，避免宿主时区改变“当前日期”。用户提供 CSV 时仅验证列结构，报告明确标记其版本身份尚未独立验证。`data-manifest.json` 包含 ZIP/CSV、SQLite 和独立基准的哈希、行数、重复主键/行、空值、时间范围和关联缺失数；seed及运行前核对SQLite与基准哈希。所有原始行保留；原始金额文本旁增加整数分列。核心主键重复或无效订单日期会拒绝建立基准，写入 `prepare-failure.json` 并保留此前成功的 SQLite与基准。评价和邮编的重复是保留并报告的质量问题。

只使用专用开发组织。PGlite 必须先停止使用同一数据目录的 Dory 进程，prepare/seed 完成后重启；seed 会检查配置的服务地址是否仍在运行，但该检查不能发现其他端口或离线进程。Postgres 不需要独占本地 PGlite 目录。

```bash
yarn workspace web olist:evaluation:seed --organization-id <orgId> --user-id <userId>
```

该命令通过现有数据库抽象创建或更新专用连接、Ossie 0.1.1 模型、3 个来源文档、2 条 Verified Queries，不运行迁移、不覆盖 Demo。用户必须属于所选组织。`manifest.json` 记录 connection、model、revision、组织和用户 ID。

可选 `--token-file /absolute/private-token-file` 会创建仅限该连接、6 小时有效的验收凭据，以权限 0600 写入新文件；已有文件拒绝覆盖，凭据不会打印或写入报告。也可在 Dory 的既有 MCP 授权界面获取凭据。Web 部署必须能读取 SQLite 的绝对路径，不能拿客户端路径直接用于远程服务器。

## 口径与独立基准

- 成交：`order_status='delivered'`；商品额为 `price_cents`，不含运费。客单价的订单分母包括缺少明细的 delivered 订单。
- 复购：全数据范围中稳定 `customer_unique_id` 至少两笔成交；按首笔成交订单所在州归属，同时间以 order_id 打破平局。
- 迟到：下单在指定月份、送达和预计日期有效；按日比较，当天送达不迟到。
- 支付：每笔支付金额，限定 delivered 订单，金额包含运费。先聚合明细和支付，再进行订单层关联。
- BRL 金额内部为整数分；源时间无明确时区，不转 UTC。最近7日按显式 `--as-of` 的7个日历日含当日计算，不把历史数据平移到今天。
- 缺少退款金额、成本、支付尝试/结果，不能计算退款率、净利润、支付成功率。

`expected.json` 直接从 CSV 通过 Decimal 和客户/订单映射计算，不执行 SQL。标准 SQL 定义在 `olist-evaluation.ts`，二者必须一致。Agent 不收到基准或标准 SQL；两个 Verified Queries 是状态分布和明细覆盖率，与七个自主场景分离。

## MCP 与真实 Agent

重启 Dory。用 `DORY_MCP_TOKEN` 或 `--token-file` 提供凭据；可通过 `DORY_MCP_URL` 修改默认 `http://localhost:3000/api/mcp`。

```bash
yarn workspace web olist:evaluation:mcp --token-file /absolute/private-token-file
yarn workspace web olist:evaluation:agent --token-file /absolute/private-token-file
```

MCP 层六个数值场景执行 create_work → 自动上下文 → Knowledge search/read → schema → SQL → Artifact 读回 → finish_work。每层失败都标记失败层和 Run error，不将已执行标准 SQL 视为自主 Agent 验收。

Agent 层使用本机已登录 Codex CLI，每场景新会话，只提供原始问题、连接和输出列约定。支持 `DORY_EVALUATION_CODEX`、`DORY_EVALUATION_MODEL`、`DORY_EVALUATION_TIMEOUT_MS`（默认每场景240秒）和 `--scenario <id>`。默认沿用用户配置的模型并记录版本；实际模型从 CLI 会话元数据读取，若 CLI 不报告则为 null，不能声称验证了实际模型。模型结果可能非确定性，默认每场景一次，不自动重试。

验收读取 MCP 调用记录及真实持久化 Artifact，检查数值、原始问题、先读取上下文/Knowledge再执行SQL、Run归属、未截断结果和 Finding证据。出现 shell、文件修改、网页搜索或其他 MCP 源时失败；结构化回答自报成功不算证据。尚未自动判定自由文本中的所有推理，报告保留回答供人工查看。

七个场景为 monthly、categories、repeat、delivery、payments、recent、unavailable。最后一个要求逐项解释缺失字段，rows与findings为空。单场景调试结果不满足完整UI验收。

## 自动化、页面与报告

```bash
DORY_OLIST_DATA_DIR=/absolute/olist-evaluation yarn workspace web olist:evaluation:test
yarn workspace web commerce:evaluation:test
yarn workspace web exec tsx --test scripts/tests/semantic-model-context.test.ts scripts/tests/mcp-facade-tools.test.ts
yarn workspace web typecheck
PLAYWRIGHT_BASE_URL=http://localhost:3000 E2E_OLIST_EVALUATION=1 yarn test:e2e tests/e2e/olist-evaluation.spec.ts --project chromium
```

浏览器使用现有登录fixture，用户需能访问seed组织。页面检查没有mock：Knowledge定义、revision、自动Context、Run完成状态、持久化SQL、Finding证据链接、Artifact页面和无指标Run。截图保存在样例目录。现有语义上下文/MCP测试覆盖连接作用域、未验证定义排除、revision独立记录、fail-open和空Findings；它们与真实模型页检查共同构成验收。

`acceptance-results.json` / `acceptance-report.md` 汇总 data、mcp、agent、run-ui；缺少任一层不会显示完整通过。各层报告包含问题、标准/生成SQL、完整预期与实测、Run和ArtifactID、模型revision。CLI轨迹不保存reasoning项或凭据。真实调用失败或断言失败退出非零。Desktop初始为not-run，必须在Desktop实际连接和打开页面后另行记录，Web通过不能证明Desktop通过。
