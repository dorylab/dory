# 从数据库生成业务主题文档的试用验收

在测试知识库关联一个电商数据源，选择订单、订单明细、退款和支付表。保留一组有外键的表，以及一组字段同名、没有外键的表。

| 试用资料 | 核对内容 |
| --- | --- |
| 仅选择表 | 逐项对照字段、类型、可空性、主键和外键。有同名字段的表应留下具体的关联问题。 |
| 勾选退款说明 | 确认引用能打开原文，分子和分母能在原文中找到。换一份未勾选的资料，其中的独有定义应不会出现在草案中。 |
| 同时勾选按到账日计算的查询，以及按申请日计算的文档 | 确认两处证据分别出现，查询的过滤条件归属于该查询，日期选择列为待确认问题。 |

让一位未参与生成的同事从目录出发找到订单明细表，指出关联依据，并说出仍需向维护者核实的退款口径。记录找不到答案的位置和错误引用。

## 试用指标

在 Dory 的应用数据库运行以下只读查询。首批耗时按每个知识库第一次成功创建计算。七日使用率的分母是首批创建后已满七天的知识库，分子是这七天内有其他成员打开或引用生成文档的知识库。数据源中的业务行不参与统计。

```sql
WITH first_batch AS (
    SELECT DISTINCT ON (knowledge_model_id) knowledge_model_id, created_at, elapsed_ms
    FROM knowledge_document_batches
    ORDER BY knowledge_model_id, created_at, id
), cohort AS (
    SELECT f.*, EXISTS (
        SELECT 1 FROM knowledge_document_batches b
        WHERE b.knowledge_model_id = f.knowledge_model_id
          AND b.first_peer_use_at >= f.created_at
          AND b.first_peer_use_at < f.created_at + interval '7 days'
    ) AS peer_use
    FROM first_batch f
)
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY elapsed_ms) / 1000 AS median_seconds,
       count(*) FILTER (WHERE created_at <= now() - interval '7 days') AS mature_knowledge_bases,
       avg(peer_use::int) FILTER (WHERE created_at <= now() - interval '7 days') AS seven_day_use_rate
FROM cohort;
```
