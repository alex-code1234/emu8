'use strict';

function Parser(emit) {
    let text, index, look, token, pb_idx;
    const getch = () => look = text.charAt(index++),
    peekch = () => text.charAt(index),
    error = s => { throw new Error(`error: ${s}`); },
    alpha = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'),
    digit = c => c >= '0' && c <= '9',
    alphanum = c => alpha(c) || digit(c),
    space = c => c === ' ' || c === '\t' || c === '\r' || c === '\n',
    spskip = () => { while (space(look)) getch(); },
    expect = s => error(`expected ${s}`),
    match = x => {
        if (look !== x) expect(x);
        getch(); spskip();
    },
    name = () => {
        if (!alpha(look)) expect('name');
        token = ''; pb_idx = index - 1;
        while (alphanum(look)) { token += look; getch(); }
        spskip();
    },
    num = () => {
        if (!digit(look)) expect('integer');
        token = ''; pb_idx = index - 1;
        while (digit(look)) { token += look; getch(); }
        spskip();
    },
    pushback = () => { index = pb_idx; getch(); },
    // <id>   ::= <name> [ '[' <expr> ']' ]
    // <exp5> ::= '(' <expr> ')' | <number> | <id>
    // <exp4> ::= '~' <exp4> | <exp5> | '&' <exp4> | '*' <exp4>
    // <exp3> ::= <exp4> [ '+' <exp4> | '-' <exp4> ]*
    // <exp2> ::= <exp3> [ '<<' <exp3> | '>>' <exp3> ]*
    // <exp1> ::= <exp2> [ '==' <exp2> | '!=' <exp2> | '>' <exp2> | '<' <exp2> | '>=' <exp2> | '<=' <exp2> ]*
    // <expr> ::= <exp1> [ '&' <exp1> | '|' <exp1> | '^' <exp1> ]*
    id = (key, type) => {
        name();
        const nm = token;
        emit(key, (type !== undefined) ? [nm, type] : nm);
        if (look === '[') {
            match('['); expr(); match(']');
            if (type !== undefined) emit('len', nm);
            else emit('idx');
        }
    },
    exp5 = () => {
        if (look === '(') { match('('); expr(); match(')'); }
        else if (digit(look)) { num(); emit('num', token); }
        else id('var');
    },
    exp4 = () => {
        if (look === '~') { match('~'); exp4(); emit('inv'); }
        else if (look === '&') { match('&'); exp4(); emit('adr'); }
        else if (look === '*') { match('*'); exp4(); emit('ref'); }
        else exp5();
    },
    exp3 = () => {
        exp4();
        while (look === '+' || look === '-')
            if (look === '+') { match('+'); exp4(); emit('add'); }
            else { match('-'); exp4(); emit('sub'); }
    },
    exp2 = () => {
        exp3();
        while (look === '<' || look === '>') {
            const tmp = peekch();
            if (look === '<' && tmp === '<') { match('<'); match('<'); exp3(); emit('shl'); }
            else if (look === '>' && tmp === '>') { match('>'); match('>'); exp3(); emit('shr'); }
            else break;
        }
    },
    exp1 = () => {
        exp2();
        while (look === '=' || look === '!' || look === '>' || look === '<') {
            const tmp = peekch();
            if (look === '=' && tmp === '=') { match('='); match('='); exp2(); emit('eql'); }
            else if (look === '!' && tmp === '=') { match('!'); match('='); exp2(); emit('neq'); }
            else if (look === '>' && tmp === '=') { match('>'); match('='); exp2(); emit('gre'); }
            else if (look === '<' && tmp === '=') { match('<'); match('='); exp2(); emit('lse'); }
            else if (look === '>') { match('>'); exp2(); emit('grt'); }
            else if (look === '<') { match('<'); exp2(); emit('lst'); }
            else break;
        }
    },
    expr = () => {
        exp1();
        while (look === '&' || look === '|' || look === '^')
            if (look === '^') { match('^'); exp1(); emit('xor'); }
            else if (look === '&') { match('&'); exp1(); emit('and'); }
            else { match('|'); exp1(); emit('oro'); }
    },
    // <decl> ::= 'byte' | 'word' <id> [ ',' <id> ]* ;
    // <asgn> ::= [ '*' ] <id> '=' <expr> ;
    parse = prg => {
        text = prg; index = 0; token = ''; pb_idx = 0;
        getch(); spskip();
        let param;
        while (look !== '') {
            if (look === '*') { match('*'); param = 1; }
            else param = 0;
            name();
            if (token === 'byte' || token === 'word') {
                const typ = (token === 'byte') ? 0 : 1;
                id('vdc', typ); while (look === ',') { match(','); id('vdc', typ); } match(';');
            } else {
                pushback();
                id('var');
                if (look === '=') { match('='); expr(); match(';'); emit('asg', param); }
                else expect('declaration or assignment');
            }
        }
    };
    return {parse};
}

function IL() {
    let o1, o2, tripleNum, vars = {};
    const stack = [], triples = [],
    calc = id => {
        switch (id) {
            case 'inv': o1 = ~o1; break;
            case 'add': o1 += o2; break;      case 'sub': o1 -= o2; break;
            case 'shl': o1 <<= o2; break;     case 'shr': o1 >>= o2; break;
            case 'eql': o1 = o1 == o2; break; case 'neq': o1 = o1 != o2; break;
            case 'grt': o1 = o1 > o2; break;  case 'lst': o1 = o1 < o2; break;
            case 'gre': o1 = o1 >= o2; break;  case 'lse': o1 = o1 <= o2; break;
            case 'xor': o1 ^= o2; break;      case 'and': o1 &= o2; break;
            case 'oro': o1 |= o2; break;
            default: throw new Error(`unknown id: ${id}`);
        }
        stack.push(['num', o1]);
    },
    findtrp = adr => {
        for (let i = triples.length - 1; i >= 0; i--) {
            const trp = triples[i];
            if (trp.adr === adr) return trp;
        }
        throw new Error(`TAC not found: ${adr}`);
    },
    typW = (typ, val) => {
        if (typ === null || typ === undefined || val === null || val === undefined) return false;
        if ('num var trp'.indexOf(typ) < 0) throw new Error(`unknown operand type: ${typ}`);
        return (typ === 'num' && (val < -128 || val > 255)) || // word number
                (typ === 'var' && vars[val].typ === 1) ||      // word variable
                (typ === 'trp' && findtrp(val).typ === 1);     // word triplet
    },
    rentrp = (trp, oldadr, newtyp, newadr) => {
        let changed = false;
        if (trp.typ1 === 'trp' && trp.val1 === oldadr) { trp.typ1 = newtyp; trp.val1 = newadr; changed = true; }
        if (trp.typ2 === 'trp' && trp.val2 === oldadr) { trp.typ2 = newtyp; trp.val2 = newadr; changed = true; }
        if (changed && !trp.ref) // update triplet type if not de-reference assignment
            trp.typ = (typW(trp.typ1, trp.val1) || typW(trp.typ2, trp.val2)) ? 1 : 0;
    },
    create = (typ1, val1, oper, typ2 = null, val2 = null, push = true) => {
        const typ = (typW(typ1, val1) || typW(typ2, val2) || oper === 'adr') ? 1 : 0,
              trp = {'adr': `:${tripleNum++}`, typ1, val1, oper, typ2, val2, typ};
        if (oper === 'ref') trp.typ = 0; // de-reference is always byte
        if (push) triples.push(trp);
        return trp;
    },
    gen = (id, two) => {
        const triple = [o1[0], o1[1], id];
        if (two) triple.push(o2[0], o2[1]);
        const trp = create(...triple);
        stack.push(['trp', trp.adr]);
    },
    rename = (start, oldadr, newtyp, newadr) => {
        for (let i = start, n = triples.length; i < n; i++)
            rentrp(triples[i], oldadr, newtyp, newadr);
    },
    arith = () => {
        let i = 0;
        while (i < triples.length) {           // all triples
            const t = triples[i];              // current
            switch (t.oper) {
                case 'add':                    // +3 +2 +1 +0 optimization
                    if ((t.typ1 === 'num' && t.val1 > 0) || (t.typ2 === 'num' && t.val2 > 0)) {
                        const nm = (t.typ1 === 'num') ? t.val1 : t.val2,
                              mx = (t.typ === 1) ? 3 : 2;
                        if (nm > mx) break;
                        t.oper = 'inc';
                        if (t.typ1 === 'num') { t.typ1 = t.typ2; t.val1 = t.val2; }
                        t.typ2 = undefined; t.val2 = (nm === 1) ? undefined : nm;
                    }
                    else if ((t.typ1 === 'num' && t.val1 === 0) || (t.typ2 === 'num' && t.val2 === 0)) {
                        const adr = (t.typ1 === 'num') ? t.val2 : t.val1,
                              typ = (t.typ1 === 'num') ? t.typ2 : t.typ1;
                        triples.splice(i, 1);  // remove +0 triplet
                        rename(i, t.adr, typ, adr);
                        continue;
                    }
                    break;
                case 'sub':                    // -3 -2 -1 -0 optimization
                    if (t.typ2 === 'num' && t.val2 > 0) {
                        const mxd = (t.typ === 1) ? 3 : 2;
                        if (t.val2 > mxd) break;
                        t.oper = 'dec';
                        t.typ2 = undefined; if (t.val2 === 1) t.val2 = undefined;
                    }
                    else if (t.typ2 === 'num' && t.val2 === 0) {
                        triples.splice(i, 1);  // remove -0 triplet
                        rename(i, t.adr, t.typ1, t.val1);
                        continue;
                    }
                    break;
                case 'asg':                    // var = var optimization
                    if (t.typ2 === 'var' && t.val2 === t.val1) {
                        triples.splice(i, 1);  // remove var = var triplet
                        continue;
                    }
                    break;
            }
            i++;
        }
    },
    dedupe = () => {
        let result = false;
        for (let i = 0; i < triples.length; i++) {                    // all triples
            const t1 = triples[i];                                    // current
            if (t1.oper === 'asg') continue;                          // skip assignments
      loop: for (let j = i + 1; j < triples.length; j++) {            // find duplicate after current
                const t2 = triples[j];                                // candidate
                if (t1.typ1 === t2.typ1 && t1.val1 === t2.val1 &&
                        t1.oper === t2.oper &&
                        t1.typ2 === t2.typ2 && t1.val2 === t2.val2) {
                    triples.splice(j, 1); result = true;              // remove duplicate
                    for (let k = j, n = triples.length; k < n; k++) { // replace removed with current
                        const t3 = triples[k];
                        if (t3.adr === t2.adr) break loop;            // removed re-assigned, stop replace
                        rentrp(t3, t2.adr, 'trp', t1.adr);
                    }
                }
            }
        }
        return result;
    },
    optim = () => {       // constant folding already done
        arith();          // expressions simplification
        while (dedupe()); // duplicate code elimination
    },
    init = () => { stack.length = 0; triples.length = 0; tripleNum = 0; vars = {}; },
    code = () => {
        if (stack.length > 0) throw new Error('unbalanced expression');
        optim();
        return [triples, vars];
    },
    emit = (id, value) => {
        let expr;
        switch (id) {
            case 'var':
                if (vars[value] === undefined) throw new Error(`undeclared var: ${value}`);
                stack.push([id, value]);
                break;
            case 'vdc':
                if (vars[value[0]] !== undefined) throw new Error(`duplicate var: ${value[0]}`);
                vars[value[0]] = {'typ': value[1], 'val': null};
                break;
            case 'num': stack.push([id, value | 0]); break;
            case 'inv':
                o1 = stack.pop();
                if (o1[0] === 'num') { o1 = o1[1]; calc(id); return; }
                gen(id, false);
                break;
            case 'add': case 'sub':
            case 'shl': case 'shr':
            case 'eql': case 'neq': case 'grt': case 'lst': case 'gre': case 'lse':
            case 'xor': case 'and': case 'oro':
                o2 = stack.pop(); o1 = stack.pop();
                if (o1[0] === 'num' && o2[0] === 'num') { o1 = o1[1]; o2 = o2[1]; calc(id); return; }
                gen(id, true);
                break;
            case 'asg':
                o2 = stack.pop(); o1 = stack.pop();
                if (o1[0] === 'trp' && value === 0)        // assignment to index var
                    findtrp(o1[1]).adrOnly = true;         // prevent getting var value
                const trp = create(...o1, id, ...o2);      // don't push assignment to stack
                if (value !== 0) {                         // assignment to de-reference
                    trp.ref = true;
                    trp.typ = 0;                           // de-reference is always byte
                }
                break;
            case 'idx':
                o2 = stack.pop();
                if (o2[0] === 'num' && o2[1] === 0) break; // ignore 0 index
                o1 = stack.pop();
                if (vars[o1[1]].dim === undefined) throw new Error(`not indexed var: ${o1[1]}`);
                gen(id, true);
                break;
            case 'len':
                expr = stack.pop();
                if (expr[0] !== 'num') throw new Error(`expected dimension: ${value}`);
                vars[value].dim = expr[1];
                break;
            case 'adr':
                o1 = stack.pop();
                if (o1[0] === 'trp') {                     // indexed variable
                    const idx = findtrp(o1[1]);
                    idx.adrOnly = true; idx.noSave = true;
                }
                gen(id, false);
                break;
            case 'ref':
                o1 = stack.pop();
                gen(id, false);
                break;
            default: throw new Error(`unknown id: ${id}`);
        }
    };
    return {init, code, emit};
}

