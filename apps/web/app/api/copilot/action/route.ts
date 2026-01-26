import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { runQuickActionServer } from '@/lib/copilot/action/server/runQuickActionServer';
import type { ActionIntent } from '@/lib/copilot/action/types';
import type { CopilotFixInput } from '@/app/(app)/[team]/[connectionId]/chatbot/copilot/types/copilot-fix-input';
import { getServerLocale } from '@/lib/i18n/server-locale';
import { translate } from '@/lib/i18n/i18n';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';

export const POST = withUserAndTeamHandler(async ({ req }) => {
    const locale = await getServerLocale();
    try {
        const body = (await req.json()) as { intent?: ActionIntent; input?: CopilotFixInput };

        if (!body?.intent || !body?.input) {
            return new NextResponse(translate(locale, 'SqlConsole.Copilot.Errors.InvalidRequest'), { status: 400 });
        }

        const result = await runQuickActionServer(body.intent, body.input, { locale });
        return NextResponse.json(result);
    } catch (e: any) {
        const rawMessage = typeof e?.message === 'string' ? e.message : '';
        const isMissingEnv = rawMessage.includes('DORY_AI_API_KEY') || rawMessage.includes('DORY_AI_URL');
        if (isMissingEnv) {
            return NextResponse.json(
                {
                    code: 'MISSING_AI_ENV',
                    message: translate(locale, 'SqlConsole.Copilot.Errors.MissingAiEnv'),
                },
                { status: 500 },
            );
        }

        const message = rawMessage || translate(locale, 'SqlConsole.Copilot.Errors.InternalError');
        return new NextResponse(message, { status: 500 });
    }
});
