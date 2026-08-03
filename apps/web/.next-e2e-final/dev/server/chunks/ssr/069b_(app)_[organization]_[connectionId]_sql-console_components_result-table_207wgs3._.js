module.exports = [
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ColumnFilterPopover",
    ()=>ColumnFilterPopover
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
// ColumnFilter.tsx
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/web-utils/src/index.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/input.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$funnel$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Filter$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/funnel.js [app-ssr] (ecmascript) <export default as Filter>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/x.js [app-ssr] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/popover.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/select.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/label.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
;
;
function normType(t) {
    return (t ?? '').toLowerCase().replace(/\s+/g, '');
}
function mapDbTypeToKind(dbType) {
    const t = normType(dbType);
    if (!t) return;
    // boolean
    if (/(bool|boolean|uint1|bit\(1\)|tinyint\(1\))/.test(t)) return 'boolean';
    // number
    if (/(^|[^a-z])(int|integer|bigint|smallint|tinyint|float|double|decimal|numeric|real|money|serial|u?int\d*)([^a-z]|$)/.test(t)) return 'number';
    // date/time
    if (/(date|datetime|timestamp|time|year)/.test(t)) return 'date';
    if (/(char|text|uuid|json|map|array|tuple|object|string|variant)/.test(t)) return 'string';
    return;
}
const ColumnFilterPopover = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"])((props, ref)=>{
    const { column, draft, setDraft, existing, onApply, onRemove, columns, externalAnchor, externalOpenSignal } = props;
    const triggerBtnRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])('SqlConsole');
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useImperativeHandle"])(ref, ()=>triggerBtnRef.current);
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const effectiveKind = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const colMeta = columns.find((c)=>c.name === column);
        const k = mapDbTypeToKind(colMeta?.type);
        return k ?? 'string';
    }, [
        columns,
        column
    ]);
    const ops = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (effectiveKind === 'number') {
            return [
                {
                    v: 'eq',
                    label: '='
                },
                {
                    v: 'ne',
                    label: '≠'
                },
                {
                    v: 'gt',
                    label: '>'
                },
                {
                    v: 'ge',
                    label: '≥'
                },
                {
                    v: 'lt',
                    label: '<'
                },
                {
                    v: 'le',
                    label: '≤'
                }
            ];
        }
        if (effectiveKind === 'boolean') {
            return [
                {
                    v: 'isTrue',
                    label: t('VTable.Filter.Op.IsTrue')
                },
                {
                    v: 'isFalse',
                    label: t('VTable.Filter.Op.IsFalse')
                }
            ];
        }
        if (effectiveKind === 'date') {
            return [
                {
                    v: 'on',
                    label: t('VTable.Filter.Op.On')
                },
                {
                    v: 'before',
                    label: t('VTable.Filter.Op.Before')
                },
                {
                    v: 'after',
                    label: t('VTable.Filter.Op.After')
                },
                {
                    v: 'empty',
                    label: t('VTable.Filter.Op.Empty')
                },
                {
                    v: 'notEmpty',
                    label: t('VTable.Filter.Op.NotEmpty')
                }
            ];
        }
        // string
        return [
            {
                v: 'contains',
                label: t('VTable.Filter.Op.Contains')
            },
            {
                v: 'equals',
                label: t('VTable.Filter.Op.Equals')
            },
            {
                v: 'startsWith',
                label: t('VTable.Filter.Op.StartsWith')
            },
            {
                v: 'endsWith',
                label: t('VTable.Filter.Op.EndsWith')
            },
            {
                v: 'empty',
                label: t('VTable.Filter.Op.Empty')
            },
            {
                v: 'notEmpty',
                label: t('VTable.Filter.Op.NotEmpty')
            },
            {
                v: 'regex',
                label: t('VTable.Filter.Op.Regex')
            }
        ];
    }, [
        effectiveKind,
        t
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const cur = String(draft.op);
        const allowed = ops.map((o)=>o.v);
        if (!allowed.includes(cur)) {
            setDraft((p)=>({
                    ...p,
                    op: ops[0].v
                }));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        effectiveKind
    ]);
    const showValueInput = ![
        'empty',
        'notEmpty',
        'isTrue',
        'isFalse'
    ].includes(String(draft.op)) && effectiveKind !== 'boolean';
    const inputType = effectiveKind === 'number' ? 'number' : effectiveKind === 'date' ? 'date' : 'text';
    function defaultOpForKind(k) {
        return k === 'number' ? 'eq' : 'contains';
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!externalAnchor) return;
        if (existing && existing.col === column) {
            setDraft((p)=>({
                    ...p,
                    col: existing.col,
                    kind: existing.kind === 'number' ? 'number' : 'string',
                    op: existing.op,
                    value: existing.value ?? '',
                    cs: !!existing.caseSensitive
                }));
        } else {
            const mappedKind = effectiveKind === 'number' ? 'number' : 'string';
            setDraft((p)=>({
                    ...p,
                    col: column,
                    kind: mappedKind
                }));
        }
        setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        externalAnchor,
        externalOpenSignal
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Popover"], {
        open: open,
        onOpenChange: setOpen,
        children: [
            externalAnchor && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PopoverAnchor"], {
                virtualRef: {
                    current: externalAnchor
                }
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                lineNumber: 153,
                columnNumber: 32
            }, ("TURBOPACK compile-time value", void 0)),
            !externalAnchor && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PopoverTrigger"], {
                asChild: true,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    ref: triggerBtnRef,
                    type: "button",
                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('mr-1 inline-flex items-center justify-center rounded p-1 hover:bg-white/10', existing && 'bg-white/10'),
                    onClick: ()=>{
                        const mappedKind = effectiveKind === 'number' ? 'number' : 'string';
                        if (existing && existing.col === column) {
                            setDraft((p)=>({
                                    ...p,
                                    col: existing.col,
                                    kind: mappedKind,
                                    op: existing.op,
                                    value: existing.value ?? '',
                                    cs: !!existing.caseSensitive
                                }));
                        } else {
                            setDraft((p)=>({
                                    ...p,
                                    col: column,
                                    kind: mappedKind,
                                    op: defaultOpForKind(effectiveKind),
                                    value: '',
                                    cs: false
                                }));
                        }
                        setOpen(true);
                    },
                    title: t('VTable.Filter.Title'),
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$funnel$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Filter$3e$__["Filter"], {
                        className: "h-3.5 w-3.5"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                        lineNumber: 192,
                        columnNumber: 25
                    }, ("TURBOPACK compile-time value", void 0))
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                    lineNumber: 158,
                    columnNumber: 21
                }, ("TURBOPACK compile-time value", void 0))
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                lineNumber: 157,
                columnNumber: 17
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PopoverContent"], {
                align: "start",
                side: "bottom",
                className: "w-80",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-3",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center justify-between",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-sm font-medium",
                                    children: t('VTable.Filter.TitleWithColumn', {
                                        column
                                    })
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                    lineNumber: 200,
                                    columnNumber: 25
                                }, ("TURBOPACK compile-time value", void 0)),
                                existing && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                    variant: "ghost",
                                    size: "sm",
                                    onClick: ()=>{
                                        onRemove(column);
                                        setOpen(false);
                                    },
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                            className: "h-4 w-4 mr-1"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                            lineNumber: 210,
                                            columnNumber: 33
                                        }, ("TURBOPACK compile-time value", void 0)),
                                        t('VTable.Filter.Remove')
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                    lineNumber: 202,
                                    columnNumber: 29
                                }, ("TURBOPACK compile-time value", void 0))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                            lineNumber: 199,
                            columnNumber: 21
                        }, ("TURBOPACK compile-time value", void 0)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Label"], {
                                    children: t('VTable.Filter.Operator')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                    lineNumber: 218,
                                    columnNumber: 25
                                }, ("TURBOPACK compile-time value", void 0)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Select"], {
                                    value: String(draft.op),
                                    onValueChange: (v)=>setDraft((p)=>({
                                                ...p,
                                                op: v
                                            })),
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SelectTrigger"], {
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SelectValue"], {}, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                                lineNumber: 221,
                                                columnNumber: 33
                                            }, ("TURBOPACK compile-time value", void 0))
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                            lineNumber: 220,
                                            columnNumber: 29
                                        }, ("TURBOPACK compile-time value", void 0)),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SelectContent"], {
                                            children: ops.map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SelectItem"], {
                                                    value: o.v,
                                                    children: o.label
                                                }, o.v, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                                    lineNumber: 225,
                                                    columnNumber: 37
                                                }, ("TURBOPACK compile-time value", void 0)))
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                            lineNumber: 223,
                                            columnNumber: 29
                                        }, ("TURBOPACK compile-time value", void 0))
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                    lineNumber: 219,
                                    columnNumber: 25
                                }, ("TURBOPACK compile-time value", void 0))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                            lineNumber: 217,
                            columnNumber: 21
                        }, ("TURBOPACK compile-time value", void 0)),
                        showValueInput && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-1",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Label"], {
                                            children: t('VTable.Filter.Value')
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                            lineNumber: 237,
                                            columnNumber: 33
                                        }, ("TURBOPACK compile-time value", void 0)),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Input"], {
                                            type: inputType,
                                            value: draft.value ?? '',
                                            onChange: (e)=>setDraft((p)=>({
                                                        ...p,
                                                        value: e.target.value
                                                    })),
                                            placeholder: effectiveKind === 'date' ? t('VTable.Filter.PlaceholderDate') : t('VTable.Filter.PlaceholderText')
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                            lineNumber: 238,
                                            columnNumber: 33
                                        }, ("TURBOPACK compile-time value", void 0))
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                    lineNumber: 236,
                                    columnNumber: 29
                                }, ("TURBOPACK compile-time value", void 0)),
                                (effectiveKind === 'string' || effectiveKind === 'date') && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                            id: `cs-${column}`,
                                            type: "checkbox",
                                            className: "h-4 w-4",
                                            checked: !!draft.cs,
                                            onChange: (e)=>setDraft((p)=>({
                                                        ...p,
                                                        cs: e.target.checked
                                                    }))
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                            lineNumber: 249,
                                            columnNumber: 37
                                        }, ("TURBOPACK compile-time value", void 0)),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$label$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Label"], {
                                            htmlFor: `cs-${column}`,
                                            children: t('VTable.Filter.CaseSensitive')
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                            lineNumber: 256,
                                            columnNumber: 37
                                        }, ("TURBOPACK compile-time value", void 0))
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                    lineNumber: 248,
                                    columnNumber: 33
                                }, ("TURBOPACK compile-time value", void 0))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                            lineNumber: 235,
                            columnNumber: 25
                        }, ("TURBOPACK compile-time value", void 0)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex justify-end gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                    variant: "outline",
                                    size: "sm",
                                    onClick: ()=>setOpen(false),
                                    children: t('VTable.Filter.Cancel')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                    lineNumber: 263,
                                    columnNumber: 25
                                }, ("TURBOPACK compile-time value", void 0)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                    size: "sm",
                                    onClick: ()=>{
                                        onApply();
                                        setOpen(false);
                                    },
                                    children: t('VTable.Filter.Apply')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                                    lineNumber: 266,
                                    columnNumber: 25
                                }, ("TURBOPACK compile-time value", void 0))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                            lineNumber: 262,
                            columnNumber: 21
                        }, ("TURBOPACK compile-time value", void 0))
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                    lineNumber: 198,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0))
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
                lineNumber: 197,
                columnNumber: 13
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx",
        lineNumber: 151,
        columnNumber: 9
    }, ("TURBOPACK compile-time value", void 0));
});
ColumnFilterPopover.displayName = 'ColumnFilterPopover';
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/type.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ck",
    ()=>ck,
    "parseCK",
    ()=>parseCK
]);
const ck = (row, col)=>`${row}@@${col}`;
const parseCK = (k)=>{
    const [r, c] = k.split('@@');
    return {
        row: Number(r),
        col: c
    };
};
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/utils.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* ---------- utils ---------- */ __turbopack_context__.s([
    "formatTooltip",
    ()=>formatTooltip,
    "formatValue",
    ()=>formatValue
]);
function formatValue(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}
function formatTooltip(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
        try {
            return JSON.stringify(v);
        } catch  {
            return '[object]';
        }
    }
    return String(v);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/filter.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildEqualsFilterFromCell",
    ()=>buildEqualsFilterFromCell,
    "mapDbTypeToTwoKinds",
    ()=>mapDbTypeToTwoKinds,
    "normType",
    ()=>normType
]);
"use client";
function normType(t) {
    return (t ?? '').toLowerCase().replace(/\s+/g, '');
}
function mapDbTypeToTwoKinds(dbType) {
    const t = normType(dbType);
    if (/(^(u)?int(\d+)?$|int|integer|bigint|smallint|tinyint(?!\s*\(1\))|float|double|decimal|numeric|real|serial|money)/.test(t)) {
        return 'number';
    }
    return 'string';
}
function buildEqualsFilterFromCell(params) {
    const { colName, colType, raw } = params;
    if (raw === null || raw === undefined || raw === '') {
        return {
            col: colName,
            kind: 'string',
            op: 'empty',
            value: '',
            caseSensitive: false
        };
    }
    const kind = mapDbTypeToTwoKinds(colType);
    if (kind === 'number') {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n)) {
            return {
                col: colName,
                kind: 'string',
                op: 'equals',
                value: String(raw),
                caseSensitive: false
            };
        }
        return {
            col: colName,
            kind: 'number',
            op: 'eq',
            value: String(n),
            caseSensitive: false
        };
    }
    return {
        col: colName,
        kind: 'string',
        op: 'equals',
        value: String(raw),
        caseSensitive: false
    };
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "VTableFilters",
    ()=>VTableFilters,
    "useVTableFilterUi",
    ()=>useVTableFilterUi,
    "useVTableFilters",
    ()=>useVTableFilters
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$funnel$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Filter$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/funnel.js [app-ssr] (ecmascript) <export default as Filter>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/x.js [app-ssr] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/web-utils/src/index.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/popover.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$ColumnFIlter$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
const MAX_VISIBLE_FILTERS = 3;
function formatFilterSummary(filter, t) {
    if (filter.label) {
        return `${filter.col} = ${filter.label}`;
    }
    const value = filter.value ? ` = ${filter.value}` : '';
    const caseSensitive = filter.kind === 'string' && filter.caseSensitive ? t('VTable.Filter.CaseSensitiveSuffix') : '';
    return `${filter.col}${value}${caseSensitive}`;
}
function normalizeColumns(columnsRaw) {
    return columnsRaw.map((column)=>({
            name: column.name,
            type: column.type ?? ''
        }));
}
function testString(raw, op, val, cs) {
    const s = raw == null ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    const t = val ?? '';
    const a = cs ? s : s.toLowerCase();
    const b = cs ? t : t.toLowerCase();
    switch(op){
        case 'contains':
            return a.includes(b);
        case 'equals':
            return a === b;
        case 'startsWith':
            return a.startsWith(b);
        case 'endsWith':
            return a.endsWith(b);
        case 'empty':
            return a.length === 0;
        case 'notEmpty':
            return a.length > 0;
        case 'regex':
            try {
                const re = new RegExp(val ?? '', cs ? '' : 'i');
                return re.test(s);
            } catch  {
                return false;
            }
    }
}
function testNumber(raw, op, val) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    const m = Number(val);
    if (Number.isNaN(n)) return false;
    switch(op){
        case 'eq':
            return n === m;
        case 'ne':
            return n !== m;
        case 'gt':
            return n > m;
        case 'ge':
            return n >= m;
        case 'lt':
            return n < m;
        case 'le':
            return n <= m;
    }
}
function testRange(raw, filter) {
    if (!filter.value || !filter.valueTo || !filter.rangeValueType) {
        return false;
    }
    if (filter.rangeValueType === 'date') {
        const current = raw instanceof Date ? raw.getTime() : Date.parse(String(raw ?? ''));
        const from = Date.parse(filter.value);
        const to = Date.parse(filter.valueTo);
        if (!Number.isFinite(current) || !Number.isFinite(from) || !Number.isFinite(to)) {
            return false;
        }
        return current >= from && current < to;
    }
    const current = typeof raw === 'number' ? raw : Number(raw);
    const from = Number(filter.value);
    const to = Number(filter.valueTo);
    if (!Number.isFinite(current) || !Number.isFinite(from) || !Number.isFinite(to)) {
        return false;
    }
    return current >= from && current < to;
}
function useVTableFilters({ results, storageKey, initialFilters, disableStorage = false }) {
    const hydratedStorageKeyRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(undefined);
    const hydratedInitialFiltersRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(undefined);
    const readStoredFilters = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((key)=>{
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        return [];
    }, []);
    const [activeFilters, setActiveFilters] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>{
        if (initialFilters) {
            return initialFilters;
        }
        if (disableStorage) {
            return [];
        }
        return readStoredFilters(storageKey);
    });
    const [filterDraft, setFilterDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        col: '',
        kind: 'string',
        op: 'contains',
        value: '',
        cs: false
    });
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLayoutEffect"])(()=>{
        // React Activity reconnects layout effects when a hidden SQL tab becomes visible.
        // Rehydrate only when the backing result set or explicit initial filters changed.
        if (hydratedStorageKeyRef.current === storageKey && hydratedInitialFiltersRef.current === initialFilters) {
            return;
        }
        hydratedStorageKeyRef.current = storageKey;
        hydratedInitialFiltersRef.current = initialFilters;
        if (initialFilters) {
            setActiveFilters(initialFilters);
            return;
        }
        if (disableStorage) {
            setActiveFilters([]);
            return;
        }
        setActiveFilters(readStoredFilters(storageKey));
    }, [
        disableStorage,
        initialFilters,
        readStoredFilters,
        storageKey
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (disableStorage) return;
        if (!storageKey) return;
        if (hydratedStorageKeyRef.current !== storageKey) return;
        try {
            localStorage.setItem(`${storageKey}:filters`, JSON.stringify(activeFilters));
        } catch  {}
    }, [
        activeFilters,
        disableStorage,
        storageKey
    ]);
    const filteredResults = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (activeFilters.length === 0) return results;
        return results.filter((row)=>{
            for (const filter of activeFilters){
                const raw = row.rowData?.[filter.col];
                if (filter.kind === 'string') {
                    if (!testString(raw, filter.op, filter.value, filter.caseSensitive)) return false;
                } else if (filter.kind === 'range') {
                    if (!testRange(raw, filter)) return false;
                } else if (!testNumber(raw, filter.op, filter.value)) {
                    return false;
                }
            }
            return true;
        });
    }, [
        activeFilters,
        results
    ]);
    const filtersByColumn = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const map = new Map();
        activeFilters.forEach((filter)=>map.set(filter.col, filter));
        return map;
    }, [
        activeFilters
    ]);
    const setColumnFilter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((filter)=>{
        setActiveFilters((prev)=>{
            const others = prev.filter((item)=>item.col !== filter.col);
            return [
                ...others,
                filter
            ];
        });
    }, []);
    const applyFilterDraft = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        const { col, kind, op, value, cs } = filterDraft;
        if (!col) return;
        setColumnFilter({
            col,
            kind,
            op,
            value: value ?? '',
            caseSensitive: cs
        });
    }, [
        filterDraft,
        setColumnFilter
    ]);
    const removeFilter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((col)=>{
        setActiveFilters((prev)=>prev.filter((filter)=>filter.col !== col));
    }, []);
    const clearAllFilters = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        setActiveFilters([]);
    }, []);
    const replaceFilters = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((filters)=>{
        setActiveFilters(filters);
    }, []);
    const getColumnFilter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((column)=>filtersByColumn.get(column), [
        filtersByColumn
    ]);
    const getColumnFilterPopoverProps = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((column, columnsRaw)=>({
            column,
            columns: normalizeColumns(columnsRaw),
            draft: filterDraft,
            setDraft: setFilterDraft,
            existing: filtersByColumn.get(column),
            onApply: applyFilterDraft,
            onRemove: removeFilter
        }), [
        applyFilterDraft,
        filterDraft,
        filtersByColumn,
        removeFilter
    ]);
    return {
        activeFilters,
        filteredResults,
        setColumnFilter,
        removeFilter,
        clearAllFilters,
        replaceFilters,
        getColumnFilter,
        getColumnFilterPopoverProps
    };
}
function useVTableFilterUi({ activeFilters, columnsRaw, onUpsertFilter, onRemoveFilter }) {
    const [filterDraft, setFilterDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        col: '',
        kind: 'string',
        op: 'contains',
        value: '',
        cs: false
    });
    const filtersByColumn = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const map = new Map();
        activeFilters.forEach((filter)=>map.set(filter.col, filter));
        return map;
    }, [
        activeFilters
    ]);
    const normalizedColumns = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>normalizeColumns(columnsRaw), [
        columnsRaw
    ]);
    const applyFilterDraft = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        const { col, kind, op, value, cs } = filterDraft;
        if (!col) return;
        onUpsertFilter({
            col,
            kind,
            op,
            value: value ?? '',
            caseSensitive: cs
        });
    }, [
        filterDraft,
        onUpsertFilter
    ]);
    const getColumnFilter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((column)=>filtersByColumn.get(column), [
        filtersByColumn
    ]);
    const getColumnFilterPopoverProps = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((column)=>({
            column,
            columns: normalizedColumns,
            draft: filterDraft,
            setDraft: setFilterDraft,
            existing: filtersByColumn.get(column),
            onApply: applyFilterDraft,
            onRemove: onRemoveFilter
        }), [
        applyFilterDraft,
        filterDraft,
        filtersByColumn,
        normalizedColumns,
        onRemoveFilter
    ]);
    return {
        getColumnFilter,
        getColumnFilterPopoverProps,
        filterDraft,
        setFilterDraft,
        applyFilterDraft
    };
}
function VTableFilters({ activeFilters, columnsRaw, onUpsertFilter, onRemoveFilter, onClearAllFilters, className }) {
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])('SqlConsole');
    const [tagFilterAnchor, setTagFilterAnchor] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [tagFilterCol, setTagFilterCol] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [tagOpenSig, setTagOpenSig] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [hiddenFiltersOpen, setHiddenFiltersOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const hiddenFiltersAnchorRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const { getColumnFilterPopoverProps, setFilterDraft } = useVTableFilterUi({
        activeFilters,
        columnsRaw,
        onUpsertFilter,
        onRemoveFilter
    });
    const tagFilterPopoverProps = tagFilterCol ? getColumnFilterPopoverProps(tagFilterCol) : null;
    const visibleFilters = activeFilters.slice(0, MAX_VISIBLE_FILTERS);
    const hiddenFilters = activeFilters.slice(MAX_VISIBLE_FILTERS);
    const openFilterEditor = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((filter, anchor)=>{
        if (filter.kind === 'range') {
            return;
        }
        setFilterDraft({
            col: filter.col,
            kind: filter.kind === 'number' ? 'number' : 'string',
            op: filter.op,
            value: filter.value ?? '',
            cs: !!filter.caseSensitive
        });
        setTagFilterAnchor(anchor);
        setTagFilterCol(filter.col);
        setTagOpenSig((value)=>value + 1);
    }, [
        setFilterDraft
    ]);
    const openHiddenFilterEditor = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((filter)=>{
        setHiddenFiltersOpen(false);
        openFilterEditor(filter, hiddenFiltersAnchorRef.current ?? document.body);
    }, [
        openFilterEditor
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            activeFilters.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('flex items-center gap-2 border-b bg-muted/30 px-2 py-1', className),
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex min-w-0 flex-1 items-center gap-2 overflow-hidden",
                        children: [
                            visibleFilters.map((filter)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(FilterPill, {
                                    filter: filter,
                                    label: formatFilterSummary(filter, t),
                                    onOpen: openFilterEditor,
                                    onRemove: onRemoveFilter,
                                    t: t
                                }, filter.col, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                                    lineNumber: 381,
                                    columnNumber: 29
                                }, this)),
                            hiddenFilters.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        ref: hiddenFiltersAnchorRef,
                                        className: "h-0 w-0 shrink-0"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                                        lineNumber: 392,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Popover"], {
                                        open: hiddenFiltersOpen,
                                        onOpenChange: setHiddenFiltersOpen,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PopoverTrigger"], {
                                                asChild: true,
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    className: "shrink-0 rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                                                    children: [
                                                        "+",
                                                        hiddenFilters.length,
                                                        " more"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                                                    lineNumber: 395,
                                                    columnNumber: 37
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                                                lineNumber: 394,
                                                columnNumber: 33
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PopoverContent"], {
                                                align: "start",
                                                className: "w-80 p-2",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "space-y-1",
                                                    children: hiddenFilters.map((filter)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(FilterPill, {
                                                            filter: filter,
                                                            label: formatFilterSummary(filter, t),
                                                            onOpen: (filter)=>openHiddenFilterEditor(filter),
                                                            onRemove: onRemoveFilter,
                                                            t: t,
                                                            className: "w-full"
                                                        }, filter.col, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                                                            lineNumber: 405,
                                                            columnNumber: 45
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                                                    lineNumber: 403,
                                                    columnNumber: 37
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                                                lineNumber: 402,
                                                columnNumber: 33
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                                        lineNumber: 393,
                                        columnNumber: 33
                                    }, this)
                                ]
                            }, void 0, true)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                        lineNumber: 379,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                        type: "button",
                        variant: "ghost",
                        size: "xs",
                        className: "shrink-0",
                        onClick: onClearAllFilters,
                        children: t('VTable.Filter.ClearAll')
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                        lineNumber: 421,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                lineNumber: 378,
                columnNumber: 17
            }, this),
            tagFilterCol && tagFilterPopoverProps && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$ColumnFIlter$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ColumnFilterPopover"], {
                ...tagFilterPopoverProps,
                onApply: ()=>{
                    tagFilterPopoverProps.onApply();
                    setTagFilterAnchor(null);
                    setTagFilterCol(null);
                },
                onRemove: (col)=>{
                    onRemoveFilter(col);
                    setTagFilterAnchor(null);
                    setTagFilterCol(null);
                },
                externalAnchor: tagFilterAnchor,
                externalOpenSignal: tagOpenSig
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                lineNumber: 434,
                columnNumber: 17
            }, this)
        ]
    }, void 0, true);
}
function FilterPill({ filter, label, onOpen, onRemove, t, className }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('flex min-w-0 items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-xs', className),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-left', filter.kind === 'range' ? 'cursor-default' : 'cursor-pointer'),
                onClick: (event)=>{
                    if (filter.kind === 'range') return;
                    onOpen(filter, event.currentTarget);
                },
                title: filter.kind === 'range' ? label : t('VTable.Filter.EditHint'),
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$funnel$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Filter$3e$__["Filter"], {
                        className: "h-3 w-3 shrink-0 text-muted-foreground"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                        lineNumber: 485,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "truncate",
                        children: label
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                        lineNumber: 486,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                lineNumber: 476,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                className: "shrink-0 opacity-70 transition-opacity hover:opacity-100 cursor-pointer",
                onClick: (event)=>{
                    event.stopPropagation();
                    onRemove(filter.col);
                },
                "aria-label": t('VTable.Filter.RemoveAria'),
                title: t('VTable.Filter.RemoveTitle'),
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                    className: "h-3 w-3"
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                    lineNumber: 498,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
                lineNumber: 488,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx",
        lineNumber: 470,
        columnNumber: 9
    }, this);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/cell-editing.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getCellEditorKind",
    ()=>getCellEditorKind,
    "getDateInputType",
    ()=>getDateInputType,
    "parseEditDraft",
    ()=>parseEditDraft,
    "toDateEditDraft",
    ()=>toDateEditDraft,
    "toEditDraft",
    ()=>toEditDraft
]);
function getCellEditorKind(type) {
    const normalized = type?.toLowerCase() ?? '';
    if (/(json|array|struct|map|blob|binary|bytea|geometry|geography|interval)/.test(normalized)) return 'complex';
    if (/(bool|boolean)/.test(normalized)) return 'boolean';
    if (/(bigint|bigserial|decimal|numeric|number)/.test(normalized)) return 'precise-number';
    if (/(tinyint|smallint|mediumint|integer|int|serial|float|double|real)/.test(normalized)) return 'number';
    if (/(date|time|timestamp)/.test(normalized)) return 'date';
    return 'text';
}
function toEditDraft(value) {
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}
function toDateEditDraft(value, type) {
    const draft = toEditDraft(value);
    if (/timestamp|datetime/i.test(type ?? '')) return draft.replace(' ', 'T').replace(/Z$/, '');
    if (/\btime\b/i.test(type ?? '')) return draft.match(/\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?/)?.[0] ?? draft;
    return draft.slice(0, 10);
}
function getDateInputType(type) {
    if (/timestamp|datetime/i.test(type ?? '')) return 'datetime-local';
    if (/\btime\b/i.test(type ?? '')) return 'time';
    return 'date';
}
function parseEditDraft(kind, draft, messages) {
    if (kind === 'boolean') {
        if (draft !== 'true' && draft !== 'false') throw new Error(messages.chooseBoolean);
        return draft === 'true';
    }
    if (kind === 'number') {
        const value = Number(draft);
        if (!draft.trim() || !Number.isFinite(value)) {
            throw new Error(messages.invalidNumber);
        }
        return value;
    }
    if (kind === 'precise-number') {
        const trimmed = draft.trim();
        if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
            throw new Error(messages.invalidNumber);
        }
        return trimmed;
    }
    return draft;
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>VTable
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/web-utils/src/index.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$virtualized$2f$dist$2f$es$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/react-virtualized/dist/es/index.js [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$virtualized$2f$dist$2f$es$2f$AutoSizer$2f$AutoSizer$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AutoSizer$3e$__ = __turbopack_context__.i("[project]/node_modules/react-virtualized/dist/es/AutoSizer/AutoSizer.js [app-ssr] (ecmascript) <export default as AutoSizer>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$virtualized$2f$dist$2f$es$2f$MultiGrid$2f$MultiGrid$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MultiGrid$3e$__ = __turbopack_context__.i("[project]/node_modules/react-virtualized/dist/es/MultiGrid/MultiGrid.js [app-ssr] (ecmascript) <export default as MultiGrid>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$ColumnFIlter$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/ColumnFIlter.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/type.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/utils.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/context-menu.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$filter$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/filter.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$VTableFilters$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$cell$2d$editing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/cell-editing.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
;
;
;
;
const HEADER_PAD = 24;
const VISIBLE_AUTO_FIT_SAMPLE_LIMIT = 48;
const VISIBLE_AUTO_FIT_ROW_BUFFER = 20;
const VISIBLE_AUTO_FIT_COLUMN_BUFFER = 2;
const INITIAL_VISIBLE_COLUMN_COUNT = 12;
const INITIAL_VISIBLE_ROW_COUNT = 24;
const REMOTE_DEFAULT_PAGE_SIZE = 5000;
const REMOTE_MAX_CACHED_PAGES = 24;
const REMOTE_MAX_CACHED_SOURCES = 32;
const REMOTE_PREFETCH_PAGES_BEFORE = 1;
const REMOTE_PREFETCH_PAGES_AFTER = 2;
const REMOTE_RESULT_NOT_READY_RETRY_MS = 300;
const HEADER_TEXT_PAD = 44;
const CELL_TEXT_PAD = 18;
const FALLBACK_CHAR_WIDTH = 8;
const PRIMARY_SELECTION_CLASS = 'bg-primary/10 text-foreground';
const PRIMARY_SELECTION_SUBTLE_CLASS = 'bg-primary/6 text-foreground';
const PRIMARY_SELECTION_SOFT_CLASS = 'bg-primary/8 text-foreground';
const PRIMARY_SELECTION_RING_CLASS = 'ring-1 ring-inset ring-primary/40';
const SELECTION_CLASS_NAMES = [
    ...new Set(`${PRIMARY_SELECTION_CLASS} ${PRIMARY_SELECTION_SUBTLE_CLASS} ${PRIMARY_SELECTION_RING_CLASS}`.split(' '))
];
const TOP_RIGHT_GRID_STYLE = {
    overflowX: 'hidden',
    overflowY: 'hidden'
};
const BOTTOM_LEFT_GRID_STYLE = {
    overflowY: 'hidden',
    overflowX: 'hidden'
};
const TOP_LEFT_GRID_STYLE = {
    overflow: 'hidden'
};
const BOTTOM_RIGHT_GRID_STYLE = {
    overflowY: 'auto',
    overflowX: 'auto'
};
const GRID_STYLE = {
    outline: 'none'
};
const VersionedMultiGrid = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$virtualized$2f$dist$2f$es$2f$MultiGrid$2f$MultiGrid$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MultiGrid$3e$__["MultiGrid"];
const remoteRowCacheByKey = new Map();
function getRemoteRowCache(cacheKey) {
    const entry = remoteRowCacheByKey.get(cacheKey);
    if (entry) {
        entry.touchedAt = Date.now();
    }
    return entry;
}
function setRemoteRowCache(cacheKey, rows, pages) {
    remoteRowCacheByKey.set(cacheKey, {
        rows: new Map(rows),
        pages: new Map(pages),
        touchedAt: Date.now()
    });
    if (remoteRowCacheByKey.size <= REMOTE_MAX_CACHED_SOURCES) {
        return;
    }
    const staleEntries = [
        ...remoteRowCacheByKey.entries()
    ].sort((left, right)=>left[1].touchedAt - right[1].touchedAt);
    const removeCount = remoteRowCacheByKey.size - REMOTE_MAX_CACHED_SOURCES;
    for(let index = 0; index < removeCount; index += 1){
        const staleKey = staleEntries[index]?.[0];
        if (staleKey) {
            remoteRowCacheByKey.delete(staleKey);
        }
    }
}
function areNumberArraysEqual(left, right) {
    if (left === right) return true;
    if (!left || !right) return !left && !right;
    if (left.length !== right.length) return false;
    return left.every((value, index)=>value === right[index]);
}
function areSortStatesEqual(left, right) {
    if (!left && !right) return true;
    if (!left || !right) return false;
    return left.column === right.column && left.direction === right.direction;
}
function getSampleRowIndices(start, stop, limit) {
    if (stop < start) return [];
    const total = stop - start + 1;
    if (total <= limit) return Array.from({
        length: total
    }, (_, index)=>start + index);
    const lastIndex = total - 1;
    const sampled = new Set();
    for(let step = 0; step < limit; step++){
        sampled.add(start + Math.floor(step * lastIndex / Math.max(limit - 1, 1)));
    }
    return [
        ...sampled
    ].sort((left, right)=>left - right);
}
function VTable({ results, columnMetas, remoteSource, rowHeight = 32, defaultColMinWidth = 140, indexColWidth = 56, storageKey, colMinWidthMap, colMaxWidthMap, onStatsChange, setInspectorOpen, setInspectorMode, setInspectorPayload, activeFilters: externalActiveFilters, onUpsertFilter: onUpsertExternalFilter, onRemoveFilter: onRemoveExternalFilter, onClearAllFilters: onClearAllExternalFilters, serverSideOperations = false, showFiltersBar = true, initialSort = null, selectedRowIndexes, isActive = true, onSortChange, onSelectedRowIndexesChange, editable = false, getCellEditState, isRowChanged, onCellChange, onRevertCell, onUndo, onRedo, onCommitAll, onSelectionChange, focusRequest, autoOpenRowInspector = false, activeRowIndex = null, onActiveRowChange }) {
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])('SqlConsole');
    const columnsRaw = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const rawColumns = columnMetas;
        return rawColumns.filter((column)=>typeof column.name === 'string' && column.name.length > 0).map((column)=>({
                name: column.name,
                type: typeof column.type === 'string' || column.type === null ? column.type : undefined,
                nullable: typeof column.nullable === 'boolean' ? column.nullable : typeof column.nullable === 'number' ? column.nullable !== 0 : typeof column.nullable === 'string' ? [
                    'true',
                    'yes',
                    '1'
                ].includes(column.nullable.toLowerCase()) : undefined,
                isPrimaryKey: typeof column.isPrimaryKey === 'boolean' ? column.isPrimaryKey : typeof column.isPrimaryKey === 'number' ? column.isPrimaryKey !== 0 : typeof column.isPrimaryKey === 'string' ? [
                    'true',
                    'yes',
                    '1'
                ].includes(column.isPrimaryKey.toLowerCase()) : undefined
            }));
    }, [
        columnMetas
    ]);
    const columns = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>columnsRaw.map((column)=>column.name), [
        columnsRaw
    ]);
    const isRemote = Boolean(remoteSource);
    const operationsDisabled = false;
    const usesServerSideOperations = serverSideOperations || isRemote;
    const remotePageSize = Math.max(1, Math.min(remoteSource?.pageSize ?? REMOTE_DEFAULT_PAGE_SIZE, 5000));
    const [remoteRowsVersion, setRemoteRowsVersion] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const remoteRowsRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const remotePagesRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const remoteLoadingPagesRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Set());
    const remotePageAbortControllersRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const remoteRetryTimerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [remoteRetryVersion, setRemoteRetryVersion] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const activeRemoteCacheKeyRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(remoteSource?.cacheKey ?? null);
    const activeRemoteSourceIdRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(remoteSource?.sourceId ?? null);
    const hydratedRemoteSourceRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const remoteRowsStaleRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    const clampColumnWidth = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((col, width)=>{
        const minW = Math.max(colMinWidthMap?.[col] ?? defaultColMinWidth, 60);
        const maxW = Math.max(colMaxWidthMap?.[col] ?? 1200, minW);
        return Math.min(Math.max(width, minW), maxW);
    }, [
        colMaxWidthMap,
        colMinWidthMap,
        defaultColMinWidth
    ]);
    const [manualColWidths, setManualColWidths] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>{
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        return {};
    });
    const [autoColWidths, setAutoColWidths] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>{
        const init = {};
        for (const c of columns)init[c] = clampColumnWidth(c, defaultColMinWidth);
        return init;
    });
    const measureCanvasRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const visibleRowRangeRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({
        start: 0,
        stop: Math.max(0, INITIAL_VISIBLE_ROW_COUNT - 1)
    });
    const visibleColumnRangeRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({
        start: 0,
        stop: Math.max(0, INITIAL_VISIBLE_COLUMN_COUNT - 1)
    });
    const [visibleMeasurementVersion, setVisibleMeasurementVersion] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const visibleMeasurementTimeoutRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const scheduleInitialMeasurement = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((delayMs = 0)=>{
        if (visibleMeasurementTimeoutRef.current) {
            clearTimeout(visibleMeasurementTimeoutRef.current);
        }
        visibleMeasurementTimeoutRef.current = setTimeout(()=>{
            visibleMeasurementTimeoutRef.current = null;
            setVisibleMeasurementVersion((version)=>version + 1);
        }, delayMs);
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        setManualColWidths((prev)=>{
            const next = {};
            for (const c of columns){
                if (prev[c] != null) next[c] = prev[c];
            }
            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(next);
            if (prevKeys.length === nextKeys.length && nextKeys.every((key)=>prev[key] === next[key])) {
                return prev;
            }
            return next;
        });
        setAutoColWidths((prev)=>{
            const next = {};
            for (const c of columns){
                next[c] = clampColumnWidth(c, prev[c] ?? defaultColMinWidth);
            }
            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(next);
            if (prevKeys.length === nextKeys.length && nextKeys.every((key)=>prev[key] === next[key])) {
                return prev;
            }
            return next;
        });
    }, [
        clampColumnWidth,
        columns,
        defaultColMinWidth
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!storageKey) return;
        try {
            localStorage.setItem(`${storageKey}:colWidths`, JSON.stringify(manualColWidths));
        } catch  {}
    }, [
        manualColWidths,
        storageKey
    ]);
    const measureTextWidth = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((text, font)=>{
        if (typeof document === 'undefined') {
            return text.length * FALLBACK_CHAR_WIDTH;
        }
        if (!measureCanvasRef.current) {
            const canvas = document.createElement('canvas');
            measureCanvasRef.current = canvas.getContext('2d');
        }
        const context = measureCanvasRef.current;
        if (!context) {
            return text.length * FALLBACK_CHAR_WIDTH;
        }
        context.font = font;
        return Math.ceil(context.measureText(text).width);
    }, []);
    const measureColumnWidth = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((col, rowIndices)=>{
        const fontFamily = typeof document === 'undefined' ? 'system-ui, sans-serif' : getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
        const headerWidth = measureTextWidth(col, `700 14px ${fontFamily}`) + HEADER_TEXT_PAD;
        let maxCellWidth = 0;
        for (const rowIndex of rowIndices){
            const cellValue = isRemote ? remoteRowsRef.current.get(rowIndex)?.rowData?.[col] : results[rowIndex]?.rowData?.[col];
            const text = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatTooltip"])(cellValue);
            maxCellWidth = Math.max(maxCellWidth, measureTextWidth(text, `400 14px ${fontFamily}`) + CELL_TEXT_PAD);
        }
        return clampColumnWidth(col, Math.max(headerWidth, maxCellWidth, defaultColMinWidth));
    }, [
        clampColumnWidth,
        defaultColMinWidth,
        isRemote,
        measureTextWidth,
        results
    ]);
    const internalFilters = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$VTableFilters$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useVTableFilters"])({
        results,
        storageKey
    });
    const usesExternalFilters = !!(externalActiveFilters && onUpsertExternalFilter && onRemoveExternalFilter && onClearAllExternalFilters);
    const activeFilters = usesExternalFilters ? externalActiveFilters : internalFilters.activeFilters;
    const filteredResults = usesExternalFilters ? results : internalFilters.filteredResults;
    const setColumnFilter = usesExternalFilters ? onUpsertExternalFilter : internalFilters.setColumnFilter;
    const removeFilter = usesExternalFilters ? onRemoveExternalFilter : internalFilters.removeFilter;
    const clearAllFilters = usesExternalFilters ? onClearAllExternalFilters : internalFilters.clearAllFilters;
    const { getColumnFilter, getColumnFilterPopoverProps } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$VTableFilters$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useVTableFilterUi"])({
        activeFilters,
        columnsRaw: columnsRaw ?? [],
        onUpsertFilter: setColumnFilter,
        onRemoveFilter: removeFilter
    });
    const numericColumns = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const set = new Set();
        for (const c of columnsRaw ?? []){
            if (c?.name && (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$filter$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["mapDbTypeToTwoKinds"])(c.type) === 'number') set.add(c.name);
        }
        return set;
    }, [
        columnsRaw
    ]);
    const [sortState, setSortState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(initialSort ?? null);
    const sortBy = sortState?.column ?? null;
    const sortDirection = sortState?.direction ?? 'asc';
    const lastEmittedSortRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(initialSort ?? null);
    const sortedResults = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (usesServerSideOperations) return filteredResults;
        if (!sortBy) return filteredResults;
        const isNumericCol = numericColumns.has(sortBy);
        const sorted = [
            ...filteredResults
        ].sort((a, b)=>{
            const aVal = a.rowData[sortBy];
            const bVal = b.rowData[sortBy];
            if (aVal === bVal) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            }
            if (isNumericCol) {
                const aNum = Number(aVal);
                const bNum = Number(bVal);
                if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
                    return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
                }
            }
            return sortDirection === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
        });
        return sorted;
    }, [
        filteredResults,
        numericColumns,
        usesServerSideOperations,
        sortBy,
        sortDirection
    ]);
    const tableRowCount = isRemote ? Math.max(0, remoteSource?.rowCount ?? 0) : sortedResults.length;
    const effectiveIndexColWidth = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const fontFamily = typeof document === 'undefined' ? 'system-ui, sans-serif' : getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
        const maxRowLabel = String(Math.max(1, tableRowCount));
        return Math.max(indexColWidth, measureTextWidth(maxRowLabel, `400 14px ${fontFamily}`) + CELL_TEXT_PAD);
    }, [
        indexColWidth,
        measureTextWidth,
        tableRowCount
    ]);
    const getDisplayRow = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((rowIndex)=>{
        if (isRemote) return remoteRowsRef.current.get(rowIndex) ?? remoteSource?.initialRows?.[rowIndex];
        return sortedResults[rowIndex];
    }, [
        isRemote,
        remoteSource?.initialRows,
        sortedResults
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const resetRemoteRequests = ()=>{
            for (const controller of remotePageAbortControllersRef.current.values()){
                controller.abort();
            }
            if (remoteRetryTimerRef.current !== null) {
                clearTimeout(remoteRetryTimerRef.current);
                remoteRetryTimerRef.current = null;
            }
            remoteLoadingPagesRef.current = new Set();
            remotePageAbortControllersRef.current = new Map();
        };
        resetRemoteRequests();
        const nextCacheKey = remoteSource?.cacheKey ?? null;
        const nextSourceId = remoteSource?.sourceId ?? nextCacheKey;
        const hydratedSource = hydratedRemoteSourceRef.current;
        const isSameHydratedSource = hydratedSource?.cacheKey === nextCacheKey && hydratedSource.sourceId === nextSourceId;
        // React Activity reconnects effects when a hidden SQL tab becomes visible.
        // Preserve the current result pages on reconnect; only a real source change
        // should replace the remote row cache.
        if (isSameHydratedSource) {
            return resetRemoteRequests;
        }
        hydratedRemoteSourceRef.current = {
            cacheKey: nextCacheKey,
            sourceId: nextSourceId
        };
        const cached = nextCacheKey ? getRemoteRowCache(nextCacheKey) : null;
        const canKeepStaleRows = Boolean(nextCacheKey && activeRemoteSourceIdRef.current === nextSourceId && remoteRowsRef.current.size > 0);
        activeRemoteCacheKeyRef.current = nextCacheKey;
        activeRemoteSourceIdRef.current = nextSourceId;
        if (cached) {
            remoteRowsRef.current = new Map(cached.rows);
            remotePagesRef.current = new Map(cached.pages);
            remoteRowsStaleRef.current = false;
        } else {
            if (!canKeepStaleRows) {
                remoteRowsRef.current = new Map();
            }
            remotePagesRef.current = new Map();
            remoteRowsStaleRef.current = canKeepStaleRows;
        }
        setRemoteRowsVersion((version)=>version + 1);
        return resetRemoteRequests;
    }, [
        remoteSource?.cacheKey,
        remoteSource?.sourceId
    ]);
    const requestRemoteRange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((start, stop)=>{
        if (!remoteSource || stop < start) return;
        const visiblePageStart = Math.floor(Math.max(0, start) / remotePageSize);
        const visiblePageStop = Math.floor(Math.max(0, stop) / remotePageSize);
        const maxPage = Math.max(0, Math.ceil(tableRowCount / remotePageSize) - 1);
        const pageStart = Math.max(0, visiblePageStart - REMOTE_PREFETCH_PAGES_BEFORE);
        const pageStop = Math.min(maxPage, visiblePageStop + REMOTE_PREFETCH_PAGES_AFTER);
        const now = Date.now();
        const protectedPages = new Set();
        const visiblePages = [];
        const prefetchPages = [];
        for(let page = pageStart; page <= pageStop; page += 1){
            protectedPages.add(page);
            if (page >= visiblePageStart && page <= visiblePageStop) {
                visiblePages.push(page);
            } else {
                prefetchPages.push(page);
            }
        }
        for (const page of [
            ...remoteLoadingPagesRef.current
        ]){
            if (protectedPages.has(page)) continue;
            remotePageAbortControllersRef.current.get(page)?.abort();
            remotePageAbortControllersRef.current.delete(page);
            remoteLoadingPagesRef.current.delete(page);
        }
        for(let page = visiblePageStart; page <= visiblePageStop; page += 1){
            if (remotePagesRef.current.has(page)) {
                remotePagesRef.current.set(page, now);
            }
        }
        for (const page of [
            ...visiblePages,
            ...prefetchPages
        ]){
            if (remotePagesRef.current.has(page) || remoteLoadingPagesRef.current.has(page)) continue;
            remoteLoadingPagesRef.current.add(page);
            const controller = new AbortController();
            remotePageAbortControllersRef.current.set(page, controller);
            const offset = page * remotePageSize;
            remoteSource.getRows(offset, remotePageSize, controller.signal).then((result)=>{
                if (controller.signal.aborted) return;
                if (activeRemoteCacheKeyRef.current !== remoteSource.cacheKey) return;
                if (!result.ready) {
                    if (remoteRetryTimerRef.current === null) {
                        remoteRetryTimerRef.current = setTimeout(()=>{
                            remoteRetryTimerRef.current = null;
                            setRemoteRetryVersion((version)=>version + 1);
                        }, REMOTE_RESULT_NOT_READY_RETRY_MS);
                    }
                    return;
                }
                if (remoteRowsStaleRef.current) {
                    remoteRowsRef.current = new Map();
                    remoteRowsStaleRef.current = false;
                }
                result.rows.forEach((row, index)=>{
                    remoteRowsRef.current.set(offset + index, row);
                });
                remotePagesRef.current.set(page, Date.now());
                if (remotePagesRef.current.size > REMOTE_MAX_CACHED_PAGES) {
                    const stalePages = [
                        ...remotePagesRef.current.entries()
                    ].sort((left, right)=>left[1] - right[1]);
                    let removeCount = remotePagesRef.current.size - REMOTE_MAX_CACHED_PAGES;
                    for (const [stalePage] of stalePages){
                        if (removeCount <= 0) break;
                        if (typeof stalePage !== 'number') continue;
                        if (protectedPages.has(stalePage)) continue;
                        remotePagesRef.current.delete(stalePage);
                        const staleOffset = stalePage * remotePageSize;
                        for(let rowIndex = staleOffset; rowIndex < staleOffset + remotePageSize; rowIndex += 1){
                            remoteRowsRef.current.delete(rowIndex);
                        }
                        removeCount -= 1;
                    }
                }
                setRemoteRowCache(remoteSource.cacheKey, remoteRowsRef.current, remotePagesRef.current);
            }).catch((error)=>{
                if (!controller.signal.aborted) {
                    console.warn('[VTable] remote result page load failed', {
                        cacheKey: remoteSource.cacheKey,
                        page,
                        error
                    });
                }
            }).finally(()=>{
                remotePageAbortControllersRef.current.delete(page);
                remoteLoadingPagesRef.current.delete(page);
                if (!controller.signal.aborted) {
                    setRemoteRowsVersion((version)=>version + 1);
                }
            });
        }
    }, [
        remotePageSize,
        remoteSource,
        tableRowCount
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!remoteSource || tableRowCount <= 0) return;
        requestRemoteRange(0, Math.min(tableRowCount - 1, remotePageSize - 1));
    }, [
        remotePageSize,
        remoteRetryVersion,
        remoteSource,
        requestRemoteRange,
        tableRowCount
    ]);
    const getVisibleSampleRowIndices = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((range)=>{
        if (tableRowCount === 0) return [];
        const sourceRange = range ?? {
            start: 0,
            stop: Math.max(0, Math.min(tableRowCount - 1, INITIAL_VISIBLE_ROW_COUNT - 1))
        };
        const start = Math.max(0, sourceRange.start - VISIBLE_AUTO_FIT_ROW_BUFFER);
        const stop = Math.min(tableRowCount - 1, sourceRange.stop + VISIBLE_AUTO_FIT_ROW_BUFFER);
        return getSampleRowIndices(start, stop, VISIBLE_AUTO_FIT_SAMPLE_LIMIT);
    }, [
        tableRowCount
    ]);
    const initialVisibleSampleRowIndices = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>getVisibleSampleRowIndices(), [
        getVisibleSampleRowIndices
    ]);
    const getVisibleAutoFitColumns = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        if (columns.length === 0) return [];
        const range = visibleColumnRangeRef.current;
        const start = Math.max(0, range.start - VISIBLE_AUTO_FIT_COLUMN_BUFFER);
        const stop = Math.min(columns.length - 1, range.stop + VISIBLE_AUTO_FIT_COLUMN_BUFFER);
        return columns.slice(start, stop + 1);
    }, [
        columns
    ]);
    const visibleAutoColWidths = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        void visibleMeasurementVersion;
        const targetColumns = getVisibleAutoFitColumns();
        if (targetColumns.length === 0) return {};
        const rowIndices = getVisibleSampleRowIndices(visibleRowRangeRef.current);
        const next = {};
        for (const col of targetColumns){
            next[col] = measureColumnWidth(col, rowIndices.length ? rowIndices : initialVisibleSampleRowIndices);
        }
        return next;
    }, [
        getVisibleAutoFitColumns,
        getVisibleSampleRowIndices,
        initialVisibleSampleRowIndices,
        measureColumnWidth,
        visibleMeasurementVersion
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const targetColumns = Object.keys(visibleAutoColWidths);
        if (targetColumns.length === 0) return;
        setAutoColWidths((prev)=>{
            const next = {
                ...prev
            };
            for (const col of targetColumns){
                next[col] = visibleAutoColWidths[col];
            }
            if (targetColumns.every((col)=>prev[col] === next[col])) {
                return prev;
            }
            return next;
        });
    }, [
        visibleAutoColWidths
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (typeof document === 'undefined' || !('fonts' in document)) return;
        let disposed = false;
        document.fonts.ready.then(()=>{
            if (!disposed) {
                scheduleInitialMeasurement();
            }
        });
        return ()=>{
            disposed = true;
        };
    }, [
        columns,
        scheduleInitialMeasurement
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        return ()=>{
            if (visibleMeasurementTimeoutRef.current) {
                clearTimeout(visibleMeasurementTimeoutRef.current);
            }
        };
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        visibleRowRangeRef.current = {
            start: 0,
            stop: Math.min(Math.max(0, tableRowCount - 1), Math.max(0, INITIAL_VISIBLE_ROW_COUNT - 1))
        };
    }, [
        tableRowCount
    ]);
    const colWidths = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const next = {};
        for (const col of columns){
            next[col] = clampColumnWidth(col, manualColWidths[col] ?? visibleAutoColWidths[col] ?? autoColWidths[col] ?? defaultColMinWidth);
        }
        return next;
    }, [
        autoColWidths,
        clampColumnWidth,
        columns,
        defaultColMinWidth,
        manualColWidths,
        visibleAutoColWidths
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        onStatsChange?.({
            filteredCount: tableRowCount
        });
    }, [
        onStatsChange,
        results,
        tableRowCount
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (areSortStatesEqual(lastEmittedSortRef.current, initialSort)) {
            return;
        }
        if (!initialSort) {
            setSortState(null);
            lastEmittedSortRef.current = null;
            return;
        }
        setSortState(initialSort);
        lastEmittedSortRef.current = initialSort;
    }, [
        initialSort
    ]);
    const handleSort = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((col)=>{
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        setSortState((current)=>{
            if (current?.column !== col) {
                return {
                    column: col,
                    direction: 'asc'
                };
            }
            if (current.direction === 'asc') {
                return {
                    column: col,
                    direction: 'desc'
                };
            }
            return null;
        });
    }, [
        operationsDisabled
    ]);
    const [selectedRowIds, setSelectedRowIds] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>new Set(selectedRowIndexes ?? []));
    const [, setSelectionAnchor] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [selectedCells, setSelectedCells] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(new Set());
    const [, setCellAnchor] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [focusedCell, setFocusedCell] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [editingCell, setEditingCell] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const editingCancelledRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    const hasAnySelection = selectedCells.size > 0 || selectedRowIds.size > 0;
    const selectedRowIdsRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(selectedRowIds);
    selectedRowIdsRef.current = selectedRowIds;
    const selectedCellsRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(selectedCells);
    selectedCellsRef.current = selectedCells;
    const selectionAnchorRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const cellAnchorRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const draggingRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    const dragMovedRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    const lastMouseDownWasOnCell = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    const gridContainerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const gridRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const lastEmittedSelectedRowsRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(selectedRowIndexes ?? []);
    const getColumnMeta = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((column)=>columnsRaw.find((item)=>item.name === column), [
        columnsRaw
    ]);
    const getEffectiveCellState = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((row, column)=>{
        const meta = getColumnMeta(column);
        const kind = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$cell$2d$editing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCellEditorKind"])(meta?.type);
        const externalState = getCellEditState?.(row, column);
        const canEdit = Boolean(editable && externalState?.editable !== false && !meta?.isPrimaryKey && kind !== 'complex');
        return {
            kind,
            meta,
            editable: canEdit,
            changed: Boolean(externalState?.changed),
            nullable: externalState?.nullable ?? meta?.nullable ?? false,
            readOnlyReason: externalState?.readOnlyReason
        };
    }, [
        editable,
        getCellEditState,
        getColumnMeta
    ]);
    const focusGridCell = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((row, column)=>{
        const columnIndex = columns.indexOf(column);
        if (row < 0 || row >= tableRowCount || columnIndex < 0) return;
        const cell = {
            row,
            col: column
        };
        setFocusedCell(cell);
        setSelectedCells(new Set([
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ck"])(row, column)
        ]));
        setSelectedRowIds(new Set());
        cellAnchorRef.current = cell;
        setCellAnchor(cell);
        gridRef.current?.scrollToCell?.({
            rowIndex: row + 1,
            columnIndex: columnIndex + 1
        });
        requestAnimationFrame(()=>gridContainerRef.current?.focus({
                preventScroll: true
            }));
    }, [
        columns,
        tableRowCount
    ]);
    const moveFocusedCell = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((rowDelta, columnDelta, from = focusedCell)=>{
        if (!from || columns.length === 0 || tableRowCount === 0) return;
        const currentColumnIndex = Math.max(0, columns.indexOf(from.col));
        let nextRow = from.row + rowDelta;
        let nextColumnIndex = currentColumnIndex + columnDelta;
        if (nextColumnIndex >= columns.length) {
            nextColumnIndex = 0;
            nextRow += 1;
        } else if (nextColumnIndex < 0) {
            nextColumnIndex = columns.length - 1;
            nextRow -= 1;
        }
        nextRow = Math.max(0, Math.min(tableRowCount - 1, nextRow));
        focusGridCell(nextRow, columns[nextColumnIndex]);
    }, [
        columns,
        focusGridCell,
        focusedCell,
        tableRowCount
    ]);
    const beginCellEdit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((row, column, initialDraft)=>{
        const state = getEffectiveCellState(row, column);
        if (!state.editable) return;
        const value = getDisplayRow(row)?.rowData?.[column];
        editingCancelledRef.current = false;
        setEditingCell({
            row,
            col: column,
            draft: initialDraft ?? (state.kind === 'date' ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$cell$2d$editing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["toDateEditDraft"])(value, state.meta?.type) : (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$cell$2d$editing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["toEditDraft"])(value)),
            error: null
        });
        focusGridCell(row, column);
    }, [
        focusGridCell,
        getDisplayRow,
        getEffectiveCellState
    ]);
    const commitCellEdit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((move)=>{
        if (!editingCell) return true;
        const state = getEffectiveCellState(editingCell.row, editingCell.col);
        try {
            const nextValue = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$cell$2d$editing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseEditDraft"])(state.kind, editingCell.draft, {
                chooseBoolean: t('VTable.Edit.ChooseBoolean'),
                invalidNumber: t('VTable.Edit.InvalidNumber')
            });
            const originalValue = getDisplayRow(editingCell.row)?.rowData?.[editingCell.col];
            onCellChange?.({
                rowIndex: editingCell.row,
                column: editingCell.col,
                originalValue,
                nextValue
            });
            const committedCell = {
                row: editingCell.row,
                col: editingCell.col
            };
            setEditingCell(null);
            if (move) {
                requestAnimationFrame(()=>moveFocusedCell(0, move === 'next' ? 1 : -1, committedCell));
            }
            return true;
        } catch (error) {
            setEditingCell((current)=>current ? {
                    ...current,
                    error: error instanceof Error ? error.message : String(error)
                } : current);
            return false;
        }
    }, [
        editingCell,
        getDisplayRow,
        getEffectiveCellState,
        moveFocusedCell,
        onCellChange,
        t
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!selectedRowIndexes) {
            return;
        }
        const normalized = [
            ...selectedRowIndexes
        ].sort((left, right)=>left - right);
        setSelectedRowIds((prev)=>{
            const current = [
                ...prev
            ].sort((left, right)=>left - right);
            if (areNumberArraysEqual(normalized, current)) {
                return prev;
            }
            return new Set(normalized);
        });
    }, [
        selectedRowIndexes
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (areSortStatesEqual(lastEmittedSortRef.current, sortState)) {
            return;
        }
        lastEmittedSortRef.current = sortState;
        onSortChange?.(sortState);
    }, [
        onSortChange,
        sortState
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const nextRows = [
            ...selectedRowIds
        ].sort((left, right)=>left - right);
        if (areNumberArraysEqual(lastEmittedSelectedRowsRef.current, nextRows)) {
            return;
        }
        lastEmittedSelectedRowsRef.current = nextRows;
        onSelectedRowIndexesChange?.(nextRows);
    }, [
        onSelectedRowIndexesChange,
        selectedRowIds
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const selectedCellRows = new Set([
            ...selectedCells
        ].map((cell)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseCK"])(cell).row));
        const selectedRows = new Set([
            ...selectedRowIds,
            ...selectedCellRows
        ]);
        onSelectionChange?.({
            cellCount: selectedCells.size,
            rowCount: selectedRows.size
        });
    }, [
        onSelectionChange,
        selectedCells,
        selectedRowIds
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!focusRequest) return;
        focusGridCell(focusRequest.rowIndex, focusRequest.column);
    }, [
        focusGridCell,
        focusRequest
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const grid = gridRef.current;
        grid?.forceUpdateGrids?.();
    }, [
        editingCell
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLayoutEffect"])(()=>{
        const grid = gridRef.current;
        grid?.forceUpdateGrids?.();
    }, [
        activeRowIndex,
        getCellEditState,
        isRowChanged,
        results
    ]);
    const syncHeaderHorizontalScroll = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((deltaX)=>{
        const grid = gridRef.current;
        const topRightGrid = grid?._topRightGrid;
        const bottomRightGrid = grid?._bottomRightGrid;
        const topRightContainer = topRightGrid?._scrollingContainer;
        const bottomRightContainer = bottomRightGrid?._scrollingContainer;
        const currentScrollLeft = bottomRightContainer?.scrollLeft ?? topRightContainer?.scrollLeft ?? 0;
        const maxScrollLeft = Math.max(0, (bottomRightContainer?.scrollWidth ?? topRightContainer?.scrollWidth ?? 0) - (bottomRightContainer?.clientWidth ?? topRightContainer?.clientWidth ?? 0));
        const nextScrollLeft = Math.min(Math.max(0, currentScrollLeft + deltaX), maxScrollLeft);
        if (bottomRightContainer) {
            bottomRightContainer.scrollLeft = nextScrollLeft;
            bottomRightGrid?.handleScrollEvent?.({
                scrollLeft: nextScrollLeft,
                scrollTop: bottomRightContainer.scrollTop
            });
        }
        if (topRightContainer) {
            topRightContainer.scrollLeft = nextScrollLeft;
            topRightGrid?.handleScrollEvent?.({
                scrollLeft: nextScrollLeft,
                scrollTop: topRightContainer.scrollTop
            });
        }
    }, []);
    const totalWidth = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        let sum = effectiveIndexColWidth;
        for (const c of columns)sum += Math.max((colWidths[c] ?? defaultColMinWidth) + HEADER_PAD, 60);
        return sum;
    }, [
        columns,
        colWidths,
        defaultColMinWidth,
        effectiveIndexColWidth
    ]);
    const dragState = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const recomputeAll = ()=>{
        const g = gridRef.current;
        if (!g) return;
        g.recomputeGridSize?.();
        g.forceUpdateGrids?.();
    };
    const onDragStart = (e, col)=>{
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = colWidths[col] ?? defaultColMinWidth;
        dragState.current = {
            col,
            startX,
            startW
        };
        document.body.style.userSelect = 'none';
        const onMove = (ev)=>{
            const ds = dragState.current;
            if (!ds) return;
            const delta = ev.clientX - ds.startX;
            const nextW = clampColumnWidth(col, ds.startW + delta);
            setManualColWidths((prev)=>({
                    ...prev,
                    [col]: nextW
                }));
            recomputeAll();
        };
        const onUp = ()=>{
            dragState.current = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = '';
            recomputeAll();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };
    const autoFitVisible = (col)=>{
        const rowIndices = getVisibleSampleRowIndices(visibleRowRangeRef.current);
        const finalW = measureColumnWidth(col, rowIndices);
        setManualColWidths((prev)=>({
                ...prev,
                [col]: finalW
            }));
        recomputeAll();
    };
    const clearAllSelections = (opts)=>{
        setSelectedRowIds(new Set());
        setSelectedCells(new Set());
        setFocusedCell(null);
        if (!opts?.preserveRowAnchor) {
            selectionAnchorRef.current = null;
            setSelectionAnchor(null);
        }
        if (!opts?.preserveCellAnchor) {
            cellAnchorRef.current = null;
            setCellAnchor(null);
        }
    };
    const isCellAlreadySelected = (row, col)=>selectedCellsRef.current.has((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ck"])(row, col)) || selectedRowIdsRef.current.has(row);
    const rowHasSelection = (row)=>{
        if (selectedRowIdsRef.current.has(row)) return true;
        if (selectedCellsRef.current.size === 0) return false;
        for (const c of columns)if (selectedCellsRef.current.has((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ck"])(row, c))) return true;
        return false;
    };
    const copyText = async (text)=>{
        try {
            await navigator.clipboard.writeText(text);
        } catch  {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
            } finally{
                document.body.removeChild(ta);
            }
        }
    };
    const getSelectedRectBounds = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((sel)=>{
        if (sel.size === 0) return null;
        const rows = new Set();
        const colsSet = new Set();
        for (const k of sel){
            const { row, col } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseCK"])(k);
            rows.add(row);
            colsSet.add(col);
        }
        const rowList = [
            ...rows
        ].sort((a, b)=>a - b);
        const colList = [
            ...colsSet
        ].sort((a, b)=>columns.indexOf(a) - columns.indexOf(b));
        for (const r of rowList)for (const c of colList)if (!sel.has((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ck"])(r, c))) return null;
        return {
            rows: rowList,
            cols: colList
        };
    }, [
        columns
    ]);
    const getSelectionAsRowsCols = ()=>{
        const currentSelectedCells = selectedCellsRef.current;
        const currentSelectedRowIds = selectedRowIdsRef.current;
        const rect = getSelectedRectBounds(currentSelectedCells);
        if (rect) {
            const { rows, cols } = rect;
            const rows2D = rows.map((r)=>cols.map((c)=>{
                    const v = getDisplayRow(r)?.rowData?.[c];
                    return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                }));
            return {
                rows,
                cols,
                rows2D
            };
        }
        if (currentSelectedCells.size > 0) {
            const list = [
                ...currentSelectedCells
            ].map(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseCK"]);
            const rowSet = new Set(list.map((c)=>c.row));
            const colSet = new Set(list.map((c)=>c.col));
            const rows = [
                ...rowSet
            ].sort((a, b)=>a - b);
            const cols = [
                ...colSet
            ].sort((a, b)=>columns.indexOf(a) - columns.indexOf(b));
            const rows2D = rows.map((r)=>cols.map((c)=>{
                    const has = currentSelectedCells.has((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ck"])(r, c));
                    const v = has ? getDisplayRow(r)?.rowData?.[c] : '';
                    return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                }));
            return {
                rows,
                cols,
                rows2D
            };
        }
        if (currentSelectedRowIds.size > 0) {
            const rows = [
                ...currentSelectedRowIds
            ].sort((a, b)=>a - b);
            const cols = [
                ...columns
            ];
            const rows2D = rows.map((r)=>cols.map((c)=>{
                    const v = getDisplayRow(r)?.rowData?.[c];
                    return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                }));
            return {
                rows,
                cols,
                rows2D
            };
        }
        return null;
    };
    const selectedRectBounds = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>getSelectedRectBounds(selectedCells), [
        getSelectedRectBounds,
        selectedCells
    ]);
    const copyTSV = async (withHeader = false)=>{
        const sel = getSelectionAsRowsCols();
        if (!sel) return;
        const { rows2D, cols } = sel;
        const lines = rows2D.map((r)=>r.join('\t'));
        if (withHeader) lines.unshift(cols.join('\t'));
        await copyText(lines.join('\n'));
    };
    const copySelectedCellsTSV = ()=>copyTSV(false);
    const copySelectedCellsTSVWithHeader = ()=>copyTSV(true);
    function csvEscape(s) {
        if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
            return `"${s.replace(/\"/g, '""')}"`;
        }
        return s;
    }
    function downloadSelectionAsCSV(includeHeader = true) {
        const sel = getSelectionAsRowsCols();
        if (!sel) return;
        const { rows2D, cols } = sel;
        const csvLines = [];
        if (includeHeader) csvLines.push(cols.map(csvEscape).join(','));
        rows2D.forEach((r)=>csvLines.push(r.map(csvEscape).join(',')));
        const csv = csvLines.join('\n');
        const blob = new Blob([
            new Uint8Array([
                0xef,
                0xbb,
                0xbf
            ]),
            csv
        ], {
            type: 'text/csv;charset=utf-8'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `selection-${ts}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    const collectRectCells = (a, b)=>{
        const colIndex = new Map();
        columns.forEach((c, i)=>colIndex.set(c, i));
        const r1 = Math.min(a.row, b.row), r2 = Math.max(a.row, b.row);
        const c1 = Math.min(colIndex.get(a.col), colIndex.get(b.col));
        const c2 = Math.max(colIndex.get(a.col), colIndex.get(b.col));
        const out = [];
        for(let r = r1; r <= r2; r++)for(let ci = c1; ci <= c2; ci++)out.push((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ck"])(r, columns[ci]));
        return out;
    };
    const onRowIndexClick = (e, rowIndex)=>{
        if (e.button !== 0) return;
        if (lastMouseDownWasOnCell.current) return;
        if (e.shiftKey) {
            const anchor = selectionAnchorRef.current ?? rowIndex;
            selectionAnchorRef.current = anchor;
            setSelectionAnchor(anchor);
            const [start, end] = anchor <= rowIndex ? [
                anchor,
                rowIndex
            ] : [
                rowIndex,
                anchor
            ];
            const range = new Set();
            for(let i = start; i <= end; i++)range.add(i);
            setSelectedRowIds((prev)=>{
                const next = new Set(prev);
                range.forEach((i)=>next.add(i));
                return next;
            });
        } else {
            clearAllSelections({
                preserveRowAnchor: true,
                preserveCellAnchor: true
            });
            selectionAnchorRef.current = rowIndex;
            setSelectionAnchor(rowIndex);
            setSelectedRowIds(new Set([
                rowIndex
            ]));
        }
    };
    const onRowIndexKeyDown = async (e)=>{
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            if (selectedCellsRef.current.size > 0) await copySelectedCellsTSV();
            else {
                const indices = Array.from(selectedRowIdsRef.current).sort((a, b)=>a - b);
                const lines = indices.map((i)=>{
                    const row = getDisplayRow(i)?.rowData ?? {};
                    return Object.values(row).map((v)=>v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).join('\t');
                }).join('\n');
                await copyText(lines);
            }
        }
    };
    const endDrag = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        draggingRef.current = false;
        document.body.style.userSelect = '';
    }, []);
    const beginDragRect = (row, col)=>{
        draggingRef.current = true;
        dragMovedRef.current = false;
        document.body.style.userSelect = 'none';
        cellAnchorRef.current = {
            row,
            col
        };
        setCellAnchor(cellAnchorRef.current);
        setSelectedCells(new Set([
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ck"])(row, col)
        ]));
    };
    const updateRectSelection = (row, col)=>{
        const a = cellAnchorRef.current;
        if (!a) return;
        if (a.row !== row || a.col !== col) dragMovedRef.current = true;
        const rect = collectRectCells(a, {
            row,
            col
        });
        setSelectedCells((prev)=>{
            const next = new Set(prev);
            rect.forEach((k)=>next.add(k));
            return next;
        });
    };
    const onCellMouseDown = (e, row, col)=>{
        if (e.button !== 0) return;
        if (editingCell && (editingCell.row !== row || editingCell.col !== col) && !commitCellEdit()) {
            e.preventDefault();
            return;
        }
        e.preventDefault();
        gridContainerRef.current?.focus({
            preventScroll: true
        });
        lastMouseDownWasOnCell.current = true;
        setTimeout(()=>lastMouseDownWasOnCell.current = false, 0);
        setFocusedCell({
            row,
            col
        });
        if (e.shiftKey) {
            const anchor = cellAnchorRef.current ?? {
                row,
                col
            };
            cellAnchorRef.current = anchor;
            setCellAnchor(anchor);
            const rect = collectRectCells(anchor, {
                row,
                col
            });
            setSelectedCells((prev)=>{
                const next = new Set(prev);
                rect.forEach((k)=>next.add(k));
                return next;
            });
            return;
        }
        clearAllSelections({
            preserveCellAnchor: true,
            preserveRowAnchor: true
        });
        cellAnchorRef.current = {
            row,
            col
        };
        setCellAnchor(cellAnchorRef.current);
        setSelectedCells(new Set([
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ck"])(row, col)
        ]));
        beginDragRect(row, col);
        setSelectedRowIds(editable ? new Set() : new Set([
            row
        ]));
    };
    const onCellMouseEnter = (_e, row, col)=>{
        if (!draggingRef.current) return;
        updateRectSelection(row, col);
    };
    const onCellKeyDown = async (e, rowIndex, col)=>{
        if (editingCell?.row === rowIndex && editingCell.col === col) {
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            if (selectedCellsRef.current.size > 1) await copySelectedCellsTSV();
            else {
                const v = getDisplayRow(rowIndex)?.rowData?.[col];
                await copyText(typeof v === 'object' ? JSON.stringify(v) : v == null ? '' : String(v));
            }
        }
    };
    const onGridKeyDown = async (e)=>{
        if (editingCell) {
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) onRedo?.();
            else onUndo?.();
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && editable) {
            e.preventDefault();
            onCommitAll?.();
            return;
        }
        if (focusedCell && !e.metaKey && !e.ctrlKey && !e.altKey) {
            if (e.key === 'Enter') {
                e.preventDefault();
                beginCellEdit(focusedCell.row, focusedCell.col);
                return;
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                moveFocusedCell(e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0, e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0);
                return;
            }
            if (editable && e.key.length === 1) {
                e.preventDefault();
                const state = getEffectiveCellState(focusedCell.row, focusedCell.col);
                beginCellEdit(focusedCell.row, focusedCell.col, state.kind === 'boolean' || state.kind === 'date' ? undefined : e.key);
                return;
            }
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            if (selectedCells.size > 1) {
                await copySelectedCellsTSV();
                return;
            }
            const cell = focusedCell ?? (selectedCells.size > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseCK"])([
                ...selectedCells
            ][0]) : null);
            if (cell) {
                const v = getDisplayRow(cell.row)?.rowData?.[cell.col];
                await copyText(typeof v === 'object' ? JSON.stringify(v) : v == null ? '' : String(v));
                return;
            }
            if (selectedRowIds.size > 0) {
                const indices = Array.from(selectedRowIds).sort((a, b)=>a - b);
                const lines = indices.map((i)=>{
                    const row = getDisplayRow(i)?.rowData ?? {};
                    return Object.values(row).map((v)=>v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).join('\t');
                }).join('\n');
                await copyText(lines);
            }
        }
    };
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const onUp = ()=>{
            if (draggingRef.current) endDrag();
        };
        window.addEventListener('mouseup', onUp);
        return ()=>window.removeEventListener('mouseup', onUp);
    }, [
        endDrag
    ]);
    /* ===== Inspector ===== */ function getSelectionInfo() {
        if (selectedCells.size > 0) {
            const cells = [
                ...selectedCells
            ].map(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseCK"]);
            const uniqueRows = new Set(cells.map((c)=>c.row));
            if (cells.length === 1) return {
                mode: 'singleCell',
                cell: cells[0]
            };
            if (uniqueRows.size === 1) return {
                mode: 'singleRow',
                row: cells[0].row
            };
            return {
                mode: 'multiRow'
            };
        }
        if (selectedRowIds.size === 1) return {
            mode: 'rowOnly',
            row: [
                ...selectedRowIds
            ][0]
        };
        return {
            mode: 'none'
        };
    }
    const sel = getSelectionInfo();
    const contextCell = focusedCell ?? (selectedCells.size > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseCK"])([
        ...selectedCells
    ][0]) : null);
    const contextCellState = contextCell ? getEffectiveCellState(contextCell.row, contextCell.col) : null;
    const showInspectActions = sel.mode === 'singleCell' || sel.mode === 'singleRow' || sel.mode === 'rowOnly';
    const canEditContextCell = Boolean(editable && contextCellState?.editable && contextCell);
    const canSetContextCellToNull = Boolean(editable && contextCellState?.nullable && contextCellState.editable && contextCell);
    const canRevertContextCell = Boolean(editable && contextCellState?.changed && contextCell);
    const showEditActions = canEditContextCell || canSetContextCellToNull || canRevertContextCell;
    const showFilterAction = !operationsDisabled && showInspectActions;
    const openCellInspector = (row, col)=>{
        const v = getDisplayRow(row)?.rowData?.[col];
        setInspectorMode?.('cell');
        setInspectorPayload?.({
            row,
            col,
            value: v
        });
        setInspectorOpen?.(true);
    };
    const openRowInspector = (rowIndex)=>{
        const rowData = getDisplayRow(rowIndex)?.rowData ?? {};
        onActiveRowChange?.(rowIndex);
        setInspectorMode?.('row');
        setInspectorPayload?.({
            row: rowIndex,
            rowData
        });
        setInspectorOpen?.(true);
    };
    const applyQuickEqualsFilterForCell = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((rowIndex, colName)=>{
        const colMeta = (columnsRaw ?? []).find((c)=>c.name === colName);
        const cellVal = getDisplayRow(rowIndex)?.rowData?.[colName];
        setColumnFilter((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$filter$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildEqualsFilterFromCell"])({
            colName,
            colType: colMeta?.type,
            raw: cellVal
        }));
    }, [
        columnsRaw,
        getDisplayRow,
        setColumnFilter
    ]);
    const cellRenderer = ({ columnIndex, rowIndex, key, style })=>{
        if (rowIndex === 0) {
            if (columnIndex === 0) {
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    style: {
                        ...style,
                        display: 'flex',
                        alignItems: 'center'
                    },
                    className: "px-2 py-1 border-b border-r bg-muted text-sm font-bold select-none",
                    title: t('VTable.Header.RowNumberTitle'),
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "block truncate min-w-0 w-full text-center",
                        children: "#"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                        lineNumber: 1338,
                        columnNumber: 25
                    }, this)
                }, key, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                    lineNumber: 1332,
                    columnNumber: 21
                }, this);
            }
            const col = columns[columnIndex - 1];
            const isSorted = sortBy === col;
            const existing = getColumnFilter(col);
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    ...style,
                    display: 'flex',
                    alignItems: 'center'
                },
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('relative px-2 py-1 border-b border-r bg-muted text-sm font-bold select-none whitespace-nowrap', existing && PRIMARY_SELECTION_SOFT_CLASS),
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('flex flex-1 text-left min-w-0 overflow-hidden whitespace-nowrap', ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : 'cursor-pointer'),
                        disabled: operationsDisabled,
                        onClick: ()=>handleSort(col),
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "truncate block min-w-0",
                                children: col
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                                lineNumber: 1357,
                                columnNumber: 25
                            }, this),
                            !operationsDisabled && isSorted && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "ml-1",
                                children: sortDirection === 'asc' ? '↑' : '↓'
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                                lineNumber: 1358,
                                columnNumber: 61
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                        lineNumber: 1351,
                        columnNumber: 21
                    }, this),
                    !operationsDisabled && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$ColumnFIlter$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ColumnFilterPopover"], {
                        ...getColumnFilterPopoverProps(col)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                        lineNumber: 1361,
                        columnNumber: 45
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        onMouseDown: (e)=>onDragStart(e, col),
                        onDoubleClick: ()=>autoFitVisible(col),
                        className: "absolute right-0 top-0 h-full w-2 cursor-col-resize select-none",
                        style: {
                            transform: 'translateX(50%)'
                        }
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                        lineNumber: 1363,
                        columnNumber: 21
                    }, this)
                ]
            }, key, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                lineNumber: 1346,
                columnNumber: 17
            }, this);
        }
        const r = rowIndex - 1;
        if (columnIndex === 0) {
            const isRowSelected = selectedRowIds.has(r);
            const hasPendingChanges = Boolean(isRowChanged?.(r));
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    ...style,
                    display: 'flex',
                    alignItems: 'center'
                },
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('px-2 text-sm border-b border-r bg-card select-none cursor-pointer font-medium text-muted-foreground outline-none', (isRowSelected || activeRowIndex === r) && PRIMARY_SELECTION_CLASS, 'focus:ring-2 focus:ring-primary/40'),
                role: "button",
                tabIndex: 0,
                "data-row-index": r,
                onClick: (e)=>{
                    onRowIndexClick(e, r);
                    if (autoOpenRowInspector && !e.shiftKey) openRowInspector(r);
                },
                onKeyDown: onRowIndexKeyDown,
                onContextMenu: (e)=>{
                    const rowIdx = r;
                    if (rowHasSelection(rowIdx)) return;
                    if (e.shiftKey) {
                        const anchor = selectionAnchorRef.current ?? rowIdx;
                        selectionAnchorRef.current = anchor;
                        setSelectionAnchor(anchor);
                        const [start, end] = anchor <= rowIdx ? [
                            anchor,
                            rowIdx
                        ] : [
                            rowIdx,
                            anchor
                        ];
                        setSelectedRowIds((prev)=>{
                            const next = new Set(prev);
                            for(let i = start; i <= end; i++)next.add(i);
                            return next;
                        });
                    } else {
                        clearAllSelections({
                            preserveRowAnchor: true,
                            preserveCellAnchor: true
                        });
                        selectionAnchorRef.current = rowIdx;
                        setSelectionAnchor(rowIdx);
                        setSelectedRowIds(new Set([
                            rowIdx
                        ]));
                    }
                },
                title: t('VTable.RowIndexHint'),
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "relative inline-flex items-center justify-center",
                    children: [
                        r + 1,
                        hasPendingChanges ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            "data-testid": "pending-row-indicator",
                            className: "absolute -right-3 h-1.5 w-1.5 rounded-full bg-orange-500",
                            "aria-label": t('VTable.ChangedRow')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                            lineNumber: 1419,
                            columnNumber: 29
                        }, this) : null
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                    lineNumber: 1416,
                    columnNumber: 21
                }, this)
            }, key, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                lineNumber: 1378,
                columnNumber: 17
            }, this);
        }
        const colKeyName = columns[columnIndex - 1];
        const keyCell = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ck"])(r, colKeyName);
        const displayRow = getDisplayRow(r);
        const isRemoteRowLoading = isRemote && !displayRow;
        const isRowSelected = selectedRowIds.has(r);
        const isCellSelected = selectedCells.has(keyCell);
        const isFocused = focusedCell?.row === r && focusedCell?.col === colKeyName;
        const cellValue = displayRow?.rowData?.[colKeyName];
        const cellEditState = getEffectiveCellState(r, colKeyName);
        const isEditing = editingCell?.row === r && editingCell.col === colKeyName;
        const isRectSelectedCell = Boolean(selectedRectBounds && isCellSelected);
        const rectTopRow = selectedRectBounds?.rows[0];
        const rectBottomRow = selectedRectBounds?.rows[selectedRectBounds.rows.length - 1];
        const rectLeftCol = selectedRectBounds?.cols[0];
        const rectRightCol = selectedRectBounds?.cols[selectedRectBounds.cols.length - 1];
        const selectionEdgeShadow = isRectSelectedCell ? [
            r === rectTopRow ? 'inset 0 1px 0 var(--primary)' : '',
            r === rectBottomRow ? 'inset 0 -1px 0 var(--primary)' : '',
            colKeyName === rectLeftCol ? 'inset 1px 0 0 var(--primary)' : '',
            colKeyName === rectRightCol ? 'inset -1px 0 0 var(--primary)' : ''
        ].filter(Boolean).join(', ') : undefined;
        const cellStateShadow = selectionEdgeShadow ?? (isFocused || isCellSelected ? 'inset 0 0 0 1px var(--primary)' : cellEditState.changed ? 'inset 0 0 0 1px color-mix(in oklab, var(--color-orange-500) 50%, transparent)' : undefined);
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            role: "button",
            tabIndex: 0,
            "data-cell": keyCell,
            "data-active-row": activeRowIndex === r ? 'true' : undefined,
            "data-changed": cellEditState.changed ? 'true' : undefined,
            style: {
                ...style,
                display: 'flex',
                alignItems: 'center',
                backgroundColor: cellEditState.changed ? 'color-mix(in oklab, var(--color-orange-500) 15%, var(--card))' : undefined,
                boxShadow: cellStateShadow
            },
            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('relative px-2 text-sm border-b border-r bg-card cursor-pointer outline-none select-none', 'min-w-0 overflow-hidden', (isRowSelected || activeRowIndex === r) && PRIMARY_SELECTION_SUBTLE_CLASS, isCellSelected && PRIMARY_SELECTION_CLASS, cellEditState.changed && '!text-orange-700 dark:!text-orange-300', isFocused && !isRectSelectedCell && PRIMARY_SELECTION_RING_CLASS, !isCellSelected && 'focus:ring-1 focus:ring-inset focus:ring-primary/40'),
            onMouseDown: (e)=>onCellMouseDown(e, r, colKeyName),
            onMouseEnter: (e)=>onCellMouseEnter(e, r, colKeyName),
            onClick: (e)=>{
                if (autoOpenRowInspector && !e.shiftKey && !dragMovedRef.current) openRowInspector(r);
            },
            onDoubleClick: (e)=>{
                e.preventDefault();
                e.stopPropagation();
                if (cellEditState.editable) {
                    beginCellEdit(r, colKeyName);
                } else {
                    openCellInspector(r, colKeyName);
                }
            },
            onKeyDown: (e)=>onCellKeyDown(e, r, colKeyName),
            onContextMenu: ()=>{
                if (!isCellAlreadySelected(r, colKeyName)) {
                    clearAllSelections({
                        preserveCellAnchor: true,
                        preserveRowAnchor: true
                    });
                    setFocusedCell({
                        row: r,
                        col: colKeyName
                    });
                    cellAnchorRef.current = {
                        row: r,
                        col: colKeyName
                    };
                    setCellAnchor(cellAnchorRef.current);
                    setSelectedCells(new Set([
                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ck"])(r, colKeyName)
                    ]));
                    setSelectedRowIds(editable ? new Set() : new Set([
                        r
                    ]));
                }
            },
            title: cellEditState.readOnlyReason ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatTooltip"])(cellValue),
            children: isRemoteRowLoading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "block h-3 w-20 max-w-[70%] rounded-sm bg-muted"
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                lineNumber: 1511,
                columnNumber: 21
            }, this) : isEditing ? cellEditState.kind === 'boolean' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                autoFocus: true,
                value: editingCell.draft,
                className: "absolute inset-0 h-full w-full min-w-0 box-border border-0 bg-transparent px-2 text-sm outline-none",
                onMouseDown: (event)=>event.stopPropagation(),
                onChange: (event)=>setEditingCell((current)=>current ? {
                            ...current,
                            draft: event.target.value,
                            error: null
                        } : current),
                onBlur: ()=>{
                    if (editingCancelledRef.current) {
                        editingCancelledRef.current = false;
                        return;
                    }
                    commitCellEdit();
                },
                onKeyDown: (event)=>{
                    event.stopPropagation();
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        editingCancelledRef.current = true;
                        setEditingCell(null);
                        gridContainerRef.current?.focus({
                            preventScroll: true
                        });
                    } else if (event.key === 'Enter') {
                        event.preventDefault();
                        commitCellEdit();
                    } else if (event.key === 'Tab') {
                        event.preventDefault();
                        commitCellEdit(event.shiftKey ? 'previous' : 'next');
                    }
                },
                children: [
                    editingCell.draft === '' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                        value: "",
                        disabled: true,
                        children: "NULL"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                        lineNumber: 1544,
                        columnNumber: 33
                    }, this) : null,
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                        value: "true",
                        children: "true"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                        lineNumber: 1548,
                        columnNumber: 29
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                        value: "false",
                        children: "false"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                        lineNumber: 1549,
                        columnNumber: 29
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                lineNumber: 1514,
                columnNumber: 25
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                autoFocus: true,
                value: editingCell.draft,
                type: cellEditState.kind === 'date' ? /timestamp|datetime/i.test(cellEditState.meta?.type ?? '') ? 'datetime-local' : /time/i.test(cellEditState.meta?.type ?? '') ? 'time' : 'date' : 'text',
                inputMode: cellEditState.kind === 'number' || cellEditState.kind === 'precise-number' ? 'decimal' : undefined,
                "aria-invalid": Boolean(editingCell.error),
                title: editingCell.error ?? undefined,
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('absolute inset-0 h-full w-full min-w-0 box-border border-0 bg-transparent px-2 text-sm outline-none', (cellEditState.kind === 'number' || cellEditState.kind === 'precise-number') && 'font-mono tabular-nums', editingCell.error && 'text-destructive'),
                onMouseDown: (event)=>event.stopPropagation(),
                onChange: (event)=>setEditingCell((current)=>current ? {
                            ...current,
                            draft: event.target.value,
                            error: null
                        } : current),
                onBlur: ()=>{
                    if (editingCancelledRef.current) {
                        editingCancelledRef.current = false;
                        return;
                    }
                    commitCellEdit();
                },
                onKeyDown: (event)=>{
                    event.stopPropagation();
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        editingCancelledRef.current = true;
                        setEditingCell(null);
                        gridContainerRef.current?.focus({
                            preventScroll: true
                        });
                    } else if (event.key === 'Enter') {
                        event.preventDefault();
                        commitCellEdit();
                    } else if (event.key === 'Tab') {
                        event.preventDefault();
                        commitCellEdit(event.shiftKey ? 'previous' : 'next');
                    }
                }
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                lineNumber: 1552,
                columnNumber: 25
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('block min-w-0 w-full truncate', editable && cellValue == null && 'font-mono text-xs italic text-muted-foreground'),
                children: editable && cellValue == null ? 'NULL' : (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatValue"])(cellValue)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                lineNumber: 1599,
                columnNumber: 21
            }, this)
        }, key, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
            lineNumber: 1460,
            columnNumber: 13
        }, this);
    };
    const latestCellRendererRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(cellRenderer);
    latestCellRendererRef.current = cellRenderer;
    const stableCellRenderer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((props)=>latestCellRendererRef.current(props), []);
    const handleSectionRendered = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(({ columnStartIndex, columnStopIndex, rowStartIndex, rowStopIndex })=>{
        const nextStart = Math.max(0, rowStartIndex - 1);
        const nextStop = Math.max(nextStart, rowStopIndex - 1);
        visibleRowRangeRef.current = {
            start: nextStart,
            stop: nextStop
        };
        const nextColumnStart = Math.max(0, columnStartIndex - 1);
        const nextColumnStop = Math.max(nextColumnStart, columnStopIndex - 1);
        const prevColumnRange = visibleColumnRangeRef.current;
        if (prevColumnRange.start !== nextColumnStart || prevColumnRange.stop !== nextColumnStop) {
            visibleColumnRangeRef.current = {
                start: nextColumnStart,
                stop: nextColumnStop
            };
        }
        if (isRemote) {
            requestRemoteRange(Math.max(0, nextStart - 30), Math.min(tableRowCount - 1, nextStop + 60));
        }
    }, [
        isRemote,
        requestRemoteRange,
        tableRowCount
    ]);
    const refreshGridAfterReveal = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        if (isRemote) {
            const renderedRows = [
                ...gridContainerRef.current?.querySelectorAll('[data-cell]') ?? []
            ].map((element)=>element.dataset.cell).filter((cell)=>Boolean(cell)).map((cell)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseCK"])(cell).row).filter(Number.isFinite);
            const start = renderedRows.length > 0 ? Math.min(...renderedRows) : visibleRowRangeRef.current.start;
            const stop = renderedRows.length > 0 ? Math.max(...renderedRows) : visibleRowRangeRef.current.stop;
            visibleRowRangeRef.current = {
                start,
                stop
            };
            requestRemoteRange(Math.max(0, start - 30), Math.min(tableRowCount - 1, stop + 60));
        }
    }, [
        isRemote,
        requestRemoteRange,
        tableRowCount
    ]);
    const hydrateVisibleRemoteCells = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        if (!isRemote) return;
        const container = gridContainerRef.current;
        if (!container) return;
        container.querySelectorAll('[data-cell]').forEach((element)=>{
            const rawCell = element.dataset.cell;
            if (!rawCell) return;
            const { row, col } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseCK"])(rawCell);
            const displayRow = remoteRowsRef.current.get(row);
            if (!displayRow) return;
            const content = element.firstElementChild;
            if (!content) return;
            const value = displayRow.rowData[col];
            content.className = 'block truncate min-w-0 w-full';
            content.textContent = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatValue"])(value);
            element.title = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatTooltip"])(value);
        });
    }, [
        isRemote
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLayoutEffect"])(()=>{
        hydrateVisibleRemoteCells();
    }, [
        hydrateVisibleRemoteCells,
        remoteRowsVersion
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const refreshActiveGrid = ()=>{
            const container = gridContainerRef.current;
            if (!container) return;
            const { width, height } = container.getBoundingClientRect();
            if (width > 0 && height > 0) {
                refreshGridAfterReveal();
                hydrateVisibleRemoteCells();
            }
        };
        window.addEventListener('dory:sql-tab-activated', refreshActiveGrid);
        return ()=>window.removeEventListener('dory:sql-tab-activated', refreshActiveGrid);
    }, [
        hydrateVisibleRemoteCells,
        refreshGridAfterReveal
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLayoutEffect"])(()=>{
        if (!isActive) return;
        const frameId = requestAnimationFrame(refreshGridAfterReveal);
        return ()=>cancelAnimationFrame(frameId);
    }, [
        isActive,
        refreshGridAfterReveal
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLayoutEffect"])(()=>{
        const container = gridContainerRef.current;
        if (!container) return;
        let wasVisible = false;
        const refreshWhenVisible = ()=>{
            const { width, height } = container.getBoundingClientRect();
            const isVisible = width > 0 && height > 0;
            if (!isVisible) {
                wasVisible = false;
                return;
            }
            if (wasVisible) return;
            wasVisible = true;
            refreshGridAfterReveal();
            hydrateVisibleRemoteCells();
        };
        refreshWhenVisible();
        const resizeObserver = new ResizeObserver(refreshWhenVisible);
        resizeObserver.observe(container);
        const visibilityObserver = new MutationObserver(refreshWhenVisible);
        let ancestor = container.parentElement;
        while(ancestor && ancestor !== document.body){
            visibilityObserver.observe(ancestor, {
                attributes: true,
                attributeFilter: [
                    'class',
                    'hidden',
                    'style'
                ]
            });
            ancestor = ancestor.parentElement;
        }
        return ()=>{
            resizeObserver.disconnect();
            visibilityObserver.disconnect();
        };
    }, [
        hydrateVisibleRemoteCells,
        refreshGridAfterReveal
    ]);
    const getGridColumnWidth = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(({ index })=>{
        if (index === 0) return effectiveIndexColWidth;
        const col = columns[index - 1];
        const base = Math.max(colWidths[col] ?? defaultColMinWidth, 60);
        return base + HEADER_PAD;
    }, [
        colWidths,
        columns,
        defaultColMinWidth,
        effectiveIndexColWidth
    ]);
    const getGridRowHeight = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(({ index })=>index === 0 ? Math.max(rowHeight, 32) : rowHeight, [
        rowHeight
    ]);
    const latestSectionRenderedRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(handleSectionRendered);
    latestSectionRenderedRef.current = handleSectionRendered;
    const stableSectionRendered = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((props)=>latestSectionRenderedRef.current(props), []);
    const latestGridColumnWidthRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(getGridColumnWidth);
    latestGridColumnWidthRef.current = getGridColumnWidth;
    const stableGridColumnWidth = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((props)=>latestGridColumnWidthRef.current(props), []);
    const latestGridRowHeightRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(getGridRowHeight);
    latestGridRowHeightRef.current = getGridRowHeight;
    const stableGridRowHeight = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((props)=>latestGridRowHeightRef.current(props), []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLayoutEffect"])(()=>{
        const container = gridContainerRef.current;
        if (!container) return;
        const rectBounds = getSelectedRectBounds(selectedCells);
        const rectTopRow = rectBounds?.rows[0];
        const rectBottomRow = rectBounds?.rows[rectBounds.rows.length - 1];
        const rectLeftCol = rectBounds?.cols[0];
        const rectRightCol = rectBounds?.cols[rectBounds.cols.length - 1];
        container.querySelectorAll('[data-cell]').forEach((element)=>{
            const rawCell = element.dataset.cell;
            if (!rawCell) return;
            const { row, col } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseCK"])(rawCell);
            const isRowSelected = selectedRowIds.has(row) || activeRowIndex === row;
            const isCellSelected = selectedCells.has(rawCell);
            const isFocused = focusedCell?.row === row && focusedCell.col === col;
            element.classList.remove(...SELECTION_CLASS_NAMES);
            if (isRowSelected) element.classList.add(...PRIMARY_SELECTION_SUBTLE_CLASS.split(' '));
            if (isCellSelected) element.classList.add(...PRIMARY_SELECTION_CLASS.split(' '));
            if (isFocused && !rectBounds) element.classList.add(...PRIMARY_SELECTION_RING_CLASS.split(' '));
            element.style.boxShadow = rectBounds && isCellSelected ? [
                row === rectTopRow ? 'inset 0 1px 0 var(--primary)' : '',
                row === rectBottomRow ? 'inset 0 -1px 0 var(--primary)' : '',
                col === rectLeftCol ? 'inset 1px 0 0 var(--primary)' : '',
                col === rectRightCol ? 'inset -1px 0 0 var(--primary)' : ''
            ].filter(Boolean).join(', ') : '';
        });
        container.querySelectorAll('[data-row-index]').forEach((element)=>{
            const rowIndex = Number(element.dataset.rowIndex);
            element.classList.remove(...PRIMARY_SELECTION_CLASS.split(' '));
            if (selectedRowIds.has(rowIndex) || activeRowIndex === rowIndex) element.classList.add(...PRIMARY_SELECTION_CLASS.split(' '));
        });
    }, [
        activeRowIndex,
        focusedCell,
        getSelectedRectBounds,
        selectedCells,
        selectedRowIds
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const g = gridRef.current;
        g?.recomputeGridSize?.();
        g?.forceUpdateGrids?.();
    }, [
        colWidths,
        rowHeight,
        totalWidth
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const container = gridContainerRef.current;
        if (!container) {
            return;
        }
        const handleWheel = (event)=>{
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }
            if (!target.closest('.TopRightGrid_ScrollWrapper')) {
                return;
            }
            const horizontalDelta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
            if (horizontalDelta === 0) {
                return;
            }
            event.preventDefault();
            syncHeaderHorizontalScroll(horizontalDelta);
        };
        container.addEventListener('wheel', handleWheel, {
            passive: false,
            capture: true
        });
        return ()=>{
            container.removeEventListener('wheel', handleWheel, true);
        };
    }, [
        syncHeaderHorizontalScroll,
        columns.length,
        tableRowCount
    ]);
    const renderGrid = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(({ width, height })=>{
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(VersionedMultiGrid, {
            ref: gridRef,
            dataVersion: String(remoteRowsVersion),
            onSectionRendered: stableSectionRendered,
            width: width,
            height: height,
            columnCount: columns.length + 1,
            rowCount: tableRowCount + 1,
            fixedRowCount: 1,
            fixedColumnCount: 1,
            overscanRowCount: 80,
            overscanColumnCount: 2,
            enableFixedColumnScroll: true,
            enableFixedRowScroll: true,
            scrollToAlignment: "start",
            columnWidth: stableGridColumnWidth,
            rowHeight: stableGridRowHeight,
            cellRenderer: stableCellRenderer,
            classNameTopLeftGrid: "bg-muted",
            classNameTopRightGrid: "bg-muted",
            classNameBottomLeftGrid: "bg-card",
            classNameBottomRightGrid: "bg-card",
            hideTopRightGridScrollbar: true,
            hideBottomLeftGridScrollbar: true,
            styleTopRightGrid: TOP_RIGHT_GRID_STYLE,
            styleBottomLeftGrid: BOTTOM_LEFT_GRID_STYLE,
            styleTopLeftGrid: TOP_LEFT_GRID_STYLE,
            styleBottomRightGrid: BOTTOM_RIGHT_GRID_STYLE,
            style: GRID_STYLE
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
            lineNumber: 1830,
            columnNumber: 17
        }, this);
    }, [
        columns.length,
        remoteRowsVersion,
        stableCellRenderer,
        stableGridColumnWidth,
        stableGridRowHeight,
        stableSectionRendered,
        tableRowCount
    ]);
    const gridElement = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$virtualized$2f$dist$2f$es$2f$AutoSizer$2f$AutoSizer$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AutoSizer$3e$__["AutoSizer"], {
            children: renderGrid
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
            lineNumber: 1864,
            columnNumber: 39
        }, this), [
        renderGrid
    ]);
    // const clearQuery = () => setGlobalQuery('');
    if (!isRemote && (!results || results.length === 0)) return null;
    if (isRemote && tableRowCount === 0) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenu"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuTrigger"], {
                asChild: true,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "w-full h-full border overflow-hidden flex flex-col bg-card",
                    "data-testid": "vtable-surface",
                    children: [
                        showFiltersBar && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$VTableFilters$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["VTableFilters"], {
                            activeFilters: activeFilters,
                            columnsRaw: columnsRaw ?? [],
                            onUpsertFilter: setColumnFilter,
                            onRemoveFilter: removeFilter,
                            onClearAllFilters: clearAllFilters
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                            lineNumber: 1876,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            ref: gridContainerRef,
                            className: "flex-1 min-h-0 outline-none",
                            tabIndex: 0,
                            onKeyDown: onGridKeyDown,
                            children: gridElement
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                            lineNumber: 1886,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                    lineNumber: 1874,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                lineNumber: 1873,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuContent"], {
                className: "w-60",
                children: [
                    showInspectActions ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuGroup"], {
                        children: [
                            sel.mode === 'singleCell' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuItem"], {
                                onSelect: ()=>{
                                    openCellInspector(sel.cell.row, sel.cell.col);
                                },
                                children: editable ? t('VTable.Context.OpenCellInspector') : t('VTable.Context.ViewCell')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                                lineNumber: 1896,
                                columnNumber: 29
                            }, this) : null,
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuItem"], {
                                onSelect: ()=>{
                                    openRowInspector(sel.mode === 'singleCell' ? sel.cell.row : sel.row);
                                },
                                children: t('VTable.Context.ViewRowDetails')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                                lineNumber: 1904,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                        lineNumber: 1894,
                        columnNumber: 21
                    }, this) : null,
                    showEditActions && sel.mode === 'singleCell' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuSeparator"], {}, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                                lineNumber: 1916,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuGroup"], {
                                children: [
                                    canEditContextCell ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuItem"], {
                                        onSelect: ()=>{
                                            beginCellEdit(sel.cell.row, sel.cell.col);
                                        },
                                        children: t('VTable.Context.EditCell')
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                                        lineNumber: 1919,
                                        columnNumber: 33
                                    }, this) : null,
                                    canSetContextCellToNull ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuItem"], {
                                        onSelect: ()=>{
                                            const originalValue = getDisplayRow(sel.cell.row)?.rowData?.[sel.cell.col];
                                            onCellChange?.({
                                                rowIndex: sel.cell.row,
                                                column: sel.cell.col,
                                                originalValue,
                                                nextValue: null
                                            });
                                        },
                                        children: t('VTable.Context.SetToNull')
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                                        lineNumber: 1928,
                                        columnNumber: 33
                                    }, this) : null,
                                    canRevertContextCell ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuItem"], {
                                        onSelect: ()=>{
                                            onRevertCell?.(sel.cell.row, sel.cell.col);
                                        },
                                        children: t('VTable.Context.RevertCell')
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                                        lineNumber: 1943,
                                        columnNumber: 33
                                    }, this) : null
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                                lineNumber: 1917,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true) : null,
                    showInspectActions ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuSeparator"], {}, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                        lineNumber: 1955,
                        columnNumber: 39
                    }, this) : null,
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuGroup"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuItem"], {
                                disabled: !hasAnySelection,
                                onSelect: async (e)=>{
                                    e.stopPropagation();
                                    await copySelectedCellsTSV();
                                },
                                children: editable && sel.mode === 'singleCell' ? t('VTable.Context.CopyValue') : t('VTable.Context.Copy')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                                lineNumber: 1957,
                                columnNumber: 21
                            }, this),
                            editable && contextCell ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuItem"], {
                                onSelect: async (e)=>{
                                    e.stopPropagation();
                                    const row = getDisplayRow(contextCell.row)?.rowData ?? {};
                                    await copyText(JSON.stringify(row, null, 2));
                                },
                                children: t('VTable.Context.CopyRowAsJson')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                                lineNumber: 1967,
                                columnNumber: 25
                            }, this) : null,
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuItem"], {
                                onSelect: async (e)=>{
                                    e.stopPropagation();
                                    await copySelectedCellsTSVWithHeader();
                                },
                                disabled: !hasAnySelection,
                                children: t('VTable.Context.CopyWithHeaders')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                                lineNumber: 1977,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                        lineNumber: 1956,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuSeparator"], {}, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                        lineNumber: 1988,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuGroup"], {
                        children: [
                            showFilterAction ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuItem"], {
                                onSelect: (e)=>{
                                    e.stopPropagation();
                                    const cell = focusedCell ?? (selectedCells.size > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$type$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseCK"])([
                                        ...selectedCells
                                    ][0]) : null);
                                    if (!cell) return;
                                    applyQuickEqualsFilterForCell(cell.row, cell.col);
                                },
                                children: t('VTable.Context.FilterByValue')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                                lineNumber: 1991,
                                columnNumber: 25
                            }, this) : null,
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextMenuItem"], {
                                disabled: !hasAnySelection,
                                onSelect: (e)=>{
                                    e.stopPropagation();
                                    downloadSelectionAsCSV(true);
                                },
                                children: t('VTable.Context.DownloadCsv')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                                lineNumber: 2002,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                        lineNumber: 1989,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
                lineNumber: 1892,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx",
        lineNumber: 1872,
        columnNumber: 9
    }, this);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "InspectorFieldEditor",
    ()=>InspectorFieldEditor
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$key$2d$round$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__KeyRound$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/key-round.js [app-ssr] (ecmascript) <export default as KeyRound>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/rotate-ccw.js [app-ssr] (ecmascript) <export default as RotateCcw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/badge.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/input.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/web-utils/src/index.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$cell$2d$editing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/cell-editing.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
;
function pretty(value) {
    if (value == null) return '';
    return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}
function InspectorFieldEditor({ rowIndex, column, value, state, onChange, onRevert }) {
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])('SqlConsole');
    const inputId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useId"])();
    const kind = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$cell$2d$editing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCellEditorKind"])(column.type);
    const initialDraft = kind === 'date' ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$cell$2d$editing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["toDateEditDraft"])(value, column.type) : (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$cell$2d$editing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["toEditDraft"])(value);
    const [draft, setDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(initialDraft);
    const [dirty, setDirty] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const cancelledRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    const nullable = state.nullable ?? column.nullable ?? false;
    const readOnly = !state.editable || kind === 'complex';
    const helperText = error ?? (!state.editable && state.readOnlyReason ? state.readOnlyReason : '');
    const showFooter = Boolean(helperText) || nullable && state.editable;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        setDraft(kind === 'date' ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$cell$2d$editing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["toDateEditDraft"])(value, column.type) : (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$cell$2d$editing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["toEditDraft"])(value));
        setDirty(false);
        setError(null);
    }, [
        column.type,
        kind,
        value
    ]);
    const commitDraft = ()=>{
        if (!dirty || readOnly) return true;
        try {
            const nextValue = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$cell$2d$editing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseEditDraft"])(kind, draft, {
                chooseBoolean: t('VTable.Edit.ChooseBoolean'),
                invalidNumber: t('VTable.Edit.InvalidNumber')
            });
            onChange(nextValue);
            setDirty(false);
            setError(null);
            return true;
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : String(nextError));
            return false;
        }
    };
    const handleBlur = ()=>{
        if (cancelledRef.current) {
            cancelledRef.current = false;
            return;
        }
        commitDraft();
    };
    const handleKeyDown = (event)=>{
        if (event.key === 'Escape') {
            event.preventDefault();
            cancelledRef.current = true;
            setDraft(initialDraft);
            setDirty(false);
            setError(null);
            event.currentTarget.blur();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            commitDraft();
        }
    };
    const commonClassName = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('h-8 bg-background text-sm', state.changed && 'border-orange-500/60 bg-orange-500/5 focus-visible:ring-orange-500/30', value === null && 'text-muted-foreground');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-testid": "row-editor-field",
        "data-column": column.name,
        "data-changed": state.changed ? 'true' : undefined,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('space-y-1.5 rounded-md border p-2.5', state.changed && 'border-orange-500/40 bg-orange-500/5'),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex min-w-0 items-center justify-between gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        htmlFor: inputId,
                        className: "flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground",
                        children: [
                            column.isPrimaryKey ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$key$2d$round$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__KeyRound$3e$__["KeyRound"], {
                                className: "size-3.5 shrink-0 text-amber-500",
                                "aria-label": t('VTable.Inspector.PrimaryKey')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                                lineNumber: 115,
                                columnNumber: 44
                            }, this) : null,
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "truncate",
                                children: column.name
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                                lineNumber: 116,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                        lineNumber: 114,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex shrink-0 items-center gap-1",
                        children: [
                            state.changed ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                type: "button",
                                variant: "ghost",
                                size: "icon-sm",
                                className: "size-6 text-orange-700 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-200",
                                "aria-label": t('VTable.Inspector.RevertField', {
                                    field: column.name
                                }),
                                onClick: onRevert,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__["RotateCcw"], {
                                    className: "size-3.5"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                                    lineNumber: 128,
                                    columnNumber: 29
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                                lineNumber: 120,
                                columnNumber: 25
                            }, this) : null,
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Badge"], {
                                variant: "secondary",
                                className: "max-w-32 truncate px-1.5 py-0 text-[10px] font-normal text-muted-foreground",
                                title: column.type ?? undefined,
                                children: column.type || t('VTable.Inspector.UnknownType')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                                lineNumber: 131,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                        lineNumber: 118,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                lineNumber: 113,
                columnNumber: 13
            }, this),
            kind === 'complex' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                className: "max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground",
                title: state.readOnlyReason,
                children: pretty(value) || (value === null ? 'NULL' : '')
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                lineNumber: 138,
                columnNumber: 17
            }, this) : kind === 'boolean' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                id: inputId,
                value: draft,
                disabled: readOnly,
                "aria-invalid": Boolean(error),
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])(commonClassName, 'w-full rounded-md border px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'),
                title: state.readOnlyReason,
                onChange: (event)=>{
                    setDraft(event.target.value);
                    setDirty(true);
                    setError(null);
                },
                onBlur: handleBlur,
                onKeyDown: handleKeyDown,
                children: [
                    value === null ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                        value: "",
                        children: "NULL"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                        lineNumber: 163,
                        columnNumber: 39
                    }, this) : null,
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                        value: "true",
                        children: t('VTable.Inspector.BooleanTrue')
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                        lineNumber: 164,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                        value: "false",
                        children: t('VTable.Inspector.BooleanFalse')
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                        lineNumber: 165,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                lineNumber: 145,
                columnNumber: 17
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Input"], {
                id: inputId,
                type: kind === 'date' ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$cell$2d$editing$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getDateInputType"])(column.type) : kind === 'number' ? 'number' : 'text',
                inputMode: kind === 'number' || kind === 'precise-number' ? 'decimal' : undefined,
                value: draft,
                disabled: readOnly,
                placeholder: value === null ? 'NULL' : undefined,
                "aria-invalid": Boolean(error),
                className: commonClassName,
                title: state.readOnlyReason,
                onChange: (event)=>{
                    setDraft(event.target.value);
                    setDirty(true);
                    setError(null);
                },
                onBlur: handleBlur,
                onKeyDown: handleKeyDown
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                lineNumber: 168,
                columnNumber: 17
            }, this),
            showFooter ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex min-h-5 items-start justify-between gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "min-w-0 text-[11px] leading-5 text-destructive",
                        role: error ? 'alert' : undefined,
                        children: helperText
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                        lineNumber: 190,
                        columnNumber: 21
                    }, this),
                    nullable && state.editable ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                        type: "button",
                        variant: value === null ? 'secondary' : 'ghost',
                        size: "sm",
                        className: "h-5 shrink-0 px-1.5 text-[11px]",
                        disabled: value === null,
                        onMouseDown: (event)=>event.preventDefault(),
                        onClick: ()=>{
                            onChange(null);
                            setDraft('');
                            setDirty(false);
                            setError(null);
                        },
                        children: value === null ? 'NULL' : t('VTable.Inspector.SetNull')
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                        lineNumber: 194,
                        columnNumber: 25
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                lineNumber: 189,
                columnNumber: 17
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "sr-only",
                children: t('VTable.Inspector.RowOnly', {
                    row: rowIndex + 1
                })
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
                lineNumber: 213,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx",
        lineNumber: 107,
        columnNumber: 9
    }, this);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "InspectorPanel",
    ()=>InspectorPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/web-utils/src/index.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2d$open$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRightOpen$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/panel-right-open.js [app-ssr] (ecmascript) <export default as PanelRightOpen>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$dom$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-dom.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$copy$2d$button$2f$index$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/@dory/ui/copy-button/index.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$sql$2d$console$2d$overlay$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/sql-console-overlay.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$InspectorFieldEditor$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorFieldEditor.tsx [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
;
;
function InspectorPanel({ open, setOpen, mode, payload, portalContainer, position = 'absolute', rowViewMode, setRowViewMode, inspectorWidth, setInspectorWidth, columnMetas, getCellEditState, onCellChange, onRevertCell, pendingChangesCount, onShowPendingChanges }) {
    const resizeRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [filter, setFilter] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const [defaultPortalContainer, setDefaultPortalContainer] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])('SqlConsole');
    const editorT = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser.Editor');
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLayoutEffect"])(()=>{
        if (!open || portalContainer !== undefined) return;
        setDefaultPortalContainer(document.getElementById(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$sql$2d$console$2d$overlay$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SQL_CONSOLE_OVERLAY_ID"]));
    }, [
        open,
        portalContainer
    ]);
    const startResize = (e)=>{
        e.preventDefault();
        resizeRef.current = {
            startX: e.clientX,
            startW: inspectorWidth
        };
        const onMove = (ev)=>{
            if (!resizeRef.current) return;
            const delta = resizeRef.current.startX - ev.clientX;
            const next = Math.min(Math.max(resizeRef.current.startW + delta, 280), 720);
            setInspectorWidth(next);
        };
        const onUp = ()=>{
            resizeRef.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };
    const pretty = (v)=>v == null ? '' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
    const cellPayload = mode === 'cell' && payload && 'value' in payload ? payload : null;
    const rowPayload = mode === 'row' && payload && 'rowData' in payload ? payload : null;
    const rowEditorAvailable = Boolean(rowPayload && columnMetas?.length && getCellEditState && onCellChange && onRevertCell);
    const rowColumns = columnMetas?.length ? columnMetas : Object.keys(rowPayload?.rowData ?? {}).map((name)=>({
            name
        }));
    const normalizedFilter = filter.trim().toLowerCase();
    const filteredRowColumns = rowPayload ? rowColumns.filter((column)=>{
        if (!normalizedFilter) return true;
        const value = rowPayload.rowData[column.name];
        return `${column.name} ${column.type ?? ''} ${pretty(value)}`.toLowerCase().includes(normalizedFilter);
    }) : [];
    const resolvedPortalContainer = portalContainer === undefined ? defaultPortalContainer : portalContainer;
    if (!open || !resolvedPortalContainer) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$dom$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createPortal"])(/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        "data-testid": "cell-inspector-panel",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('pointer-events-auto inset-y-0 right-0 z-30 flex flex-col border-l bg-card shadow-lg', position === 'fixed' ? 'fixed' : 'absolute'),
        style: {
            width: inspectorWidth
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute left-0 top-0 h-full w-1.5 cursor-col-resize",
                onMouseDown: startResize,
                title: t('VTable.Inspector.ResizeTitle')
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                lineNumber: 115,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "px-3 py-2 border-b flex items-center justify-between shrink-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-sm font-medium",
                        children: [
                            mode === 'cell' && t('VTable.Inspector.TitleCell'),
                            mode === 'row' && t('VTable.Inspector.TitleRow')
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                        lineNumber: 119,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            cellPayload && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$copy$2d$button$2f$index$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CopyButton"], {
                                size: "sm",
                                className: "text-xs px-2 py-1 h-auto",
                                text: pretty(cellPayload.value)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                lineNumber: 124,
                                columnNumber: 37
                            }, this),
                            rowPayload && rowViewMode === 'json' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$copy$2d$button$2f$index$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CopyButton"], {
                                size: "sm",
                                className: "text-xs px-2 py-1 h-auto",
                                text: JSON.stringify(rowPayload.rowData, null, 2),
                                label: t('VTable.Inspector.CopyJson'),
                                copiedLabel: t('VTable.Inspector.CopiedJson')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                lineNumber: 126,
                                columnNumber: 25
                            }, this),
                            rowPayload && rowViewMode === 'table' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$copy$2d$button$2f$index$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CopyButton"], {
                                text: Object.values(rowPayload.rowData).map((v)=>v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).join('\t'),
                                label: t('VTable.Inspector.CopyRow'),
                                size: "sm",
                                className: "text-xs px-2 py-1 h-auto",
                                copiedLabel: t('VTable.Inspector.CopiedRow')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                lineNumber: 135,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "text-xs px-2 py-1 h-auto rounded border hover:bg-accent",
                                onClick: ()=>setOpen(false),
                                title: t('VTable.Inspector.Close'),
                                children: t('VTable.Inspector.Close')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                lineNumber: 145,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                        lineNumber: 123,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                lineNumber: 118,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 overflow-auto p-3 text-sm leading-6",
                children: [
                    cellPayload && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mb-2 text-xs text-muted-foreground",
                                children: t('VTable.Inspector.RowWithColumn', {
                                    row: cellPayload.row + 1,
                                    column: cellPayload.col
                                })
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                lineNumber: 154,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                                className: "whitespace-pre-wrap break-words",
                                children: pretty(cellPayload.value)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                lineNumber: 155,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true),
                    rowPayload && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center justify-between mb-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-xs text-muted-foreground",
                                        children: t('VTable.Inspector.RowOnly', {
                                            row: rowPayload.row + 1
                                        })
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                        lineNumber: 162,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        className: "text-xs px-2 py-1 rounded border hover:bg-accent",
                                        onClick: ()=>setRowViewMode(rowViewMode === 'table' ? 'json' : 'table'),
                                        children: rowViewMode === 'table' ? t('VTable.Inspector.ViewJson') : t('VTable.Inspector.ViewTable')
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                        lineNumber: 163,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                lineNumber: 161,
                                columnNumber: 25
                            }, this),
                            rowViewMode === 'table' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        placeholder: t('VTable.Inspector.FilterPlaceholder'),
                                        className: "w-full mb-2 px-2 py-1 border rounded text-sm",
                                        value: filter,
                                        onChange: (e)=>setFilter(e.target.value)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                        lineNumber: 170,
                                        columnNumber: 33
                                    }, this),
                                    rowEditorAvailable ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "grid grid-cols-1 gap-2",
                                        children: filteredRowColumns.map((column)=>{
                                            const value = rowPayload.rowData[column.name];
                                            const editState = getCellEditState(rowPayload.row, column.name);
                                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$InspectorFieldEditor$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["InspectorFieldEditor"], {
                                                rowIndex: rowPayload.row,
                                                column: column,
                                                value: value,
                                                state: editState,
                                                onChange: (nextValue)=>onCellChange({
                                                        rowIndex: rowPayload.row,
                                                        column: column.name,
                                                        originalValue: value,
                                                        nextValue
                                                    }),
                                                onRevert: ()=>onRevertCell(rowPayload.row, column.name)
                                            }, column.name, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                                lineNumber: 184,
                                                columnNumber: 49
                                            }, this);
                                        })
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                        lineNumber: 179,
                                        columnNumber: 37
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "grid grid-cols-1 gap-2",
                                        children: filteredRowColumns.map((column)=>{
                                            const value = rowPayload.rowData[column.name];
                                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "border rounded p-2",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-xs font-medium text-muted-foreground",
                                                        children: column.name
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                                        lineNumber: 209,
                                                        columnNumber: 53
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-sm break-words whitespace-pre-wrap",
                                                        children: pretty(value)
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                                        lineNumber: 210,
                                                        columnNumber: 53
                                                    }, this)
                                                ]
                                            }, column.name, true, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                                lineNumber: 208,
                                                columnNumber: 49
                                            }, this);
                                        })
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                        lineNumber: 204,
                                        columnNumber: 37
                                    }, this)
                                ]
                            }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                                className: "whitespace-pre-wrap break-words text-xs",
                                children: JSON.stringify(rowPayload.rowData, null, 2)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                                lineNumber: 218,
                                columnNumber: 29
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                        lineNumber: 160,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                lineNumber: 151,
                columnNumber: 13
            }, this),
            pendingChangesCount !== undefined && onShowPendingChanges ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "shrink-0 border-t p-3",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                    type: "button",
                    variant: "outline",
                    size: "sm",
                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('w-full justify-start gap-2 tabular-nums', pendingChangesCount > 0 && 'border-orange-500/40 text-orange-700 hover:border-orange-500/60 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-200'),
                    "data-testid": "inspector-review-changes",
                    onClick: onShowPendingChanges,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2d$open$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRightOpen$3e$__["PanelRightOpen"], {
                            className: "size-4",
                            "aria-hidden": "true"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                            lineNumber: 238,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "flex-1 text-left",
                            children: editorT('ReviewChanges', {
                                count: pendingChangesCount
                            })
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                            lineNumber: 239,
                            columnNumber: 25
                        }, this),
                        pendingChangesCount > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "size-2 rounded-full bg-orange-500",
                            "aria-hidden": "true"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                            lineNumber: 240,
                            columnNumber: 52
                        }, this) : null
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                    lineNumber: 226,
                    columnNumber: 21
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
                lineNumber: 225,
                columnNumber: 17
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx",
        lineNumber: 109,
        columnNumber: 9
    }, this), resolvedPortalContainer);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/Toolbar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Toolbar",
    ()=>Toolbar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/tabs.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/lib/utils.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
'use client';
;
;
;
;
function Toolbar(props) {
    const { className, indices, activeSet, onSetActiveSet } = props;
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])('SqlConsole');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('flex flex-col', className),
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex items-center justify-between w-full border bg-muted",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Tabs"], {
                value: String(activeSet),
                onValueChange: (v)=>onSetActiveSet(Number(v)),
                className: "overflow-hidden",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsList"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                            value: "-1",
                            className: "px-2",
                            children: t('Results.Overview')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/Toolbar.tsx",
                            lineNumber: 39,
                            columnNumber: 25
                        }, this),
                        indices.map((i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                                value: String(i),
                                className: "px-2",
                                children: t('Results.ResultTab', {
                                    index: i + 1
                                })
                            }, i, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/Toolbar.tsx",
                                lineNumber: 43,
                                columnNumber: 29
                            }, this))
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/Toolbar.tsx",
                    lineNumber: 38,
                    columnNumber: 21
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/Toolbar.tsx",
                lineNumber: 37,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/Toolbar.tsx",
            lineNumber: 36,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/Toolbar.tsx",
        lineNumber: 35,
        columnNumber: 9
    }, this);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/utils/format.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "formatBytes",
    ()=>formatBytes,
    "formatCompactDuration",
    ()=>formatCompactDuration,
    "formatDuration",
    ()=>formatDuration,
    "formatNumber",
    ()=>formatNumber,
    "formatRelativeTimestamp",
    ()=>formatRelativeTimestamp,
    "formatTime",
    ()=>formatTime,
    "getResultSetStorageLabel",
    ()=>getResultSetStorageLabel
]);
function formatNumber(n) {
    if (n == null) return '—';
    try {
        return n.toLocaleString();
    } catch  {
        return String(n);
    }
}
function formatBytes(v) {
    if (v == null) return '—';
    const units = [
        'B',
        'KB',
        'MB',
        'GB',
        'TB'
    ];
    let x = v;
    let i = 0;
    while(x >= 1024 && i < units.length - 1){
        x /= 1024;
        i++;
    }
    return `${x.toFixed(x < 10 && i > 0 ? 2 : 0)} ${units[i]}`;
}
function formatDuration(ms) {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms.toFixed(0)} ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)} s`;
    const m = Math.floor(s / 60);
    const rest = (s % 60).toFixed(0);
    return `${m}m ${rest}s`;
}
function formatCompactDuration(ms) {
    if (ms == null || !Number.isFinite(ms)) return '—';
    if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${Number(seconds.toFixed(seconds < 10 ? 2 : 1))}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
}
function formatRelativeTimestamp(timestamp, locale = 'en', now = Date.now()) {
    if (timestamp == null || !Number.isFinite(timestamp)) return null;
    const difference = timestamp - now;
    const absoluteDifference = Math.abs(difference);
    const units = [
        {
            unit: 'year',
            milliseconds: 365 * 24 * 60 * 60 * 1000
        },
        {
            unit: 'month',
            milliseconds: 30 * 24 * 60 * 60 * 1000
        },
        {
            unit: 'day',
            milliseconds: 24 * 60 * 60 * 1000
        },
        {
            unit: 'hour',
            milliseconds: 60 * 60 * 1000
        },
        {
            unit: 'minute',
            milliseconds: 60 * 1000
        },
        {
            unit: 'second',
            milliseconds: 1000
        }
    ];
    const selected = units.find((candidate)=>absoluteDifference >= candidate.milliseconds) ?? units[units.length - 1];
    return new Intl.RelativeTimeFormat(locale, {
        numeric: 'always'
    }).format(Math.round(difference / selected.milliseconds), selected.unit);
}
function getResultSetStorageLabel(params) {
    if (!params.dataAvailability || params.dataAvailability === 'none') return 'NotRetained';
    const isJson = params.storageFormat === 'json' || params.dataAvailability === 'preview-only';
    if (params.artifactStore === 'filesystem') return isJson ? 'LocalJsonPreview' : 'LocalParquet';
    if (params.artifactStore === 's3') return isJson ? 'S3JsonPreview' : 'S3Parquet';
    return isJson ? 'JsonPreview' : 'Parquet';
}
function formatTime(ts) {
    if (!ts) return '—';
    try {
        return new Date(ts).toLocaleString();
    } catch  {
        return '—';
    }
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OverviewTable",
    ()=>OverviewTable
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/triangle-alert.js [app-ssr] (ecmascript) <export default as AlertTriangle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-check.js [app-ssr] (ecmascript) <export default as CheckCircle2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ellipsis$2d$vertical$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__EllipsisVerticalIcon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/ellipsis-vertical.js [app-ssr] (ecmascript) <export default as EllipsisVerticalIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/refresh-cw.js [app-ssr] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/square.js [app-ssr] (ecmascript) <export default as Square>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/use-intl/dist/esm/development/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/web-utils/src/index.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$accordion$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/accordion.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/badge.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/dropdown-menu.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$utils$2f$format$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/utils/format.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
;
function StatusBadge({ status }) {
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])('SqlConsole');
    if (status === 'running') {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Badge"], {
            variant: "outline",
            className: "gap-1.5",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                    className: "h-3.5 w-3.5 animate-spin"
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                    lineNumber: 22,
                    columnNumber: 17
                }, this),
                t('Overview.StatusRunning')
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
            lineNumber: 21,
            columnNumber: 13
        }, this);
    }
    if (status === 'error') {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Badge"], {
            className: "gap-1.5 bg-red-600/10 text-red-700 dark:bg-red-900/40 dark:text-red-100",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__["AlertTriangle"], {
                    className: "h-3.5 w-3.5"
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                    lineNumber: 30,
                    columnNumber: 17
                }, this),
                t('Overview.StatusError')
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
            lineNumber: 29,
            columnNumber: 13
        }, this);
    }
    if (status === 'canceled') {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Badge"], {
            className: "gap-1.5 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__["Square"], {
                    className: "h-3.5 w-3.5"
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                    lineNumber: 38,
                    columnNumber: 17
                }, this),
                t('Overview.StatusCanceled')
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
            lineNumber: 37,
            columnNumber: 13
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Badge"], {
        className: "gap-1.5 bg-green-600/10 text-green-700 dark:bg-green-900/40 dark:text-green-100",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                className: "h-3.5 w-3.5"
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                lineNumber: 46,
                columnNumber: 13
            }, this),
            t('Overview.StatusSuccess')
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
        lineNumber: 45,
        columnNumber: 9
    }, this);
}
function MetadataItem({ label, value, title }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "min-w-0 rounded-md border bg-muted/20 px-3 py-2.5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
                children: label
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                lineNumber: 55,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-1 truncate text-sm font-medium text-foreground",
                title: title ?? value,
                children: value
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                lineNumber: 56,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
        lineNumber: 54,
        columnNumber: 9
    }, this);
}
function OverviewTable(props) {
    const { items, onOpenResultById, onOpenResultBySetIndex } = props;
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])('SqlConsole');
    const locale = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLocale"])();
    const now = Date.now();
    if (!items.length) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-full items-center justify-center px-4 text-sm text-muted-foreground",
            children: t('Overview.Empty')
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
            lineNumber: 70,
            columnNumber: 16
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "h-full overflow-auto bg-card p-3",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$accordion$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Accordion"], {
            type: "single",
            collapsible: true,
            className: "space-y-2",
            children: items.map((item)=>{
                const durationMs = item.durationMs ?? (item.startedAt != null && item.finishedAt != null ? Math.max(0, item.finishedAt - item.startedAt) : null);
                const rows = typeof item.rowsReturned === 'number' ? item.rowsReturned.toLocaleString(locale) : typeof item.rowsAffected === 'number' ? t('Overview.RowsAffected', {
                    value: item.rowsAffected.toLocaleString(locale)
                }) : t('Common.EmptyValue');
                const createdRelative = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$utils$2f$format$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatRelativeTimestamp"])(item.createdAt, locale, now) ?? t('Common.EmptyValue');
                const expiresRelative = item.expiresAt == null ? t('Common.EmptyValue') : item.expiresAt <= now ? t('Overview.Expired') : (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$utils$2f$format$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatRelativeTimestamp"])(item.expiresAt, locale, now) ?? t('Common.EmptyValue');
                const storageLabel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$utils$2f$format$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getResultSetStorageLabel"])(item);
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$accordion$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AccordionItem"], {
                    value: item.id,
                    className: "overflow-hidden rounded-lg border bg-background last:border-b",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex w-full items-start gap-2 px-4 [&>h3]:min-w-0 [&>h3]:flex-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$accordion$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AccordionTrigger"], {
                                    className: "min-w-0 cursor-pointer py-3 hover:no-underline",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex min-w-0 flex-1 items-start gap-3 pr-2",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(StatusBadge, {
                                                status: item.status
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                                lineNumber: 97,
                                                columnNumber: 41
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "min-w-0 flex-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-xs font-semibold text-foreground",
                                                        children: t('Results.ResultTab', {
                                                            index: item.setIndex + 1
                                                        })
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                                        lineNumber: 99,
                                                        columnNumber: 45
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('mt-1 line-clamp-2 font-mono text-xs font-normal text-muted-foreground', item.status === 'error' && 'text-red-600 dark:text-red-400'),
                                                        children: item.sql
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                                        lineNumber: 100,
                                                        columnNumber: 45
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                                lineNumber: 98,
                                                columnNumber: 41
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                        lineNumber: 96,
                                        columnNumber: 37
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                    lineNumber: 95,
                                    columnNumber: 33
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenu"], {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuTrigger"], {
                                            asChild: true,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                                variant: "ghost",
                                                size: "icon",
                                                className: "ml-auto mt-2.5 size-7 shrink-0 cursor-pointer",
                                                "aria-label": t('Overview.Actions'),
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ellipsis$2d$vertical$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__EllipsisVerticalIcon$3e$__["EllipsisVerticalIcon"], {
                                                    className: "size-4"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                                    lineNumber: 114,
                                                    columnNumber: 45
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                                lineNumber: 113,
                                                columnNumber: 41
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                            lineNumber: 112,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuContent"], {
                                            align: "end",
                                            children: [
                                                onOpenResultById ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                                                    onClick: ()=>onOpenResultById(item.id),
                                                    children: t('Overview.ViewResult')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                                    lineNumber: 118,
                                                    columnNumber: 61
                                                }, this) : null,
                                                onOpenResultBySetIndex ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                                                    onClick: ()=>onOpenResultBySetIndex(item.setIndex),
                                                    children: t('Overview.OpenResult')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                                    lineNumber: 120,
                                                    columnNumber: 45
                                                }, this) : null,
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                                                    onClick: ()=>navigator.clipboard.writeText(item.sql),
                                                    children: t('Overview.CopySql')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                                    lineNumber: 122,
                                                    columnNumber: 41
                                                }, this),
                                                item.status === 'error' && item.errorMessage ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                                                    onClick: ()=>navigator.clipboard.writeText(item.errorMessage),
                                                    children: t('Overview.CopyError')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                                    lineNumber: 124,
                                                    columnNumber: 45
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                            lineNumber: 117,
                                            columnNumber: 37
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                    lineNumber: 111,
                                    columnNumber: 33
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                            lineNumber: 94,
                            columnNumber: 29
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$accordion$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AccordionContent"], {
                            className: "border-t px-4 pt-4",
                            children: [
                                item.status === 'error' && item.errorMessage ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300",
                                    children: item.errorMessage
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                    lineNumber: 131,
                                    columnNumber: 37
                                }, this) : null,
                                item.status !== 'error' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid gap-2 sm:grid-cols-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetadataItem, {
                                            label: t('Overview.Rows'),
                                            value: rows
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                            lineNumber: 135,
                                            columnNumber: 41
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetadataItem, {
                                            label: t('Overview.Size'),
                                            value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$utils$2f$format$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatBytes"])(item.byteSize)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                            lineNumber: 136,
                                            columnNumber: 41
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetadataItem, {
                                            label: t('Overview.Storage'),
                                            value: t(`Overview.StorageValues.${storageLabel}`)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                            lineNumber: 137,
                                            columnNumber: 41
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetadataItem, {
                                            label: t('Overview.Created'),
                                            value: createdRelative,
                                            title: item.createdAt == null ? undefined : new Date(item.createdAt).toLocaleString(locale)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                            lineNumber: 138,
                                            columnNumber: 41
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetadataItem, {
                                            label: t('Overview.QueryDuration'),
                                            value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$utils$2f$format$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatCompactDuration"])(durationMs)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                            lineNumber: 143,
                                            columnNumber: 41
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetadataItem, {
                                            label: t('Overview.Expires'),
                                            value: expiresRelative,
                                            title: item.expiresAt == null ? undefined : new Date(item.expiresAt).toLocaleString(locale)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                            lineNumber: 144,
                                            columnNumber: 41
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                                    lineNumber: 134,
                                    columnNumber: 37
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                            lineNumber: 129,
                            columnNumber: 29
                        }, this)
                    ]
                }, item.id, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
                    lineNumber: 93,
                    columnNumber: 25
                }, this);
            })
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
            lineNumber: 75,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx",
        lineNumber: 74,
        columnNumber: 9
    }, this);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/stores/result-table.atoms.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "currentSessionMetaAtom",
    ()=>currentSessionMetaAtom
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/vanilla.mjs [app-ssr] (ecmascript)");
;
const currentSessionMetaAtom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["atom"])({});
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/stores/chart-state.atoms.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "chartStatesByKeyAtom",
    ()=>chartStatesByKeyAtom,
    "viewModesByTabAtom",
    ()=>viewModesByTabAtom
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2f$utils$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/vanilla/utils.mjs [app-ssr] (ecmascript)");
;
const chartStatesByKeyAtom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2f$utils$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["atomWithStorage"])('sqlconsole:result-table:chart-states:v1', {}, undefined, {
    getOnInit: true
});
const viewModesByTabAtom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2f$utils$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["atomWithStorage"])('sqlconsole:result-table:view-modes:v1', {}, undefined, {
    getOnInit: true
});
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ResultStatusBar",
    ()=>ResultStatusBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/triangle-alert.js [app-ssr] (ecmascript) <export default as AlertTriangle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-check.js [app-ssr] (ecmascript) <export default as CheckCircle2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$history$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__History$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/history.js [app-ssr] (ecmascript) <export default as History>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/refresh-cw.js [app-ssr] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/use-intl/dist/esm/development/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/lib/utils.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/tooltip.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$utils$2f$format$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/utils/format.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
