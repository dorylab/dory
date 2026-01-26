import type { SqlResultCardMode } from './type';

type SqlResultActionStyles = {
    iconBtn: string;
    icon: string;
    srOnly: string;
    textBtn: string;
    menu: string;
};

const GLOBAL_STYLES: SqlResultActionStyles = {
    iconBtn: 'h-7 w-7 p-0 min-w-0 text-muted-foreground hover:text-foreground cursor-pointer',
    icon: 'h-3.5 w-3.5',
    srOnly: 'sr-only',
    textBtn: 'h-7 px-2 text-xs text-muted-foreground hover:text-foreground',
    menu: 'w-44',
};

const COPILOT_STYLES: SqlResultActionStyles = {
    iconBtn: 'h-6 w-6 p-1 min-w-0 text-muted-foreground hover:text-foreground cursor-pointer',
    icon: 'h-[12px] w-[12px]',
    srOnly: GLOBAL_STYLES.srOnly,
    textBtn: GLOBAL_STYLES.textBtn,
    menu: GLOBAL_STYLES.menu,
};

export function getSqlResultActionStyles(mode: SqlResultCardMode = 'global'): SqlResultActionStyles {
    return mode === 'copilot' ? COPILOT_STYLES : GLOBAL_STYLES;
}
