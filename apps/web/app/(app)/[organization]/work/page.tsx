import { Search } from '@/components/animate-ui/icons/search';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';

export default function WorkPage() {
    return (
        <div className="bg-n8 h-screen overflow-auto">
            <div className="container mx-auto mt-10 p-12 lg:p-12 xl:p-8 2xl:p-4">
                <header className="mb-6">
                    <h1 className="mb-2 text-2xl font-bold">Works</h1>
                </header>

                <div className="relative mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        <WorkSearch />
                    </div>
                    <Button className="cursor-pointer">Add Work</Button>
                </div>
            </div>
        </div>
    );
}

function WorkSearch() {
    return (
        <div className="*:not-first:mt-2">
            <div className="relative">
                <Input className="peer ps-9" placeholder="Search Works" type="text" />
                <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
                    <Search animateOnHover size={16} />
                </div>
            </div>
        </div>
    );
}