function Codec8080() {
    const regs = {'A': null, 'B': null, 'C': null, 'D': null, 'E': null, 'H': null, 'L': null, 'S': null},
          acc = 'A', mem = 'HL', work = 'BCD', ref = 'M', prm = 'E',
    pair = reg => (reg === 'B') ? 'C' : (reg === 'D') ? 'E' : 'L',
    move = (dest, src) => { if (dest !== 'M') regs[dest] = (src === 'M') ? regs['L'].substring(1) : regs[src];
                                                    return `        MOV  ${dest}, ${src}\n`; },
    movi = (dest, val) => { if (dest !== 'M') regs[dest] = val;
                                                    return `        MVI  ${dest}, ${val}\n`; },
    loada = val => { regs['A'] = val;               return `        LDA  ${val}\n`; },
    loadr = (reg, val) => { regs[reg] = `${val}_`; regs[pair(reg)] = `_${val}`;
                                                    return `        LXI  ${reg}, ${val}\n`; },
    savea = val =>                                         `        STA  ${val}\n`,
    callp = val =>                                         `        CALL ${val}\n`,
    invra = trp => { regs['A'] = trp.adr;           return '        CMA\n'; },
    incr = (reg, trp) => { if (reg !== 'M') regs[reg] = trp.adr;
                                                    return `        INR  ${reg}\n`; },
    adi = (val, trp) => { regs['A'] = trp.adr;      return `        ADI  ${val}\n`; },
    add = (reg, trp) => { regs['A'] = trp.adr;      return `        ADD  ${reg}\n`; },
    sui = (val, trp) => { regs['A'] = trp.adr;      return `        SUI  ${val}\n`; },
    sub = (reg, trp) => { regs['A'] = trp.adr;      return `        SUB  ${reg}\n`; },
    xri = (val, trp) => { regs['A'] = trp.adr;      return `        XRI  ${val}\n`; },
    xra = (reg, trp) => { regs['A'] = trp.adr;      return `        XRA  ${reg}\n`; },
    ani = (val, trp) => { regs['A'] = trp.adr;      return `        ANI  ${val}\n`; },
    ana = (reg, trp) => { regs['A'] = trp.adr;      return `        ANA  ${reg}\n`; },
    ori = (val, trp) => { regs['A'] = trp.adr;      return `        ORI  ${val}\n`; },
    ora = (reg, trp) => { regs['A'] = trp.adr;      return `        ORA  ${reg}\n`; },
    cpi = val =>                                           `        CPI  ${val}\n`,
    cmp = reg =>                                           `        CMP  ${reg}\n`,
    ral = trp => { regs['A'] = trp.adr;             return '        RAL\n'; },
    rar = trp => { regs['A'] = trp.adr;             return '        RAR\n'; },
    jz = val =>                                            `        JZ   ${val}\n`,
    jnz = val =>                                           `        JNZ  ${val}\n`,
    jc = val =>                                            `        JC   ${val}\n`,
    jnc = val =>                                           `        JNC  ${val}\n`,
    decr = (reg, trp) => { if (reg !== 'M') regs[reg] = trp.adr;
                                                    return `        DCR  ${reg}\n`; },
    stax = reg =>                                          `        STAX ${reg}\n`,
    shl = `
@SHLF:  DCR  E
        RM
        ORA  A
        RZ
        RAL
        JMP  @SHLF`,
    shr = `
@SHRF:  DCR  E
        RM
        ORA  A
        RZ
        RAR
        JMP  @SHRF`,
    peephole = base => {
        // MOV  ?, A   begin
        //    ---
        // MOV  A, ?   match, remove if A and ? not changed
        base.phopt('MOV  A, (.)$', cnd => `MOV  ${cnd}, A`, cnd => {
            const pattern = [
                `MOV  [A${cnd}], `, `MVI  [A${cnd}], `, 'LDA  ', 'CALL ', 'CMA', `INR  [A${cnd}]`, `DCR  [A${cnd}]`,
                'ADI  ', 'ADD  ', 'SUI  ', 'SUB  ', 'XRI  ', 'XRA  ', 'ANI  ', 'ANA  ', 'ORI  ', 'ORA  ', 'RAL', 'RAR'
            ];
            if (cnd === 'M') pattern.push('LXI  H, ', 'INX  H', 'DCX  H', 'DAD  ', 'LHLD ');
            return pattern;
        });
        // MOV  ?, any begin
        //    ---
        // MOV  E, ?   match if ? not M, remove if ? not changed; repl. ? at begin and ren. ? before MOV  ?, . or CALL
        base.phopt('MOV  E, ([^M])$', cnd => `MOV  ${cnd}, `,
                cnd => cnd === 'A' ?
                        ['MOV  A, ', 'STA  ', 'LDA  ', 'MOV  E, ', 'ADI  '] :
                        [`MOV  ${cnd}, `, 'MOV  E, '],
                (lines, start, i, cnd) => {
            lines.splice(i, 1);                                                   // remove match
            lines[start] = lines[start].replace(` ${cnd}, `, ' E, ');             // replace ? at begin
            const regexp = new RegExp(` ${cnd}$`);
            for (let k = start + 1, n = lines.length; k < n; k++) {               // scan from begin + 1 to end
                const line = lines[k];
                if (line.match(`MOV  ${cnd}, |CALL `) !== null) break;            // break if reset ? | CALL
                lines[k] = line.replace(regexp, ' E');                            // rename ?
            }
            return true;
        });
        // MOV  ?, A        begin
        //    ---
        // MOV  ?, any | $  match, remove begin if ? not used
        base.phopt('MOV  ([^HLEM]), A$', cnd => `MOV  ${cnd}, `,
            cnd => [
                `ADI  ${cnd}`, `ADD  ${cnd}`, `SUI  ${cnd}`, `SUB  ${cnd}`, `MOV  ., ${cnd}`,
                `ANA  ${cnd}`, `ORA  ${cnd}`, `XRA  ${cnd}`
            ],
            null, true
        );
        // MOV  A, ?       begin
        //    ---
        // MOV  M | E, A   match, remove begin if only INR or DCR opers in --- and ? not used forward; rename A to ?
        base.phopt('MOV  A, ([^EM])$', cnd => 'MOV  [EM], A$', cnd => ['^\(\(?!DCR  A|INR  A\).\)*$'],
                (lines, start, i, cnd, end) => {
            if (base.chgop(lines, [`MOV  ., ${cnd}`, `[^,]+ ${cnd}$`], end + 1, lines.length - 1, `MOV  ${cnd}, `)[0])
                return false;                                                     // ? used forward, exit
            lines.splice(i, 1);                                                   // remove begin
            const regexp = new RegExp(' A$');
            for (let k = i; k <= end; k++)
                lines[k] = lines[k].replace(regexp, ` ${cnd}`);                   // rename A to ?
            return true;
        }, true);
        // LXI  H, ?   begin
        // MOV  M, A   match, remove if M not used forward; replace begin with STA  ?
        base.phopt('LXI  H, (.+)$', cnd => 'MOV  M, A', cnd => [], (lines, start, i, cnd, end) => {
            if (end !== start + 1) return false;
            if (base.chgop(lines, ['MOV  ., M', '[^,]+ M$'], end + 1, lines.length - 1, 'LXI  H, ')[0])
                return false;                                                     // M used forward, exit
            lines[start] = lines[start].replace('LXI  H, ', 'STA  ');             // replace begin
            lines.splice(end, 1);                                                 // remove match
            return true;
        }, true);
        // type 1 optimizations
        // MOV  ?, A   begin
        //    ---
        // MOV  L, ?   match, remove begin if A and ? not changed; rename ? to A
        base.phopt('MOV  L, (.)$', cnd => `MOV  ${cnd}, A`, cnd => {
            const pattern = [
                `MOV  [A${cnd}], `, `MVI  [A${cnd}], `, 'LDA  ', 'CALL ', 'CMA', `INR  [A${cnd}]`, `DCR  [A${cnd}]`,
                'ADI  ', 'ADD  ', 'SUI  ', 'SUB  ', 'XRI  ', 'XRA  ', 'ANI  ', 'ANA  ', 'ORI  ', 'ORA  ', 'RAL', 'RAR'
            ];
            if (cnd === 'M') pattern.push('LXI  H, ');
            return pattern;
        }, (lines, start, i, cnd) => {
            lines[i] = lines[i].replace(`, ${cnd}`, ', A');                       // rename ? to A
            lines.splice(start, 1);                                               // remove begin
            return true;
        });
        // MVI  H, 0   begin
        // SHLD        first match, remove preceding MVI  H, 0 if H not changed
        base.phopt('SHLD ', cnd => 'MVI  H, 0', cnd => [], (lines, start, i, cnd) => {
            if (i !== start + 1) return false;
            let top, ptrn = ['MVI  H, [^0]', 'MOV  H, ', 'LXI  H, ', 'DAD  ', 'LHLD ', 'INX  H', 'DCX  H'];
            if ((top = base.fndop(lines, start - 1, 'MVI  H, 0')) < 0 ||          // previous not found
                    base.chgop(lines, ptrn, top + 1, start - 1)[0])               // H changed
                return false;
            lines.splice(start, 1);
            // MOV  L, ?   begin
            //    ---
            // MOV  L, ?   second match, remove if ? and L not changed
            // MVI  H, 0
            // SHLD
            let mtch;
            if (start > 0 && (mtch = lines[start - 1].match('MOV  L, (.)$')) !== null) {
                start--; cnd = mtch[1];
                ptrn = [`MOV  L, [^${cnd}]`, 'LXI  H, ', 'DAD  ', 'LHLD ', 'INX  H', 'DCX  H'];
                if (cnd === 'A') ptrn.push(
                    'MOV  A, ', 'MVI  A, ', 'LDA  ', 'CALL ', 'CMA', 'INR  A', 'DCR  A', 'ADI  ', 'ADD  ',
                    'SUI  ', 'SUB  ', 'XRI  ', 'XRA  ', 'ANI  ', 'ANA  ', 'ORI  ', 'ORA  ', 'RAL', 'RAR'
                );
                if ((top = base.fndop(lines, start - 1, `MOV  L, ${cnd}`)) < 0 || // previous not found
                        base.chgop(lines, ptrn, top + 1, start - 1)[0])           // L or ? changed
                    return true;                                                  // apply first match only
                lines.splice(start, 1);                                           // apply second match
            }
            return true;
        });
        // SHLD ?      begin
        //    ---
        // LHLD ?      match, remove if HL not changed
        base.phopt('LHLD (.+)$', cnd => `SHLD ${cnd}`, cnd => [
            'MVI  H, ', 'MOV  H, ', 'MOV  L, ', 'LXI  H, ', 'DAD  ', 'INX  H', 'DCX  H', 'LHLD ', 'XCHG',
            'CALL @SUBW', 'POP  H'
        ]);
        // LXI  H, any begin
        // XCHG        match, remove and rename preceding H to D
        base.phopt('XCHG', cnd => `LXI  H, `, cnd => ['LHLD ', 'LXI  [DH], '], (lines, start, i, cnd) => {
            if (i !== start + 1) return false;
            lines.splice(i, 1);                                                   // remove match
            lines[start] = lines[start].replace('LXI  H, ', 'LXI  D, ');          // rename H at begin
            return true;
        });
        // LDA  ?      begin
        //    ---
        // LDA  ?      match, remove if A and ? not changed
        base.phopt('LDA  (.+)$', cnd => `LDA  ${cnd}`, cnd => [
            'MOV  A, ', 'MVI  A, ', 'CALL ', 'CMA', 'INR  A', 'DCR  A',
            'ADI  ', 'ADD  ', 'SUI  ', 'SUB  ', 'XRI  ', 'XRA  ', 'ANI  ', 'ANA  ', 'ORI  ', 'ORA  ', 'RAL', 'RAR'
        ]);
        // PUSH H      begin
        //    ---
        // POP  H      match, remove begin and match if HL not changed
        base.phopt('POP  H', cnd => 'PUSH H', cnd => [
            'MOV  H, ', 'MOV  L, ', 'XCHG', 'LHLD ', 'POP  D', 'POP  B', 'DAD  ', 'LXI  H, ', 'INX  H', 'DCX  H'
        ], (lines, start, i, cnd) => {
            lines.splice(i, 1);                                                   // remove match
            lines.splice(start, 1);                                               // remove begin
            return true;
        });
        // LXI  H, ?   begin
        //    ---
        // LXI  H, ?   match, remove match if HL not changed
        base.phopt('LXI  H, (.+)$', cnd => `LXI  H, ${cnd}`, cnd => [
            'MOV  H, ', 'MOV  L, ', 'XCHG', 'LHLD ', 'POP  D', 'POP  B', 'DAD  ', 'LXI  H, ', 'INX  H', 'DCX  H'
        ]);
        // MOV  A, M   |- begin
        // MOV  L, A   |
        //    ---
        // SHLD ?      match, replace begin with 'MOV  L, M' if A not used
        base.phopt('SHLD ', cnd => 'MOV  A, M', cnd => [
            'MOV  ., A, ', 'CMA', 'INR  A', 'DCR  A', 'ADI  ', 'ADD  ', 'SUI  ', 'SUB  ',
            'XRI  ', 'XRA  ', 'ANI  ', 'ANA  ', 'ORI  ', 'ORA  ', 'RAL', 'RAR'
        ], (lines, start, i, cnd) => {
            if (lines[start + 1].indexOf('MOV  L, A') >= 0) {
                lines[start + 1] = lines[start + 1].replace(', A', ', M');        // replace
                lines.splice(start, 1);                                           // remove begin
                return true;
            }
            return false;                                                         // no match
        });
    },
          accW = 'HL', workW = 'DE', savW = 'S',
    addW = (reg, trp) => { regs['H'] = `${trp.adr}_`; regs['L'] = `_${trp.adr}`; return `        DAD  ${reg}\n`; },
    incrW = (reg, trp) => { regs[reg] = `${trp.adr}_`; regs[pair(reg)] = `_${trp.adr}`;
                                                                                 return `        INX  ${reg}\n`; },
    decrW = (reg, trp) => { regs[reg] = `${trp.adr}_`; regs[pair(reg)] = `_${trp.adr}`;
                                                                                 return `        DCX  ${reg}\n`; },
    loadaW = val => { regs['H'] = `${val}_`; regs['L'] = `_${val}`;              return `        LHLD ${val}\n`; },
    saveaW = val =>                                                                     `        SHLD ${val}\n`,
    swapW = () => { const h = regs['H'], l = regs['L']; regs['H'] = regs['D']; regs['L'] = regs['E'];
        regs['D'] = h; regs['E'] = l;                                            return '        XCHG\n'; },
    saveW = () => { regs['S'] = `${regs['H']}|${regs['L']}`;                     return '        PUSH H\n'; },
    restW = reg => { const tmp = regs['S'].split('|'); regs['S'] = null;
        regs[reg] = tmp[0]; regs[pair(reg)] = tmp[1];                            return `        POP  ${reg}\n`; },
    saveWr = reg => { regs['S'] = `${regs[reg]}|${regs[pair(reg)]}`;             return `        PUSH ${reg}\n`; },
    swapS = () => { const tmp = regs['S'].split('|'); regs['S'] = `${regs['H']}|${regs['L']}`;
        regs['H'] = tmp[0]; regs['L'] = tmp[1];                                  return '        XTHL\n'; },
    subW = `
@SUBW:  MOV  A, L
        SUB  E
        MOV  L, A
        MOV  A, H
        SBB  D
        MOV  H, A
        RET`;
    return {
        regs, acc, mem, work, ref, prm, move, movi, loada, loadr, savea, callp, invra, incr, adi, add,
        sui, sub, xri, xra, ani, ana, ori, ora, cpi, cmp, ral, rar, jz, jnz, jc, jnc, decr, stax, shl, shr,
        peephole,
        accW, workW, savW, addW, incrW, decrW, loadaW, saveaW, swapW, saveW, restW, saveWr, subW,
        lib: ['@SHLF', shl, '@SHRF', shr, '@SUBW', subW]
    };
}

function showTrp(trp) {
    const opt = (v, l) => (v ? v.toString() : '_').padEnd(l, '_');
    return `${opt(trp.adr, 3)} ${opt(trp.val1, 3)} ${trp.oper} ${opt(trp.val2, 3)} ` +
            `${trp.typ} ${opt(trp.adrOnly, 4)} ${opt(trp.noSave, 4)} ${opt(trp.ref, 4)}\n`;
}

