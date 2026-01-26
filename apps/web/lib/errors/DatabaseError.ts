export class DatabaseError extends Error {
    public code: number;

    constructor(message: string, code = 500) {
        super(message);
        this.code = code;
        this.name = 'DatabaseError';
    }
}
