(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/apps/web/app/(app)/[organization]/components/table-browser/utils.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildColumnCacheKey",
    ()=>buildColumnCacheKey,
    "computeColumnsHash",
    ()=>computeColumnsHash,
    "supportsTableStats",
    ()=>supportsTableStats
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/drivers/src/types/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$types$2f$postgres$2d$family$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/drivers/src/types/postgres-family.ts [app-client] (ecmascript)");
;
function supportsTableStats(driver) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$types$2f$postgres$2d$family$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isPostgresFamilyConnectionType"])(driver) || driver === 'clickhouse' || driver === 'mysql' || driver === 'mariadb';
}
function buildColumnCacheKey(connectionId, databaseName, tableName) {
    if (!connectionId || !databaseName || !tableName) return null;
    return `${connectionId}::${databaseName}::${tableName}`;
}
function computeColumnsHash(connectionId, databaseName, tableName, columns) {
    const payload = {
        connectionId: connectionId ?? 'unknown',
        databaseName,
        tableName,
        columns: columns.map((col)=>({
                name: col.name,
                type: col.type,
                nullable: !!col.nullable,
                defaultValue: col.defaultValue ?? null,
                comment: col.comment ?? null
            }))
    };
    const input = JSON.stringify(payload);
    let hash = 0;
    for(let i = 0; i < input.length; i += 1){
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0; // 32-bit
    }
    return `${Math.abs(hash)}`;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DatabaseSelect",
    ()=>DatabaseSelect
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/check.js [app-client] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevrons$2d$up$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronsUpDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevrons-up-down.js [app-client] (ecmascript) <export default as ChevronsUpDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$database$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Database$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/database.js [app-client] (ecmascript) <export default as Database>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-client] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/lib/utils.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/command.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/popover.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/tooltip.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
;
;
function DatabaseSelect({ value, databases, onChange, className, loading = false, error = null }) {
    _s();
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [query, setQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('SQLConsoleSidebar');
    const selected = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DatabaseSelect.useMemo[selected]": ()=>databases.find({
                "DatabaseSelect.useMemo[selected]": (database)=>database.value === value
            }["DatabaseSelect.useMemo[selected]"]) ?? null
    }["DatabaseSelect.useMemo[selected]"], [
        databases,
        value
    ]);
    const filtered = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DatabaseSelect.useMemo[filtered]": ()=>{
            if (!query.trim()) return databases;
            const normalizedQuery = query.toLowerCase();
            return databases.filter({
                "DatabaseSelect.useMemo[filtered]": (database)=>database.label.toLowerCase().includes(normalizedQuery) || database.value.toLowerCase().includes(normalizedQuery)
            }["DatabaseSelect.useMemo[filtered]"]);
        }
    }["DatabaseSelect.useMemo[filtered]"], [
        databases,
        query
    ]);
    const handleSelect = (database)=>{
        onChange(database);
        setOpen(false);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipProvider"], {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Popover"], {
            open: open,
            onOpenChange: setOpen,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PopoverTrigger"], {
                    asChild: true,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                        variant: "outline",
                        role: "combobox",
                        "aria-expanded": open,
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('h-8 w-full justify-between', className),
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "flex min-w-0 items-center gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$database$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Database$3e$__["Database"], {
                                        className: "h-4 w-4 shrink-0"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                        lineNumber: 47,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                                asChild: true,
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "max-w-55 truncate text-sm",
                                                    children: selected ? selected.label : t('Select database')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                                    lineNumber: 50,
                                                    columnNumber: 37
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                                lineNumber: 49,
                                                columnNumber: 33
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                                side: "right",
                                                children: selected ? selected.label : t('Select database')
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                                lineNumber: 52,
                                                columnNumber: 33
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                        lineNumber: 48,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                lineNumber: 46,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevrons$2d$up$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronsUpDown$3e$__["ChevronsUpDown"], {
                                className: "h-4 w-4 shrink-0 opacity-50"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                lineNumber: 55,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                        lineNumber: 45,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                    lineNumber: 44,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PopoverContent"], {
                    align: "start",
                    className: "w-80 p-0",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Command"], {
                        shouldFilter: false,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandInput"], {
                                placeholder: t('Search databases'),
                                value: query,
                                onValueChange: setQuery,
                                className: "h-9"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                lineNumber: 61,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandList"], {
                                className: "max-h-64",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandEmpty"], {
                                        children: loading ? t('Loading databases') : error ? t('Failed to load databases') : t('No results')
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                        lineNumber: 63,
                                        columnNumber: 29
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandGroup"], {
                                        heading: t('Databases'),
                                        children: [
                                            loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                        className: "h-4 w-4 animate-spin"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                                        lineNumber: 67,
                                                        columnNumber: 41
                                                    }, this),
                                                    t('Loading databases')
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                                lineNumber: 66,
                                                columnNumber: 37
                                            }, this) : null,
                                            filtered.map((database)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandItem"], {
                                                    value: database.value,
                                                    onSelect: handleSelect,
                                                    className: "flex items-center gap-2",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$database$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Database$3e$__["Database"], {
                                                            className: "h-4 w-4 shrink-0"
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                                            lineNumber: 73,
                                                            columnNumber: 41
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                                                    asChild: true,
                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "max-w-50 truncate text-sm",
                                                                        children: database.label
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                                                        lineNumber: 76,
                                                                        columnNumber: 49
                                                                    }, this)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                                                    lineNumber: 75,
                                                                    columnNumber: 45
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                                                    side: "right",
                                                                    children: database.label
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                                                    lineNumber: 78,
                                                                    columnNumber: 45
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                                            lineNumber: 74,
                                                            columnNumber: 41
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('ml-auto h-4 w-4', value === database.value ? 'opacity-100' : 'opacity-0')
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                                            lineNumber: 80,
                                                            columnNumber: 41
                                                        }, this)
                                                    ]
                                                }, database.value, true, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                                    lineNumber: 72,
                                                    columnNumber: 37
                                                }, this))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                        lineNumber: 64,
                                        columnNumber: 29
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                                lineNumber: 62,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                        lineNumber: 60,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
                    lineNumber: 59,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
            lineNumber: 43,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx",
        lineNumber: 42,
        columnNumber: 9
    }, this);
}
_s(DatabaseSelect, "96rSvaaAHpQvZIvCrJ54zWBcWkI=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = DatabaseSelect;
var _c;
__turbopack_context__.k.register(_c, "DatabaseSelect");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/sidebar-config.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getSidebarConfig",
    ()=>getSidebarConfig
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/drivers/src/types/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$types$2f$postgres$2d$family$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/drivers/src/types/postgres-family.ts [app-client] (ecmascript)");
;
const DEFAULT_CONFIG = {
    dialect: 'default',
    supportsSchemas: false,
    hiddenDatabases: [
        'system',
        'information_schema'
    ]
};
const SIDEBAR_CONFIG_BY_DIALECT = {
    clickhouse: {
        dialect: 'clickhouse',
        supportsSchemas: false,
        hiddenDatabases: [
            'system',
            'information_schema'
        ]
    },
    'cloudflare-d1': {
        dialect: 'sqlite',
        supportsSchemas: false,
        hiddenDatabases: []
    },
    doris: {
        dialect: 'doris',
        supportsSchemas: false,
        hiddenDatabases: [
            'information_schema'
        ]
    },
    duckdb: {
        dialect: 'duckdb',
        supportsSchemas: false,
        hiddenDatabases: [
            'information_schema',
            'system'
        ]
    },
    mariadb: {
        dialect: 'mariadb',
        supportsSchemas: false,
        hiddenDatabases: [
            'information_schema',
            'mysql',
            'performance_schema',
            'sys'
        ]
    },
    mysql: {
        dialect: 'mysql',
        supportsSchemas: false,
        hiddenDatabases: [
            'information_schema',
            'mysql',
            'performance_schema',
            'sys'
        ]
    },
    oracle: {
        dialect: 'oracle',
        supportsSchemas: true,
        hiddenDatabases: [
            'SYS',
            'SYSTEM',
            'XDB',
            'MDSYS',
            'CTXSYS',
            'ORDSYS'
        ]
    },
    neon: {
        dialect: 'postgres',
        supportsSchemas: true,
        defaultSchemaName: 'public',
        hiddenDatabases: [
            'system',
            'information_schema'
        ]
    },
    postgres: {
        dialect: 'postgres',
        supportsSchemas: true,
        defaultSchemaName: 'public',
        hiddenDatabases: [
            'system',
            'information_schema'
        ]
    },
    sqlite: {
        dialect: 'sqlite',
        supportsSchemas: false,
        hiddenDatabases: []
    },
    snowflake: {
        dialect: 'snowflake',
        supportsSchemas: true,
        defaultSchemaName: 'PUBLIC',
        hiddenDatabases: [
            'SNOWFLAKE',
            'SNOWFLAKE_SAMPLE_DATA',
            'INFORMATION_SCHEMA'
        ]
    },
    supabase: {
        dialect: 'postgres',
        supportsSchemas: true,
        defaultSchemaName: 'public',
        hiddenDatabases: [
            'system',
            'information_schema'
        ]
    },
    sqlserver: {
        dialect: 'sqlserver',
        supportsSchemas: true,
        defaultSchemaName: 'dbo',
        hiddenDatabases: [
            'master',
            'model',
            'msdb',
            'tempdb',
            'system',
            'information_schema'
        ]
    }
};
function getSidebarConfig(connectionType) {
    if (!connectionType) {
        return DEFAULT_CONFIG;
    }
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$types$2f$postgres$2d$family$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isPostgresFamilyConnectionType"])(connectionType)) {
        return SIDEBAR_CONFIG_BY_DIALECT.postgres;
    }
    return SIDEBAR_CONFIG_BY_DIALECT[connectionType] ?? DEFAULT_CONFIG;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SchemaSelect",
    ()=>SchemaSelect
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/check.js [app-client] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevrons$2d$up$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronsUpDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevrons-up-down.js [app-client] (ecmascript) <export default as ChevronsUpDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Layers3$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/layers.js [app-client] (ecmascript) <export default as Layers3>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/lib/utils.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/command.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/popover.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
;
function SchemaSelect({ value, schemas, onChange, className }) {
    _s();
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [query, setQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('SQLConsoleSidebar');
    const selected = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "SchemaSelect.useMemo[selected]": ()=>schemas.find({
                "SchemaSelect.useMemo[selected]": (schema)=>schema.value === value
            }["SchemaSelect.useMemo[selected]"]) ?? null
    }["SchemaSelect.useMemo[selected]"], [
        schemas,
        value
    ]);
    const filtered = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "SchemaSelect.useMemo[filtered]": ()=>{
            if (!query.trim()) return schemas;
            const normalizedQuery = query.toLowerCase();
            return schemas.filter({
                "SchemaSelect.useMemo[filtered]": (schema)=>schema.label.toLowerCase().includes(normalizedQuery) || schema.value.toLowerCase().includes(normalizedQuery)
            }["SchemaSelect.useMemo[filtered]"]);
        }
    }["SchemaSelect.useMemo[filtered]"], [
        query,
        schemas
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Popover"], {
        open: open,
        onOpenChange: setOpen,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PopoverTrigger"], {
                asChild: true,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                    variant: "outline",
                    role: "combobox",
                    "aria-expanded": open,
                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('h-8 w-full justify-between', className),
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "flex min-w-0 items-center gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Layers3$3e$__["Layers3"], {
                                    className: "h-4 w-4 shrink-0"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                                    lineNumber: 37,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "truncate text-sm",
                                    children: selected?.label ?? t('Select schema')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                                    lineNumber: 38,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                            lineNumber: 36,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevrons$2d$up$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronsUpDown$3e$__["ChevronsUpDown"], {
                            className: "h-4 w-4 shrink-0 opacity-50"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                            lineNumber: 40,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                    lineNumber: 35,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                lineNumber: 34,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PopoverContent"], {
                align: "start",
                className: "w-80 p-0",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Command"], {
                    shouldFilter: false,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandInput"], {
                            placeholder: t('Search schemas'),
                            value: query,
                            onValueChange: setQuery,
                            className: "h-9"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                            lineNumber: 46,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandList"], {
                            className: "max-h-64",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandEmpty"], {
                                    children: t('No results')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                                    lineNumber: 48,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandGroup"], {
                                    heading: t('Schemas'),
                                    children: filtered.map((schema)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandItem"], {
                                            value: schema.value,
                                            onSelect: (nextValue)=>{
                                                onChange(nextValue);
                                                setOpen(false);
                                            },
                                            className: "flex items-center gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Layers3$3e$__["Layers3"], {
                                                    className: "h-4 w-4 shrink-0"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                                                    lineNumber: 60,
                                                    columnNumber: 37
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "truncate text-sm",
                                                    children: schema.label
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                                                    lineNumber: 61,
                                                    columnNumber: 37
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('ml-auto h-4 w-4', value === schema.value ? 'opacity-100' : 'opacity-0')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                                                    lineNumber: 62,
                                                    columnNumber: 37
                                                }, this)
                                            ]
                                        }, schema.value, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                                            lineNumber: 51,
                                            columnNumber: 33
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                                    lineNumber: 49,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                            lineNumber: 47,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                    lineNumber: 45,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
                lineNumber: 44,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx",
        lineNumber: 33,
        columnNumber: 9
    }, this);
}
_s(SchemaSelect, "96rSvaaAHpQvZIvCrJ54zWBcWkI=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = SchemaSelect;
var _c;
__turbopack_context__.k.register(_c, "SchemaSelect");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TableList",
    ()=>TableList
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/badge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/context-menu.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/dialog.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/input.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/scroll-area.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/web-utils/src/index.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-down.js [app-client] (ecmascript) <export default as ChevronDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$copy$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Copy$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/copy.js [app-client] (ecmascript) <export default as Copy>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-client] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pencil$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Pencil$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/pencil.js [app-client] (ecmascript) <export default as Pencil>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$play$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Play$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/play.js [app-client] (ecmascript) <export default as Play>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$table$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Table$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/table.js [app-client] (ecmascript) <export default as Table>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2d$terminal$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__TerminalSquare$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/square-terminal.js [app-client] (ecmascript) <export default as TerminalSquare>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
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
function TableList({ tables, loading, activeDatabase, selectedTable, selectedDatabase, expandedTableKeys, loadingTableKeys, columnsByTableKey, onToggleTable, onSelectTable, onOpenTableTab, onOpenQueryConsole, onQueryTable, onRenameTable, getTableActionPayload, t }) {
    _s();
    const [renameTarget, setRenameTarget] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [renameDraft, setRenameDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [isRenaming, setIsRenaming] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const toPayload = (table)=>getTableActionPayload?.(table) ?? {
            database: activeDatabase,
            schema: table.schemaName,
            tableName: table.value,
            tabLabel: table.label
        };
    const handleCopyTableName = async (table)=>{
        try {
            await navigator.clipboard.writeText(table.value);
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].success(t('Table name copied'));
        } catch  {
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error(t('Copy table name failed'));
        }
    };
    const openRenameDialog = (table)=>{
        const payload = toPayload(table);
        setRenameTarget(payload);
        setRenameDraft(table.value.split('.').filter(Boolean).pop() ?? table.value);
    };
    const handleRenameConfirm = async ()=>{
        if (!renameTarget || !onRenameTable) return;
        const nextName = renameDraft.trim();
        const currentName = renameTarget.tableName.split('.').filter(Boolean).pop() ?? renameTarget.tableName;
        if (!nextName || nextName === currentName) {
            setRenameTarget(null);
            setRenameDraft('');
            return;
        }
        setIsRenaming(true);
        try {
            await onRenameTable({
                ...renameTarget,
                nextName
            });
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].success(t('Table renamed'));
            setRenameTarget(null);
            setRenameDraft('');
        } catch (error) {
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error(error instanceof Error ? error.message : t('Rename table failed'));
        } finally{
            setIsRenaming(false);
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ScrollArea"], {
                className: "mt-1 min-h-0 w-[calc(100%+0.75rem)] min-w-0 flex-1 -mr-3 space-y-2",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "min-w-0 pr-3",
                    children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground",
                        "aria-live": "polite",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                className: "h-3.5 w-3.5 animate-spin"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                lineNumber: 110,
                                columnNumber: 29
                            }, this),
                            t('Loading tables')
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                        lineNumber: 109,
                        columnNumber: 25
                    }, this) : tables.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "px-2 py-1.5 text-xs text-muted-foreground",
                        "aria-live": "polite",
                        children: t('No matching tables found')
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                        lineNumber: 114,
                        columnNumber: 25
                    }, this) : tables.map((table)=>{
                        const isExpanded = expandedTableKeys.has(table.key);
                        const columns = columnsByTableKey[table.key] || [];
                        const isLoading = loadingTableKeys.has(table.key);
                        const isSelected = Boolean(selectedTable) && table.value === selectedTable && (!selectedDatabase || activeDatabase === selectedDatabase);
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ContextMenu"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ContextMenuTrigger"], {
                                    asChild: true,
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "group/table-row my-px min-w-0 space-y-1",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('mx-1 min-w-0 overflow-hidden rounded-md', !isSelected && 'hover:bg-muted/50 group-data-[state=open]/table-row:bg-muted/50', isSelected && 'bg-primary/10 text-foreground ring-1 ring-primary/30'),
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex min-w-0 items-center justify-between gap-2 px-1 py-1",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex min-w-0 flex-1 items-center gap-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                onClick: ()=>onToggleTable(table),
                                                                className: "cursor-pointer rounded p-0.5 hover:bg-muted",
                                                                "aria-label": `${isExpanded ? t('Collapse') : t('Expand')} ${table.value} ${t('Columns')}`,
                                                                children: isLoading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                                    className: "h-3.5 w-3.5 animate-spin"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                                    lineNumber: 143,
                                                                    columnNumber: 65
                                                                }, this) : isExpanded ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__["ChevronDown"], {
                                                                    className: "h-3.5 w-3.5"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                                    lineNumber: 145,
                                                                    columnNumber: 65
                                                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                                                    className: "h-3.5 w-3.5"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                                    lineNumber: 147,
                                                                    columnNumber: 65
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                                lineNumber: 137,
                                                                columnNumber: 57
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$table$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Table$3e$__["Table"], {
                                                                className: "h-3.5 w-3.5 shrink-0"
                                                            }, void 0, false, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                                lineNumber: 151,
                                                                columnNumber: 57
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                className: "min-w-0 flex-1 cursor-pointer overflow-hidden truncate whitespace-nowrap text-left text-sm",
                                                                onClick: ()=>{
                                                                    const payload = toPayload(table);
                                                                    onSelectTable?.(payload);
                                                                    onOpenTableTab?.(payload);
                                                                },
                                                                "aria-label": t('Insert select for', {
                                                                    table: table.value
                                                                }),
                                                                title: table.label,
                                                                children: table.label
                                                            }, void 0, false, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                                lineNumber: 153,
                                                                columnNumber: 57
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                        lineNumber: 136,
                                                        columnNumber: 53
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                    lineNumber: 135,
                                                    columnNumber: 49
                                                }, this),
                                                isExpanded && !isLoading && columns.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mt-1 space-y-1",
                                                    children: columns.map((column)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "ml-6 flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/30",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40"
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                                    lineNumber: 175,
                                                                    columnNumber: 65
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "flex-1 truncate",
                                                                    title: column.columnName,
                                                                    children: column.columnName
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                                    lineNumber: 176,
                                                                    columnNumber: 65
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                                                    variant: "outline",
                                                                    className: "h-4 max-w-35 cursor-default justify-start truncate px-1 py-0 text-xs text-muted-foreground",
                                                                    title: column.columnType,
                                                                    children: column.columnType
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                                    lineNumber: 179,
                                                                    columnNumber: 65
                                                                }, this)
                                                            ]
                                                        }, `${table.key}:${column.columnName}`, true, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                            lineNumber: 171,
                                                            columnNumber: 61
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                    lineNumber: 169,
                                                    columnNumber: 53
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                            lineNumber: 128,
                                            columnNumber: 45
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                        lineNumber: 127,
                                        columnNumber: 41
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                    lineNumber: 126,
                                    columnNumber: 37
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ContextMenuContent"], {
                                    className: "w-52",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ContextMenuItem"], {
                                            onSelect: ()=>void onOpenQueryConsole?.(),
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2d$terminal$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__TerminalSquare$3e$__["TerminalSquare"], {
                                                    className: "mr-2 h-4 w-4"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                    lineNumber: 195,
                                                    columnNumber: 45
                                                }, this),
                                                t('Open Console')
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                            lineNumber: 194,
                                            columnNumber: 41
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ContextMenuItem"], {
                                            onSelect: ()=>void onQueryTable?.(toPayload(table)),
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$play$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Play$3e$__["Play"], {
                                                    className: "mr-2 h-4 w-4"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                    lineNumber: 199,
                                                    columnNumber: 45
                                                }, this),
                                                t('Quick Query')
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                            lineNumber: 198,
                                            columnNumber: 41
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ContextMenuItem"], {
                                            onSelect: ()=>void handleCopyTableName(table),
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$copy$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Copy$3e$__["Copy"], {
                                                    className: "mr-2 h-4 w-4"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                    lineNumber: 203,
                                                    columnNumber: 45
                                                }, this),
                                                t('Copy')
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                            lineNumber: 202,
                                            columnNumber: 41
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ContextMenuSeparator"], {}, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                            lineNumber: 206,
                                            columnNumber: 41
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$context$2d$menu$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ContextMenuItem"], {
                                            disabled: !onRenameTable,
                                            onSelect: ()=>openRenameDialog(table),
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pencil$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Pencil$3e$__["Pencil"], {
                                                    className: "mr-2 h-4 w-4"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                                    lineNumber: 208,
                                                    columnNumber: 45
                                                }, this),
                                                t('Rename')
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                            lineNumber: 207,
                                            columnNumber: 41
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                    lineNumber: 193,
                                    columnNumber: 37
                                }, this)
                            ]
                        }, table.key, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                            lineNumber: 125,
                            columnNumber: 33
                        }, this);
                    })
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                    lineNumber: 107,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                lineNumber: 106,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Dialog"], {
                open: !!renameTarget,
                onOpenChange: (open)=>{
                    if (!open) {
                        setRenameTarget(null);
                        setRenameDraft('');
                    }
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogContent"], {
                    className: "sm:max-w-sm",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogHeader"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogTitle"], {
                                    children: t('Rename table')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                    lineNumber: 230,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogDescription"], {
                                    children: t('Rename table description')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                    lineNumber: 231,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                            lineNumber: 229,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                            value: renameDraft,
                            autoFocus: true,
                            disabled: isRenaming,
                            onChange: (event)=>setRenameDraft(event.target.value),
                            onKeyDown: (event)=>{
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void handleRenameConfirm();
                                }
                            },
                            placeholder: t('Table name')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                            lineNumber: 233,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogFooter"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                    type: "button",
                                    variant: "outline",
                                    disabled: isRenaming,
                                    onClick: ()=>{
                                        setRenameTarget(null);
                                        setRenameDraft('');
                                    },
                                    children: t('Cancel')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                    lineNumber: 247,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                    type: "button",
                                    disabled: isRenaming || !renameDraft.trim(),
                                    onClick: ()=>void handleRenameConfirm(),
                                    children: [
                                        isRenaming ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                            className: "mr-2 h-4 w-4 animate-spin"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                            lineNumber: 259,
                                            columnNumber: 43
                                        }, this) : null,
                                        t('Rename')
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                                    lineNumber: 258,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                            lineNumber: 246,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                    lineNumber: 228,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx",
                lineNumber: 219,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true);
}
_s(TableList, "Q9ytRcfbFWYsMO5zmQ0d6nX0j/c=");
_c = TableList;
var _c;
__turbopack_context__.k.register(_c, "TableList");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/utils.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildScopedTableKey",
    ()=>buildScopedTableKey,
    "getInitialDatabase",
    ()=>getInitialDatabase,
    "getSchemaName",
    ()=>getSchemaName,
    "isHiddenDatabase",
    ()=>isHiddenDatabase,
    "matchesFilter",
    ()=>matchesFilter,
    "normalizeOption",
    ()=>normalizeOption,
    "resolveTableLabel",
    ()=>resolveTableLabel,
    "resolveTableValue",
    ()=>resolveTableValue,
    "toSidebarTableItem",
    ()=>toSidebarTableItem
]);
function normalizeOption(option) {
    const value = (option?.value ?? option?.label ?? option?.name ?? '').toString();
    if (!value) return null;
    return {
        value,
        label: (option?.label ?? option?.value ?? option?.name ?? value).toString()
    };
}
function getInitialDatabase(databases, preferredDatabase) {
    if (preferredDatabase) {
        const matched = databases.find((database)=>database.value === preferredDatabase);
        if (matched) {
            return matched.value;
        }
    }
    return databases[0]?.value ?? null;
}
function isHiddenDatabase(databaseName, config) {
    const normalized = databaseName.trim().toLowerCase();
    return config.hiddenDatabases.some((name)=>name.toLowerCase() === normalized);
}
function resolveTableValue(table) {
    return (table?.value ?? table?.name ?? table?.label ?? '').toString();
}
function resolveTableLabel(table) {
    return (table?.label ?? table?.value ?? table?.name ?? '').toString();
}
function getSchemaName(tableName, config) {
    if (!config.supportsSchemas) return null;
    const trimmed = tableName.trim();
    if (!trimmed) return null;
    const [schemaName, ...rest] = trimmed.split('.');
    if (rest.length === 0) {
        return config.defaultSchemaName ?? null;
    }
    return schemaName || config.defaultSchemaName || null;
}
function toSidebarTableItem(table, config) {
    const value = resolveTableValue(table);
    if (!value) return null;
    return {
        key: value,
        value,
        label: resolveTableLabel(table) || value,
        schemaName: getSchemaName(value, config)
    };
}
function matchesFilter(value, label, filterText) {
    if (!filterText) return true;
    const normalizedFilter = filterText.trim().toLowerCase();
    if (!normalizedFilter) return true;
    return value.toLowerCase().includes(normalizedFilter) || label.toLowerCase().includes(normalizedFilter);
}
function buildScopedTableKey(databaseName, tableName) {
    return `${databaseName}::${tableName}`;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/sql-console-sidebar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SQLConsoleSidebar",
    ()=>SQLConsoleSidebar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-client] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/refresh-cw.js [app-client] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/search.js [app-client] (ecmascript) <export default as Search>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/react.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/input.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$databases$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/hooks/use-databases.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$tables$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/hooks/use-tables.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$columns$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/hooks/use-columns.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$schemas$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/hooks/use-schemas.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/shared/stores/app.store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$database$2d$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/database-select.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$sidebar$2d$config$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/sidebar-config.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$schema$2d$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/schema-select.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$table$2d$list$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/table-list.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/utils.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
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
function parseConnectionOptions(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw !== 'string') return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch  {
        return {};
    }
}
function isLocalFilesDatasetConnection(options) {
    return options.managedBy === 'local-files' && options.mode === 'localFilesDataset';
}
function getOpenFilesTableLabel(tableName) {
    const parts = tableName.split('.');
    return parts[parts.length - 1] || tableName;
}
function SQLConsoleSidebar({ onOpenTableTab, onOpenQueryConsole, onQueryTable, onRenameTable, onSelectTable, selectedTable, selectedDatabase, onSelectDatabase }) {
    _s();
    const [localFilter, setFilter] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [isRefreshing, setIsRefreshing] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const deferredFilter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDeferredValue"])(localFilter);
    const [activeDatabase, setActiveDatabase] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtom"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["activeDatabaseAtom"]);
    const currentConnection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentConnectionAtom"]);
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('SQLConsoleSidebar');
    const sidebarConfig = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "SQLConsoleSidebar.useMemo[sidebarConfig]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$sidebar$2d$config$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getSidebarConfig"])(currentConnection?.connection?.type)
    }["SQLConsoleSidebar.useMemo[sidebarConfig]"], [
        currentConnection?.connection?.type
    ]);
    const isLocalFilesDataset = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "SQLConsoleSidebar.useMemo[isLocalFilesDataset]": ()=>isLocalFilesDatasetConnection(parseConnectionOptions(currentConnection?.connection?.options))
    }["SQLConsoleSidebar.useMemo[isLocalFilesDataset]"], [
        currentConnection?.connection?.options
    ]);
    const { databases, loading: databasesLoading, error: databasesError } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$databases$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDatabases"])();
    const databaseOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "SQLConsoleSidebar.useMemo[databaseOptions]": ()=>(databases ?? []).map({
                "SQLConsoleSidebar.useMemo[databaseOptions]": (database)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["normalizeOption"])(database)
            }["SQLConsoleSidebar.useMemo[databaseOptions]"]).filter({
                "SQLConsoleSidebar.useMemo[databaseOptions]": (database)=>Boolean(database)
            }["SQLConsoleSidebar.useMemo[databaseOptions]"]).filter({
                "SQLConsoleSidebar.useMemo[databaseOptions]": (database)=>!(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isHiddenDatabase"])(database.value, sidebarConfig)
            }["SQLConsoleSidebar.useMemo[databaseOptions]"])
    }["SQLConsoleSidebar.useMemo[databaseOptions]"], [
        databases,
        sidebarConfig
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "SQLConsoleSidebar.useEffect": ()=>{
            if (!databaseOptions.length) return;
            const initialDatabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getInitialDatabase"])(databaseOptions, currentConnection?.connection?.database);
            if (!initialDatabase) return;
            const hasActiveDatabase = activeDatabase && databaseOptions.some({
                "SQLConsoleSidebar.useEffect": (database)=>database.value === activeDatabase
            }["SQLConsoleSidebar.useEffect"]);
            if (hasActiveDatabase) return;
            setActiveDatabase(initialDatabase);
            onSelectDatabase?.(initialDatabase);
        }
    }["SQLConsoleSidebar.useEffect"], [
        activeDatabase,
        currentConnection?.connection?.database,
        databaseOptions,
        onSelectDatabase,
        setActiveDatabase,
        sidebarConfig
    ]);
    const { tables, loading: tablesLoading, refresh: refreshTables } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$tables$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTables"])(activeDatabase);
    const { schemas, refresh: refreshSchemas } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$schemas$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSchemas"])(activeDatabase, sidebarConfig.supportsSchemas);
    const { refresh: getTableColumns } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$columns$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useColumns"])();
    const [activeSchema, setActiveSchema] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [expandedTableKeys, setExpandedTableKeys] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(new Set());
    const [columnsByTableKey, setColumnsByTableKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({});
    const [loadingTableKeys, setLoadingTableKeys] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(new Set());
    const schemaOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "SQLConsoleSidebar.useMemo[schemaOptions]": ()=>schemas.toSorted({
                "SQLConsoleSidebar.useMemo[schemaOptions]": (left, right)=>left.label.localeCompare(right.label)
            }["SQLConsoleSidebar.useMemo[schemaOptions]"])
    }["SQLConsoleSidebar.useMemo[schemaOptions]"], [
        schemas
    ]);
    const preferredSchema = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "SQLConsoleSidebar.useMemo[preferredSchema]": ()=>{
            const defaultIdentity = currentConnection?.identities?.find({
                "SQLConsoleSidebar.useMemo[preferredSchema]": (identity)=>identity.isDefault
            }["SQLConsoleSidebar.useMemo[preferredSchema]"]) ?? currentConnection?.identities?.[0];
            return defaultIdentity?.username?.trim() || sidebarConfig.defaultSchemaName || '';
        }
    }["SQLConsoleSidebar.useMemo[preferredSchema]"], [
        currentConnection?.identities,
        sidebarConfig.defaultSchemaName
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "SQLConsoleSidebar.useEffect": ()=>{
            if (!sidebarConfig.supportsSchemas) {
                if (activeSchema) {
                    setActiveSchema('');
                }
                return;
            }
            if (schemaOptions.length === 0) {
                if (activeSchema) {
                    setActiveSchema('');
                }
                return;
            }
            if (activeSchema && schemaOptions.some({
                "SQLConsoleSidebar.useEffect": (schema)=>schema.value === activeSchema
            }["SQLConsoleSidebar.useEffect"])) {
                return;
            }
            const defaultSchema = schemaOptions.find({
                "SQLConsoleSidebar.useEffect": (schema)=>schema.value.toLowerCase() === preferredSchema.toLowerCase()
            }["SQLConsoleSidebar.useEffect"])?.value ?? schemaOptions.find({
                "SQLConsoleSidebar.useEffect": (schema)=>schema.value === sidebarConfig.defaultSchemaName
            }["SQLConsoleSidebar.useEffect"])?.value ?? schemaOptions[0]?.value ?? '';
            setActiveSchema(defaultSchema);
        }
    }["SQLConsoleSidebar.useEffect"], [
        activeSchema,
        preferredSchema,
        schemaOptions,
        sidebarConfig.defaultSchemaName,
        sidebarConfig.supportsSchemas
    ]);
    const filteredTables = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "SQLConsoleSidebar.useMemo[filteredTables]": ()=>{
            const normalizedFilter = deferredFilter.trim().toLowerCase();
            return (tables ?? []).map({
                "SQLConsoleSidebar.useMemo[filteredTables]": (table)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toSidebarTableItem"])(table, sidebarConfig)
            }["SQLConsoleSidebar.useMemo[filteredTables]"]).filter({
                "SQLConsoleSidebar.useMemo[filteredTables]": (table)=>Boolean(table)
            }["SQLConsoleSidebar.useMemo[filteredTables]"]).map({
                "SQLConsoleSidebar.useMemo[filteredTables]": (table)=>isLocalFilesDataset ? {
                        ...table,
                        label: getOpenFilesTableLabel(table.value)
                    } : table
            }["SQLConsoleSidebar.useMemo[filteredTables]"]).map({
                "SQLConsoleSidebar.useMemo[filteredTables]": (table)=>({
                        ...table,
                        key: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildScopedTableKey"])(activeDatabase, table.value)
                    })
            }["SQLConsoleSidebar.useMemo[filteredTables]"]).filter({
                "SQLConsoleSidebar.useMemo[filteredTables]": (table)=>{
                    if (!sidebarConfig.supportsSchemas || !activeSchema) {
                        return true;
                    }
                    return table.schemaName === activeSchema;
                }
            }["SQLConsoleSidebar.useMemo[filteredTables]"]).filter({
                "SQLConsoleSidebar.useMemo[filteredTables]": (table)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["matchesFilter"])(table.value, table.label, normalizedFilter)
            }["SQLConsoleSidebar.useMemo[filteredTables]"]);
        }
    }["SQLConsoleSidebar.useMemo[filteredTables]"], [
        activeDatabase,
        activeSchema,
        deferredFilter,
        isLocalFilesDataset,
        sidebarConfig,
        tables
    ]);
    const handleDatabaseChange = (database)=>{
        setActiveDatabase(database);
        setActiveSchema('');
        onSelectDatabase?.(database);
    };
    const handleRefresh = async ()=>{
        if (!activeDatabase || isRefreshing) {
            return;
        }
        setIsRefreshing(true);
        setExpandedTableKeys(new Set());
        setColumnsByTableKey({});
        setLoadingTableKeys(new Set());
        try {
            await Promise.all([
                refreshTables(),
                sidebarConfig.supportsSchemas ? refreshSchemas() : Promise.resolve()
            ]);
        } finally{
            setIsRefreshing(false);
        }
    };
    const handleRenameTable = async (payload)=>{
        await onRenameTable?.(payload);
        setExpandedTableKeys((prev)=>{
            const next = new Set(prev);
            if (payload.database) {
                next.delete((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildScopedTableKey"])(payload.database, payload.tableName));
            }
            return next;
        });
        setColumnsByTableKey((prev)=>{
            if (!payload.database) return prev;
            const next = {
                ...prev
            };
            delete next[(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildScopedTableKey"])(payload.database, payload.tableName)];
            return next;
        });
        await refreshTables();
    };
    const toTableActionPayload = (table)=>({
            database: activeDatabase,
            schema: table.schemaName,
            tableName: table.value,
            tabLabel: table.label
        });
    const toggleTableExpansion = async (table)=>{
        const scopedTableKey = table.key;
        setExpandedTableKeys((prev)=>{
            const next = new Set(prev);
            if (next.has(scopedTableKey)) {
                next.delete(scopedTableKey);
                return next;
            }
            next.add(scopedTableKey);
            return next;
        });
        if (columnsByTableKey[scopedTableKey]) {
            return;
        }
        setLoadingTableKeys((prev)=>{
            const next = new Set(prev);
            next.add(scopedTableKey);
            return next;
        });
        try {
            const columns = await getTableColumns(activeDatabase, table.value);
            setColumnsByTableKey((prev)=>({
                    ...prev,
                    [scopedTableKey]: columns || []
                }));
        } catch (error) {
            console.error(`Failed to fetch columns for ${table.value}:`, error);
        } finally{
            setLoadingTableKeys((prev)=>{
                const next = new Set(prev);
                next.delete(scopedTableKey);
                return next;
            });
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex h-full min-h-0 w-full min-w-0 flex-col gap-2 p-3",
        children: [
            !isLocalFilesDataset && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$database$2d$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DatabaseSelect"], {
                value: activeDatabase,
                databases: databaseOptions,
                onChange: handleDatabaseChange,
                loading: databasesLoading,
                error: databasesError
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/sql-console-sidebar.tsx",
                lineNumber: 242,
                columnNumber: 17
            }, this),
            sidebarConfig.supportsSchemas && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$schema$2d$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SchemaSelect"], {
                value: activeSchema,
                schemas: schemaOptions,
                onChange: setActiveSchema
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/sql-console-sidebar.tsx",
                lineNumber: 245,
                columnNumber: 47
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "relative flex-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                                className: "absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/sql-console-sidebar.tsx",
                                lineNumber: 249,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                                value: localFilter,
                                onChange: (e)=>setFilter(e.target.value),
                                placeholder: t('Filter tables'),
                                className: "h-8 pl-8",
                                "aria-label": t('Filter tables')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/sql-console-sidebar.tsx",
                                lineNumber: 250,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/sql-console-sidebar.tsx",
                        lineNumber: 248,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                        type: "button",
                        variant: "outline",
                        size: "icon-sm",
                        className: "h-8 w-8 shrink-0",
                        onClick: ()=>void handleRefresh(),
                        disabled: !activeDatabase || isRefreshing,
                        "aria-label": t('Refresh tables'),
                        title: t('Refresh tables'),
                        children: isRefreshing ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                            className: "h-4 w-4 animate-spin"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/sql-console-sidebar.tsx",
                            lineNumber: 263,
                            columnNumber: 37
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                            className: "h-4 w-4"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/sql-console-sidebar.tsx",
                            lineNumber: 263,
                            columnNumber: 84
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/sql-console-sidebar.tsx",
                        lineNumber: 253,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/sql-console-sidebar.tsx",
                lineNumber: 247,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$sql$2d$console$2d$sidebar$2f$table$2d$list$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TableList"], {
                tables: filteredTables,
                loading: tablesLoading,
                activeDatabase: activeDatabase,
                selectedTable: selectedTable,
                selectedDatabase: selectedDatabase,
                expandedTableKeys: expandedTableKeys,
                loadingTableKeys: loadingTableKeys,
                columnsByTableKey: columnsByTableKey,
                onToggleTable: toggleTableExpansion,
                onSelectTable: onSelectTable,
                onOpenTableTab: onOpenTableTab,
                onOpenQueryConsole: onOpenQueryConsole,
                onQueryTable: onQueryTable,
                onRenameTable: handleRenameTable,
                getTableActionPayload: toTableActionPayload,
                t: t
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/sql-console-sidebar.tsx",
                lineNumber: 267,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/sql-console-sidebar/sql-console-sidebar.tsx",
        lineNumber: 240,
        columnNumber: 9
    }, this);
}
_s(SQLConsoleSidebar, "D8yzgK9vcZYxB1LIbiN0CfJBzsI=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDeferredValue"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtom"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$databases$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDatabases"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$tables$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTables"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$schemas$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSchemas"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$columns$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useColumns"]
    ];
});
_c = SQLConsoleSidebar;
var _c;
__turbopack_context__.k.register(_c, "SQLConsoleSidebar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/overview-header.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OverviewHeader",
    ()=>OverviewHeader
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/refresh-cw.js [app-client] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$ai$2d$spark$2d$icon$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/@dory/ui/ai-spark-icon/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
function OverviewHeader({ loading, blocked, updatedAt, onRefresh }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2 text-sm font-semibold leading-tight mb-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$ai$2d$spark$2d$icon$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AISparkIcon"], {
                        loading: loading || blocked
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/overview-header.tsx",
                        lineNumber: 20,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: t('Summary')
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/overview-header.tsx",
                        lineNumber: 21,
                        columnNumber: 17
                    }, this),
                    updatedAt ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs font-normal text-muted-foreground",
                        children: t('Updated at', {
                            time: updatedAt.toLocaleTimeString()
                        })
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/overview-header.tsx",
                        lineNumber: 23,
                        columnNumber: 21
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/overview-header.tsx",
                lineNumber: 19,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                size: "sm",
                variant: "ghost",
                className: "h-8 px-2 text-muted-foreground",
                onClick: onRefresh,
                disabled: loading || blocked,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                        className: "mr-1 h-4 w-4"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/overview-header.tsx",
                        lineNumber: 35,
                        columnNumber: 17
                    }, this),
                    t('Regenerate')
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/overview-header.tsx",
                lineNumber: 28,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/overview-header.tsx",
        lineNumber: 18,
        columnNumber: 9
    }, this);
}
_s(OverviewHeader, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = OverviewHeader;
var _c;
__turbopack_context__.k.register(_c, "OverviewHeader");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SummaryCard",
    ()=>SummaryCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$collapsible$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/collapsible.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-down.js [app-client] (ecmascript) <export default as ChevronDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/web-utils/src/index.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
;
function SummaryCard({ summary, detail, loading }) {
    _s();
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
        className: "bg-card",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
            className: "p-4 space-y-3",
            children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-2 text-xs text-muted-foreground",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                        className: "h-3 w-5/6"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx",
                        lineNumber: 26,
                        columnNumber: 25
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                        className: "h-3 w-3/4"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx",
                        lineNumber: 27,
                        columnNumber: 25
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx",
                lineNumber: 25,
                columnNumber: 21
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$collapsible$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Collapsible"], {
                open: open,
                onOpenChange: setOpen,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$collapsible$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollapsibleTrigger"], {
                        asChild: true,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            className: "group w-full text-left",
                            "aria-label": t('Toggle detailed description'),
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-start gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-sm cursor-pointer text-muted-foreground leading-relaxed whitespace-pre-line group-hover:underline underline-offset-2 transition",
                                        children: summary
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx",
                                        lineNumber: 38,
                                        columnNumber: 37
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__["ChevronDown"], {
                                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('mt-0.5 h-4 w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0', open ? 'rotate-180' : 'rotate-0')
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx",
                                        lineNumber: 41,
                                        columnNumber: 37
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx",
                                lineNumber: 37,
                                columnNumber: 33
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx",
                            lineNumber: 32,
                            columnNumber: 29
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx",
                        lineNumber: 31,
                        columnNumber: 25
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$collapsible$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollapsibleContent"], {
                        className: "mt-3 border-l border-dashed pl-3",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-sm leading-relaxed text-muted-foreground whitespace-pre-line",
                            children: detail
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx",
                            lineNumber: 52,
                            columnNumber: 29
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx",
                        lineNumber: 51,
                        columnNumber: 25
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx",
                lineNumber: 30,
                columnNumber: 21
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx",
            lineNumber: 23,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx",
        lineNumber: 22,
        columnNumber: 9
    }, this);
}
_s(SummaryCard, "xoOXbP5uFfc8tRxljGGQPaP5k3c=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = SummaryCard;
var _c;
__turbopack_context__.k.register(_c, "SummaryCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "HighlightsSection",
    ()=>HighlightsSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/badge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$ai$2d$spark$2d$icon$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/@dory/ui/ai-spark-icon/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
function HighlightsSection({ highlights, loading }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2 text-sm font-medium",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$ai$2d$spark$2d$icon$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AISparkIcon"], {}, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx",
                        lineNumber: 20,
                        columnNumber: 17
                    }, this),
                    t('Key highlights')
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx",
                lineNumber: 19,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                    className: "p-4 space-y-3",
                    children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-3 w-2/3"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx",
                                lineNumber: 27,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-3 w-1/2"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx",
                                lineNumber: 28,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-3 w-3/4"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx",
                                lineNumber: 29,
                                columnNumber: 29
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx",
                        lineNumber: 26,
                        columnNumber: 25
                    }, this) : highlights.length ? highlights.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                    variant: "outline",
                                    className: "mt-0.5 px-2 py-1 text-[11px]",
                                    children: item.field
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx",
                                    lineNumber: 34,
                                    columnNumber: 33
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-sm text-muted-foreground leading-relaxed",
                                    children: item.description
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx",
                                    lineNumber: 37,
                                    columnNumber: 33
                                }, this)
                            ]
                        }, item.field, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx",
                            lineNumber: 33,
                            columnNumber: 29
                        }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-sm text-muted-foreground",
                        children: t('No highlights yet')
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx",
                        lineNumber: 41,
                        columnNumber: 25
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx",
                    lineNumber: 24,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx",
                lineNumber: 23,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx",
        lineNumber: 18,
        columnNumber: 9
    }, this);
}
_s(HighlightsSection, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = HighlightsSection;
var _c;
__turbopack_context__.k.register(_c, "HighlightsSection");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SchemaOverviewSection",
    ()=>SchemaOverviewSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$separator$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/separator.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$ai$2d$spark$2d$icon$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/@dory/ui/ai-spark-icon/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
function formatBytes(bytes) {
    if (!Number.isFinite(bytes ?? NaN)) return '-';
    const value = Number(bytes);
    if (value === 0) return '0 B';
    const units = [
        'B',
        'KB',
        'MB',
        'GB',
        'TB',
        'PB'
    ];
    const i = Math.floor(Math.log(value) / Math.log(1024));
    const normalized = value / Math.pow(1024, i);
    return `${normalized.toFixed(normalized >= 100 ? 0 : normalized >= 10 ? 1 : 2)} ${units[i]}`;
}
function formatNumber(value) {
    if (!Number.isFinite(value ?? NaN)) return '-';
    return Number(value).toLocaleString();
}
function SchemaOverviewSection({ columnCount, properties, stats, loadingStructure, loadingProperties, loadingStats }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2 text-sm font-medium",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$ai$2d$spark$2d$icon$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AISparkIcon"], {}, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                        lineNumber: 47,
                        columnNumber: 17
                    }, this),
                    t('Schema overview')
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                lineNumber: 46,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-3 lg:grid-cols-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                            className: "p-4 space-y-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-xs text-muted-foreground uppercase tracking-wide",
                                    children: t('Structure')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                    lineNumber: 53,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$separator$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Separator"], {}, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                    lineNumber: 54,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-2 text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-muted-foreground",
                                                    children: t('Columns')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 57,
                                                    columnNumber: 33
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "font-medium",
                                                    children: loadingStructure ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                                        className: "h-4 w-10"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                        lineNumber: 59,
                                                        columnNumber: 57
                                                    }, this) : columnCount || '—'
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 58,
                                                    columnNumber: 33
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                            lineNumber: 56,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-muted-foreground",
                                                    children: t('Primary key')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 63,
                                                    columnNumber: 33
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "font-medium",
                                                    children: loadingProperties ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                                        className: "h-4 w-24"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                        lineNumber: 66,
                                                        columnNumber: 41
                                                    }, this) : properties?.primaryKey || '—'
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 64,
                                                    columnNumber: 33
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                            lineNumber: 62,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-muted-foreground",
                                                    children: t('Partition key')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 73,
                                                    columnNumber: 33
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "font-medium",
                                                    children: loadingProperties ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                                        className: "h-4 w-24"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                        lineNumber: 76,
                                                        columnNumber: 41
                                                    }, this) : properties?.partitionKey || '—'
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 74,
                                                    columnNumber: 33
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                            lineNumber: 72,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-muted-foreground",
                                                    children: t('Sorting key')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 83,
                                                    columnNumber: 33
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "font-medium",
                                                    children: loadingProperties ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                                        className: "h-4 w-24"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                        lineNumber: 86,
                                                        columnNumber: 41
                                                    }, this) : properties?.sortingKey || '—'
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 84,
                                                    columnNumber: 33
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                            lineNumber: 82,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-muted-foreground",
                                                    children: t('Engine')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 93,
                                                    columnNumber: 33
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "font-medium",
                                                    children: loadingProperties ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                                        className: "h-4 w-24"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                        lineNumber: 95,
                                                        columnNumber: 58
                                                    }, this) : properties?.engine || '—'
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 94,
                                                    columnNumber: 33
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                            lineNumber: 92,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                    lineNumber: 55,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                            lineNumber: 52,
                            columnNumber: 21
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                        lineNumber: 51,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                            className: "p-4 space-y-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-xs text-muted-foreground uppercase tracking-wide",
                                    children: t('Data')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                    lineNumber: 103,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$separator$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Separator"], {}, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                    lineNumber: 104,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-2 text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-muted-foreground",
                                                    children: t('Row count')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 107,
                                                    columnNumber: 33
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "font-medium",
                                                    children: loadingStats ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                                        className: "h-4 w-20"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                        lineNumber: 109,
                                                        columnNumber: 53
                                                    }, this) : formatNumber(stats?.rowCount)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 108,
                                                    columnNumber: 33
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                            lineNumber: 106,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-muted-foreground",
                                                    children: t('Compressed size')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 113,
                                                    columnNumber: 33
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "font-medium",
                                                    children: loadingStats ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                                        className: "h-4 w-24"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                        lineNumber: 116,
                                                        columnNumber: 41
                                                    }, this) : formatBytes(stats?.compressedBytes)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 114,
                                                    columnNumber: 33
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                            lineNumber: 112,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-muted-foreground",
                                                    children: t('Uncompressed size')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 123,
                                                    columnNumber: 33
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "font-medium",
                                                    children: loadingStats ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                                        className: "h-4 w-24"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                        lineNumber: 126,
                                                        columnNumber: 41
                                                    }, this) : formatBytes(stats?.uncompressedBytes)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 124,
                                                    columnNumber: 33
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                            lineNumber: 122,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-muted-foreground",
                                                    children: t('Partitions')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 133,
                                                    columnNumber: 33
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "font-medium",
                                                    children: loadingStats ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                                        className: "h-4 w-16"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                        lineNumber: 136,
                                                        columnNumber: 41
                                                    }, this) : formatNumber(stats?.partitionCount)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 134,
                                                    columnNumber: 33
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                            lineNumber: 132,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-muted-foreground",
                                                    children: t('Compression ratio')
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 143,
                                                    columnNumber: 33
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "font-medium",
                                                    children: loadingStats ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                                        className: "h-4 w-16"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                        lineNumber: 146,
                                                        columnNumber: 41
                                                    }, this) : stats?.compressionRatio ? stats.compressionRatio.toFixed(2) : '—'
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                                    lineNumber: 144,
                                                    columnNumber: 33
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                            lineNumber: 142,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                                    lineNumber: 105,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                            lineNumber: 102,
                            columnNumber: 21
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                        lineNumber: 101,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
                lineNumber: 50,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx",
        lineNumber: 45,
        columnNumber: 9
    }, this);
}
_s(SchemaOverviewSection, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = SchemaOverviewSection;
var _c;
__turbopack_context__.k.register(_c, "SchemaOverviewSection");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SemanticLayerSection",
    ()=>SemanticLayerSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/badge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$ai$2d$spark$2d$icon$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/@dory/ui/ai-spark-icon/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
function SemanticLayerSection({ groups, loading }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2 text-sm font-medium",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$ai$2d$spark$2d$icon$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AISparkIcon"], {}, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx",
                        lineNumber: 20,
                        columnNumber: 17
                    }, this),
                    t('Semantic layer')
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx",
                lineNumber: 19,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                    className: "p-4 space-y-3",
                    children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-3 w-24"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx",
                                lineNumber: 27,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-3 w-40"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx",
                                lineNumber: 28,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-3 w-32"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx",
                                lineNumber: 29,
                                columnNumber: 29
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx",
                        lineNumber: 26,
                        columnNumber: 25
                    }, this) : [
                        {
                            label: t('Semantic metrics'),
                            key: 'metrics'
                        },
                        {
                            label: t('Semantic dimensions'),
                            key: 'dimensions'
                        },
                        {
                            label: t('Semantic time'),
                            key: 'time'
                        },
                        {
                            label: t('Semantic geo'),
                            key: 'geo'
                        },
                        {
                            label: t('Semantic keys'),
                            key: 'keys'
                        }
                    ].map((item)=>{
                        const fields = groups[item.key];
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-xs text-muted-foreground",
                                    children: item.label
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx",
                                    lineNumber: 42,
                                    columnNumber: 37
                                }, this),
                                fields.length ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-wrap gap-2",
                                    children: fields.map((field)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                            variant: "outline",
                                            className: "px-2 py-1 text-[11px]",
                                            children: field
                                        }, field, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx",
                                            lineNumber: 46,
                                            columnNumber: 49
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx",
                                    lineNumber: 44,
                                    columnNumber: 41
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-xs text-muted-foreground",
                                    children: "—"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx",
                                    lineNumber: 52,
                                    columnNumber: 41
                                }, this)
                            ]
                        }, item.key, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx",
                            lineNumber: 41,
                            columnNumber: 33
                        }, this);
                    })
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx",
                    lineNumber: 24,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx",
                lineNumber: 23,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx",
        lineNumber: 18,
        columnNumber: 9
    }, this);
}
_s(SemanticLayerSection, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = SemanticLayerSection;
var _c;
__turbopack_context__.k.register(_c, "SemanticLayerSection");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/snippets-section.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SnippetsSection",
    ()=>SnippetsSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$ai$2d$spark$2d$icon$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/@dory/ui/ai-spark-icon/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$code$2d$block$2f$code$2d$block$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/@dory/ui/code-block/code-block.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
function SnippetsSection({ snippets, loading }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2 text-sm font-medium",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$ai$2d$spark$2d$icon$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AISparkIcon"], {}, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/snippets-section.tsx",
                        lineNumber: 20,
                        columnNumber: 17
                    }, this),
                    t('Query snippets')
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/snippets-section.tsx",
                lineNumber: 19,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-3 md:grid-cols-2",
                children: loading ? Array.from({
                    length: 2
                }).map((_, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                            className: "p-4 space-y-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-4 w-2/3"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/snippets-section.tsx",
                                    lineNumber: 28,
                                    columnNumber: 33
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-24 w-full"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/snippets-section.tsx",
                                    lineNumber: 29,
                                    columnNumber: 33
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/snippets-section.tsx",
                            lineNumber: 27,
                            columnNumber: 29
                        }, this)
                    }, idx, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/snippets-section.tsx",
                        lineNumber: 26,
                        columnNumber: 25
                    }, this)) : snippets.length ? snippets.map((snippet, idx)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                            className: "p-4 space-y-3",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$code$2d$block$2f$code$2d$block$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SmartCodeBlock"], {
                                className: "min-h-8",
                                value: snippet.sql,
                                label: snippet.title || t('SQL example')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/snippets-section.tsx",
                                lineNumber: 38,
                                columnNumber: 33
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/snippets-section.tsx",
                            lineNumber: 37,
                            columnNumber: 29
                        }, this)
                    }, snippet.title ?? idx, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/snippets-section.tsx",
                        lineNumber: 36,
                        columnNumber: 25
                    }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "text-sm text-muted-foreground",
                    children: t('No SQL snippets yet')
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/snippets-section.tsx",
                    lineNumber: 43,
                    columnNumber: 21
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/snippets-section.tsx",
                lineNumber: 23,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/snippets-section.tsx",
        lineNumber: 18,
        columnNumber: 9
    }, this);
}
_s(SnippetsSection, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = SnippetsSection;
var _c;
__turbopack_context__.k.register(_c, "SnippetsSection");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/table-queries.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "tableQueryKeys",
    ()=>tableQueryKeys,
    "useTableColumnInsightsQuery",
    ()=>useTableColumnInsightsQuery,
    "useTableColumnsQuery",
    ()=>useTableColumnsQuery,
    "useTableDdlQuery",
    ()=>useTableDdlQuery,
    "useTablePropertiesQuery",
    ()=>useTablePropertiesQuery,
    "useTableStatsQuery",
    ()=>useTableStatsQuery,
    "useTableStructureColumnsQuery",
    ()=>useTableStructureColumnsQuery
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useQuery.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/use-intl/dist/esm/development/react.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$columns$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/hooks/use-columns.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/lib/actions/client.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$schema$2f$column$2d$insights$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/lib/schema/column-insights.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature(), _s2 = __turbopack_context__.k.signature(), _s3 = __turbopack_context__.k.signature(), _s4 = __turbopack_context__.k.signature(), _s5 = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
const STALE_TIME = 1000 * 60 * 5;
const GC_TIME = STALE_TIME * 2;
const tableQueryKeys = {
    columns: (connectionId, databaseName, tableName, locale)=>[
            'table-columns',
            connectionId,
            databaseName,
            tableName,
            locale
        ],
    structureColumns: (connectionId, databaseName, tableName)=>[
            'table-structure-columns',
            connectionId,
            databaseName,
            tableName
        ],
    columnInsights: (connectionId, databaseName, tableName, locale)=>[
            'table-column-insights',
            connectionId,
            databaseName,
            tableName,
            locale
        ],
    properties: (connectionId, databaseName, tableName)=>[
            'table-properties',
            connectionId,
            databaseName,
            tableName
        ],
    stats: (connectionId, databaseName, tableName)=>[
            'table-stats',
            connectionId,
            databaseName,
            tableName
        ],
    ddl: (connectionId, databaseName, tableName)=>[
            'table-ddl',
            connectionId,
            databaseName,
            tableName
        ],
    aiOverview: (connectionId, databaseName, tableName)=>[
            'table-ai-overview',
            connectionId,
            databaseName,
            tableName
        ],
    aiStatsInsights: (connectionId, databaseName, tableName)=>[
            'table-stats-insights',
            connectionId,
            databaseName,
            tableName
        ]
};
function toOptionalBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return [
        'true',
        'yes',
        '1'
    ].includes(value.toLowerCase());
    return undefined;
}
function normalizeColumns(raw) {
    const normalized = (raw ?? []).map((col)=>({
            name: col.columnName ?? col.name ?? '',
            type: col.columnType ?? col.type ?? '',
            nullable: toOptionalBoolean(col.isNullable ?? col.nullable) ?? true,
            isPrimaryKey: toOptionalBoolean(col.isPrimaryKey) ?? false,
            defaultValue: col.defaultValue ?? col.default ?? col.defaultExpression ?? null,
            comment: col.comment ?? null
        }));
    return normalized.filter((col)=>col.name);
}
async function fetchBaseColumns({ databaseName, tableName, fetchColumns }) {
    const raw = await fetchColumns(databaseName, tableName);
    return normalizeColumns(raw ?? []);
}
function getRuleColumnInsights({ columns, locale }) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$schema$2f$column$2d$insights$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["generateColumnInsights"])(columns, locale);
}
function getRuleTagsOnlyColumnInsights({ columns, locale }) {
    const insights = getRuleColumnInsights({
        columns,
        locale
    });
    const summaries = {};
    insights.columns.forEach((column)=>{
        summaries[column.name.toLowerCase()] = null;
    });
    return {
        ...insights,
        summaries,
        columns: insights.columns.map((column)=>({
                ...column,
                semanticSummary: null
            }))
    };
}
async function fetchColumnInsights({ columns, databaseName, tableName, connectionId, dbType, signal, locale }) {
    const insights = getRuleTagsOnlyColumnInsights({
        columns,
        locale
    });
    if (!connectionId) {
        return insights;
    }
    try {
        const explanationsRes = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["executeActionClient"])('ai.schemaExplanations', {
            database: databaseName,
            table: tableName,
            columns,
            connectionId,
            dbType
        }, {
            currentConnectionId: connectionId,
            signal
        });
        const summaries = {
            ...insights.summaries
        };
        (explanationsRes?.columns ?? []).forEach((col)=>{
            if (!col?.name) return;
            summaries[col.name.toLowerCase()] = col.semanticSummary?.trim() || null;
        });
        return {
            ...insights,
            summaries,
            columns: insights.columns.map((col)=>({
                    ...col,
                    semanticSummary: summaries[col.name.toLowerCase()] ?? col.semanticSummary ?? null
                }))
        };
    } catch (error) {
        console.error('Failed to load schema explanations', error);
        return insights;
    }
}
function applySemanticColumns(columns, insights) {
    return columns.map((col)=>{
        const key = col.name.toLowerCase();
        const tags = insights.tags[key] ?? [];
        const summary = insights.summaries[key] ?? col.comment ?? null;
        return {
            ...col,
            semanticTags: tags,
            semanticSummary: summary
        };
    });
}
function useTableColumnsQuery({ databaseName, tableName, connectionId, dbType }) {
    _s();
    const { refresh: fetchColumns } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$columns$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useColumns"])();
    const locale = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocale"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: tableQueryKeys.columns(connectionId, databaseName, tableName, locale),
        enabled: Boolean(connectionId && databaseName && tableName),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
        queryFn: {
            "useTableColumnsQuery.useQuery": async ({ signal })=>{
                const normalized = await fetchBaseColumns({
                    databaseName: databaseName,
                    tableName: tableName,
                    fetchColumns
                });
                if (!normalized.length) return {
                    columns: []
                };
                const insights = await fetchColumnInsights({
                    columns: normalized,
                    databaseName: databaseName,
                    tableName: tableName,
                    connectionId,
                    dbType,
                    signal,
                    locale
                });
                return {
                    columns: applySemanticColumns(normalized, insights)
                };
            }
        }["useTableColumnsQuery.useQuery"]
    });
}
_s(useTableColumnsQuery, "dL/jf1Ya8pXTI1r+Yfg3D70LbU0=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$columns$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useColumns"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocale"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useTableStructureColumnsQuery({ databaseName, tableName, connectionId }) {
    _s1();
    const { refresh: fetchColumns } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$columns$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useColumns"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: tableQueryKeys.structureColumns(connectionId, databaseName, tableName),
        enabled: Boolean(connectionId && databaseName && tableName),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
        queryFn: {
            "useTableStructureColumnsQuery.useQuery": async ()=>{
                const normalized = await fetchBaseColumns({
                    databaseName: databaseName,
                    tableName: tableName,
                    fetchColumns
                });
                return {
                    columns: normalized
                };
            }
        }["useTableStructureColumnsQuery.useQuery"]
    });
}
_s1(useTableStructureColumnsQuery, "64PdujYkBw6RseE1G0+S9tFdd5k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$hooks$2f$use$2d$columns$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useColumns"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useTableColumnInsightsQuery({ databaseName, tableName, connectionId, dbType, columns }) {
    _s2();
    const locale = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocale"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: tableQueryKeys.columnInsights(connectionId, databaseName, tableName, locale),
        enabled: Boolean(connectionId && databaseName && tableName && columns.length),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
        placeholderData: getRuleTagsOnlyColumnInsights({
            columns,
            locale
        }),
        queryFn: {
            "useTableColumnInsightsQuery.useQuery": async ({ signal })=>{
                return fetchColumnInsights({
                    columns,
                    databaseName: databaseName,
                    tableName: tableName,
                    connectionId,
                    dbType,
                    signal,
                    locale
                });
            }
        }["useTableColumnInsightsQuery.useQuery"]
    });
}
_s2(useTableColumnInsightsQuery, "9R4uR2xp4TwajEntHgEghQQvqe0=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$use$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocale"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useTablePropertiesQuery({ databaseName, tableName, connectionId }) {
    _s3();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: tableQueryKeys.properties(connectionId, databaseName, tableName),
        enabled: Boolean(connectionId && databaseName && tableName),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
        queryFn: {
            "useTablePropertiesQuery.useQuery": async ({ signal })=>{
                if (!connectionId) {
                    throw new Error('Missing connection');
                }
                const res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["executeActionClient"])('table.getProperties', {
                    connectionId,
                    database: databaseName,
                    table: tableName
                }, {
                    currentConnectionId: connectionId,
                    signal
                });
                return res.properties ? {
                    ...res.properties
                } : null;
            }
        }["useTablePropertiesQuery.useQuery"]
    });
}
_s3(useTablePropertiesQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useTableStatsQuery({ databaseName, tableName, connectionId }) {
    _s4();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: tableQueryKeys.stats(connectionId, databaseName, tableName),
        enabled: Boolean(connectionId && databaseName && tableName),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
        queryFn: {
            "useTableStatsQuery.useQuery": async ({ signal })=>{
                if (!connectionId) {
                    throw new Error('Missing connection');
                }
                const res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["executeActionClient"])('table.getStats', {
                    connectionId,
                    database: databaseName,
                    table: tableName
                }, {
                    currentConnectionId: connectionId,
                    signal
                });
                return res.stats ?? null;
            }
        }["useTableStatsQuery.useQuery"]
    });
}
_s4(useTableStatsQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
function useTableDdlQuery({ databaseName, tableName, connectionId }) {
    _s5();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: tableQueryKeys.ddl(connectionId, databaseName, tableName),
        enabled: Boolean(connectionId && databaseName && tableName),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
        queryFn: {
            "useTableDdlQuery.useQuery": async ({ signal })=>{
                if (!connectionId) {
                    throw new Error('Missing connection');
                }
                const res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["executeActionClient"])('table.getDdl', {
                    connectionId,
                    database: databaseName,
                    table: tableName
                }, {
                    currentConnectionId: connectionId,
                    signal
                });
                return typeof res.ddl === 'string' ? res.ddl : null;
            }
        }["useTableDdlQuery.useQuery"]
    });
}
_s5(useTableDdlQuery, "4ZpngI1uv+Uo3WQHEZmTQ5FNM+k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/index.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TableOverview",
    ()=>TableOverview
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useQuery.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/react.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/scroll-area.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/alert.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/shared/stores/app.store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/lib/actions/client.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$components$2f$overview$2d$header$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/overview-header.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$components$2f$summary$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/summary-card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$components$2f$highlights$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/highlights-section.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$components$2f$schema$2d$overview$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/schema-overview-section.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$components$2f$semantic$2d$layer$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/semantic-layer-section.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$components$2f$snippets$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/components/snippets-section.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/table-queries.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$i18n$2f$src$2f$i18n$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/i18n/src/i18n.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$i18n$2f$src$2f$routing$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/i18n/src/routing.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
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
const SEMANTIC_MATCHER_KEYS = {
    keys: [
        'PrimaryKey',
        'Identifier',
        'Key'
    ],
    time: [
        'Time',
        'Date',
        'Timestamp'
    ],
    geo: [
        'Geo',
        'Address'
    ],
    metrics: [
        'Metric',
        'Amount',
        'Measure',
        'Numeric'
    ],
    dimensions: [
        'Dimension',
        'Category',
        'Status',
        'Label',
        'Name'
    ]
};
function buildSemanticMatchers() {
    const matchers = {
        keys: [],
        time: [],
        geo: [],
        metrics: [],
        dimensions: []
    };
    const locales = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$i18n$2f$src$2f$routing$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["routing"].locales;
    Object.keys(SEMANTIC_MATCHER_KEYS).forEach((group)=>{
        SEMANTIC_MATCHER_KEYS[group].forEach((key)=>{
            locales.forEach((locale)=>{
                const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$i18n$2f$src$2f$i18n$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["translate"])(locale, `TableBrowser.SemanticMatchers.${key}`).toLowerCase();
                if (value && !matchers[group].includes(value)) {
                    matchers[group].push(value);
                }
            });
        });
    });
    return matchers;
}
const SEMANTIC_MATCHERS = buildSemanticMatchers();
function buildSemanticGroups(columns) {
    const groups = {
        metrics: [],
        dimensions: [],
        geo: [],
        keys: [],
        time: []
    };
    columns.forEach((col)=>{
        const name = col.name;
        const lower = name.toLowerCase();
        const tags = (col.semanticTags || []).map((t)=>t.toLowerCase());
        const push = (key)=>{
            if (!groups[key].includes(name)) {
                groups[key].push(name);
            }
        };
        if (tags.some((t)=>SEMANTIC_MATCHERS.keys.some((matcher)=>t.includes(matcher))) || lower.endsWith('_id') || lower === 'id') {
            push('keys');
        }
        if (tags.some((t)=>SEMANTIC_MATCHERS.time.some((matcher)=>t.includes(matcher))) || /time|date|ts/.test(lower)) {
            push('time');
        }
        if (tags.some((t)=>SEMANTIC_MATCHERS.geo.some((matcher)=>t.includes(matcher))) || /(lon|lng|lat)/.test(lower)) {
            push('geo');
        }
        if (tags.some((t)=>SEMANTIC_MATCHERS.metrics.some((matcher)=>t.includes(matcher))) || (col.type || '').toLowerCase().match(/(int|float|decimal|double)/)) {
            push('metrics');
        }
        if (tags.some((t)=>SEMANTIC_MATCHERS.dimensions.some((matcher)=>t.includes(matcher))) || !groups.metrics.includes(name) && !groups.keys.includes(name) && !groups.time.includes(name)) {
            push('dimensions');
        }
    });
    return groups;
}
function buildFallbackOverview(t, { databaseName, tableName, columns, properties }) {
    const colCount = columns.length;
    const summaryParts = [
        t('Fallback summary', {
            table: tableName ?? t('Fallback current table'),
            count: colCount ? String(colCount) : t('Fallback unknown count')
        })
    ];
    if (properties?.engine) summaryParts.push(t('Fallback engine', {
        engine: properties.engine
    }));
    if (properties?.partitionKey) summaryParts.push(t('Fallback partition', {
        partition: properties.partitionKey
    }));
    const summary = summaryParts.join(t('Fallback summary separator'));
    const detail = t('Fallback detail', {
        summary
    });
    const highlights = columns.slice(0, 4).map((col)=>({
            field: col.name,
            description: col.comment?.slice(0, 120) || t('Fallback column description', {
                name: col.name,
                type: col.type || t('Fallback unknown type'),
                required: col.nullable === false ? t('Fallback required') : ''
            })
        })) || [];
    const snippets = tableName && columns.length ? [
        {
            title: t('Fallback snippet title'),
            sql: `SELECT *\nFROM ${tableName}\nLIMIT 50;`
        }
    ] : [];
    return {
        summary,
        detail,
        highlights,
        snippets
    };
}
function TableOverview({ databaseName, tableName }) {
    _s();
    const currentConnection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentConnectionAtom"]);
    const connectionId = currentConnection?.connection?.id;
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser');
    const columnsQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableColumnsQuery"])({
        databaseName,
        tableName,
        connectionId,
        dbType: currentConnection?.connection?.type
    });
    const propertiesQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTablePropertiesQuery"])({
        databaseName,
        tableName,
        connectionId
    });
    const statsQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableStatsQuery"])({
        databaseName,
        tableName,
        connectionId
    });
    const columns = columnsQuery.data?.columns ?? [];
    const properties = propertiesQuery.data ?? null;
    const stats = statsQuery.data ?? null;
    const loadingColumns = columnsQuery.isLoading;
    const loadingProperties = propertiesQuery.isLoading;
    const loadingStats = statsQuery.isLoading;
    const aiBlocked = loadingColumns || loadingProperties || !columns.length;
    const fallbackOverview = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TableOverview.useMemo[fallbackOverview]": ()=>buildFallbackOverview(t, {
                databaseName,
                tableName,
                columns,
                properties
            })
    }["TableOverview.useMemo[fallbackOverview]"], [
        columns,
        databaseName,
        properties,
        t,
        tableName
    ]);
    const ignoreAiCacheRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const aiOverviewQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tableQueryKeys"].aiOverview(connectionId, databaseName, tableName),
        enabled: Boolean(connectionId && databaseName && tableName && !aiBlocked && columns.length),
        staleTime: 1000 * 60 * 10,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
        queryFn: {
            "TableOverview.useQuery[aiOverviewQuery]": async ()=>{
                const ignoreCache = ignoreAiCacheRef.current;
                ignoreAiCacheRef.current = false;
                const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["executeActionClient"])('ai.tableSummary', {
                    connectionId: currentConnection?.connection?.id,
                    database: databaseName,
                    table: tableName,
                    columns,
                    properties,
                    dbType: currentConnection?.connection?.type,
                    ignoreCache
                }, {
                    currentConnectionId: currentConnection?.connection?.id
                });
                console.log('AI Overview response:', data);
                return {
                    summary: (data.summary || fallbackOverview.summary).trim(),
                    detail: (data.detail || fallbackOverview.detail).trim(),
                    highlights: (data.highlights || fallbackOverview.highlights || []).filter({
                        "TableOverview.useQuery[aiOverviewQuery]": (item)=>item?.field && item?.description
                    }["TableOverview.useQuery[aiOverviewQuery]"]).slice(0, 6),
                    snippets: (data.snippets || fallbackOverview.snippets || []).filter({
                        "TableOverview.useQuery[aiOverviewQuery]": (item)=>item?.sql
                    }["TableOverview.useQuery[aiOverviewQuery]"]).slice(0, 5)
                };
            }
        }["TableOverview.useQuery[aiOverviewQuery]"]
    });
    const aiOverview = aiOverviewQuery.data ?? (!aiBlocked ? fallbackOverview : null);
    const aiError = aiOverviewQuery.error ? aiOverviewQuery.error.message : null;
    const aiLoading = aiOverviewQuery.isFetching;
    const aiUpdatedAt = aiOverviewQuery.dataUpdatedAt ? new Date(aiOverviewQuery.dataUpdatedAt) : null;
    const semanticGroups = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TableOverview.useMemo[semanticGroups]": ()=>buildSemanticGroups(columns)
    }["TableOverview.useMemo[semanticGroups]"], [
        columns
    ]);
    const loadingAny = loadingColumns || loadingProperties;
    const overviewLoading = aiLoading || aiBlocked || !aiOverview;
    const highlights = aiOverview?.highlights ?? [];
    const snippets = aiOverview?.snippets ?? [];
    if (!databaseName || !tableName) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "h-full flex items-center justify-center text-sm text-muted-foreground",
            children: t('Select table to view overview')
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/index.tsx",
            lineNumber: 249,
            columnNumber: 16
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ScrollArea"], {
        className: "h-full pr-3",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "space-y-5 pt-4 pb-6",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$components$2f$overview$2d$header$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OverviewHeader"], {
                    loading: aiLoading,
                    blocked: aiBlocked,
                    updatedAt: aiUpdatedAt,
                    onRefresh: ()=>{
                        if (!aiBlocked) {
                            ignoreAiCacheRef.current = true;
                            void aiOverviewQuery.refetch();
                        }
                    }
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/index.tsx",
                    lineNumber: 255,
                    columnNumber: 17
                }, this),
                aiError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Alert"], {
                    variant: "destructive",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDescription"], {
                        children: aiError
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/index.tsx",
                        lineNumber: 269,
                        columnNumber: 25
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/index.tsx",
                    lineNumber: 268,
                    columnNumber: 21
                }, this) : null,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$components$2f$summary$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SummaryCard"], {
                    summary: aiOverview?.summary,
                    detail: aiOverview?.detail,
                    loading: overviewLoading
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/index.tsx",
                    lineNumber: 273,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$components$2f$highlights$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HighlightsSection"], {
                    highlights: highlights,
                    loading: overviewLoading
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/index.tsx",
                    lineNumber: 275,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$components$2f$schema$2d$overview$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SchemaOverviewSection"], {
                    columnCount: columns.length,
                    properties: properties,
                    stats: stats,
                    loadingStructure: loadingAny,
                    loadingProperties: loadingProperties,
                    loadingStats: loadingStats
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/index.tsx",
                    lineNumber: 277,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$components$2f$semantic$2d$layer$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SemanticLayerSection"], {
                    groups: semanticGroups,
                    loading: loadingAny
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/index.tsx",
                    lineNumber: 286,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$components$2f$snippets$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SnippetsSection"], {
                    snippets: snippets,
                    loading: overviewLoading
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/index.tsx",
                    lineNumber: 288,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/index.tsx",
            lineNumber: 254,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/index.tsx",
        lineNumber: 253,
        columnNumber: 9
    }, this);
}
_s(TableOverview, "qt3jWKJMdB70mI9fuFHTAAfjzIE=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableColumnsQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTablePropertiesQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableStatsQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
_c = TableOverview;
var _c;
__turbopack_context__.k.register(_c, "TableOverview");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/metric-item.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>MetricItem
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
;
function MetricItem({ label, value, hint }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-1",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-xs text-muted-foreground",
                children: label
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/metric-item.tsx",
                lineNumber: 10,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-sm font-medium leading-tight",
                children: value
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/metric-item.tsx",
                lineNumber: 11,
                columnNumber: 13
            }, this),
            hint ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-[11px] text-muted-foreground",
                children: hint
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/metric-item.tsx",
                lineNumber: 12,
                columnNumber: 21
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/metric-item.tsx",
        lineNumber: 9,
        columnNumber: 9
    }, this);
}
_c = MetricItem;
var _c;
__turbopack_context__.k.register(_c, "MetricItem");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/formatters.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "calcRatio",
    ()=>calcRatio,
    "formatBytes",
    ()=>formatBytes,
    "formatNumber",
    ()=>formatNumber,
    "formatRatio",
    ()=>formatRatio
]);
const formatBytes = (bytes)=>{
    if (!Number.isFinite(bytes ?? NaN)) return '-';
    const units = [
        'B',
        'KB',
        'MB',
        'GB',
        'TB',
        'PB'
    ];
    const value = bytes ?? 0;
    const i = Math.min(units.length - 1, Math.floor(Math.log(value || 1) / Math.log(1024)));
    const sized = value / Math.pow(1024, i);
    const decimal = sized >= 100 ? 0 : sized >= 10 ? 1 : 2;
    return `${sized.toFixed(decimal)} ${units[i]}`;
};
const formatNumber = (value)=>{
    if (!Number.isFinite(value ?? NaN)) return '-';
    return Math.trunc(value).toLocaleString();
};
const formatRatio = (value)=>{
    if (!Number.isFinite(value ?? NaN)) return '-';
    return `${value.toFixed(2)}x`;
};
const calcRatio = (compressed, uncompressed)=>{
    if (!Number.isFinite(compressed ?? NaN) || !Number.isFinite(uncompressed ?? NaN) || !uncompressed) return '-';
    const ratio = compressed / uncompressed;
    if (!Number.isFinite(ratio) || ratio <= 0) return '-';
    return formatRatio(ratio);
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/size-and-rows-card.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>SizeAndRowsCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/metric-item.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/formatters.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
function SizeAndRowsCard({ stats, loading }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableStats');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "text-sm font-medium",
                children: t('Size and rows')
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/size-and-rows-card.tsx",
                lineNumber: 19,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                    children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid gap-4 sm:grid-cols-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-16"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/size-and-rows-card.tsx",
                                lineNumber: 24,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-16"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/size-and-rows-card.tsx",
                                lineNumber: 25,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-16"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/size-and-rows-card.tsx",
                                lineNumber: 26,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/size-and-rows-card.tsx",
                        lineNumber: 23,
                        columnNumber: 21
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid gap-4 sm:grid-cols-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                label: t('Row count'),
                                value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(stats?.rowCount)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/size-and-rows-card.tsx",
                                lineNumber: 30,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                label: t('Data size'),
                                value: `${(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatBytes"])(stats?.compressedBytes)} / ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatBytes"])(stats?.uncompressedBytes)}`,
                                hint: t('Compressed / Uncompressed')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/size-and-rows-card.tsx",
                                lineNumber: 31,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                label: t('Compression ratio'),
                                value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatRatio"])(stats?.compressionRatio)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/size-and-rows-card.tsx",
                                lineNumber: 36,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/size-and-rows-card.tsx",
                        lineNumber: 29,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/size-and-rows-card.tsx",
                    lineNumber: 21,
                    columnNumber: 13
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/size-and-rows-card.tsx",
                lineNumber: 20,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/size-and-rows-card.tsx",
        lineNumber: 18,
        columnNumber: 9
    }, this);
}
_s(SizeAndRowsCard, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = SizeAndRowsCard;
var _c;
__turbopack_context__.k.register(_c, "SizeAndRowsCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PartitionsCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$accordion$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/accordion.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/metric-item.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/formatters.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
function PartitionItem({ partition, t }) {
    const ratio = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["calcRatio"])(partition.compressedBytes, partition.uncompressedBytes);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-2",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "grid gap-3 sm:grid-cols-3",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    label: t('Rows'),
                    value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(partition.rowCount)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                    lineNumber: 21,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    label: t('Compressed'),
                    value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatBytes"])(partition.compressedBytes)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                    lineNumber: 22,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    label: t('Uncompressed'),
                    value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatBytes"])(partition.uncompressedBytes),
                    hint: t('Ratio', {
                        ratio
                    })
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                    lineNumber: 23,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
            lineNumber: 20,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
        lineNumber: 19,
        columnNumber: 9
    }, this);
}
_c = PartitionItem;
function PartitionsCard({ stats, loading }) {
    _s();
    const partitions = stats?.partitions ?? [];
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableStats');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "text-sm font-medium",
                children: t('Partitions')
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                lineNumber: 35,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                    className: "space-y-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                label: t('Partition count'),
                                value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(stats?.partitionCount ?? 0)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                                lineNumber: 39,
                                columnNumber: 21
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                            lineNumber: 38,
                            columnNumber: 17
                        }, this),
                        loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-10"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                                    lineNumber: 44,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-10"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                                    lineNumber: 45,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-10"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                                    lineNumber: 46,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                            lineNumber: 43,
                            columnNumber: 21
                        }, this) : partitions.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-sm text-muted-foreground",
                            children: t('No active partitions')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                            lineNumber: 49,
                            columnNumber: 21
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$accordion$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Accordion"], {
                            type: "multiple",
                            className: "rounded-md border px-4",
                            children: partitions.map((partition)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$accordion$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AccordionItem"], {
                                    value: partition.name,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$accordion$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AccordionTrigger"], {
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-col gap-1 text-left",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "font-medium",
                                                        children: partition.name
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                                                        lineNumber: 56,
                                                        columnNumber: 41
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-xs text-muted-foreground",
                                                        children: [
                                                            t('Rows count', {
                                                                count: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(partition.rowCount)
                                                            }),
                                                            " · ",
                                                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatBytes"])(partition.compressedBytes)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                                                        lineNumber: 57,
                                                        columnNumber: 41
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                                                lineNumber: 55,
                                                columnNumber: 37
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                                            lineNumber: 54,
                                            columnNumber: 33
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$accordion$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AccordionContent"], {
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(PartitionItem, {
                                                partition: partition,
                                                t: t
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                                                lineNumber: 63,
                                                columnNumber: 37
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                                            lineNumber: 62,
                                            columnNumber: 33
                                        }, this)
                                    ]
                                }, partition.name, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                                    lineNumber: 53,
                                    columnNumber: 29
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                            lineNumber: 51,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                    lineNumber: 37,
                    columnNumber: 13
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
                lineNumber: 36,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx",
        lineNumber: 34,
        columnNumber: 9
    }, this);
}
_s(PartitionsCard, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c1 = PartitionsCard;
var _c, _c1;
__turbopack_context__.k.register(_c, "PartitionItem");
__turbopack_context__.k.register(_c1, "PartitionsCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>StorageHealthCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/metric-item.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/formatters.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
function StorageHealthCard({ stats, loading }) {
    _s();
    const activeMutations = stats?.activeMutations ?? [];
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableStats');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "text-sm font-medium",
                children: t('Storage health')
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                lineNumber: 21,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                    className: "space-y-4",
                    children: [
                        loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid gap-4 sm:grid-cols-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-16"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                    lineNumber: 26,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-16"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                    lineNumber: 27,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-16"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                    lineNumber: 28,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                            lineNumber: 25,
                            columnNumber: 21
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid gap-4 sm:grid-cols-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    label: t('Part count'),
                                    value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(stats?.partCount ?? 0)
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                    lineNumber: 32,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    label: t('Avg part size'),
                                    value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatBytes"])(stats?.avgPartSize ?? null)
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                    lineNumber: 33,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    label: t('Max part size'),
                                    value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatBytes"])(stats?.maxPartSize ?? null)
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                    lineNumber: 34,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                            lineNumber: 31,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-xs font-medium text-muted-foreground uppercase tracking-wide",
                                    children: t('Active mutations')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                    lineNumber: 39,
                                    columnNumber: 21
                                }, this),
                                loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                            className: "h-10"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                            lineNumber: 42,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                            className: "h-10"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                            lineNumber: 43,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                    lineNumber: 41,
                                    columnNumber: 25
                                }, this) : activeMutations.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-sm text-muted-foreground",
                                    children: t('No active mutations')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                    lineNumber: 46,
                                    columnNumber: 25
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-3",
                                    children: activeMutations.map((mutation)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "rounded-md border p-3",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-col gap-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-sm font-medium leading-tight",
                                                        children: t('Mutation', {
                                                            id: mutation.id
                                                        })
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                                        lineNumber: 52,
                                                        columnNumber: 41
                                                    }, this),
                                                    mutation.command ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-xs text-muted-foreground line-clamp-2 break-all",
                                                        children: mutation.command
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                                        lineNumber: 54,
                                                        columnNumber: 45
                                                    }, this) : null,
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-xs text-muted-foreground",
                                                        children: [
                                                            mutation.progress != null ? t('Progress percent', {
                                                                percent: Math.round(mutation.progress * 100)
                                                            }) : t('Progress unknown'),
                                                            mutation.partsDone != null || mutation.partsToDo != null ? ` ${t('Parts progress', {
                                                                done: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(mutation.partsDone ?? 0),
                                                                total: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(mutation.partsToDo ?? 0)
                                                            })}` : ''
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                                        lineNumber: 56,
                                                        columnNumber: 41
                                                    }, this),
                                                    mutation.createTime ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-[11px] text-muted-foreground",
                                                        children: t('Created at', {
                                                            time: mutation.createTime
                                                        })
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                                        lineNumber: 68,
                                                        columnNumber: 45
                                                    }, this) : null
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                                lineNumber: 51,
                                                columnNumber: 37
                                            }, this)
                                        }, mutation.id, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                            lineNumber: 50,
                                            columnNumber: 33
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                                    lineNumber: 48,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                            lineNumber: 38,
                            columnNumber: 17
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                    lineNumber: 23,
                    columnNumber: 13
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
                lineNumber: 22,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx",
        lineNumber: 20,
        columnNumber: 9
    }, this);
}
_s(StorageHealthCard, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = StorageHealthCard;
var _c;
__turbopack_context__.k.register(_c, "StorageHealthCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TableHealthReportCard",
    ()=>TableHealthReportCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useQuery.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/alert.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-check.js [app-client] (ecmascript) <export default as CheckCircle2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-client] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$cw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/rotate-cw.js [app-client] (ecmascript) <export default as RotateCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/table-queries.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/lib/actions/client.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
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
function TableHealthReportCard({ tableStats, databaseName, tableName, connectionId }) {
    _s();
    const hasStats = !!tableStats;
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableStats');
    const fallbackInsights = [
        t('Fallback insight 1'),
        t('Fallback insight 2'),
        t('Fallback insight 3'),
        t('Fallback insight 4')
    ];
    const fallbackSuggestion = t('Fallback suggestion');
    const insightsQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tableQueryKeys"].aiStatsInsights(connectionId, databaseName, tableName),
        enabled: hasStats,
        staleTime: 1000 * 60 * 10,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
        queryFn: {
            "TableHealthReportCard.useQuery[insightsQuery]": async ()=>{
                const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["executeActionClient"])('ai.tableStatsInsights', {
                    stats: tableStats,
                    database: databaseName,
                    table: tableName
                }, {
                    currentConnectionId: connectionId
                });
                const newInsights = data?.insights?.length ? data.insights : fallbackInsights;
                const newSuggestion = data?.suggestion || fallbackSuggestion;
                return {
                    insights: newInsights,
                    suggestion: newSuggestion,
                    updatedAt: new Date()
                };
            }
        }["TableHealthReportCard.useQuery[insightsQuery]"]
    });
    const insights = insightsQuery.data?.insights ?? fallbackInsights;
    const suggestion = insightsQuery.data?.suggestion ?? fallbackSuggestion;
    const lastUpdated = insightsQuery.data?.updatedAt ?? null;
    const loading = insightsQuery.isFetching || !tableStats;
    const error = insightsQuery.error ? insightsQuery.error.message : null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: "text-sm font-medium",
                                children: t('Stats insights')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                                lineNumber: 73,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xs text-muted-foreground",
                                children: lastUpdated ? t('Last updated', {
                                    time: lastUpdated.toLocaleTimeString()
                                }) : ''
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                                lineNumber: 74,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                        lineNumber: 72,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                        variant: "ghost",
                        size: "icon",
                        className: "h-8 w-8 text-muted-foreground",
                        onClick: ()=>insightsQuery.refetch(),
                        disabled: !hasStats || loading,
                        title: t('Reanalyze'),
                        children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                            className: "h-4 w-4 animate-spin"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                            lineNumber: 86,
                            columnNumber: 32
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$cw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCw$3e$__["RotateCw"], {
                            className: "h-4 w-4"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                            lineNumber: 86,
                            columnNumber: 79
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                        lineNumber: 78,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                lineNumber: 71,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                    className: "space-y-3",
                    children: [
                        error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Alert"], {
                            variant: "destructive",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertTitle"], {
                                    children: t('Insights failed')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                                    lineNumber: 93,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDescription"], {
                                    children: error
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                                    lineNumber: 94,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                            lineNumber: 92,
                            columnNumber: 21
                        }, this) : null,
                        loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-4 w-full"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                                    lineNumber: 100,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-4 w-11/12"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                                    lineNumber: 101,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-4 w-10/12"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                                    lineNumber: 102,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-4 w-9/12"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                                    lineNumber: 103,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                            lineNumber: 99,
                            columnNumber: 21
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-2 text-sm leading-relaxed",
                            children: insights.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-start gap-2 rounded-md border px-3 py-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                                            className: "mt-[2px] h-4 w-4 text-emerald-500"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                                            lineNumber: 109,
                                            columnNumber: 33
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-muted-foreground",
                                            children: item
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                                            lineNumber: 110,
                                            columnNumber: 33
                                        }, this)
                                    ]
                                }, item, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                                    lineNumber: 108,
                                    columnNumber: 29
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                            lineNumber: 106,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "rounded-md border bg-muted/60 px-3 py-2 text-sm text-muted-foreground",
                            children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-4 w-9/12"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                                lineNumber: 117,
                                columnNumber: 32
                            }, this) : suggestion
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                            lineNumber: 116,
                            columnNumber: 17
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                    lineNumber: 90,
                    columnNumber: 13
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
                lineNumber: 89,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx",
        lineNumber: 70,
        columnNumber: 9
    }, this);
}
_s(TableHealthReportCard, "9/SyE2EP5Oxukg1B2Gi+JpCVXD0=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"]
    ];
});
_c = TableHealthReportCard;
var _c;
__turbopack_context__.k.register(_c, "TableHealthReportCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-size-card.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PostgresSizeCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/metric-item.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/formatters.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
function PostgresSizeCard({ stats, loading }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('PostgresTableStats');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "text-sm font-medium",
                children: t('Size')
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-size-card.tsx",
                lineNumber: 19,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                    children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid gap-4 sm:grid-cols-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-16"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-size-card.tsx",
                                lineNumber: 24,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-16"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-size-card.tsx",
                                lineNumber: 25,
                                columnNumber: 29
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-size-card.tsx",
                        lineNumber: 23,
                        columnNumber: 25
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid gap-4 sm:grid-cols-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                label: t('Total size'),
                                value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatBytes"])(stats?.totalBytes)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-size-card.tsx",
                                lineNumber: 29,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                label: t('Row estimate'),
                                value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(stats?.rowEstimate)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-size-card.tsx",
                                lineNumber: 30,
                                columnNumber: 29
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-size-card.tsx",
                        lineNumber: 28,
                        columnNumber: 25
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-size-card.tsx",
                    lineNumber: 21,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-size-card.tsx",
                lineNumber: 20,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-size-card.tsx",
        lineNumber: 18,
        columnNumber: 9
    }, this);
}
_s(PostgresSizeCard, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = PostgresSizeCard;
var _c;
__turbopack_context__.k.register(_c, "PostgresSizeCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PostgresIndexUsageCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/tooltip.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/metric-item.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/formatters.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$up$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowUp$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/arrow-up.js [app-client] (ecmascript) <export default as ArrowUp>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/arrow-down.js [app-client] (ecmascript) <export default as ArrowDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$up$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowUpDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/arrow-up-down.js [app-client] (ecmascript) <export default as ArrowUpDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$info$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Info$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/info.js [app-client] (ecmascript) <export default as Info>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$key$2d$round$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__KeyRound$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/key-round.js [app-client] (ecmascript) <export default as KeyRound>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/badge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/web-utils/src/index.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
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
function isPrimaryKey(name) {
    return name.endsWith('_pkey') || name.endsWith('_pk') || name === 'primary';
}
function getInsight(idx, t) {
    if (isPrimaryKey(idx.indexName)) return {
        text: t('Constraint index'),
        variant: 'muted'
    };
    if (idx.indexScans === 0) return {
        text: t('No usage recorded insight'),
        variant: 'warning'
    };
    if (idx.indexScans < 10) return {
        text: t('Rarely used'),
        variant: 'warning'
    };
    return {
        text: t('Actively used'),
        variant: 'active'
    };
}
const statusDot = {
    active: 'bg-emerald-500',
    warning: 'bg-amber-400',
    muted: 'bg-blue-400'
};
const insightTextClass = {
    active: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    muted: 'text-muted-foreground'
};
function PostgresIndexUsageCard({ indexUsage, loading }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('PostgresTableStats');
    const indexes = indexUsage ?? [];
    const [filter, setFilter] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"]('all');
    const [sortKey, setSortKey] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"]('indexScans');
    const [sortDir, setSortDir] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"]('desc');
    const handleSort = (key)=>{
        if (sortKey === key) {
            setSortDir((d)=>d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };
    const totalCount = indexes.length;
    const usedCount = indexes.filter((i)=>i.indexScans > 0).length;
    const unusedCount = totalCount - usedCount;
    const totalSizeBytes = indexes.reduce((sum, i)=>sum + (i.sizeBytes ?? 0), 0);
    const maxScans = Math.max(...indexes.map((i)=>i.indexScans), 1);
    const filtered = indexes.filter((idx)=>{
        if (filter === 'used') return idx.indexScans > 0;
        if (filter === 'unused') return idx.indexScans === 0;
        return true;
    });
    const sorted = [
        ...filtered
    ].sort((a, b)=>{
        const aVal = sortKey === 'sizeBytes' ? a.sizeBytes ?? 0 : a.indexScans;
        const bVal = sortKey === 'sizeBytes' ? b.sizeBytes ?? 0 : b.indexScans;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    const SortIcon = ({ col })=>{
        if (sortKey !== col) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$up$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowUpDown$3e$__["ArrowUpDown"], {
            className: "h-3 w-3 opacity-30"
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
            lineNumber: 85,
            columnNumber: 37
        }, this);
        return sortDir === 'asc' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$up$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowUp$3e$__["ArrowUp"], {
            className: "h-3 w-3"
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
            lineNumber: 86,
            columnNumber: 36
        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowDown$3e$__["ArrowDown"], {
            className: "h-3 w-3"
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
            lineNumber: 86,
            columnNumber: 70
        }, this);
    };
    const ColHeader = ({ label, tooltip, sortable, col, align = 'left' })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap', align === 'right' ? 'text-right' : 'text-left', sortable && 'cursor-pointer select-none hover:text-foreground'),
            onClick: sortable && col ? ()=>handleSort(col) : undefined,
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('flex items-center gap-1', align === 'right' && 'justify-end'),
                children: [
                    label,
                    tooltip && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                asChild: true,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$info$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Info$3e$__["Info"], {
                                    className: "h-3 w-3 opacity-40 cursor-help shrink-0"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                    lineNumber: 115,
                                    columnNumber: 29
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                lineNumber: 114,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                className: "max-w-xs text-xs leading-snug",
                                children: tooltip
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                lineNumber: 117,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                        lineNumber: 113,
                        columnNumber: 21
                    }, this),
                    sortable && col && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SortIcon, {
                        col: col
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                        lineNumber: 120,
                        columnNumber: 37
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                lineNumber: 110,
                columnNumber: 13
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
            lineNumber: 102,
            columnNumber: 9
        }, this);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipProvider"], {
        delayDuration: 200,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "space-y-3",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                    className: "text-sm font-medium",
                    children: t('Index usage')
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                    lineNumber: 128,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                        className: "grid gap-4 sm:grid-cols-4",
                        children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-10"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                    lineNumber: 135,
                                    columnNumber: 33
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-10"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                    lineNumber: 136,
                                    columnNumber: 33
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-10"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                    lineNumber: 137,
                                    columnNumber: 33
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                    className: "h-10"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                    lineNumber: 138,
                                    columnNumber: 33
                                }, this)
                            ]
                        }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    label: t('Total indexes'),
                                    value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(totalCount)
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                    lineNumber: 142,
                                    columnNumber: 33
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    label: t('Used indexes'),
                                    value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(usedCount)
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                    lineNumber: 143,
                                    columnNumber: 33
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    label: t('Unused indexes'),
                                    value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(unusedCount)
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                    lineNumber: 144,
                                    columnNumber: 33
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    label: t('Total index size'),
                                    value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatBytes"])(totalSizeBytes || null)
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                    lineNumber: 145,
                                    columnNumber: 33
                                }, this)
                            ]
                        }, void 0, true)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                        lineNumber: 132,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                    lineNumber: 131,
                    columnNumber: 17
                }, this),
                !loading && totalCount > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center gap-1",
                    children: [
                        'all',
                        'used',
                        'unused'
                    ].map((f)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: ()=>setFilter(f),
                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('px-2.5 py-1 text-xs rounded-md transition-colors', filter === f ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'),
                            children: [
                                f === 'all' ? t('All') : f === 'used' ? t('Used indexes') : t('Unused indexes'),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "ml-1 opacity-50",
                                    children: f === 'all' ? totalCount : f === 'used' ? usedCount : unusedCount
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                    lineNumber: 166,
                                    columnNumber: 33
                                }, this)
                            ]
                        }, f, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                            lineNumber: 155,
                            columnNumber: 29
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                    lineNumber: 153,
                    columnNumber: 21
                }, this),
                loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-2",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                            className: "h-8 w-full"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                            lineNumber: 177,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                            className: "h-12 w-full"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                            lineNumber: 178,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                            className: "h-12 w-full"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                            lineNumber: 179,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                            className: "h-12 w-full"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                            lineNumber: 180,
                            columnNumber: 25
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                    lineNumber: 176,
                    columnNumber: 21
                }, this) : indexes.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "text-sm text-muted-foreground",
                    children: t('No indexes')
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                    lineNumber: 183,
                    columnNumber: 21
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "rounded-md border overflow-hidden",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                            className: "w-full",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                                    className: "border-b bg-muted/40",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ColHeader, {
                                                label: t('Index')
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                lineNumber: 190,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ColHeader, {
                                                label: t('Kind')
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                lineNumber: 192,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ColHeader, {
                                                label: t('Index scans'),
                                                tooltip: t('Scans tooltip'),
                                                sortable: true,
                                                col: "indexScans",
                                                align: "right"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                lineNumber: 194,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ColHeader, {
                                                label: t('Index size'),
                                                sortable: true,
                                                col: "sizeBytes",
                                                align: "right"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                lineNumber: 202,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ColHeader, {
                                                label: t('Tuple reads'),
                                                tooltip: t('Tuple reads tooltip'),
                                                align: "right"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                lineNumber: 209,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ColHeader, {
                                                label: t('Tuple fetches'),
                                                tooltip: t('Tuple fetches tooltip'),
                                                align: "right"
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                lineNumber: 214,
                                                columnNumber: 37
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                        lineNumber: 188,
                                        columnNumber: 33
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                    lineNumber: 187,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                                    className: "divide-y",
                                    children: sorted.map((idx)=>{
                                        const isPrimary = isPrimaryKey(idx.indexName);
                                        const insight = getInsight(idx, t);
                                        const hasScans = idx.indexScans > 0;
                                        const scanPct = hasScans ? Math.round(idx.indexScans / maxScans * 100) : 0;
                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                            className: "hover:bg-muted/30 transition-colors",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                    className: "px-3 py-2.5 max-w-55",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex items-start gap-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('mt-1.25 h-1.5 w-1.5 rounded-full shrink-0', statusDot[insight.variant])
                                                            }, void 0, false, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                                lineNumber: 234,
                                                                columnNumber: 53
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "min-w-0",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "font-mono text-xs font-medium truncate leading-5",
                                                                        title: idx.indexName,
                                                                        children: idx.indexName
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                                        lineNumber: 241,
                                                                        columnNumber: 57
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('text-[11px] leading-4 mt-0.5', insightTextClass[insight.variant]),
                                                                        children: insight.text
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                                        lineNumber: 248,
                                                                        columnNumber: 57
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                                lineNumber: 240,
                                                                columnNumber: 53
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                        lineNumber: 232,
                                                        columnNumber: 49
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                    lineNumber: 231,
                                                    columnNumber: 45
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                    className: "px-3 py-2.5 whitespace-nowrap",
                                                    children: isPrimary ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                                        variant: "default",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$key$2d$round$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__KeyRound$3e$__["KeyRound"], {}, void 0, false, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                                lineNumber: 259,
                                                                columnNumber: 57
                                                            }, this),
                                                            t('Primary key')
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                        lineNumber: 258,
                                                        columnNumber: 53
                                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                                        variant: "outline",
                                                        children: t('Secondary')
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                        lineNumber: 263,
                                                        columnNumber: 53
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                    lineNumber: 256,
                                                    columnNumber: 45
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                    className: "px-3 py-2.5 text-right whitespace-nowrap",
                                                    children: hasScans ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex flex-col items-end gap-1",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "text-sm font-medium tabular-nums",
                                                                children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(idx.indexScans)
                                                            }, void 0, false, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                                lineNumber: 271,
                                                                columnNumber: 57
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "h-1 w-16 rounded-full bg-muted overflow-hidden",
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "h-full rounded-full bg-primary/50 transition-all",
                                                                    style: {
                                                                        width: `${scanPct}%`
                                                                    }
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                                    lineNumber: 275,
                                                                    columnNumber: 61
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                                lineNumber: 274,
                                                                columnNumber: 57
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                        lineNumber: 270,
                                                        columnNumber: 53
                                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-sm text-muted-foreground/40 tabular-nums select-none",
                                                        children: "—"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                        lineNumber: 282,
                                                        columnNumber: 53
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                    lineNumber: 268,
                                                    columnNumber: 45
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                    className: "px-3 py-2.5 text-right whitespace-nowrap",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-sm font-medium tabular-nums",
                                                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatBytes"])(idx.sizeBytes)
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                        lineNumber: 288,
                                                        columnNumber: 49
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                    lineNumber: 287,
                                                    columnNumber: 45
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                    className: "px-3 py-2.5 text-right whitespace-nowrap",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-xs text-muted-foreground tabular-nums",
                                                        children: idx.tupleReads > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(idx.tupleReads) : '—'
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                        lineNumber: 295,
                                                        columnNumber: 49
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                    lineNumber: 294,
                                                    columnNumber: 45
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                    className: "px-3 py-2.5 text-right whitespace-nowrap",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "text-xs text-muted-foreground tabular-nums",
                                                        children: idx.tupleFetches > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(idx.tupleFetches) : '—'
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                        lineNumber: 302,
                                                        columnNumber: 49
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                                    lineNumber: 301,
                                                    columnNumber: 45
                                                }, this)
                                            ]
                                        }, idx.indexName, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                            lineNumber: 229,
                                            columnNumber: 41
                                        }, this);
                                    })
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                                    lineNumber: 221,
                                    columnNumber: 29
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                            lineNumber: 186,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "px-3 py-1.5 text-[11px] text-muted-foreground/60 border-t bg-muted/20",
                            children: t('Stats reset notice')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                            lineNumber: 311,
                            columnNumber: 25
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
                    lineNumber: 185,
                    columnNumber: 21
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
            lineNumber: 127,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx",
        lineNumber: 126,
        columnNumber: 9
    }, this);
}
_s(PostgresIndexUsageCard, "+B7vSUTmetpzfOLGWyekCppAwxI=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = PostgresIndexUsageCard;
var _c;
__turbopack_context__.k.register(_c, "PostgresIndexUsageCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PostgresVacuumCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/metric-item.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/formatters.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
function formatTimestamp(value) {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleString();
    } catch  {
        return value;
    }
}
function PostgresVacuumCard({ vacuumHealth, loading }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('PostgresTableStats');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "text-sm font-medium",
                children: t('Vacuum health')
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                lineNumber: 29,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                    children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid gap-4 sm:grid-cols-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                        className: "h-16"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                        lineNumber: 35,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                        className: "h-16"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                        lineNumber: 36,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                        className: "h-16"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                        lineNumber: 37,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                        className: "h-16"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                        lineNumber: 38,
                                        columnNumber: 33
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                lineNumber: 34,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid gap-4 sm:grid-cols-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                        className: "h-16"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                        lineNumber: 41,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                        className: "h-16"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                        lineNumber: 42,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                        className: "h-16"
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                        lineNumber: 43,
                                        columnNumber: 33
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                lineNumber: 40,
                                columnNumber: 29
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                        lineNumber: 33,
                        columnNumber: 25
                    }, this) : !vacuumHealth ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-sm text-muted-foreground",
                        children: t('No vacuum data')
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                        lineNumber: 47,
                        columnNumber: 25
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid gap-4 sm:grid-cols-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        label: t('Last vacuum'),
                                        value: formatTimestamp(vacuumHealth.lastVacuum)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                        lineNumber: 51,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        label: t('Last autovacuum'),
                                        value: formatTimestamp(vacuumHealth.lastAutovacuum)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                        lineNumber: 52,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        label: t('Last analyze'),
                                        value: formatTimestamp(vacuumHealth.lastAnalyze)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                        lineNumber: 53,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        label: t('Last autoanalyze'),
                                        value: formatTimestamp(vacuumHealth.lastAutoanalyze)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                        lineNumber: 54,
                                        columnNumber: 33
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                lineNumber: 50,
                                columnNumber: 29
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid gap-4 sm:grid-cols-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        label: t('Live tuples'),
                                        value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(vacuumHealth.liveTuples)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                        lineNumber: 57,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        label: t('Dead tuples'),
                                        value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(vacuumHealth.deadTuples)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                        lineNumber: 58,
                                        columnNumber: 33
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$metric$2d$item$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                        label: t('Mods since analyze'),
                                        value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatNumber"])(vacuumHealth.modsSinceAnalyze)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                        lineNumber: 59,
                                        columnNumber: 33
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                                lineNumber: 56,
                                columnNumber: 29
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                        lineNumber: 49,
                        columnNumber: 25
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                    lineNumber: 31,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
                lineNumber: 30,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx",
        lineNumber: 28,
        columnNumber: 9
    }, this);
}
_s(PostgresVacuumCard, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = PostgresVacuumCard;
var _c;
__turbopack_context__.k.register(_c, "PostgresVacuumCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/postgres-stats.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PostgresTableStatsView
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/react.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/alert.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/scroll-area.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/shared/stores/app.store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/table-queries.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$postgres$2d$size$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-size-card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$postgres$2d$index$2d$usage$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-index-usage-card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$postgres$2d$vacuum$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/postgres-vacuum-card.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
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
function PostgresTableStatsView({ databaseName, tableName }) {
    _s();
    const currentConnection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentConnectionAtom"]);
    const connectionId = currentConnection?.connection?.id;
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('PostgresTableStats');
    const statsQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableStatsQuery"])({
        databaseName,
        tableName,
        connectionId
    });
    const stats = statsQuery.data ?? null;
    const loading = statsQuery.isLoading;
    const error = (!connectionId && databaseName && tableName ? t('No available connection') : null) || (statsQuery.error ? statsQuery.error.message : null);
    if (!databaseName || !tableName) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "h-full flex items-center justify-center text-sm text-muted-foreground",
            children: t('Select table to view stats')
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/postgres-stats.tsx",
            lineNumber: 32,
            columnNumber: 16
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ScrollArea"], {
        className: "h-full pr-3",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "space-y-4 pb-6",
            children: [
                error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Alert"], {
                    variant: "destructive",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertTitle"], {
                            children: t('Failed to load stats')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/postgres-stats.tsx",
                            lineNumber: 40,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDescription"], {
                            children: error
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/postgres-stats.tsx",
                            lineNumber: 41,
                            columnNumber: 25
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/postgres-stats.tsx",
                    lineNumber: 39,
                    columnNumber: 21
                }, this) : null,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$postgres$2d$size$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    stats: stats,
                    loading: loading
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/postgres-stats.tsx",
                    lineNumber: 44,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$postgres$2d$index$2d$usage$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    indexUsage: stats?.indexUsage,
                    loading: loading
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/postgres-stats.tsx",
                    lineNumber: 45,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$postgres$2d$vacuum$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    vacuumHealth: stats?.vacuumHealth,
                    loading: loading
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/postgres-stats.tsx",
                    lineNumber: 46,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/postgres-stats.tsx",
            lineNumber: 37,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/postgres-stats.tsx",
        lineNumber: 36,
        columnNumber: 9
    }, this);
}
_s(PostgresTableStatsView, "Tm5THs5eCbg4Iu/P9D2s3PS+K9E=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableStatsQuery"]
    ];
});
_c = PostgresTableStatsView;
var _c;
__turbopack_context__.k.register(_c, "PostgresTableStatsView");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TableStatsView
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/react.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/alert.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/scroll-area.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/shared/stores/app.store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$size$2d$and$2d$rows$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/size-and-rows-card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$partitions$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/partitions-card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$storage$2d$health$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/storage-health-card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$ai$2d$insight$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/ai-insight.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$postgres$2d$stats$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/postgres-stats.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/table-queries.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/drivers/src/types/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$types$2f$postgres$2d$family$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/drivers/src/types/postgres-family.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
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
function ClickhouseTableStatsView({ databaseName, tableName }) {
    _s();
    const currentConnection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentConnectionAtom"]);
    const connectionId = currentConnection?.connection?.id;
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableStats');
    const statsQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableStatsQuery"])({
        databaseName,
        tableName,
        connectionId
    });
    const stats = statsQuery.data ?? null;
    const loading = statsQuery.isLoading;
    const error = (!connectionId && databaseName && tableName ? t('No available connection') : null) || (statsQuery.error ? statsQuery.error.message : null);
    if (!databaseName || !tableName) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "h-full flex items-center justify-center text-sm text-muted-foreground",
            children: t('Select table to view stats')
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx",
            lineNumber: 35,
            columnNumber: 16
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ScrollArea"], {
        className: "h-full pr-3",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "space-y-4 pb-6",
            children: [
                error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Alert"], {
                    variant: "destructive",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertTitle"], {
                            children: t('Failed to load stats')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx",
                            lineNumber: 43,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDescription"], {
                            children: error
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx",
                            lineNumber: 44,
                            columnNumber: 25
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx",
                    lineNumber: 42,
                    columnNumber: 21
                }, this) : null,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$ai$2d$insight$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TableHealthReportCard"], {
                    tableStats: stats,
                    databaseName: databaseName,
                    tableName: tableName,
                    connectionId: connectionId
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx",
                    lineNumber: 47,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$size$2d$and$2d$rows$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    stats: stats,
                    loading: loading
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx",
                    lineNumber: 48,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$partitions$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    stats: stats,
                    loading: loading
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx",
                    lineNumber: 49,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$storage$2d$health$2d$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    stats: stats,
                    loading: loading
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx",
                    lineNumber: 50,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx",
            lineNumber: 40,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx",
        lineNumber: 39,
        columnNumber: 9
    }, this);
}
_s(ClickhouseTableStatsView, "Tm5THs5eCbg4Iu/P9D2s3PS+K9E=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableStatsQuery"]
    ];
});
_c = ClickhouseTableStatsView;
function TableStatsView({ databaseName, tableName, driver }) {
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$types$2f$postgres$2d$family$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isPostgresFamilyConnectionType"])(driver)) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$postgres$2d$stats$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
            databaseName: databaseName,
            tableName: tableName
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx",
            lineNumber: 59,
            columnNumber: 16
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ClickhouseTableStatsView, {
        databaseName: databaseName,
        tableName: tableName
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx",
        lineNumber: 61,
        columnNumber: 12
    }, this);
}
_c1 = TableStatsView;
var _c, _c1;
__turbopack_context__.k.register(_c, "ClickhouseTableStatsView");
__turbopack_context__.k.register(_c1, "TableStatsView");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ColumnsSection",
    ()=>ColumnsSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$table$2d$core$2f$build$2f$lib$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/table-core/build/lib/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$table$2f$build$2f$lib$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-table/build/lib/index.mjs [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$ai$2d$spark$2d$icon$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/@dory/ui/ai-spark-icon/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f$overflow$2d$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/overflow-tooltip.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$sticky$2d$data$2d$table$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/@dory/ui/sticky-data-table/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/badge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/input.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/tooltip.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/search.js [app-client] (ecmascript) <export default as Search>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
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
function ColumnsSection({ tableName, loading, columns }) {
    _s();
    const [query, setQuery] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"]('');
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser');
    const placeholderRows = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"]({
        "ColumnsSection.useMemo[placeholderRows]": ()=>{
            return Array.from({
                length: 4
            }).map({
                "ColumnsSection.useMemo[placeholderRows]": (_, idx)=>({
                        name: `placeholder-${idx}`,
                        type: '',
                        nullable: true,
                        defaultValue: '',
                        comment: '',
                        semanticTags: [],
                        semanticSummary: null
                    })
            }["ColumnsSection.useMemo[placeholderRows]"]);
        }
    }["ColumnsSection.useMemo[placeholderRows]"], []);
    const columnDefs = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"]({
        "ColumnsSection.useMemo[columnDefs]": ()=>{
            return [
                {
                    accessorKey: 'name',
                    header: t('Column name'),
                    meta: {
                        className: 'w-[200px] text-left',
                        cellClassName: 'text-left'
                    },
                    cell: {
                        "ColumnsSection.useMemo[columnDefs]": ({ row })=>{
                            if (loading) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-4 w-24"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                lineNumber: 39,
                                columnNumber: 41
                            }, this);
                            const summary = row.original.semanticSummary;
                            const hasDetails = Boolean(summary);
                            const content = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex max-w-50 items-center gap-1.5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f$overflow$2d$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OverflowTooltip"], {
                                        text: row.original.name,
                                        className: "block min-w-0 flex-1 truncate font-medium",
                                        disableTooltip: true,
                                        children: row.original.name
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                        lineNumber: 46,
                                        columnNumber: 29
                                    }, this),
                                    hasDetails ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                                asChild: true,
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    "aria-label": t('Field details'),
                                                    className: "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#9460FF]/14 text-[10px] font-semibold leading-none text-[#9460FF] shadow-[inset_0_0_0_1px_rgba(148,96,255,0.24)] transition-colors hover:bg-[#9460FF]/22",
                                                    children: "!"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                                    lineNumber: 52,
                                                    columnNumber: 41
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                                lineNumber: 51,
                                                columnNumber: 37
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                                className: "max-w-xs space-y-3 px-3 py-2 text-xs leading-snug",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex items-start gap-1.5",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$ai$2d$spark$2d$icon$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AISparkIcon"], {}, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                                            lineNumber: 62,
                                                            columnNumber: 45
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "min-w-0",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "mb-1 text-[11px] font-medium text-background/70",
                                                                    children: t('AI explanation')
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                                                    lineNumber: 64,
                                                                    columnNumber: 49
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    children: summary
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                                                    lineNumber: 65,
                                                                    columnNumber: 49
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                                            lineNumber: 63,
                                                            columnNumber: 45
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                                    lineNumber: 61,
                                                    columnNumber: 41
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                                lineNumber: 60,
                                                columnNumber: 37
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                        lineNumber: 50,
                                        columnNumber: 33
                                    }, this) : null
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                lineNumber: 45,
                                columnNumber: 25
                            }, this);
                            return content;
                        }
                    }["ColumnsSection.useMemo[columnDefs]"]
                },
                {
                    accessorKey: 'type',
                    header: t('Column type'),
                    meta: {
                        className: 'w-[160px] text-left',
                        cellClassName: 'text-left text-muted-foreground'
                    },
                    cell: {
                        "ColumnsSection.useMemo[columnDefs]": ({ row })=>loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-4 w-28"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                lineNumber: 83,
                                columnNumber: 25
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f$overflow$2d$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OverflowTooltip"], {
                                text: row.original.type,
                                className: "block max-w-40 truncate text-sm",
                                children: row.original.type
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                lineNumber: 85,
                                columnNumber: 25
                            }, this)
                    }["ColumnsSection.useMemo[columnDefs]"]
                },
                {
                    accessorKey: 'nullable',
                    header: t('Nullable'),
                    meta: {
                        className: 'w-[110px] text-center'
                    },
                    cell: {
                        "ColumnsSection.useMemo[columnDefs]": ({ row })=>loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-4 w-12 mx-auto"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                lineNumber: 96,
                                columnNumber: 25
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                variant: row.original.nullable ? 'outline' : 'default',
                                className: "text-[11px]",
                                children: row.original.nullable ? t('Yes') : t('No')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                lineNumber: 98,
                                columnNumber: 25
                            }, this)
                    }["ColumnsSection.useMemo[columnDefs]"]
                },
                {
                    accessorKey: 'defaultValue',
                    header: t('Default'),
                    meta: {
                        className: 'w-[80px] text-left',
                        cellClassName: 'text-left text-muted-foreground'
                    },
                    cell: {
                        "ColumnsSection.useMemo[columnDefs]": ({ row })=>loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-4 w-20"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                lineNumber: 109,
                                columnNumber: 25
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f$overflow$2d$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OverflowTooltip"], {
                                text: row.original.defaultValue ?? undefined,
                                className: "block max-w-35 truncate text-sm",
                                children: row.original.defaultValue ?? '—'
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                lineNumber: 111,
                                columnNumber: 25
                            }, this)
                    }["ColumnsSection.useMemo[columnDefs]"]
                },
                {
                    accessorKey: 'comment',
                    header: t('Comment'),
                    meta: {
                        className: 'min-w-[180px] text-left',
                        cellClassName: 'text-left align-middle'
                    },
                    cell: {
                        "ColumnsSection.useMemo[columnDefs]": ({ row })=>loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-4 w-32"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                lineNumber: 122,
                                columnNumber: 25
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f$overflow$2d$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OverflowTooltip"], {
                                text: row.original.comment?.length ? row.original.comment : undefined,
                                className: "block max-w-full truncate text-sm text-muted-foreground",
                                children: row.original.comment?.length ? row.original.comment : '—'
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                lineNumber: 124,
                                columnNumber: 25
                            }, this)
                    }["ColumnsSection.useMemo[columnDefs]"]
                }
            ];
        }
    }["ColumnsSection.useMemo[columnDefs]"], [
        loading,
        t
    ]);
    const filteredColumns = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"]({
        "ColumnsSection.useMemo[filteredColumns]": ()=>{
            const keyword = query.trim().toLowerCase();
            if (!keyword) return columns;
            return columns.filter({
                "ColumnsSection.useMemo[filteredColumns]": (col)=>{
                    const nameHit = col.name.toLowerCase().includes(keyword);
                    const typeHit = col.type.toLowerCase().includes(keyword);
                    const commentHit = (col.comment ?? '').toLowerCase().includes(keyword);
                    const tagsHit = (col.semanticTags ?? []).some({
                        "ColumnsSection.useMemo[filteredColumns].tagsHit": (tag)=>tag.toLowerCase().includes(keyword)
                    }["ColumnsSection.useMemo[filteredColumns].tagsHit"]);
                    return nameHit || typeHit || commentHit || tagsHit;
                }
            }["ColumnsSection.useMemo[filteredColumns]"]);
        }
    }["ColumnsSection.useMemo[filteredColumns]"], [
        columns,
        query
    ]);
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"]({
        "ColumnsSection.useEffect": ()=>{
            setQuery('');
        }
    }["ColumnsSection.useEffect"], [
        tableName
    ]);
    const table = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$table$2f$build$2f$lib$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["useReactTable"])({
        data: loading ? placeholderRows : filteredColumns,
        columns: columnDefs,
        getCoreRowModel: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$table$2d$core$2f$build$2f$lib$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getCoreRowModel"])()
    });
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipProvider"], {
        delayDuration: 200,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "space-y-3 pt-1",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center justify-between",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                            className: "text-sm font-medium",
                            children: t('Columns')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                            lineNumber: 160,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "relative w-56",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                                    className: "absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                    lineNumber: 162,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                                    value: query,
                                    onChange: (e)=>setQuery(e.target.value),
                                    placeholder: t('Search columns'),
                                    className: "h-8 pl-8 text-xs",
                                    disabled: !tableName
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                                    lineNumber: 163,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                            lineNumber: 161,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                    lineNumber: 159,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "border rounded-lg overflow-hidden",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$sticky$2d$data$2d$table$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StickyDataTable"], {
                        table: table,
                        loading: loading,
                        emptyText: tableName ? query.trim().length ? t('No matching columns') : t('No columns found') : t('Select table to view columns'),
                        containerClassName: "h-80",
                        tableClassName: "text-sm whitespace-nowrap",
                        minBodyHeight: "100px",
                        maxBodyHeight: "560px"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                        lineNumber: 168,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
                    lineNumber: 167,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
            lineNumber: 158,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx",
        lineNumber: 157,
        columnNumber: 9
    }, this);
}
_s(ColumnsSection, "ctWJ1gVrv/LlB6DkVNysEA1+a3U=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$table$2f$build$2f$lib$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["useReactTable"]
    ];
});
_c = ColumnsSection;
var _c;
__turbopack_context__.k.register(_c, "ColumnsSection");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/properties-section.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PropertiesSection",
    ()=>PropertiesSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
