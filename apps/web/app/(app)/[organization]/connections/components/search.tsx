import Fuse, { IFuseOptions } from 'fuse.js';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslations } from 'next-intl';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Search } from '@/components/animate-ui/icons/search';
import { useEffect, useId, useMemo } from 'react';
import { connectionEnvironmentFilterAtom, connectionSearchQueryAtom, connectionTagFilterAtom, connectionsAtom, searchResultAtom } from '../states';
import { normalizeConnectionEnvironmentValue, normalizeConnectionTagColorValue } from '../constants';

const options: IFuseOptions<any> = {
    keys: [
        'connection.name',
        'connection.description',
        'connection.host',
        'connection.path',
        'connection.type',
        'connection.engine',
        'connection.database',
        'connection.environment',
        'connection.tags',
        'connection.options',
        'identities.name',
        'identities.username',
        'identities.database',
    ],
    threshold: 0.3,
};

export function ConnectionSearch() {
    const t = useTranslations('Connections');
    const connections = useAtomValue(connectionsAtom);
    const environmentFilters = useAtomValue(connectionEnvironmentFilterAtom);
    const tagFilters = useAtomValue(connectionTagFilterAtom);
    const id = useId();
    const setSearchResult = useSetAtom(searchResultAtom);
    const [searchQuery, setSearchQuery] = useAtom(connectionSearchQueryAtom);

    const fuse = useMemo(() => new Fuse(connections ?? [], options), [connections]);
    const trimmedSearchQuery = searchQuery.trim();

    useEffect(() => {
        const searchMatches = trimmedSearchQuery ? fuse.search(trimmedSearchQuery).map(item => item.item) : (connections ?? []);
        const nextResults = searchMatches.filter(item => {
            const environment = normalizeConnectionEnvironmentValue(item.connection.environment);
            const tag = normalizeConnectionTagColorValue(item.connection.tags);
            const matchesEnvironment = environmentFilters.length === 0 || environmentFilters.includes(environment);
            const matchesTag = tagFilters.length === 0 || tagFilters.includes(tag);
            return matchesEnvironment && matchesTag;
        });

        setSearchResult(nextResults);
    }, [connections, environmentFilters, fuse, setSearchResult, tagFilters, trimmedSearchQuery]);

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
                    }}
                />
                <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
                    <Search animateOnHover size={16} />
                </div>
            </div>
        </div>
    );
}
