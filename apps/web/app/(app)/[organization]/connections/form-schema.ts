import { z } from 'zod';
import { getConnectionDriver } from './components/forms/connection/drivers';

const requiredPort = z.preprocess(
    value => {
        if (value === '' || value === null || typeof value === 'undefined') return undefined;
        if (typeof value === 'string') return Number(value);
        return value;
    },
    z.number().int().min(1, 'Please provide a port number').max(65535, 'Port must be between 1 and 65535'),
);

export const ConnectionDialogFormSchema = z.object({
    connection: z.object({
        type: z.string().min(1, 'Please select a connection type'),
        name: z.string().min(1, 'Please provide a connection name'),
        description: z.string().optional().nullable(),
        host: z.string().min(1, 'Please provide a host'),
        port: requiredPort,
        httpPort: requiredPort.optional().nullable(),
        ssl: z.boolean().default(false),
        database: z.string().optional().nullable(),
        environment: z.string().optional(),
        tags: z.string().optional(),
    }),
    identity: z.object({
        name: z.string().optional(),
        username: z.string().min(1, 'Please provide a username'),
        role: z.string().optional().nullable(),
        password: z.string().optional().nullable(),
        isDefault: z.boolean().optional(),
    }),
    ssh: z.object({
        enabled: z.boolean().optional(),
        host: z.string().optional().nullable(),
        port: z.number().optional().nullable(),
        username: z.string().optional().nullable(),
        authMethod: z.string().optional().nullable(),
        password: z.string().optional().nullable(),
        privateKey: z.string().optional().nullable(),
        passphrase: z.string().optional().nullable(),
    }),
}).superRefine((value, ctx) => {
    const driver = getConnectionDriver(value.connection.type);
    driver.validate(value.connection, ctx);
});