function Separator() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        "aria-hidden": "true",
        children: "·"
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
        lineNumber: 13,
        columnNumber: 12
    }, this);
}
const ResultStatusBar = ({ meta, shouldShowLimitNotice, className })=>{
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])('SqlConsole');
    const locale = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLocale"])();
    if (!meta) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex flex-wrap items-center gap-2 border-t bg-card px-3 py-1.5 text-xs text-muted-foreground"
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
            lineNumber: 26,
            columnNumber: 16
        }, ("TURBOPACK compile-time value", void 0));
    }
    const { runningRemote, runningLocal, executionMs, rowsReturned, rowsAffected, byteSize, limitValue, truncated, errorMessage, source } = meta;
    const isRunning = runningRemote || runningLocal;
    const isQueryHistoryResult = source === 'query-history';
    const metrics = [];
    if (!isRunning && typeof executionMs === 'number') {
        metrics.push({
            key: 'duration',
            value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$utils$2f$format$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatCompactDuration"])(executionMs)
        });
    }
    if (!isRunning && typeof rowsReturned === 'number') {
        metrics.push({
            key: 'rows',
            value: t('ResultStatus.Rows', {
                value: rowsReturned.toLocaleString(locale)
            })
        });
    } else if (!isRunning && typeof rowsAffected === 'number' && rowsAffected >= 0) {
        metrics.push({
            key: 'affected',
            value: t('ResultStatus.Affected', {
                value: rowsAffected.toLocaleString(locale)
            })
        });
    }
    if (!isRunning && typeof byteSize === 'number') {
        metrics.push({
            key: 'size',
            value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$utils$2f$format$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatBytes"])(byteSize)
        });
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('flex w-full flex-wrap items-center gap-2 border-t bg-card px-3 py-1.5 text-xs text-muted-foreground', className),
        children: [
            isRunning ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "inline-flex items-center gap-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                        className: "h-3.5 w-3.5 animate-spin"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                        lineNumber: 50,
                        columnNumber: 21
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: [
                            runningRemote ? t('ResultStatus.Running') : t('ResultStatus.Displaying'),
                            "…"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                        lineNumber: 51,
                        columnNumber: 21
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                lineNumber: 49,
                columnNumber: 17
            }, ("TURBOPACK compile-time value", void 0)) : errorMessage ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TooltipProvider"], {
                delayDuration: 150,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Tooltip"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                            asChild: true,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "inline-flex cursor-help items-center gap-1.5 text-red-500",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__["AlertTriangle"], {
                                        className: "h-3.5 w-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                                        lineNumber: 58,
                                        columnNumber: 33
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: t('ResultStatus.Failed')
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                                        lineNumber: 59,
                                        columnNumber: 33
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                                lineNumber: 57,
                                columnNumber: 29
                            }, ("TURBOPACK compile-time value", void 0))
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                            lineNumber: 56,
                            columnNumber: 25
                        }, ("TURBOPACK compile-time value", void 0)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TooltipContent"], {
                            side: "top",
                            className: "max-w-[80vw] whitespace-pre-wrap break-words",
                            children: errorMessage
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                            lineNumber: 62,
                            columnNumber: 25
                        }, ("TURBOPACK compile-time value", void 0))
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                    lineNumber: 55,
                    columnNumber: 21
                }, ("TURBOPACK compile-time value", void 0))
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                lineNumber: 54,
                columnNumber: 17
            }, ("TURBOPACK compile-time value", void 0)) : isQueryHistoryResult ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "inline-flex items-center gap-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$history$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__History$3e$__["History"], {
                        className: "h-3.5 w-3.5"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                        lineNumber: 69,
                        columnNumber: 21
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: t('ResultStatus.HistorySource')
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                        lineNumber: 70,
                        columnNumber: 21
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                lineNumber: 68,
                columnNumber: 17
            }, ("TURBOPACK compile-time value", void 0)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "inline-flex items-center gap-1.5 text-green-600",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                        className: "h-3.5 w-3.5"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                        lineNumber: 74,
                        columnNumber: 21
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: t('ResultStatus.Finished')
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                        lineNumber: 75,
                        columnNumber: 21
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                lineNumber: 73,
                columnNumber: 17
            }, ("TURBOPACK compile-time value", void 0)),
            metrics.map((metric)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "contents",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Separator, {}, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                            lineNumber: 81,
                            columnNumber: 21
                        }, ("TURBOPACK compile-time value", void 0)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            children: metric.value
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                            lineNumber: 82,
                            columnNumber: 21
                        }, ("TURBOPACK compile-time value", void 0))
                    ]
                }, metric.key, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                    lineNumber: 80,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0))),
            shouldShowLimitNotice ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Separator, {}, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                        lineNumber: 88,
                        columnNumber: 21
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "inline-flex items-center gap-1.5 text-amber-700",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__["AlertTriangle"], {
                                className: "h-3.5 w-3.5"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                                lineNumber: 90,
                                columnNumber: 25
                            }, ("TURBOPACK compile-time value", void 0)),
                            t('ResultStatus.LimitNotice', {
                                value: limitValue?.toLocaleString(locale) || t('Common.NotAvailable')
                            })
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                        lineNumber: 89,
                        columnNumber: 21
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true) : null,
            truncated ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Separator, {}, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                        lineNumber: 97,
                        columnNumber: 21
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-amber-600",
                        children: t('ResultStatus.Truncated')
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
                        lineNumber: 98,
                        columnNumber: 21
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true) : null
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx",
        lineNumber: 47,
        columnNumber: 9
    }, ("TURBOPACK compile-time value", void 0));
};
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/stores/active-set.atoms.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OVERVIEW_SET",
    ()=>OVERVIEW_SET,
    "activeSetsAtom",
    ()=>activeSetsAtom,
    "makeActiveSetAtom",
    ()=>makeActiveSetAtom,
    "makeActiveSetStateAtom",
    ()=>makeActiveSetStateAtom,
    "makeAutoSetActiveSetAtom",
    ()=>makeAutoSetActiveSetAtom,
    "makeClearTabActiveSetsAtom",
    ()=>makeClearTabActiveSetsAtom,
    "makeDeleteActiveSetAtom",
    ()=>makeDeleteActiveSetAtom,
    "makeKey",
    ()=>makeKey,
    "makeSetActiveSetAtom",
    ()=>makeSetActiveSetAtom,
    "makeSetUserPickedAtom",
    ()=>makeSetUserPickedAtom,
    "makeUserPickedAtom",
    ()=>makeUserPickedAtom,
    "upsertActiveSetAtom",
    ()=>upsertActiveSetAtom
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/vanilla.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2f$utils$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/vanilla/utils.mjs [app-ssr] (ecmascript)");
;
;
const OVERVIEW_SET = -1;
const activeSetsAtom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2f$utils$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["atomWithStorage"])('activeSets', {});
function makeKey(tabId, sessionId) {
    const t = tabId ?? '';
    const s = sessionId ?? '';
    return `${t}:${s}`;
}
const makeActiveSetAtom = (tabId, sessionId)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2f$utils$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["selectAtom"])(activeSetsAtom, (dict)=>{
        const key = makeKey(tabId, sessionId);
        return dict[key]?.activeSet ?? OVERVIEW_SET;
    });
