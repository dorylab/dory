import assert from 'node:assert/strict';

import type { KnowledgeDefinition, OssieCustomExtension, OssieDocument } from '@dory/database/postgres/schemas';
import { OSSIE_VERSION } from '@dory/shared/types/ossie';

export const OLIST_CONNECTION_NAME = 'Olist Commerce Evaluation';
export const OLIST_KNOWLEDGE_NAME = 'Olist Commerce Knowledge';
export type EvaluationRow = Record<string, string | number | null>;
export type EvaluationLayer = 'data' | 'knowledge' | 'context' | 'sql' | 'artifact' | 'run-ui' | 'agent';
export type OlistScenario = { id: string; title: string; question: string; sql: string; semanticNames: string[]; columns: string[]; unavailable?: boolean };

export const OLIST_TABLES: Record<string, { fields: string; keys: string[]; description: string }> = {
    orders: {
        fields: 'source_row order_id customer_id order_status order_purchase_timestamp order_approved_at order_delivered_carrier_date order_delivered_customer_date order_estimated_delivery_date',
        keys: ['order_id'],
        description: '每订单一行；成交指标仅包含 delivered。时间为原始无时区时间，禁止擅自转为 UTC。',
    },
    customers: {
        fields: 'source_row customer_id customer_unique_id customer_zip_code_prefix customer_city customer_state',
        keys: ['customer_id'],
        description: 'customer_id 是订单关联标识，customer_unique_id 才是复购的稳定客户标识。',
    },
    order_items: {
        fields: 'source_row order_id order_item_id product_id seller_id shipping_limit_date price freight_value price_cents freight_value_cents',
        keys: ['order_id', 'order_item_id'],
        description: '每订单商品行一行；一行代表一件商品。金额用 *_cents 整数分。商品价格不含运费。',
    },
    payments: {
        fields: 'source_row order_id payment_sequential payment_type payment_installments payment_value payment_value_cents',
        keys: ['order_id', 'payment_sequential'],
        description: '每支付记录一行；一个订单可能多笔支付。没有支付失败或尝试状态，不能计算支付成功率。',
    },
    products: {
        fields: 'source_row product_id product_category_name product_name_lenght product_description_lenght product_photos_qty product_weight_g product_length_cm product_height_cm product_width_cm',
        keys: ['product_id'],
        description: '每商品一行；缺失品类记为 unknown，无翻译时保留原始品类。',
    },
    sellers: { fields: 'source_row seller_id seller_zip_code_prefix seller_city seller_state', keys: ['seller_id'], description: '每卖家一行。' },
    reviews: {
        fields: 'source_row review_id order_id review_score review_comment_title review_comment_message review_creation_date review_answer_timestamp',
        keys: ['source_row'],
        description: '原始评价全部保留，review_id 可能重复；同一订单的多条评价不能直接放大订单指标。',
    },
    category_translation: {
        fields: 'source_row product_category_name product_category_name_english',
        keys: ['product_category_name'],
        description: '葡萄牙语品类到英语品类映射。',
    },
    geolocation: {
        fields: 'source_row geolocation_zip_code_prefix geolocation_lat geolocation_lng geolocation_city geolocation_state',
        keys: ['source_row'],
        description: '邮编可能重复，不可直接关联订单计算金额；首版验收不使用地理坐标。',
    },
};

function extension(connectionId: string, id: string, kind: KnowledgeDefinition['kind']): OssieCustomExtension[] {
    return [{ vendor_name: 'COMMON', data: JSON.stringify({ dory: { id, kind, status: 'verified', sourceConnectionId: connectionId } }) }];
}

