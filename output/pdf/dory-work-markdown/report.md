# 双源月度订单 · Markdown 验收

v9 · 2026-10-23T04:47:44.184Z

## 摘要

本报告对比分析两个独立数据源（Demo Database 和 Commerce Agent Evaluation）的月度订单数量。二者结构与业务语义不同，不可加总或混用。

## Demo Database

- **时间范围**：2025-01 至 2026-03（共 15 个月）
- **总订单数**：1,000 来源 [1]

## Commerce Agent Evaluation

- **时间范围**：2025-01 至 2026-06（共 18 个月）
- **总订单数**：8,000 来源 [2]

## 趋势图表

### 人工复核备注：两个数据源独立展示，不可合计；此备注须在后续版本中保留。



### Demo Database 月度订单趋势

![Demo Database 月度订单趋势](assets/vis_01a166e1-2f4e-72c5-9c1f-8b3c7f4a5e6d.svg)

### Commerce Agent Evaluation 月度订单趋势

![Commerce Agent Evaluation 月度订单趋势](assets/vis_01a166e1-3a8c-75b9-b0a2-4d7e9f1b2c8e.svg)

## 原始结果表

### Demo Database 订单明细

| month | order\_count |
| --- | --- |
| 2025-01 | 77 |
| 2025-02 | 53 |
| 2025-03 | 73 |
| 2025-04 | 74 |
| 2025-05 | 70 |
| 2025-06 | 62 |
| 2025-07 | 76 |
| 2025-08 | 58 |
| 2025-09 | 85 |
| 2025-10 | 76 |
| 2025-11 | 51 |
| 2025-12 | 57 |
| 2026-01 | 69 |
| 2026-02 | 54 |
| 2026-03 | 65 |

### Commerce Agent Evaluation 订单明细


| month | order\_count |
| --- | --- |
| 2025-01 | 423 |
| 2025-02 | 427 |
| 2025-03 | 494 |
| 2025-04 | 408 |
| 2025-05 | 473 |
| 2025-06 | 449 |
| 2025-07 | 455 |
| 2025-08 | 475 |
| 2025-09 | 422 |
| 2025-10 | 440 |
| 2025-11 | 441 |
| 2025-12 | 435 |
| 2026-01 | 472 |
| 2026-02 | 357 |
| 2026-03 | 475 |
| 2026-04 | 445 |
| 2026-05 | 460 |
| 2026-06 | 449 |
## 说明

- 两个数据源独立建模：Demo Database 的 `orders` 表含 `created_at` 字段，Commerce Agent Evaluation 的 `orders` 表含 `ordered_at` 字段，字段含义与粒度不一致；
- 两套数据无主外键关联，不可 JOIN 或合并统计；
- 所有图表与表格均基于真实查询结果生成，已作为证据存档。

## 补充分析：最新月环比

- **Demo Database**：2026-03 月订单数为 65 单，较 2026-02 月（54 单）环比增长 20.37% 来源 [3]；
- **Commerce Agent Evaluation**：2026-06 月订单数为 449 单，较 2026-05 月（460 单）环比下降 2.39% 来源 [4]；
- 两套数据时间窗口与字段语义不同（`created_at` vs `ordered_at`），不可加总或横向比较。

## Sources / 来源

1. Demo Database — Orders — total orders — 2026-10-23T03:52:51.548Z
2. Commerce Agent Evaluation — Orders — total orders — 2026-10-23T03:52:54.436Z
3. Demo Database — Orders — month, order count — 2026-10-23T03:53:00.991Z
4. Commerce Agent Evaluation — Orders — month, order count — 2026-10-23T03:53:06.304Z
5. Demo Database — Orders — month, order count — 2026-10-23T03:49:47.611Z
6. Commerce Agent Evaluation — Orders — month, order count — 2026-10-23T03:49:51.745Z
