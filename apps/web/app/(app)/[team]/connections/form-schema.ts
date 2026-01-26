import { z } from "zod";

export const ConnectionDialogFormSchema = z.object({
    connection: z.object({
        type: z.string().min(1, 'Please select a connection type'),
        name: z.string().min(1, 'Please provide a connection name'),
        description: z.string().optional().nullable(),
        host: z.string().min(1, 'Please provide a host'),
        port: z.number().min(1, 'Please provide a port number'),
        httpPort: z.number().optional(),
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
});