const METRICS = [
    ['merchandise_amount', 'SUM(order_items.price_cents)', '成交商品额；仅 delivered；BRL 分，不含运费。', ['成交商品额', '成交额', 'GMV', '品类成交额']],
    ['delivered_order_count', 'COUNT(DISTINCT orders.order_id)', '成交订单数；仅 delivered；在订单粒度计数，包含没有明细的订单。', ['订单数', '成交订单数']],
    [
        'merchandise_aov',
        'SUM(order_items.price_cents) * 1.0 / NULLIF(COUNT(DISTINCT orders.order_id), 0)',
        '商品客单价；成交商品额分除以 delivered 订单数，订单先聚合，不能把运费算入。',
        ['客单价', 'AOV'],
    ],
    [
        'repeat_purchase_rate',
        'SUM(CASE WHEN delivered_order_count >= 2 THEN 1.0 ELSE 0.0 END) / NULLIF(COUNT(*), 0)',
        '复购率；全数据时间范围中，有至少两笔 delivered 订单的稳定客户数 / 至少一笔的客户数。按客户首笔 delivered 订单所在州归属；同时间按 order_id 升序打破平局。',
        ['复购率', '州客户复购'],
    ],
    [
        'late_delivery_rate',
        'AVG(CASE WHEN DATE(orders.order_delivered_customer_date) > DATE(orders.order_estimated_delivery_date) THEN 1.0 ELSE 0.0 END)',
        '迟到率；下单在指定期、delivered、送达和预计日期均有效的订单；只比较日期，预计当天送达不算迟到。',
        ['迟到率', '送达', '配送'],
    ],
    [
        'payment_amount',
        'SUM(payments.payment_value_cents)',
        '支付金额；仅关联 delivered 订单，包含运费；按支付方式保留每笔支付，不是订单数或支付成功率。',
        ['支付金额', '支付方式', '支付占比'],
    ],
    [
        'recent_order_count',
        'COUNT(orders.order_id)',
        '最近订单数；全部状态；按明确 as-of 日期的最近7个日历日包含当日，不得用历史数据最后一天替代当前日期。',
        ['最近', '最近7天', '订单情况'],
    ],
    ['latest_order_time', 'MAX(orders.order_purchase_timestamp)', '全表最新下单时间，保留原始无时区值。', ['最新数据时间', '最新订单时间']],
] as const;

export function buildOlistOssieDocument(connectionId: string, timeRange: { min: string; max: string }): OssieDocument {
    const relationships = [
        ['orders_customer', 'orders', 'customers', 'customer_id', 'customer_id'],
        ['items_order', 'order_items', 'orders', 'order_id', 'order_id'],
        ['items_product', 'order_items', 'products', 'product_id', 'product_id'],
        ['items_seller', 'order_items', 'sellers', 'seller_id', 'seller_id'],
        ['payments_order', 'payments', 'orders', 'order_id', 'order_id'],
        ['reviews_order', 'reviews', 'orders', 'order_id', 'order_id'],
        ['product_category', 'products', 'category_translation', 'product_category_name', 'product_category_name'],
    ];
    return {
        version: OSSIE_VERSION,
        name: OLIST_KNOWLEDGE_NAME,
        description: 'Official Olist v2 historical commerce evaluation; BRL, source-native timestamps.',
        ai_context: {
            instructions: `数据时间 ${timeRange.min} 至 ${timeRange.max}。历史数据不能代表当前业务。金额用整数分计算、展示时除100；币种BRL。时间无时区，保持源值。成交指标只包含delivered。订单、商品明细、支付有不同粒度：先分别聚合再关联，禁止直接连接明细和支付造成放大。按指定下单日期归属，不按送达日期归属。退款率、净利润、支付成功率不可计算：缺少退款金额、成本及支付尝试/结果字段，取消率不能代替退款率。没有SQL分析时findings必须为空。`,
            synonyms: ['电商', 'Olist', '订单', '成交', '复购', '支付', '配送'],
        },
        datasets: Object.entries(OLIST_TABLES).map(([name, spec]) => ({
            name,
            source: name,
            primary_key: spec.keys,
            description: spec.description,
            custom_extensions: extension(connectionId, `entity:${name}`, 'entity'),
            fields: spec.fields.split(' ').map(field => ({
                name: field,
                expression: { dialects: [{ dialect: 'ANSI_SQL', expression: `${name}.${field}` }] },
                ...(field.includes('timestamp') || field.endsWith('_date') || field === 'order_approved_at' ? { dimension: { is_time: true } } : {}),
                custom_extensions: extension(connectionId, `dimension:${name}:${field}`, 'dimension'),
            })),
        })),
        metrics: METRICS.map(([name, expression, description, synonyms]) => ({
            name,
            description,
            expression: { dialects: [{ dialect: 'ANSI_SQL', expression }] },
            ai_context: { synonyms: [...synonyms], instructions: description },
            custom_extensions: extension(connectionId, `metric:${name}`, 'metric'),
        })),
        relationships: relationships.map(([name, from, to, fromColumn, toColumn]) => ({
            name,
            from,
            to,
            from_columns: [fromColumn],
            to_columns: [toColumn],
            ai_context: { instructions: '从左侧多行到右侧一行；先检查关联覆盖率和粒度。' },
            custom_extensions: extension(connectionId, `relationship:${name}`, 'relationship'),
        })),
    };
}

