'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BarChart3, ListTree } from 'lucide-react';
import { Button } from '@/registry/new-york-v4/ui/button';

export default function AuditLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isOverview = pathname.includes('/audit/overview');
    const isLogs = pathname.includes('/audit/logs');

    return (
        <div className="flex h-full bg-background">
            {/* --- Left navigation bar ---*/}
            <aside className="w-52 border-r border-border bg-muted/40 flex flex-col">
                <div className="px-4 py-3 font-semibold text-lg">Audit Center</div>

                <nav className="flex-1 space-y-1 px-2">
                    <NavItem href="/audit/overview" icon={<BarChart3 className="h-4 w-4" />} label="Overview" active={isOverview} />
                    <NavItem href="/audit/logs" icon={<ListTree className="h-4 w-4" />} label="Log Explorer" active={isLogs} />
                </nav>

                {/* <div className="p-4 border-t text-xs text-muted-foreground">v1.0 · Dory</div> */}
            </aside>

            {/* --- Content area on the right ---*/}
            <main className="flex-1 overflow-auto">{children}</main>
        </div>
    );
}

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active?: boolean }) {
    return (
        <Link href={href}>
            <Button variant={active ? 'default' : 'ghost'} className={cn('w-full justify-start gap-2 text-sm', active && 'bg-primary text-primary-foreground')}>
                {icon}
                {label}
            </Button>
        </Link>
    );
}
