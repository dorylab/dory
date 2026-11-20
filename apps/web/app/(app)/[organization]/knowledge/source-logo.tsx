import type { ComponentProps } from 'react';
import { IconBrandGithubFilled } from '@tabler/icons-react';
import { Folder } from 'lucide-react';
import type { Provider } from './document-directory';
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
