'use strict';

async function compiler(scr) {
    const mon = document.getElementById('scr'),
          txt = document.createElement('textarea');
    txt.rows = '3'; txt.cols = '83'; txt.style.marginTop = '5px'; txt.style.marginBottom = '-10px';
txt.value = 'var a, b, c;\na = b + c; a = a; c = b - 1;';
    document.body.insertBefore(txt, mon);
    const kbd = document.getElementById('kbd');
    kbd.onfocus = ev => txt.disabled = 'true';
    kbd.onblur = ev => txt.disabled = '';
    await loadScript('cpm/cpm.js');
    const hw = await cpm22(scr);
    const cmd = hw.cmd;
    hw.cmd = async (command, parms) => {
        switch (command) {
            case 'cmp':
                const il = IL(),
                      parser = Parser(il.emit),
                      gen = CodeGen({
                          'regs': {
                              'A': {'val': null, 'ref': null},
                              'B': {'val': null, 'ref': null}, 'C': {'val': null, 'ref': null},
                              'D': {'val': null, 'ref': null}, 'E': {'val': null, 'ref': null},
                              'H': {'val': null, 'ref': null}, 'L': {'val': null, 'ref': null},
                              'S': {'val': null, 'ref': null}
                          },
                          'acc': 'A',
                          'mem': 'H',
                          'work': 'BCD',
                          'ref': 'M',
                          'prm': 'E',
                          'move': (dest, src) =>  `        MOV  ${dest}, ${src}\n`,
                          'movi': (dest, val) =>  `        MVI  ${dest}, ${val}\n`,
                          'loada': name =>        `        LDA  ${name}\n`,
                          'loadr': (reg, name) => `        LXI  ${reg}, ${name}\n`,
                          'savea': name =>        `        STA  ${name}\n`,
                          'callp': name =>        `        CALL ${name}\n`,
                          'invra': () =>          '        CMA\n',
                          'incr': reg =>          `        INR  ${reg}\n`,
                          'adi': val =>           `        ADI  ${val}\n`,
                          'add': reg =>           `        ADD  ${reg}\n`,
                          'sui': val =>           `        SUI  ${val}\n`,
                          'sub': reg =>           `        SUB  ${reg}\n`,
                          'xri': val =>           `        XRI  ${val}\n`,
                          'xra': reg =>           `        XRA  ${reg}\n`,
                          'ani': val =>           `        ANI  ${val}\n`,
                          'ana': reg =>           `        ANA  ${reg}\n`,
                          'ori': val =>           `        ORI  ${val}\n`,
                          'ora': reg =>           `        ORA  ${reg}\n`,
                          'cpi': val =>           `        CPI  ${val}\n`,
                          'cmp': reg =>           `        CMP  ${reg}\n`,
                          'ral': () =>            '        RAL\n',
                          'rar': () =>            '        RAR\n',
                          'jz': addr =>           `        JZ   ${addr}\n`,
                          'jnz': addr =>          `        JNZ  ${addr}\n`,
                          'jc': addr =>           `        JC   ${addr}\n`,
                          'jnc': addr =>          `        JNC  ${addr}\n`,
                          'decr': reg =>          `        DCR  ${reg}\n`
                      }),
                      compile = prg => {
                          il.init();
                          parser.parse(prg);
                          return gen.generate(...il.code());
                      },
                      test = (prg, res) => {
                          const code = compile(prg);
//                          console.clear();
                          if (code.trim() !== res.trim())
                              throw new Error(`program:\n${prg}\ngenerated:\n${code}\nexpected:\n${res}`);
                      };
                test(`
var a, b, c; b = 19; c = 27;
a = (4 + b + c + b) + (2 + c) + (b + c);
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
        MOV  D, A
        ADI  2
        ADD  C
        MOV  C, A
        MOV  A, B
        ADD  D
        ADD  C
        STA  a
                `);
                test(`
var a, b, c; b = 19; c = 27;
a = (4 + (b + c) + b) + (2 + c) + (b + c);
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
        ADI  2
        ADD  B
        ADD  C
        STA  a
                `);
                test(`
var a, b, c; b = 19 != b; c = 27;
a = (4 + (b + c) + b) + (2 + c) + (b + c);
                `, `
        LDA  b
        MOV  B, A
        CPI  19
        MVI  A, 1
        JNZ  $+4
        XRA  A
        LXI  H, b
        MOV  M, A
        LXI  H, c
        MVI  M, 27
        ADD  M
        MOV  C, A
        ADI  4
        ADD  B
        MOV  B, A
        MOV  A, M
        ADI  2
        ADD  B
        ADD  C
        STA  a
                `);
                test(`
var a, b, c;
a = c + b + a + b;
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
var a, b, c;
a = (c + 2) << (b + 2);
                `, `
        LDA  c
        MVI  B, 2
        ADD  B
        MOV  C, A
        LDA  b
        ADD  B
        MOV  E, A
        MOV  A, C
        CALL @SHLF
        STA  a
                `);
                test(`
var a, b, c;
a = b << (b + 2);
                `, `
        LDA  b
        MOV  B, A
        ADI  2
        MOV  E, A
        MOV  A, B
        CALL @SHLF
        STA  a
                `);
                test(`
var a, b, c;
a = 7 << (b + 2);
                `, `
        LDA  b
        ADI  2
        MOV  E, A
        MVI  A, 7
        CALL @SHLF
        STA  a
                `);
                test(`
var a, b, c;
a = (b + 1) >> (b + 1);
                `, `
        LDA  b
        INR  A
        MOV  E, A
        CALL @SHRF
        STA  a
                `);
                test(`
var a, b, c;
a = b + b;
                `, `
        LDA  b
        ADD  A
        STA  a
                `);
                test(`
var a, b, c;
a = b << b;
                `, `
        LDA  b
        MOV  E, A
        CALL @SHLF
        STA  a
                `);
                test(`
var a, b, c;
a = b << c;
                `, `
        LDA  c
        MOV  E, A
        LDA  b
        CALL @SHLF
        STA  a
                `);
                test(`
var a, b, c;
a = (b + 2) << b;
                `, `
        LDA  b
        MOV  E, A
        ADI  2
        CALL @SHLF
        STA  a
                `);
                test(`
var a, b, c;
a = (b + b) << b;
                `, `
        LDA  b
        MOV  E, A
        ADD  E
        CALL @SHLF
        STA  a
                `);
                test(`
var a, b, c;
a = b + c << b;
                `, `
        LDA  b
        MOV  E, A
        LXI  H, c
        ADD  M
        CALL @SHLF
        STA  a
                `);
                test(`
var a, b, c;
a = b + 2; c = a + 1;
                `, `
        LDA  b
        ADI  2
        LXI  H, a
        MOV  M, A
        INR  A
        STA  c
                `);
                test(`
var a, b, c;
a = b + 2; c = a + 1; b = 5 << c;
                `, `
        LDA  b
        ADI  2
        LXI  H, a
        MOV  M, A
        INR  A
        LXI  H, c
        MOV  M, A
        MOV  E, A
        MVI  A, 5
        CALL @SHLF
        STA  b
                `);
                test(`
var a, b, c;
a = b + 2; c = a + 1; b = c << 5;
                `, `
        LDA  b
        ADI  2
        LXI  H, a
        MOV  M, A
        INR  A
        LXI  H, c
        MOV  M, A
        MVI  E, 5
        CALL @SHLF
        STA  b
                `);
                test(`
var a, b, c;
a = b; c = 7;
                `, `
        LDA  b
        STA  a
        LXI  H, c
        MVI  M, 7
                `);
                test(`
var a, b, c;
a = b; c = a;
                `, `
        LXI  H, a
        LDA  b
        MOV  M, A
        STA  c
                `);
                test(`
var a, b, c;
a = b; c = b;
                `, `
        LDA  b
        STA  a
        STA  c
                `);
                test(`
var a, b, c, d;
a = b; c = a; d = a + b;
                `, `
        LXI  H, a
        LDA  b
        MOV  M, A
        STA  c
        LXI  H, b
        ADD  M
        STA  d
                `);
                test(`
var a, b;
a = b + a - 1;
                `, `
        LDA  b
        LXI  H, a
        ADD  M
        DCR  A
        MOV  M, A
                `);
                test(`
var a, b, c;
a = b + c; a = a; c = b - 1;
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
var a, b, c;
a = b + c; a = a; c = b - 1; a = b;
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
                console.log(compile(txt.value));
                break;
            default: return cmd(command, parms);
        }
        return true;
    };
    return hw;
}

function Parser(emit) {
    let text, index, look, token, pb_idx;
    const
    getch = () => look = text.charAt(index++),
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
    // <exp5> ::= ( <expr> ) | <number> | <id>
    // <exp4> ::= ~ <exp4> | <exp5>
    // <exp3> ::= <exp4> [ + <exp4> | - <exp4> ]*
    // <exp2> ::= <exp3> [ << <exp3> | >> <exp3> ]*
    // <exp1> ::= <exp2> [ == <exp2> | != <exp2> | '>' <exp2> | '<' <exp2> ]*
    // <expr> ::= <exp1> [ & <exp1> | '|' <exp1> | ^ <exp1> ]*
    exp5 = () => {
        if (look === '(') { match('('); expr(); match(')'); }
        else if (digit(look)) { num(); emit('num', token); }
        else { name(); emit('var', token); }
    },
    exp4 = () => {
        if (look === '~') { match('~'); exp4(); emit('inv'); }
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
    // <dvar> ::= <id>
    // <decl> ::= 'var' <dvar> [ , <dvar> ]* ;
    // <asgn> ::= <id> '=' <expr> ;
    dvar = () => { name(); emit('vdc', token); },
    parse = prg => {
        text = prg; index = 0; token = ''; pb_idx = 0;
        getch(); spskip();
        while (look !== '') {
            name();
            if (token === 'var') {
                dvar(); while (look === ',') { match(','); dvar(); } match(';');
            }
            else if (look === '=') {
                emit('var', token);
                match('='); expr(); match(';'); emit('asg');
            }
            else expect('declaration or assignment');
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
            case 'xor': o1 ^= o2; break;      case 'and': o1 &= o2; break;
            case 'oro': o1 |= o2; break;
            default: throw new Error(`unknown id: ${id}`);
        }
        stack.push(['num', o1]);
    },
    create = (typ1, val1, oper, typ2 = null, val2 = null) => {
        const trp = {'adr': `:${tripleNum++}`, typ1, val1, oper, typ2, val2};
        triples.push(trp);
        return trp;
    },
    gen = (id, two) => {
        const triple = [o1[0], o1[1], id];
        if (two) triple.push(o2[0], o2[1]);
        const trp = create(...triple);
        stack.push(['trp', trp.adr]);
    },
    rename = (start, oldadr, newtyp, newadr) => {
        for (let i = start, n = triples.length; i < n; i++) {
            const t = triples[i];
            if (t.typ1 === 'trp' && t.val1 === oldadr) { t.typ1 = newtyp; t.val1 = newadr; }
            if (t.typ2 === 'trp' && t.val2 === oldadr) { t.typ2 = newtyp; t.val2 = newadr; }
        }
    },
    arith = () => {
        let i = 0;
        while (i < triples.length) {           // all triples
            const t = triples[i];              // current
            switch (t.oper) {
                case 'add':                    // +1 +0 optimization
                    if ((t.typ1 === 'num' && t.val1 === 1) || (t.typ2 === 'num' && t.val2 === 1)) {
                        t.oper = 'inc';
                        if (t.typ1 === 'num') { t.typ1 = t.typ2; t.val1 = t.val2; }
                        t.typ2 = undefined; t.val2 = undefined;
                    }
                    else if ((t.typ1 === 'num' && t.val1 === 0) || (t.typ2 === 'num' && t.val2 === 0)) {
                        const adr = (t.typ1 === 'num') ? t.val2 : t.val1,
                              typ = (t.typ1 === 'num') ? t.typ2 : t.typ1;
                        triples.splice(i, 1);  // remove +0 triplet
                        rename(i, t.adr, typ, adr);
                        continue;
                    }
                    break;
                case 'sub':                    // -1 -0 optimization
                    if (t.typ2 === 'num' && t.val2 === 1) {
                        t.oper = 'dec';
                        t.typ2 = undefined; t.val2 = undefined;
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
                        if (t3.typ1 === 'trp' && t3.val1 === t2.adr) t3.val1 = t1.adr;
                        if (t3.typ2 === 'trp' && t3.val2 === t2.adr) t3.val2 = t1.adr;
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
        switch (id) {
            case 'var':
                if (vars[value] === undefined) throw new Error(`undeclared var: ${value}`);
                stack.push([id, value]);
                break;
            case 'vdc':
                if (vars[value] !== undefined) throw new Error(`duplicate var: ${value}`);
                vars[value] = null;
                break;
            case 'num': stack.push([id, value | 0]); break;
            case 'inv':
                o1 = stack.pop();
                if (o1[0] === 'num') { o1 = o1[1]; calc(id); return; }
                gen(id, false);
                break;
            case 'add': case 'sub':
            case 'shl': case 'shr':
            case 'eql': case 'neq': case 'grt': case 'lst':
            case 'xor': case 'and': case 'oro':
                o2 = stack.pop(); o1 = stack.pop();
                if (o1[0] === 'num' && o2[0] === 'num') { o1 = o1[1]; o2 = o2[1]; calc(id); return; }
                gen(id, true);
                break;
            case 'asg':
                const expr = stack.pop();
                create(...stack.pop(), id, ...expr);
                break;
            default: throw new Error(`unknown id: ${id}`);
        }
    };
    return {init, code, emit};
}

function CodeGen(codec) {
    let triples,                                               // 3-address code
        vars,                                                  // variables - var: reg[reg]
        results,                                               // triplets  - adr: reg[reg]
        consts,                                                // constants - num: reg[reg]
        code;                                                  // generated assembly
    const regs = codec.regs,                                   // regs      - reg: val=var|adr|num, ref=<trp,first>
    loc = (trp, first) => {                                    // get operand location
        const typ = first ? trp.typ1 : trp.typ2;
        switch (typ) {
            case 'num': return consts[first ? trp.val1 : trp.val2] ?? null;
            case 'trp': return results[first ? trp.val1 : trp.val2] ?? null;
            case 'var': return vars[first ? trp.val1 : trp.val2] ?? null;
            default: throw new Error(`unknown operand type: ${typ}`);
        }
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
        if (isNaN(rval))
            if (rval.charAt(0) === ':') results[rval] = rmreg(results[rval], reg);
            else vars[rval] = rmreg(vars[rval], reg);
        else consts[rval] = rmreg(consts[rval], reg);
    },
    sloc = (trp, first, reg) => {                              // set operand location
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
            case 'var': vars[val] = adreg(vars[val], reg); break;
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
    used = (trp, first, start = 1) => {                        // find operand ref forward
        let idx = 0, cnt = 0, t;
        while (triples[idx].adr !== trp.adr) idx++;            // skip to current triplet
        const n = triples.length,
              typ = first ? trp.typ1 : trp.typ2,
              val = first ? trp.val1 : trp.val2;
        idx += start;                                          // starting from next triplet by default
        while (idx < n) {
            t = triples[idx++];
            if ((t.oper !== 'asg' && t.typ1 === typ && t.val1 === val) || (t.typ2 === typ && t.val2 === val)) cnt++;
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
            let usg = used(...rg.ref);
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
if (res[1] > 0) console.log(`warning: discarded ${res}`);
        return res[0];
    },
    issave = (trp, start, acc) => {                            // check if save acc (start - starting triplet to check)
        if (acc.val === null) return false;
        acc.ref[0].adr = trp.adr;                              // set start address for usage counter
        return used(...acc.ref, start) > 0 && loc(...acc.ref).length < 2;
    },
    ttrp = (adr, typ1, val1) => { return {adr, typ1, val1}; }, // create temporary triplet
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
                    start = fndop(lines, i, bgn);
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
        lc = (reg === null) ? rgwork(trp, codec.work, mem) : reg; // get working register if not provided
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
                        if (mem.val !== null) {                // save previous mem variable
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
                break;
            default: throw new Error(`unknown operand type: ${trp.typ2}`);
        }
        sloc(trp, false, lc);                                  // set location
        return lc;
    },
    generate = (trpls, vrs) => {
        triples = trpls; vars = vrs; results = {}; consts = {}; code = '';
        for (const p in regs) { const rg = regs[p]; rg.val = null; rg.ref = null; }
        for (let i = 0, n = triples.length; i < n; i++) {
            const trp = triples[i];
            switch (trp.oper) {
                case 'inv':                                    // unary operations
                case 'inc':
                case 'dec':
                    load1(trp, false);
                    switch (trp.oper) {
                        case 'inv': code += codec.invra(); break;
                        case 'inc': code += codec.incr(codec.acc); break;
                        case 'dec': code += codec.decr(codec.acc); break;
                    }
                    break;
                case 'add': case 'sub':                        // swappable binary operations
                case 'xor': case 'and': case 'oro':
                case 'eql': case 'neq': case 'grt': case 'lst':
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
                        case 'eql': case 'neq': case 'grt': case 'lst':
                            adi = codec.cpi; add = codec.cmp;
                            trp.swap = swapped;                // remember swap flag for post-processing
                            break;
                    }
                    if (const1(trp, false))                    // one time usage optimization
                        code += adi(trp.val2);
                    else {
                        const wr = load2(trp);                 // side effect - modifies code, no nesting
                        code += add(wr);
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
                    let prevtrp, swpf, cnd;
                    if (i > 0 && (prevtrp = triples[i - 1]) && (swpf = prevtrp.swap) !== undefined) {
                        code += codec.movi(codec.acc, 1);      // comparison post-processing
                        switch (prevtrp.oper) {
                            case 'eql': cnd = codec.jz; break;
                            case 'neq': cnd = codec.jnz; break;
                            case 'grt': cnd = swpf ? codec.jc : codec.jnc; break;
                            case 'lst': cnd = swpf ? codec.jnc : codec.jc; break;
                        }
                        code += cnd('$+4');
                        code += codec.xra(codec.acc);
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
                default: throw new Error(`unknown operator: ${trp.oper}`);
            }
            if (trp.oper !== 'asg') {                          // assignment not used in expressions
                sloc(ttrp(trp.adr, 'trp', trp.adr), true, codec.acc);
                save(trp, 2);                                  // save result if needed
            }
        }
        // MOV  ?, A        begin
        //    ---
        // MOV  A, ?        match, remove if A and ? not changed
        phopt('MOV  A, (.)$', cnd => `MOV  ${cnd}, A`, cnd => {
            const pattern = [
                `MOV  [A${cnd}], `, `MVI  [A${cnd}], `, 'LDA  ', 'CALL ', 'CMA', `INR  [A${cnd}]`, `DCR  [A${cnd}]`,
                'ADI  ', 'ADD  ', 'SUI  ', 'SUB  ', 'XRI  ', 'XRA  ', 'ANI  ', 'ANA  ', 'ORI  ', 'ORA  ', 'RAL', 'RAR'
            ];
            if (cnd === 'M') pattern.push(['LXI  H, ']);
            return pattern;
        });
        // MOV  ?, any      begin
        //    ---
        // MOV  E, ?        match if ? not M, remove if ? not changed; replace ? at begin and rename ? till MOV  ?, ... | CALL
        phopt('MOV  E, ([^M])$', cnd => `MOV  ${cnd}, `, cnd => [`MOV  ${cnd}, `], (lines, start, i, cnd) => {
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
        // MOV  ?, any | $  match, remove begin if ? not used
        phopt('MOV  ([^EM]), A$', cnd => `MOV  ${cnd}, `,
            cnd => [`ADI  ${cnd}`, `ADD  ${cnd}`, `SUI  ${cnd}`, `SUB  ${cnd}`, `MOV  ., ${cnd}`],
            null, true
        );
        // MOV  A, ?        begin
        //    ---
        // MOV  M | E, A    match, remove begin if only INR or DCR opers in --- and ? not used forward; rename A to ?
        phopt('MOV  A, ([^EM])$', cnd => 'MOV  [EM], A$', cnd => ['^\(\(?!DCR  A|INR  A\).\)*$'],
                (lines, start, i, cnd, end) => {
            if (chgop(lines, [`MOV  ., ${cnd}`, `[^,]+ ${cnd}$`], end + 1, lines.length - 1, `MOV  ${cnd}, `)[0])
                return false;                                                     // ? used forward, exit
            lines.splice(i, 1);                                                   // remove begin
            const regexp = new RegExp(' A$');
            for (let k = i; k <= end; k++)
                lines[k] = lines[k].replace(regexp, ` ${cnd}`);                   // rename A to ?
            return true;
        }, true);
        return code;
    };
    return {generate};
}
