'use client';

import { toast } from "sonner";
import { SWRConfig } from "swr";

export default function SWRConfigWrapper({ children }: { children: React.ReactNode }) {
    return (
        <SWRConfig
            value={{
                onError: (error) => {
                    console.log(error);
                    if (error.status !== 403 && error.status !== 404) {
                        // 我们可以把错误发送给 Sentry，
                        // 或显示一个通知 UI。
                        toast.error(error.message)
                    }
                    toast.error(error.message)
                },
            }}
        >
            {children}
        </SWRConfig>
    );
}