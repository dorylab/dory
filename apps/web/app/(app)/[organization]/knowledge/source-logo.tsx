import type { ComponentProps } from 'react';
import { IconBrandGithubFilled } from '@tabler/icons-react';
import { BadgeCheck, Folder, FolderClosed, FolderOpen } from 'lucide-react';
import { QUERY_FOLDER } from '@dory/shared/utils/knowledge-directory';
import type { DocumentFolder, Provider } from './document-directory';
import { LinearLogo } from './linear-logo';

function DriveLogo(props: ComponentProps<'svg'>) {
    return (
        <svg viewBox="0 0 30 26" aria-hidden="true" {...props}>
            <path fill="#34A853" d="M10 0h10L5 26 0 17.3z" />
            <path fill="#FBBC04" d="M10 0h10l10 17.3H20z" />
            <path fill="#4285F4" d="M10 17.3h20L25 26H5z" />
        </svg>
    );
}
const logos = { local: Folder, github: IconBrandGithubFilled, linear: LinearLogo, drive: DriveLogo };

export function SourceLogo({ provider, className }: { provider: Provider; className: string }) {
    const Icon = logos[provider];
    return <Icon aria-hidden="true" className={className} />;
}

export function DirectoryFolderIcon({ folder, open, card, className }: { folder: DocumentFolder; open?: boolean; card?: boolean; className: string }) {
    if (folder.provider) return <SourceLogo provider={folder.provider} className={className} />;
    if (folder.id === QUERY_FOLDER) return <BadgeCheck aria-hidden="true" className={className} />;
    if (card) return <FolderClosed aria-hidden="true" className={`${className} fill-muted-foreground/35`} strokeWidth={1} />;
    const Icon = open ? FolderOpen : Folder;
    return <Icon aria-hidden="true" className={className} />;
}
