import { useEffect, useState } from 'react';

export function useDelayedLoading(loading: boolean, delay = 300) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        let timer: NodeJS.Timeout | null = null;

        if (loading) {
            timer = setTimeout(() => setShow(true), delay);
        } else {
            setShow(false);
        }

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [loading, delay]);

    return show;
}