const makeActiveSetStateAtom = (tabId, sessionId)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2f$utils$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["selectAtom"])(activeSetsAtom, (dict)=>{
        const key = makeKey(tabId, sessionId);
        return dict[key] ?? {
            tabId: tabId ?? '',
            sessionId: sessionId ?? '',
            activeSet: OVERVIEW_SET,
            userPicked: false
        };
    });
const upsertActiveSetAtom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["atom"])(null, (get, set, payload)=>{
    const dict = get(activeSetsAtom);
    const key = makeKey(payload.tabId, payload.sessionId);
    const prev = dict[key];
    const next = {
        tabId: payload.tabId,
        sessionId: payload.sessionId,
        activeSet: payload.activeSet ?? prev?.activeSet ?? OVERVIEW_SET,
        userPicked: payload.userPicked ?? prev?.userPicked ?? false
    };
    if (!prev || prev.activeSet !== next.activeSet || prev.userPicked !== next.userPicked || prev.tabId !== next.tabId || prev.sessionId !== next.sessionId) {
        set(activeSetsAtom, {
            ...dict,
            [key]: next
        });
    }
});
const makeSetActiveSetAtom = (tabId, sessionId, markUserPicked = true)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["atom"])(null, (get, set, activeSet)=>{
        const t = tabId ?? '';
        const s = sessionId ?? '';
        set(upsertActiveSetAtom, {
            tabId: t,
            sessionId: s,
            activeSet,
            userPicked: markUserPicked ? true : undefined
        });
    });
