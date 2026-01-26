export class DatasourceError extends Error {
    constructor(
        message: string,
        public cause?: unknown,
    ) {
        super(message);
        this.name = 'DatasourceError';
    }
}

export class UnsupportedTypeError extends DatasourceError {
    constructor(public readonly type: string) {
        super(`Unsupported datasource type: ${type}`);
        this.name = 'UnsupportedTypeError';
    }
}

export class NotInitializedError extends DatasourceError {
    constructor() {
        super('Datasource not initialized');
        this.name = 'NotInitializedError';
    }
}
