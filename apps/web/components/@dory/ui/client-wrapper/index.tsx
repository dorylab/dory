'use client';
import { useMessages } from 'next-intl';

export function ClientWrapper({ children, locale }: { children: React.ReactNode; locale: string }) {
    const messages = useMessages(); // 在 Client Component 中安全调用

    // 在这里可以使用 messages 进行国际化逻辑

    return <>{children}</>;
}