const makeSetUserPickedAtom = (tabId, sessionId)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["atom"])(null, (get, set, userPicked)=>{
        set(upsertActiveSetAtom, {
            tabId: tabId ?? '',
            sessionId: sessionId ?? '',
            userPicked
        });
    });
const makeDeleteActiveSetAtom = (tabId, sessionId)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["atom"])(null, (get, set)=>{
        const dict = get(activeSetsAtom);
        const key = makeKey(tabId, sessionId);
        if (dict[key]) {
            const { [key]: _, ...rest } = dict;
            set(activeSetsAtom, rest);
        }
    });
const makeClearTabActiveSetsAtom = (tabId)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["atom"])(null, (get, set)=>{
        const dict = get(activeSetsAtom);
        const t = (tabId ?? '') + ':';
        let changed = false;
        const next = {};
        for (const [k, v] of Object.entries(dict)){
            if (!k.startsWith(t)) {
                next[k] = v;
            } else {
                changed = true;
            }
        }
        if (changed) set(activeSetsAtom, next);
    });
const makeAutoSetActiveSetAtom = (tabId, sessionId)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["atom"])(null, (get, set, activeSet)=>{
        const dict = get(activeSetsAtom);
        const key = makeKey(tabId, sessionId);
        const prev = dict[key];
        const next = {
            tabId: tabId ?? '',
            sessionId: sessionId ?? '',
            activeSet,
            userPicked: prev?.userPicked ?? false
        };
        if (!prev || prev.activeSet !== next.activeSet || prev.userPicked !== next.userPicked) {
            set(activeSetsAtom, {
                ...dict,
                [key]: next
            });
        }
    });
