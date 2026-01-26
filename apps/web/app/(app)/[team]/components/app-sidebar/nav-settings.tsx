import { Dialog, DialogTrigger } from '@/registry/new-york-v4/ui/dialog';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/registry/new-york-v4/ui/sidebar';
import { Settings } from 'lucide-react';
import { SettingsModal } from '../../../components/settings/settings';
import { useState } from 'react';

export function SidebarSettingsEntry() {
    const [open, setOpen] = useState(false);
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <SidebarMenu>
                <SidebarMenuItem>
                    <DialogTrigger asChild>
                        <SidebarMenuButton className="w-full justify-start">
                            <Settings className="h-4 w-4" />
                            <span>Settings</span>
                        </SidebarMenuButton>
                    </DialogTrigger>
                </SidebarMenuItem>
            </SidebarMenu>
            <SettingsModal open={open} onOpenChange={setOpen} />
        </Dialog>
    );
}
