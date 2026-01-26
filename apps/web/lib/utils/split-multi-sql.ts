export function splitMultiSQL(input: string): string[] {
    const out: string[] = [];
    let buf = '';
    let i = 0,
        n = input.length;
    let inS = false,
        inD = false,
        inB = false; // ' " `
    let inLine = false,
        inBlock = false; // --  /* */

    while (i < n) {
        const ch = input[i];
        const next = i + 1 < n ? input[i + 1] : '';

        if (inLine) {
            if (ch === '\n') {
                inLine = false;
                buf += ch;
            } else buf += ch;
            i++;
            continue;
        }
        if (inBlock) {
            if (ch === '*' && next === '/') {
                inBlock = false;
                buf += '*/';
                i += 2;
                continue;
            }
            buf += ch;
            i++;
            continue;
        }

        if (!inS && !inD && !inB) {
            if (ch === '-' && next === '-') {
                inLine = true;
                buf += '--';
                i += 2;
                continue;
            }
            if (ch === '/' && next === '*') {
                inBlock = true;
                buf += '/*';
                i += 2;
                continue;
            }
            if (ch === '#') {
                inLine = true;
                buf += '#';
                i++;
                continue;
            } // MySQL-style line comments
        }

        if (!inD && !inB && ch === "'") {
            inS = !inS;
            buf += ch;
            i++;
            continue;
        }
        if (!inS && !inB && ch === '"') {
            inD = !inD;
            buf += ch;
            i++;
            continue;
        }
        if (!inS && !inD && ch === '`') {
            inB = !inB;
            buf += ch;
            i++;
            continue;
        }

        if (!inS && !inD && !inB && ch === ';') {
            const trimmed = buf.trim();
            if (trimmed) out.push(trimmed);
            buf = '';
            i++;
            continue;
        }

        buf += ch;
        i++;
    }
    const tail = buf.trim();
    if (tail) out.push(tail);
    return out;
}
