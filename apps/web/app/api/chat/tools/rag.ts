import { tool } from 'ai';
import { Pool } from 'pg';
import z from 'zod';
import { translateApi } from '@/app/api/utils/i18n';


const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const EMBED_DIM = Number(process.env.EMBEDDING_DIM ?? 1536);

export const ragSearch = tool({
    description: translateApi('Api.Chat.Tools.Rag.Description'),
    inputSchema: z.object({
        query: z.string().min(1),
        topK: z.number().int().min(1).max(20).default(5),
        tenantId: z.string().default('public'),
    }),
    
    execute: async ({ query, topK, tenantId }) => {
        const qvec = await embedText(query);

        
        const client = await pool.connect();
        try {
            const sql = `
        SELECT id, source, title, url, content, chunk_index,
               1 - (embedding <=> $2::vector) AS score
        FROM rag_documents
        WHERE tenant_id = $1
        ORDER BY embedding <=> $2::vector
        LIMIT $3
      `;
            const params = [tenantId, `[${qvec.join(',')}]`, topK];
            const { rows } = await client.query(sql, params);

            
            return rows.map((r: any) => ({
                id: r.id,
                score: Number(r.score?.toFixed(4) ?? 0),
                title: r.title,
                url: r.url,
                snippet: r.content,
                chunk_index: r.chunk_index,
                source: r.source,
            }));
        } finally {
            client.release();
        }
    },
});


async function embedText(input: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            input,
            model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
        }),
    });
    const json = await res.json();
    const vec = json.data?.[0]?.embedding as number[] | undefined;
    if (!vec || !Array.isArray(vec)) throw new Error('embedding failed');
    return vec;
}