const displayOrder = [
    'engine',
    'comment',
    'primaryKey',
    'sortingKey',
    'partitionKey',
    'samplingKey',
    'storagePolicy',
    'totalRows',
    'totalBytes'
];
function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '-';
    if (bytes === 0) return '0 B';
    const units = [
        'B',
        'KB',
        'MB',
        'GB',
        'TB',
        'PB'
    ];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
}
function formatRows(value) {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return '-';
    return Math.trunc(num).toLocaleString();
}
function formatValue(value) {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
        return Number.isInteger(value) ? value.toLocaleString() : value.toString();
    }
    const str = String(value).trim();
    return str.length ? str : '-';
}
function PropertiesSection({ properties, loading }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser');
    const labelMap = {
        engine: t('Engine'),
        comment: t('Comment'),
        primaryKey: t('Primary key'),
        sortingKey: t('Sorting key'),
        partitionKey: t('Partition key'),
        samplingKey: t('Sampling key'),
        storagePolicy: t('Storage policy')
    };
    const keysToRender = displayOrder.filter((key)=>labelMap[key]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "text-sm font-medium",
                children: t('Properties')
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/properties-section.tsx",
                lineNumber: 69,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                    className: "space-y-4 py-4",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid gap-3 sm:grid-cols-2",
                        children: keysToRender.map((key)=>{
                            const rawValue = properties?.[key];
                            const displayValue = loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                                className: "h-4 w-28"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/properties-section.tsx",
                                lineNumber: 76,
                                columnNumber: 33
                            }, this) : key === 'totalBytes' ? formatBytes(Number(rawValue)) : key === 'totalRows' ? formatRows(rawValue) : formatValue(rawValue);
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-col gap-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-xs text-muted-foreground",
                                        children: labelMap[key] ?? key
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/properties-section.tsx",
                                        lineNumber: 87,
                                        columnNumber: 37
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-sm font-medium min-h-[1.25rem]",
                                        children: displayValue
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/properties-section.tsx",
                                        lineNumber: 88,
                                        columnNumber: 37
                                    }, this)
                                ]
                            }, key, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/properties-section.tsx",
                                lineNumber: 86,
                                columnNumber: 33
                            }, this);
                        })
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/properties-section.tsx",
                        lineNumber: 72,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/properties-section.tsx",
                    lineNumber: 71,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/properties-section.tsx",
                lineNumber: 70,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/properties-section.tsx",
        lineNumber: 68,
        columnNumber: 9
    }, this);
}
_s(PropertiesSection, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = PropertiesSection;
var _c;
__turbopack_context__.k.register(_c, "PropertiesSection");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/ddl-section.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DdlSection",
    ()=>DdlSection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sql$2d$formatter$2f$dist$2f$esm$2f$sqlFormatter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sql-formatter/dist/esm/sqlFormatter.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$code$2d$block$2f$code$2d$block$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/@dory/ui/code-block/code-block.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$sql$2f$sql$2d$dialect$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/lib/sql/sql-dialect.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
function formatDdl(ddl, connectionType) {
    try {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sql$2d$formatter$2f$dist$2f$esm$2f$sqlFormatter$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["format"])(ddl, {
            language: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$sql$2f$sql$2d$dialect$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getSqlDialectConfigForConnectionType"])(connectionType).formatterLanguage
        }).trim();
    } catch  {
        return ddl;
    }
}
function DdlSection({ ddl, loading, connectionType }) {
    _s();
    const isLoading = !!loading;
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser');
    const content = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DdlSection.useMemo[content]": ()=>{
            const raw = ddl?.trim();
            return raw ? formatDdl(raw, connectionType) : t('DDL not available');
        }
    }["DdlSection.useMemo[content]"], [
        connectionType,
        ddl,
        t
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "text-sm font-medium",
                children: t('DDL')
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/ddl-section.tsx",
                lineNumber: 37,
                columnNumber: 13
            }, this),
            isLoading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-2 bg-muted/50 border rounded-md p-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                        className: "h-3 w-28"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/ddl-section.tsx",
                        lineNumber: 40,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                        className: "h-3 w-32"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/ddl-section.tsx",
                        lineNumber: 41,
                        columnNumber: 21
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Skeleton"], {
                        className: "h-24 w-full"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/ddl-section.tsx",
                        lineNumber: 42,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/ddl-section.tsx",
                lineNumber: 39,
                columnNumber: 17
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$code$2d$block$2f$code$2d$block$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SmartCodeBlock"], {
                value: content,
                type: "sql"
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/ddl-section.tsx",
                lineNumber: 45,
                columnNumber: 17
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/ddl-section.tsx",
        lineNumber: 36,
        columnNumber: 9
    }, this);
}
_s(DdlSection, "dB0NtzIZcx3zXDAtyaQD6bT/YJY=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = DdlSection;
var _c;
__turbopack_context__.k.register(_c, "DdlSection");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/index.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TableStructure
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/react.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$structure$2f$columns$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/columns-section.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$structure$2f$properties$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/properties-section.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$structure$2f$ddl$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/ddl-section.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/scroll-area.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/shared/stores/app.store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/table-queries.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
;
;
function TableStructure({ databaseName, tableName }) {
    _s();
    const currentConnection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentConnectionAtom"]);
    const connectionId = currentConnection?.connection?.id;
    const columnsQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableStructureColumnsQuery"])({
        databaseName,
        tableName,
        connectionId
    });
    const baseColumns = columnsQuery.data?.columns ?? [];
    const columnInsightsQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableColumnInsightsQuery"])({
        databaseName,
        tableName,
        connectionId,
        dbType: currentConnection?.connection?.type,
        columns: baseColumns
    });
    const propertiesQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTablePropertiesQuery"])({
        databaseName,
        tableName,
        connectionId
    });
    const ddlQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableDdlQuery"])({
        databaseName,
        tableName,
        connectionId
    });
    const columns = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TableStructure.useMemo[columns]": ()=>{
            if (!baseColumns.length) {
                return [];
            }
            const tags = columnInsightsQuery.data?.tags ?? {};
            const summaries = columnInsightsQuery.data?.summaries ?? {};
            return baseColumns.map({
                "TableStructure.useMemo[columns]": (col)=>{
                    const key = col.name.toLowerCase();
                    const hasSummary = Object.prototype.hasOwnProperty.call(summaries, key);
                    return {
                        ...col,
                        semanticTags: tags[key] ?? [],
                        semanticSummary: hasSummary ? summaries[key] ?? null : null
                    };
                }
            }["TableStructure.useMemo[columns]"]);
        }
    }["TableStructure.useMemo[columns]"], [
        baseColumns,
        columnInsightsQuery.data
    ]);
    const tableProperties = propertiesQuery.data ?? null;
    const ddl = ddlQuery.data ?? null;
    const loadingColumns = columnsQuery.isLoading;
    const loadingTableProperties = propertiesQuery.isLoading;
    const loadingDdl = ddlQuery.isLoading;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ScrollArea"], {
        className: "h-full pr-3",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "space-y-6 pb-6",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$structure$2f$columns$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ColumnsSection"], {
                    tableName: tableName,
                    loading: loadingColumns,
                    columns: columns
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/index.tsx",
                    lineNumber: 66,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$structure$2f$properties$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PropertiesSection"], {
                    properties: tableProperties,
                    loading: loadingTableProperties
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/index.tsx",
                    lineNumber: 67,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$structure$2f$ddl$2d$section$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DdlSection"], {
                    ddl: ddl,
                    loading: loadingDdl,
                    connectionType: currentConnection?.connection?.type
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/index.tsx",
                    lineNumber: 69,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/index.tsx",
            lineNumber: 65,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/index.tsx",
        lineNumber: 64,
        columnNumber: 9
    }, this);
}
_s(TableStructure, "n7+Uj/uE1Wlvi9kj8NE42sBqMSY=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableStructureColumnsQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableColumnInsightsQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTablePropertiesQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableDdlQuery"]
    ];
});
_c = TableStructure;
var _c;
__turbopack_context__.k.register(_c, "TableStructure");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/lib/fetch-table-preview.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "fetchTablePreview",
    ()=>fetchTablePreview
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/lib/actions/client.ts [app-client] (ecmascript)");
;
async function fetchTablePreview({ connectionId, databaseName, tableName, limit, offset, countMode, sort, filters, search, searchColumns, sessionId, tabId, source, signal }) {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["executeActionClient"])('table.preview', {
        connectionId,
        database: databaseName,
        table: tableName,
        limit,
        offset,
        countMode,
        sort,
        filters,
        search,
        searchColumns,
        sessionId,
        tabId,
        source
    }, {
        currentConnectionId: connectionId,
        signal
    });
    return {
        code: 0,
        message: 'success',
        data
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DataPreviewPaginationBar",
    ()=>DataPreviewPaginationBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronLeft$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-left.js [app-client] (ecmascript) <export default as ChevronLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ellipsis$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MoreHorizontal$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/ellipsis.js [app-client] (ecmascript) <export default as MoreHorizontal>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/web-utils/src/index.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/select.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
const PAGE_SIZE_OPTIONS = [
    50,
    100,
    200,
    500,
    1000
];
function getPaginationItems(pageIndex, totalPages) {
    if (totalPages <= 7) {
        return Array.from({
            length: totalPages
        }, (_, index)=>index);
    }
    const currentPage = pageIndex + 1;
    const showStartEllipsis = currentPage > 4;
    const showEndEllipsis = currentPage < totalPages - 3;
    if (!showStartEllipsis && showEndEllipsis) {
        return [
            0,
            1,
            2,
            3,
            4,
            'end-ellipsis',
            totalPages - 1
        ];
    }
    if (showStartEllipsis && !showEndEllipsis) {
        return [
            0,
            'start-ellipsis',
            totalPages - 5,
            totalPages - 4,
            totalPages - 3,
            totalPages - 2,
            totalPages - 1
        ];
    }
    return [
        0,
        'start-ellipsis',
        pageIndex - 1,
        pageIndex,
        pageIndex + 1,
        'end-ellipsis',
        totalPages - 1
    ];
}
function DataPreviewPaginationBar({ pageIndex, pageSize, totalRowEstimate, currentPageRowCount, rowsLabel: rowsLabelProp, loading, variant = 'footer', onPageChange, onPageSizeChange }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser');
    const totalPages = totalRowEstimate != null && totalRowEstimate > 0 ? Math.max(1, Math.ceil(totalRowEstimate / pageSize)) : null;
    const currentPageIndex = totalPages != null ? Math.max(0, Math.min(pageIndex, totalPages - 1)) : Math.max(0, pageIndex);
    const pageItems = totalPages != null ? getPaginationItems(currentPageIndex, totalPages) : [];
    const hasPrevious = currentPageIndex > 0;
    const hasNext = totalPages != null ? currentPageIndex + 1 < totalPages : currentPageRowCount >= pageSize;
    const pageLabel = t('Pagination.PageUnknown', {
        current: currentPageIndex + 1
    });
    const rowsLabel = rowsLabelProp ?? (currentPageRowCount > 0 && totalRowEstimate == null ? t('Pagination.ShowingCount', {
        count: currentPageRowCount.toLocaleString()
    }) : null);
    const goToPage = (target)=>{
        if (totalPages == null) {
            onPageChange(Math.max(0, target));
            return;
        }
        onPageChange(Math.max(0, Math.min(target, totalPages - 1)));
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-testid": "data-preview-pagination",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$web$2d$utils$2f$src$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('flex flex-nowrap items-center justify-between gap-2 text-xs text-muted-foreground', variant === 'footer' ? 'flex-none overflow-x-auto border-t bg-card px-3 py-1.5' : 'min-w-max flex-1'),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex shrink-0 flex-nowrap items-center gap-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex shrink-0 flex-nowrap items-center gap-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                variant: "ghost",
                                size: "icon-xs",
                                disabled: !hasPrevious || loading,
                                onClick: ()=>goToPage(currentPageIndex - 1),
                                "aria-label": t('Pagination.Previous'),
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronLeft$3e$__["ChevronLeft"], {}, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                                    lineNumber: 89,
                                    columnNumber: 25
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                                lineNumber: 88,
                                columnNumber: 21
                            }, this),
                            totalPages != null ? pageItems.map((item)=>typeof item === 'number' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                    variant: item === currentPageIndex ? 'outline' : 'ghost',
                                    size: "icon-xs",
                                    disabled: loading,
                                    onClick: ()=>goToPage(item),
                                    "aria-current": item === currentPageIndex ? 'page' : undefined,
                                    "aria-label": t('Pagination.GoToPage', {
                                        page: item + 1
                                    }),
                                    className: "h-6 w-auto min-w-6 px-1.5 border-border/60 shadow-none tabular-nums",
                                    children: item + 1
                                }, item, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                                    lineNumber: 95,
                                    columnNumber: 33
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "flex h-6 w-4 items-center justify-center text-muted-foreground/70",
                                    "aria-hidden": "true",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ellipsis$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MoreHorizontal$3e$__["MoreHorizontal"], {}, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                                        lineNumber: 109,
                                        columnNumber: 37
                                    }, this)
                                }, item, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                                    lineNumber: 108,
                                    columnNumber: 33
                                }, this)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "px-1 tabular-nums",
                                children: pageLabel
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                                lineNumber: 114,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                variant: "ghost",
                                size: "icon-xs",
                                disabled: !hasNext || loading,
                                onClick: ()=>goToPage(currentPageIndex + 1),
                                "aria-label": t('Pagination.Next'),
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {}, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                                    lineNumber: 118,
                                    columnNumber: 25
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                                lineNumber: 117,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                        lineNumber: 87,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex shrink-0 items-center gap-1.5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "whitespace-nowrap",
                                children: t('Pagination.RowsPerPage')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                                lineNumber: 123,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Select"], {
                                value: String(pageSize),
                                onValueChange: (value)=>onPageSizeChange(Number(value)),
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SelectTrigger"], {
                                        size: "control",
                                        className: "h-6 min-h-6 min-w-22 shrink-0",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SelectValue"], {}, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                                            lineNumber: 126,
                                            columnNumber: 29
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                                        lineNumber: 125,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SelectContent"], {
                                        children: PAGE_SIZE_OPTIONS.map((size)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SelectItem"], {
                                                value: String(size),
                                                className: "text-xs",
                                                children: size
                                            }, size, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                                                lineNumber: 130,
                                                columnNumber: 33
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                                        lineNumber: 128,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                                lineNumber: 124,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                        lineNumber: 122,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                lineNumber: 86,
                columnNumber: 13
            }, this),
            rowsLabel && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex shrink-0 items-center gap-2 tabular-nums",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    children: rowsLabel
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                    lineNumber: 141,
                    columnNumber: 21
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
                lineNumber: 140,
                columnNumber: 17
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx",
        lineNumber: 79,
        columnNumber: 9
    }, this);
}
_s(DataPreviewPaginationBar, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = DataPreviewPaginationBar;
var _c;
__turbopack_context__.k.register(_c, "DataPreviewPaginationBar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/lib/commit-table-updates.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "commitTableUpdates",
    ()=>commitTableUpdates
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/lib/actions/client.ts [app-client] (ecmascript)");
;
function commitTableUpdates({ connectionId, database, table, rows }) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["executeActionClient"])('table.commitUpdates', {
        connectionId,
        database,
        table,
        rows
    }, {
        currentConnectionId: connectionId
    });
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-store.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "applyTableCellEdit",
    ()=>applyTableCellEdit,
    "clearTableEdits",
    ()=>clearTableEdits,
    "createEmptyTableEditSession",
    ()=>createEmptyTableEditSession,
    "getPendingEditCounts",
    ()=>getPendingEditCounts,
    "getRowKey",
    ()=>getRowKey,
    "overlayPendingRow",
    ()=>overlayPendingRow,
    "pendingRowsToUpdates",
    ()=>pendingRowsToUpdates,
    "redoTableEdit",
    ()=>redoTableEdit,
    "revertTableCellEdit",
    ()=>revertTableCellEdit,
    "revertTableRowEdit",
    ()=>revertTableRowEdit,
    "tableEditSessionsAtom",
    ()=>tableEditSessionsAtom,
    "toTableMutationValue",
    ()=>toTableMutationValue,
    "undoTableEdit",
    ()=>undoTableEdit
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/vanilla.mjs [app-client] (ecmascript)");
;
const tableEditSessionsAtom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["atom"])({});
const HISTORY_LIMIT = 100;
function createEmptyTableEditSession() {
    return {
        rows: {},
        past: [],
        future: []
    };
}
function commitRows(session, rows) {
    if (rows === session.rows) return session;
    return {
        rows,
        past: [
            ...session.past.slice(-(HISTORY_LIMIT - 1)),
            session.rows
        ],
        future: []
    };
}
function withoutEmptyRow(rows, rowKey, row) {
    if (Object.keys(row.changes).length > 0) {
        return {
            ...rows,
            [rowKey]: row
        };
    }
    const next = {
        ...rows
    };
    delete next[rowKey];
    return next;
}
function applyTableCellEdit(session, input) {
    const currentRow = session.rows[input.rowKey];
    const currentCell = currentRow?.changes[input.column];
    const originalValue = currentCell ? currentCell.originalValue : input.originalValue;
    const currentValue = currentCell ? currentCell.nextValue : input.originalValue;
    if (Object.is(currentValue, input.nextValue)) {
        return session;
    }
    const row = currentRow ?? {
        rowKey: input.rowKey,
        key: input.key,
        changes: {}
    };
    const nextChanges = {
        ...row.changes
    };
    if (Object.is(originalValue, input.nextValue)) {
        delete nextChanges[input.column];
    } else {
        nextChanges[input.column] = {
            column: input.column,
            originalValue,
            nextValue: input.nextValue,
            sourceRowIndex: input.sourceRowIndex,
            sourceView: input.sourceView
        };
    }
    return commitRows(session, withoutEmptyRow(session.rows, input.rowKey, {
        ...row,
        changes: nextChanges
    }));
}
function revertTableCellEdit(session, rowKey, column) {
    const row = session.rows[rowKey];
    if (!row?.changes[column]) return session;
    const changes = {
        ...row.changes
    };
    delete changes[column];
    return commitRows(session, withoutEmptyRow(session.rows, rowKey, {
        ...row,
        changes
    }));
}
function revertTableRowEdit(session, rowKey) {
    if (!session.rows[rowKey]) return session;
    const rows = {
        ...session.rows
    };
    delete rows[rowKey];
    return commitRows(session, rows);
}
function clearTableEdits(session) {
    if (!Object.keys(session.rows).length) return session;
    return commitRows(session, {});
}
function undoTableEdit(session) {
    const previous = session.past.at(-1);
    if (!previous) return session;
    return {
        rows: previous,
        past: session.past.slice(0, -1),
        future: [
            session.rows,
            ...session.future
        ].slice(0, HISTORY_LIMIT)
    };
}
function redoTableEdit(session) {
    const next = session.future[0];
    if (!next) return session;
    return {
        rows: next,
        past: [
            ...session.past.slice(-(HISTORY_LIMIT - 1)),
            session.rows
        ],
        future: session.future.slice(1)
    };
}
function pendingRowsToUpdates(session) {
    return Object.values(session.rows).map((row)=>({
            key: row.key,
            changes: Object.values(row.changes).map((change)=>({
                    column: change.column,
                    originalValue: change.originalValue,
                    nextValue: change.nextValue
                }))
        }));
}
function getPendingEditCounts(session) {
    const rows = Object.values(session.rows);
    return {
        rowCount: rows.length,
        cellCount: rows.reduce((total, row)=>total + Object.keys(row.changes).length, 0)
    };
}
function getRowKey(row, primaryKeyColumns) {
    const key = {};
    for (const column of primaryKeyColumns){
        const value = toTableMutationValue(row[column]);
        if (value === undefined) return null;
        key[column] = value;
    }
    return {
        key,
        rowKey: JSON.stringify(primaryKeyColumns.map((column)=>[
                column,
                key[column]
            ]))
    };
}
function toTableMutationValue(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return value.toISOString();
    return undefined;
}
function overlayPendingRow(row, rowKey, session) {
    const pending = session.rows[rowKey];
    if (!pending) return row;
    const overlaid = {
        ...row
    };
    Object.values(pending.changes).forEach((change)=>{
        overlaid[change.column] = change.nextValue;
    });
    return overlaid;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TableEditorPanel",
    ()=>TableEditorPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$corner$2d$down$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CornerDownLeft$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/corner-down-left.js [app-client] (ecmascript) <export default as CornerDownLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pencil$2d$line$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PencilLine$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/pencil-line.js [app-client] (ecmascript) <export default as PencilLine>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/rotate-ccw.js [app-client] (ecmascript) <export default as RotateCcw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/x.js [app-client] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2d$dom$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react-dom/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$code$2d$block$2f$code$2d$block$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/@dory/ui/code-block/code-block.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/tabs.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/tooltip.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
;
function displayValue(value) {
    if (value === null) return 'NULL';
    if (value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
}
function keyLabel(row) {
    return Object.entries(row.key).map(([column, value])=>`${column}=${displayValue(value)}`).join(', ');
}
function TableEditorPanel({ open, width, changesView, tableName, session, sqlPreview, portalContainer, position = 'absolute', onOpenChange, onChangesViewChange, onWidthChange, onRevertCell, onJumpToCell, onClearAll, onCommitAll, isCommitting }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser.Editor');
    const pendingRows = Object.values(session.rows);
    const pendingCards = pendingRows.flatMap((row)=>Object.values(row.changes).map((change)=>({
                row,
                change
            })));
    const pendingCellCount = pendingCards.length;
    if (!open || !portalContainer) return null;
    const startResize = (event)=>{
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        const onMove = (moveEvent)=>{
            onWidthChange(Math.max(300, Math.min(720, startWidth + startX - moveEvent.clientX)));
        };
        const onUp = ()=>{
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = '';
        };
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2d$dom$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createPortal"])(/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        "data-testid": "table-editor-panel",
        className: `pointer-events-auto inset-y-0 right-0 z-30 flex min-h-0 flex-col border-l bg-card shadow-lg ${position === 'fixed' ? 'fixed' : 'absolute'}`,
        style: {
            width
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                role: "separator",
                "aria-orientation": "vertical",
                className: "absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize",
                onMouseDown: startResize
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                lineNumber: 92,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex h-12 shrink-0 items-center border-b px-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "min-w-0 flex-1 truncate text-sm font-medium",
                        children: [
                            t('PendingChanges'),
                            pendingCellCount > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "ml-1 tabular-nums text-muted-foreground",
                                children: pendingCellCount
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                lineNumber: 96,
                                columnNumber: 45
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                        lineNumber: 94,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                        variant: "ghost",
                        size: "icon-sm",
                        "aria-label": t('CloseEditorPanel'),
                        onClick: ()=>onOpenChange(false),
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                            className: "h-4 w-4"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                            lineNumber: 99,
                            columnNumber: 21
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                        lineNumber: 98,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                lineNumber: 93,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tabs"], {
                value: changesView,
                onValueChange: (value)=>onChangesViewChange(value),
                className: "flex min-h-0 flex-1 flex-col",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "shrink-0 border-b px-3 py-2",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsList"], {
                            className: "h-8",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                                    value: "visual",
                                    className: "h-7 px-3",
                                    children: t('Visual')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                    lineNumber: 106,
                                    columnNumber: 25
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                                    value: "sql",
                                    className: "h-7 px-3",
                                    children: "SQL"
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                    lineNumber: 109,
                                    columnNumber: 25
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                            lineNumber: 105,
                            columnNumber: 21
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                        lineNumber: 104,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsContent"], {
                        value: "visual",
                        className: "mt-0 min-h-0 flex-1 overflow-auto",
                        children: pendingCards.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground",
                            children: t('NoPendingChanges')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                            lineNumber: 116,
                            columnNumber: 25
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3 p-3",
                            children: pendingCards.map(({ row, change })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                    "data-testid": "pending-change-card",
                                    "data-column": change.column,
                                    className: "rounded-lg border bg-background p-3 shadow-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    "data-testid": "pending-change-card-indicator",
                                                    className: "flex size-7 shrink-0 items-center justify-center rounded-md border border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pencil$2d$line$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PencilLine$3e$__["PencilLine"], {
                                                        className: "size-3.5",
                                                        "aria-hidden": "true"
                                                    }, void 0, false, {
                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                        lineNumber: 131,
                                                        columnNumber: 45
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                    lineNumber: 127,
                                                    columnNumber: 41
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex min-w-0 flex-1 items-center gap-1 text-xs",
                                                    title: `${tableName} · ${keyLabel(row)} · ${change.column}`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "shrink-0 text-foreground",
                                                            children: tableName
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                            lineNumber: 134,
                                                            columnNumber: 45
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                                            className: "size-3 shrink-0 text-muted-foreground",
                                                            "aria-hidden": "true"
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                            lineNumber: 135,
                                                            columnNumber: 45
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "min-w-0 truncate font-mono text-muted-foreground",
                                                            children: keyLabel(row)
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                            lineNumber: 136,
                                                            columnNumber: 45
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                                            className: "size-3 shrink-0 text-muted-foreground",
                                                            "aria-hidden": "true"
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                            lineNumber: 137,
                                                            columnNumber: 45
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "shrink-0 font-mono font-medium text-foreground",
                                                            children: change.column
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                            lineNumber: 138,
                                                            columnNumber: 45
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                    lineNumber: 133,
                                                    columnNumber: 41
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex shrink-0 items-center",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                                                    asChild: true,
                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                                                        variant: "ghost",
                                                                        size: "icon-sm",
                                                                        "aria-label": t('JumpToCell'),
                                                                        onClick: ()=>onJumpToCell(row, change.column),
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$corner$2d$down$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CornerDownLeft$3e$__["CornerDownLeft"], {
                                                                            className: "h-3.5 w-3.5"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                                            lineNumber: 144,
                                                                            columnNumber: 57
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                                        lineNumber: 143,
                                                                        columnNumber: 53
                                                                    }, this)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                                    lineNumber: 142,
                                                                    columnNumber: 49
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                                                    side: "top",
                                                                    children: t('JumpToCell')
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                                    lineNumber: 147,
                                                                    columnNumber: 49
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                            lineNumber: 141,
                                                            columnNumber: 45
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                                                    asChild: true,
                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                                                        variant: "ghost",
                                                                        size: "icon-sm",
                                                                        "aria-label": t('RevertCell'),
                                                                        onClick: ()=>onRevertCell(row.rowKey, change.column),
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__["RotateCcw"], {
                                                                            className: "h-3.5 w-3.5"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                                            lineNumber: 152,
                                                                            columnNumber: 57
                                                                        }, this)
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                                        lineNumber: 151,
                                                                        columnNumber: 53
                                                                    }, this)
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                                    lineNumber: 150,
                                                                    columnNumber: 49
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                                                    side: "top",
                                                                    children: t('RevertCell')
                                                                }, void 0, false, {
                                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                                    lineNumber: 155,
                                                                    columnNumber: 49
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                            lineNumber: 149,
                                                            columnNumber: 45
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                    lineNumber: 140,
                                                    columnNumber: 41
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                            lineNumber: 126,
                                            columnNumber: 37
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-3 space-y-1 font-mono text-xs",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "rounded-sm bg-destructive/10 px-2 py-1.5 text-destructive line-through",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "mr-2 select-none",
                                                            children: "−"
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                            lineNumber: 161,
                                                            columnNumber: 45
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "whitespace-pre-wrap break-all",
                                                            children: displayValue(change.originalValue)
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                            lineNumber: 162,
                                                            columnNumber: 45
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                    lineNumber: 160,
                                                    columnNumber: 41
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "rounded-sm bg-emerald-500/10 px-2 py-1.5 text-emerald-600 dark:text-emerald-400",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "mr-2 select-none",
                                                            children: "+"
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                            lineNumber: 165,
                                                            columnNumber: 45
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "whitespace-pre-wrap break-all",
                                                            children: displayValue(change.nextValue)
                                                        }, void 0, false, {
                                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                            lineNumber: 166,
                                                            columnNumber: 45
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                                    lineNumber: 164,
                                                    columnNumber: 41
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                            lineNumber: 159,
                                            columnNumber: 37
                                        }, this)
                                    ]
                                }, `${row.rowKey}:${change.column}`, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                    lineNumber: 120,
                                    columnNumber: 33
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                            lineNumber: 118,
                            columnNumber: 25
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                        lineNumber: 114,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsContent"], {
                        value: "sql",
                        className: "mt-0 min-h-0 flex-1 overflow-auto p-4",
                        children: sqlPreview ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$code$2d$block$2f$code$2d$block$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SmartCodeBlock"], {
                            value: sqlPreview,
                            type: "sql",
                            maxHeightClassName: "max-h-none"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                            lineNumber: 176,
                            columnNumber: 25
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-sm text-muted-foreground",
                            children: t('NoPendingChanges')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                            lineNumber: 178,
                            columnNumber: 25
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                        lineNumber: 174,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                lineNumber: 103,
                columnNumber: 13
            }, this),
            pendingRows.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "shrink-0 border-t",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center justify-between gap-3 px-4 py-3",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                            variant: "ghost",
                            size: "sm",
                            onClick: onClearAll,
                            disabled: isCommitting,
                            children: t('ClearAll')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                            lineNumber: 185,
                            columnNumber: 25
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                    asChild: true,
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                        size: "sm",
                                        onClick: onCommitAll,
                                        disabled: isCommitting,
                                        children: isCommitting ? t('Committing') : t('CommitAll', {
                                            count: pendingCellCount
                                        })
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                        lineNumber: 190,
                                        columnNumber: 33
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                    lineNumber: 189,
                                    columnNumber: 29
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                    side: "top",
                                    children: t('AtomicCommitHint')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                                    lineNumber: 194,
                                    columnNumber: 29
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                            lineNumber: 188,
                            columnNumber: 25
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                    lineNumber: 184,
                    columnNumber: 21
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
                lineNumber: 183,
                columnNumber: 17
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx",
        lineNumber: 87,
        columnNumber: 9
    }, this), portalContainer);
}
_s(TableEditorPanel, "h6+q2O3NJKPY5uL0BIJGLIanww8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = TableEditorPanel;
var _c;
__turbopack_context__.k.register(_c, "TableEditorPanel");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "UrlDataPreview",
    ()=>UrlDataPreview,
    "default",
    ()=>TableDataPreview
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2d$dom$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react-dom/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/react.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$text$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__FileText$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/file-text.js [app-client] (ecmascript) <export default as FileText>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2d$open$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRightOpen$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/panel-right-open.js [app-client] (ecmascript) <export default as PanelRightOpen>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$redo$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Redo2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/redo-2.js [app-client] (ecmascript) <export default as Redo2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$cw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/rotate-cw.js [app-client] (ecmascript) <export default as RotateCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$undo$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Undo2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/undo-2.js [app-client] (ecmascript) <export default as Undo2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useMutation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useQuery.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$nuqs$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/nuqs/dist/index.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$lib$2f$fetch$2d$table$2d$preview$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/lib/fetch-table-preview.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$result$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/lib/result.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/shared/stores/app.store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/popover.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/tooltip.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$TableSearchBar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$stores$2f$result$2d$table$2e$atoms$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/stores/result-table.atoms.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$InspectorPanel$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$VTableFilters$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$code$2d$block$2f$code$2d$block$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/@dory/ui/code-block/code-block.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$data$2f$app$2e$data$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/shared/data/app.data.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/table-queries.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$DataPreviewPaginationBar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/DataPreviewPaginationBar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/alert-dialog.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$table$2d$mutations$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/drivers/src/table-mutations.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$lib$2f$commit$2d$table$2d$updates$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/lib/commit-table-updates.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$panel$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-panel.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature(), _s2 = __turbopack_context__.k.signature();
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
const PREVIEW_STALE_TIME = 1000 * 60 * 5;
const PREVIEW_GC_TIME = PREVIEW_STALE_TIME * 2;
const EMPTY_ROWS = [];
const EMPTY_SEARCH_COLUMNS = [];
const parseAsNonNegativeIndex = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$nuqs$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createParser"])({
    parse: (value)=>{
        const parsed = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$nuqs$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["parseAsIndex"].parse(value);
        return parsed != null && parsed >= 0 ? parsed : null;
    },
    serialize: (value)=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$nuqs$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["parseAsIndex"].serialize(value)
});
const parseAsPositiveInteger = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$nuqs$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createParser"])({
    parse: (value)=>{
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    },
    serialize: (value)=>String(value)
});
const dataPreviewPaginationParsers = {
    pageIndex: parseAsNonNegativeIndex.withDefault(0),
    pageSize: parseAsPositiveInteger.withDefault(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$data$2f$app$2e$data$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DEFAULT_TABLE_PREVIEW_LIMIT"])
};
function normalizeParam(value) {
    if (!value) return undefined;
    return Array.isArray(value) ? value[0] : value;
}
function getErrorMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback;
}
function toNumberOrNull(value) {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function toOptionalBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return [
        'true',
        'yes',
        '1'
    ].includes(value.toLowerCase());
    return undefined;
}
function getMutationDialect(driver) {
    if (driver === 'postgres' || driver === 'neon' || driver === 'supabase') return 'postgres';
    if (driver === 'mysql' || driver === 'mariadb') return 'mysql';
    if (driver === 'sqlite') return 'sqlite';
    if (driver === 'duckdb') return 'duckdb';
    return null;
}
function buildPreviewQueryKey({ connectionId, databaseName, tableName, storageKey, source, pageIndex, pageSize, search, filters, sort, searchColumns, countMode }) {
    return [
        'table-preview',
        source,
        connectionId,
        databaseName,
        tableName,
        storageKey,
        pageIndex,
        pageSize,
        search,
        filters,
        sort,
        searchColumns,
        countMode
    ];
}
function mapPreviewRows(rows, rowKeyPrefix) {
    return rows.map((row, idx)=>({
            tabId: rowKeyPrefix,
            rid: idx,
            rowData: row
        }));
}
function buildColumns(rows, resultSet) {
    const resultColumns = (resultSet?.columns ?? []).map((column)=>{
        const name = column?.name ?? column?.columnName;
        const type = column?.type ?? column?.columnType;
        return typeof name === 'string' && name.trim() ? {
            name,
            type: typeof type === 'string' ? type : '',
            nullable: toOptionalBoolean(column?.nullable ?? column?.isNullable),
            isPrimaryKey: toOptionalBoolean(column?.isPrimaryKey)
        } : null;
    }).filter((column)=>column !== null);
    if (resultColumns.length > 0) {
        return resultColumns;
    }
    return Object.keys(rows[0] ?? {}).map((name)=>({
            name,
            type: ''
        }));
}
function quoteSqlIdentifier(identifier) {
    return `"${identifier.replaceAll('"', '""')}"`;
}
function formatSqlLiteral(value) {
    return `'${value.replaceAll("'", "''")}'`;
}
function formatSqlLikeLiteral(value) {
    return formatSqlLiteral(`%${value}%`);
}
function buildFilterSql(filter) {
    const column = quoteSqlIdentifier(filter.col);
    const value = filter.value ?? '';
    if (filter.kind === 'number') {
        const operatorMap = {
            eq: '=',
            ne: '<>',
            gt: '>',
            ge: '>=',
            lt: '<',
            le: '<='
        };
        const operator = operatorMap[filter.op];
        return operator ? `${column} ${operator} ${formatSqlLiteral(value)}` : null;
    }
    if (filter.kind === 'range') {
        const start = filter.value ? `${column} >= ${formatSqlLiteral(filter.value)}` : null;
        const end = filter.valueTo ? `${column} <= ${formatSqlLiteral(filter.valueTo)}` : null;
        return [
            start,
            end
        ].filter(Boolean).join(' AND ') || null;
    }
    switch(filter.op){
        case 'contains':
            return `${column} ILIKE ${formatSqlLikeLiteral(value)}`;
        case 'equals':
            return `${column} = ${formatSqlLiteral(value)}`;
        case 'startsWith':
            return `${column} ILIKE ${formatSqlLiteral(`${value}%`)}`;
        case 'endsWith':
            return `${column} ILIKE ${formatSqlLiteral(`%${value}`)}`;
        case 'empty':
            return `(${column} IS NULL OR ${column} = '')`;
        case 'notEmpty':
            return `(${column} IS NOT NULL AND ${column} <> '')`;
        case 'regex':
            return `${column} ~ ${formatSqlLiteral(value)}`;
        default:
            return null;
    }
}
function buildCurrentPreviewSql({ databaseName, tableName, pageIndex, pageSize, search, filters, sort, searchColumns }) {
    const from = `${quoteSqlIdentifier(databaseName)}.${quoteSqlIdentifier(tableName)}`;
    const clauses = [
        `SELECT *`,
        `FROM ${from}`
    ];
    const whereClauses = [];
    const trimmedSearch = search.trim();
    if (trimmedSearch && searchColumns.length > 0) {
        whereClauses.push(`(${searchColumns.map((column)=>`${quoteSqlIdentifier(column)} ILIKE ${formatSqlLikeLiteral(trimmedSearch)}`).join(' OR ')})`);
    }
    for (const filter of filters){
        const filterSql = buildFilterSql(filter);
        if (filterSql) {
            whereClauses.push(filterSql);
        }
    }
    if (whereClauses.length > 0) {
        clauses.push(`WHERE ${whereClauses.join('\n  AND ')}`);
    }
    if (sort) {
        clauses.push(`ORDER BY ${quoteSqlIdentifier(sort.column)} ${sort.direction.toUpperCase()}`);
    }
    clauses.push(`LIMIT ${pageSize}`);
    clauses.push(`OFFSET ${pageIndex * pageSize}`);
    return `${clauses.join('\n')};`;
}
function DataPreviewLoadingBar({ ariaLabel }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "h-0.5 w-full overflow-hidden bg-primary/10",
        role: "progressbar",
        "aria-label": ariaLabel,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "h-full w-1/3 origin-left bg-primary animate-data-preview-progress"
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
            lineNumber: 332,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
        lineNumber: 331,
        columnNumber: 9
    }, this);
}
_c = DataPreviewLoadingBar;
function DataPreview(props) {
    const { connectionId, databaseName, tableName, driver, source = 'table-browser-data-preview' } = props;
    const resetKey = [
        source,
        connectionId,
        databaseName,
        tableName,
        driver
    ].join('::');
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DataPreviewInner, {
        ...props,
        source: source
    }, resetKey, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
        lineNumber: 341,
        columnNumber: 12
    }, this);
}
_c1 = DataPreview;
function DataPreviewInner({ connectionId, databaseName, tableName, storageKey, source = 'table-browser-data-preview', emptyMessage, inspectorPortalMode = 'preview', paginationPortalContainer, driver }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser');
    const setSessionMeta = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSetAtom"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$stores$2f$result$2d$table$2e$atoms$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentSessionMetaAtom"]);
    const currentConnection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentConnectionAtom"]);
    const queryClient = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"])();
    const [editSessions, setEditSessions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtom"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tableEditSessionsAtom"]);
    const sessionKey = storageKey ?? `preview:${connectionId ?? 'unknown'}:${databaseName ?? 'unknown'}:${tableName ?? 'unknown'}`;
    const editSession = editSessions[sessionKey] ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createEmptyTableEditSession"])();
    const currentConnectionValue = currentConnection?.connection;
    const resolvedDriver = driver ?? (currentConnectionValue && currentConnectionValue.id === connectionId ? currentConnectionValue.type : undefined);
    const mutationDialect = getMutationDialect(resolvedDriver);
    const [query, setQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [searchInput, setSearchInput] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [editorPanelOpen, setEditorPanelOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [changesView, setChangesView] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('visual');
    const [editorPanelWidth, setEditorPanelWidth] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(380);
    const [inspectorOpen, setInspectorOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [inspectorMode, setInspectorMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [inspectorPayload, setInspectorPayload] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [activeInspectorRow, setActiveInspectorRow] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [rowViewMode, setRowViewMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('table');
    const [inspectorWidth, setInspectorWidth] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(360);
    const [panelPortalContainer, setPanelPortalContainer] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [commitDialogOpen, setCommitDialogOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [selectionSummary, setSelectionSummary] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        cellCount: 0,
        rowCount: 0
    });
    const [focusRequest, setFocusRequest] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [pendingJump, setPendingJump] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [{ pageIndex, pageSize }, setPagination] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$nuqs$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["useQueryStates"])(dataPreviewPaginationParsers, {
        history: 'replace',
        shallow: true,
        scroll: false,
        urlKeys: {
            pageIndex: 'previewPage',
            pageSize: 'previewPageSize'
        }
    });
    const [activeFilters, setActiveFilters] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [sortState, setSortState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [hasUserRequestedPreviewUpdate, setHasUserRequestedPreviewUpdate] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DataPreviewInner.useEffect": ()=>{
            void setPagination({
                pageIndex: 0
            });
        }
    }["DataPreviewInner.useEffect"], [
        connectionId,
        databaseName,
        source,
        storageKey,
        tableName,
        setPagination
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLayoutEffect"])({
        "DataPreviewInner.useLayoutEffect": ()=>{
            if (inspectorPortalMode !== 'viewport') return;
            setPanelPortalContainer(document.body);
        }
    }["DataPreviewInner.useLayoutEffect"], [
        inspectorPortalMode
    ]);
    const { data: tableProperties } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTablePropertiesQuery"])({
        connectionId,
        databaseName,
        tableName
    });
    const { data: tableStats } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableStatsQuery"])({
        connectionId,
        databaseName,
        tableName
    });
    const { data: tableColumns } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableStructureColumnsQuery"])({
        connectionId,
        databaseName,
        tableName
    });
    const metadataTotalRowEstimate = tableProperties?.totalRows ?? tableStats?.rowCount ?? null;
    const searchColumns = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[searchColumns]": ()=>tableColumns?.columns.map({
                "DataPreviewInner.useMemo[searchColumns]": (column)=>column.name
            }["DataPreviewInner.useMemo[searchColumns]"]) ?? EMPTY_SEARCH_COLUMNS
    }["DataPreviewInner.useMemo[searchColumns]"], [
        tableColumns?.columns
    ]);
    const effectiveSearchColumns = query.trim() ? searchColumns : EMPTY_SEARCH_COLUMNS;
    const countMode = query.trim() || activeFilters.length > 0 ? 'exact' : 'none';
    const previewQueryKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[previewQueryKey]": ()=>buildPreviewQueryKey({
                connectionId,
                databaseName,
                tableName,
                storageKey,
                source,
                pageIndex,
                pageSize,
                search: query,
                filters: activeFilters,
                sort: sortState,
                searchColumns: effectiveSearchColumns,
                countMode
            })
    }["DataPreviewInner.useMemo[previewQueryKey]"], [
        activeFilters,
        connectionId,
        countMode,
        databaseName,
        effectiveSearchColumns,
        pageIndex,
        pageSize,
        query,
        sortState,
        source,
        storageKey,
        tableName
    ]);
    const currentPreviewSql = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[currentPreviewSql]": ()=>{
            if (!databaseName || !tableName) return '';
            return buildCurrentPreviewSql({
                databaseName,
                tableName,
                pageIndex,
                pageSize,
                search: query,
                filters: activeFilters,
                sort: sortState,
                searchColumns: effectiveSearchColumns
            });
        }
    }["DataPreviewInner.useMemo[currentPreviewSql]"], [
        activeFilters,
        databaseName,
        effectiveSearchColumns,
        pageIndex,
        pageSize,
        query,
        sortState,
        tableName
    ]);
    const previewQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: previewQueryKey,
        enabled: Boolean(connectionId && databaseName && tableName),
        staleTime: PREVIEW_STALE_TIME,
        gcTime: PREVIEW_GC_TIME,
        placeholderData: {
            "DataPreviewInner.useQuery[previewQuery]": (previousData)=>previousData
        }["DataPreviewInner.useQuery[previewQuery]"],
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: {
            "DataPreviewInner.useQuery[previewQuery]": async ({ signal })=>{
                if (!connectionId || !databaseName || !tableName) {
                    throw new Error(t('Failed to load data preview'));
                }
                const res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$lib$2f$fetch$2d$table$2d$preview$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchTablePreview"])({
                    connectionId,
                    databaseName,
                    tableName,
                    limit: pageSize,
                    offset: pageIndex * pageSize,
                    countMode,
                    sort: sortState,
                    filters: activeFilters,
                    search: query,
                    searchColumns: effectiveSearchColumns,
                    source,
                    signal
                });
                if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$result$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isSuccess"])(res)) {
                    throw new Error(res?.message ?? t('Failed to load data preview'));
                }
                const firstSet = res?.data?.queryResultSets?.[0] ?? null;
                const rawRows = Array.isArray(res?.data?.results?.[0]) ? res.data.results[0] : [];
                const nextStorageKey = storageKey ?? `preview:${connectionId}:${databaseName}:${tableName}`;
                const mappedRows = mapPreviewRows(rawRows, nextStorageKey);
                const columns = buildColumns(rawRows, firstSet);
                const totalRows = toNumberOrNull(firstSet?.totalRows);
                const unfilteredTotalRows = toNumberOrNull(firstSet?.unfilteredTotalRows) ?? totalRows;
                return {
                    columns,
                    rows: mappedRows,
                    totalRows,
                    unfilteredTotalRows,
                    stats: {
                        filteredCount: mappedRows.length,
                        totalCount: totalRows ?? mappedRows.length
                    }
                };
            }
        }["DataPreviewInner.useQuery[previewQuery]"]
    });
    const previewData = previewQuery.data;
    const baseRows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[baseRows]": ()=>previewData?.rows ?? EMPTY_ROWS
    }["DataPreviewInner.useMemo[baseRows]"], [
        previewData
    ]);
    const columns = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[columns]": ()=>{
            const metadataByName = new Map((tableColumns?.columns ?? []).map({
                "DataPreviewInner.useMemo[columns]": (column)=>[
                        column.name,
                        column
                    ]
            }["DataPreviewInner.useMemo[columns]"]));
            const previewColumns = previewData?.columns ?? [];
            const sourceColumns = previewColumns.length > 0 ? previewColumns : tableColumns?.columns ?? [];
            return sourceColumns.map({
                "DataPreviewInner.useMemo[columns]": (column)=>{
                    const metadata = metadataByName.get(column.name);
                    return {
                        ...column,
                        type: metadata?.type ?? column.type ?? '',
                        nullable: metadata?.nullable ?? column.nullable,
                        isPrimaryKey: metadata?.isPrimaryKey ?? column.isPrimaryKey
                    };
                }
            }["DataPreviewInner.useMemo[columns]"]);
        }
    }["DataPreviewInner.useMemo[columns]"], [
        previewData?.columns,
        tableColumns?.columns
    ]);
    const primaryKeyColumns = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[primaryKeyColumns]": ()=>columns.filter({
                "DataPreviewInner.useMemo[primaryKeyColumns]": (column)=>column.isPrimaryKey
            }["DataPreviewInner.useMemo[primaryKeyColumns]"]).map({
                "DataPreviewInner.useMemo[primaryKeyColumns]": (column)=>column.name
            }["DataPreviewInner.useMemo[primaryKeyColumns]"])
    }["DataPreviewInner.useMemo[primaryKeyColumns]"], [
        columns
    ]);
    const columnsByName = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[columnsByName]": ()=>new Map(columns.map({
                "DataPreviewInner.useMemo[columnsByName]": (column)=>[
                        column.name,
                        column
                    ]
            }["DataPreviewInner.useMemo[columnsByName]"]))
    }["DataPreviewInner.useMemo[columnsByName]"], [
        columns
    ]);
    const tableIsEditable = Boolean(mutationDialect && primaryKeyColumns.length > 0);
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[rows]": ()=>baseRows.map({
                "DataPreviewInner.useMemo[rows]": (row)=>{
                    const rowIdentity = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getRowKey"])(row.rowData, primaryKeyColumns);
                    return rowIdentity ? {
                        ...row,
                        rowData: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["overlayPendingRow"])(row.rowData, rowIdentity.rowKey, editSession)
                    } : row;
                }
            }["DataPreviewInner.useMemo[rows]"])
    }["DataPreviewInner.useMemo[rows]"], [
        baseRows,
        editSession,
        primaryKeyColumns
    ]);
    const currentViewIdentity = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[currentViewIdentity]": ()=>JSON.stringify({
                pageIndex,
                pageSize,
                search: query,
                filters: activeFilters,
                sort: sortState
            })
    }["DataPreviewInner.useMemo[currentViewIdentity]"], [
        activeFilters,
        pageIndex,
        pageSize,
        query,
        sortState
    ]);
    const activeInspectorRowIndex = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[activeInspectorRowIndex]": ()=>{
            if (!activeInspectorRow) return null;
            if (activeInspectorRow.rowKey) {
                const nextIndex = baseRows.findIndex({
                    "DataPreviewInner.useMemo[activeInspectorRowIndex].nextIndex": (row)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getRowKey"])(row.rowData, primaryKeyColumns)?.rowKey === activeInspectorRow.rowKey
                }["DataPreviewInner.useMemo[activeInspectorRowIndex].nextIndex"]);
                return nextIndex >= 0 ? nextIndex : null;
            }
            if (activeInspectorRow.viewIdentity !== currentViewIdentity) return null;
            return baseRows[activeInspectorRow.rowIndex] ? activeInspectorRow.rowIndex : null;
        }
    }["DataPreviewInner.useMemo[activeInspectorRowIndex]"], [
        activeInspectorRow,
        baseRows,
        currentViewIdentity,
        primaryKeyColumns
    ]);
    const resolvedInspectorPayload = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[resolvedInspectorPayload]": ()=>{
            if (inspectorMode !== 'row' || activeInspectorRowIndex == null) return inspectorPayload;
            const rowData = rows[activeInspectorRowIndex]?.rowData;
            return rowData ? {
                row: activeInspectorRowIndex,
                rowData
            } : null;
        }
    }["DataPreviewInner.useMemo[resolvedInspectorPayload]"], [
        activeInspectorRowIndex,
        inspectorMode,
        inspectorPayload,
        rows
    ]);
    const editCounts = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[editCounts]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getPendingEditCounts"])(editSession)
    }["DataPreviewInner.useMemo[editCounts]"], [
        editSession
    ]);
    const pendingUpdates = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[pendingUpdates]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pendingRowsToUpdates"])(editSession)
    }["DataPreviewInner.useMemo[pendingUpdates]"], [
        editSession
    ]);
    const updateBatch = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[updateBatch]": ()=>{
            if (!databaseName || !tableName || !primaryKeyColumns.length || !pendingUpdates.length) return null;
            return {
                database: databaseName,
                table: tableName,
                primaryKeyColumns,
                rows: pendingUpdates
            };
        }
    }["DataPreviewInner.useMemo[updateBatch]"], [
        databaseName,
        pendingUpdates,
        primaryKeyColumns,
        tableName
    ]);
    const updateSqlPreview = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[updateSqlPreview]": ()=>{
            if (!mutationDialect || !updateBatch) return '';
            try {
                return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$table$2d$mutations$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildTableUpdatePreview"])(mutationDialect, updateBatch);
            } catch  {
                return '';
            }
        }
    }["DataPreviewInner.useMemo[updateSqlPreview]"], [
        mutationDialect,
        updateBatch
    ]);
    const totalRowEstimate = previewData?.totalRows ?? metadataTotalRowEstimate;
    const loading = previewQuery.isLoading;
    const refreshing = previewQuery.isFetching;
    const error = previewData ? null : previewQuery.error ? getErrorMessage(previewQuery.error, t('Failed to load data preview')) : null;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DataPreviewInner.useEffect": ()=>{
            if (!previewData) {
                setSessionMeta({});
                return;
            }
            setSessionMeta({
                columns
            });
        }
    }["DataPreviewInner.useEffect"], [
        columns,
        previewData,
        setSessionMeta
    ]);
    const handleVTableStatsChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleVTableStatsChange]": ()=>{}
    }["DataPreviewInner.useCallback[handleVTableStatsChange]"], []);
    const handleQueryInputChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleQueryInputChange]": (nextQuery)=>{
            setSearchInput(nextQuery);
        }
    }["DataPreviewInner.useCallback[handleQueryInputChange]"], []);
    const handleSearchSubmit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleSearchSubmit]": ()=>{
            setHasUserRequestedPreviewUpdate(true);
            const nextQuery = searchInput.trim();
            if (nextQuery === query) {
                void previewQuery.refetch();
                return;
            }
            setQuery(nextQuery);
            void setPagination({
                pageIndex: 0
            });
        }
    }["DataPreviewInner.useCallback[handleSearchSubmit]"], [
        previewQuery,
        query,
        searchInput,
        setPagination
    ]);
    const handleClearQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleClearQuery]": ()=>{
            setHasUserRequestedPreviewUpdate(true);
            setSearchInput('');
            setQuery('');
            void setPagination({
                pageIndex: 0
            });
        }
    }["DataPreviewInner.useCallback[handleClearQuery]"], [
        setPagination
    ]);
    const handleUpsertFilter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleUpsertFilter]": (filter)=>{
            setHasUserRequestedPreviewUpdate(true);
            setActiveFilters({
                "DataPreviewInner.useCallback[handleUpsertFilter]": (prev)=>{
                    const others = prev.filter({
                        "DataPreviewInner.useCallback[handleUpsertFilter].others": (item)=>item.col !== filter.col
                    }["DataPreviewInner.useCallback[handleUpsertFilter].others"]);
                    return [
                        ...others,
                        filter
                    ];
                }
            }["DataPreviewInner.useCallback[handleUpsertFilter]"]);
            void setPagination({
                pageIndex: 0
            });
        }
    }["DataPreviewInner.useCallback[handleUpsertFilter]"], [
        setPagination
    ]);
    const handleRemoveFilter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleRemoveFilter]": (column)=>{
            setHasUserRequestedPreviewUpdate(true);
            setActiveFilters({
                "DataPreviewInner.useCallback[handleRemoveFilter]": (prev)=>prev.filter({
                        "DataPreviewInner.useCallback[handleRemoveFilter]": (filter)=>filter.col !== column
                    }["DataPreviewInner.useCallback[handleRemoveFilter]"])
            }["DataPreviewInner.useCallback[handleRemoveFilter]"]);
            void setPagination({
                pageIndex: 0
            });
        }
    }["DataPreviewInner.useCallback[handleRemoveFilter]"], [
        setPagination
    ]);
    const handleClearAllFilters = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleClearAllFilters]": ()=>{
            setHasUserRequestedPreviewUpdate(true);
            setActiveFilters([]);
            void setPagination({
                pageIndex: 0
            });
        }
    }["DataPreviewInner.useCallback[handleClearAllFilters]"], [
        setPagination
    ]);
    const handleSortChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleSortChange]": (nextSort)=>{
            setHasUserRequestedPreviewUpdate(true);
            setSortState(nextSort);
            void setPagination({
                pageIndex: 0
            });
        }
    }["DataPreviewInner.useCallback[handleSortChange]"], [
        setPagination
    ]);
    const handlePageChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handlePageChange]": (newPageIndex)=>{
            setHasUserRequestedPreviewUpdate(true);
            void setPagination({
                pageIndex: newPageIndex
            });
        }
    }["DataPreviewInner.useCallback[handlePageChange]"], [
        setPagination
    ]);
    const handlePageSizeChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handlePageSizeChange]": (newPageSize)=>{
            setHasUserRequestedPreviewUpdate(true);
            void setPagination({
                pageIndex: 0,
                pageSize: newPageSize
            });
        }
    }["DataPreviewInner.useCallback[handlePageSizeChange]"], [
        setPagination
    ]);
    const handleRefresh = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleRefresh]": ()=>{
            if (refreshing) return;
            setHasUserRequestedPreviewUpdate(true);
            void previewQuery.refetch();
        }
    }["DataPreviewInner.useCallback[handleRefresh]"], [
        previewQuery,
        refreshing
    ]);
    const updateEditSession = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[updateEditSession]": (updater)=>{
            setEditSessions({
                "DataPreviewInner.useCallback[updateEditSession]": (current)=>({
                        ...current,
                        [sessionKey]: updater(current[sessionKey] ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createEmptyTableEditSession"])())
                    })
            }["DataPreviewInner.useCallback[updateEditSession]"]);
        }
    }["DataPreviewInner.useCallback[updateEditSession]"], [
        sessionKey,
        setEditSessions
    ]);
    const currentView = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DataPreviewInner.useMemo[currentView]": ()=>({
                pageIndex,
                pageSize,
                search: query,
                filters: activeFilters,
                sort: sortState
            })
    }["DataPreviewInner.useMemo[currentView]"], [
        activeFilters,
        pageIndex,
        pageSize,
        query,
        sortState
    ]);
    const handleCellChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleCellChange]": ({ rowIndex, column, originalValue, nextValue })=>{
            const row = baseRows[rowIndex]?.rowData;
            if (!row) return;
            const identity = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getRowKey"])(row, primaryKeyColumns);
            const original = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toTableMutationValue"])(originalValue);
            const next = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toTableMutationValue"])(nextValue);
            if (!identity || original === undefined || next === undefined) return;
            updateEditSession({
                "DataPreviewInner.useCallback[handleCellChange]": (session)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["applyTableCellEdit"])(session, {
                        ...identity,
                        column,
                        originalValue: original,
                        nextValue: next,
                        sourceRowIndex: rowIndex,
                        sourceView: currentView
                    })
            }["DataPreviewInner.useCallback[handleCellChange]"]);
        }
    }["DataPreviewInner.useCallback[handleCellChange]"], [
        baseRows,
        currentView,
        primaryKeyColumns,
        updateEditSession
    ]);
    const getRowIdentityAt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[getRowIdentityAt]": (rowIndex)=>{
            const row = baseRows[rowIndex]?.rowData;
            return row ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getRowKey"])(row, primaryKeyColumns) : null;
        }
    }["DataPreviewInner.useCallback[getRowIdentityAt]"], [
        baseRows,
        primaryKeyColumns
    ]);
    const handleRevertCellAt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleRevertCellAt]": (rowIndex, column)=>{
            const identity = getRowIdentityAt(rowIndex);
            if (identity) updateEditSession({
                "DataPreviewInner.useCallback[handleRevertCellAt]": (session)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["revertTableCellEdit"])(session, identity.rowKey, column)
            }["DataPreviewInner.useCallback[handleRevertCellAt]"]);
        }
    }["DataPreviewInner.useCallback[handleRevertCellAt]"], [
        getRowIdentityAt,
        updateEditSession
    ]);
    const getCellEditState = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[getCellEditState]": (rowIndex, column)=>{
            const identity = getRowIdentityAt(rowIndex);
            const metadata = columnsByName.get(column);
            const isComplex = /(json|array|struct|map|blob|binary|bytea|geometry|geography|interval)/i.test(metadata?.type ?? '');
            const isPrimaryKey = primaryKeyColumns.includes(column);
            const readOnlyReason = isPrimaryKey ? t('Editor.PrimaryKeyReadOnly') : isComplex ? t('Editor.ComplexTypeReadOnly') : !mutationDialect ? t('Editor.UnsupportedDriver') : primaryKeyColumns.length === 0 ? t('Editor.NoPrimaryKey') : undefined;
            return {
                editable: tableIsEditable && !isPrimaryKey && !isComplex,
                changed: Boolean(identity && editSession.rows[identity.rowKey]?.changes[column]),
                nullable: metadata?.nullable,
                readOnlyReason
            };
        }
    }["DataPreviewInner.useCallback[getCellEditState]"], [
        columnsByName,
        editSession.rows,
        getRowIdentityAt,
        mutationDialect,
        primaryKeyColumns,
        t,
        tableIsEditable
    ]);
    const isRowChanged = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[isRowChanged]": (rowIndex)=>{
            const identity = getRowIdentityAt(rowIndex);
            return Boolean(identity && editSession.rows[identity.rowKey]);
        }
    }["DataPreviewInner.useCallback[isRowChanged]"], [
        editSession.rows,
        getRowIdentityAt
    ]);
    const handleInspectorOpen = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleInspectorOpen]": (open)=>{
            setInspectorOpen(open);
            if (open) {
                setEditorPanelOpen(false);
            } else {
                setActiveInspectorRow(null);
            }
        }
    }["DataPreviewInner.useCallback[handleInspectorOpen]"], []);
    const handleShowPendingChanges = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleShowPendingChanges]": ()=>{
            handleInspectorOpen(false);
            setEditorPanelOpen(true);
        }
    }["DataPreviewInner.useCallback[handleShowPendingChanges]"], [
        handleInspectorOpen
    ]);
    const handleActiveRowChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleActiveRowChange]": (rowIndex)=>{
            const row = baseRows[rowIndex]?.rowData;
            if (!row) return;
            setActiveInspectorRow({
                rowIndex,
                rowKey: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getRowKey"])(row, primaryKeyColumns)?.rowKey ?? null,
                viewIdentity: currentViewIdentity
            });
        }
    }["DataPreviewInner.useCallback[handleActiveRowChange]"], [
        baseRows,
        currentViewIdentity,
        primaryKeyColumns
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DataPreviewInner.useEffect": ()=>{
            if (!activeInspectorRow || activeInspectorRowIndex != null || previewQuery.isFetching) return;
            setActiveInspectorRow(null);
            setInspectorOpen(false);
        }
    }["DataPreviewInner.useEffect"], [
        activeInspectorRow,
        activeInspectorRowIndex,
        previewQuery.isFetching
    ]);
    const handleJumpToCell = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DataPreviewInner.useCallback[handleJumpToCell]": (row, column)=>{
            const change = row.changes[column];
            if (!change) return;
            const view = change.sourceView;
            setSearchInput(view.search);
            setQuery(view.search);
            setActiveFilters(view.filters);
            setSortState(view.sort);
            void setPagination({
                pageIndex: view.pageIndex,
                pageSize: view.pageSize
            });
            setPendingJump({
                rowKey: row.rowKey,
                column,
                view
            });
        }
    }["DataPreviewInner.useCallback[handleJumpToCell]"], [
        setPagination
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DataPreviewInner.useEffect": ()=>{
            if (!pendingJump || previewQuery.isFetching) return;
            const isTargetView = pageIndex === pendingJump.view.pageIndex && pageSize === pendingJump.view.pageSize && query === pendingJump.view.search && JSON.stringify(activeFilters) === JSON.stringify(pendingJump.view.filters) && JSON.stringify(sortState) === JSON.stringify(pendingJump.view.sort);
            if (!isTargetView) return;
            const rowIndex = baseRows.findIndex({
                "DataPreviewInner.useEffect.rowIndex": (row)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getRowKey"])(row.rowData, primaryKeyColumns)?.rowKey === pendingJump.rowKey
            }["DataPreviewInner.useEffect.rowIndex"]);
            if (rowIndex < 0) {
                __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].warning(t('Editor.JumpTargetChanged'));
            } else {
                setFocusRequest({
                    rowIndex,
                    column: pendingJump.column,
                    requestId: Date.now()
                });
            }
            setPendingJump(null);
        }
    }["DataPreviewInner.useEffect"], [
        activeFilters,
        baseRows,
        pageIndex,
        pageSize,
        pendingJump,
        previewQuery.isFetching,
        primaryKeyColumns,
        query,
        sortState,
        t
    ]);
    const commitMutation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMutation"])({
        mutationFn: {
            "DataPreviewInner.useMutation[commitMutation]": async ()=>{
                if (!connectionId || !databaseName || !tableName || !updateBatch) {
                    throw new Error(t('Editor.NothingToCommit'));
                }
                return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$lib$2f$commit$2d$table$2d$updates$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["commitTableUpdates"])({
                    connectionId,
                    database: databaseName,
                    table: tableName,
                    rows: updateBatch.rows
                });
            }
        }["DataPreviewInner.useMutation[commitMutation]"],
        onSuccess: {
            "DataPreviewInner.useMutation[commitMutation]": async (result)=>{
                setEditSessions({
                    "DataPreviewInner.useMutation[commitMutation]": (current)=>{
                        const next = {
                            ...current
                        };
                        delete next[sessionKey];
                        return next;
                    }
                }["DataPreviewInner.useMutation[commitMutation]"]);
                setCommitDialogOpen(false);
                await queryClient.invalidateQueries({
                    queryKey: [
                        'table-preview'
                    ]
                });
                await previewQuery.refetch();
                __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].success(t('Editor.CommitSuccess', {
                    rows: result.updatedRows,
                    fields: result.updatedCells
                }));
            }
        }["DataPreviewInner.useMutation[commitMutation]"],
        onError: {
            "DataPreviewInner.useMutation[commitMutation]": (error)=>{
                __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error(error instanceof Error ? error.message : t('Editor.CommitFailed'));
            }
        }["DataPreviewInner.useMutation[commitMutation]"]
    });
    const rowsSummaryValue = previewData?.totalRows ?? metadataTotalRowEstimate;
    const rowsSummaryTotal = previewData?.unfilteredTotalRows ?? metadataTotalRowEstimate ?? rowsSummaryValue;
    const totalRowsLabel = rowsSummaryTotal != null ? t('Pagination.TotalLabel', {
        total: rowsSummaryTotal.toLocaleString()
    }) : null;
    const rowsLabel = rowsSummaryValue != null ? t('Pagination.RowsLabel', {
        rows: rowsSummaryValue.toLocaleString()
    }) : null;
    const previewControls = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center justify-between w-full gap-3 flex-none",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex min-w-0 items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$components$2f$TableSearchBar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VTableSearchBar"], {
                        query: searchInput,
                        className: "w-72 pl-0",
                        onQueryChange: handleQueryInputChange,
                        onClearQuery: handleClearQuery,
                        onSearchSubmit: handleSearchSubmit
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                        lineNumber: 862,
                        columnNumber: 17
                    }, this),
                    totalRowsLabel && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "shrink-0 rounded-sm border bg-muted/40 px-2 py-1 text-xs tabular-nums text-muted-foreground",
                        children: totalRowsLabel
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                        lineNumber: 869,
                        columnNumber: 36
                    }, this),
                    selectionSummary.cellCount > 0 || selectionSummary.rowCount > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "shrink-0 text-xs tabular-nums text-muted-foreground",
                        children: t('Editor.SelectionSummary', {
                            cells: selectionSummary.cellCount,
                            rows: selectionSummary.rowCount
                        })
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                        lineNumber: 871,
                        columnNumber: 21
                    }, this) : null,
                    columns.length > 0 && !tableIsEditable ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                asChild: true,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "shrink-0 cursor-help text-xs text-muted-foreground",
                                    children: t('Editor.ReadOnly')
                                }, void 0, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                    lineNumber: 881,
                                    columnNumber: 29
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                lineNumber: 880,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                children: mutationDialect ? t('Editor.NoPrimaryKey') : t('Editor.UnsupportedDriver')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                lineNumber: 883,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                        lineNumber: 879,
                        columnNumber: 21
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                lineNumber: 861,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex min-w-0 items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                        asChild: true,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "inline-flex",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                                variant: "ghost",
                                                size: "icon-sm",
                                                "aria-label": t('Editor.Undo'),
                                                disabled: editSession.past.length === 0,
                                                onClick: ()=>updateEditSession(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["undoTableEdit"]),
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$undo$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Undo2$3e$__["Undo2"], {
                                                    className: "h-4 w-4"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                                    lineNumber: 899,
                                                    columnNumber: 37
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                                lineNumber: 892,
                                                columnNumber: 33
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                            lineNumber: 891,
                                            columnNumber: 29
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                        lineNumber: 890,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                        side: "bottom",
                                        children: t('Editor.Undo')
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                        lineNumber: 903,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                lineNumber: 889,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                        asChild: true,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "inline-flex",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                                variant: "ghost",
                                                size: "icon-sm",
                                                "aria-label": t('Editor.Redo'),
                                                disabled: editSession.future.length === 0,
                                                onClick: ()=>updateEditSession(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["redoTableEdit"]),
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$redo$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Redo2$3e$__["Redo2"], {
                                                    className: "h-4 w-4"
                                                }, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                                    lineNumber: 915,
                                                    columnNumber: 37
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                                lineNumber: 908,
                                                columnNumber: 33
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                            lineNumber: 907,
                                            columnNumber: 29
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                        lineNumber: 906,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                        side: "bottom",
                                        children: t('Editor.Redo')
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                        lineNumber: 919,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                lineNumber: 905,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                        lineNumber: 888,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                        variant: "ghost",
                        size: "sm",
                        className: "gap-2",
                        onClick: handleRefresh,
                        disabled: refreshing,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$cw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCw$3e$__["RotateCw"], {
                                className: `h-4 w-4 ${refreshing ? 'animate-spin' : ''}`
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                lineNumber: 923,
                                columnNumber: 21
                            }, this),
                            t('Refresh')
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                        lineNumber: 922,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Popover"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tooltip"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipTrigger"], {
                                        asChild: true,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PopoverTrigger"], {
                                            asChild: true,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                                variant: "ghost",
                                                size: "icon-sm",
                                                "aria-label": t('Current SQL'),
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$text$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__FileText$3e$__["FileText"], {}, void 0, false, {
                                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                                    lineNumber: 931,
                                                    columnNumber: 37
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                                lineNumber: 930,
                                                columnNumber: 33
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                            lineNumber: 929,
                                            columnNumber: 29
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                        lineNumber: 928,
                                        columnNumber: 25
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipContent"], {
                                        children: t('Current SQL')
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                        lineNumber: 935,
                                        columnNumber: 25
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                lineNumber: 927,
                                columnNumber: 21
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PopoverContent"], {
                                align: "end",
                                className: "w-[420px] p-0",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-4 p-4",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "space-y-1",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-lg font-semibold text-foreground",
                                                children: t('Current SQL')
                                            }, void 0, false, {
                                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                                lineNumber: 940,
                                                columnNumber: 33
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                            lineNumber: 939,
                                            columnNumber: 29
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$code$2d$block$2f$code$2d$block$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SmartCodeBlock"], {
                                            value: currentPreviewSql || ' ',
                                            type: "sql",
                                            maxHeightClassName: "max-h-64"
                                        }, void 0, false, {
                                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                            lineNumber: 942,
                                            columnNumber: 29
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                    lineNumber: 938,
                                    columnNumber: 25
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                lineNumber: 937,
                                columnNumber: 21
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                        lineNumber: 926,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                        variant: editorPanelOpen ? 'secondary' : 'outline',
                        size: "sm",
                        className: `gap-2 tabular-nums ${editCounts.cellCount > 0 ? 'border-orange-500/40 text-orange-700 hover:border-orange-500/60 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-200' : ''}`,
                        onClick: handleShowPendingChanges,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2d$open$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRightOpen$3e$__["PanelRightOpen"], {
                                className: "h-4 w-4"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                lineNumber: 956,
                                columnNumber: 21
                            }, this),
                            t('Editor.Changes', {
                                count: editCounts.cellCount
                            }),
                            editCounts.cellCount > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                "data-testid": "pending-changes-indicator",
                                className: "size-2 rounded-full bg-orange-500",
                                "aria-hidden": "true"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                lineNumber: 958,
                                columnNumber: 49
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                        lineNumber: 946,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                lineNumber: 887,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
        lineNumber: 860,
        columnNumber: 9
    }, this);
    const previewProgress = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "h-0.5 flex-none",
        children: refreshing ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DataPreviewLoadingBar, {
            ariaLabel: t('Loading Data')
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
            lineNumber: 964,
            columnNumber: 76
        }, this) : null
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
        lineNumber: 964,
        columnNumber: 29
    }, this);
    const sidePanels = tableName ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$panel$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TableEditorPanel"], {
                open: editorPanelOpen,
                width: editorPanelWidth,
                changesView: changesView,
                tableName: tableName,
                session: editSession,
                sqlPreview: updateSqlPreview,
                portalContainer: panelPortalContainer,
                position: inspectorPortalMode === 'viewport' ? 'fixed' : 'absolute',
                onOpenChange: setEditorPanelOpen,
                onChangesViewChange: setChangesView,
                onWidthChange: setEditorPanelWidth,
                onRevertCell: (rowKey, column)=>updateEditSession((session)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["revertTableCellEdit"])(session, rowKey, column)),
                onJumpToCell: handleJumpToCell,
                onClearAll: ()=>updateEditSession(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clearTableEdits"]),
                onCommitAll: ()=>setCommitDialogOpen(true),
                isCommitting: commitMutation.isPending
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                lineNumber: 967,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$InspectorPanel$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["InspectorPanel"], {
                open: inspectorOpen,
                setOpen: handleInspectorOpen,
                mode: inspectorMode,
                payload: resolvedInspectorPayload,
                portalContainer: panelPortalContainer,
                position: inspectorPortalMode === 'viewport' ? 'fixed' : 'absolute',
                rowViewMode: rowViewMode,
                setRowViewMode: setRowViewMode,
                inspectorWidth: inspectorWidth,
                setInspectorWidth: setInspectorWidth,
                columnMetas: columns,
                getCellEditState: getCellEditState,
                onCellChange: handleCellChange,
                onRevertCell: handleRevertCellAt,
                pendingChangesCount: editCounts.cellCount,
                onShowPendingChanges: handleShowPendingChanges
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                lineNumber: 985,
                columnNumber: 13
            }, this)
        ]
    }, void 0, true) : null;
    const panelPortal = inspectorPortalMode === 'preview' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: setPanelPortalContainer,
        className: "pointer-events-none absolute inset-0 z-30",
        "data-testid": "table-preview-panel-portal"
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
        lineNumber: 1007,
        columnNumber: 13
    }, this) : null;
    const paginationBar = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$DataPreviewPaginationBar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DataPreviewPaginationBar"], {
        pageIndex: pageIndex,
        pageSize: pageSize,
        totalRowEstimate: totalRowEstimate,
        currentPageRowCount: rows.length,
        rowsLabel: rowsLabel,
        loading: refreshing,
        variant: paginationPortalContainer === undefined ? 'footer' : 'inline',
        onPageChange: handlePageChange,
        onPageSizeChange: handlePageSizeChange
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
        lineNumber: 1010,
        columnNumber: 9
    }, this);
    const pagination = paginationPortalContainer === undefined ? paginationBar : paginationPortalContainer ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2d$dom$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createPortal"])(paginationBar, paginationPortalContainer) : null;
    const commitDialog = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialog"], {
        open: commitDialogOpen,
        onOpenChange: setCommitDialogOpen,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialogContent"], {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialogHeader"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialogTitle"], {
                            children: t('Editor.ConfirmCommitTitle')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                            lineNumber: 1027,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialogDescription"], {
                            children: t('Editor.ConfirmCommitDescription', {
                                fields: editCounts.cellCount,
                                updates: editCounts.rowCount,
                                rows: editCounts.rowCount
                            })
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                            lineNumber: 1028,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                    lineNumber: 1026,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    "data-testid": "commit-sql-preview",
                    className: "max-h-72 overflow-auto",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$code$2d$block$2f$code$2d$block$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SmartCodeBlock"], {
                        value: updateSqlPreview || ' ',
                        type: "sql",
                        maxHeightClassName: "max-h-64"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                        lineNumber: 1037,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                    lineNumber: 1036,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialogFooter"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialogCancel"], {
                            disabled: commitMutation.isPending,
                            children: t('Editor.Cancel')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                            lineNumber: 1040,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialogAction"], {
                            disabled: commitMutation.isPending || !updateBatch,
                            onClick: (event)=>{
                                event.preventDefault();
                                commitMutation.mutate();
                            },
                            children: commitMutation.isPending ? t('Editor.Committing') : t('Editor.CommitNow')
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                            lineNumber: 1041,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                    lineNumber: 1039,
                    columnNumber: 17
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
            lineNumber: 1025,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
        lineNumber: 1024,
        columnNumber: 9
    }, this);
    if (!connectionId || !databaseName || !tableName) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "h-full flex items-center justify-center text-sm text-muted-foreground",
            children: emptyMessage ?? t('No table preview')
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
            lineNumber: 1056,
            columnNumber: 16
        }, this);
    }
    if (error) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "relative flex h-full min-h-0 flex-col",
            children: [
                panelPortal,
                previewControls,
                previewProgress,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex min-h-0 flex-1",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: error
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                lineNumber: 1067,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                variant: "outline",
                                size: "sm",
                                onClick: handleRefresh,
                                disabled: refreshing,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$cw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCw$3e$__["RotateCw"], {
                                        className: `mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`
                                    }, void 0, false, {
                                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                        lineNumber: 1069,
                                        columnNumber: 29
                                    }, this),
                                    t('Refresh')
                                ]
                            }, void 0, true, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                lineNumber: 1068,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                        lineNumber: 1066,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                    lineNumber: 1065,
                    columnNumber: 17
                }, this),
                sidePanels,
                commitDialog
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
            lineNumber: 1061,
            columnNumber: 13
        }, this);
    }
    if (loading && rows.length === 0) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "relative h-full min-h-0 flex flex-col",
            children: [
                panelPortal,
                previewControls,
                previewProgress,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex min-h-0 flex-1",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground",
                        children: hasUserRequestedPreviewUpdate ? null : t('Loading Data')
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                        lineNumber: 1087,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                    lineNumber: 1086,
                    columnNumber: 17
                }, this),
                sidePanels,
                commitDialog
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
            lineNumber: 1082,
            columnNumber: 13
        }, this);
    }
    if (rows.length === 0 && !loading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "relative h-full min-h-0 flex flex-col",
            children: [
                panelPortal,
                previewControls,
                previewProgress,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex min-h-0 flex-1",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex min-h-0 flex-1 flex-col",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$VTableFilters$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VTableFilters"], {
                                activeFilters: activeFilters,
                                columnsRaw: columns,
                                onUpsertFilter: handleUpsertFilter,
                                onRemoveFilter: handleRemoveFilter,
                                onClearAllFilters: handleClearAllFilters
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                lineNumber: 1103,
                                columnNumber: 25
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground",
                                children: t('No data')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                                lineNumber: 1110,
                                columnNumber: 25
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                        lineNumber: 1102,
                        columnNumber: 21
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                    lineNumber: 1101,
                    columnNumber: 17
                }, this),
                pagination,
                sidePanels,
                commitDialog
            ]
        }, void 0, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
            lineNumber: 1097,
            columnNumber: 13
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "relative h-full min-h-0 flex flex-col",
        children: [
            panelPortal,
            previewControls,
            previewProgress,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "min-h-0 flex-1",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f5b$connectionId$5d2f$sql$2d$console$2f$components$2f$result$2d$table$2f$vtable$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    results: rows,
                    columnMetas: columns,
                    storageKey: storageKey,
                    onStatsChange: handleVTableStatsChange,
                    showSearchBar: true,
                    activeFilters: activeFilters,
                    onUpsertFilter: handleUpsertFilter,
                    onRemoveFilter: handleRemoveFilter,
                    onClearAllFilters: handleClearAllFilters,
                    serverSideOperations: true,
                    initialSort: sortState,
                    onSortChange: handleSortChange,
                    setInspectorOpen: handleInspectorOpen,
                    setInspectorMode: (mode)=>{
                        setInspectorMode(mode);
                        if (mode !== 'row') setActiveInspectorRow(null);
                    },
                    setInspectorPayload: setInspectorPayload,
                    editable: tableIsEditable,
                    getCellEditState: getCellEditState,
                    isRowChanged: isRowChanged,
                    onCellChange: handleCellChange,
                    onRevertCell: handleRevertCellAt,
                    onUndo: ()=>updateEditSession(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["undoTableEdit"]),
                    onRedo: ()=>updateEditSession(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["redoTableEdit"]),
                    onCommitAll: ()=>{
                        if (editCounts.cellCount > 0) setCommitDialogOpen(true);
                    },
                    onSelectionChange: setSelectionSummary,
                    focusRequest: focusRequest,
                    autoOpenRowInspector: true,
                    activeRowIndex: activeInspectorRowIndex,
                    onActiveRowChange: handleActiveRowChange
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                    lineNumber: 1127,
                    columnNumber: 17
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
                lineNumber: 1126,
                columnNumber: 13
            }, this),
            pagination,
            sidePanels,
            commitDialog
        ]
    }, void 0, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
        lineNumber: 1121,
        columnNumber: 9
    }, this);
}
_s(DataPreviewInner, "WcapBHSVhyHge1Jj6wfMDLUPVuQ=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSetAtom"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtom"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$nuqs$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["useQueryStates"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTablePropertiesQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableStatsQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$table$2d$queries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTableStructureColumnsQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMutation"]
    ];
});
_c2 = DataPreviewInner;
function TableDataPreview({ activeTab, connectionId, databaseName, tableName, inspectorPortalMode, paginationPortalContainer, driver }) {
    _s1();
    const storageKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TableDataPreview.useMemo[storageKey]": ()=>{
            if (activeTab?.tabId) return `${activeTab.tabId}:data-preview`;
            if (databaseName && tableName) return `preview:${databaseName}:${tableName}:data-preview`;
            return undefined;
        }
    }["TableDataPreview.useMemo[storageKey]"], [
        activeTab?.tabId,
        databaseName,
        tableName
    ]);
    const resolvedConnectionId = activeTab?.connectionId ?? connectionId;
    const resolvedDatabase = activeTab?.tabType === 'table' ? activeTab.databaseName : databaseName;
    const resolvedTable = activeTab?.tabType === 'table' ? activeTab.tableName : tableName;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DataPreview, {
        connectionId: resolvedConnectionId,
        databaseName: resolvedDatabase,
        tableName: resolvedTable,
        storageKey: storageKey,
        source: "table-tab-data-preview",
        inspectorPortalMode: inspectorPortalMode,
        paginationPortalContainer: paginationPortalContainer,
        driver: driver
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
        lineNumber: 1183,
        columnNumber: 9
    }, this);
}
_s1(TableDataPreview, "g2SMaiHIsZnILbrXFxJN+Xd3n4A=");
_c3 = TableDataPreview;
function UrlDataPreview() {
    _s2();
    const params = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"])();
    const currentConnection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentConnectionAtom"]);
    const databaseName = normalizeParam(params?.database);
    const tableName = normalizeParam(params?.table);
    const storageKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "UrlDataPreview.useMemo[storageKey]": ()=>{
            if (!databaseName || !tableName) return undefined;
            const connectionId = currentConnection?.connection?.id ?? 'default';
            return `url:${connectionId}:${databaseName}:${tableName}:data-preview`;
        }
    }["UrlDataPreview.useMemo[storageKey]"], [
        currentConnection?.connection?.id,
        databaseName,
        tableName
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DataPreview, {
        connectionId: currentConnection?.connection?.id,
        databaseName: databaseName,
        tableName: tableName,
        storageKey: storageKey,
        source: "catalog-data-preview",
        driver: currentConnection?.connection?.type
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx",
        lineNumber: 1210,
        columnNumber: 9
    }, this);
}
_s2(UrlDataPreview, "6OIObjqDFaKR57TPEXabfiAbwTg=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"]
    ];
});
_c4 = UrlDataPreview;
var _c, _c1, _c2, _c3, _c4;
__turbopack_context__.k.register(_c, "DataPreviewLoadingBar");
__turbopack_context__.k.register(_c1, "DataPreview");
__turbopack_context__.k.register(_c2, "DataPreviewInner");
__turbopack_context__.k.register(_c3, "TableDataPreview");
__turbopack_context__.k.register(_c4, "UrlDataPreview");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/indexes/index.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TableIndexesTab",
    ()=>TableIndexesTab
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$table$2d$core$2f$build$2f$lib$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/table-core/build/lib/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$table$2f$build$2f$lib$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-table/build/lib/index.mjs [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$sticky$2d$data$2d$table$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/@dory/ui/sticky-data-table/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f$overflow$2d$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/components/overflow-tooltip.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/lib/actions/client.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/tooltip.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/components/formatters.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
;
function TableIndexesTab({ connectionId, database, table, emptyText }) {
    _s();
    const [rows, setRows] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"]([]);
    const [loading, setLoading] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"](false);
    const loadRows = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"]({
        "TableIndexesTab.useCallback[loadRows]": async ()=>{
            if (!connectionId || !database || !table) return;
            setLoading(true);
            try {
                const res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$actions$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["executeActionClient"])('table.getIndexes', {
                    connectionId,
                    database,
                    table
                }, {
                    currentConnectionId: connectionId
                });
                setRows(res.indexes ?? []);
            } catch (error) {
                console.error('Failed to fetch table indexes:', error);
                setRows([]);
            } finally{
                setLoading(false);
            }
        }
    }["TableIndexesTab.useCallback[loadRows]"], [
        connectionId,
        database,
        table
    ]);
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"]({
        "TableIndexesTab.useEffect": ()=>{
            loadRows();
        }
    }["TableIndexesTab.useEffect"], [
        loadRows
    ]);
    const columns = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"]({
        "TableIndexesTab.useMemo[columns]": ()=>[
                {
                    accessorKey: 'name',
                    header: 'Index',
                    meta: {
                        className: 'w-[220px] text-left',
                        cellClassName: 'text-left'
                    },
                    cell: {
                        "TableIndexesTab.useMemo[columns]": ({ row })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f$overflow$2d$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OverflowTooltip"], {
                                text: row.original.name,
                                className: "block max-w-[220px] truncate font-medium text-foreground"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/indexes/index.tsx",
                                lineNumber: 49,
                                columnNumber: 36
                            }, this)
                    }["TableIndexesTab.useMemo[columns]"]
                },
                {
                    accessorKey: 'method',
                    header: 'Method',
                    meta: {
                        className: 'w-[120px] text-left',
                        cellClassName: 'text-left text-muted-foreground'
                    },
                    cell: {
                        "TableIndexesTab.useMemo[columns]": ({ row })=>row.original.method ?? '-'
                    }["TableIndexesTab.useMemo[columns]"]
                },
                {
                    accessorKey: 'isPrimary',
                    header: 'Primary',
                    meta: {
                        className: 'w-[100px] text-left',
                        cellClassName: 'text-left text-muted-foreground'
                    },
                    cell: {
                        "TableIndexesTab.useMemo[columns]": ({ row })=>row.original.isPrimary ? 'Yes' : 'No'
                    }["TableIndexesTab.useMemo[columns]"]
                },
                {
                    accessorKey: 'isUnique',
                    header: 'Unique',
                    meta: {
                        className: 'w-[100px] text-left',
                        cellClassName: 'text-left text-muted-foreground'
                    },
                    cell: {
                        "TableIndexesTab.useMemo[columns]": ({ row })=>row.original.isUnique ? 'Yes' : 'No'
                    }["TableIndexesTab.useMemo[columns]"]
                },
                {
                    accessorKey: 'sizeBytes',
                    header: 'Size',
                    meta: {
                        className: 'w-[120px] text-left',
                        cellClassName: 'text-left text-muted-foreground'
                    },
                    cell: {
                        "TableIndexesTab.useMemo[columns]": ({ row })=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$components$2f$formatters$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatBytes"])(row.original.sizeBytes ?? null)
                    }["TableIndexesTab.useMemo[columns]"]
                },
                {
                    accessorKey: 'definition',
                    header: 'Definition',
                    meta: {
                        className: 'text-left',
                        cellClassName: 'text-left text-muted-foreground'
                    },
                    cell: {
                        "TableIndexesTab.useMemo[columns]": ({ row })=>row.original.definition ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f$overflow$2d$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OverflowTooltip"], {
                                text: row.original.definition,
                                className: "block max-w-[520px] truncate text-muted-foreground"
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/indexes/index.tsx",
                                lineNumber: 80,
                                columnNumber: 47
                            }, this) : '-'
                    }["TableIndexesTab.useMemo[columns]"]
                }
            ]
    }["TableIndexesTab.useMemo[columns]"], []);
    const tableInstance = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$table$2f$build$2f$lib$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["useReactTable"])({
        data: rows,
        columns,
        getCoreRowModel: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$table$2d$core$2f$build$2f$lib$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getCoreRowModel"])()
    });
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tooltip$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TooltipProvider"], {
        delayDuration: 200,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "space-y-3 pt-1",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "border rounded-lg overflow-hidden",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$components$2f40$dory$2f$ui$2f$sticky$2d$data$2d$table$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StickyDataTable"], {
                    table: tableInstance,
                    loading: loading,
                    emptyText: emptyText,
                    containerClassName: "h-[calc(100vh-200px)]",
                    tableClassName: "text-sm whitespace-nowrap",
                    minBodyHeight: "100px",
                    maxBodyHeight: "800px"
                }, void 0, false, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/indexes/index.tsx",
                    lineNumber: 96,
                    columnNumber: 21
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/indexes/index.tsx",
                lineNumber: 95,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/indexes/index.tsx",
            lineNumber: 94,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/components/indexes/index.tsx",
        lineNumber: 93,
        columnNumber: 9
    }, this);
}
_s(TableIndexesTab, "RcaS9TUO9b6g7elHkSaVp7hwu8k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$table$2f$build$2f$lib$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["useReactTable"]
    ];
});
_c = TableIndexesTab;
var _c;
__turbopack_context__.k.register(_c, "TableIndexesTab");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TableViewTabs",
    ()=>TableViewTabs
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/tabs.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$structure$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/utils.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
;
;
function TableViewTabs({ activeTab, connectionId, databaseName, tableName, driver, inspectorPortalMode, activeSubTab, initialSubTab = 'overview', onSubTabChange }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser');
    const subTabs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TableViewTabs.useMemo[subTabs]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["supportsTableStats"])(driver) ? [
                'overview',
                'data',
                'structure',
                'stats'
            ] : [
                'overview',
                'data',
                'structure'
            ]
    }["TableViewTabs.useMemo[subTabs]"], [
        driver
    ]);
    const contentKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TableViewTabs.useMemo[contentKey]": ()=>`${databaseName ?? ''}:${tableName ?? ''}`
    }["TableViewTabs.useMemo[contentKey]"], [
        databaseName,
        tableName
    ]);
    const [localTabState, setLocalTabState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "TableViewTabs.useState": ()=>({
                key: contentKey,
                tab: initialSubTab
            })
    }["TableViewTabs.useState"]);
    const [paginationPortalContainer, setPaginationPortalContainer] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const localTab = localTabState.key === contentKey ? localTabState.tab : initialSubTab;
    const currentTab = activeSubTab ?? localTab;
    const handleTabChange = (value)=>{
        const next = subTabs.find((tab)=>tab === value) ?? 'data';
        setLocalTabState({
            key: contentKey,
            tab: next
        });
        onSubTabChange?.(next);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tabs"], {
        value: currentTab,
        onValueChange: handleTabChange,
        className: "flex h-full flex-col gap-0",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 min-h-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsContent"], {
                        value: "overview",
                        className: "h-full",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TableOverview"], {
                            databaseName: databaseName,
                            tableName: tableName
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx",
                            lineNumber: 58,
                            columnNumber: 21
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx",
                        lineNumber: 57,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsContent"], {
                        value: "data",
                        className: "h-full",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            activeTab: activeTab,
                            connectionId: connectionId,
                            databaseName: databaseName,
                            tableName: tableName,
                            inspectorPortalMode: inspectorPortalMode,
                            paginationPortalContainer: paginationPortalContainer,
                            driver: driver
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx",
                            lineNumber: 61,
                            columnNumber: 21
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx",
                        lineNumber: 60,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsContent"], {
                        value: "structure",
                        className: "h-full",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$structure$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            databaseName: databaseName,
                            tableName: tableName
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx",
                            lineNumber: 72,
                            columnNumber: 21
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx",
                        lineNumber: 71,
                        columnNumber: 17
                    }, this),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["supportsTableStats"])(driver) ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsContent"], {
                        value: "stats",
                        className: "h-full",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            databaseName: databaseName,
                            tableName: tableName,
                            driver: driver
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx",
                            lineNumber: 76,
                            columnNumber: 25
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx",
                        lineNumber: 75,
                        columnNumber: 21
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx",
                lineNumber: 56,
                columnNumber: 13
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "no-scrollbar flex h-7 shrink-0 items-center gap-4 overflow-x-auto overflow-y-hidden border-t bg-card",
                "data-testid": "table-subtabs-footer",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsList"], {
                        className: "h-7 shrink-0 justify-start p-0.5",
                        children: subTabs.map((tab)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                                value: tab,
                                className: "h-6 cursor-pointer px-3 py-0 text-xs after:hidden",
                                children: t(`Tabs.${tab}`)
                            }, tab, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx",
                                lineNumber: 84,
                                columnNumber: 25
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx",
                        lineNumber: 82,
                        columnNumber: 17
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        ref: setPaginationPortalContainer,
                        className: "flex min-w-max flex-1 items-center justify-end"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx",
                        lineNumber: 89,
                        columnNumber: 17
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx",
                lineNumber: 81,
                columnNumber: 13
            }, this)
        ]
    }, contentKey, true, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx",
        lineNumber: 55,
        columnNumber: 9
    }, this);
}
_s(TableViewTabs, "6u0mKGZSnWnCW4Aiuqmxu46liQM=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = TableViewTabs;
var _c;
__turbopack_context__.k.register(_c, "TableViewTabs");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DriverTableBrowser",
    ()=>DriverTableBrowser
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/tabs.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/overview/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/stats/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$structure$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/structure/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$indexes$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/indexes/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$table$2d$view$2d$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/table-view-tabs.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$types$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/drivers/src/types/index.ts [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$types$2f$postgres$2d$family$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/drivers/src/types/postgres-family.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/utils.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
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
const DEFAULT_TAB = 'data';
const POSTGRES_SUB_TABS = [
    'overview',
    'data',
    'structure',
    'stats',
    'indexes'
];
function normalizeTab(driver, tab) {
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$types$2f$postgres$2d$family$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isPostgresFamilyConnectionType"])(driver) && tab === 'indexes') {
        return DEFAULT_TAB;
    }
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["supportsTableStats"])(driver) && tab === 'stats') {
        return DEFAULT_TAB;
    }
    return tab ?? DEFAULT_TAB;
}
function DriverTableBrowser({ driver, activeTab, connectionId, databaseName, tableName, inspectorPortalMode, activeSubTab, initialSubTab = DEFAULT_TAB, onSubTabChange }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('PostgresExplorer');
    const resetKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "DriverTableBrowser.useMemo[resetKey]": ()=>`${driver ?? 'default'}:${databaseName ?? ''}:${tableName ?? ''}`
    }["DriverTableBrowser.useMemo[resetKey]"], [
        databaseName,
        driver,
        tableName
    ]);
    const [localTabState, setLocalTabState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "DriverTableBrowser.useState": ()=>({
                key: resetKey,
                tab: normalizeTab(driver, activeSubTab ?? initialSubTab)
            })
    }["DriverTableBrowser.useState"]);
    const [paginationPortalContainer, setPaginationPortalContainer] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const localTab = localTabState.key === resetKey ? localTabState.tab : normalizeTab(driver, activeSubTab ?? initialSubTab);
    const currentTab = normalizeTab(driver, activeSubTab ?? localTab);
    const handleTabChange = (value)=>{
        const next = normalizeTab(driver, value);
        setLocalTabState({
            key: resetKey,
            tab: next
        });
        onSubTabChange?.(next);
    };
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$drivers$2f$src$2f$types$2f$postgres$2d$family$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isPostgresFamilyConnectionType"])(driver)) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-full flex-col px-3",
            "data-testid": "table-browser-layout",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$table$2d$view$2d$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TableViewTabs"], {
                activeTab: activeTab,
                connectionId: connectionId,
                databaseName: databaseName,
                tableName: tableName,
                driver: driver,
                activeSubTab: currentTab,
                initialSubTab: normalizeTab(driver, initialSubTab),
                onSubTabChange: handleTabChange,
                inspectorPortalMode: inspectorPortalMode
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                lineNumber: 74,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
            lineNumber: 73,
            columnNumber: 13
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex h-full flex-col px-3",
        "data-testid": "table-browser-layout",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Tabs"], {
            value: currentTab,
            onValueChange: handleTabChange,
            className: "flex h-full flex-col gap-0",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex-1 min-h-0",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsContent"], {
                            value: "overview",
                            className: "h-full mt-0",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$overview$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TableOverview"], {
                                databaseName: databaseName,
                                tableName: tableName
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                                lineNumber: 94,
                                columnNumber: 25
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                            lineNumber: 93,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsContent"], {
                            value: "data",
                            className: "h-full mt-0",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                activeTab: activeTab,
                                connectionId: connectionId,
                                databaseName: databaseName,
                                tableName: tableName,
                                inspectorPortalMode: inspectorPortalMode,
                                paginationPortalContainer: paginationPortalContainer,
                                driver: driver
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                                lineNumber: 97,
                                columnNumber: 25
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                            lineNumber: 96,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsContent"], {
                            value: "structure",
                            className: "h-full mt-0",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$structure$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                databaseName: databaseName,
                                tableName: tableName
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                                lineNumber: 108,
                                columnNumber: 25
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                            lineNumber: 107,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsContent"], {
                            value: "stats",
                            className: "h-full mt-0",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$stats$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                databaseName: databaseName,
                                tableName: tableName,
                                driver: driver
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                                lineNumber: 111,
                                columnNumber: 25
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                            lineNumber: 110,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsContent"], {
                            value: "indexes",
                            className: "h-full mt-0",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$indexes$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TableIndexesTab"], {
                                connectionId: activeTab?.connectionId ?? connectionId,
                                database: databaseName ?? '',
                                table: tableName ?? '',
                                emptyText: t('Indexes.Empty')
                            }, void 0, false, {
                                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                                lineNumber: 114,
                                columnNumber: 25
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                            lineNumber: 113,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                    lineNumber: 92,
                    columnNumber: 17
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "no-scrollbar flex h-7 shrink-0 items-center gap-4 overflow-x-auto overflow-y-hidden border-t bg-card",
                    "data-testid": "table-subtabs-footer",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsList"], {
                            className: "h-7 shrink-0 justify-start p-0.5",
                            children: POSTGRES_SUB_TABS.map((tab)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$tabs$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TabsTrigger"], {
                                    value: tab,
                                    className: "h-6 cursor-pointer px-3 py-0 text-xs after:hidden",
                                    children: t(`Tabs.${tab}`)
                                }, tab, false, {
                                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                                    lineNumber: 126,
                                    columnNumber: 29
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                            lineNumber: 124,
                            columnNumber: 21
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            ref: setPaginationPortalContainer,
                            className: "flex min-w-max flex-1 items-center justify-end"
                        }, void 0, false, {
                            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                            lineNumber: 131,
                            columnNumber: 21
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
                    lineNumber: 123,
                    columnNumber: 17
                }, this)
            ]
        }, resetKey, true, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
            lineNumber: 91,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx",
        lineNumber: 90,
        columnNumber: 9
    }, this);
}
_s(DriverTableBrowser, "FoYzEg/crmnzAk0PbvxwEwEFNl8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"]
    ];
});
_c = DriverTableBrowser;
var _c;
__turbopack_context__.k.register(_c, "DriverTableBrowser");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/table-browser.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TableBrowser
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/react.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/shared/stores/app.store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/registry/new-york-v4/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$driver$2d$table$2d$browser$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/driver-table-browser.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
function TableBrowser({ activeTab, updateTab }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser');
    const currentConnection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$shared$2f$stores$2f$app$2e$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentConnectionAtom"]);
    const activeSubTab = activeTab?.tabType === 'table' ? activeTab.activeSubTab : undefined;
    const initialTab = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TableBrowser.useMemo[initialTab]": ()=>{
            if (activeSubTab) {
                return activeSubTab;
            }
            return 'data';
        }
    }["TableBrowser.useMemo[initialTab]"], [
        activeSubTab
    ]);
    const [currentTab, setCurrentTab] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(initialTab);
    const driver = currentConnection?.connection?.id === activeTab?.connectionId ? currentConnection.connection.type : undefined;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TableBrowser.useEffect": ()=>{
            setCurrentTab(initialTab);
        }
    }["TableBrowser.useEffect"], [
        initialTab
    ]);
    const handleTabChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "TableBrowser.useCallback[handleTabChange]": (value)=>{
            const next = value;
            setCurrentTab(next);
            if (activeTab?.tabId) {
                void updateTab(activeTab.tabId, {
                    activeSubTab: next
                });
            }
        }
    }["TableBrowser.useCallback[handleTabChange]"], [
        activeTab?.tabId,
        updateTab
    ]);
    if (!activeTab || activeTab.tabType !== 'table') {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
            className: "m-6",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$registry$2f$new$2d$york$2d$v4$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                className: "text-sm text-muted-foreground",
                children: t('Select table tab to browse schema')
            }, void 0, false, {
                fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-browser.tsx",
                lineNumber: 50,
                columnNumber: 17
            }, this)
        }, void 0, false, {
            fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-browser.tsx",
            lineNumber: 49,
            columnNumber: 13
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$driver$2d$table$2d$browser$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DriverTableBrowser"], {
        driver: driver,
        activeTab: activeTab,
        connectionId: activeTab.connectionId,
        databaseName: activeTab.databaseName,
        tableName: activeTab.tableName,
        inspectorPortalMode: "viewport",
        activeSubTab: currentTab,
        onSubTabChange: handleTabChange
    }, void 0, false, {
        fileName: "[project]/apps/web/app/(app)/[organization]/components/table-browser/table-browser.tsx",
        lineNumber: 56,
        columnNumber: 9
    }, this);
}
_s(TableBrowser, "gv+IDNZVrl7GoX1E62CkozAORIk=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"]
    ];
});
_c = TableBrowser;
var _c;
__turbopack_context__.k.register(_c, "TableBrowser");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/use-pending-table-changes-before-unload.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "usePendingTableChangesBeforeUnload",
    ()=>usePendingTableChangesBeforeUnload
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/react.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-store.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
function usePendingTableChangesBeforeUnload() {
    _s();
    const editSessions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tableEditSessionsAtom"]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "usePendingTableChangesBeforeUnload.useEffect": ()=>{
            const handleBeforeUnload = {
                "usePendingTableChangesBeforeUnload.useEffect.handleBeforeUnload": (event)=>{
                    const hasPendingChanges = Object.values(editSessions).some({
                        "usePendingTableChangesBeforeUnload.useEffect.handleBeforeUnload.hasPendingChanges": (session)=>Object.keys(session.rows).length > 0
                    }["usePendingTableChangesBeforeUnload.useEffect.handleBeforeUnload.hasPendingChanges"]);
                    if (!hasPendingChanges) return;
                    event.preventDefault();
                    event.returnValue = '';
                }
            }["usePendingTableChangesBeforeUnload.useEffect.handleBeforeUnload"];
            window.addEventListener('beforeunload', handleBeforeUnload);
            return ({
                "usePendingTableChangesBeforeUnload.useEffect": ()=>window.removeEventListener('beforeunload', handleBeforeUnload)
            })["usePendingTableChangesBeforeUnload.useEffect"];
        }
    }["usePendingTableChangesBeforeUnload.useEffect"], [
        editSessions
    ]);
}
_s(usePendingTableChangesBeforeUnload, "VR+lnttVNe8UKL06Rz0YTQJw7Qw=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtomValue"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/use-data-preview.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useDataPreviewManager",
    ()=>useDataPreviewManager
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jotai/esm/react.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/react-client/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$use$2d$pending$2d$table$2d$changes$2d$before$2d$unload$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/web/app/(app)/[organization]/components/table-browser/components/data-preview/use-pending-table-changes-before-unload.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
function useDataPreviewManager({ tabs, activeDatabase, setActiveDatabase, setActiveTabId, addTableTab, closeTab, closeOtherTabs }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"])('TableBrowser.Editor');
    const [editSessions, setEditSessions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtom"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$table$2d$editor$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tableEditSessionsAtom"]);
    const hasPendingChanges = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useDataPreviewManager.useCallback[hasPendingChanges]": (tabId)=>Object.keys(editSessions[`${tabId}:data-preview`]?.rows ?? {}).length > 0
    }["useDataPreviewManager.useCallback[hasPendingChanges]"], [
        editSessions
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$use$2d$pending$2d$table$2d$changes$2d$before$2d$unload$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePendingTableChangesBeforeUnload"])();
    const handleCloseTab = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useDataPreviewManager.useCallback[handleCloseTab]": async (tabId)=>{
            if (hasPendingChanges(tabId) && !window.confirm(t('DiscardTabChanges'))) {
                return;
            }
            await closeTab(tabId);
            setEditSessions({
                "useDataPreviewManager.useCallback[handleCloseTab]": (current)=>{
                    const next = {
                        ...current
                    };
                    delete next[`${tabId}:data-preview`];
                    return next;
                }
            }["useDataPreviewManager.useCallback[handleCloseTab]"]);
        }
    }["useDataPreviewManager.useCallback[handleCloseTab]"], [
        closeTab,
        hasPendingChanges,
        setEditSessions,
        t
    ]);
    const handleCloseOthers = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useDataPreviewManager.useCallback[handleCloseOthers]": async (tabId)=>{
            const dirtyOtherTabs = tabs.filter({
                "useDataPreviewManager.useCallback[handleCloseOthers].dirtyOtherTabs": (tab)=>tab.tabId !== tabId && hasPendingChanges(tab.tabId)
            }["useDataPreviewManager.useCallback[handleCloseOthers].dirtyOtherTabs"]);
            if (dirtyOtherTabs.length > 0 && !window.confirm(t('DiscardOtherTabChanges', {
                count: dirtyOtherTabs.length
            }))) {
                return;
            }
            await closeOtherTabs(tabId);
            setEditSessions({
                "useDataPreviewManager.useCallback[handleCloseOthers]": (current)=>{
                    const next = {
                        ...current
                    };
                    dirtyOtherTabs.forEach({
                        "useDataPreviewManager.useCallback[handleCloseOthers]": (tab)=>{
                            delete next[`${tab.tabId}:data-preview`];
                        }
                    }["useDataPreviewManager.useCallback[handleCloseOthers]"]);
                    return next;
                }
            }["useDataPreviewManager.useCallback[handleCloseOthers]"]);
        }
    }["useDataPreviewManager.useCallback[handleCloseOthers]"], [
        closeOtherTabs,
        hasPendingChanges,
        setEditSessions,
        t,
        tabs
    ]);
    const handleOpenTableTab = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useDataPreviewManager.useCallback[handleOpenTableTab]": async (payload)=>{
            const { tableName, database, tabLabel } = payload;
            if (!tableName) return;
            const dbName = database || activeDatabase || undefined;
            if (dbName && dbName !== activeDatabase) {
                setActiveDatabase(dbName);
            }
            const existing = tabs.find({
                "useDataPreviewManager.useCallback[handleOpenTableTab].existing": (tab)=>tab.tabType === 'table' && tab.tableName === tableName && (dbName ? tab.databaseName === dbName : true)
            }["useDataPreviewManager.useCallback[handleOpenTableTab].existing"]);
            const target = existing ?? await addTableTab({
                tableName,
                databaseName: dbName,
                tabName: tabLabel ?? tableName
            });
            if (!target) return;
            setActiveTabId(target.tabId);
        }
    }["useDataPreviewManager.useCallback[handleOpenTableTab]"], [
        activeDatabase,
        addTableTab,
        setActiveDatabase,
        setActiveTabId,
        tabs
    ]);
    return {
        handleOpenTableTab,
        handleCloseTab,
        handleCloseOthers
    };
}
_s(useDataPreviewManager, "fkboSZ7gvmmeytdGjMn4ZpYEITE=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$react$2d$client$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTranslations"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jotai$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAtom"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$app$2f28$app$292f5b$organization$5d2f$components$2f$table$2d$browser$2f$components$2f$data$2d$preview$2f$use$2d$pending$2d$table$2d$changes$2d$before$2d$unload$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePendingTableChangesBeforeUnload"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=apps_web_app_%28app%29_%5Borganization%5D_components_1mz5fdl._.js.map