export function olistScenarios(asOf: string): OlistScenario[] {
    assert.match(asOf, /^\d{4}-\d{2}-\d{2}$/);
    const date = new Date(`${asOf}T00:00:00Z`);
    assert.equal(date.toISOString().slice(0, 10), asOf, 'Invalid as-of date');
    const start = new Date(date.getTime() - 6 * 86400000).toISOString().slice(0, 10);
    const end = new Date(date.getTime() + 86400000).toISOString().slice(0, 10);
    return [
        {
            id: 'monthly',
            title: '月度成交与客单价',
            question: '2018年1至8月每月成交商品额、成交订单数和商品客单价是多少？',
            semanticNames: ['merchandise_amount', 'delivered_order_count', 'merchandise_aov'],
            columns: ['month', 'merchandise_cents', 'order_count', 'aov_cents'],
            sql: `WITH item_totals AS (SELECT order_id, SUM(price_cents) amount FROM order_items GROUP BY order_id) SELECT substr(o.order_purchase_timestamp,1,7) month, SUM(COALESCE(i.amount,0)) merchandise_cents, COUNT(*) order_count, 1.0*SUM(COALESCE(i.amount,0))/COUNT(*) aov_cents FROM orders o LEFT JOIN item_totals i ON i.order_id=o.order_id WHERE o.order_status='delivered' AND o.order_purchase_timestamp>='2018-01-01' AND o.order_purchase_timestamp<'2018-09-01' GROUP BY 1 ORDER BY 1`,
        },
        {
            id: 'categories',
            title: '商品品类成交额',
            question: '2018年8月成交商品额最高的10个商品品类有哪些？显示英语品类，缺少翻译保留原名，缺失品类保留unknown。',
            semanticNames: ['merchandise_amount', 'items_order', 'items_product', 'product_category'],
            columns: ['category', 'merchandise_cents'],
            sql: `SELECT COALESCE(t.product_category_name_english,p.product_category_name,'unknown') category, SUM(i.price_cents) merchandise_cents FROM order_items i JOIN orders o ON o.order_id=i.order_id LEFT JOIN products p ON p.product_id=i.product_id LEFT JOIN category_translation t ON t.product_category_name=p.product_category_name WHERE o.order_status='delivered' AND o.order_purchase_timestamp>='2018-08-01' AND o.order_purchase_timestamp<'2018-09-01' GROUP BY 1 ORDER BY merchandise_cents DESC, category LIMIT 10`,
        },
        {
            id: 'repeat',
            title: '各州客户复购率',
            question: '全数据时间范围各州客户复购率是多少？列出购买客户数、复购客户数和比例，按客户首笔成交订单所在州归属。',
            semanticNames: ['repeat_purchase_rate', 'orders_customer'],
            columns: ['state', 'purchasing_customers', 'repeat_customers', 'repeat_rate'],
            sql: `WITH purchases AS (SELECT c.customer_unique_id, COALESCE(c.customer_state,'unknown') state, ROW_NUMBER() OVER (PARTITION BY c.customer_unique_id ORDER BY o.order_purchase_timestamp,o.order_id) rn, COUNT(*) OVER (PARTITION BY c.customer_unique_id) n FROM orders o JOIN customers c ON c.customer_id=o.customer_id WHERE o.order_status='delivered' AND c.customer_unique_id IS NOT NULL) SELECT state, COUNT(*) purchasing_customers, SUM(CASE WHEN n>=2 THEN 1 ELSE 0 END) repeat_customers, AVG(CASE WHEN n>=2 THEN 1.0 ELSE 0.0 END) repeat_rate FROM purchases WHERE rn=1 GROUP BY state ORDER BY state`,
        },
        {
            id: 'delivery',
            title: '送达订单迟到率',
            question: '2018年8月下单的已送达订单迟到率是多少？列出日期有效的订单数、迟到订单数和比例。',
            semanticNames: ['late_delivery_rate'],
            columns: ['eligible_orders', 'late_orders', 'late_rate'],
            sql: `SELECT COUNT(*) eligible_orders, COALESCE(SUM(CASE WHEN DATE(order_delivered_customer_date)>DATE(order_estimated_delivery_date) THEN 1 ELSE 0 END),0) late_orders, AVG(CASE WHEN DATE(order_delivered_customer_date)>DATE(order_estimated_delivery_date) THEN 1.0 ELSE 0.0 END) late_rate FROM orders WHERE order_status='delivered' AND order_purchase_timestamp>='2018-08-01' AND order_purchase_timestamp<'2018-09-01' AND DATE(order_delivered_customer_date) IS NOT NULL AND DATE(order_estimated_delivery_date) IS NOT NULL`,
        },
        {
            id: 'payments',
            title: '支付方式金额占比',
            question: '全数据时间范围各支付方式在已成交订单中的支付金额和金额占比是多少？',
            semanticNames: ['payment_amount', 'payments_order'],
            columns: ['payment_type', 'payment_cents', 'payment_share'],
            sql: `WITH totals AS (SELECT p.payment_type, SUM(p.payment_value_cents) payment_cents FROM payments p JOIN orders o ON o.order_id=p.order_id WHERE o.order_status='delivered' GROUP BY p.payment_type) SELECT payment_type, payment_cents, 1.0*payment_cents/NULLIF(SUM(payment_cents) OVER (),0) payment_share FROM totals ORDER BY payment_type`,
        },
        {
            id: 'recent',
            title: '近期订单与数据时间',
            question: `以${asOf}为当前日期，包含当日的最近7个日历日订单数是多少？最新订单时间是什么？说明数据时效，保留源时间值。`,
            semanticNames: ['recent_order_count', 'latest_order_time'],
            columns: ['order_count', 'latest_order'],
            sql: `SELECT SUM(CASE WHEN order_purchase_timestamp>='${start}' AND order_purchase_timestamp<'${end}' THEN 1 ELSE 0 END) order_count, MAX(order_purchase_timestamp) latest_order FROM orders`,
        },
        {
            id: 'unavailable',
            title: '缺失指标可计算性',
            question: '全数据时间范围的退款率、净利润和支付成功率是多少？缺少必要字段时分别说明原因，不能用其他指标替代。',
            semanticNames: [],
            columns: [],
            sql: '',
            unavailable: true,
        },
    ];
}

