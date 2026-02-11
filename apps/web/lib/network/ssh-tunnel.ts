// src/lib/network/ssh-tunnel.ts
import http from 'node:http';
import { translate } from '@/lib/i18n/i18n';
import { Locale, routing } from '@/lib/i18n/routing';

export type SshOptions = {
    enabled?: boolean;
    host?: string | null;
    port?: number | string | null;
    username?: string | null;
    authMethod?: string | null;
    password?: string | null;
    privateKey?: string | null;
    passphrase?: string | null;
    targetHostOverride?: string;
};

class SshHttpAgent extends http.Agent {
    constructor(
        private readonly sshClient: any,
        private readonly targetHost: string,
        private readonly targetPort: number,
    ) {
        super({ keepAlive: true });
    }

    override createConnection(
        options: http.ClientRequestArgs,
        callback?: (err: Error | null, socket?: any) => void,
    ): any {
        this.sshClient.forwardOut(
            options.localAddress ?? '127.0.0.1',
            options.localPort ?? 0,
            this.targetHost,
            this.targetPort,
            (err: Error | null, stream: any) => {
                if (!callback) return;

                if (err) {
                    callback(err);
                    return;
                }

                // ssh2 Channel isn't a net.Socket; add methods expected by http client
                const socket: any = stream;

                if (typeof socket.setTimeout !== 'function') {
                    socket.setTimeout = (_msecs: number, _cb?: () => void) => {
                        // no-op
                        return socket;
                    };
                }

                if (typeof socket.setNoDelay !== 'function') {
                    socket.setNoDelay = (_noDelay?: boolean) => {
                        // no-op
                        return socket;
                    };
                }

                if (typeof socket.setKeepAlive !== 'function') {
                    socket.setKeepAlive = (_enable?: boolean, _initialDelay?: number) => {
                        // no-op
                        return socket;
                    };
                }

                callback(null, socket);
            },
        );

        // Callback-style branch doesn't use return socket; placeholder is fine
        return undefined as unknown as import('stream').Duplex;
    }
}



export interface SshTunnel {
    agent: http.Agent;
    close(): Promise<void>;
}

/**
 * Create an SSH tunnel and return http.Agent + close()
 */
export async function createSshTunnel(
    targetHost: string,
    targetPort: number,
    ssh: SshOptions,
    options?: {
        locale?: Locale;
        messages?: {
            disabled?: string;
            missingHost?: string;
            missingDependency?: string;
            missingPassword?: string;
            missingPrivateKey?: string;
            missingAgent?: string;
        };
    },
): Promise<SshTunnel> {
    const locale = options?.locale ?? routing.defaultLocale;
    if (!ssh.enabled) {
        throw new Error(options?.messages?.disabled ?? translate(locale, 'Utils.SshTunnel.Disabled'));
    }

    if (!ssh.host) {
        throw new Error(options?.messages?.missingHost ?? translate(locale, 'Utils.SshTunnel.MissingHost'));
    }

    const sshModule = await import('ssh2-no-cpu-features').catch(() => null as any);
    if (!sshModule?.Client) {
        throw new Error(options?.messages?.missingDependency ?? translate(locale, 'Utils.SshTunnel.MissingDependency'));
    }

    const { Client } = sshModule as any;
    const client = new Client();

    const connectionOptions: any = {
        host: ssh.host!,
        port: typeof ssh.port === 'string' ? Number(ssh.port) : ssh.port ?? 22,
        username: ssh.username ?? undefined,
        readyTimeout: 15_000,
    };

    const method = ssh.authMethod ?? 'password';
    if (method === 'password') {
        if (!ssh.password) throw new Error(options?.messages?.missingPassword ?? translate(locale, 'Utils.SshTunnel.MissingPassword'));
        connectionOptions.password = ssh.password;
    } else if (method === 'private_key') {
        if (!ssh.privateKey) throw new Error(options?.messages?.missingPrivateKey ?? translate(locale, 'Utils.SshTunnel.MissingPrivateKey'));
        connectionOptions.privateKey = ssh.privateKey;
        if (ssh.passphrase) connectionOptions.passphrase = ssh.passphrase;
    } else if (method === 'agent') {
        const agentSock = process.env.SSH_AUTH_SOCK;
        if (!agentSock) throw new Error(options?.messages?.missingAgent ?? translate(locale, 'Utils.SshTunnel.MissingAgent'));
        connectionOptions.agent = agentSock;
    }

    await new Promise<void>((resolve, reject) => {
        client.once('ready', () => resolve());
        client.once('error', reject);
        client.connect(connectionOptions);
    }).catch(err => {
        client.removeAllListeners();
        client.end();
        throw err;
    });

    const agent = new SshHttpAgent(client, targetHost, targetPort);

    return {
        agent,
        async close() {
            agent.destroy();
            client.removeAllListeners?.();
            client.end();
        },
    };
}
