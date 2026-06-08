import type React from 'react';

export default function WorkDetailLayout({
    children,
    workspace,
}: {
    children: React.ReactNode;
    workspace: React.ReactNode;
}) {
    return (
        <>
            {children}
            {workspace}
        </>
    );
}
