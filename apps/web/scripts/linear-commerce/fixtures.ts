import { readFile } from 'node:fs/promises';

export const LINEAR_COMMERCE_PROJECT_NAME = 'Dory 电商知识测试';
export const LINEAR_COMMERCE_MODEL_NAME = '电商';
export const LINEAR_COMMERCE_CONNECTION_NAME = 'Commerce Agent Evaluation';
export const LINEAR_COMMERCE_KEY_NAME = 'Dory Commerce Knowledge Test';
export const LINEAR_COMMERCE_PROJECT_DESCRIPTION = '电商知识首次同步；Commerce Agent Evaluation 合成数据；DORY_LINEAR_COMMERCE_PROJECT_V1';

export const LINEAR_COMMERCE_DOCUMENTS = [
    { fileName: '电商指标口径.md', marker: 'DORY_LINEAR_COMMERCE_METRICS_V1', question: '净收入如何计算？', query: '净收入', answer: 'net_amount - refunded_amount' },
    { fileName: '退款与支付说明.txt', marker: 'DORY_LINEAR_COMMERCE_PAYMENTS_V1', question: '支付成功率如何计数？', query: '支付成功率', answer: '每次重试都是独立支付尝试' },
    { fileName: '运营日历与异常说明.md', marker: 'DORY_LINEAR_COMMERCE_CALENDAR_V1', question: '统计使用什么时区？', query: '统计时区', answer: '统计时区为 UTC' },
] as const;

export async function loadLinearCommerceFixtures() {
    const directory = new URL('../../../../tests/fixtures/linear-commerce/', import.meta.url);
    return {
        projectName: LINEAR_COMMERCE_PROJECT_NAME,
        projectDescription: LINEAR_COMMERCE_PROJECT_DESCRIPTION,
        projectContent: await readFile(new URL('项目说明.md', directory), 'utf8'),
        documents: await Promise.all(LINEAR_COMMERCE_DOCUMENTS.map(async spec => ({ ...spec, content: await readFile(new URL(spec.fileName, directory), 'utf8') }))),
    };
}