const makeUserPickedAtom = (tabId, sessionId)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2f$utils$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["selectAtom"])(activeSetsAtom, (dict)=>dict[makeKey(tabId, sessionId)]?.userPicked ?? false, (a, b)=>a === b);
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/hooks/useAutoJumpToLastResult.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useAutoJumpToLastResult",
    ()=>useAutoJumpToLastResult
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
function useAutoJumpToLastResult(opts) {
    const { tabId, sessionId, indices, sessionStatus, finishedAt, userPicked = false, autoSetActiveSet, getCurrentActiveSet } = opts;
    const tabKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>`${tabId ?? ''}:${sessionId ?? ''}`, [
        tabId,
        sessionId
    ]);
    const prevStatusMapRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({});
    const prevMaxMapRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({});
    const prevLenMapRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({});
    const prevFinishMapRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({});
    const jumpedOnFinishRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({});
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const arr = indices ?? [];
        const nextMax = arr.length ? Math.max(...arr) : -1;
        const nextLen = arr.length;
        const prevStatus = prevStatusMapRef.current[tabKey];
        const prevMax = prevMaxMapRef.current[tabKey] ?? -1;
        const prevLen = prevLenMapRef.current[tabKey] ?? 0;
        const prevFinished = prevFinishMapRef.current[tabKey];
        const normFinished = finishedAt instanceof Date ? finishedAt.getTime() : finishedAt;
        const finishedEdge = normFinished != null && normFinished !== prevFinished;
        const statusEdge = prevStatus === 'running' && sessionStatus && sessionStatus !== 'running';
        const justFinished = !!(finishedEdge || statusEdge);
        const resultsIncreased = nextLen > prevLen || nextMax > prevMax;
        const currentRaw = getCurrentActiveSet?.();
        const current = currentRaw == null ? -1 : typeof currentRaw === 'string' ? Number.parseInt(currentRaw, 10) : currentRaw;
        const target = nextLen > 0 ? nextMax : 0;
        const alreadyJumpedThisFinish = finishedEdge && jumpedOnFinishRef.current[tabKey] === normFinished;
        const initialResultLoad = prevLen === 0 && nextLen > 0;
        const shouldDefaultToLastResult = initialResultLoad && !userPicked && current !== target && target >= 0;
        const shouldJump = shouldDefaultToLastResult || justFinished && !userPicked && !alreadyJumpedThisFinish && (resultsIncreased || current !== target) && target >= 0;
        if (shouldJump) {
            if (current !== target) {
                autoSetActiveSet(target);
            }
            if (finishedEdge) {
                jumpedOnFinishRef.current[tabKey] = normFinished;
            }
        }
        prevStatusMapRef.current[tabKey] = sessionStatus;
        prevMaxMapRef.current[tabKey] = nextMax;
        prevLenMapRef.current[tabKey] = nextLen;
        prevFinishMapRef.current[tabKey] = normFinished ?? prevFinished;
    }, [
        tabKey,
        indices,
        sessionStatus,
        finishedAt,
        userPicked,
        autoSetActiveSet,
        getCurrentActiveSet
    ]);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/SQLErrorAlert.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SQLErrorAlert",
    ()=>SQLErrorAlert
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/alert.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$ui$2f$src$2f$border$2d$beam$2d$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/ui/src/border-beam-button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-alert.js [app-ssr] (ecmascript) <export default as AlertCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__SparkleIcon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/sparkle.js [app-ssr] (ecmascript) <export default as SparkleIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/react.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$sql$2d$console$2e$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/sql-console.store.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
function SQLErrorAlert({ title, message, sql }) {
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])('SqlConsole');
    const setCopilotPanelOpen = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSetAtom"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$sql$2d$console$2e$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["copilotPanelOpenAtom"]);
    const setCopilotActionRequest = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSetAtom"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$sql$2d$console$2e$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["copilotActionRequestAtom"]);
    if (!message) return null;
    const handleAiFix = ()=>{
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setCopilotPanelOpen(true);
        setCopilotActionRequest({
            id: requestId,
            intent: 'fix-sql-error'
        });
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Alert"], {
        variant: "destructive",
        className: "border-none bg-transparent flex flex-col max-h-full",
        "data-testid": "sql-error-alert",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__["AlertCircle"], {
                        className: "h-4 w-4 shrink-0"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/SQLErrorAlert.tsx",
                        lineNumber: 37,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AlertTitle"], {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: title ?? t('Errors.ExecuteFailed')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/SQLErrorAlert.tsx",
                                lineNumber: 39,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$ui$2f$src$2f$border$2d$beam$2d$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BorderBeamButton"], {
                                active: true,
                                colorVariant: "colorful",
                                type: "button",
                                className: "h-7 px-2 text-xs flex items-center gap-1 text-foreground hover:text-foreground",
                                onClick: handleAiFix,
                                size: "sm",
                                variant: "outline",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__SparkleIcon$3e$__["SparkleIcon"], {
                                        className: "h-3.5 w-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/SQLErrorAlert.tsx",
                                        lineNumber: 49,
                                        columnNumber: 25
                                    }, this),
                                    t('Errors.AiFix')
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/SQLErrorAlert.tsx",
                                lineNumber: 40,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/SQLErrorAlert.tsx",
                        lineNumber: 38,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/SQLErrorAlert.tsx",
                lineNumber: 36,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AlertDescription"], {
                className: "flex-1 overflow-auto mt-2",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                    className: "whitespace-pre-wrap break-words text-sm",
                    children: message
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/SQLErrorAlert.tsx",
                    lineNumber: 56,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/SQLErrorAlert.tsx",
                lineNumber: 55,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/SQLErrorAlert.tsx",
        lineNumber: 31,
        columnNumber: 9
    }, this);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "VTableSearchBar",
    ()=>VTableSearchBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/lib/utils.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2d$group$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button-group.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/input.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/search.js [app-ssr] (ecmascript) <export default as Search>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/x.js [app-ssr] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