function CodeGen(codec) {
    let triples,                                               // 3-address code
        vars,                                                  // variables - var: typ=0|1
        code;                                                  // generated assembly
    const regs = codec.regs,                                   // regs - reg: var|num|:adr
    fndop = (lines, start, s) => {                             // find operation before current
        for (let i = start; i >= 0; i--)
            if (lines[i].match(s) !== null) return i;
        return -1;
    },
    chgop = (lines, pattern, start, end, br = null) => {       // check if register changed
        let i;
        for (i = start; i <= end; i++) {
            const line = lines[i];
            if (br !== null && line.match(br) !== null) break;
            for (let j = 0, n = pattern.length; j < n; j++)
                if (line.match(pattern[j]) !== null) return [true, i];
        }
        return [false, i];
    },
    phopt = (match, begin, ptrn, fnc = null, fw = false) => {  // peephole register optimization
        const lines = code.split('\n');
        let i = 0, changed = false;
        while (i < lines.length) {
            let oper = lines[i],
                idx = oper.match(match), start, st, ed, bg;
            if (idx !== null && idx.length > 0) {
                const cnd = idx[1],
                      bgn = begin(cnd),
                      ptr = ptrn(cnd);
                if (fw) {
                    st = i + 1; ed = lines.length - 1; bg = bgn;
                } else {
                    start = fndop(lines, i - 1, bgn);
                    st = start + 1; ed = i - 1; bg = null;
                }
                if (fw || start >= 0) {
                    const [res, lid] = chgop(lines, ptr, st, ed, bg);
                    if (!res)
                        if (fnc === null) {
                            lines.splice(i, 1);
                            changed = true; continue;
                        }                                      // fnc - lines, begin (fw: match), match, reg, fw: begin
                        else if (fnc(lines, st - 1, i, cnd, lid)) {
                            changed = true; continue;
                        }
                }
            }
            i++;
        }
        if (changed) code = lines.join('\n');
    },
    loc = (typ, val) => {                                      // get operand location
        const varval = valtype(val) === 'var';                 // val is variable
        let lc = '';
        for (const r in regs) {
            let rval = regs[r];
            if (varval && rval !== null && valtype(rval) === 'trp') { // try to substitute trp with var
                if (rval.indexOf('|') > 0) rval = getW(...rval.split('|'));
                else if (rval.endsWith('_')) rval = rval.substring(0, rval.length - 1);
                else if (rval.startsWith('_')) rval = rval.substring(1);
                const id = fndtrp(rval);                       // find triplet by reg value
                let tt = triples[id];
                if (tt.oper !== 'asg') tt = triples[id + 1];   // not assignment, try next triplet
                if (tt.oper === 'asg' && tt.val2 === rval)     // found
                    rval = tt.val1;                            // replace with var
            }
            if (rval === val) lc += r;                         // exact match
            else if (typ === 0) {                              // byte operation
                if (r === codec.mem.charAt(0) && rval === `${val}_` &&
                        regs[codec.mem.charAt(1)] === `_${val}`)
                    lc += codec.ref;                           // memory reference
                else if (r === codec.workW.charAt(0) && rval === `${val}_` &&
                        regs[codec.workW.charAt(1)] === `_${val}`)
                    lc += codec.workW.charAt(1);               // low byte of working register
            }
            else if (rval === `${val}_` || rval === `_${val}` || rval === `${val}_|_${val}`) lc += r;
        }
        if (typ === 1) {                                       // word operation
            // L - byte, H - 0 => HL - extended byte
            const idx = lc.indexOf(codec.accW.charAt(1));      // accW lo
            if (idx >= 0 && lc.indexOf(codec.accW) < 0 && regs[codec.accW.charAt(0)] === 0)
                lc = lc.substring(0, idx) + codec.accW.charAt(0) + lc.substring(idx);
        }
        return (lc.length > 0) ? lc : null;
    },
    inreg = (lc, reg) => lc !== null && lc.indexOf(reg) >= 0,  // check if reg in location
    swap = trp => {                                            // swap operands
        const typ = trp.typ1, val = trp.val1;
        trp.typ1 = trp.typ2; trp.val1 = trp.val2;
        trp.typ2 = typ; trp.val2 = val;
    },
    fndtrp = adr => {                                          // find triplet index
        let idx = 0;
        while (triples[idx].adr !== adr) idx++;
        return idx;
    },
    used = (adr, val, start = 1, beforeAsg = 0,                // any asg - 1, val asg - 2
            fnc = t => t.oper !== 'asg' && t.oper !== 'idx',   // exclude operations
            sec = true                                         // check typ2 and val2
    ) => {                                                     // find operand ref forward
        if (beforeAsg === 0 && valtype(val) === 'var')         // if default parm and var
            beforeAsg = 2;                                     // check before reassignment
        let idx = fndtrp(adr), cnt = 0, t;
        const n = triples.length;
        idx += start;                                          // starting from next triplet by default
        while (idx < n) {
            t = triples[idx++];
            if (beforeAsg === 1 && t.oper === 'asg') break;    // check only current assignment
            if (beforeAsg === 2 && t.oper === 'asg' && t.val1 === val) break; // check only val assignment
            if ((fnc(t) && t.val1 === val) || (sec && t.val2 === val)) cnt++;
        }
        return cnt;
    },
    valtype = val => {                                         // get type of value
        val = val.toString();
        let chr = val.charAt(0); if (chr === '_') chr = val.charAt(1);
        return (chr === ':') ? 'trp' : (chr >= '0' && chr <= '9') ? 'num' : 'var';
    },
    rgwork = (adr, rgs) => {                                   // get best secondary register
        let res = null;
        for (let i = 0, n = rgs.length; i < n; i++) {
            const name = rgs.charAt(i), rg = regs[name];
            if (rg === null) return name;                      // free
            let usg = used(adr, rg);
            if (usg === 0) return name;                        // not used
            const typ = valtype(rg);
            if (typ === 'trp') continue;                       // triplet must be saved
            if (typ === 'var') usg += 1000;                    // prefer to keep variables
            if (res === null) res = [name, usg];
            else if (res[1] > usg) { res[0] = name; res[1] = usg; }
        }
        if (res === null) throw new Error('no working registers');
        return res[0];
    },
    save = (adr, start) => {                                   // save accumulator (start - starting triplet to check)
        const acc = regs[codec.acc];
        if (acc !== null && used(adr, acc, start) > 0 && loc(0, acc).length < 2) {
            const slc = rgwork(adr, codec.work);
            code += codec.move(slc, codec.acc);
        }
    },
    load1 = (trp, canswap, start = 1) => {                     // load primary operand
        const lc = loc(0, trp.val1);
        if (inreg(lc, codec.acc)) return false;                // already loaded
        if (canswap && trp.typ2 !== null && inreg(loc(0, trp.val2), codec.acc)) {
            swap(trp); return true;                            // swappable and secondary already loaded
        }
        save(trp.adr, start);                                  // save accumulator if needed
        if (lc !== null)                                       // load from reg
            code += codec.move(codec.acc, lc.charAt(0));
        else switch (trp.typ1) {
            case 'num':                                        // load immediate
                code += codec.movi(codec.acc, trp.val1);
                break;
            case 'var':                                        // load var
                code += codec.loada(trp.val1);
                if (used(trp.adr, trp.val1) > 0) {             // used forward
                    const wr = rgwork(trp.adr, codec.work);    // get working register
                    code += codec.move(wr, codec.acc);         // save
                }
                break;
            default: throw new Error(`unknown operand type: ${trp.typ1}`);
        }
        return false;
    },
    const1 = (trp, first) => {                                 // one time constant not in register
        let typ, val;
        if (first) { typ = trp.typ1; val = trp.val1; }
        else { typ = trp.typ2; val = trp.val2; }
        return typ === 'num' && loc(trp.typ, val) === null && used(trp.adr, val) === 0;
    },
    isvarhi = val => {                                         // check if var ref hi
        if (val === null) return false;
        val = val.toString();
        return val.endsWith('_') && val.charAt(0) > '9';
    },
    load2 = (trp, reg = null) => {                             // load secondary operand
        let lc = loc(0, trp.val2);
        if (lc !== null) {                                     // already loaded
            if (reg !== null && reg !== lc.charAt(0)) {        // move to provided register
                code += codec.move(reg, lc.charAt(0));
                return reg;
            }
            return lc.charAt(0);
        }
        lc = (reg === null) ?                                  // get working register if not provided
                rgwork(trp.adr, codec.work) : reg;
        switch (trp.typ2) {
            case 'num':                                        // load immediate
                code += codec.movi(lc, trp.val2);
                break;
            case 'var':                                        // load from memory
                let res = codec.ref, rgA;                      // use from memory
                if ((rgA = regs[codec.acc]) === null || used(trp.adr, rgA, 0) === 0) {
                    res = codec.acc;                           // use from accumulator
                    code += codec.loada(trp.val2);
                    save(trp.adr, 2);                          // if used forward
                } else {
                    let mem = regs[codec.mem.charAt(0)];
                    if (isvarhi(mem)) {                        // mem is var ref hi
                        // save previous mem variable
                        mem = mem.substring(0, mem.length - 1);
                        if (used(trp.adr, mem) > 0) {          // if used forward
                            if (reg !== null) lc = rgwork(trp.adr, codec.work);
                            code += codec.move(lc, codec.ref);
                        }
                    }
                    code += codec.loadr(codec.mem.charAt(0), trp.val2);
                }
                if (reg !== null) {                            // move to provided register
                    code += codec.move(reg, res);
                    return reg;
                }
                return res;
            default: throw new Error(`unknown operand type: ${trp.typ2}`);
        }
        return lc;
    },
    ttrp = (adr, typ1, val1, typ = 0) =>                       // create temporary triplet
            { return {adr, typ1, val1, typ}; },
    generate = (trpls, vrs, optimize = true, showtrp = false) => {
        triples = trpls; vars = vrs; code = '';
        for (const r in regs) regs[r] = null;
        for (let i = 0, n = triples.length; i < n; i++) {
            const trp = triples[i];
            if (!optimize && showtrp) code += `;;; ${showTrp(trp)}`;
            if (trp.typ !== 0) { generateW(trp); continue; }   // type 1 generation
            switch (trp.oper) {                                // type 0 generation
                case 'inv': case 'inc': case 'dec':            // unary operations
                    load1(trp, false);
                    switch (trp.oper) {
                        case 'inv': code += codec.invra(trp); break;
                        case 'inc':
                        case 'dec':
                            const op = (trp.oper === 'inc') ? codec.incr : codec.decr;
                            code += op(codec.acc, trp);
                            if (trp.val2 === 2) code += op(codec.acc, trp);
                            break;
                    }
                    break;
                case 'add': case 'sub':                        // swappable binary operations
                case 'xor': case 'and': case 'oro':
                case 'eql': case 'neq': case 'grt': case 'lst': case 'gre': case 'lse':
                    let swapped = false;
                    if (const1(trp, true)) {                   // one time usage optimization
                        swap(trp); swapped = true;
                    }
                    swapped ^= load1(trp, true);
                    let adi = codec.adi, add = codec.add, post = null;
                    switch (trp.oper) {
                        case 'sub':
                            if (swapped) {                     // 2-complement (-value)
                                code += codec.invra(trp);
                                code += codec.incr(codec.acc, trp);
                            } else {                           // operands in order
                                adi = codec.sui; add = codec.sub;
                            }
                            break;
                        case 'xor': adi = codec.xri; add = codec.xra; break;
                        case 'and': adi = codec.ani; add = codec.ana; break;
                        case 'oro': adi = codec.ori; add = codec.ora; break;
                        case 'eql': case 'neq': case 'grt': case 'lst': case 'gre': case 'lse':
                            adi = codec.cpi; add = codec.cmp;
                            break;
                    }
                    if (const1(trp, false))                    // one time usage optimization
                        code += adi(trp.val2, trp);
                    else {
                        const wr = load2(trp);
                        code += add(wr, trp);
                    }
                    if ('eql neq grt lst gre lse'.indexOf(trp.oper) >= 0) {
                        code += codec.movi(codec.acc, 1);      // comparison post-processing
                        switch (trp.oper) {
                            case 'eql': add = codec.jz; break;
                            case 'neq': add = codec.jnz; break;
                            case 'grt': add = swapped ? codec.jc : codec.jnc; break;
                            case 'lst': add = swapped ? codec.jnc : codec.jc; break;
                            case 'gre': add = swapped ? codec.jnc : codec.jc; break;
                            case 'lse': add = swapped ? codec.jc : codec.jnc; break;
                        }
                        code += add('$+4', trp);
                        code += codec.xra(codec.acc, trp);
                    }
                    break;
                case 'shl': case 'shr':                        // binary operations
                    if (trp.typ2 === 'num' && trp.val2 === 1) {
                        load1(trp, false, 0);                  // 0 - start checking from current triplet
                        code += codec.ora(codec.acc, trp);     // shift 1 optimization
                        const shlr = (trp.oper === 'shl') ? codec.ral : codec.rar;
                        code += shlr(trp);
                        break;
                    }
                    load2(trp, codec.prm);                     // load second oper first to special register
                    load1(trp, false, 0);                      // 0 - start checking from current triplet
                    code += codec.callp((trp.oper === 'shl') ? '@SHLF' : '@SHRF');
                    regs[codec.prm] = null;                    // clear special register
                    regs[codec.acc] = trp.adr;                 // set result to acc
                    break;
                case 'asg':                                    // assignment
                    if (trp.typ1 !== 'var' || trp.ref) {       // indexed variable or de-reference
                        
                        break;
                    }
                    let mem = regs[codec.mem.charAt(0)], v = `${trp.val1}_`;
                    if (mem !== v && (used(trp.adr, trp.val1) > 0 || trp.typ2 === 'num')) {
                        code += codec.loadr(codec.mem.charAt(0), trp.val1);
                        mem = v;
                    }
                    if (mem === v)
                        if (trp.typ2 === 'num')
                            code += codec.movi(codec.ref, trp.val2);
                        else {
                            let dest = codec.acc;
                            if (trp.typ2 === 'var') dest = load2(trp);
                            code += codec.move(codec.ref, dest);
                            if (dest === codec.acc)
                                regs[codec.acc] = trp.val1;    // set result to acc
                        }
                    else {
                        if (trp.typ2 === 'var')
                            load1(ttrp(trp.adr, 'var', trp.val2), false);
                        code += codec.savea(trp.val1);
                        regs[codec.acc] = trp.val1;            // set result to acc
                    }
                    break;
                case 'idx':                                    // array access
                    
                    break;
                case 'ref':                                    // de-reference
                    saveW(trp.adr);                            // save accW if needed
                    let optype;
                    if (trp.typ1 === 'var') optype = vars[trp.val1].typ;
                    else if (trp.typ1 === 'num') optype = 1;
                    else optype = triples[fndtrp(trp.val1)].typ;
                    if (optype === 0) {                        // byte value, expand to word
                        load1(trp, false);
                        code += codec.move(codec.accW.charAt(1), codec.acc);
                        if (regs[codec.accW.charAt(0)] !== 0)
                            code += codec.movi(codec.accW.charAt(0), 0);
                    }
                    else loadW(trp, true, codec.accW, loc(1, trp.val1));
                    code += codec.move(codec.acc, codec.ref);
                    regs[codec.acc] = trp.adr;                 // set result
                    break;
                default: throw new Error(`illegal operation: ${trp.oper}`);
            }
            if (trp.oper !== 'asg')                            // assignment not used in expressions
                save(trp.adr, 2);                              // save result if needed
        }
        if (optimize) {
            codec.peephole({fndop, chgop, phopt});             // peephole optimization
            codec.peephole({fndop, chgop, phopt});             // process changed code again
        }
        return code;
    },
    getW = (hi, lo) => {
        if (hi === null || hi.endsWith === undefined || lo === null || lo.startsWith === undefined) return null;
        if (!hi.endsWith('_') || !lo.startsWith('_')) return null;
        hi = hi.substring(0, hi.length - 1); lo = lo.substring(1);
        return (hi === lo) ? (valtype(hi) === 'num') ? hi | 0 : hi : null;
    },
    saveW = (adr, force = false) => {                          // push to stack
        let tt = null;
        const w = getW(regs[codec.accW.charAt(0)], regs[codec.accW.charAt(1)]);
        if (w === null) return false;                          // reg pair is not word
        if (valtype(w) === 'var' && vars[w].typ === 0)         // byte variable in word acc
            return false;                                      // do not save
        if (!force) {
            const usd = used(adr, w);
            if (usd === 0) return false;                       // not used
            if (usd === 1) {
                tt = triples[fndtrp(adr) + 1];                 // next triple
                if ((tt.val1 === w && tt.val2 !== adr) ||      // used only in next triple
                        (tt.val2 === w && tt.val1 !== adr))    // acc value and not this triple
                    return false;
            }
        }
        const s = regs[codec.savW];
        if (s !== null) {                                      // stack is already used
            if (tt === null) tt = triples[fndtrp(adr) + 1];
            if (getW(s.split('|')) === tt.val1) {
                code += codec.swapS();                         // stack used in next triplet, exchange
                return false;
            }
            throw new Error(`can't save acc value at: ${adr}`);
        }
        code += codec.saveW();                                 // save accumulator
        return true;
    },
    restW = (adr, reg, check) => {                             // pop from stack, check - check usage
        code += codec.restW(reg.charAt(0));                    // restore accumulator
        if (check) {
            const w = getW(regs[reg.charAt(0)], regs[reg.charAt(1)]);
            if (used(adr, w, 1, 0, t => true) > 0)             // used forward
                code += codec.saveWr(reg.charAt(0));           // leave on stack
        }
    },
    accWVar = (adr, val) => {                                  // find byte var from accW_lo triplet
        if (regs[codec.accW.charAt(0)] !== 0) return false;    // accW_hi is not 0
        let rv = regs[codec.accW.charAt(1)];                   // accW_lo
        if (valtype(rv) !== 'trp') return false;               // not triplet
        for (let i = fndtrp(adr) - 1; i >= 0; i--) {           // find last val assignment
            const tt = triples[i];
            if (tt.oper === 'asg' && tt.val1 === val && tt.val2 === rv)
                return true;                                   // found with assigned triplet from accW_lo
        }
        return false;                                          // not found
    },
    loadW = (trp, first, reg, lc = null) => {                  // load word operand
        if (inreg(lc, reg)) return false;                      // already in place
        const typ = first ? trp.typ1 : trp.typ2, val = first ? trp.val1 : trp.val2;
        let swap = false;
        switch (typ) {
            case 'num': code += codec.loadr(reg.charAt(0), val); break;
            case 'var':
                if (vars[val].typ === 1) {                     // type 1 variable
                    if (reg !== codec.accW) {                  // need to swap
                        code += codec.swapW();                 // swap working and accumulator regs
                        reg = codec.accW; swap = true;
                    }
                    code += codec.loadaW(val);                 // load to accumulator
                } else {                                       // type 0 variable
                    if (reg === codec.accW && accWVar(trp.adr, val))
                        return false;                          // already in place
                    if (lc === null) {
                        code += codec.loada(val);              // load to 8-bit accumulator
                        lc = codec.acc;
                    }
                    code += codec.move(reg.charAt(1), lc.charAt(0));
                    if (regs[reg.charAt(0)] !== 0)
                        code += codec.movi(reg.charAt(0), 0);  // move to reg with extending to word
                }
                break;
            case 'trp':
                if (inreg(lc, codec.savW))                     // saved
                    restW(trp.adr, reg);                       // restore
                else if (reg === codec.accW && inreg(lc, codec.workW))
                    code += codec.swapW();                     // swap working and accumulator regs
                else if (lc === null) throw new Error(`too complex expression at ${trp.adr}`);
                else {                                         // type 0 result
                    code += codec.move(reg.charAt(1), lc.charAt(0));
                    if (regs[reg.charAt(0)] !== 0)
                        code += codec.movi(reg.charAt(0), 0);  // move to reg with extending to word
                }
                break;
            default: throw new Error(`unknown operand type: ${typ}`);
        }
        return swap;
    },
    generateW = trp => {
        switch (trp.oper) {
            case 'inc': case 'dec':                            // unary operations
                saveW(trp.adr);                                // save accumulator if needed
                loadW(trp, true, codec.accW, loc(1, trp.val1));
                const op = (trp.oper === 'inc') ? codec.incrW : codec.decrW;
                code += op(codec.accW.charAt(0), trp);
                if (trp.val2 >= 2) code += op(codec.accW.charAt(0), trp);
                if (trp.val2 > 2) code += op(codec.accW.charAt(0), trp);
                break;
            case 'add': case 'sub':                            // binary operations
                saveW(trp.adr);                                // save accumulator if needed
                const o1lc = loc(1, trp.val1), o2lc = loc(1, trp.val2);
                let b0 = inreg(o1lc, codec.accW) ? 1 : inreg(o1lc, codec.workW) ? -1 : 0,
                    b1 = inreg(o2lc, codec.workW) ? 1 : inreg(o2lc, codec.accW) ? -1 : 0,
                    b2 = (b0 < 0 || b1 < 0) ? 1 : 0,
                    swap = false, rg = codec.workW.charAt(0);
                if (b0 < 0 && b1 < 0) { b0 = 0; b1 = 0; }
                else if (b0 === 1 && inreg(o1lc, codec.workW)) { b2 = 1; b1 = 1; b0 = 1; }
                else { if (b0 < 0) b0 = 1; if (b1 < 0) b1 = 1; }
                switch (b2 << 2 | b1 << 1 | b0) {              // possible operand combinations
                    case 0:                                                                  // none none   000
                        loadW(trp, true, codec.accW, o1lc);    // load first
                        if (o2lc === loc(1, trp.val2))         // different second after loadW, load
                            swap = loadW(trp, false, codec.workW, o2lc);
                        else rg = codec.accW.charAt(0);        // same second, 111 case
                        break;
                    case 1: swap = loadW(trp, false, codec.workW, o2lc); break;              // 1    none   001
                    case 2: loadW(trp, true, codec.accW, o1lc); break;                       // none 2      010
                    case 3: break;                                                           // 1    2      011
                    case 4: swap = true; break;                                              // 2    1      100
                    case 5: loadW(trp, false, codec.accW, o2lc); swap = true; break;         // none 1      101
                    case 6: swap = loadW(trp, true, codec.workW, o1lc); swap = !swap; break; // 2    none   110
                    default:                                                                 // 1    1      111
                        if (inreg(o1lc, codec.workW) && inreg(o2lc, codec.workW)) // same operand in work reg
                            code += codec.swapW();             // swap working and accumulator regs
                        rg = codec.accW.charAt(0);
                        break;
                }
                switch (trp.oper) {
                    case 'add': code += codec.addW(rg, trp); break;
                    case 'sub':
                        if (swap) code += codec.swapW();       // swap working and accumulator regs
                        else if (rg === codec.accW.charAt(0)) { // 111 case
                            code += codec.move(codec.workW.charAt(1), codec.accW.charAt(1)); // copy to working reg
                            code += codec.move(codec.workW.charAt(0), codec.accW.charAt(0));
                        }
                        code += codec.callp('@SUBW');
                        regs['A'] = null;
                        regs[codec.accW.charAt(0)] = `${trp.adr}_`; regs[codec.accW.charAt(1)] = `_${trp.adr}`;
                        break;
                    default: throw new Error(`unknown operator: ${trp.oper}`);
                }
                break;
            case 'asg':                                        // assignment
                saveW(trp.adr);                                // save accumulator if needed
                const ivar = (trp.typ1 !== 'var') ? triples[fndtrp(trp.val1)].val1 : trp.val1;
                if (vars[ivar].typ !== 1) throw new Error(`illegal assignment: ${ivar}`);
                const vlc = loc(1, trp.val2);
                if (!inreg(vlc, codec.accW)) loadW(trp, false, codec.accW, vlc);
                if (trp.typ1 === 'var') code += codec.saveaW(trp.val1);
                else {                                         // indexed variable or de-reference
                    
                }
                break;
            case 'idx':                                        // indexed variable
                
                break;
            case 'adr':                                        // variable address
                saveW(trp.adr);                                // save accumulator if needed
                if (trp.typ1 === 'var')                        // not indexed variable
                    code += codec.loadr(codec.mem.charAt(0), trp.val1);
                else loadW(trp, true, codec.accW, loc(1, trp.val1));
                regs[codec.accW.charAt(0)] = `${trp.adr}_`;    // set result
                regs[codec.accW.charAt(1)] = `_${trp.adr}`;
                break;
            default: throw new Error(`illegal operation: ${trp.oper}`);
        }
    };
    return {generate};
}

