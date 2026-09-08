import { cn } from '@dory/web-utils';
import type { GeneratedFile } from 'ai';

export type ImageProps = GeneratedFile & {
    className?: string;
    alt?: string;
};

export const Image = ({ base64, mediaType, ...props }: ImageProps) => (
    <img {...props} alt={props.alt} className={cn('h-auto max-w-full overflow-hidden rounded-md', props.className)} src={`data:${mediaType};base64,${base64}`} />
);
