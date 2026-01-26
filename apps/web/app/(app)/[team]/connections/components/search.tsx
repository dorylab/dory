import Fuse, { IFuseOptions } from 'fuse.js';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslations } from 'next-intl';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Search } from '@/components/animate-ui/icons/search';
import { useId, useMemo } from 'react';
import { connectionSearchQueryAtom, connectionsAtom, searchResultAtom } from '../states';

const options: IFuseOptions<any> = {
    keys: ['name', 'host', 'type', 'port', 'username', 'httpPort'],
    threshold: 0.1,
};

export function ConnectionSearch() {
    const t = useTranslations('Connections');
    const connections = useAtomValue(connectionsAtom);
    const id = useId();
    const setSearchResult = useSetAtom(searchResultAtom);
    const [searchQuery, setSearchQuery] = useAtom(connectionSearchQueryAtom);

    const fuse = useMemo(() => new Fuse(connections ?? [], options), [connections]);

    return (
        <div className="*:not-first:mt-2">
            <div className="relative">
                <Input
                    id={id}
                    className="peer ps-9"
                    placeholder={t('Search.placeholder')}
                    type="text"
                    value={searchQuery}
                    onChange={e => {
                        const q = e.target.value ?? '';
                        setSearchQuery(q);
                        const trimmed = q.trim();
                        if (trimmed) {
                            const result = fuse.search(trimmed).map(item => item.item);
                            setSearchResult(result);
                        } else {
                            setSearchResult(connections ?? []);
                        }
                    }}
                />
                <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
                    <Search animateOnHover size={16} />
                </div>
            </div>
        </div>
    );
}