function VTableSearchBar(props) {
    const { query, onQueryChange, onClearQuery, onSearchSubmit, filteredCount, totalCount } = props;
    const [draftQuery, setDraftQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(query);
    const inputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])('SqlConsole');
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        setDraftQuery(query);
    }, [
        query
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const onKey = (e)=>{
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                inputRef.current?.focus();
                inputRef.current?.select();
            }
        };
        window.addEventListener('keydown', onKey);
        return ()=>window.removeEventListener('keydown', onKey);
    }, []);
    const submitSearch = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        onQueryChange(draftQuery);
        onSearchSubmit?.();
    }, [
        draftQuery,
        onQueryChange,
        onSearchSubmit
    ]);
    const clearSearch = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        setDraftQuery('');
        onQueryChange('');
        onClearQuery?.();
    }, [
        onClearQuery,
        onQueryChange
    ]);
    const digits = typeof totalCount === 'number' ? String(Math.max(0, totalCount)).length : 3;
    const template = `${'9'.repeat(digits)} / ${'9'.repeat(digits)}`;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('flex items-center gap-2 py-1 pl-2 pr-1', props.className),
        children: [
            typeof filteredCount === 'number' && typeof totalCount === 'number' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative flex-none",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        "aria-hidden": true,
                        className: "invisible block px-1 font-mono tabular-nums text-xs",
                        children: template
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar.tsx",
                        lineNumber: 59,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "absolute inset-0 px-1 font-mono tabular-nums text-xs text-muted-foreground whitespace-nowrap flex items-center justify-end",
                        "aria-label": t('VTable.Search.FilteredTotalAria'),
                        children: [
                            filteredCount,
                            " / ",
                            totalCount
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar.tsx",
                        lineNumber: 63,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar.tsx",
                lineNumber: 58,
                columnNumber: 17
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2d$group$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ButtonGroup"], {
                className: "h-6 min-w-0 flex-1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "relative flex min-w-0 flex-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Input"], {
                                ref: inputRef,
                                value: draftQuery,
                                onChange: (e)=>setDraftQuery(e.target.value),
                                onKeyDown: (e)=>{
                                    if (e.key === 'Enter') {
                                        submitSearch();
                                    }
                                },
                                placeholder: t('VTable.Search.Placeholder'),
                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('h-6 rounded-r-none px-2 pr-6 text-xs shadow-none placeholder:text-xs')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar.tsx",
                                lineNumber: 74,
                                columnNumber: 21
                            }, this),
                            draftQuery ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: "absolute right-1 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-sm opacity-70 hover:opacity-100",
                                onClick: clearSearch,
                                "aria-label": t('VTable.Search.ClearAria'),
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                    className: "h-3.5 w-3.5"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar.tsx",
                                    lineNumber: 93,
                                    columnNumber: 29
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar.tsx",
                                lineNumber: 87,
                                columnNumber: 25
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar.tsx",
                        lineNumber: 73,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                        type: "button",
                        variant: "outline",
                        size: "icon-xs",
                        className: "h-6 w-6",
                        onClick: submitSearch,
                        "aria-label": t('VTable.Search.SubmitAria'),
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                            className: "h-3.5 w-3.5"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar.tsx",
                            lineNumber: 98,
                            columnNumber: 21
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar.tsx",
                        lineNumber: 97,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar.tsx",
                lineNumber: 72,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar.tsx",
        lineNumber: 56,
        columnNumber: 9
    }, this);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ALL_SERIES_KEY",
    ()=>ALL_SERIES_KEY,
    "CHART_COLOR_PRESETS",
    ()=>CHART_COLOR_PRESETS,
    "ChartCombobox",
    ()=>ChartCombobox,
    "ChartEmptyState",
    ()=>ChartEmptyState,
    "ChartSelect",
    ()=>ChartSelect,
    "NONE_VALUE",
    ()=>NONE_VALUE
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chart$2d$column$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BarChart3$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chart-column.js [app-ssr] (ecmascript) <export default as BarChart3>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/check.js [app-ssr] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevrons$2d$up$2d$down$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronsUpDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevrons-up-down.js [app-ssr] (ecmascript) <export default as ChevronsUpDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/command.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/popover.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/select.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/lib/utils.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
const NONE_VALUE = '__none__';
const ALL_SERIES_KEY = '__value__';
const CHART_COLOR_PRESETS = [
    {
        value: 'blue',
        label: 'Blue',
        colors: {
            light: [
                '#2563eb',
                '#1d4ed8',
                '#3b82f6',
                '#60a5fa',
                '#93c5fd',
                '#bfdbfe'
            ],
            dark: [
                '#60a5fa',
                '#3b82f6',
                '#93c5fd',
                '#1d4ed8',
                '#2563eb',
                '#dbeafe'
            ]
        }
    },
    {
        value: 'emerald',
        label: 'Emerald',
        colors: {
            light: [
                '#059669',
                '#047857',
                '#10b981',
                '#34d399',
                '#6ee7b7',
                '#a7f3d0'
            ],
            dark: [
                '#34d399',
                '#10b981',
                '#6ee7b7',
                '#047857',
                '#059669',
                '#d1fae5'
            ]
        }
    },
    {
        value: 'amber',
        label: 'Amber',
        colors: {
            light: [
                '#d97706',
                '#b45309',
                '#f59e0b',
                '#fbbf24',
                '#fcd34d',
                '#fde68a'
            ],
            dark: [
                '#fbbf24',
                '#f59e0b',
                '#fcd34d',
                '#b45309',
                '#d97706',
                '#fef3c7'
            ]
        }
    },
    {
        value: 'rose',
        label: 'Rose',
        colors: {
            light: [
                '#e11d48',
                '#be123c',
                '#f43f5e',
                '#fb7185',
                '#fda4af',
                '#fecdd3'
            ],
            dark: [
                '#fb7185',
                '#f43f5e',
                '#fda4af',
                '#be123c',
                '#e11d48',
                '#ffe4e6'
            ]
        }
    },
    {
        value: 'violet',
        label: 'Violet',
        colors: {
            light: [
                '#7c3aed',
                '#6d28d9',
                '#8b5cf6',
                '#a78bfa',
                '#c4b5fd',
                '#ddd6fe'
            ],
            dark: [
                '#a78bfa',
                '#8b5cf6',
                '#c4b5fd',
                '#6d28d9',
                '#7c3aed',
                '#ede9fe'
            ]
        }
    },
    {
        value: 'slate',
        label: 'Slate',
        colors: {
            light: [
                '#334155',
                '#1e293b',
                '#475569',
                '#64748b',
                '#94a3b8',
                '#cbd5e1'
            ],
            dark: [
                '#94a3b8',
                '#64748b',
                '#cbd5e1',
                '#475569',
                '#334155',
                '#e2e8f0'
            ]
        }
    }
];
function ChartSelect(props) {
    const { label, value, onValueChange, options, disabled = false } = props;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex shrink-0 items-center gap-1",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "mr-1 text-[11px] font-medium text-muted-foreground/80",
                children: label
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                lineNumber: 108,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Select"], {
                value: value,
                onValueChange: onValueChange,
                disabled: disabled,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SelectTrigger"], {
                        size: "control",
                        className: "min-w-[92px] justify-between border bg-background/50 text-muted-foreground shadow-none hover:bg-background/70",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SelectValue"], {
                            placeholder: label
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                            lineNumber: 111,
                            columnNumber: 21
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                        lineNumber: 110,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SelectContent"], {
                        align: "start",
                        children: options.map((option)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SelectItem"], {
                                value: option.value,
                                children: option.label
                            }, option.value, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                                lineNumber: 115,
                                columnNumber: 25
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                        lineNumber: 113,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                lineNumber: 109,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
        lineNumber: 107,
        columnNumber: 9
    }, this);
}
function ChartCombobox(props) {
    const { label, value, onValueChange, options, disabled = false, placeholder, searchPlaceholder = 'Search...', emptyLabel = 'No results.' } = props;
    const [open, setOpen] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useState(false);
    const selected = options.find((option)=>option.value === value) ?? null;
    const displayLabel = selected?.label ?? placeholder ?? label;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex shrink-0 items-center gap-1",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "mr-1 text-[11px] font-medium text-muted-foreground/80",
                children: label
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                lineNumber: 142,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Popover"], {
                open: open,
                onOpenChange: setOpen,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PopoverTrigger"], {
                        asChild: true,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                            type: "button",
                            variant: "outline",
                            role: "combobox",
                            "aria-expanded": open,
                            size: "control",
                            disabled: disabled,
                            className: "min-w-[96px] justify-between border bg-background/50 text-muted-foreground shadow-none hover:bg-background/70",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "truncate",
                                    children: displayLabel
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                                    lineNumber: 154,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevrons$2d$up$2d$down$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronsUpDown$3e$__["ChevronsUpDown"], {
                                    className: "ml-2 h-3.5 w-3.5 shrink-0 opacity-80"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                                    lineNumber: 155,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                            lineNumber: 145,
                            columnNumber: 21
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                        lineNumber: 144,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PopoverContent"], {
                        align: "start",
                        className: "w-64 p-0",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Command"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CommandInput"], {
                                    placeholder: searchPlaceholder,
                                    className: "h-9 text-xs"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                                    lineNumber: 160,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CommandList"], {
                                    className: "max-h-64",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CommandEmpty"], {
                                            children: emptyLabel
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                                            lineNumber: 162,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CommandGroup"], {
                                            children: options.map((option)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CommandItem"], {
                                                    value: `${option.label} ${option.value}`,
                                                    onSelect: ()=>{
                                                        onValueChange(option.value);
                                                        setOpen(false);
                                                    },
                                                    className: "text-xs",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "truncate",
                                                            children: option.label
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                                                            lineNumber: 174,
                                                            columnNumber: 41
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('ml-auto h-3.5 w-3.5', value === option.value ? 'opacity-100' : 'opacity-0')
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                                                            lineNumber: 175,
                                                            columnNumber: 41
                                                        }, this)
                                                    ]
                                                }, option.value, true, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                                                    lineNumber: 165,
                                                    columnNumber: 37
                                                }, this))
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                                            lineNumber: 163,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                                    lineNumber: 161,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                            lineNumber: 159,
                            columnNumber: 21
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                        lineNumber: 158,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                lineNumber: 143,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
        lineNumber: 141,
        columnNumber: 9
    }, this);
}
function ChartEmptyState({ message }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col items-center gap-2 text-center text-sm text-muted-foreground",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chart$2d$column$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BarChart3$3e$__["BarChart3"], {
                className: "h-5 w-5"
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                lineNumber: 190,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: message
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
                lineNumber: 191,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx",
        lineNumber: 189,
        columnNumber: 9
    }, this);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ChartCanvas",
    ()=>ChartCanvas
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$Bar$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/recharts/es6/cartesian/Bar.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$chart$2f$BarChart$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/recharts/es6/chart/BarChart.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$Brush$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/recharts/es6/cartesian/Brush.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$CartesianGrid$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/recharts/es6/cartesian/CartesianGrid.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$component$2f$Cell$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/recharts/es6/component/Cell.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$Line$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/recharts/es6/cartesian/Line.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$chart$2f$LineChart$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/recharts/es6/chart/LineChart.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$polar$2f$Pie$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/recharts/es6/polar/Pie.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$chart$2f$PieChart$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/recharts/es6/chart/PieChart.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$Scatter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/recharts/es6/cartesian/Scatter.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$chart$2f$ScatterChart$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/recharts/es6/chart/ScatterChart.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$XAxis$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/recharts/es6/cartesian/XAxis.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$YAxis$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/recharts/es6/cartesian/YAxis.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$chart$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/chart.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
function toFiniteNumber(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== 'string') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function ChartCanvas(props) {
    const { chartType, chartConfig, aggregated, effectiveGroupKey, chartColors, xAxisLabel, yAxisLabel, emptyMessage, timelineSliderEnabled, chartRootRef, onApplyChartFilter } = props;
    const primaryChartColor = chartColors[0] ?? 'var(--primary)';
    const clickFilterEnabled = chartType !== 'line';
    const supportsTimeline = chartType === 'line' || chartType === 'bar' || chartType === 'histogram';
    const [brushSelection, setBrushSelection] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useState(null);
    const lastBrushIndex = Math.max(aggregated.data.length - 1, 0);
    const controlledBrushSelection = brushSelection ?? {
        startIndex: 0,
        endIndex: lastBrushIndex
    };
    const isZoomed = brushSelection != null;
    const histogramData = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useMemo(()=>aggregated.data.map((datum)=>{
            const total = aggregated.series.reduce((sum, series)=>sum + (toFiniteNumber(datum[series.key]) ?? 0), 0);
            return {
                ...datum,
                __histValue: total
            };
        }), [
        aggregated.data,
        aggregated.series
    ]);
    const pieData = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useMemo(()=>aggregated.data.map((datum)=>{
            const total = aggregated.series.reduce((sum, series)=>sum + (toFiniteNumber(datum[series.key]) ?? 0), 0);
            return {
                ...datum,
                __pieValue: total
            };
        }).filter((datum)=>(toFiniteNumber(datum.__pieValue) ?? 0) > 0), [
        aggregated.data,
        aggregated.series
    ]);
    const scatterData = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useMemo(()=>aggregated.data.map((datum, index)=>{
            const yValue = aggregated.series.reduce((sum, series)=>sum + (toFiniteNumber(datum[series.key]) ?? 0), 0);
            const xValue = String(datum.xLabel ?? index);
            return {
                ...datum,
                xValue,
                yValue
            };
        }).filter((datum)=>(toFiniteNumber(datum.yValue) ?? 0) > 0), [
        aggregated.data,
        aggregated.series
    ]);
    const heatmapStats = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useMemo(()=>{
        const values = [];
        for (const datum of aggregated.data){
            for (const series of aggregated.series){
                const value = toFiniteNumber(datum[series.key]);
                if (value != null) {
                    values.push(value);
                }
            }
        }
        if (values.length === 0) {
            return null;
        }
        return {
            min: Math.min(...values),
            max: Math.max(...values)
        };
    }, [
        aggregated.data,
        aggregated.series
    ]);
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useEffect(()=>{
        if (!timelineSliderEnabled || !supportsTimeline) {
            setBrushSelection(null);
        }
    }, [
        supportsTimeline,
        timelineSliderEnabled
    ]);
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useEffect(()=>{
        if (!brushSelection) {
            return;
        }
        const lastIndex = aggregated.data.length - 1;
        if (lastIndex <= 0) {
            setBrushSelection(null);
            return;
        }
        if (brushSelection.startIndex > lastIndex || brushSelection.endIndex > lastIndex) {
            setBrushSelection({
                startIndex: Math.min(brushSelection.startIndex, lastIndex),
                endIndex: Math.min(brushSelection.endIndex, lastIndex)
            });
        }
    }, [
        aggregated.data.length,
        brushSelection
    ]);
    const handleDatumClick = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useCallback((datum, seriesKey, seriesLabel, append = false)=>{
        if (!clickFilterEnabled) {
            return;
        }
        if (!datum) {
            return;
        }
        const filters = [];
        const xFilter = datum.__xFilter;
        if (xFilter) {
            filters.push(xFilter);
        }
        if (effectiveGroupKey !== __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NONE_VALUE"] && seriesKey !== __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ALL_SERIES_KEY"] && seriesLabel !== 'Others') {
            filters.push({
                col: effectiveGroupKey,
                kind: 'exact',
                raw: seriesLabel
            });
        }
        if (filters.length > 0) {
            onApplyChartFilter(filters, {
                append
            });
        }
    }, [
        clickFilterEnabled,
        effectiveGroupKey,
        onApplyChartFilter
    ]);
    const handleBrushChange = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useCallback((selection)=>{
        const startIndex = selection?.startIndex;
        const endIndex = selection?.endIndex;
        if (startIndex == null || endIndex == null || endIndex <= startIndex) {
            setBrushSelection(null);
            return;
        }
        if (startIndex <= 0 && endIndex >= lastBrushIndex) {
            setBrushSelection(null);
            return;
        }
        setBrushSelection({
            startIndex,
            endIndex
        });
    }, [
        lastBrushIndex
    ]);
    const brushFilter = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useMemo(()=>{
        if (!brushSelection) {
            return null;
        }
        const startDatum = aggregated.data[brushSelection.startIndex];
        const endDatum = aggregated.data[brushSelection.endIndex];
        const startFilter = startDatum?.__xBrushFilter;
        const endFilter = endDatum?.__xBrushFilter;
        if (!startFilter || !endFilter || startFilter.col !== endFilter.col || startFilter.valueType !== endFilter.valueType) {
            return null;
        }
        return {
            col: startFilter.col,
            kind: 'range',
            from: startFilter.from,
            to: endFilter.to,
            valueType: startFilter.valueType,
            label: `${startFilter.label} -> ${endFilter.label}`
        };
    }, [
        aggregated.data,
        brushSelection
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex min-h-0 flex-1 items-center justify-center p-4",
        children: emptyMessage ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartEmptyState"], {
            message: emptyMessage
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
            lineNumber: 215,
            columnNumber: 17
        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            ref: chartRootRef,
            className: "flex h-full min-h-[220px] w-full flex-col",
            children: [
                timelineSliderEnabled && supportsTimeline ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center justify-between gap-2 pb-1",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-[11px] text-muted-foreground",
                            children: "DataZoom timeline"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                            lineNumber: 220,
                            columnNumber: 29
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                    type: "button",
                                    size: "sm",
                                    variant: "outline",
                                    className: "h-7 px-2 text-[11px]",
                                    onClick: ()=>setBrushSelection(null),
                                    disabled: !isZoomed,
                                    children: "Reset Zoom"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                    lineNumber: 222,
                                    columnNumber: 33
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                    type: "button",
                                    size: "sm",
                                    variant: "outline",
                                    className: "h-7 px-2 text-[11px]",
                                    onClick: ()=>{
                                        if (!brushFilter) {
                                            return;
                                        }
                                        onApplyChartFilter([
                                            brushFilter
                                        ]);
                                    },
                                    disabled: !brushFilter,
                                    children: "Apply Brush Filter"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                    lineNumber: 225,
                                    columnNumber: 33
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                            lineNumber: 221,
                            columnNumber: 29
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                    lineNumber: 219,
                    columnNumber: 25
                }, this) : null,
                clickFilterEnabled ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "pb-1 text-right text-[11px] text-muted-foreground",
                    children: "Click chart to filter"
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                    lineNumber: 243,
                    columnNumber: 43
                }, this) : null,
                chartType === 'line' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$chart$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartContainer"], {
                    config: chartConfig,
                    className: "aspect-auto h-full w-full overflow-hidden",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$chart$2f$LineChart$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LineChart"], {
                        accessibilityLayer: true,
                        data: aggregated.data,
                        margin: {
                            left: 8,
                            right: 8,
                            top: 8
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$CartesianGrid$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CartesianGrid"], {
                                vertical: false
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 247,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$XAxis$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["XAxis"], {
                                dataKey: "xLabel",
                                tickLine: false,
                                axisLine: false,
                                tickMargin: 10,
                                minTickGap: 24,
                                tickFormatter: (value)=>String(value).slice(0, 18)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 248,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$YAxis$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["YAxis"], {
                                tickLine: false,
                                axisLine: false,
                                width: 56
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 249,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$chart$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartTooltip"], {
                                content: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ChartFilterTooltipContent, {
                                    filterEnabled: clickFilterEnabled,
                                    chartConfig: chartConfig,
                                    xAxisLabel: xAxisLabel,
                                    yAxisLabel: yAxisLabel
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                    lineNumber: 252,
                                    columnNumber: 41
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 250,
                                columnNumber: 33
                            }, this),
                            aggregated.series.map((series)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$Line$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Line"], {
                                    type: "monotone",
                                    dataKey: series.key,
                                    stroke: `var(--color-${series.key})`,
                                    strokeWidth: 2,
                                    dot: (dotProps)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                            cx: dotProps.cx,
                                            cy: dotProps.cy,
                                            r: 3,
                                            fill: `var(--color-${series.key})`,
                                            stroke: "transparent",
                                            className: clickFilterEnabled ? 'cursor-pointer' : undefined,
                                            onClick: clickFilterEnabled ? (event)=>handleDatumClick(dotProps.payload, series.key, series.label, event.shiftKey) : undefined
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                            lineNumber: 263,
                                            columnNumber: 45
                                        }, this)
                                }, series.key, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                    lineNumber: 256,
                                    columnNumber: 37
                                }, this)),
                            timelineSliderEnabled ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$Brush$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Brush"], {
                                dataKey: "xLabel",
                                height: 18,
                                travellerWidth: 8,
                                onChange: handleBrushChange,
                                startIndex: controlledBrushSelection.startIndex,
                                endIndex: controlledBrushSelection.endIndex
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 280,
                                columnNumber: 37
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                        lineNumber: 246,
                        columnNumber: 29
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                    lineNumber: 245,
                    columnNumber: 25
                }, this) : null,
                chartType === 'bar' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$chart$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartContainer"], {
                    config: chartConfig,
                    className: "aspect-auto h-full w-full overflow-hidden",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$chart$2f$BarChart$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BarChart"], {
                        accessibilityLayer: true,
                        data: aggregated.data,
                        margin: {
                            left: 8,
                            right: 8,
                            top: 8
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$CartesianGrid$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CartesianGrid"], {
                                vertical: false
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 295,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$XAxis$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["XAxis"], {
                                dataKey: "xLabel",
                                tickLine: false,
                                axisLine: false,
                                tickMargin: 10,
                                minTickGap: 24,
                                tickFormatter: (value)=>String(value).slice(0, 18)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 296,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$YAxis$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["YAxis"], {
                                tickLine: false,
                                axisLine: false,
                                width: 56
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 297,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$chart$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartTooltip"], {
                                cursor: false,
                                content: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ChartFilterTooltipContent, {
                                    filterEnabled: clickFilterEnabled,
                                    chartConfig: chartConfig,
                                    xAxisLabel: xAxisLabel,
                                    yAxisLabel: yAxisLabel
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                    lineNumber: 301,
                                    columnNumber: 41
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 298,
                                columnNumber: 33
                            }, this),
                            aggregated.series.map((series)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$Bar$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Bar"], {
                                    dataKey: series.key,
                                    fill: `var(--color-${series.key})`,
                                    radius: 4,
                                    stackId: effectiveGroupKey === __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NONE_VALUE"] ? undefined : 'group',
                                    activeBar: false,
                                    className: "cursor-pointer",
                                    onClick: (data, _index, event)=>handleDatumClick(data?.payload, series.key, series.label, Boolean(event?.shiftKey))
                                }, series.key, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                    lineNumber: 305,
                                    columnNumber: 37
                                }, this)),
                            timelineSliderEnabled ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$Brush$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Brush"], {
                                dataKey: "xLabel",
                                height: 18,
                                travellerWidth: 8,
                                onChange: handleBrushChange,
                                startIndex: controlledBrushSelection.startIndex,
                                endIndex: controlledBrushSelection.endIndex
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 324,
                                columnNumber: 37
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                        lineNumber: 294,
                        columnNumber: 29
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                    lineNumber: 293,
                    columnNumber: 25
                }, this) : null,
                chartType === 'histogram' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$chart$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartContainer"], {
                    config: chartConfig,
                    className: "aspect-auto h-full w-full overflow-hidden",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$chart$2f$BarChart$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BarChart"], {
                        accessibilityLayer: true,
                        data: histogramData,
                        margin: {
                            left: 8,
                            right: 8,
                            top: 8
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$CartesianGrid$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CartesianGrid"], {
                                vertical: false
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 339,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$XAxis$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["XAxis"], {
                                dataKey: "xLabel",
                                tickLine: false,
                                axisLine: false,
                                tickMargin: 10,
                                minTickGap: 24,
                                tickFormatter: (value)=>String(value).slice(0, 18)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 340,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$YAxis$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["YAxis"], {
                                tickLine: false,
                                axisLine: false,
                                width: 56
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 341,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$chart$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartTooltip"], {
                                cursor: false,
                                content: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ChartFilterTooltipContent, {
                                    filterEnabled: clickFilterEnabled,
                                    chartConfig: chartConfig,
                                    xAxisLabel: xAxisLabel,
                                    yAxisLabel: yAxisLabel
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                    lineNumber: 345,
                                    columnNumber: 41
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 342,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$Bar$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Bar"], {
                                dataKey: "__histValue",
                                fill: primaryChartColor,
                                radius: 4,
                                activeBar: false,
                                className: "cursor-pointer",
                                onClick: (data, _index, event)=>handleDatumClick(data?.payload, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ALL_SERIES_KEY"], 'Value', Boolean(event?.shiftKey))
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 348,
                                columnNumber: 33
                            }, this),
                            timelineSliderEnabled ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$Brush$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Brush"], {
                                dataKey: "xLabel",
                                height: 18,
                                travellerWidth: 8,
                                onChange: handleBrushChange,
                                startIndex: controlledBrushSelection.startIndex,
                                endIndex: controlledBrushSelection.endIndex
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 364,
                                columnNumber: 37
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                        lineNumber: 338,
                        columnNumber: 29
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                    lineNumber: 337,
                    columnNumber: 25
                }, this) : null,
                chartType === 'pie' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$chart$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartContainer"], {
                    config: chartConfig,
                    className: "aspect-auto h-full w-full overflow-hidden",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$chart$2f$PieChart$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PieChart"], {
                        accessibilityLayer: true,
                        margin: {
                            left: 8,
                            right: 8,
                            top: 8,
                            bottom: 8
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$chart$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartTooltip"], {
                                cursor: false,
                                content: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ChartFilterTooltipContent, {
                                    filterEnabled: clickFilterEnabled,
                                    chartConfig: chartConfig,
                                    xAxisLabel: xAxisLabel,
                                    yAxisLabel: yAxisLabel,
                                    hideLabel: true
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                    lineNumber: 382,
                                    columnNumber: 41
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 379,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$polar$2f$Pie$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Pie"], {
                                data: pieData,
                                dataKey: "__pieValue",
                                nameKey: "xLabel",
                                cx: "50%",
                                cy: "50%",
                                outerRadius: "75%",
                                className: "cursor-pointer",
                                onClick: (data, _index, event)=>handleDatumClick(data?.payload, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ALL_SERIES_KEY"], String(data?.payload?.xLabel ?? 'Value'), Boolean(event?.shiftKey)),
                                children: pieData.map((datum, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$component$2f$Cell$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Cell"], {
                                        fill: chartColors[index % chartColors.length] ?? primaryChartColor
                                    }, `${String(datum.xLabel ?? index)}`, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                        lineNumber: 409,
                                        columnNumber: 41
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 391,
                                columnNumber: 33
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                        lineNumber: 378,
                        columnNumber: 29
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                    lineNumber: 377,
                    columnNumber: 25
                }, this) : null,
                chartType === 'scatter' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$chart$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartContainer"], {
                    config: chartConfig,
                    className: "aspect-auto h-full w-full overflow-hidden",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$chart$2f$ScatterChart$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ScatterChart"], {
                        accessibilityLayer: true,
                        data: scatterData,
                        margin: {
                            left: 8,
                            right: 8,
                            top: 8
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$CartesianGrid$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CartesianGrid"], {}, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 421,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$XAxis$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["XAxis"], {
                                type: "category",
                                dataKey: "xValue",
                                tickLine: false,
                                axisLine: false,
                                tickMargin: 10,
                                tickFormatter: (value)=>String(value).slice(0, 18)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 422,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$YAxis$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["YAxis"], {
                                type: "number",
                                dataKey: "yValue",
                                tickLine: false,
                                axisLine: false,
                                width: 56
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 423,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$chart$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartTooltip"], {
                                content: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ScatterTooltipContent, {
                                    yAxisLabel: yAxisLabel
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                    lineNumber: 424,
                                    columnNumber: 56
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 424,
                                columnNumber: 33
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$recharts$2f$es6$2f$cartesian$2f$Scatter$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Scatter"], {
                                data: scatterData,
                                fill: primaryChartColor,
                                className: "cursor-pointer",
                                onClick: (data, _index, event)=>handleDatumClick(data?.payload ?? data, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ALL_SERIES_KEY"], 'Value', Boolean(event?.shiftKey))
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 425,
                                columnNumber: 33
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                        lineNumber: 420,
                        columnNumber: 29
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                    lineNumber: 419,
                    columnNumber: 25
                }, this) : null,
                chartType === 'heatmap' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "min-h-0 flex-1 overflow-auto rounded-md border border-border/50 bg-background/60 p-3",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid min-w-max gap-1",
                        style: {
                            gridTemplateColumns: `minmax(130px, 180px) repeat(${aggregated.series.length}, minmax(72px, 1fr))`
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "sticky left-0 z-10 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground",
                                children: "X"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 445,
                                columnNumber: 33
                            }, this),
                            aggregated.series.map((series)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "px-2 py-1 text-center text-[11px] font-medium text-muted-foreground",
                                    title: series.label,
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "block truncate",
                                        children: series.label
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                        lineNumber: 448,
                                        columnNumber: 41
                                    }, this)
                                }, series.key, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                    lineNumber: 447,
                                    columnNumber: 37
                                }, this)),
                            aggregated.data.map((datum, rowIndex)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].Fragment, {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "sticky left-0 z-10 truncate bg-background px-2 py-1 text-[11px] text-foreground",
                                            title: String(datum.xLabel),
                                            children: String(datum.xLabel)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                            lineNumber: 453,
                                            columnNumber: 41
                                        }, this),
                                        aggregated.series.map((series)=>{
                                            const value = toFiniteNumber(datum[series.key]) ?? 0;
                                            const min = heatmapStats?.min ?? 0;
                                            const max = heatmapStats?.max ?? 0;
                                            const ratio = max > min ? (value - min) / (max - min) : value > 0 ? 1 : 0;
                                            const alpha = 0.15 + ratio * 0.75;
                                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                className: "h-8 rounded-sm border border-border/40 text-[11px] tabular-nums text-foreground",
                                                style: {
                                                    backgroundColor: `color-mix(in oklab, ${primaryChartColor} ${Math.round(alpha * 100)}%, transparent)`
                                                },
                                                onClick: (event)=>handleDatumClick(datum, series.key, series.label, event.shiftKey),
                                                title: `${series.label}: ${value.toLocaleString()}`,
                                                children: value.toLocaleString()
                                            }, `${String(datum.xLabel)}-${series.key}`, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                                lineNumber: 464,
                                                columnNumber: 49
                                            }, this);
                                        })
                                    ]
                                }, `${String(datum.xLabel)}-${rowIndex}`, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                    lineNumber: 452,
                                    columnNumber: 37
                                }, this))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                        lineNumber: 444,
                        columnNumber: 29
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                    lineNumber: 443,
                    columnNumber: 25
                }, this) : null
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
            lineNumber: 217,
            columnNumber: 17
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
        lineNumber: 213,
        columnNumber: 9
    }, this);
}
function ScatterTooltipContent(props) {
    const { active, payload, yAxisLabel } = props;
    if (!active || !payload?.length) {
        return null;
    }
    const point = payload[0]?.payload ?? null;
    if (!point) {
        return null;
    }
    const x = String(point.xValue ?? '');
    const y = toFiniteNumber(point.yValue) ?? 0;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "grid min-w-[10rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "font-medium",
                children: x
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                lineNumber: 505,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between gap-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-muted-foreground",
                        children: yAxisLabel
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                        lineNumber: 507,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-foreground font-mono font-medium tabular-nums",
                        children: y.toLocaleString()
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                        lineNumber: 508,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                lineNumber: 506,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
        lineNumber: 504,
        columnNumber: 9
    }, this);
}
function ChartFilterTooltipContent(props) {
    const { filterEnabled, chartConfig, xAxisLabel, yAxisLabel } = props;
    if (!props.active || !props.payload?.length) {
        return null;
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$chart$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartTooltipContent"], {
        ...props,
        className: "min-w-[9rem]",
        formatter: (value, name, item, index)=>{
            const dataKey = String(item?.dataKey ?? name);
            const seriesLabel = dataKey === 'xValue' ? xAxisLabel : dataKey === 'yValue' || dataKey === '__histValue' || dataKey === '__pieValue' ? yAxisLabel : chartConfig[dataKey]?.label ?? name;
            const defaultRow = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "h-2.5 w-2.5 shrink-0 rounded-[2px]",
                                style: {
                                    backgroundColor: item.color ?? item.payload?.fill ?? 'currentColor'
                                }
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 544,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-muted-foreground",
                                children: seriesLabel
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                                lineNumber: 550,
                                columnNumber: 29
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                        lineNumber: 543,
                        columnNumber: 25
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-foreground font-mono font-medium tabular-nums",
                        children: typeof value === 'number' ? value.toLocaleString() : String(value)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
                        lineNumber: 552,
                        columnNumber: 25
                    }, this)
                ]
            }, void 0, true);
            const isLast = index === (props.payload?.length ?? 1) - 1;
            if (!isLast || !filterEnabled) {
                return defaultRow;
            }
            return defaultRow;
        }
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx",
        lineNumber: 530,
        columnNumber: 9
    }, this);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ChartControlBar",
    ()=>ChartControlBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/lib/utils.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/popover.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$switch$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/switch.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/dropdown-menu.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/tooltip.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$dot$2d$dashed$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CircleDotDashed$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-dot-dashed.js [app-ssr] (ecmascript) <export default as CircleDotDashed>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$copy$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Copy$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/copy.js [app-ssr] (ecmascript) <export default as Copy>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$download$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Download$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/download.js [app-ssr] (ecmascript) <export default as Download>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ellipsis$2d$vertical$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__EllipsisVertical$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/ellipsis-vertical.js [app-ssr] (ecmascript) <export default as EllipsisVertical>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FileImage$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/file-image.js [app-ssr] (ecmascript) <export default as FileImage>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/rotate-ccw.js [app-ssr] (ecmascript) <export default as RotateCcw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/settings-2.js [app-ssr] (ecmascript) <export default as Settings2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f$ui$2f$combobox$2d$submenu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/ui/combobox-submenu.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