/*function CodeGen___(codec) {
    let triples,                                               // 3-address code
        vars,                                                  // variables - var: val=reg[reg], typ=0|1
        results,                                               // triplets  - adr: reg[reg]
        consts,                                                // constants - num: reg[reg]
        code;                                                  // generated assembly
    const regs = codec.regs,                                   // regs      - reg: val=var|adr|num, ref=<trp,first>
    fndop = (lines, start, s) => {                             // find operation before current
        for (let i = start; i >= 0; i--)
            if (lines[i].match(s) !== null) return i;
        return -1;
    },
    chgop = (lines, pattern, start, end, br = null) => {       // check if register changed
        let i;
        for (i = start; i <= end; i++) {
            const line = lines[i];
            if (br !== null && line.match(br) !== null) break;
            for (let j = 0, n = pattern.length; j < n; j++)
                if (line.match(pattern[j]) !== null) return [true, i];
        }
        return [false, i];
    },
    phopt = (match, begin, ptrn, fnc = null, fw = false) => {  // peephole register optimization
        const lines = code.split('\n');
        let i = 0, changed = false;
        while (i < lines.length) {
            let oper = lines[i],
                idx = oper.match(match), start, st, ed, bg;
            if (idx !== null && idx.length > 0) {
                const cnd = idx[1],
                      bgn = begin(cnd),
                      ptr = ptrn(cnd);
                if (fw) {
                    st = i + 1; ed = lines.length - 1; bg = bgn;
                } else {
                    start = fndop(lines, i - 1, bgn);
                    st = start + 1; ed = i - 1; bg = null;
                }
                if (fw || start >= 0) {
                    const [res, lid] = chgop(lines, ptr, st, ed, bg);
                    if (!res)
                        if (fnc === null) {
                            lines.splice(i, 1);
                            changed = true; continue;
                        }                                      // fnc - lines, begin (fw: match), match, reg, fw: begin
                        else if (fnc(lines, st - 1, i, cnd, lid)) {
                            changed = true; continue;
                        }
                }
            }
            i++;
        }
        if (changed) code = lines.join('\n');
    },
    loc = (trp, first) => {                                    // get operand location
        const typ = first ? trp.typ1 : trp.typ2;
        let lc;
        switch (typ) {
            case 'num': lc = consts[first ? trp.val1 : trp.val2] ?? null; break;
            case 'trp': lc = results[first ? trp.val1 : trp.val2] ?? null; break;
            case 'var': lc = vars[first ? trp.val1 : trp.val2].val ?? null; break;
            default: throw new Error(`unknown operand type: ${typ}`);
        }
        if (trp.typ === 0 && lc === codec.workW)               // byte operation and extended operand
            lc = lc.charAt(1);                                 // use low byte
        return lc;
    },
    rmreg = (s, c) => {                                        // remove char from string
        if (s === null || s === undefined) return null;
        const idx = s.indexOf(c);
        if (idx < 0) return s;
        s = s.substr(0, idx) + s.substr(idx + 1);
        return (s.length === 0) ? null : s;
    },
    adreg = (s, c) => {                                        // add char to string
        if (s === null || s === undefined) return c;
        if (s.indexOf(c) >= 0) return s;
        return s + c;
    },
    clrloc = (rval, reg) => {                                  // clear location
        if (isNaN(rval)) {
            if (rval.startsWith('*')) return;                  // variable reference, skip
            if (rval.charAt(0) === ':') results[rval] = rmreg(results[rval], reg);
            else vars[rval].val = rmreg(vars[rval].val, reg);
        }
        else consts[rval] = rmreg(consts[rval], reg);
    },
    sloc = (trp, first, reg) => {                              // set operand location
        if (trp.typ === 0 && trp.typ1 === 'var' && !trp.oper)
            // variable set, clear all locations, except reg
            vars[trp.val1].val = null;
        const typ = first ? trp.typ1 : trp.typ2,
              val = first ? trp.val1 : trp.val2,
              rg = regs[reg],
              rval = rg.val;
        if (rval !== null) {
            if (rval === val) return;                          // already set
            clrloc(rval, reg);                                 // clear previous location
        }
        switch (typ) {
            case 'num': consts[val] = adreg(consts[val], reg); break;
            case 'trp': results[val] = adreg(results[val], reg); break;
            case 'var': vars[val].val = adreg(vars[val].val, reg); break;
            default: throw new Error(`unknown operand type: ${typ}`);
        }
        rg.val = val; rg.ref = [{...trp}, first];
    },
    clrreg = reg => {                                          // clear register
        const rg = regs[reg];
        if (rg.val !== null) {
            clrloc(rg.val, reg);                               // clear location
            rg.val = null; rg.ref = null;
        }
    },
    fndtrp = trp => {                                          // find triplet index
        let idx = 0;
        while (triples[idx].adr !== trp.adr) idx++;
        return idx;
    },
    used = (trp, first, start = 1, beforeAsg = false,
            fnc = t => t.oper !== 'asg' && t.oper !== 'idx',   // exclude operations
            sec = true                                         // check typ2 and val2
    ) => {                                                     // find operand ref forward
        let idx = fndtrp(trp), cnt = 0, t;
        const n = triples.length,
              typ = first ? trp.typ1 : trp.typ2,
              val = first ? trp.val1 : trp.val2;
        idx += start;                                          // starting from next triplet by default
        while (idx < n) {
            t = triples[idx++];
            if (beforeAsg && t.oper === 'asg') break;          // check only current assignment
            if ((fnc(t) && t.typ1 === typ && t.val1 === val) || (sec && t.typ2 === typ && t.val2 === val)) cnt++;
        }
        return cnt;
    },
    swap = trp => {                                            // swap operands
        const typ = trp.typ1, val = trp.val1;
        trp.typ1 = trp.typ2; trp.val1 = trp.val2;
        trp.typ2 = typ; trp.val2 = val;
    },
    inreg = (lc, reg) => lc !== null && lc.indexOf(reg) >= 0,  // check if reg in location
    const1 = (trp, first) =>                                   // one time constant not in register
            (first ? trp.typ1 : trp.typ2) === 'num' && loc(trp, first) === null && used(trp, first) === 0,
    rgwork = (trp, rgs, mem) => {                              // get best secondary register
        const hv = mem.val;
        let res = null;
        for (let i = 0, n = rgs.length; i < n; i++) {
            const name = rgs.charAt(i), rg = regs[name];
            if (rg.val === null) return name;                  // free
            rg.ref[0].adr = trp.adr;                           // set start address for usage counter
            let usg = used(...rg.ref); // ????? used variable overriden ?????
            if (usg === 0) return name;                        // not used
            const typ = rg.ref[1] ? rg.ref[0].typ1 : rg.ref[0].typ2,
                  val = rg.ref[1] ? rg.ref[0].val1 : rg.ref[0].val2;
            if (typ === 'trp') continue;                       // triplet must be saved
            if (typ === 'var')                                 // prefer to keep variables
                usg += (hv === `*${val}`) ? 500 : 1000;        // lower priority if in H register
            if (res === null) res = [name, usg];
            else if (res[1] > usg) { res[0] = name; res[1] = usg; }
        }
        if (res === null) throw new Error('no working registers');
        return res[0];
    },
    issave = (trp, start, acc) => {                            // check if save acc (start - starting triplet to check)
        if (acc.val === null) return false;
        acc.ref[0].adr = trp.adr;                              // set start address for usage counter
        return used(...acc.ref, start) > 0 && loc(...acc.ref).length < 2;
    },
    ttrp = (adr, typ1, val1, typ = 0) =>                       // create temporary triplet
            { return {adr, typ1, val1, typ}; },
    save = (trp, start) => {                                   // save accumulator (start - starting triplet to check)
        const acc = regs[codec.acc];
        if (issave(trp, start, acc)) {
            const slc = rgwork(trp, codec.work, regs[codec.mem]);
            code += codec.move(slc, codec.acc);
            sloc(...acc.ref, slc);
        }
    },
    load1 = (trp, canswap, start = 1) => {                     // load primary operand
        const lc = loc(trp, true);
        if (inreg(lc, codec.acc)) return;                      // already loaded
        if (canswap && trp.typ2 !== null && inreg(loc(trp, false), codec.acc)) {
            swap(trp); return true;                            // swappable and secondary already loaded
        }
        save(trp, start);                                      // save accumulator if needed
        if (lc !== null)                                       // load from reg
            code += codec.move(codec.acc, lc.charAt(0));
        else switch (trp.typ1) {
            case 'num':                                        // load immediate
                code += codec.movi(codec.acc, trp.val1);
                break;
            case 'var':                                        // load from mem
                const mem = regs[codec.mem];
                if (mem.val === `*${trp.val1}`)
                    code += codec.move(codec.acc, codec.ref);
                else
                    code += codec.loada(trp.val1);
                if (used(trp, true) > 0) {                     // used forward
                    const wr = rgwork(trp, codec.work, mem);   // get working register
                    code += codec.move(wr, codec.acc);         // save
                    sloc(trp, true, wr);                       // set location
                }
                break;
            default: throw new Error(`unknown operand type: ${trp.typ1}`);
        }
        sloc(trp, true, codec.acc);                            // set location
        return false;
    },
    load2 = (trp, reg = null) => {                             // load secondary operand
        let lc = loc(trp, false);
        if (lc !== null) {                                     // already loaded
            if (reg !== null) {                                // move to provided register
                code += codec.move(reg, lc.charAt(0));
                sloc(trp, false, reg);
                return reg;
            }
            return lc.charAt(0);
        }
        const mem = regs[codec.mem];
        lc = (reg === null) ?                                  // get working register if not provided
                rgwork(trp, codec.work, mem) : reg;
        switch (trp.typ2) {
            case 'num':                                        // load immediate
                code += codec.movi(lc, trp.val2);
                break;
            case 'var':                                        // load from memory
                let res = codec.ref, rgA;                      // use from memory
                const v = `*${trp.val2}`;
                if (mem.val !== v)
                    if ((rgA = regs[codec.acc]).val === null || used(...rgA.ref, 0) === 0) {
                        res = codec.acc;                       // use from accumulator
                        code += codec.loada(trp.val2);
                        sloc(trp, false, codec.acc);           // set location
                    } else {
                        if (mem.val !== null && isNaN(mem.val)) { // mem.val is string
                            // save previous mem variable
                            const tmp = ttrp(trp.adr, 'var', mem.val.substr(1));
                            if (used(tmp, true) > 0) {         // if used forward
                                if (reg !== null) lc = rgwork(trp, codec.work, mem);
                                code += codec.move(lc, codec.ref);
                                sloc(tmp, true, lc);           // set location
                            }
                        }
                        code += codec.loadr(codec.mem, trp.val2);
                        mem.val = v;
                    }
                if (reg !== null) {                            // move to provided register
                    code += codec.move(reg, res);
                    sloc(trp, false, reg);
                    return reg;
                }
                return res;
            default: throw new Error(`unknown operand type: ${trp.typ2}`);
        }
        sloc(trp, false, lc);                                  // set location
        return lc;
    },
    isUsedWW = () => {                                         // check if DE is used
        const r1 = regs[codec.workW.charAt(0)], r2 = regs[codec.workW.charAt(1)];
        return (r1.val !== null && used(...r1.ref) > 0) || (r2.val !== null && used(...r2.ref) > 0);
    },
    findTrp = adr => {                                         // find triplet by address
        for (let i = 0, n = triples.length; i < n; i++) {
            const t = triples[i];
            if (t.adr === adr) return t;
        }
        return null;
    },
    isOp1NotInAccW = trp => {
        if (regs[codec.accW.charAt(0)].val !== regs[codec.accW.charAt(1)].val) return true;
        return (trp.adr.substr(1) | 0) - (trp.val1.substr(1) | 0) !== 1;
    },
    generate = (trpls, vrs, optimize = true, showtrp = false) => {
        triples = trpls; vars = vrs; results = {}; consts = {}; code = '';
        for (const p in regs) { const rg = regs[p]; rg.val = null; rg.ref = null; }
        for (let i = 0, n = triples.length; i < n; i++) {
            const lastXTHL = code.endsWith('XTHL\n'),
                  trp = triples[i];
            if (showtrp) code += `;;; ${showTrp(trp)}`;
            if (trp.typ !== 0) { generateW(trp); continue; }   // type 1 generation
            switch (trp.oper) {                                // type 0 generation
                case 'inv':                                    // unary operations
                case 'inc':
                case 'dec':
                    load1(trp, false);
                    switch (trp.oper) {
                        case 'inv': code += codec.invra(); break;
                        case 'inc':
                        case 'dec':
                            const op = (trp.oper === 'inc') ? codec.incr : codec.decr;
                            code += op(codec.acc);
                            if (trp.val2 === 2) code += op(codec.acc);
                            break;
                    }
                    break;
                case 'add': case 'sub':                        // swappable binary operations
                case 'xor': case 'and': case 'oro':
                case 'eql': case 'neq': case 'grt': case 'lst': case 'gre': case 'lse':
                    let swapped = false;
                    if (const1(trp, true)) {                   // one time usage optimization
                        swap(trp); swapped = true;
                    }
                    swapped ^= load1(trp, true);
                    let adi = codec.adi, add = codec.add, post = null;
                    switch (trp.oper) {
                        case 'sub':
                            if (swapped) {                     // 2-complement (-value)
                                code += codec.invra();
                                code += codec.incr(codec.acc);
                            } else {                           // operands in order
                                adi = codec.sui; add = codec.sub;
                            }
                            break;
                        case 'xor': adi = codec.xri; add = codec.xra; break;
                        case 'and': adi = codec.ani; add = codec.ana; break;
                        case 'oro': adi = codec.ori; add = codec.ora; break;
                        case 'eql': case 'neq': case 'grt': case 'lst': case 'gre': case 'lse':
                            adi = codec.cpi; add = codec.cmp;
                            break;
                    }
                    if (const1(trp, false))                    // one time usage optimization
                        code += adi(trp.val2);
                    else {
                        const wr = load2(trp);                 // side effect - modifies code, no nesting
                        code += add(wr);
                    }
                    if ('eql neq grt lst gre lse'.indexOf(trp.oper) >= 0) {
                        code += codec.movi(codec.acc, 1);      // comparison post-processing
                        switch (trp.oper) {
                            case 'eql': add = codec.jz; break;
                            case 'neq': add = codec.jnz; break;
                            case 'grt': add = swapped ? codec.jc : codec.jnc; break;
                            case 'lst': add = swapped ? codec.jnc : codec.jc; break;
                            case 'gre': add = swapped ? codec.jnc : codec.jc; break;
                            case 'lse': add = swapped ? codec.jc : codec.jnc; break;
                        }
                        code += add('$+4');
                        code += codec.xra(codec.acc);
                    }
                    break;
                case 'shl': case 'shr':                        // binary operations
                    if (trp.typ2 === 'num' && trp.val2 === 1) {
                        load1(trp, false, 0);                  // 0 - start checking from current triplet
                        code += codec.ora(codec.acc);          // shift 1 optimization
                        const shlr = (trp.oper === 'shl') ? codec.ral : codec.rar;
                        code += shlr();
                        break;
                    }
                    load2(trp, codec.prm);                     // load second oper first to special register
                    load1(trp, false, 0);                      // 0 - start checking from current triplet
                    code += codec.callp((trp.oper === 'shl') ? '@SHLF' : '@SHRF');
                    clrreg(codec.prm);                         // clear special register
                    break;
                case 'asg':                                    // assignment
                    if (trp.typ1 !== 'var' || trp.ref) {       // indexed variable or de-reference
                        if (trp.typ1 !== 'var') {              // address on stack
                            if (!lastXTHL)
                                restW(trp, codec.mem, true);   // restore only if not after XTHL
                        } else {                               // var de-reference not processed
                            if (vars[trp.val1].typ !== 1)      // check type
                                throw new Error(`expected word type: ${trp.val1}`);
                            code += codec.loadaW(trp.val1);
                        }
                        if (trp.ref) {                         // de-reference
                            let wr, save = false;              // try to get working register
                            try { wr = rgwork(trp, codec.work, regs[codec.mem]); }
                            catch { wr = codec.work.charAt(0); save = true; }
                            if (save) code += codec.saveWr(wr);
                            code += codec.move(wr, codec.ref);
                            code += codec.incrW(codec.accW.charAt(0));
                            code += codec.move(codec.accW.charAt(0), codec.ref);
                            code += codec.move(codec.accW.charAt(1), wr);
                            if (save) code += codec.restW(wr);
                            if (trp.typ2 === 'num') {
                                if (trp.val2 < -128 || trp.val2 > 255)
                                    throw new Error(`illegal assignment: ${trp.val2}`);
                                code += codec.movi(codec.ref, trp.val2);
                                break;
                            }
                            if (trp.typ2 === 'var') {
                                if (vars[trp.val2].typ !== 0)
                                    throw new Error(`illegal assignment: ${trp.val2}`);
                            }
                            else if (findTrp(trp.val2).typ !== 0)
                                throw new Error(`illegal assignment: ${trp.val2}`);
                        }
                        if (trp.typ2 === 'var') {              // right side var is not processed, load
                            const varloc = loc(trp, false);    // check if already loaded
                            if (varloc !== null) {             // use loaded
                                code += codec.move(codec.ref, varloc);
                                break;
                            }
                            code += codec.loada(trp.val2);     // else load
                        }
                        code += codec.move(codec.ref, codec.acc);
                        break;
                    }
                    const mem = regs[codec.mem],
                          v = `*${trp.val1}`;
                    if (mem.val !== v && (used(trp, true) > 0 || trp.typ2 === 'num')) {
                        code += codec.loadr(codec.mem, trp.val1);
                        mem.val = v;
                    }
                    const tmpv = ttrp(trp.adr, 'var', trp.val1);
                    if (mem.val === v)
                        if (trp.typ2 === 'num')
                            code += codec.movi(codec.ref, trp.val2);
                        else {
                            let dest = codec.acc;
                            if (trp.typ2 === 'var') dest = load2(trp);
                            code += codec.move(codec.ref, dest);
                            sloc(tmpv, true, dest);            // set location
                        }
                    else {
                        if (trp.typ2 === 'var')
                            load1(ttrp(trp.adr, 'var', trp.val2), false);
                        code += codec.savea(trp.val1);
                        sloc(tmpv, true, codec.acc);           // set location
                    }
                    break;
                case 'idx':
                    saveW(trp);                                // save HL if needed
                    const iwr = codec.workW.charAt(0);
                    let usedW;
                    if (regs[codec.mem].val !== `*${trp.val1}`)
                        code += codec.loadr(codec.mem, trp.val1);
                    if (trp.typ2 === 'trp' || trp.val2 > 3 || trp.typ2 === 'var') {
                        if (usedW = isUsedWW()) code += codec.saveWr(iwr);
                        if (trp.typ2 === 'num') code += codec.loadr(iwr, trp.val2);
                        else {
                            if (trp.typ2 === 'var') code += codec.loada(trp.val2);
                            code += codec.move(codec.workW.charAt(1), codec.acc);
                            code += codec.movi(iwr, '0');
                        }
                        code += codec.addW(iwr);
                        if (usedW) restW(trp, iwr);
                    } else {
                        let count = trp.val2;
                        while (count-- > 0) code += codec.incrW(codec.mem);
                    }
                    if (trp.adrOnly) {                         // asg to indexed var or adr operation
                        if (!trp.noSave)                       // noSave is true for adr operation
                            saveW(trp, true);
                    } else {
                        code += codec.move(codec.acc, codec.ref);
                        const tt = ttrp(trp.adr, 'trp', trp.adr, 1);
                        if (used(tt, true, 2, false, t => t.oper === 'asg', false))
                            saveW(trp, true);                  // save if indexed address in HL used later in asg
                    }
                    break;
                case 'ref':                                    // de-reference
                    saveW(trp);                                // save HL if needed
                    let optype;
                    if (trp.typ1 === 'var') optype = vars[trp.val1].typ;
                    else if (trp.typ1 === 'num') optype = 1;
                    else optype = findTrp(trp.val1).typ;
                    if (optype === 0) {                        // byte value, expand to word
                        load1(trp, false);
                        code += codec.move(codec.accW.charAt(1), codec.acc);
                        code += codec.movi(codec.accW.charAt(0), '0');
                    }
                    else loadW(trp, true, codec.accW, loc(trp, true));
                    code += codec.move(codec.acc, codec.ref);
                    break;
                default: throw new Error(`illegal operation: ${trp.oper}`);
            }
            if (trp.oper !== 'asg') {                          // assignment not used in expressions
                sloc(ttrp(trp.adr, 'trp', trp.adr), true, codec.acc);
                save(trp, 2);                                  // save result if needed
            }
        }
        if (optimize) {
            codec.peephole({fndop, chgop, phopt});             // peephole optimization
            codec.peephole({fndop, chgop, phopt});             // process changed code again
        }
        return code;
    },
    inregW = (lc, reg) => inreg(lc, reg.charAt(0)) && inreg(lc, reg.charAt(1)),
    slocW = (trp, first, reg) => { sloc(trp, first, reg.charAt(0)); sloc(trp, first, reg.charAt(1)); },
    saveW = (trp, force = false) => {                          // push to stack
        const rv0 = regs[codec.accW.charAt(0)], rv1 = regs[codec.accW.charAt(1)], ss = regs[codec.savW];
        if (!force) {                                          // check usage counter
            if (rv0.val === null || rv1.val === null || rv0.val !== rv1.val) return false;
            rv0.ref[0].adr = trp.adr;                          // set start address for usage counter
            if (used(...rv0.ref, 1) <= 0) return false;        // not used
        }
        if (ss.val !== null) {                                 // stack is already used
            if (!force && used(...rv0.ref, 2, true) <= 0)
                return false;                                  // don't save if used only in next triple of this asg
            const tt = triples[fndtrp(trp) + 1];
            if (ss.val === tt.val1 || ss.ref[0].adr === tt.val1) {
                code += '        XTHL\n';                      // stack used in next triplet
                slocW(...ss.ref, codec.accW);                  // stack to HL
                sloc(...rv0.ref, codec.savW);                  // current triplet to stack
                return false;
            }
            throw new Error(`can't save acc value at: ${trp.adr}`);
        }
        code += codec.saveW();                                 // save accumulator
        if (rv0.ref === null) {
            rv0.val = trp.adr;
            rv0.ref = [ttrp(trp.adr, 'trp', trp.adr, 1), true];
        }
        sloc(...rv0.ref, codec.savW);                          // set location
        return true;
    },
    restW = (trp, reg, check) => {                             // pop from stack, check - check usage
        code += codec.restW(reg.charAt(0));                    // restore accumulator
        if (check && used(trp, true, 1, false, t => true))     // if check and used forward
            code += codec.saveWr(reg.charAt(0));               // leave on stack
        else clrreg(codec.savW);                               // clear save register
    },
    swapW = () => {
        code += codec.swapW();
        const acc = regs[codec.accW.charAt(0)].ref,
              wrk = regs[codec.workW.charAt(0)].ref;
        if (acc !== null) slocW(...acc, codec.workW);
        else { clrreg(codec.workW.charAt(0)); clrreg(codec.workW.charAt(1)); }
        if (wrk !== null) slocW(...wrk, codec.accW);
        else { clrreg(codec.accW.charAt(0)); clrreg(codec.accW.charAt(1)); }
    },
    loadW = (trp, first, reg, lc = null) => {
        if (reg === lc) return false;                          // already in place
        const typ = first ? trp.typ1 : trp.typ2,
              val = first ? trp.val1 : trp.val2;
        let swap = false;
        switch (typ) {
            case 'num': code += codec.loadr(reg.charAt(0), val); break;
            case 'var':
                if (vars[val].typ === 1) {                     // type 1 variable
                    if (reg !== codec.accW) {                  // need to swap
                        swapW();                               // swap working and accumulator regs
                        reg = codec.accW; swap = true;
                    }
                    code += codec.loadaW(val);                 // load to accumulator
                } else {                                       // type 0 variable
                    if (lc === null) {
                        code += codec.loada(val);              // load to 8-bit accumulator
                        lc = codec.acc;
                    }
                    code += codec.move(reg.charAt(1), lc.charAt(0));
                    code += codec.movi(reg.charAt(0), '0');    // move to reg
                }
                break;
            case 'trp':
                if (inreg(lc, codec.savW))                     // saved
                    restW(trp, reg);                           // restore
                else if (reg === codec.accW && lc === codec.workW) {
                    swapW();
                    clrreg(codec.workW.charAt(0)); clrreg(codec.workW.charAt(1));
                }
                else if (lc === null) throw new Error(`too complex expression`);
                else {                                         // type 0 result
                    code += codec.move(reg.charAt(1), lc.charAt(0));
                    code += codec.movi(reg.charAt(0), '0');    // move to reg
                }
                break;
            default: throw new Error(`unknown operand type: ${typ}`);
        }
        slocW(trp, first, reg);                                // set location
        return swap;
    },
    generateW = trp => {
        switch (trp.oper) {
            case 'inc':                                        // unary operations
            case 'dec':
                saveW(trp);                                    // save accumulator if needed
                loadW(trp, true, codec.accW, loc(trp, true));
                const op = (trp.oper === 'inc') ? codec.incrW : codec.decrW;
                code += op(codec.accW.charAt(0));
                if (trp.val2 >= 2) code += op(codec.accW.charAt(0));
                if (trp.val2 > 2) code += op(codec.accW.charAt(0));
                break;
            case 'add':                                        // binary operations
            case 'sub':
                saveW(trp);                                    // save accumulator if needed
                const o1lc = loc(trp, true), o2lc = loc(trp, false);
                let b0 = inregW(o1lc, codec.accW) ? 1 : inregW(o1lc, codec.workW) ? -1 : 0,
                    b1 = inregW(o2lc, codec.workW) ? 1 : inregW(o2lc, codec.accW) ? -1 : 0,
                    b2 = (b0 < 0 || b1 < 0) ? 1 : 0,
                    swap = false, rg = codec.workW.charAt(0);
                if (b0 < 0 && b1 < 0) { b0 = 0; b1 = 0; }
                else if (b0 === 1 && inregW(o1lc, codec.workW)) { b2 = 1; b1 = 1; b0 = 1; }
                else { if (b0 < 0) b0 = 1; if (b1 < 0) b1 = 1; }
                switch (b2 << 2 | b1 << 1 | b0) {              // possible operand combinations
                    case 0:                                                                  // none none   000
                        loadW(trp, true, codec.accW, o1lc);    // load first
                        if (o2lc === loc(trp, false))          // different second, load
                            swap = loadW(trp, false, codec.workW, o2lc);
                        else rg = codec.accW.charAt(0);        // same second, 111 case
                        break;
                    case 1: swap = loadW(trp, false, codec.workW, o2lc); break;              // 1    none   001
                    case 2: loadW(trp, true, codec.accW, o1lc); break;                       // none 2      010
                    case 3: break;                                                           // 1    2      011
                    case 4: swap = true; break;                                              // 2    1      100
                    case 5: loadW(trp, false, codec.accW, o2lc); swap = true; break;         // none 1      101
                    case 6: swap = loadW(trp, true, codec.workW, o1lc); swap = !swap; break; // 2    none   110
                    default:                                                                 // 1    1      111
                        if (o1lc === o2lc && o1lc === codec.workW) { // same operand in work reg
                            swapW();
                            clrreg(codec.workW.charAt(0)); clrreg(codec.workW.charAt(1));
                        }
                        rg = codec.accW.charAt(0);
                        break;
                }
                switch (trp.oper) {
                    case 'add':
                        code += codec.addW(rg);
                        break;
                    case 'sub':
                        if (swap) swapW();
                        else if (rg === codec.accW.charAt(0)) { // 111 case
                            code += codec.move(codec.workW.charAt(1), codec.accW.charAt(1)); // copy to working reg
                            code += codec.move(codec.workW.charAt(0), codec.accW.charAt(0));
                            slocW(trp, true, codec.workW);                                   // set location
                        }
                        code += codec.callp('@SUBW');
                        break;
                    default: throw new Error(`unknown operator: ${trp.oper}`);
                }
                break;
            case 'asg':                                        // assignment
                saveW(trp);                                    // save accumulator if needed
                const ivar = (trp.typ1 !== 'var') ? findTrp(trp.val1).val1 : trp.val1;
                if (vars[ivar].typ !== 1) throw new Error(`illegal assignment: ${ivar}`);
                const vlc = loc(trp, false);
                if (!inregW(vlc, codec.accW)) loadW(trp, false, codec.accW, vlc);
                if (trp.typ1 === 'var') code += codec.saveaW(trp.val1);
                else {                                         // indexed variable or de-reference
                    let iwr1 = codec.workW.charAt(0), iwr2 = codec.workW.charAt(1);
                    const reg = regs[iwr1];
                    if (reg.val !== null && used(...reg.ref) > 0) { // load address to BC
                        iwr1 = codec.work.charAt(0); iwr2 = codec.work.charAt(1);
                        restW(trp, iwr1, true);
                        code += codec.move(codec.acc, codec.accW.charAt(1));
                        code += codec.stax(iwr1);
                        code += codec.incrW(iwr1);
                        code += codec.move(codec.acc, codec.accW.charAt(0));
                        code += codec.stax(iwr1);
                    } else {                                        // load address to DE (shorter and faster)
                        restW(trp, iwr1, true);
                        swapW();
                        code += codec.move(codec.ref, iwr2);
                        code += codec.incrW(codec.mem);
                        code += codec.move(codec.ref, iwr1);
                    }
                }
                break;
            case 'idx':                                        // indexed variable
                const iwr = codec.workW.charAt(0);
                let usedW, idx = 0;
                while (triples[idx].adr !== trp.adr) idx++;
                if (trp.typ2 === 'num' || trp.typ2 === 'var') {
                    saveW(trp);
                    if (trp.typ2 === 'var') code += codec.loadaW(trp.val2);
                    else code += codec.loadr(codec.mem, trp.val2);
                }
                if (vars[trp.val1].typ !== 0) code += codec.addW(codec.mem);
                if (usedW = isUsedWW()) code += codec.saveWr(iwr);
                swapW();
                code += codec.loadr(codec.mem, trp.val1);
                code += codec.addW(iwr);
                if (trp.adrOnly) {                             // asg to indexed var or adr operation
                    if (usedW) restW(trp, iwr);
                    if (!trp.noSave)                           // noSave is true for adr operation
                        saveW(trp, true);
                } else {
                    code += codec.move(iwr, codec.ref);
                    code += codec.incrW(codec.mem);
                    code += codec.move(codec.mem, codec.ref);
                    code += codec.move(codec.accW.charAt(1), iwr);
                    if (usedW) restW(trp, iwr);
                }
                break;
            case 'adr':                                        // variable address
                saveW(trp);                                    // save accumulator if needed
                if (trp.typ1 === 'var')                        // not indexed variable
                    code += codec.loadr(codec.mem, trp.val1);
                else if (isOp1NotInAccW(trp))                  // check if not loaded yet
                    loadW(trp, true, codec.accW, loc(trp, true));
                break;
            default: throw new Error(`illegal operation: ${trp.oper}`);
        }
        if (trp.oper !== 'asg') {                              // assignment not used in expressions
            const trpr = ttrp(trp.adr, 'trp', trp.adr, 1);
            slocW(trpr, true, codec.accW);
        }
    };
    return {generate};
}*/

