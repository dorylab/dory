import path from 'node:path';

export type DesktopDataPaths = {
    root: string;
    database: string;
    artifacts: string;
    demoResources: string;
    localFiles: string;
};

export function resolveDesktopDataPaths(userDataPath: string): DesktopDataPaths {
    const root = path.join(userDataPath, 'data');
    return {
        root,
        database: path.join(root, 'database'),
        artifacts: path.join(root, 'artifacts'),
        demoResources: path.join(root, 'demo-resources'),
        localFiles: path.join(root, 'local-files'),
    };
}
