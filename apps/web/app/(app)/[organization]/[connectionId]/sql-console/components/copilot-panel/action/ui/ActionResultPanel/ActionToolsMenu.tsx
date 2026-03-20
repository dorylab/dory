import { MoreHorizontal } from 'lucide-react';

import { Button } from '@/registry/new-york-v4/ui/button';

type ActionToolsMenuProps = {
  onClick?: () => void;
};

export function ActionToolsMenu({ onClick }: ActionToolsMenuProps) {
  return (
    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClick}>
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  );
}