const il = IL(),
      parser = Parser(il.emit),
      codec = Codec8080(),
      gen = CodeGen(codec);

function triplesToStr(code) {
    let strcode = '';
    for (let i = 0, n = code.length; i < n; i++) {
        const trp = code[i];
        strcode += showTrp(trp);
    }
    return strcode;
}

function compile(prg, optimize, showtrp) {
    const codecpy = [];
    try {
        il.init();
        parser.parse(prg);
        const [code, vars] = il.code();
        for (let i = 0, n = code.length; i < n; i++) codecpy.push({...code[i]});
        return [gen.generate(code, vars, optimize, showtrp), vars, codecpy];
    } catch(e) {
        console.log(prg);
        console.log(triplesToStr(codecpy));
        console.error(e.stack);
        throw '';
    }
}

function test(prg, res, res2) {
    const code = compile(prg);
    let strcode = triplesToStr(code[2]);
    if (strcode.trim() !== res.trim())
        throw new Error(`program:\n${prg}\ngenerated:\n${strcode}\nexpected:\n${res}`);
    if (code[0].trim() !== res2.trim())
        throw new Error(`program:\n${prg}\ngenerated:\n${code[0]}\nexpected:\n${res2}`);
}

function doTests() {
/*    test(`
byte arr[10], tmp, i;
tmp = arr[i];
arr[i] = arr[i + 1];
arr[i + 1] = tmp;
    `, `
:0_ arr idx i__ 0 ____ ____ ____
:1_ tmp asg :0_ 0 ____ ____ ____
:3_ i__ inc ___ 0 ____ ____ ____
:4_ arr idx :3_ 0 ____ ____ ____
:5_ :0_ asg :4_ 0 ____ ____ ____
:8_ :4_ asg tmp 0 ____ ____ ____
    `, `
        LXI  H, arr
        LDA  i
        MOV  E, A
        MVI  D, 0
        DAD  D
        MOV  A, M
        PUSH H
        STA  tmp
        MOV  B, A
        LDA  i
        INR  A
        LXI  H, arr
        MOV  E, A
        MVI  D, 0
        DAD  D
        MOV  A, M
        XTHL
        MOV  M, A
        POP  H
        MOV  M, B
    `);
    test(`
word arr[10], tmp, i;
tmp = arr[i];
    `, `
:0_ arr idx i__ 1 ____ ____ ____
:1_ tmp asg :0_ 1 ____ ____ ____
    `, `
        LHLD i
        DAD  H
        XCHG
        LXI  H, arr
        DAD  D
        MOV  D, M
        INX  H
        MOV  H, M
        MOV  L, D
        SHLD tmp
    `);
    test(`
byte arr[10], tmp, i;
tmp = arr[i];
    `, `
:0_ arr idx i__ 0 ____ ____ ____
:1_ tmp asg :0_ 0 ____ ____ ____
    `, `
        LXI  H, arr
        LDA  i
        MOV  E, A
        MVI  D, 0
        DAD  D
        MOV  A, M
        STA  tmp
    `);
    test(`
word a1[10], e1; byte b1, c1;
a1[2] = &b1;
b1 = 12;
*a1[2] = 10 + b1;
e1 = &a1[2] + 1;
*e1 = *a1;
    `, `
:0_ a1_ idx 2__ 1 true ____ ____
:1_ b1_ adr ___ 1 ____ ____ ____
:2_ :0_ asg :1_ 1 ____ ____ ____
:3_ b1_ asg 12_ 0 ____ ____ ____
:5_ 10_ add b1_ 0 ____ ____ ____
:6_ :0_ asg :5_ 0 ____ ____ true
:8_ :0_ adr ___ 1 ____ ____ ____
:9_ :8_ inc ___ 1 ____ ____ ____
:10 e1_ asg :9_ 1 ____ ____ ____
:11 a1_ ref ___ 0 ____ ____ ____
:12 e1_ asg :11 0 ____ ____ true
    `, `
        LXI  H, 2
        DAD  H
        XCHG
        LXI  H, a1
        DAD  D
        PUSH H
        LXI  H, b1
        POP  D
        PUSH D
        XCHG
        MOV  M, E
        INX  H
        MOV  M, D
        LXI  H, b1
        MVI  M, 12
        MOV  A, M
        ADI  10
        POP  H
        PUSH H
        MOV  B, M
        INX  H
        MOV  H, M
        MOV  L, B
        MOV  M, A
        POP  H
        INX  H
        SHLD e1
        LHLD a1
        MOV  A, M
        LHLD e1
        MOV  B, M
        INX  H
        MOV  H, M
        MOV  L, B
        MOV  M, A
    `);
    test(`
word a1[10], e1; byte b1, c1;
a1[2] = &b1;
b1 = 12;
*a1[2] = 10 + b1;
e1 = &a1[2] + 1;
*e1 = 1;
    `, `
:0_ a1_ idx 2__ 1 true ____ ____
:1_ b1_ adr ___ 1 ____ ____ ____
:2_ :0_ asg :1_ 1 ____ ____ ____
:3_ b1_ asg 12_ 0 ____ ____ ____
:5_ 10_ add b1_ 0 ____ ____ ____
:6_ :0_ asg :5_ 0 ____ ____ true
:8_ :0_ adr ___ 1 ____ ____ ____
:9_ :8_ inc ___ 1 ____ ____ ____
:10 e1_ asg :9_ 1 ____ ____ ____
:11 e1_ asg 1__ 0 ____ ____ true
    `, `
        LXI  H, 2
        DAD  H
        XCHG
        LXI  H, a1
        DAD  D
        PUSH H
        LXI  H, b1
        POP  D
        PUSH D
        XCHG
        MOV  M, E
        INX  H
        MOV  M, D
        LXI  H, b1
        MVI  M, 12
        MOV  A, M
        ADI  10
        POP  H
        PUSH H
        MOV  B, M
        INX  H
        MOV  H, M
        MOV  L, B
        MOV  M, A
        POP  H
        INX  H
        SHLD e1
        MOV  B, M
        INX  H
        MOV  H, M
        MOV  L, B
        MVI  M, 1
    `);
    test(`
word a[10], e; byte b, c;
a[2] = &b;
b = 12;
*a[2] = 10 + b;
    `, `
:0_ a__ idx 2__ 1 true ____ ____
:1_ b__ adr ___ 1 ____ ____ ____
:2_ :0_ asg :1_ 1 ____ ____ ____
:3_ b__ asg 12_ 0 ____ ____ ____
:5_ 10_ add b__ 0 ____ ____ ____
:6_ :0_ asg :5_ 0 ____ ____ true
    `, `
        LXI  H, 2
        DAD  H
        XCHG
        LXI  H, a
        DAD  D
        PUSH H
        LXI  H, b
        POP  D
        PUSH D
        XCHG
        MOV  M, E
        INX  H
        MOV  M, D
        LXI  H, b
        MVI  M, 12
        MOV  A, M
        ADI  10
        POP  H
        MOV  B, M
        INX  H
        MOV  H, M
        MOV  L, B
        MOV  M, A
    `);
    test(`
word a[10], e; byte b, c;
a[2] = &b;
b = 12;
*a[2] = c;
    `, `
:0_ a__ idx 2__ 1 true ____ ____
:1_ b__ adr ___ 1 ____ ____ ____
:2_ :0_ asg :1_ 1 ____ ____ ____
:3_ b__ asg 12_ 0 ____ ____ ____
:5_ :0_ asg c__ 0 ____ ____ true
    `, `
        LXI  H, 2
        DAD  H
        XCHG
        LXI  H, a
        DAD  D
        PUSH H
        LXI  H, b
        POP  D
        PUSH D
        XCHG
        MOV  M, E
        INX  H
        MOV  M, D
        LXI  H, b
        MVI  M, 12
        POP  H
        MOV  B, M
        INX  H
        MOV  H, M
        MOV  L, B
        LDA  c
        MOV  M, A
    `);
    test(`
word a[10], e; byte b, c;
a[2] = &b;
b = 12;
*a[2] = 7;
    `, `
:0_ a__ idx 2__ 1 true ____ ____
:1_ b__ adr ___ 1 ____ ____ ____
:2_ :0_ asg :1_ 1 ____ ____ ____
:3_ b__ asg 12_ 0 ____ ____ ____
:5_ :0_ asg 7__ 0 ____ ____ true
    `, `
        LXI  H, 2
        DAD  H
        XCHG
        LXI  H, a
        DAD  D
        PUSH H
        LXI  H, b
        POP  D
        PUSH D
        XCHG
        MOV  M, E
        INX  H
        MOV  M, D
        LXI  H, b
        MVI  M, 12
        POP  H
        MOV  B, M
        INX  H
        MOV  H, M
        MOV  L, B
        MVI  M, 7
    `);
    test(`
word a[3], b; byte c, d, e;
c = 32;
a[2] = &d;
a[2] = &b;
b = &d;
    `, `
:0_ c__ asg 32_ 0 ____ ____ ____
:1_ a__ idx 2__ 1 true ____ ____
:2_ d__ adr ___ 1 ____ ____ ____
:3_ :1_ asg :2_ 1 ____ ____ ____
:5_ b__ adr ___ 1 ____ ____ ____
:6_ :1_ asg :5_ 1 ____ ____ ____
:8_ b__ asg :2_ 1 ____ ____ ____
    `, `
        LXI  H, c
        MVI  M, 32
        LXI  H, 2
        DAD  H
        XCHG
        LXI  H, a
        DAD  D
        PUSH H
        LXI  H, d
        POP  D
        PUSH D
        XCHG
        MOV  M, E
        INX  H
        MOV  M, D
        LXI  H, b
        POP  B
        MOV  A, L
        STAX B
        INX  B
        MOV  A, H
        STAX B
        XCHG
        SHLD b
    `);
    test(`
word a[3], b; byte c, d, e;
c = 32;
a[2] = &d;
a[2] = &b;
    `, `
:0_ c__ asg 32_ 0 ____ ____ ____
:1_ a__ idx 2__ 1 true ____ ____
:2_ d__ adr ___ 1 ____ ____ ____
:3_ :1_ asg :2_ 1 ____ ____ ____
:5_ b__ adr ___ 1 ____ ____ ____
:6_ :1_ asg :5_ 1 ____ ____ ____
    `, `
        LXI  H, c
        MVI  M, 32
        LXI  H, 2
        DAD  H
        XCHG
        LXI  H, a
        DAD  D
        PUSH H
        LXI  H, d
        POP  D
        PUSH D
        XCHG
        MOV  M, E
        INX  H
        MOV  M, D
        LXI  H, b
        POP  D
        XCHG
        MOV  M, E
        INX  H
        MOV  M, D
    `);
    test(`
word a, b[5]; byte c, d[5];
a = &b[3] + &d[2];
a = &d[4] + &b[3];
    `, `
:0_ b__ idx 3__ 1 true true ____
:1_ :0_ adr ___ 1 ____ ____ ____
:2_ d__ idx 2__ 0 true true ____
:3_ :2_ adr ___ 1 ____ ____ ____
:4_ :1_ add :3_ 1 ____ ____ ____
:5_ a__ asg :4_ 1 ____ ____ ____
:6_ d__ idx 4__ 0 true true ____
:7_ :6_ adr ___ 1 ____ ____ ____
:10 :7_ add :1_ 1 ____ ____ ____
:11 a__ asg :10 1 ____ ____ ____
    `, `
        LXI  H, 3
        DAD  H
        XCHG
        LXI  H, b
        DAD  D
        PUSH H
        LXI  H, d
        INX  H
        INX  H
        POP  D
        DAD  D
        SHLD a
        LXI  H, d
        PUSH D
        LXI  D, 4
        DAD  D
        POP  D
        DAD  D
        SHLD a
    `);
    test(`
word a[10], b, c;
a[2] = a[3] + b;
c = a[3];
    `, `
:0_ a__ idx 2__ 1 true ____ ____
:1_ a__ idx 3__ 1 ____ ____ ____
:2_ :1_ add b__ 1 ____ ____ ____
:3_ :0_ asg :2_ 1 ____ ____ ____
:5_ c__ asg :1_ 1 ____ ____ ____
    `, `
        LXI  H, 2
        DAD  H
        XCHG
        LXI  H, a
        DAD  D
        PUSH H
        LXI  H, 3
        DAD  H
        XCHG
        LXI  H, a
        DAD  D
        MOV  D, M
        INX  H
        MOV  H, M
        MOV  L, D
        XCHG
        LHLD b
        DAD  D
        POP  B
        MOV  A, L
        STAX B
        INX  B
        MOV  A, H
        STAX B
        XCHG
        SHLD c
    `);
    test(`
word a[10], b, c;
a[2] = a[3] + b;
    `, `
:0_ a__ idx 2__ 1 true ____ ____
:1_ a__ idx 3__ 1 ____ ____ ____
:2_ :1_ add b__ 1 ____ ____ ____
:3_ :0_ asg :2_ 1 ____ ____ ____
    `, `
        LXI  H, 2
        DAD  H
        XCHG
        LXI  H, a
        DAD  D
        PUSH H
        LXI  H, 3
        DAD  H
        XCHG
        LXI  H, a
        DAD  D
        MOV  D, M
        INX  H
        MOV  H, M
        MOV  L, D
        XCHG
        LHLD b
        DAD  D
        POP  D
        XCHG
        MOV  M, E
        INX  H
        MOV  M, D
    `);
    test(`
word a[10]; byte b;
a[2] = a[3] + b;
    `, `
:0_ a__ idx 2__ 1 true ____ ____
:1_ a__ idx 3__ 1 ____ ____ ____
:2_ :1_ add b__ 1 ____ ____ ____
:3_ :0_ asg :2_ 1 ____ ____ ____
    `, `
        LXI  H, 2
        DAD  H
        XCHG
        LXI  H, a
        DAD  D
        PUSH H
        LXI  H, 3
        DAD  H
        XCHG
        LXI  H, a
        DAD  D
        MOV  D, M
        INX  H
        MOV  H, M
        MOV  L, D
        LDA  b
        MOV  E, A
        MVI  D, 0
        DAD  D
        POP  D
        XCHG
        MOV  M, E
        INX  H
        MOV  M, D
    `);
    test(`
byte a[10], b;
a[2] = a[3] + b;
    `, `
:0_ a__ idx 2__ 0 true ____ ____
:1_ a__ idx 3__ 0 ____ ____ ____
:2_ :1_ add b__ 0 ____ ____ ____
:3_ :0_ asg :2_ 0 ____ ____ ____
    `, `
        LXI  H, a
        INX  H
        INX  H
        PUSH H
        LXI  H, a
        INX  H
        INX  H
        INX  H
        MOV  A, M
        LXI  H, b
        ADD  M
        POP  H
        MOV  M, A
    `);
    test(`
byte a[10], b;
b = 32;
a[2] = b;
    `, `
:0_ b__ asg 32_ 0 ____ ____ ____
:1_ a__ idx 2__ 0 true ____ ____
:2_ :1_ asg b__ 0 ____ ____ ____
    `, `
        LXI  H, b
        MVI  M, 32
        LXI  H, a
        INX  H
        INX  H
        LDA  b
        MOV  M, A
    `);
    test(`
word a, b[10], c;
b[c + 1] = a + 10;
    `, `
:0_ c__ inc ___ 1 ____ ____ ____
:1_ b__ idx :0_ 1 true ____ ____
:2_ a__ add 10_ 1 ____ ____ ____
:3_ :1_ asg :2_ 1 ____ ____ ____
    `, `
        LHLD c
        INX  H
        DAD  H
        XCHG
        LXI  H, b
        DAD  D
        PUSH H
        LHLD a
        LXI  D, 10
        DAD  D
        POP  D
        XCHG
        MOV  M, E
        INX  H
        MOV  M, D
    `);
    test(`
word a, b[10], c;
b[c + 1] = a + 10; a = c + 10;
    `, `
:0_ c__ inc ___ 1 ____ ____ ____
:1_ b__ idx :0_ 1 true ____ ____
:2_ a__ add 10_ 1 ____ ____ ____
:3_ :1_ asg :2_ 1 ____ ____ ____
:4_ c__ add 10_ 1 ____ ____ ____
:5_ a__ asg :4_ 1 ____ ____ ____
    `, `
        LHLD c
        INX  H
        DAD  H
        XCHG
        LXI  H, b
        DAD  D
        PUSH H
        LHLD a
        LXI  D, 10
        DAD  D
        POP  B
        MOV  A, L
        STAX B
        INX  B
        MOV  A, H
        STAX B
        LHLD c
        DAD  D
        SHLD a
    `);
    test(`
word a, b[10]; b = 0;
a = b[b + 1];
    `, `
:0_ b__ asg ___ 1 ____ ____ ____
:1_ b__ inc ___ 1 ____ ____ ____
:2_ b__ idx :1_ 1 ____ ____ ____
:3_ a__ asg :2_ 1 ____ ____ ____
    `, `
        LXI  H, 0
        SHLD b
        INX  H
        DAD  H
        XCHG
        LXI  H, b
        DAD  D
        MOV  D, M
        INX  H
        MOV  H, M
        MOV  L, D
        SHLD a
    `);
    test(`
byte a, b[10], c; b = 0;
a = b[b + 1];
    `, `
:0_ b__ asg ___ 0 ____ ____ ____
:1_ b__ inc ___ 0 ____ ____ ____
:2_ b__ idx :1_ 0 ____ ____ ____
:3_ a__ asg :2_ 0 ____ ____ ____
    `, `
        LXI  H, b
        MVI  M, 0
        MOV  E, M
        INR  E
        MVI  D, 0
        DAD  D
        MOV  A, M
        STA  a
    `);
    test(`
byte a, b, c[10]; b = 19; c = 27;
a = (4 + b + c[1] + b) + (2 + c[1]) + (b + c[1]);
    `, `
:0_ b__ asg 19_ 0 ____ ____ ____
:1_ c__ asg 27_ 0 ____ ____ ____
:2_ 4__ add b__ 0 ____ ____ ____
:3_ c__ idx 1__ 0 ____ ____ ____
:4_ :2_ add :3_ 0 ____ ____ ____
:5_ :4_ add b__ 0 ____ ____ ____
:7_ :3_ inc 2__ 0 ____ ____ ____
:8_ :5_ add :7_ 0 ____ ____ ____
:10 b__ add :3_ 0 ____ ____ ____
:11 :8_ add :10 0 ____ ____ ____
:12 a__ asg :11 0 ____ ____ ____
    `, `
        LXI  H, b
        MVI  M, 19
        LXI  H, c
        MVI  M, 27
        LDA  b
        MOV  B, A
        ADI  4
        MOV  C, A
        INX  H
        MOV  A, M
        MOV  D, A
        ADD  C
        ADD  B
        MOV  C, A
        MOV  A, D
        INR  A
        INR  A
        ADD  C
        MOV  C, A
        MOV  A, B
        ADD  D
        ADD  C
        STA  a
    `);
    test(`
byte a[5], b[10];
a[3] = 25 - b[a + 1];
    `, `
:0_ a__ idx 3__ 0 true ____ ____
:1_ a__ inc ___ 0 ____ ____ ____
:2_ b__ idx :1_ 0 ____ ____ ____
:3_ 25_ sub :2_ 0 ____ ____ ____
:4_ :0_ asg :3_ 0 ____ ____ ____
    `, `
        LXI  H, a
        INX  H
        INX  H
        INX  H
        PUSH H
        LDA  a
        INR  A
        LXI  H, b
        MOV  E, A
        MVI  D, 0
        DAD  D
        MOV  A, M
        CMA
        INR  A
        ADI  25
        POP  H
        MOV  M, A
    `);
    test(`
byte a, b[10];
a = b[a + 1];
    `, `
:0_ a__ inc ___ 0 ____ ____ ____
:1_ b__ idx :0_ 0 ____ ____ ____
:2_ a__ asg :1_ 0 ____ ____ ____
    `, `
        LDA  a
        INR  A
        LXI  H, b
        MOV  E, A
        MVI  D, 0
        DAD  D
        MOV  A, M
        STA  a
    `);*/
    test(`
word a; byte b, c;
a = &b;
b = 12;
c = *(a + b + 7);
    `, `
:0_ b__ adr ___ 1 ____ ____ ____
:1_ a__ asg :0_ 1 ____ ____ ____
:2_ b__ asg 12_ 0 ____ ____ ____
:3_ a__ add b__ 1 ____ ____ ____
:4_ :3_ add 7__ 1 ____ ____ ____
:5_ :4_ ref ___ 0 ____ ____ ____
:6_ c__ asg :5_ 0 ____ ____ ____
    `, `
        LXI  H, b
        SHLD a
        MVI  M, 12
        XCHG
        LHLD a
        DAD  D
        LXI  D, 7
        DAD  D
        MOV  A, M
        STA  c
    `);
    test(`
word a; byte b, c;
a = &b;
b = 12;
c = *120;
    `, `
:0_ b__ adr ___ 1 ____ ____ ____
:1_ a__ asg :0_ 1 ____ ____ ____
:2_ b__ asg 12_ 0 ____ ____ ____
:3_ 120 ref ___ 0 ____ ____ ____
:4_ c__ asg :3_ 0 ____ ____ ____
    `, `
        LXI  H, b
        SHLD a
        MVI  M, 12
        LXI  H, 120
        MOV  A, M
        STA  c
    `);
    test(`
word a; byte b, c;
a = &b;
b = 12;
c = *a;
    `, `
:0_ b__ adr ___ 1 ____ ____ ____
:1_ a__ asg :0_ 1 ____ ____ ____
:2_ b__ asg 12_ 0 ____ ____ ____
:3_ a__ ref ___ 0 ____ ____ ____
:4_ c__ asg :3_ 0 ____ ____ ____
    `, `
        LXI  H, b
        SHLD a
        MVI  M, 12
        MOV  A, M
        STA  c
    `);
    test(`
word a, b; byte c, d;
a = &b + &d;
a = &b + &b;
    `, `
:0_ b__ adr ___ 1 ____ ____ ____
:1_ d__ adr ___ 1 ____ ____ ____
:2_ :0_ add :1_ 1 ____ ____ ____
:3_ a__ asg :2_ 1 ____ ____ ____
:6_ :0_ add :0_ 1 ____ ____ ____
:7_ a__ asg :6_ 1 ____ ____ ____
    `, `
        LXI  H, b
        PUSH H
        LXI  H, d
        POP  D
        DAD  D
        SHLD a
        XCHG
        DAD  H
        SHLD a
    `);
    test(`
word a, b; byte c, d;
a = &b + &d;
a = &b + 2;
    `, `
:0_ b__ adr ___ 1 ____ ____ ____
:1_ d__ adr ___ 1 ____ ____ ____
:2_ :0_ add :1_ 1 ____ ____ ____
:3_ a__ asg :2_ 1 ____ ____ ____
:5_ :0_ inc 2__ 1 ____ ____ ____
:6_ a__ asg :5_ 1 ____ ____ ____
    `, `
        LXI  H, b
        PUSH H
        LXI  H, d
        POP  D
        DAD  D
        SHLD a
        XCHG
        INX  H
        INX  H
        SHLD a
    `);
    test(`
word a, b, c;
a = &c;
b = &c + 10;
    `, `
:0_ c__ adr ___ 1 ____ ____ ____
:1_ a__ asg :0_ 1 ____ ____ ____
:3_ :0_ add 10_ 1 ____ ____ ____
:4_ b__ asg :3_ 1 ____ ____ ____
    `, `
        LXI  H, c
        SHLD a
        LXI  D, 10
        DAD  D
        SHLD b
    `);
    test(`
word a, b; byte c;
a = &b + 10 + &b;
    `, `
:0_ b__ adr ___ 1 ____ ____ ____
:1_ :0_ add 10_ 1 ____ ____ ____
:3_ :1_ add :0_ 1 ____ ____ ____
:4_ a__ asg :3_ 1 ____ ____ ____
    `, `
        LXI  H, b
        PUSH H
        LXI  D, 10
        DAD  D
        POP  D
        DAD  D
        SHLD a
    `);
    test(`
word a; byte b;
a = &(10 + &b);
    `, `
:0_ b__ adr ___ 1 ____ ____ ____
:1_ 10_ add :0_ 1 true true ____
:2_ :1_ adr ___ 1 ____ ____ ____
:3_ a__ asg :2_ 1 ____ ____ ____
    `, `
        LXI  H, b
        LXI  D, 10
        DAD  D
        SHLD a
    `);
    test(`
word a, b;
a = &(10 + &b);
    `, `
:0_ b__ adr ___ 1 ____ ____ ____
:1_ 10_ add :0_ 1 true true ____
:2_ :1_ adr ___ 1 ____ ____ ____
:3_ a__ asg :2_ 1 ____ ____ ____
    `, `
        LXI  H, b
        LXI  D, 10
        DAD  D
        SHLD a
    `);
    test(`
byte a; word b, c;
a = *(10 + b);
    `, `
:0_ 10_ add b__ 1 ____ ____ ____
:1_ :0_ ref ___ 0 ____ ____ ____
:2_ a__ asg :1_ 0 ____ ____ ____
    `, `
        LXI  D, 10
        LHLD b
        DAD  D
        MOV  A, M
        STA  a
    `);
    test(`
word a; byte b;
a = *(10 + b);
    `, `
:0_ 10_ add b__ 0 ____ ____ ____
:1_ :0_ ref ___ 0 ____ ____ ____
:2_ a__ asg :1_ 1 ____ ____ ____
    `, `
        LDA  b
        ADI  10
        MOV  L, A
        MVI  H, 0
        MOV  L, M
        SHLD a
    `);
    test(`
byte a, b;
a = *(10 + b);
    `, `
:0_ 10_ add b__ 0 ____ ____ ____
:1_ :0_ ref ___ 0 ____ ____ ____
:2_ a__ asg :1_ 0 ____ ____ ____
    `, `
        LDA  b
        ADI  10
        MOV  L, A
        MVI  H, 0
        MOV  A, M
        STA  a
    `);
    test(`
word a, b;
a = *(10 + b);
    `, `
:0_ 10_ add b__ 1 ____ ____ ____
:1_ :0_ ref ___ 0 ____ ____ ____
:2_ a__ asg :1_ 1 ____ ____ ____
    `, `
        LXI  D, 10
        LHLD b
        DAD  D
        MOV  L, M
        MVI  H, 0
        SHLD a
    `);
    test(`
word a, b; byte c, d;
c = *b;
    `, `
:0_ b__ ref ___ 0 ____ ____ ____
:1_ c__ asg :0_ 0 ____ ____ ____
    `, `
        LHLD b
        MOV  A, M
        STA  c
    `);
    test(`
word a, b; byte c, d;
c = *10 + d;
    `, `
:0_ 10_ ref ___ 0 ____ ____ ____
:1_ :0_ add d__ 0 ____ ____ ____
:2_ c__ asg :1_ 0 ____ ____ ____
    `, `
        LXI  H, 10
        MOV  A, M
        LXI  H, d
        ADD  M
        STA  c
    `);
    test(`
word a, b; byte c, d;
d = *c;
    `, `
:0_ c__ ref ___ 0 ____ ____ ____
:1_ d__ asg :0_ 0 ____ ____ ____
    `, `
        LDA  c
        MOV  L, A
        MVI  H, 0
        MOV  A, M
        STA  d
    `);
    test(`
word a, b; byte c, d;
a = *b;
    `, `
:0_ b__ ref ___ 0 ____ ____ ____
:1_ a__ asg :0_ 1 ____ ____ ____
    `, `
        LHLD b
        MOV  L, M
        MVI  H, 0
        SHLD a
    `);
    test(`
word a, b; byte c, d;
a = *10 + b;
    `, `
:0_ 10_ ref ___ 0 ____ ____ ____
:1_ :0_ add b__ 1 ____ ____ ____
:2_ a__ asg :1_ 1 ____ ____ ____
    `, `
        LXI  H, 10
        MOV  L, M
        MVI  H, 0
        XCHG
        LHLD b
        DAD  D
        SHLD a
    `);
    test(`
word a, b; byte c, d;
a = *10 + d;
    `, `
:0_ 10_ ref ___ 0 ____ ____ ____
:1_ :0_ add d__ 0 ____ ____ ____
:2_ a__ asg :1_ 1 ____ ____ ____
    `, `
        LXI  H, 10
        MOV  A, M
        LXI  H, d
        ADD  M
        MOV  L, A
        MVI  H, 0
        SHLD a
    `);
    test(`
word a, b; byte c, d;
a = *c;
    `, `
:0_ c__ ref ___ 0 ____ ____ ____
:1_ a__ asg :0_ 1 ____ ____ ____
    `, `
        LDA  c
        MOV  L, A
        MVI  H, 0
        MOV  L, M
        SHLD a
    `);
    test(`
word a, b, c, d; byte e, f;
e = 2 + f; d = f + 2; c = f + 2;
    `, `
:0_ f__ inc 2__ 0 ____ ____ ____
:1_ e__ asg :0_ 0 ____ ____ ____
:3_ d__ asg :0_ 1 ____ ____ ____
:5_ c__ asg :0_ 1 ____ ____ ____
    `, `
        LDA  f
        INR  A
        INR  A
        STA  e
        MOV  L, A
        MVI  H, 0
        SHLD d
        SHLD c
    `);
    test(`
word a, b, c, d; byte e, f;
e = 2 + f; d = f + 2; c = f + 2; a = f;
    `, `
:0_ f__ inc 2__ 0 ____ ____ ____
:1_ e__ asg :0_ 0 ____ ____ ____
:3_ d__ asg :0_ 1 ____ ____ ____
:5_ c__ asg :0_ 1 ____ ____ ____
:6_ a__ asg f__ 1 ____ ____ ____
    `, `
        LDA  f
        MOV  B, A
        INR  A
        INR  A
        STA  e
        MOV  L, A
        MVI  H, 0
        SHLD d
        SHLD c
        MOV  L, B
        SHLD a
    `);
    test(`
word a, b, c, d; byte e, f;
e = 2 + f; d = f + 2; c = f + 2; a = e;
    `, `
:0_ f__ inc 2__ 0 ____ ____ ____
:1_ e__ asg :0_ 0 ____ ____ ____
:3_ d__ asg :0_ 1 ____ ____ ____
:5_ c__ asg :0_ 1 ____ ____ ____
:6_ a__ asg e__ 1 ____ ____ ____
    `, `
        LDA  f
        INR  A
        INR  A
        STA  e
        MOV  L, A
        MVI  H, 0
        SHLD d
        SHLD c
        SHLD a
    `);
    test(`
word a, b, c, d; byte e, f;
e = 2 + f; d = f + 2; c = f + 2; a = c;
    `, `
:0_ f__ inc 2__ 0 ____ ____ ____
:1_ e__ asg :0_ 0 ____ ____ ____
:3_ d__ asg :0_ 1 ____ ____ ____
:5_ c__ asg :0_ 1 ____ ____ ____
:6_ a__ asg c__ 1 ____ ____ ____
    `, `
        LDA  f
        INR  A
        INR  A
        STA  e
        MOV  L, A
        MVI  H, 0
        SHLD d
        SHLD c
        SHLD a
    `);
    test(`
word a, b, c, d; byte e, f;
e = 2 + f; d = f + 2; c = f + 2; a = d;
    `, `
:0_ f__ inc 2__ 0 ____ ____ ____
:1_ e__ asg :0_ 0 ____ ____ ____
:3_ d__ asg :0_ 1 ____ ____ ____
:5_ c__ asg :0_ 1 ____ ____ ____
:6_ a__ asg d__ 1 ____ ____ ____
    `, `
        LDA  f
        INR  A
        INR  A
        STA  e
        MOV  L, A
        MVI  H, 0
        SHLD d
        SHLD c
        SHLD a
    `);
    test(`
word a, b, c, d; byte e, f;
a = 3 + (7 + ((b + c) + (d + 4) + (c + 6) + 5));
    `, `
:0_ b__ add c__ 1 ____ ____ ____
:1_ d__ add 4__ 1 ____ ____ ____
:2_ :0_ add :1_ 1 ____ ____ ____
:3_ c__ add 6__ 1 ____ ____ ____
:4_ :2_ add :3_ 1 ____ ____ ____
:5_ :4_ add 5__ 1 ____ ____ ____
:6_ 7__ add :5_ 1 ____ ____ ____
:7_ :6_ inc 3__ 1 ____ ____ ____
:8_ a__ asg :7_ 1 ____ ____ ____
    `, `
        LHLD b
        XCHG
        LHLD c
        DAD  D
        PUSH H
        LHLD d
        LXI  D, 4
        DAD  D
        POP  D
        DAD  D
        PUSH H
        LHLD c
        LXI  D, 6
        DAD  D
        POP  D
        DAD  D
        LXI  D, 5
        DAD  D
        LXI  D, 7
        DAD  D
        INX  H
        INX  H
        INX  H
        SHLD a
    `);
    test(`
word a, b; byte c, d, e, f;
a = 3 + (7 + ((b + c) + (d + 4) + (c + 6) + 5));
    `, `
:0_ b__ add c__ 1 ____ ____ ____
:1_ d__ add 4__ 0 ____ ____ ____
:2_ :0_ add :1_ 1 ____ ____ ____
:3_ c__ add 6__ 0 ____ ____ ____
:4_ :2_ add :3_ 1 ____ ____ ____
:5_ :4_ add 5__ 1 ____ ____ ____
:6_ 7__ add :5_ 1 ____ ____ ____
:7_ :6_ inc 3__ 1 ____ ____ ____
:8_ a__ asg :7_ 1 ____ ____ ____
    `, `
        LHLD b
        LDA  c
        MOV  E, A
        MVI  D, 0
        DAD  D
        LDA  d
        ADI  4
        MOV  E, A
        DAD  D
        LDA  c
        ADI  6
        MOV  E, A
        DAD  D
        LXI  D, 5
        DAD  D
        LXI  D, 7
        DAD  D
        INX  H
        INX  H
        INX  H
        SHLD a
    `);
    test(`
word a, b, c, d;
d = b + c - 8 - (a + 7 + b);
    `, `
:0_ b__ add c__ 1 ____ ____ ____
:1_ :0_ sub 8__ 1 ____ ____ ____
:2_ a__ add 7__ 1 ____ ____ ____
:3_ :2_ add b__ 1 ____ ____ ____
:4_ :1_ sub :3_ 1 ____ ____ ____
:5_ d__ asg :4_ 1 ____ ____ ____
    `, `
        LHLD b
        XCHG
        LHLD c
        DAD  D
        LXI  D, 8
        CALL @SUBW
        PUSH H
        LHLD a
        LXI  D, 7
        DAD  D
        XCHG
        LHLD b
        DAD  D
        POP  D
        XCHG
        CALL @SUBW
        SHLD d
    `);
    test(`
word a, b, c, d;
d = b + c - 2 - (a + b + 7);
    `, `
:0_ b__ add c__ 1 ____ ____ ____
:1_ :0_ dec 2__ 1 ____ ____ ____
:2_ a__ add b__ 1 ____ ____ ____
:3_ :2_ add 7__ 1 ____ ____ ____
:4_ :1_ sub :3_ 1 ____ ____ ____
:5_ d__ asg :4_ 1 ____ ____ ____
    `, `
        LHLD b
        XCHG
        LHLD c
        DAD  D
        DCX  H
        DCX  H
        PUSH H
        LHLD a
        DAD  D
        LXI  D, 7
        DAD  D
        POP  D
        XCHG
        CALL @SUBW
        SHLD d
    `);
    test(`
word a, c; byte b, d; word e, f;
a = 1234; c = 5678; b = 12; d = 56;
a = c + b; c = a - d; e = a + c; f = a - c;
    `, `
:0_ a__ asg 1234 1 ____ ____ ____
:1_ c__ asg 5678 1 ____ ____ ____
:2_ b__ asg 12_ 0 ____ ____ ____
:3_ d__ asg 56_ 0 ____ ____ ____
:4_ c__ add b__ 1 ____ ____ ____
:5_ a__ asg :4_ 1 ____ ____ ____
:6_ a__ sub d__ 1 ____ ____ ____
:7_ c__ asg :6_ 1 ____ ____ ____
:8_ a__ add c__ 1 ____ ____ ____
:9_ e__ asg :8_ 1 ____ ____ ____
:10 a__ sub c__ 1 ____ ____ ____
:11 f__ asg :10 1 ____ ____ ____
    `, `
        LXI  H, 1234
        SHLD a
        LXI  H, 5678
        SHLD c
        LXI  H, b
        MVI  M, 12
        LXI  H, d
        MVI  M, 56
        LHLD c
        LDA  b
        MOV  E, A
        MVI  D, 0
        DAD  D
        SHLD a
        LDA  d
        MOV  E, A
        CALL @SUBW
        SHLD c
        XCHG
        LHLD a
        DAD  D
        SHLD e
        LHLD a
        CALL @SUBW
        SHLD f
    `);
    test(`
word a, b, c, d; byte e, f;
a = 5 + b + b + 1;
    `, `
:0_ 5__ add b__ 1 ____ ____ ____
:1_ :0_ add b__ 1 ____ ____ ____
:2_ :1_ inc ___ 1 ____ ____ ____
:3_ a__ asg :2_ 1 ____ ____ ____
    `, `
        LXI  D, 5
        LHLD b
        DAD  D
        XCHG
        LHLD b
        DAD  D
        INX  H
        SHLD a
    `);
    test(`
word a, b, c, d; byte e, f;
a = b + 5 + b;
    `, `
:0_ b__ add 5__ 1 ____ ____ ____
:1_ :0_ add b__ 1 ____ ____ ____
:2_ a__ asg :1_ 1 ____ ____ ____
    `, `
        LHLD b
        LXI  D, 5
        DAD  D
        XCHG
        LHLD b
        DAD  D
        SHLD a
    `);
    test(`
word a, b, c, d; byte e, f;
a = b + c + b;
    `, `
:0_ b__ add c__ 1 ____ ____ ____
:1_ :0_ add b__ 1 ____ ____ ____
:2_ a__ asg :1_ 1 ____ ____ ____
    `, `
        LHLD b
        XCHG
        LHLD c
        DAD  D
        DAD  D
        SHLD a
    `);
    test(`
word a; byte b;
b = b + 1; a = a + a + b; b = b + b + b;
    `, `
:0_ b__ inc ___ 0 ____ ____ ____
:1_ b__ asg :0_ 0 ____ ____ ____
:2_ a__ add a__ 1 ____ ____ ____
:3_ :2_ add b__ 1 ____ ____ ____
:4_ a__ asg :3_ 1 ____ ____ ____
:5_ b__ add b__ 0 ____ ____ ____
:6_ :5_ add b__ 0 ____ ____ ____
:7_ b__ asg :6_ 0 ____ ____ ____
    `, `
        LDA  b
        INR  A
        STA  b
        LHLD a
        DAD  H
        MOV  E, A
        MVI  D, 0
        DAD  D
        SHLD a
        ADD  A
        ADD  E
        STA  b
    `);
    test(`
byte a1, b1;
a1 = 3;
b1 = 2 >= a1 & b1 < 4;
    `, `
:0_ a1_ asg 3__ 0 ____ ____ ____
:1_ 2__ gre a1_ 0 ____ ____ ____
:2_ b1_ lst 4__ 0 ____ ____ ____
:3_ :1_ and :2_ 0 ____ ____ ____
:4_ b1_ asg :3_ 0 ____ ____ ____
    `, `
        LXI  H, a1
        MVI  M, 3
        MOV  A, M
        CPI  2
        MVI  A, 1
        JNC  $+4
        XRA  A
        MOV  B, A
        LDA  b1
        CPI  4
        MVI  A, 1
        JC   $+4
        XRA  A
        ANA  B
        STA  b1
    `);
    test(`
byte a, b, c; b = 19; c = 27;
a = (4 + b + c + b) + (2 + c) + (b + c);
    `, `
:0_ b__ asg 19_ 0 ____ ____ ____
:1_ c__ asg 27_ 0 ____ ____ ____
:2_ 4__ add b__ 0 ____ ____ ____
:3_ :2_ add c__ 0 ____ ____ ____
:4_ :3_ add b__ 0 ____ ____ ____
:5_ c__ inc 2__ 0 ____ ____ ____
:6_ :4_ add :5_ 0 ____ ____ ____
:7_ b__ add c__ 0 ____ ____ ____
:8_ :6_ add :7_ 0 ____ ____ ____
:9_ a__ asg :8_ 0 ____ ____ ____
    `, `
        LXI  H, b
        MVI  M, 19
        LXI  H, c
        MVI  M, 27
        LDA  b
        MOV  B, A
        ADI  4
        ADD  M
        ADD  B
        MOV  C, A
        MOV  A, M
        INR  A
        INR  A
        ADD  C
        MOV  C, A
        MOV  A, B
        ADD  M
        ADD  C
        STA  a
    `);
    test(`
byte a, b, c; b = 19; c = 27;
a = (4 + (b + c) + b) + (2 + c) + (b + c);
    `, `
:0_ b__ asg 19_ 0 ____ ____ ____
:1_ c__ asg 27_ 0 ____ ____ ____
:2_ b__ add c__ 0 ____ ____ ____
:3_ 4__ add :2_ 0 ____ ____ ____
:4_ :3_ add b__ 0 ____ ____ ____
:5_ c__ inc 2__ 0 ____ ____ ____
:6_ :4_ add :5_ 0 ____ ____ ____
:8_ :6_ add :2_ 0 ____ ____ ____
:9_ a__ asg :8_ 0 ____ ____ ____
    `, `
        LXI  H, b
        MVI  M, 19
        LXI  H, c
        MVI  M, 27
        LDA  b
        MOV  B, A
        ADD  M
        MOV  C, A
        ADI  4
        ADD  B
        MOV  B, A
        MOV  A, M
        INR  A
        INR  A
        ADD  B
        ADD  C
        STA  a
    `);
    test(`
byte a, b, c; b = 19 != b; c = 27;
a = (4 + (b + c) + b) + (2 + c) + (b + c);
    `, `
:0_ 19_ neq b__ 0 ____ ____ ____
:1_ b__ asg :0_ 0 ____ ____ ____
:2_ c__ asg 27_ 0 ____ ____ ____
:3_ b__ add c__ 0 ____ ____ ____
:4_ 4__ add :3_ 0 ____ ____ ____
:5_ :4_ add b__ 0 ____ ____ ____
:6_ c__ inc 2__ 0 ____ ____ ____
:7_ :5_ add :6_ 0 ____ ____ ____
:9_ :7_ add :3_ 0 ____ ____ ____
:10 a__ asg :9_ 0 ____ ____ ____
    `, `
        LDA  b
        CPI  19
        MVI  A, 1
        JNZ  $+4
        XRA  A
        STA  b
        LXI  H, c
        MVI  M, 27
        ADD  M
        MOV  B, A
        ADI  4
        MOV  C, M
        LXI  H, b
        ADD  M
        MOV  D, A
        MOV  A, C
        INR  A
        INR  A
        ADD  D
        ADD  B
        STA  a
    `);
    test(`
byte a, b, c;
a = c + b + a + b;
    `, `
:0_ c__ add b__ 0 ____ ____ ____
:1_ :0_ add a__ 0 ____ ____ ____
:2_ :1_ add b__ 0 ____ ____ ____
:3_ a__ asg :2_ 0 ____ ____ ____
    `, `
        LDA  c
        LXI  H, b
        ADD  M
        MOV  B, M
        LXI  H, a
        ADD  M
        ADD  B
        MOV  M, A
    `);
    test(`
byte a, b, c;
a = (c + 2) << (b + 2);
    `, `
:0_ c__ inc 2__ 0 ____ ____ ____
:1_ b__ inc 2__ 0 ____ ____ ____
:2_ :0_ shl :1_ 0 ____ ____ ____
:3_ a__ asg :2_ 0 ____ ____ ____
    `, `
        LDA  c
        INR  A
        INR  A
        MOV  B, A
        LDA  b
        INR  A
        INR  A
        MOV  E, A
        MOV  A, B
        CALL @SHLF
        STA  a
    `);
    test(`
byte a, b, c;
a = b << (b + 2);
    `, `
:0_ b__ inc 2__ 0 ____ ____ ____
:1_ b__ shl :0_ 0 ____ ____ ____
:2_ a__ asg :1_ 0 ____ ____ ____
    `, `
        LDA  b
        MOV  B, A
        INR  A
        INR  A
        MOV  E, A
        MOV  A, B
        CALL @SHLF
        STA  a
    `);
    test(`
byte a, b, c;
a = 7 << (b + 2);
    `, `
:0_ b__ inc 2__ 0 ____ ____ ____
:1_ 7__ shl :0_ 0 ____ ____ ____
:2_ a__ asg :1_ 0 ____ ____ ____
    `, `
        LDA  b
        INR  A
        INR  A
        MOV  E, A
        MVI  A, 7
        CALL @SHLF
        STA  a
    `);
    test(`
byte a, b, c;
a = (b + 1) >> (b + 1);
    `, `
:0_ b__ inc ___ 0 ____ ____ ____
:2_ :0_ shr :0_ 0 ____ ____ ____
:3_ a__ asg :2_ 0 ____ ____ ____
    `, `
        LDA  b
        INR  A
        MOV  E, A
        CALL @SHRF
        STA  a
    `);
    test(`
byte a, b, c;
a = b + b;
    `, `
:0_ b__ add b__ 0 ____ ____ ____
:1_ a__ asg :0_ 0 ____ ____ ____
    `, `
        LDA  b
        ADD  A
        STA  a
    `);
    test(`
byte a, b, c;
a = b << b;
    `, `
:0_ b__ shl b__ 0 ____ ____ ____
:1_ a__ asg :0_ 0 ____ ____ ____
    `, `
        LDA  b
        MOV  E, A
        CALL @SHLF
        STA  a
    `);
    test(`
byte a, b, c;
a = b << c;
    `, `
:0_ b__ shl c__ 0 ____ ____ ____
:1_ a__ asg :0_ 0 ____ ____ ____
    `, `
        LDA  c
        MOV  E, A
        LDA  b
        CALL @SHLF
        STA  a
    `);
    test(`
byte a, b, c;
a = (b + 2) << b;
    `, `
:0_ b__ inc 2__ 0 ____ ____ ____
:1_ :0_ shl b__ 0 ____ ____ ____
:2_ a__ asg :1_ 0 ____ ____ ____
    `, `
        LDA  b
        MOV  E, A
        INR  A
        INR  A
        CALL @SHLF
        STA  a
    `);
    test(`
byte a, b, c;
a = (b + b) << b;
    `, `
:0_ b__ add b__ 0 ____ ____ ____
:1_ :0_ shl b__ 0 ____ ____ ____
:2_ a__ asg :1_ 0 ____ ____ ____
    `, `
        LDA  b
        MOV  E, A
        ADD  A
        CALL @SHLF
        STA  a
    `);
    test(`
byte a, b, c;
a = b + c << b;
    `, `
:0_ b__ add c__ 0 ____ ____ ____
:1_ :0_ shl b__ 0 ____ ____ ____
:2_ a__ asg :1_ 0 ____ ____ ____
    `, `
        LDA  b
        MOV  E, A
        LXI  H, c
        ADD  M
        CALL @SHLF
        STA  a
    `);
    test(`
byte a, b, c;
a = b + 2; c = a + 1;
    `, `
:0_ b__ inc 2__ 0 ____ ____ ____
:1_ a__ asg :0_ 0 ____ ____ ____
:2_ a__ inc ___ 0 ____ ____ ____
:3_ c__ asg :2_ 0 ____ ____ ____
    `, `
        LDA  b
        INR  A
        INR  A
        STA  a
        INR  A
        STA  c
    `);
    test(`
byte a, b, c;
a = b + 2; c = a + 1; b = 5 << c;
    `, `
:0_ b__ inc 2__ 0 ____ ____ ____
:1_ a__ asg :0_ 0 ____ ____ ____
:2_ a__ inc ___ 0 ____ ____ ____
:3_ c__ asg :2_ 0 ____ ____ ____
:4_ 5__ shl c__ 0 ____ ____ ____
:5_ b__ asg :4_ 0 ____ ____ ____
    `, `
        LDA  b
        INR  A
        INR  A
        STA  a
        INR  A
        STA  c
        MOV  E, A
        MVI  A, 5
        CALL @SHLF
        STA  b
    `);
    test(`
byte a, b, c;
a = b + 2; c = a + 1; b = c << 5;
    `, `
:0_ b__ inc 2__ 0 ____ ____ ____
:1_ a__ asg :0_ 0 ____ ____ ____
:2_ a__ inc ___ 0 ____ ____ ____
:3_ c__ asg :2_ 0 ____ ____ ____
:4_ c__ shl 5__ 0 ____ ____ ____
:5_ b__ asg :4_ 0 ____ ____ ____
    `, `
        LDA  b
        INR  A
        INR  A
        STA  a
        INR  A
        STA  c
        MVI  E, 5
        CALL @SHLF
        STA  b
    `);
    test(`
byte a, b, c;
a = b; c = 7;
    `, `
:0_ a__ asg b__ 0 ____ ____ ____
:1_ c__ asg 7__ 0 ____ ____ ____
    `, `
        LDA  b
        STA  a
        LXI  H, c
        MVI  M, 7
    `);
    test(`
byte a, b, c;
a = b; c = a;
    `, `
:0_ a__ asg b__ 0 ____ ____ ____
:1_ c__ asg a__ 0 ____ ____ ____
    `, `
        LXI  H, a
        LDA  b
        MOV  M, A
        STA  c
    `);
    test(`
byte a, b, c;
a = b; c = b;
    `, `
:0_ a__ asg b__ 0 ____ ____ ____
:1_ c__ asg b__ 0 ____ ____ ____
    `, `
        LDA  b
        STA  a
        STA  c
    `);
    test(`
byte a, b, c, d;
a = b; c = a; d = a + b;
    `, `
:0_ a__ asg b__ 0 ____ ____ ____
:1_ c__ asg a__ 0 ____ ____ ____
:2_ a__ add b__ 0 ____ ____ ____
:3_ d__ asg :2_ 0 ____ ____ ____
    `, `
        LXI  H, a
        LDA  b
        MOV  B, A
        MOV  M, A
        STA  c
        ADD  B
        STA  d
    `);
    test(`
byte a, b;
a = b + a - 1;
    `, `
:0_ b__ add a__ 0 ____ ____ ____
:1_ :0_ dec ___ 0 ____ ____ ____
:2_ a__ asg :1_ 0 ____ ____ ____
    `, `
        LDA  b
        LXI  H, a
        ADD  M
        DCR  A
        MOV  M, A
    `);
    test(`
byte a, b, c;
a = b + c; a = a; c = b - 1;
    `, `
:0_ b__ add c__ 0 ____ ____ ____
:1_ a__ asg :0_ 0 ____ ____ ____
:3_ b__ dec ___ 0 ____ ____ ____
:4_ c__ asg :3_ 0 ____ ____ ____
    `, `
        LDA  b
        MOV  B, A
        LXI  H, c
        ADD  M
        STA  a
        DCR  B
        MOV  M, B
    `);
    test(`
byte a, b, c;
a = b + c; a = a; c = b - 1; a = b;
    `, `
:0_ b__ add c__ 0 ____ ____ ____
:1_ a__ asg :0_ 0 ____ ____ ____
:3_ b__ dec ___ 0 ____ ____ ____
:4_ c__ asg :3_ 0 ____ ____ ____
:5_ a__ asg b__ 0 ____ ____ ____
    `, `
        LDA  b
        MOV  B, A
        LXI  H, c
        ADD  M
        STA  a
        MOV  A, B
        DCR  A
        MOV  M, A
        MOV  A, B
        STA  a
    `);
}

