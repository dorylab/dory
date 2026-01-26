// chat/copilot/copilot-envelope.ts

import { CopilotContextSQL, CopilotContextTable } from "./copilot-context-types";



export type CopilotSurface = 'sql' | 'table';

export type CopilotEnvelopeV1 =
    | {
          version: 1;
          surface: 'sql';
          updatedAt?: number;
          meta?: CopilotEnvelopeMeta;
          context: CopilotContextSQL;
      }
    | {
          version: 1;
          surface: 'table';
          updatedAt?: number;
          meta?: CopilotEnvelopeMeta;
          context: CopilotContextTable;
      };

export type CopilotEnvelope = CopilotEnvelopeV1;

export type CreateCopilotEnvelopeInput =
    | {
          surface: 'sql';
          updatedAt?: number;
          meta?: CopilotEnvelopeMeta;
          context: CopilotContextSQL;
      }
    | {
          surface: 'table';
          updatedAt?: number;
          meta?: CopilotEnvelopeMeta;
          context: CopilotContextTable;
      };


export type CopilotEnvelopeMeta = {
    tabId?: string;
    tabName?: string;

    connectionId?: string;

    
    catalog?: string;
};
