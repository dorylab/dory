/**
 * Usage: tsx scripts/ingest.ts ./docs/myfile.md
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

const DB_URL = process.env.DATABASE_URL!;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';
const EMBED_DIM = Number(process.env.EMBEDDING_DIM ?? 1536);
const OPENAI_KEY = process.env.OPENAI_API_KEY!;

function chunkText(text: string, chunkSize = 800, overlap = 100) {
    const out: string[] = [];
    let i = 0;
    while (i < text.length) {
        out.push(text.slice(i, i + chunkSize));
        i += chunkSize - overlap;
    }
    return out.map(s => s.trim()).filter(Boolean);
}

async function embedBatch(chunks: string[]): Promise<number[][]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${OPENAI_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: chunks, model: EMBEDDING_MODEL }),
    });
    const json = await res.json();
    return json.data.map((d: any) => d.embedding as number[]);
}

async function main() {
    const file = process.argv[2];
    if (!file) throw new Error('Pass a file path');

    const abs = path.resolve(file);
    const raw = await fs.readFile(abs, 'utf8');
    const title = path.basename(abs);
    const chunks = chunkText(raw);

    const pool = new Pool({ connectionString: DB_URL });
    const client = await pool.connect();

    try {
        console.log(`Embedding ${chunks.length} chunks...`);
        const batchSize = 64;
        let idx = 0;
        let chunkIndex = 0;

        while (idx < chunks.length) {
            const slice = chunks.slice(idx, idx + batchSize);
            const embs = await embedBatch(slice);

            const valuesSql = embs
                .map(
                    (_, i) => `($1, $2, $3, $4, $5, $6, $${7 + i})`, // tenant, source, title, url, content, chunk_index, embedding
                )
                .join(',');

            // pgvector expects vectors in the '[x,y,...]' format
            const embeddingParams = embs.map(v => `[${v.join(',')}]`);

            const params: any[] = [
                'public', // tenant_id
                'local-file', // source
                title, // title
                null, // url
                null, // content (placeholder, inserted per row)
                null, // chunk_index (placeholder, inserted per row)
                ...embeddingParams, // embedding
            ];

            // Insert row-by-row to include content/chunk_index per row (simple and clear)
            for (let j = 0; j < slice.length; j++) {
                const content = slice[j];
                const emb = embeddingParams[j];
                const sql = `
          INSERT INTO rag_documents (tenant_id, source, title, url, content, chunk_index, embedding)
          VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
        `;
                await client.query(sql, ['public', 'local-file', title, null, content, chunkIndex++, emb]);
            }

            idx += batchSize;
        }

        console.log('✅ Done.');
    } finally {
        client.release();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