function compiler(prg, optimize, showtrp) {
    const [frg, vars] = compile(prg, optimize, showtrp);
    prg = `        ORG 100h\n\n${frg}\n        DB   76h\n`;
    for (let i = 0, n = codec.lib.length; i < n; i += 2)
        if (prg.indexOf(codec.lib[i]) >= 0) prg += `${codec.lib[i + 1]}\n`;
    prg += '\n        ORG 200h\n\n';
    for (const n in vars) {
        const v = vars[n];
        prg += `${n}:`.padEnd(8);
        if (v.dim) {
            let sz = v.dim;
            if (v.typ !== 0) sz += sz;
            prg += `DS   ${sz}`;
        }
        else if (v.typ === 0) prg += 'DB   0';
        else prg += 'DW   0';
        prg += '\n';
    }
    prg += '\n        END\n';
    return prg;
}

class CPM22MemIO extends MemIO {
    constructor(con, type, fname) {
        super(con, type);
        this.CPM_DRIVES = [null, null];
        this.dskstat = 0;
        this.iocount = 0;
        this.drv = 0;
        this.trk = 0;
        this.sec = 0;
        this.dma = 0;
        this.fname = fname;
        this.data = null;
        this.update = false;
    }
    rd(a) {
        return this.ram[a];
    }
    wr(a, v) {
        this.ram[a] = v;
    }
    input(p) {
        switch (p) {
            case 0x00: return (this.con.kbd.length > 0) ? 0xff : 0x00;                        // console status
            case 0x01: return (this.con.kbd.length > 0) ? this.con.kbd.shift() & 0x7f : 0x00; // console data
            case 0x02: return 0x1a;                                                           // printer status
            case 0x04: return 0xff;                                                           // auxilary status
            case 0x05: return 0x1a;                                                           // paper tape (aux)
            case 0x0a: return this.drv;                                                       // fdc drive
            case 0x0b: return this.trk;                                                       // fdc track
            case 0x0c: return this.sec & 0x00ff;                                              // fdc sector low
            case 0x0d: return (this.iocount === 0) ? 0xff : 0x00;                             // fdc command
            case 0x0e: return this.dskstat;                                                   // fdc status
            case 0x0f: return this.dma & 0x00ff;                                              // dma address low
            case 0x10: return (this.dma & 0xff00) >>> 8;                                      // dma address high
            case 0x11: return (this.sec & 0xff00) >>> 8;                                      // fdc sector high
            default: throw new Error(`unknown input port: ${fmt(p)}`);
        }
    }
    output(p, v) {
        switch (p) {
            case 0x01: v &= 0xff; this.con.display(v); break;                                 // console data
            case 0x0a: this.drv = v & 0xff; break;                                            // fdc drive
            case 0x0b: this.trk = v & 0xff; break;                                            // fdc track
            case 0x0c: this.sec = (this.sec & 0xff00) | (v & 0xff); break;                    // fdc sector low
            case 0x0d:                                                                        // fdc command
                if (v !== 0 && v !== 1) this.dskstat = 7;                          // illegal command
                else {
                    this.iocount++;
                    (async () => {
                        try {
                            const dd = this.CPM_DRIVES[this.drv];
                            if (dd === null || dd === undefined) this.dskstat = 1; // illegal drive
                            else {
                                if (this.update) {
                                    this.update = false;
                                    dd.diskRW(this.fname, this.data);
                                }
                                this.dskstat = dd.transfer(this.trk, this.sec, this.dma, v === 0, this);
                            }
                        } catch(e) {
                            console.error(e.stack);
                        }
                        this.iocount--;
                    })();
                }
                break;
            case 0x0f: this.dma = (this.dma & 0xff00) | (v & 0xff); break;                    // dma address low
            case 0x10: this.dma = (this.dma & 0x00ff) | ((v & 0xff) << 8); break;             // dma address high
            case 0x11: this.sec = (this.sec & 0x00ff) | ((v & 0xff) << 8); break;             // fdc sector high
            default: throw new Error(`unknown output port: ${fmt(p)}`);
        }
    }
    reset() {
        this.ram.fill(0x00);
        this.dskstat = 0; this.iocount = 0; this.drv = 0; this.trk = 0; this.sec = 0; this.dma = 0;
    }
    setData(data) {
        this.data = data;
        this.update = true;
    }
}