export function assertEvaluationRows(actual: unknown, expected: EvaluationRow[]) {
    assert.ok(Array.isArray(actual), 'Expected result rows');
    assert.equal(actual.length, expected.length, 'Result row count differs');
    const sortKey = (row: EvaluationRow) =>
        Object.entries(row)
            .filter(([, value]) => typeof value === 'string')
            .map(([key, value]) => `${key}:${value}`)
            .join('|');
    const wanted = [...expected].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const got = [...actual].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    wanted.forEach((row, index) => {
        assert.deepEqual(Object.keys(got[index]).sort(), Object.keys(row).sort(), 'Columns differ');
        for (const [key, value] of Object.entries(row)) {
            const cell: unknown = got[index][key];
            if (typeof value === 'number') {
                assert.ok(typeof cell === 'number' || (typeof cell === 'string' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(cell)), `Invalid numeric cell ${key}`);
                const numeric = Number(cell);
                const exact = (key.endsWith('_cents') && key !== 'aov_cents') || key.endsWith('_count') || key.endsWith('_orders') || key.endsWith('_customers');
                assert.ok(Number.isFinite(numeric) && (exact ? numeric === value : Math.abs(numeric - value) <= 1e-6), `${key}: expected ${value}, got ${cell}`);
            } else assert.equal(cell, value, `${key} differs`);
        }
    });
}
