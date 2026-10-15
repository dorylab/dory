import { and, eq, sql } from 'drizzle-orm';
import Ajv2020 from 'ajv/dist/2020.js';

import type { PostgresDBClient } from '@dory/shared';
import { knowledgeModels, OSSIE_VERSION, type OssieSemanticModel } from '@dory/database/postgres/schemas';
import { validateOssieDocument, serializeOssieDocument } from './ossie';
// This schema is used only to migrate existing database rows, never for imports.
import legacySchema from './ossie-0.1.1.schema.json' with { type: 'json' };

const validateStoredDocument = new Ajv2020({ allErrors: true, strict: false }).compile<{ version: '0.1.1'; semantic_model: OssieSemanticModel[] }>(legacySchema);

function upgradeStoredDocument(value: unknown) {
    if (!validateStoredDocument(value)) {
        const issue = validateStoredDocument.errors?.[0];
        throw new Error(`Invalid stored Ossie model${issue ? ` at ${issue.instancePath || '/'}: ${issue.message}` : '.'}`);
    }
    if (value.semantic_model.length !== 1) throw new Error('Stored Ossie document must contain exactly one semantic_model.');
    return validateOssieDocument({ version: OSSIE_VERSION, ...value.semantic_model[0] });
}

export async function migrateLegacyOssieModels(db: PostgresDBClient): Promise<number> {
    return db.transaction(async tx => {
        const models = await tx
            .select()
            .from(knowledgeModels)
            .where(sql`${knowledgeModels.modelJson}->>'version' = '0.1.1'`)
            .orderBy(knowledgeModels.id)
            .for('update');
        for (const model of models) {
            try {
                const document = upgradeStoredDocument(model.modelJson);
                await tx
                    .update(knowledgeModels)
                    .set({ modelJson: document, modelYaml: serializeOssieDocument(document), updatedAt: model.updatedAt })
                    .where(and(eq(knowledgeModels.id, model.id), eq(knowledgeModels.organizationId, model.organizationId), eq(knowledgeModels.modelJson, model.modelJson)));
            } catch (cause) {
                throw new Error(`Failed to upgrade Ossie knowledge model ${model.id}; all model upgrades have been rolled back.`, { cause });
            }
        }
        return models.length;
    });
}