class LogConsole {
    constructor(color) {
        this.kbd = [];
        this.log = console._logwrapper(color);
    }
    display(v) {
        if (v !== 0x0a)
            if (v === 0x0d) this.log();
            else this.log(String.fromCharCode(v), console.NB);
    }
    keys(s) {
        for (let i = 0, n = s.length; i < n; i++) this.kbd.push(s.charCodeAt(i));
    }
}

function toData(str) {
    const arr = [];
    for (let i = 0, n = str.length; i < n; i++) {
        const b = str.charCodeAt(i);
        if (b === 0x0a) arr.push(0x0d);
        arr.push(b);
    }
    return new Uint8Array(arr);
}

async function mainRun() {
    await Promise.all([
        loadScript('../emu/github/emu8/js/js8080.js'),
        loadScript('../emu/github/emu8/js/disks.js')
    ]);
    const con = new LogConsole('#b38000'),
          mem = new CPM22MemIO(con, 0, 'PRG.ASM'),
          cpu = new GenCpu(mem, 0),
          emu = new Emulator(cpu, mem, 0),
          mon = new CPMMonitor(emu, 500);
    let prg = compiler(`
word aa, cc; byte bb, dd; word ee, ff;
aa = 1234; cc = 5678; bb = 12; dd = 56;
aa = cc + bb; cc = aa - dd; ee = aa + cc; ff = aa - cc;
          `, true, false);
    console.log(prg);
    mem.setData(toData(prg));
    con.keys('mac prg\n load prg\nprg\n');
    mem.CPM_DRIVES[0] = await CPMDisk('../emu/github/emu8/cpm/cpma.cpm');
    let boot_err;
    if ((boot_err = mem.CPM_DRIVES[0].transfer(0, 1, 0x0000, true, mem)) !== 0)
        console.error(`boot error: ${boot_err}`);
    await cpu.run();
    emu.printMem(0x200);
}

