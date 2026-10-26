import assert from 'node:assert/strict';
import test from 'node:test';
import type { FileUIPart, UIMessage } from 'ai';

import { attachmentLimits, decodeAttachment, prepareAttachmentMessages, validateAttachments, validateAttachmentSizes } from '@/lib/chat-context/attachments';
import { resolveChatOutputIntent } from '@/lib/chat-context/output-intent';
import { chatContextSchema, referenceKey } from '@/lib/chat-context/types';

const textFile = (text: string, filename = 'folder/订单.csv'): FileUIPart => ({
    type: 'file',
    filename,
    mediaType: 'text/csv',
    url: `data:text/csv;base64,${Buffer.from(text).toString('base64')}`,
});
const imageFile: FileUIPart = {
    type: 'file',
    filename: 'chart.png',
    mediaType: 'image/png',
    url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZAAAAABJRU5ErkJggg==',
};

test('text attachments preserve UTF-8 and paths while the original message remains replayable', () => {
    const file = textFile('日期,收入\n2026-10-24,42');
    assert.equal(decodeAttachment(file).text, '日期,收入\n2026-10-24,42');
    const messages: UIMessage[] = [{ id: 'user', role: 'user', parts: [file] }];
    const modelMessages = prepareAttachmentMessages(messages, false);
    assert.equal(messages[0].parts[0].type, 'file');
    assert.equal(modelMessages[0].parts[0].type, 'text');
    assert.match(JSON.stringify(modelMessages), /folder\/订单.csv/);
    assert.match(JSON.stringify(modelMessages), /untrusted data/);
});

test('images retain their bytes for vision providers and are rejected for local text channels', () => {
    validateAttachments([imageFile]);
    assert.throws(() => validateAttachments([imageFile], false), /imagesUnsupported/);
    const messages: UIMessage[] = [{ id: 'user', role: 'user', parts: [imageFile] }];
    assert.deepEqual(prepareAttachmentMessages(messages, true), messages);
    assert.throws(() => decodeAttachment({ ...imageFile, url: 'data:image/png;base64,SGVsbG8=' }), /invalid/);
});

test('unsupported, remote, binary, excessive and malformed attachments are rejected before model execution', () => {
    assert.throws(() => validateAttachments([textFile('data', 'file.pdf')]), /unsupported/);
    assert.throws(() => validateAttachments([{ ...textFile('data'), url: 'http://127.0.0.1/private' }]), /invalid/);
    assert.throws(() => validateAttachments([textFile('data\0')]), /invalid/);
    assert.throws(() => validateAttachments(Array.from({ length: 21 }, () => textFile('x'))), /limit/);
    assert.throws(() => validateAttachmentSizes([{ filename: 'oversized.csv', byteSize: attachmentLimits.textBytes + 1 }]), /limit/);
    assert.doesNotThrow(() => validateAttachments([textFile('中文'.repeat(100_001))]));
    assert.throws(() => validateAttachments([{ ...textFile('x'), url: 'data:text/csv;base64,?' }]), /invalid/);
});

test('references distinguish identical tables across sources and do not imply report output', () => {
    const table = { kind: 'table' as const, title: '订单', table: 'public.orders', schema: 'public', database: 'main', connectionId: 'one' };
    assert.notEqual(referenceKey(table), referenceKey({ ...table, connectionId: 'two' }));
    assert.notEqual(referenceKey(table), referenceKey({ ...table, database: 'analytics' }));
    const context = chatContextSchema.parse({ references: [{ kind: 'report', id: 'existing', title: '收入报告' }] });
    assert.equal(context.outputIntent, 'answer');
    assert.throws(() => chatContextSchema.parse({ references: [{ kind: 'table', title: 'orders' }] }));
});

test('natural-language report requests use the same saving contract as the report composer', () => {
    const context = chatContextSchema.parse({ outputIntent: 'answer' });
    for (const text of [
        '帮我把这个报告保存起来',
        '请把上面的分析生成一份报告',
        '帮我整理一份消费者地域分布报告',
        '把这个结果保存成报告',
        'Please save this report.',
        'Create a report from the analysis above.',
    ]) {
        assert.equal(resolveChatOutputIntent(context, text), 'report', text);
    }
    for (const text of [
        '帮我看看我的消费者都来自哪里',
        '解释一下这个报告',
        '不要生成报告，只回答问题',
        '不用保存报告',
        '报告怎么保存？',
        '对话中创建报告有问题，看起来卡住了',
        '报告保存失败了',
        '如何创建报告',
        'Please do not create a report.',
        'How do I save a report?',
        'Explain why the report failed to save.',
        '> 帮我把这个报告保存起来',
        '这段示例代码是什么意思？\n```text\nCreate a report\n```',
    ]) {
        assert.equal(resolveChatOutputIntent(context, text), 'answer', text);
    }
    assert.equal(resolveChatOutputIntent(context, '帮我把这个报告保存起来', 'open-report'), 'answer');
    assert.equal(resolveChatOutputIntent({ ...context, references: [{ kind: 'report', id: 'existing', title: 'Report' }] }, '请保存报告'), 'answer');
    assert.equal(resolveChatOutputIntent({ ...context, outputIntent: 'report' }, 'Use this answer', 'open-report'), 'report');
});

test('100 MiB per file and 500 MiB per turn are inclusive, independent of character count', () => {
    const file = { filename: 'large.csv', byteSize: 100 * 1024 * 1024 };
    assert.doesNotThrow(() => validateAttachmentSizes(Array.from({ length: 5 }, () => file)));
    assert.throws(() => validateAttachmentSizes([{ ...file, byteSize: file.byteSize + 1 }]), /limit/);
    assert.throws(() => validateAttachmentSizes([...Array.from({ length: 5 }, () => file), { ...file, byteSize: 1 }]), /limit/);
    assert.doesNotThrow(() => validateAttachmentSizes(Array.from({ length: 20 }, () => ({ ...file, byteSize: 1 }))));
    assert.throws(() => validateAttachmentSizes(Array.from({ length: 21 }, () => ({ ...file, byteSize: 1 }))), /limit/);
});

test('automatic queries require an explicit database while discovery remains available', async () => {
    const { applyAnalysisDatabase } = await import('@/lib/work-documents/analysis-scope');
    const scope = { connectionMode: 'auto' as const, connectionIds: ['source'] };
    assert.throws(() => applyAnalysisDatabase(scope, 'dory_run_readonly_sql', { connectionId: 'source', sql: 'select 1' }), /explicit database/);
    assert.deepEqual(applyAnalysisDatabase(scope, 'dory_run_readonly_sql', { connectionId: 'source', database: 'main', sql: 'select 1' }), {
        connectionId: 'source',
        database: 'main',
        sql: 'select 1',
    });
    assert.doesNotThrow(() => applyAnalysisDatabase(scope, 'dory_explore_schema', { connectionId: 'source', operation: 'list_databases' }));
});
