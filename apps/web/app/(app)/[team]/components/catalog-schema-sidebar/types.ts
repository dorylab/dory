export type TargetOption = {
    label?: string;
    value?: string;
    name?: string;
    [key: string]: unknown;
};

export type GroupState = {
    tables: boolean;
    materializedViews: boolean;
    views: boolean;
};

export type DatabaseObjects = {
    tables: TargetOption[];
    materializedViews: TargetOption[];
    views: TargetOption[];
};

export const DEFAULT_GROUP_STATE: GroupState = {
    tables: false,
    materializedViews: false,
    views: false,
};

export const EMPTY_DATABASE_OBJECTS: DatabaseObjects = {
    tables: [],
    materializedViews: [],
    views: [],
};
