import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';

// 深色主题
export const studioPrismDarkTheme: SyntaxHighlighterProps['style'] = {
    'code[class*="language-"]': {
        display: 'block',
        background: 'transparent',
        color: '#EFEFF0',
        padding: 0,
        overflowY: 'hidden',
        fontFamily: 'var(--font-mono, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
        fontSize: '11px',
        textShadow: 'none',
    },
    'pre[class*="language-"]': {
        display: 'block',
        background: 'transparent',
        color: '#EFEFF0',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        textShadow: 'none',
    },

    comment: { color: '#969896' },
    'block-comment': { color: '#969896' },
    prolog: { color: '#969896' },
    doctype: { color: '#969896' },
    cdata: { color: '#969896' },

    variable: { color: '#EFEFF0' },

    bold: { color: '#df5000', fontWeight: 'bold' },
    italic: { color: '#df5000', fontStyle: 'italic' },
    quote: { color: '#df5000' },

    keyword: { color: '#608DFF' },
    control: { color: '#608DFF' },
    directive: { color: '#608DFF' },

    selector: { color: '#FF7D00' },
    tag: { color: '#608DFF' },

    // SQL 类型 / 内建 / 函数
    type: { color: '#00B42A' },
    'class-name': { color: '#00B42A' },
    builtin: { color: '#00B42A' },
    function: { color: '#00B42A' },

    boolean: { color: '#EFEFF0' },
    constant: { color: '#EFEFF0' },
    symbol: { color: '#EFEFF0' },
    bullet: { color: '#EFEFF0' },

    'function-name': { color: '#63a35c' },

    'attr-value': { color: '#7BE188' },

    inserted: {
        color: '#55a532',
        backgroundColor: '#eaffea',
    },
    deleted: {
        color: '#bd2c00',
        backgroundColor: '#ffecec',
    },

    url: {
        textDecoration: 'underline',
    },

    number: { color: '#95B3FF' },
    string: { color: '#95B3FF' },

    punctuation: { color: '#EFEFF0' },

    important: { fontWeight: 'bold' },
};

// 浅色主题
export const studioPrismLightTheme: SyntaxHighlighterProps['style'] = {
    'code[class*="language-"]': {
        display: 'block',
        background: 'transparent',
        color: '#1F1F26',
        padding: 0,
        overflowY: 'hidden',
        fontFamily: 'var(--font-mono, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
        fontSize: '11px',
        textShadow: 'none',
    },
    'pre[class*="language-"]': {
        display: 'block',
        background: 'transparent',
        color: '#1F1F26',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        textShadow: 'none',
    },

    // 注释
    comment: { color: '#969896' },
    'block-comment': { color: '#969896' },
    prolog: { color: '#969896' },
    doctype: { color: '#969896' },
    cdata: { color: '#969896' },

    // 普通标识符
    variable: { color: '#1F1F26' },

    // 粗体 / 斜体 / 引用
    bold: { color: '#df5000', fontWeight: 'bold' },
    italic: { color: '#df5000', fontStyle: 'italic' },
    quote: { color: '#df5000' },

    // 关键字（SELECT / FROM / WHERE / ENGINE / ORDER BY 等）
    keyword: { color: '#0065FD' },
    control: { color: '#0065FD' },
    directive: { color: '#0065FD' },

    // selector/tag 用在少数场景，这里保持你原来的颜色
    selector: { color: '#FF7D00' },
    tag: { color: '#0065FD' },

    // ——❗这里开始是 SQL 类型 / 函数 / 内建——
    // 类型（Int64 / Float32 / Nullable / Enum8 / MergeTree 常会落在这些 token 里）
    type: { color: '#00B42A' },
    'class-name': { color: '#00B42A' }, // 有些 grammar 把类型当 class-name
    builtin: { color: '#00B42A' }, // 有些当 builtin
    function: { color: '#00B42A' }, // Nullable(...) / toDate(...) 之类

    // 布尔 / 常量之类
    boolean: { color: '#1F1F26' },
    constant: { color: '#1F1F26' },
    symbol: { color: '#1F1F26' },
    bullet: { color: '#1F1F26' },

    // 函数名 / section 也给一点颜色（次要）
    'function-name': { color: '#63a35c' },

    // 属性值（在别的语言里用得多，先沿用你原来的绿色）
    'attr-value': { color: '#7BE188' },

    // 增删 diff
    inserted: {
        color: '#55a532',
        backgroundColor: '#eaffea',
    },
    deleted: {
        color: '#bd2c00',
        backgroundColor: '#ffecec',
    },

    url: {
        textDecoration: 'underline',
    },

    // 数字 / 字符串
    number: { color: '#0065FD' },
    string: { color: '#0065FD' },

    // 标点
    punctuation: { color: '#1F1F26' },

    important: { fontWeight: 'bold' },
};