;
;
function ChartControlBar(props) {
    const { chartState, chartStateIsAuto, columnNames, metricOptions, effectiveXKey, bucketHint, chartColorPreset, chartColorPresetOptions, timelineSliderEnabled, onChartTypeChange, onXKeyChange, onYKeyChange, onGroupKeyChange, onChartColorPresetChange, onTimelineSliderEnabledChange, onResetAuto, canExportChart, onExportPng, onCopyPng, onExportSvg } = props;
    const supportsTimelineSlider = chartState.chartType === 'line' || chartState.chartType === 'bar' || chartState.chartType === 'histogram';
    const showMetric = chartState.chartType !== 'histogram';
    const showGroup = chartState.chartType === 'bar' || chartState.chartType === 'line' || chartState.chartType === 'heatmap';
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "@container/chart-control px-3 pb-2 pt-2",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex items-start gap-x-2 gap-y-2",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2 @[720px]/chart-control:flex-nowrap",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartSelect"], {
                            label: "Chart",
                            value: chartState.chartType,
                            onValueChange: onChartTypeChange,
                            options: [
                                {
                                    value: 'bar',
                                    label: 'Bar'
                                },
                                {
                                    value: 'line',
                                    label: 'Line'
                                },
                                {
                                    value: 'pie',
                                    label: 'Pie'
                                },
                                {
                                    value: 'scatter',
                                    label: 'Scatter Plot'
                                },
                                {
                                    value: 'histogram',
                                    label: 'Histogram'
                                },
                                {
                                    value: 'heatmap',
                                    label: 'Heatmap'
                                }
                            ]
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                            lineNumber: 76,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartCombobox"], {
                            label: "X",
                            value: chartState.xKey,
                            onValueChange: onXKeyChange,
                            options: columnNames.map((columnName)=>({
                                    value: columnName,
                                    label: columnName
                                })),
                            disabled: columnNames.length === 0,
                            searchPlaceholder: "Search columns..."
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                            lineNumber: 89,
                            columnNumber: 21
                        }, this),
                        showMetric ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricComboboxSubmenu, {
                            value: chartState.yKey,
                            columnNames: columnNames,
                            metricOptions: metricOptions,
                            onValueChange: onYKeyChange,
                            disabled: metricOptions.length === 0
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                            lineNumber: 98,
                            columnNumber: 25
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-[11px] text-muted-foreground",
                            children: "Y = Count"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                            lineNumber: 106,
                            columnNumber: 25
                        }, this),
                        showGroup ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartCombobox"], {
                            label: "Group",
                            value: chartState.groupKey,
                            onValueChange: onGroupKeyChange,
                            options: [
                                {
                                    value: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NONE_VALUE"],
                                    label: 'None'
                                },
                                ...columnNames.filter((columnName)=>columnName !== effectiveXKey).map((columnName)=>({
                                        value: columnName,
                                        label: columnName
                                    }))
                            ],
                            disabled: columnNames.length === 0,
                            searchPlaceholder: "Search columns..."
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                            lineNumber: 109,
                            columnNumber: 25
                        }, this) : null
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                    lineNumber: 75,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TooltipProvider"], {
                    delayDuration: 150,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex shrink-0 items-center gap-0.5 pt-0.5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Tooltip"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                        asChild: true,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            "aria-label": bucketHint ? 'Auto-bucketed enabled' : 'Auto-bucketed disabled',
                                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/45', bucketHint && 'text-muted-foreground/65'),
                                            role: "status",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$dot$2d$dashed$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CircleDotDashed$3e$__["CircleDotDashed"], {
                                                className: "h-3.5 w-3.5"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                lineNumber: 134,
                                                columnNumber: 37
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                            lineNumber: 126,
                                            columnNumber: 33
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                        lineNumber: 125,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                        side: "top",
                                        children: bucketHint ?? 'Auto-bucketed disabled'
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                        lineNumber: 137,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                lineNumber: 124,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Popover"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Tooltip"], {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                                asChild: true,
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PopoverTrigger"], {
                                                    asChild: true,
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                                        type: "button",
                                                        size: "icon",
                                                        variant: "ghost",
                                                        "aria-label": "Chart settings",
                                                        className: "h-6 w-6 cursor-pointer text-muted-foreground hover:text-foreground",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings2$3e$__["Settings2"], {
                                                            className: "h-3.5 w-3.5"
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                            lineNumber: 150,
                                                            columnNumber: 45
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                        lineNumber: 143,
                                                        columnNumber: 41
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                    lineNumber: 142,
                                                    columnNumber: 37
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                lineNumber: 141,
                                                columnNumber: 33
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                                side: "top",
                                                children: "Settings"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                lineNumber: 154,
                                                columnNumber: 33
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                        lineNumber: 140,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PopoverContent"], {
                                        align: "end",
                                        className: "w-[300px]",
                                        children: [
                                            supportsTimelineSlider ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-start justify-between gap-3",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "space-y-0.5",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                className: "text-xs font-medium",
                                                                children: "Enable timeline slider"
                                                            }, void 0, false, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                                lineNumber: 160,
                                                                columnNumber: 45
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                className: "text-[11px] text-muted-foreground",
                                                                children: "Show DataZoom timeline, Reset Zoom, and Apply Brush Filter."
                                                            }, void 0, false, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                                lineNumber: 161,
                                                                columnNumber: 45
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                        lineNumber: 159,
                                                        columnNumber: 41
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$switch$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Switch"], {
                                                        checked: timelineSliderEnabled,
                                                        onCheckedChange: onTimelineSliderEnabledChange
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                        lineNumber: 163,
                                                        columnNumber: 41
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                lineNumber: 158,
                                                columnNumber: 37
                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "space-y-0.5",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: "text-xs font-medium",
                                                        children: "Timeline slider unavailable"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                        lineNumber: 167,
                                                        columnNumber: 41
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: "text-[11px] text-muted-foreground",
                                                        children: "This chart type does not support DataZoom timeline."
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                        lineNumber: 168,
                                                        columnNumber: 41
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                lineNumber: 166,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "my-3 h-px bg-border"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                lineNumber: 171,
                                                columnNumber: 33
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "space-y-1.5",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: "text-xs font-medium",
                                                        children: "Chart color"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                        lineNumber: 173,
                                                        columnNumber: 37
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "grid grid-cols-2 gap-2",
                                                        children: chartColorPresetOptions.map((option)=>{
                                                            const selected = option.value === chartColorPreset;
                                                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                                                type: "button",
                                                                variant: selected ? 'default' : 'outline',
                                                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('h-8 justify-start gap-2 px-2 text-xs', !selected && 'bg-background'),
                                                                onClick: ()=>onChartColorPresetChange(option.value),
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "flex items-center gap-1",
                                                                        children: option.preview.slice(0, 3).map((color, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                className: "h-2.5 w-2.5 rounded-full border border-border/60",
                                                                                style: {
                                                                                    backgroundColor: color
                                                                                }
                                                                            }, `${option.value}-${index}`, false, {
                                                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                                                lineNumber: 187,
                                                                                columnNumber: 61
                                                                            }, this))
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                                        lineNumber: 185,
                                                                        columnNumber: 53
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "truncate",
                                                                        children: option.label
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                                        lineNumber: 194,
                                                                        columnNumber: 53
                                                                    }, this)
                                                                ]
                                                            }, option.value, true, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                                lineNumber: 178,
                                                                columnNumber: 49
                                                            }, this);
                                                        })
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                        lineNumber: 174,
                                                        columnNumber: 37
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                lineNumber: 172,
                                                columnNumber: 33
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                        lineNumber: 156,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                lineNumber: 139,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenu"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Tooltip"], {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                                asChild: true,
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuTrigger"], {
                                                    asChild: true,
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                                        type: "button",
                                                        size: "icon",
                                                        variant: "ghost",
                                                        "aria-label": "More chart actions",
                                                        className: "h-6 w-6 cursor-pointer text-muted-foreground hover:text-foreground",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ellipsis$2d$vertical$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__EllipsisVertical$3e$__["EllipsisVertical"], {
                                                            className: "h-3.5 w-3.5"
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                            lineNumber: 213,
                                                            columnNumber: 45
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                        lineNumber: 206,
                                                        columnNumber: 41
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                    lineNumber: 205,
                                                    columnNumber: 37
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                lineNumber: 204,
                                                columnNumber: 33
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                                side: "top",
                                                children: "More"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                lineNumber: 217,
                                                columnNumber: 33
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                        lineNumber: 203,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuContent"], {
                                        align: "end",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuSub"], {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuSubTrigger"], {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$download$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Download$3e$__["Download"], {}, void 0, false, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                                lineNumber: 222,
                                                                columnNumber: 41
                                                            }, this),
                                                            "Download"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                        lineNumber: 221,
                                                        columnNumber: 37
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuSubContent"], {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                                                                onSelect: onCopyPng,
                                                                disabled: !canExportChart,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$copy$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Copy$3e$__["Copy"], {}, void 0, false, {
                                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                                        lineNumber: 227,
                                                                        columnNumber: 45
                                                                    }, this),
                                                                    "Copy PNG"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                                lineNumber: 226,
                                                                columnNumber: 41
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                                                                onSelect: onExportPng,
                                                                disabled: !canExportChart,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FileImage$3e$__["FileImage"], {}, void 0, false, {
                                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                                        lineNumber: 231,
                                                                        columnNumber: 45
                                                                    }, this),
                                                                    "PNG"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                                lineNumber: 230,
                                                                columnNumber: 41
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                                                                onSelect: onExportSvg,
                                                                disabled: !canExportChart,
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FileImage$3e$__["FileImage"], {}, void 0, false, {
                                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                                        lineNumber: 235,
                                                                        columnNumber: 45
                                                                    }, this),
                                                                    "SVG"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                                lineNumber: 234,
                                                                columnNumber: 41
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                        lineNumber: 225,
                                                        columnNumber: 37
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                lineNumber: 220,
                                                columnNumber: 33
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                                                onSelect: onResetAuto,
                                                disabled: chartStateIsAuto,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__["RotateCcw"], {}, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                        lineNumber: 241,
                                                        columnNumber: 37
                                                    }, this),
                                                    "Reset chart"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                                lineNumber: 240,
                                                columnNumber: 33
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                        lineNumber: 219,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                                lineNumber: 202,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                        lineNumber: 123,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
                    lineNumber: 122,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
            lineNumber: 74,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
        lineNumber: 73,
        columnNumber: 9
    }, this);
}
function getMetricActionLabel(option) {
    if (option.kind === 'sum') return 'Sum';
    if (option.kind === 'avg') return 'Avg';
    if (option.kind === 'min') return 'Min';
    if (option.kind === 'max') return 'Max';
    if (option.kind === 'count_distinct') return 'Count Distinct';
    if (option.kind === 'count_true') return 'Count True';
    return 'Count';
}
function MetricComboboxSubmenu(props) {
    const { value, columnNames, metricOptions, onValueChange, disabled = false } = props;
    const standaloneOptions = metricOptions.filter((option)=>!option.column).map((option)=>({
            value: option.key,
            label: option.label,
            keywords: [
                option.key,
                option.label
            ]
        }));
    const groupOptions = columnNames.map((columnName)=>{
        const children = metricOptions.filter((option)=>option.column === columnName).map((option)=>({
                value: option.key,
                label: getMetricActionLabel(option),
                keywords: [
                    option.key,
                    option.label,
                    getMetricActionLabel(option)
                ]
            }));
        if (children.length === 0) {
            return null;
        }
        return {
            value: columnName,
            label: columnName,
            keywords: [
                columnName
            ],
            children
        };
    }).filter((group)=>Boolean(group));
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f$ui$2f$combobox$2d$submenu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ComboboxSubmenu"], {
        label: "Y",
        value: value,
        standaloneOptions: standaloneOptions,
        groupOptions: groupOptions,
        onValueChange: (nextValue)=>onValueChange(nextValue),
        disabled: disabled,
        triggerPlaceholder: "Y",
        searchPlaceholder: "Search...",
        leftEmptyText: "No matching fields.",
        rightEmptyText: "No matching fields.",
        rightPlaceholderText: "Choose a field, then pick aggregation."
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx",
        lineNumber: 297,
        columnNumber: 9
    }, this);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-view.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ChartView",
    ()=>ChartView
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$canvas$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-canvas.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$control$2d$bar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-control-bar.tsx [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
function ChartView(props) {
    const { chartState, chartStateIsAuto, columnNames, metricOptions, effectiveXKey, effectiveYLabel, effectiveGroupKey, chartColorPreset, chartColorPresetOptions, chartColors, aggregated, chartConfig, emptyMessage, timelineSliderEnabled, onApplyChartFilter, onChartTypeChange, onXKeyChange, onYKeyChange, onGroupKeyChange, onChartColorPresetChange, onTimelineSliderEnabledChange, onResetAuto } = props;
    const chartRootRef = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useRef(null);
    const downloadBlob = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useCallback((blob, filename)=>{
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
    }, []);
    const buildFileName = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useCallback((ext)=>{
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        return `chart-${chartState.chartType}-${stamp}.${ext}`;
    }, [
        chartState.chartType
    ]);
    const getSerializedSvg = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useCallback(()=>{
        const svg = chartRootRef.current?.querySelector('svg');
        if (!svg) {
            return null;
        }
        const clone = svg.cloneNode(true);
        const width = Math.max(1, Math.round(svg.getBoundingClientRect().width));
        const height = Math.max(1, Math.round(svg.getBoundingClientRect().height));
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        clone.setAttribute('width', String(width));
        clone.setAttribute('height', String(height));
        if (!clone.getAttribute('viewBox')) {
            clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
        }
        const originalNodes = [
            svg,
            ...Array.from(svg.querySelectorAll('*'))
        ];
        const clonedNodes = [
            clone,
            ...Array.from(clone.querySelectorAll('*'))
        ];
        const styleAttrs = [
            'fill',
            'stroke',
            'color',
            'stop-color'
        ];
        for(let i = 0; i < originalNodes.length; i += 1){
            const original = originalNodes[i];
            const copied = clonedNodes[i];
            if (!original || !copied) {
                continue;
            }
            const computed = window.getComputedStyle(original);
            for (const attr of styleAttrs){
                const rawAttr = original.getAttribute(attr);
                const styleValue = computed.getPropertyValue(attr);
                if (rawAttr?.includes('var(') && styleValue) {
                    copied.setAttribute(attr, styleValue.trim());
                }
            }
        }
        return {
            svgText: new XMLSerializer().serializeToString(clone),
            width,
            height
        };
    }, []);
    const canExportChart = !emptyMessage && chartState.chartType !== 'heatmap';
    const handleExportSvg = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useCallback(()=>{
        const serialized = getSerializedSvg();
        if (!serialized) {
            return;
        }
        const svgBlob = new Blob([
            serialized.svgText
        ], {
            type: 'image/svg+xml;charset=utf-8'
        });
        downloadBlob(svgBlob, buildFileName('svg'));
    }, [
        buildFileName,
        downloadBlob,
        getSerializedSvg
    ]);
    const handleExportPng = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useCallback(async ()=>{
        const serialized = getSerializedSvg();
        if (!serialized) {
            return;
        }
        const svgBlob = new Blob([
            serialized.svgText
        ], {
            type: 'image/svg+xml;charset=utf-8'
        });
        const objectUrl = URL.createObjectURL(svgBlob);
        try {
            const image = await new Promise((resolve, reject)=>{
                const img = new Image();
                img.onload = ()=>resolve(img);
                img.onerror = reject;
                img.src = objectUrl;
            });
            const scale = 4;
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(serialized.width * scale));
            canvas.height = Math.max(1, Math.round(serialized.height * scale));
            const context = canvas.getContext('2d');
            if (!context) {
                return;
            }
            context.scale(scale, scale);
            context.drawImage(image, 0, 0, serialized.width, serialized.height);
            const pngBlob = await new Promise((resolve)=>{
                canvas.toBlob((blob)=>resolve(blob), 'image/png');
            });
            if (!pngBlob) {
                return;
            }
            downloadBlob(pngBlob, buildFileName('png'));
        } catch  {
        // Ignore export failures to avoid unhandled promise rejections.
        } finally{
            URL.revokeObjectURL(objectUrl);
        }
    }, [
        buildFileName,
        downloadBlob,
        getSerializedSvg
    ]);
    const handleCopyPng = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useCallback(async ()=>{
        const serialized = getSerializedSvg();
        if (!serialized || !navigator?.clipboard || typeof ClipboardItem === 'undefined') {
            return;
        }
        const svgBlob = new Blob([
            serialized.svgText
        ], {
            type: 'image/svg+xml;charset=utf-8'
        });
        const objectUrl = URL.createObjectURL(svgBlob);
        try {
            const image = await new Promise((resolve, reject)=>{
                const img = new Image();
                img.onload = ()=>resolve(img);
                img.onerror = reject;
                img.src = objectUrl;
            });
            const scale = 4;
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(serialized.width * scale));
            canvas.height = Math.max(1, Math.round(serialized.height * scale));
            const context = canvas.getContext('2d');
            if (!context) {
                return;
            }
            context.scale(scale, scale);
            context.drawImage(image, 0, 0, serialized.width, serialized.height);
            const pngBlob = await new Promise((resolve)=>{
                canvas.toBlob((blob)=>resolve(blob), 'image/png');
            });
            if (!pngBlob) {
                return;
            }
            await navigator.clipboard.write([
                new ClipboardItem({
                    'image/png': pngBlob
                })
            ]);
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["toast"].success('PNG copied to clipboard');
        } catch  {
        // Ignore copy failures when clipboard APIs are unavailable or blocked.
        } finally{
            URL.revokeObjectURL(objectUrl);
        }
    }, [
        getSerializedSvg
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-muted/10",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$control$2d$bar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartControlBar"], {
                chartState: chartState,
                chartStateIsAuto: chartStateIsAuto,
                columnNames: columnNames,
                metricOptions: metricOptions,
                effectiveXKey: effectiveXKey,
                bucketHint: aggregated.bucketHint,
                chartColorPreset: chartColorPreset,
                chartColorPresetOptions: chartColorPresetOptions,
                timelineSliderEnabled: timelineSliderEnabled,
                onChartTypeChange: onChartTypeChange,
                onXKeyChange: onXKeyChange,
                onYKeyChange: onYKeyChange,
                onGroupKeyChange: onGroupKeyChange,
                onChartColorPresetChange: onChartColorPresetChange,
                onTimelineSliderEnabledChange: onTimelineSliderEnabledChange,
                onResetAuto: onResetAuto,
                canExportChart: canExportChart,
                onExportPng: ()=>{
                    void handleExportPng();
                },
                onCopyPng: ()=>{
                    void handleCopyPng();
                },
                onExportSvg: handleExportSvg
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-view.tsx",
                lineNumber: 237,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$canvas$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartCanvas"], {
                chartType: chartState.chartType,
                chartConfig: chartConfig,
                aggregated: aggregated,
                effectiveGroupKey: effectiveGroupKey,
                chartColors: chartColors,
                xAxisLabel: effectiveXKey,
                yAxisLabel: effectiveYLabel,
                emptyMessage: emptyMessage,
                timelineSliderEnabled: timelineSliderEnabled,
                chartRootRef: chartRootRef,
                onApplyChartFilter: onApplyChartFilter
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-view.tsx",
                lineNumber: 263,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-view.tsx",
        lineNumber: 236,
        columnNumber: 9
    }, this);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/index.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Charts",
    ()=>Charts
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$themes$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-themes/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$analysis$2f$src$2f$core$2f$result$2d$chart$2d$profile$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/analysis/src/core/result-chart-profile.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/lib/utils.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$filter$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/filter.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$view$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-view.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared.tsx [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
function toUiChartType(chartType) {
    return chartType;
}
function toEngineChartType(chartType) {
    return chartType;
}
function toUiState(state, colorPreset) {
    return {
        chartType: toUiChartType(state.chartType),
        xKey: state.xKey,
        yKey: state.yKey,
        groupKey: state.groupKey === __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$analysis$2f$src$2f$core$2f$result$2d$chart$2d$profile$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["RESULT_AUTO_CHART_NONE_VALUE"] ? __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NONE_VALUE"] : state.groupKey,
        chartColorPreset: colorPreset
    };
}
function toEngineState(state) {
    return {
        chartType: toEngineChartType(state.chartType),
        xKey: state.xKey,
        yKey: state.yKey,
        groupKey: state.groupKey === __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NONE_VALUE"] ? __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$analysis$2f$src$2f$core$2f$result$2d$chart$2d$profile$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["RESULT_AUTO_CHART_NONE_VALUE"] : state.groupKey
    };
}
function mergeChartState(suggestedState, initialState) {
    return {
        chartType: initialState?.chartType ?? suggestedState.chartType,
        xKey: initialState?.xKey ?? suggestedState.xKey,
        yKey: initialState?.yKey ?? suggestedState.yKey,
        groupKey: initialState?.groupKey ?? suggestedState.groupKey,
        chartColorPreset: initialState?.chartColorPreset ?? 'blue'
    };
}
function isMetricKeyCompatibleWithColumns(metricKey, columnNames) {
    if (metricKey === 'count') {
        return true;
    }
    const separatorIndex = metricKey.indexOf(':');
    if (separatorIndex < 0) {
        return true;
    }
    const column = metricKey.slice(separatorIndex + 1);
    return column ? columnNames.includes(column) : true;
}
function Charts({ rows, columnsRaw, resultStats, remoteSource, className, onApplyFilters, onResetState, stateKey, initialState, onStateChange, stateSyncEnabled = true }) {
    const { resolvedTheme } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$themes$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTheme"])();
    const autoChartProfile = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (resultStats?.autoChartProfile) {
            return resultStats.autoChartProfile;
        }
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$analysis$2f$src$2f$core$2f$result$2d$chart$2d$profile$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildResultAutoChartProfile"])({
            rows,
            columns: columnsRaw,
            stats: resultStats
        });
    }, [
        columnsRaw,
        resultStats,
        rows
    ]);
    const columnNames = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (autoChartProfile.columnNames.length) return autoChartProfile.columnNames;
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$analysis$2f$src$2f$core$2f$result$2d$chart$2d$profile$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getResultAutoChartColumnNames"])(columnsRaw, rows);
    }, [
        autoChartProfile.columnNames,
        columnsRaw,
        rows
    ]);
    const suggestedState = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>toUiState(autoChartProfile.chartState), [
        autoChartProfile.chartState
    ]);
    const mergedInitialState = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>mergeChartState(suggestedState, initialState), [
        initialState,
        suggestedState
    ]);
    const hasPersistedState = Boolean(initialState && (initialState.xKey || initialState.yKey || initialState.groupKey || initialState.chartType));
    const lastAppliedStateKeyRef = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useRef(stateKey);
    const previousStateKeyRef = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useRef(stateKey);
    const skipNextStateEmitRef = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useRef(false);
    const [chartType, setChartType] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>mergedInitialState.chartType);
    const [xKey, setXKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>mergedInitialState.xKey);
    const [yKey, setYKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>mergedInitialState.yKey);
    const [groupKey, setGroupKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>mergedInitialState.groupKey);
    const [timelineSliderEnabled, setTimelineSliderEnabled] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [chartColorPreset, setChartColorPreset] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>mergedInitialState.chartColorPreset ?? 'blue');
    const metricOptions = autoChartProfile.metricOptions;
    const selectedMetric = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>metricOptions.find((option)=>option.key === yKey) ?? metricOptions[0] ?? null, [
        metricOptions,
        yKey
    ]);
    const effectiveXKey = columnNames.includes(xKey) ? xKey : suggestedState.xKey;
    const effectiveGroupKey = groupKey !== __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NONE_VALUE"] && columnNames.includes(groupKey) ? groupKey : __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NONE_VALUE"];
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (previousStateKeyRef.current !== stateKey) {
            skipNextStateEmitRef.current = true;
            previousStateKeyRef.current = stateKey;
        }
    }, [
        stateKey
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (lastAppliedStateKeyRef.current === stateKey) {
            return;
        }
        lastAppliedStateKeyRef.current = stateKey;
        setChartType(mergedInitialState.chartType);
        setXKey(mergedInitialState.xKey);
        setYKey(mergedInitialState.yKey);
        setGroupKey(mergedInitialState.groupKey);
        setChartColorPreset(mergedInitialState.chartColorPreset ?? 'blue');
        setTimelineSliderEnabled(false);
    }, [
        mergedInitialState.chartColorPreset,
        mergedInitialState.chartType,
        mergedInitialState.groupKey,
        mergedInitialState.xKey,
        mergedInitialState.yKey,
        stateKey
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!stateSyncEnabled || hasPersistedState) {
            return;
        }
        if (columnNames.length === 0) {
            return;
        }
        if (!columnNames.includes(xKey)) {
            setXKey(suggestedState.xKey);
        }
    }, [
        columnNames,
        hasPersistedState,
        stateSyncEnabled,
        suggestedState.xKey,
        xKey
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!stateSyncEnabled || hasPersistedState) {
            return;
        }
        if (columnNames.length === 0) {
            return;
        }
        if (!isMetricKeyCompatibleWithColumns(yKey, columnNames)) {
            setYKey(suggestedState.yKey);
        }
    }, [
        columnNames,
        hasPersistedState,
        stateSyncEnabled,
        suggestedState.yKey,
        yKey
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!stateSyncEnabled || hasPersistedState) {
            return;
        }
        if (columnNames.length === 0) {
            return;
        }
        if (groupKey !== __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NONE_VALUE"] && !columnNames.includes(groupKey)) {
            setGroupKey(suggestedState.groupKey);
        }
    }, [
        columnNames,
        groupKey,
        hasPersistedState,
        stateSyncEnabled,
        suggestedState.groupKey
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!stateSyncEnabled) {
            return;
        }
        if (skipNextStateEmitRef.current) {
            skipNextStateEmitRef.current = false;
            return;
        }
        onStateChange?.({
            chartType,
            xKey,
            yKey,
            groupKey,
            chartColorPreset
        });
    }, [
        chartColorPreset,
        chartType,
        groupKey,
        onStateChange,
        stateSyncEnabled,
        xKey,
        yKey
    ]);
    const chartStateIsAuto = chartType === suggestedState.chartType && xKey === suggestedState.xKey && yKey === suggestedState.yKey && groupKey === suggestedState.groupKey;
    const localAggregated = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (!effectiveXKey || !selectedMetric) {
            return {
                data: [],
                series: [],
                bucketHint: null
            };
        }
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$analysis$2f$src$2f$core$2f$result$2d$chart$2d$profile$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["aggregateAutoChart"])({
            rows,
            profile: {
                chartState: autoChartProfile.chartState,
                columnProfiles: autoChartProfile.columnProfiles,
                metricOptions: autoChartProfile.metricOptions
            },
            overrides: toEngineState({
                chartType,
                xKey: effectiveXKey,
                yKey,
                groupKey: effectiveGroupKey
            })
        });
    }, [
        autoChartProfile.chartState,
        autoChartProfile.columnProfiles,
        autoChartProfile.metricOptions,
        chartType,
        effectiveGroupKey,
        effectiveXKey,
        rows,
        selectedMetric,
        yKey
    ]);
    const [remoteAggregated, setRemoteAggregated] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!remoteSource || !effectiveXKey || !selectedMetric) {
            setRemoteAggregated(null);
            return;
        }
        const controller = new AbortController();
        setRemoteAggregated(null);
        remoteSource.readChart({
            chartType,
            xKey: effectiveXKey,
            yKey,
            groupKey: effectiveGroupKey,
            chartColorPreset
        }, controller.signal).then((next)=>{
            if (!controller.signal.aborted) {
                setRemoteAggregated(next);
            }
        }).catch((error)=>{
            if (!controller.signal.aborted) {
                console.warn('[Charts] remote chart read failed', error);
                setRemoteAggregated({
                    data: [],
                    series: [],
                    bucketHint: null
                });
            }
        });
        return ()=>{
            controller.abort();
        };
    }, [
        chartColorPreset,
        chartType,
        effectiveGroupKey,
        effectiveXKey,
        remoteSource,
        remoteSource?.cacheKey,
        selectedMetric,
        yKey
    ]);
    const aggregated = remoteSource ? remoteAggregated ?? {
        data: [],
        series: [],
        bucketHint: null
    } : localAggregated;
    const activeColorPreset = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CHART_COLOR_PRESETS"].find((preset)=>preset.value === chartColorPreset) ?? __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CHART_COLOR_PRESETS"][0], [
        chartColorPreset
    ]);
    const chartColors = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const isDark = resolvedTheme === 'dark';
        return isDark ? activeColorPreset.colors.dark : activeColorPreset.colors.light;
    }, [
        activeColorPreset,
        resolvedTheme
    ]);
    const chartConfig = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const config = {};
        aggregated.series.forEach((series, index)=>{
            config[series.key] = {
                label: series.label === __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ALL_SERIES_KEY"] ? selectedMetric?.label ?? 'Value' : series.label,
                color: chartColors[index % chartColors.length]
            };
        });
        return config;
    }, [
        aggregated.series,
        chartColors,
        selectedMetric
    ]);
    const pickFallbackGroupKey = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].useCallback((nextXKey)=>{
        const category = autoChartProfile.columnProfiles.find((profile)=>profile.kind === 'category' && profile.name !== nextXKey);
        if (category) {
            return category.name;
        }
        const fallback = columnNames.find((columnName)=>columnName !== nextXKey);
        return fallback ?? __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NONE_VALUE"];
    }, [
        autoChartProfile.columnProfiles,
        columnNames
    ]);
    const handleChartFilter = (filters, mode)=>{
        if (!onApplyFilters) {
            return;
        }
        const nextFilters = [];
        for (const filter of filters){
            if (filter.kind === 'exact') {
                nextFilters.push((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$filter$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildEqualsFilterFromCell"])({
                    colName: filter.col,
                    colType: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$analysis$2f$src$2f$core$2f$result$2d$chart$2d$profile$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getResultAutoChartColumnType"])(columnsRaw, filter.col),
                    raw: filter.raw
                }));
                continue;
            }
            nextFilters.push({
                col: filter.col,
                kind: 'range',
                op: 'range',
                value: filter.from,
                valueTo: filter.to,
                rangeValueType: filter.valueType,
                label: filter.label,
                caseSensitive: false
            });
        }
        if (nextFilters.length > 0) {
            onApplyFilters(nextFilters, mode);
        }
    };
    const hasRenderableData = aggregated.data.length > 0 && aggregated.series.length > 0;
    const emptyMessage = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$analysis$2f$src$2f$core$2f$result$2d$chart$2d$profile$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getAutoChartEmptyReason"])({
        columnNames,
        effectiveXKey,
        hasRenderableData,
        selectedMetric
    });
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('flex min-h-0 flex-1 flex-col', className),
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex min-h-0 flex-1 flex-col px-3 py-3",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$view$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ChartView"], {
                chartState: {
                    chartType,
                    xKey,
                    yKey,
                    groupKey
                },
                chartStateIsAuto: chartStateIsAuto,
                columnNames: columnNames,
                metricOptions: metricOptions,
                effectiveXKey: effectiveXKey,
                effectiveYLabel: selectedMetric?.label ?? yKey,
                effectiveGroupKey: effectiveGroupKey,
                chartColorPreset: chartColorPreset,
                chartColorPresetOptions: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CHART_COLOR_PRESETS"].map((option)=>({
                        value: option.value,
                        label: option.label,
                        preview: (resolvedTheme === 'dark' ? option.colors.dark : option.colors.light).slice(0, 3)
                    })),
                chartColors: chartColors,
                aggregated: aggregated,
                chartConfig: chartConfig,
                emptyMessage: emptyMessage,
                timelineSliderEnabled: timelineSliderEnabled,
                onApplyChartFilter: handleChartFilter,
                onChartTypeChange: (value)=>{
                    if (value === 'bar' || value === 'line' || value === 'pie' || value === 'scatter' || value === 'histogram' || value === 'heatmap') {
                        setChartType(value);
                        if (value === 'pie' || value === 'scatter' || value === 'histogram') {
                            setGroupKey(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NONE_VALUE"]);
                        }
                        if (value === 'histogram') {
                            setYKey('count');
                        }
                        if (value === 'heatmap') {
                            setGroupKey((previous)=>{
                                if (previous !== __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NONE_VALUE"] && columnNames.includes(previous) && previous !== effectiveXKey) {
                                    return previous;
                                }
                                return pickFallbackGroupKey(effectiveXKey);
                            });
                        }
                    }
                },
                onXKeyChange: setXKey,
                onYKeyChange: setYKey,
                onGroupKeyChange: setGroupKey,
                onChartColorPresetChange: (value)=>{
                    const matched = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$chart$2d$shared$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CHART_COLOR_PRESETS"].find((option)=>option.value === value);
                    if (matched) {
                        setChartColorPreset(matched.value);
                    }
                },
                onTimelineSliderEnabledChange: setTimelineSliderEnabled,
                onResetAuto: ()=>{
                    if (onResetState) {
                        onResetState();
                        return;
                    }
                    setChartType(suggestedState.chartType);
                    setXKey(suggestedState.xKey);
                    setYKey(suggestedState.yKey);
                    setGroupKey(suggestedState.groupKey);
                }
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/index.tsx",
                lineNumber: 357,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/index.tsx",
            lineNumber: 356,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/index.tsx",
        lineNumber: 355,
        columnNumber: 9
    }, this);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-loading-mode.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "resolveResultLoadingMode",
    ()=>resolveResultLoadingMode,
    "shouldShowResultMetadataLoading",
    ()=>shouldShowResultMetadataLoading
]);
function resolveResultLoadingMode({ status, dataAvailability, rowCount, previewRowCount }) {
    const isPreparingFullResult = status === 'running' && dataAvailability === 'preview-only';
    const hasCompletePreview = !isPreparingFullResult && rowCount !== null && previewRowCount >= rowCount;
    const shouldUseRemoteFullResult = dataAvailability === 'full' && !hasCompletePreview;
    const shouldPrefetchRemoteResult = isPreparingFullResult || shouldUseRemoteFullResult;
    return {
        isPreparingFullResult,
        hasCompletePreview,
        shouldPrefetchRemoteResult,
        shouldUseRemoteFullResult
    };
}
function shouldShowResultMetadataLoading(params) {
    if (!params.sessionId) return false;
    if (params.isLiveExecution) return false;
    const isSessionMetadataPending = params.loadedSessionId !== params.sessionId && !params.hasCachedMetadata;
    const isActiveResultMetadataPending = params.activeSet >= 0 && (params.activeMetaSessionId !== params.sessionId || params.activeMetaSetIndex !== params.activeSet);
    return isSessionMetadataPending || isActiveResultMetadataPending;
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ResultTable",
    ()=>ResultTable
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$download$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Download$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/download.js [app-ssr] (ecmascript) <export default as Download>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ellipsis$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MoreHorizontal$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/ellipsis.js [app-ssr] (ecmascript) <export default as MoreHorizontal>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/refresh-cw.js [app-ssr] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/web-utils/src/index.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$index$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$InspectorPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/shared/stores/app.store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$sql$2d$console$2e$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/sql-console.store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/react.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$client$2f$sql$2d$console$2d$result$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/lib/client/sql-console-result-store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$Toolbar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/Toolbar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/badge.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$OverviewTable$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/OverviewTable.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$stores$2f$result$2d$table$2e$atoms$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/stores/result-table.atoms.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$stores$2f$chart$2d$state$2e$atoms$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/stores/chart-state.atoms.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$ResultStatusBar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$stores$2f$active$2d$set$2e$atoms$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/stores/active-set.atoms.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$hooks$2f$useAutoJumpToLastResult$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/hooks/useAutoJumpToLastResult.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$SQLErrorAlert$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/SQLErrorAlert.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$TableSearchBar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$index$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/index.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/dropdown-menu.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$VTableFilters$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/tabs.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$workspace$2d$scope$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/workspace-scope.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$query$2d$history$2d$result$2d$restore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/query-history-result-restore.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$result$2d$loading$2d$mode$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-loading-mode.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
/* =================================== constants =================================== */ const OVERVIEW_SET = -1;
const EMPTY_RESULTS = [];
function serializeViewFilters(filters) {
    return filters.map((filter)=>({
            column: filter.col,
            op: filter.op,
            value: filter.kind === 'range' ? {
                from: filter.value,
                to: filter.valueTo,
                rangeValueType: filter.rangeValueType
            } : {
                value: filter.value,
                caseSensitive: filter.caseSensitive ?? false
            }
        }));
}
function deserializeViewFilters(filters) {
    return (filters ?? []).map((filter)=>{
        const payload = filter.value;
        if (filter.op === 'range' && payload && typeof payload === 'object') {
            const range = payload;
            return {
                col: String(filter.column),
                kind: 'range',
                op: 'range',
                value: range.from == null ? undefined : String(range.from),
                valueTo: range.to == null ? undefined : String(range.to),
                rangeValueType: range.rangeValueType === 'date' ? 'date' : 'number'
            };
        }
        const scalar = payload && typeof payload === 'object' ? payload : null;
        const rawValue = scalar ? scalar.value : payload;
        const isNumeric = typeof rawValue === 'number' || typeof rawValue === 'string' && rawValue.trim() !== '' && Number.isFinite(Number(rawValue)) && ![
            'contains',
            'equals',
            'startsWith',
            'endsWith',
            'empty',
            'notEmpty',
            'regex'
        ].includes(filter.op);
        return {
            col: String(filter.column),
            kind: isNumeric ? 'number' : 'string',
            op: filter.op,
            value: rawValue == null ? undefined : String(rawValue),
            caseSensitive: scalar?.caseSensitive === true
        };
    });
}
function areNumberArraysEqual(left, right) {
    if (left === right) return true;
    if (!left || !right) return !left && !right;
    if (left.length !== right.length) return false;
    return left.every((value, index)=>value === right[index]);
}
function ResultTable({ tabId: tabIdProp } = {}) {
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTranslations"])('SqlConsole');
    const [viewModesByKey, setViewModesByKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAtom"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$stores$2f$chart$2d$state$2e$atoms$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["viewModesByTabAtom"]);
    const [currentViewMode, setCurrentViewMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('table');
    const [inspectorOpen, setInspectorOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [inspectorMode, setInspectorMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [inspectorPayload, setInspectorPayload] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [rowViewMode, setRowViewMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('table');
    const [inspectorWidth, setInspectorWidth] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(360);
    const [meta, setMeta] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [sessionMetas, setSessionMetas] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        columns: []
    });
    const setCurrentSessionMeta = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSetAtom"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$stores$2f$result$2d$table$2e$atoms$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["currentSessionMetaAtom"]);
    const runningTabs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAtomValue"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$sql$2d$console$2e$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runningTabsAtom"]);
    // Atoms
    const activeTabId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAtomValue"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["activeTabIdAtom"]);
    const tabId = tabIdProp ?? activeTabId;
    const sessionIdByTab = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAtomValue"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$sql$2d$console$2e$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["sessionIdByTabAtom"]);
    const sessionIdFromAtom = tabId ? sessionIdByTab[tabId] : undefined;
    const workspaceScope = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAtomValue"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$workspace$2d$scope$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["sqlWorkspaceScopeAtom"]);
    const sessionId = sessionIdFromAtom || (("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : undefined);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (tabId === activeTabId) {
            setCurrentSessionMeta(sessionMetas);
        }
    }, [
        activeTabId,
        sessionMetas,
        setCurrentSessionMeta,
        tabId
    ]);
    const { dbReady, listResultSetIndices, listResultSetsMeta, readResultSetRows, exportResultSet, readResultSetChart, dataVersion, getSession, updateResultSetViewState } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$client$2f$sql$2d$console$2d$result$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSqlConsoleResultStore"])();
    // Session status
    const [sessionStatus, setSessionStatus] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const lastSessionRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const sessionUiCacheRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({});
    const [indices, setIndices] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const prevStatusRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const readActiveSetAtom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$stores$2f$active$2d$set$2e$atoms$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["makeActiveSetAtom"])(tabId, sessionId), [
        tabId,
        sessionId
    ]);
    const manualSetAtom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$stores$2f$active$2d$set$2e$atoms$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["makeSetActiveSetAtom"])(tabId, sessionId), [
        tabId,
        sessionId
    ]);
    const autoSetAtom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$stores$2f$active$2d$set$2e$atoms$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["makeAutoSetActiveSetAtom"])(tabId, sessionId), [
        tabId,
        sessionId
    ]);
    const activeSet = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAtomValue"])(readActiveSetAtom);
    const setActiveSet = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSetAtom"])(manualSetAtom);
    const autoSetActiveSet = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSetAtom"])(autoSetAtom);
    const userPickedAtom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$stores$2f$active$2d$set$2e$atoms$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["makeUserPickedAtom"])(tabId, sessionId), [
        tabId,
        sessionId
    ]);
    const userPicked = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAtomValue"])(userPickedAtom);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$hooks$2f$useAutoJumpToLastResult$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAutoJumpToLastResult"])({
        tabId,
        sessionId,
        indices,
        sessionStatus,
        userPicked,
        autoSetActiveSet: (v)=>autoSetActiveSet(v),
        getCurrentActiveSet: ()=>typeof activeSet === 'number' ? activeSet : undefined
    });
    const lastTabIdRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [results, setResults] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const storageKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>tabId && sessionId ? `${tabId}:${sessionId}#${activeSet}` : 'unknown', [
        tabId,
        sessionId,
        activeSet
    ]);
    const viewModeKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>tabId && activeSet >= 0 ? `tab:${tabId}:set:${activeSet}` : 'unknown', [
        activeSet,
        tabId
    ]);
    const noSessionId = !sessionId;
    const isResult = activeSet >= 0;
    const limited = !!sessionMetas?.limited;
    const shouldShowLimitNotice = isResult && limited;
    const storageLimitApplied = Array.isArray(sessionMetas?.warnings) && sessionMetas.warnings.some((warning)=>typeof warning === 'string' && warning.includes('Workspace storage limit'));
    const expectedRowCount = typeof sessionMetas?.rowCount === 'number' ? sessionMetas.rowCount : null;
    const remoteResultSetId = typeof sessionMetas?.resultSetId === 'string' && sessionMetas.resultSetId ? sessionMetas.resultSetId : null;
    const streamedPreviewResults = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(sessionMetas.previewRows ?? []).map((rowData, index)=>({
                tabId,
                rid: index,
                rowData
            })), [
        sessionMetas.previewRows,
        tabId
    ]);
    const resultLoadingMode = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$result$2d$loading$2d$mode$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["resolveResultLoadingMode"])({
        status: sessionMetas.status,
        dataAvailability: sessionMetas.dataAvailability,
        rowCount: expectedRowCount,
        previewRowCount: streamedPreviewResults.length
    });
    const isRemoteFullResult = Boolean(remoteResultSetId) && resultLoadingMode.shouldUseRemoteFullResult;
    const shouldPrefetchRemoteResult = Boolean(remoteResultSetId) && resultLoadingMode.shouldPrefetchRemoteResult;
    const localResults = streamedPreviewResults.length > 0 ? streamedPreviewResults : results;
    const remoteRowCount = expectedRowCount ?? 0;
    const [query, setQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const [sortState, setSortState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [selectedRowIndexes, setSelectedRowIndexes] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [hydratedViewStateKey, setHydratedViewStateKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const persistedViewStateRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [chartStatesByKey, setChartStatesByKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAtom"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$stores$2f$chart$2d$state$2e$atoms$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["chartStatesByKeyAtom"]);
    const [chartStateVersionByTab, setChartStateVersionByTab] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [chartSnapshotsBySet, setChartSnapshotsBySet] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [tablePaneSnapshotsBySet, setTablePaneSnapshotsBySet] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [remoteEffectiveRowCountBySet, setRemoteEffectiveRowCountBySet] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const remoteEffectiveRowCount = activeSet >= 0 ? remoteEffectiveRowCountBySet[activeSet] ?? null : null;
    const rowCount = shouldPrefetchRemoteResult ? remoteEffectiveRowCount ?? remoteRowCount : localResults.length;
    const showEmpty = shouldPrefetchRemoteResult ? rowCount === 0 : localResults.length === 0;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const savedViewMode = viewModesByKey[viewModeKey];
        const nextViewMode = savedViewMode === 'charts' ? 'charts' : 'table';
        setCurrentViewMode(nextViewMode);
        if (savedViewMode === 'overview') {
            setViewModesByKey((prev)=>({
                    ...prev,
                    [viewModeKey]: 'table'
                }));
        }
    }, [
        setViewModesByKey,
        viewModeKey,
        viewModesByKey
    ]);
    const chartSetIndices = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const indicesFromSnapshot = Object.keys(chartSnapshotsBySet).map((value)=>Number(value)).filter((value)=>Number.isFinite(value) && value >= 0);
        if (activeSet >= 0 && !indicesFromSnapshot.includes(activeSet)) {
            indicesFromSnapshot.push(activeSet);
        }
        return indicesFromSnapshot.sort((a, b)=>a - b);
    }, [
        activeSet,
        chartSnapshotsBySet
    ]);
    const setUserPickedFalse = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSetAtom"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$stores$2f$active$2d$set$2e$atoms$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["makeSetUserPickedAtom"])(tabId, sessionId), [
        tabId,
        sessionId
    ]));
    const [setsMeta, setSetsMeta] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loadedResultMetaSessionId, setLoadedResultMetaSessionId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const cacheSessionUi = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((cacheSessionId, snapshot)=>{
        sessionUiCacheRef.current[cacheSessionId] = {
            ...sessionUiCacheRef.current[cacheSessionId] ?? {},
            ...snapshot
        };
    }, []);
    const cacheSessionMeta = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((cacheSessionId, setIndex, sessionMeta)=>{
        const previous = sessionUiCacheRef.current[cacheSessionId] ?? {};
        sessionUiCacheRef.current[cacheSessionId] = {
            ...previous,
            sessionMetaBySet: {
                ...previous.sessionMetaBySet ?? {},
                [setIndex]: sessionMeta
            }
        };
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const prev = prevStatusRef.current;
        const now = sessionStatus;
        if (prev !== 'running' && now === 'running') {
            setUserPickedFalse(false);
        }
        prevStatusRef.current = now;
    }, [
        sessionStatus,
        setUserPickedFalse
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!dbReady || !sessionId) {
            setSessionMetas({
                columns: []
            });
            return;
        }
        let canceled = false;
        (async ()=>{
            const metas = await listResultSetsMeta(sessionId);
            const currentSessionMeta = metas?.find((m)=>m.sessionId === sessionId && m.setIndex === activeSet) ?? {
                columns: []
            };
            if (!canceled) {
                cacheSessionMeta(sessionId, activeSet, currentSessionMeta);
                setSessionMetas(currentSessionMeta);
            }
        })();
        return ()=>{
            canceled = true;
        };
    }, [
        dbReady,
        sessionId,
        dataVersion,
        activeSet,
        cacheSessionMeta,
        listResultSetsMeta,
        setSessionMetas
    ]);
    const filteredResults = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (isRemoteFullResult) return [];
        const hasGlobal = query.trim().length > 0;
        const gq = query.trim().toLowerCase();
        if (!hasGlobal) return localResults;
        return localResults.filter((row)=>{
            if (hasGlobal) {
                let hit = false;
                for (const c of (sessionMetas.columns ?? []).map((x)=>x.name)){
                    if (!c) continue;
                    const v = row.rowData?.[c];
                    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                    if (s.toLowerCase().includes(gq)) {
                        hit = true;
                        break;
                    }
                }
                if (!hit) return false;
            }
            return true;
        });
    }, [
        isRemoteFullResult,
        localResults,
        sessionMetas,
        query
    ]);
    const { activeFilters, filteredResults: columnFilteredResults, setColumnFilter, removeFilter, clearAllFilters, replaceFilters } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$VTableFilters$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useVTableFilters"])({
        results: filteredResults,
        storageKey,
        disableStorage: true
    });
    const hasActiveResultOperations = query.trim().length > 0 || activeFilters.length > 0;
    const remoteOperations = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>({
            sorts: sortState ? [
                sortState
            ] : undefined,
            filters: activeFilters.length > 0 ? activeFilters : undefined,
            search: query.trim() ? {
                text: query.trim()
            } : undefined
        }), [
        activeFilters,
        query,
        sortState
    ]);
    const remoteOperationKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>JSON.stringify(remoteOperations), [
        remoteOperations
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (activeSet < 0) return;
        setRemoteEffectiveRowCountBySet((prev)=>{
            if (prev[activeSet] == null) return prev;
            return {
                ...prev,
                [activeSet]: null
            };
        });
    }, [
        activeSet,
        remoteOperationKey,
        remoteResultSetId,
        remoteRowCount
    ]);
    const remoteSource = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (!remoteResultSetId || !shouldPrefetchRemoteResult || remoteRowCount <= 0) return null;
        return {
            cacheKey: `${remoteResultSetId}:${sessionMetas.dataAvailability ?? 'unknown'}:${remoteOperationKey}`,
            sourceId: remoteResultSetId,
            rowCount: remoteEffectiveRowCount ?? remoteRowCount,
            pageSize: 5000,
            initialRows: hasActiveResultOperations ? undefined : streamedPreviewResults,
            getRows: async (offset, limit, signal)=>{
                const response = await readResultSetRows({
                    resultSetId: remoteResultSetId,
                    offset,
                    limit,
                    sorts: remoteOperations.sorts,
                    filters: remoteOperations.filters,
                    search: remoteOperations.search,
                    signal
                });
                const ready = response.dataAvailability === 'full';
                if (ready && typeof response.rowCount === 'number') {
                    setRemoteEffectiveRowCountBySet((prev)=>({
                            ...prev,
                            [activeSet]: response.rowCount
                        }));
                }
                return {
                    ready,
                    rows: response.rows.map((row, index)=>({
                            tabId,
                            rid: offset + index,
                            rowData: row
                        }))
                };
            }
        };
    }, [
        activeSet,
        hasActiveResultOperations,
        readResultSetRows,
        remoteEffectiveRowCount,
        remoteOperationKey,
        remoteOperations,
        remoteResultSetId,
        remoteRowCount,
        sessionMetas.dataAvailability,
        shouldPrefetchRemoteResult,
        streamedPreviewResults,
        tabId
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!sessionId || activeSet < 0) return;
        if (sessionMetas.sessionId !== sessionId || sessionMetas.setIndex !== activeSet) return;
        if (hydratedViewStateKey !== `${sessionId}:${activeSet}`) return;
        const nextSnapshot = {
            sessionId,
            setIndex: activeSet,
            results: isRemoteFullResult ? EMPTY_RESULTS : columnFilteredResults,
            columnMetas: sessionMetas.columns ?? [],
            remoteSource,
            storageKey,
            activeFilters,
            initialSort: sortState,
            selectedRowIndexes,
            serverSideOperations: isRemoteFullResult
        };
        setTablePaneSnapshotsBySet((prev)=>{
            const current = prev[activeSet];
            if (current?.sessionId === nextSnapshot.sessionId && current.results === nextSnapshot.results && current.columnMetas === nextSnapshot.columnMetas && current.remoteSource === nextSnapshot.remoteSource && current.storageKey === nextSnapshot.storageKey && current.activeFilters === nextSnapshot.activeFilters && current.initialSort === nextSnapshot.initialSort && current.selectedRowIndexes === nextSnapshot.selectedRowIndexes && current.serverSideOperations === nextSnapshot.serverSideOperations) {
                return prev;
            }
            return {
                ...prev,
                [activeSet]: nextSnapshot
            };
        });
    }, [
        activeFilters,
        activeSet,
        columnFilteredResults,
        hydratedViewStateKey,
        isRemoteFullResult,
        remoteSource,
        selectedRowIndexes,
        sessionId,
        sessionMetas.columns,
        sessionMetas.sessionId,
        sessionMetas.setIndex,
        sortState,
        storageKey
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!sessionId || activeSet < 0) {
            setHydratedViewStateKey(null);
            setQuery('');
            setSortState(null);
            setSelectedRowIndexes([]);
            replaceFilters([]);
            return;
        }
        // Wait for metadata belonging to this result set before marking its view state as hydrated.
        if (sessionMetas.sessionId !== sessionId || sessionMetas.setIndex !== activeSet) {
            return;
        }
        const viewStateKey = `${sessionId}:${activeSet}`;
        if (hydratedViewStateKey === viewStateKey) {
            return;
        }
        setHydratedViewStateKey(viewStateKey);
        const viewState = sessionMetas.viewState ?? null;
        persistedViewStateRef.current = JSON.stringify({
            searchText: viewState?.searchText ?? undefined,
            sorts: viewState?.sorts?.[0] ? [
                viewState.sorts[0]
            ] : undefined,
            filters: viewState?.filters ?? undefined,
            hiddenColumns: [],
            pinnedColumns: [],
            selectedRowIndexes: viewState?.selectedRowIndexes?.length ? viewState.selectedRowIndexes : undefined
        });
        setQuery(viewState?.searchText ?? '');
        setSortState(viewState?.sorts?.[0] ?? null);
        setSelectedRowIndexes(viewState?.selectedRowIndexes ?? []);
        replaceFilters(deserializeViewFilters(viewState?.filters));
    }, [
        activeSet,
        hydratedViewStateKey,
        replaceFilters,
        sessionId,
        sessionMetas.sessionId,
        sessionMetas.setIndex,
        sessionMetas.viewState
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (activeSet < 0) {
            return;
        }
        if (isRemoteFullResult) {
            return;
        }
        setChartSnapshotsBySet((prev)=>({
                ...prev,
                [activeSet]: {
                    rows: columnFilteredResults,
                    columnsRaw: sessionMetas.columns
                }
            }));
    }, [
        activeSet,
        columnFilteredResults,
        isRemoteFullResult,
        sessionMetas.columns
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!sessionId || activeSet < 0) {
            return;
        }
        const timeoutId = window.setTimeout(()=>{
            const nextViewState = {
                searchText: query || undefined,
                sorts: sortState ? [
                    sortState
                ] : undefined,
                filters: activeFilters.length > 0 ? serializeViewFilters(activeFilters) : undefined,
                hiddenColumns: [],
                pinnedColumns: [],
                selectedRowIndexes: selectedRowIndexes.length > 0 ? selectedRowIndexes : undefined
            };
            const serialized = JSON.stringify(nextViewState);
            if (persistedViewStateRef.current === serialized) {
                return;
            }
            persistedViewStateRef.current = serialized;
            void updateResultSetViewState(sessionId, activeSet, nextViewState);
        }, 250);
        return ()=>{
            window.clearTimeout(timeoutId);
        };
    }, [
        activeFilters,
        activeSet,
        query,
        selectedRowIndexes,
        sessionId,
        sortState,
        updateResultSetViewState
    ]);
    const stats = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>({
            filteredCount: isRemoteFullResult ? rowCount : columnFilteredResults.length,
            totalCount: isRemoteFullResult ? remoteRowCount : localResults.length
        }), [
        columnFilteredResults.length,
        isRemoteFullResult,
        localResults.length,
        remoteRowCount,
        rowCount
    ]);
    const shouldShowWholeResultEmpty = showEmpty && !hasActiveResultOperations;
    const shouldShowFilteredEmpty = showEmpty && hasActiveResultOperations;
    const onStatsChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{}, []);
    const handleSelectedRowIndexesChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((next)=>{
        setSelectedRowIndexes((prev)=>{
            if (areNumberArraysEqual(prev, next)) {
                return prev;
            }
            return next;
        });
    }, []);
    /* ---------- Reset on Tab switch ---------- */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!tabId) return;
        if (lastTabIdRef.current !== tabId) {
            lastTabIdRef.current = tabId;
        }
    }, [
        tabId
    ]);
    /* ---------- Refresh result-set indices (0..n-1) ---------- */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let canceled = false;
        (async ()=>{
            if (!dbReady || !sessionId) return;
            try {
                const arr = await listResultSetIndices(sessionId);
                if (canceled) return;
                const next = Array.isArray(arr) ? Array.from(new Set(arr.filter((n)=>Number.isFinite(n) && n >= 0))).sort((a, b)=>a - b) : [];
                cacheSessionUi(sessionId, {
                    indices: next
                });
                setIndices(next);
                if (activeSet >= 0 && !next.includes(activeSet)) {
                    setActiveSet(OVERVIEW_SET);
                }
            } catch  {}
        })();
        return ()=>{
            canceled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        dbReady,
        sessionId,
        dataVersion,
        cacheSessionUi
    ]);
    /* ---------- Pull session status ---------- */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let canceled = false;
        (async ()=>{
            if (!dbReady || !sessionId) {
                if (!canceled) setSessionStatus(null);
                return;
            }
            const sess = await getSession(sessionId);
            if (!canceled) {
                const nextStatus = sess?.status === 'running' || sess?.status === 'success' || sess?.status === 'error' || sess?.status === 'canceled' ? sess.status : null;
                cacheSessionUi(sessionId, {
                    sessionStatus: nextStatus
                });
                setSessionStatus(nextStatus);
            }
        })();
        return ()=>{
            canceled = true;
        };
    }, [
        dbReady,
        sessionId,
        dataVersion,
        getSession,
        cacheSessionUi
    ]);
    /* ---------- Reset on session change ---------- */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!sessionId) {
            lastSessionRef.current = null;
            setLoadedResultMetaSessionId(null);
            setResults([]);
            setIndices([]);
            setSetsMeta([]);
            setMeta({});
            setSessionStatus(null);
            setTablePaneSnapshotsBySet({});
            setRemoteEffectiveRowCountBySet({});
            return;
        }
        if (lastSessionRef.current !== sessionId) {
            lastSessionRef.current = sessionId;
            setResults([]);
            setTablePaneSnapshotsBySet({});
            setRemoteEffectiveRowCountBySet({});
            const cached = sessionUiCacheRef.current[sessionId];
            if (cached) {
                setLoadedResultMetaSessionId(cached.setsMeta ? sessionId : null);
                setIndices(cached.indices ?? []);
                setSetsMeta(cached.setsMeta ?? []);
                setSessionMetas(cached.sessionMetaBySet?.[activeSet] ?? {
                    columns: []
                });
                setMeta(cached.meta ?? {});
                setSessionStatus(cached.sessionStatus ?? null);
                return;
            }
            setIndices([]);
            setSetsMeta([]);
            setLoadedResultMetaSessionId(null);
            setSessionMetas({
                columns: []
            });
            setMeta({});
            setSessionStatus(null);
        }
    }, [
        activeSet,
        sessionId,
        setSessionMetas
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!sessionId || activeSet < 0) {
            return;
        }
        const cachedSessionMeta = sessionUiCacheRef.current[sessionId]?.sessionMetaBySet?.[activeSet];
        if (cachedSessionMeta) {
            setSessionMetas(cachedSessionMeta);
        }
    }, [
        activeSet,
        sessionId,
        setSessionMetas
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!sessionId || !tabId) {
            setResults([]);
            return;
        }
        if (activeSet < 0) {
            setResults([]);
            return;
        }
        if (isRemoteFullResult) {
            setResults([]);
            return;
        }
        // Browser storage is no longer a result data source. Without a server resultSetId,
        // the SQL text can remain selected but the result area must stay empty.
        setResults([]);
    }, [
        tabId,
        sessionId,
        activeSet,
        dataVersion,
        isRemoteFullResult
    ]);
    /* ---------- Hydrate session-level meta & keep cache in sync ---------- */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let canceled = false;
        (async ()=>{
            if (!dbReady || !sessionId) {
                if (!canceled) setMeta({});
                return;
            }
            try {
                const sess = await getSession(sessionId);
                if (canceled) return;
                const startedRaw = sess?.startedAt;
                const finishedRaw = sess?.finishedAt;
                const startedAt = startedRaw ? new Date(startedRaw) : undefined;
                const finishedAt = finishedRaw ? new Date(finishedRaw) : undefined;
                const durationMs = sess?.durationMs ?? (startedAt && finishedAt ? finishedAt.getTime() - startedAt.getTime() : undefined);
                setMeta((prev)=>{
                    const next = {
                        ...prev,
                        startedAt,
                        finishedAt,
                        durationMs,
                        source: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$query$2d$history$2d$result$2d$restore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isQueryHistoryRestoredSession"])(tabId, sessionId) ? 'query-history' : sess?.source ?? undefined,
                        syncing: false
                    };
                    cacheSessionUi(sessionId, {
                        meta: next
                    });
                    return next;
                });
            } catch  {}
        })();
        return ()=>{
            canceled = true;
        };
    }, [
        dbReady,
        sessionId,
        dataVersion,
        getSession,
        tabId,
        activeSet,
        sessionStatus,
        cacheSessionUi
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let canceled = false;
        (async ()=>{
            if (!dbReady || !sessionId) return;
            try {
                const metas = await listResultSetsMeta(sessionId);
                if (canceled) return;
                if (!metas) return;
                const nextSetsMeta = metas.map((m)=>{
                    const status = m.status === 'running' ? 'running' : m.status === 'error' ? 'error' : 'success';
                    return {
                        sessionId: m.sessionId,
                        setIndex: m.setIndex,
                        sqlText: m.sqlText ?? '',
                        status,
                        startedAt: m.startedAt ?? null,
                        finishedAt: m.finishedAt ?? null,
                        durationMs: m.durationMs ?? null,
                        rowCount: m.rowCount ?? null,
                        affectedRows: m.affectedRows ?? null,
                        errorMessage: m.errorMessage ?? null,
                        limited: m.limited ?? false,
                        limit: m.limit ?? null,
                        byteSize: m.byteSize ?? null,
                        artifactStore: m.artifactStore ?? null,
                        storageFormat: m.storageFormat ?? null,
                        dataAvailability: m.dataAvailability ?? null,
                        createdAt: m.createdAt ?? null,
                        expiresAt: m.expiresAt ?? null
                    };
                });
                setSetsMeta(nextSetsMeta);
                const next = metas.map((m)=>m.setIndex).sort((a, b)=>a - b);
                cacheSessionUi(sessionId, {
                    indices: next,
                    setsMeta: nextSetsMeta
                });
                setIndices(next);
                if (activeSet === OVERVIEW_SET && !userPicked && next.length > 0) {
                    autoSetActiveSet(next[next.length - 1]);
                } else if (activeSet >= 0 && !next.includes(activeSet)) {
                    setActiveSet(OVERVIEW_SET);
                }
            } catch  {
            // The metadata request has settled; render the confirmed empty/error state.
            } finally{
                if (!canceled) setLoadedResultMetaSessionId(sessionId);
            }
        })();
        return ()=>{
            canceled = true;
        };
    }, [
        activeSet,
        autoSetActiveSet,
        dbReady,
        sessionId,
        dataVersion,
        listResultSetsMeta,
        cacheSessionUi,
        setActiveSet,
        userPicked
    ]);
    const overviewItems = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (!sessionId) return [];
        const scopedMeta = (setsMeta ?? []).filter((m)=>m.sessionId === sessionId);
        const items = scopedMeta.map((m)=>{
            const status = m.status ?? 'success';
            return {
                id: `${m.sessionId}:${m.setIndex}`,
                setIndex: m.setIndex,
                sql: m.sqlText || `/* Result ${m.setIndex + 1} */`,
                status,
                startedAt: m.startedAt ?? undefined,
                finishedAt: m.finishedAt ?? undefined,
                durationMs: m.durationMs ?? undefined,
                errorMessage: m.errorMessage ?? undefined,
                rowsReturned: typeof m.rowCount === 'number' ? m.rowCount : undefined,
                rowsAffected: typeof m.affectedRows === 'number' ? m.affectedRows : undefined,
                byteSize: typeof m.byteSize === 'number' ? m.byteSize : undefined,
                artifactStore: m.artifactStore ?? undefined,
                storageFormat: m.storageFormat ?? undefined,
                dataAvailability: m.dataAvailability ?? undefined,
                createdAt: m.createdAt ?? undefined,
                expiresAt: m.expiresAt ?? undefined
            };
        });
        const known = new Set(items.map((i)=>i.setIndex));
        const safeIndices = sessionId ? indices ?? [] : [];
        const extras = safeIndices.filter((i)=>!known.has(i)).map((i)=>({
                id: `${sessionId}:${i}`,
                setIndex: i,
                sql: `/* Result ${i + 1} */`,
                status: sessionStatus === 'running' ? 'running' : sessionStatus === 'error' ? 'error' : sessionStatus === 'canceled' ? 'canceled' : 'success'
            }));
        return [
            ...items,
            ...extras
        ].sort((a, b)=>a.setIndex - b.setIndex);
    }, [
        sessionId,
        setsMeta,
        indices,
        sessionStatus
    ]);
    const execMetaBySet = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const map = {};
        for (const i of indices){
            const isActive = i === activeSet;
            const m = setsMeta.find((x)=>x.setIndex === i);
            const runningRemote = m?.status === 'running' || runningTabs[tabId] === 'running';
            const runningLocal = false;
            map[i] = {
                runningRemote,
                runningLocal,
                executionMs: m?.durationMs ?? undefined,
                rowsReturned: typeof m?.rowCount === 'number' ? m.rowCount : undefined,
                rowsAffected: typeof m?.affectedRows === 'number' ? m.affectedRows : undefined,
                byteSize: typeof m?.byteSize === 'number' ? m.byteSize : undefined,
                sqlText: m?.sqlText ?? undefined,
                limitApplied: m?.limited ?? false,
                limitValue: typeof m?.limit === 'number' ? m.limit : undefined,
                truncated: isActive ? !!meta.truncated : false,
                startedAt: m?.startedAt ?? undefined,
                finishedAt: m?.finishedAt ?? undefined,
                errorMessage: m?.errorMessage ?? undefined,
                source: typeof meta.source === 'string' ? meta.source : undefined
            };
        }
        return map;
    }, [
        activeSet,
        indices,
        setsMeta,
        runningTabs,
        tabId,
        meta.truncated,
        meta.source
    ]);
    /* ---------- actions ---------- */ const handleDownloadCsv = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        if (remoteResultSetId) {
            const created = await exportResultSet({
                resultSetId: remoteResultSetId,
                format: 'csv',
                sorts: remoteOperations.sorts,
                filters: remoteOperations.filters,
                search: remoteOperations.search
            });
            window.location.href = created.downloadUrl;
            return;
        }
    }, [
        exportResultSet,
        remoteOperations.filters,
        remoteOperations.search,
        remoteOperations.sorts,
        remoteResultSetId
    ]);
    /* ---------- render ---------- */ if (!tabId) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "h-full flex items-center justify-center text-sm text-muted-foreground bg-card",
            children: t('Results.SelectTab')
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
            lineNumber: 922,
            columnNumber: 16
        }, this);
    }
    const isLiveExecution = runningTabs[tabId] === 'running' || sessionStatus === 'running';
    const isResultMetadataLoading = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$result$2d$loading$2d$mode$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["shouldShowResultMetadataLoading"])({
        sessionId,
        loadedSessionId: loadedResultMetaSessionId,
        hasCachedMetadata: Boolean(sessionId && sessionUiCacheRef.current[sessionId]?.setsMeta),
        activeSet,
        activeMetaSessionId: sessionMetas.sessionId,
        activeMetaSetIndex: sessionMetas.setIndex,
        isLiveExecution
    });
    const isRestoringPersistedResult = isResultMetadataLoading && !isLiveExecution;
    function renderResult() {
        if (noSessionId) {
            const emptyResultMessage = workspaceScope.workspaceMode === 'agent' ? t('Results.AgentRunQueryFirst') : t('Results.RunQueryFirst');
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "h-full flex items-center justify-center px-4 text-center text-sm bg-card text-muted-foreground",
                children: emptyResultMessage
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                lineNumber: 940,
                columnNumber: 20
            }, this);
        }
        if (isResultMetadataLoading) {
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex h-full items-center justify-center bg-card text-sm text-muted-foreground",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Badge"], {
                    variant: "outline",
                    className: "gap-1",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                            className: "h-3.5 w-3.5 animate-spin"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                            lineNumber: 946,
                            columnNumber: 25
                        }, this),
                        t(isRestoringPersistedResult ? 'Results.RestoringResults' : 'Results.LoadingResults')
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                    lineNumber: 945,
                    columnNumber: 21
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                lineNumber: 944,
                columnNumber: 17
            }, this);
        }
        const hasRenderableRows = activeSet >= 0 && (isRemoteFullResult ? rowCount > 0 : localResults.length > 0);
        const hasRenderableResult = activeSet >= 0 && (hasRenderableRows || execMetaBySet?.[activeSet]?.errorMessage);
        if (isLiveExecution && !hasRenderableResult) {
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "h-full flex items-center justify-center text-sm text-muted-foreground",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Badge"], {
                    variant: "outline",
                    className: "gap-1",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                            className: "h-3.5 w-3.5 animate-spin bg-card"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                            lineNumber: 958,
                            columnNumber: 25
                        }, this),
                        t('Results.WaitingForResults')
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                    lineNumber: 957,
                    columnNumber: 21
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                lineNumber: 956,
                columnNumber: 17
            }, this);
        }
        // if (showLocalLoading) {
        //     return (
        //         <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        //             <Badge variant="outline" className="gap-1">
        //                 <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        //                 Prepare to display...
        //             </Badge>
        //         </div>
        //     );
        // }
        if (activeSet === OVERVIEW_SET) {
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$OverviewTable$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["OverviewTable"], {
                items: overviewItems,
                onOpenResultBySetIndex: (i)=>{
                    setActiveSet(i);
                }
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                lineNumber: 977,
                columnNumber: 17
            }, this);
        }
        if (execMetaBySet?.[activeSet]?.errorMessage) {
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$SQLErrorAlert$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SQLErrorAlert"], {
                message: execMetaBySet?.[activeSet]?.errorMessage,
                sql: execMetaBySet?.[activeSet]?.sqlText
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                lineNumber: 986,
                columnNumber: 20
            }, this);
        }
        if (shouldShowWholeResultEmpty) {
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "h-full bg-card flex items-center justify-center text-sm text-muted-foreground",
                children: t('Results.NoResults')
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                lineNumber: 989,
                columnNumber: 20
            }, this);
        }
        const showSharedFilterBar = currentViewMode === 'table' || currentViewMode === 'charts';
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-full min-h-0 flex-col bg-card mb-2",
            "data-testid": "result-table-content",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "border-b bg-muted/30",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex min-h-12 items-center justify-between gap-3 w-full px-2 py-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Tabs"], {
                                value: currentViewMode,
                                onValueChange: (value)=>{
                                    if (value === 'table' || value === 'charts') {
                                        setCurrentViewMode(value);
                                        setViewModesByKey((prev)=>{
                                            if (prev[viewModeKey] === value) return prev;
                                            return {
                                                ...prev,
                                                [viewModeKey]: value
                                            };
                                        });
                                    }
                                },
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center gap-2",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsList"], {
                                        className: "h-7 p-[2px]",
                                        "aria-label": "Result view",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                                                value: "table",
                                                className: "h-6 px-3 text-xs cursor-pointer",
                                                children: t('Results.Table')
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                                lineNumber: 1014,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                                                value: "charts",
                                                className: "h-6 px-3 text-xs cursor-pointer",
                                                children: t('Results.Charts')
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                                lineNumber: 1017,
                                                columnNumber: 37
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                        lineNumber: 1013,
                                        columnNumber: 33
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                    lineNumber: 1012,
                                    columnNumber: 29
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                lineNumber: 997,
                                columnNumber: 25
                            }, this),
                            showSharedFilterBar ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex min-w-0 flex-1 flex-row",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$TableSearchBar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["VTableSearchBar"], {
                                        query: query,
                                        className: "w-80 max-w-full",
                                        onQueryChange: setQuery,
                                        onClearQuery: ()=>setQuery(''),
                                        filteredCount: stats.filteredCount,
                                        totalCount: stats.totalCount
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                        lineNumber: 1025,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$VTableFilters$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["VTableFilters"], {
                                        activeFilters: activeFilters,
                                        columnsRaw: sessionMetas.columns ?? [],
                                        onUpsertFilter: setColumnFilter,
                                        onRemoveFilter: removeFilter,
                                        onClearAllFilters: clearAllFilters,
                                        className: "border-0 bg-transparent px-0 py-0"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                        lineNumber: 1033,
                                        columnNumber: 33
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                lineNumber: 1024,
                                columnNumber: 29
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "h-10 flex-1"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                lineNumber: 1043,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-1.5 mr-2",
                                children: isResult && currentViewMode === 'table' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenu"], {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuTrigger"], {
                                            asChild: true,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                                                variant: "ghost",
                                                size: "icon",
                                                className: "h-7 w-7 mr-1 cursor-pointer",
                                                title: t('Results.DownloadCsvTitle'),
                                                "aria-label": t('Results.DownloadCsvTitle'),
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ellipsis$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MoreHorizontal$3e$__["MoreHorizontal"], {
                                                    className: "h-3.5 w-3.5"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                                    lineNumber: 1056,
                                                    columnNumber: 45
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                                lineNumber: 1049,
                                                columnNumber: 41
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                            lineNumber: 1048,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuContent"], {
                                            align: "end",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                                                onSelect: ()=>void handleDownloadCsv(),
                                                disabled: rowCount <= 0,
                                                className: "cursor-pointer",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$download$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Download$3e$__["Download"], {}, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                                        lineNumber: 1061,
                                                        columnNumber: 45
                                                    }, this),
                                                    "CSV"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                                lineNumber: 1060,
                                                columnNumber: 41
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                            lineNumber: 1059,
                                            columnNumber: 37
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                    lineNumber: 1047,
                                    columnNumber: 33
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                lineNumber: 1045,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                        lineNumber: 996,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                    lineNumber: 995,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "relative flex min-h-0 flex-1",
                    children: [
                        Object.values(tablePaneSnapshotsBySet).map((snapshot)=>{
                            const visible = currentViewMode === 'table' && snapshot.setIndex === activeSet && sessionMetas.sessionId === snapshot.sessionId && sessionMetas.setIndex === snapshot.setIndex && hydratedViewStateKey === `${snapshot.sessionId}:${snapshot.setIndex}`;
                            const paneActiveFilters = visible ? activeFilters : snapshot.activeFilters;
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                "data-testid": `result-set-table-${snapshot.setIndex}`,
                                "aria-hidden": !visible,
                                inert: !visible,
                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('absolute inset-0 min-h-0', visible ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'),
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$index$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    results: visible ? isRemoteFullResult ? EMPTY_RESULTS : columnFilteredResults : snapshot.results,
                                    columnMetas: visible ? sessionMetas.columns ?? [] : snapshot.columnMetas,
                                    remoteSource: visible ? remoteSource : snapshot.remoteSource,
                                    storageKey: visible ? storageKey : snapshot.storageKey,
                                    onStatsChange: onStatsChange,
                                    setInspectorOpen: visible ? setInspectorOpen : undefined,
                                    setInspectorMode: visible ? setInspectorMode : undefined,
                                    setInspectorPayload: visible ? setInspectorPayload : undefined,
                                    activeFilters: paneActiveFilters,
                                    onUpsertFilter: visible ? setColumnFilter : undefined,
                                    onRemoveFilter: visible ? removeFilter : undefined,
                                    onClearAllFilters: visible ? clearAllFilters : undefined,
                                    showFiltersBar: false,
                                    initialSort: visible ? sortState : snapshot.initialSort,
                                    selectedRowIndexes: visible ? selectedRowIndexes : snapshot.selectedRowIndexes,
                                    isActive: visible && tabId === activeTabId,
                                    serverSideOperations: visible ? isRemoteFullResult : snapshot.serverSideOperations,
                                    onSortChange: visible ? setSortState : undefined,
                                    onSelectedRowIndexesChange: visible ? handleSelectedRowIndexesChange : undefined
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                    lineNumber: 1088,
                                    columnNumber: 33
                                }, this)
                            }, `${snapshot.sessionId}:${snapshot.setIndex}`, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                lineNumber: 1081,
                                columnNumber: 29
                            }, this);
                        }),
                        currentViewMode === 'table' && shouldShowFilteredEmpty && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "absolute inset-0 z-20 flex items-center justify-center bg-card text-sm text-muted-foreground",
                            children: t('Results.NoResults')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                            lineNumber: 1113,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])('absolute inset-0 min-h-0', currentViewMode === 'charts' ? 'z-10 flex opacity-100' : 'z-0 opacity-0 pointer-events-none'),
                            children: chartSetIndices.map((setIndex)=>{
                                const setChartStateKey = tabId ? `tab:${tabId}:set:${setIndex}` : 'unknown';
                                const snapshot = chartSnapshotsBySet[setIndex] ?? (setIndex === activeSet ? {
                                    rows: isRemoteFullResult ? [] : columnFilteredResults,
                                    columnsRaw: sessionMetas.columns
                                } : undefined);
                                if (!snapshot) {
                                    return null;
                                }
                                const setVersion = chartStateVersionByTab[setChartStateKey] ?? 0;
                                const setInitialState = setChartStateKey !== 'unknown' ? chartStatesByKey[setChartStateKey] : undefined;
                                const visible = setIndex === activeSet;
                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Activity"], {
                                    mode: visible ? 'visible' : 'hidden',
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: `flex min-h-0 flex-1 flex-col ${visible ? '' : 'hidden'}`,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$charts$2f$index$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Charts"], {
                                            rows: snapshot.rows,
                                            columnsRaw: snapshot.columnsRaw,
                                            resultStats: setIndex === activeSet ? sessionMetas.stats : undefined,
                                            remoteSource: visible && isRemoteFullResult && remoteResultSetId ? {
                                                cacheKey: `${remoteResultSetId}:${remoteOperationKey}:chart`,
                                                readChart: (state)=>readResultSetChart({
                                                        resultSetId: remoteResultSetId,
                                                        xKey: state.xKey,
                                                        yKey: state.yKey,
                                                        groupKey: state.groupKey,
                                                        chartType: state.chartType,
                                                        filters: remoteOperations.filters,
                                                        search: remoteOperations.search
                                                    })
                                            } : null,
                                            stateKey: setChartStateKey,
                                            initialState: setInitialState,
                                            stateSyncEnabled: visible,
                                            onResetState: ()=>{
                                                setChartStatesByKey((prev)=>{
                                                    if (!prev[setChartStateKey]) {
                                                        return prev;
                                                    }
                                                    const next = {
                                                        ...prev
                                                    };
                                                    delete next[setChartStateKey];
                                                    return next;
                                                });
                                                setChartStateVersionByTab((prev)=>({
                                                        ...prev,
                                                        [setChartStateKey]: (prev[setChartStateKey] ?? 0) + 1
                                                    }));
                                            },
                                            onStateChange: (nextState)=>{
                                                setChartStatesByKey((prev)=>{
                                                    const current = prev[setChartStateKey];
                                                    if (current?.chartType === nextState.chartType && current?.xKey === nextState.xKey && current?.yKey === nextState.yKey && current?.groupKey === nextState.groupKey && current?.chartColorPreset === nextState.chartColorPreset) {
                                                        return prev;
                                                    }
                                                    return {
                                                        ...prev,
                                                        [setChartStateKey]: nextState
                                                    };
                                                });
                                            },
                                            onApplyFilters: (filters, options)=>{
                                                if (!visible) {
                                                    return;
                                                }
                                                if (!options?.append) {
                                                    clearAllFilters();
                                                }
                                                filters.forEach((filter)=>{
                                                    setColumnFilter(filter);
                                                });
                                            }
                                        }, `${setChartStateKey}:${setVersion}`, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                            lineNumber: 1132,
                                            columnNumber: 41
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                        lineNumber: 1131,
                                        columnNumber: 37
                                    }, this)
                                }, setChartStateKey, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                                    lineNumber: 1130,
                                    columnNumber: 33
                                }, this);
                            })
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                            lineNumber: 1115,
                            columnNumber: 21
                        }, this),
                        currentViewMode === 'table' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$InspectorPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["InspectorPanel"], {
                            open: inspectorOpen,
                            setOpen: setInspectorOpen,
                            mode: inspectorMode,
                            payload: inspectorPayload,
                            rowViewMode: rowViewMode,
                            setRowViewMode: setRowViewMode,
                            inspectorWidth: inspectorWidth,
                            setInspectorWidth: setInspectorWidth
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                            lineNumber: 1210,
                            columnNumber: 25
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                    lineNumber: 1070,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
            lineNumber: 994,
            columnNumber: 13
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex h-full flex-col",
        "data-testid": "result-table",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$Toolbar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Toolbar"], {
                indices: indices,
                activeSet: activeSet,
                onSetActiveSet: (n)=>{
                    setActiveSet(n);
                }
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                lineNumber: 1229,
                columnNumber: 13
            }, this),
            storageLimitApplied ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "border-b bg-muted/50 px-3 py-2 text-xs text-muted-foreground",
                children: t('Results.StorageLimitPreviewOnly')
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                lineNumber: 1238,
                columnNumber: 36
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 min-h-0",
                children: renderResult()
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                lineNumber: 1239,
                columnNumber: 13
            }, this),
            isResult && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$ResultStatusBar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ResultStatusBar"], {
                meta: execMetaBySet?.[activeSet],
                shouldShowLimitNotice: shouldShowLimitNotice
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
                lineNumber: 1241,
                columnNumber: 26
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-table.tsx",
        lineNumber: 1227,
        columnNumber: 9
    }, this);
}
}),
"[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/stores/copilot-prompt.atoms.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "copilotPromptRequestAtom",
    ()=>copilotPromptRequestAtom
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/vanilla.mjs [app-ssr] (ecmascript)");
;
const copilotPromptRequestAtom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["atom"])(null);
}),
];

//# sourceMappingURL=069b_%28app%29_%5Borganization%5D_%5BconnectionId%5D_sql-console_components_result-table_207wgs3._.js.map