async function main() {
    doTests();
}

class KbdMon extends Keyboard {
    constructor(con, monitor) {
        super();
        this.con = con;
        this.monitor = monitor;
    }
    kbdHandler(txt, soft) {
        const val = super.kbdHandler(txt, soft);
        if (val !== null) {
            if (this.monitor.emu.CPU.RUN && val === 14) { // stop emulation on CTRL-n
                this.monitor.emu.stop();
                this.monitor.logger('\n');
                this.monitor.exec('x');
                return;
            }
            this.con.kbd.push(val);
            if (!this.monitor.emu.CPU.RUN) {              // monitor UI uses emulated console keyboard buffer
                this.con.display(val);
                if (val === 8) { this.con.kbd.pop(); this.con.kbd.pop(); }
                else if (val === 13) {
                    this.con.print('^[2K'); this.con.kbd.pop();
                    const cmd = this.con.kbd.reduce((str, val) => str + String.fromCharCode(val), '');
                    this.con.kbd.length = 0;
                    this.monitor.exec(cmd);
                }
            }
        }
    }
}

async function mainDebug() {
    await Promise.all([
        loadScript('../emu/github/emu8/js/js8080.js'),
        loadScript('../emu/github/emu8/js/disks.js')
    ]);
    const con = await createCon(amber, 'VT220'),
          mem = new CPM22MemIO(con, 0, 'PRG.ASM'),
          cpu = new GenCpu(mem, 0),
          emu = new Emulator(cpu, mem, 0),
          mon = new CPMMonitor(emu),
          kbd = new Kbd(con, mon);
    mem.CPM_DRIVES[0] = await CPMDisk('../emu/github/emu8/cpm/cpma.cpm');
    term.setPrompt('> ');
    let prg = compiler(`
word va, vc; byte vb, vd; word ve, vf;
va = 1234; vc = 5678; vb = 12; vd = 56;
va = vc + vb; vc = va - vd; ve = va + vc; vf = va - vc;
    `, true, true);
//0200: 3a 16 02 16 0c 38 3c 2c 38 00    true
//      3a 16 02 16 0c 38 3c 2c 38 00
//0200: 3a 16 02 16 0c 38 3c 2c 38 00    false
/*
*/
    console.log(prg);
    mem.setData(toData(prg));
    const cmd = 'mac prg\n load prg\n';
    for (let i = 0, n = cmd.length; i < n; i++) con.kbd.push(cmd.charCodeAt(i));
    mon.exec('on 0');
    while (true) mon.exec(await term.prompt());
}
