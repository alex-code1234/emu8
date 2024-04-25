'use strict';

async function compiler(scr) {
    const mon = document.getElementById('scr'),
          txt = document.createElement('textarea');
    txt.rows = '3'; txt.cols = '83'; txt.style.marginTop = '5px'; txt.style.marginBottom = '-10px';
txt.value = 'var a, b, c;\na = (4 + b + c + b) + (2 + c) + (b + c);';
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
                      gen = CodeGen();
                il.init();
                parser.parse(txt.value);
                gen.generate(...il.code());
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

function CodeGen() {
    let triples,                                               // 3-address code
        vars,                                                  // variables - var: reg[reg]
        results,                                               // triplets  - adr: reg[reg]
        consts;                                                // constants - num: reg[reg]
    const regs = {                                             // regs      - reg: val=var|adr|num, ref=<trp,first>
        'A': {'val': null, 'ref': null},
        'B': {'val': null, 'ref': null}, 'C': {'val': null, 'ref': null}
    },
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
    sloc = (trp, first, reg) => {                              // set operand location
        const typ = first ? trp.typ1 : trp.typ2,
              val = first ? trp.val1 : trp.val2,
              rval = regs[reg].val;
        if (rval !== null)                                     // clear previous location
            if (isNaN(rval))
                if (rval.charAt(0) === ':') results[rval] = rmreg(results[rval], reg);
                else vars[rval] = rmreg(vars[rval], reg);
            else consts[rval] = rmreg(consts[rval], reg);
        switch (typ) {
            case 'num': consts[val] = adreg(consts[val], reg); break;
            case 'trp': results[val] = adreg(results[val], reg); break;
            case 'var': vars[val] = adreg(vars[val], reg); break;
            default: throw new Error(`unknown operand type: ${typ}`);
        }
        const rg = regs[reg]; rg.val = val; rg.ref = [{...trp}, first];
    },
    used = (trp, first, start = 1) => {                        // find operand ref forward
        let idx = 0, cnt = 0;
        while (triples[idx].adr !== trp.adr) idx++;            // skip to current triplet
        idx += start;                                          // starting from next triplet by default
        const n = triples.length,
              typ = first ? trp.typ1 : trp.typ2,
              val = first ? trp.val1 : trp.val2;
        while (idx < n) {
            const t = triples[idx];
            if ((t.typ1 === typ && t.val1 === val) || (t.typ2 === typ && t.val2 === val)) cnt++;
            idx++;
        }
        return cnt;
    },
    swap = trp => {                                            // swap operands
        const typ = trp.typ1, val = trp.val1;
        trp.typ1 = trp.typ2; trp.val1 = trp.val2;
        trp.typ2 = typ; trp.val2 = val;
    },
    inreg = (lc, reg) => lc !== null && lc.indexOf(reg) >= 0,  // check if reg in location
    const1 = (trp, first) =>                                   // one time constant
            (first ? trp.typ1 : trp.typ2) === 'num' && used(trp, first) === 0,
    rgwork = () => {                                           // get best secondary register
        let refsB, refsC;
        if (regs['B'].val === null || (refsB = used(...regs['B'].ref)) === 0) return 'B';
        if (regs['C'].val === null || (refsC = used(...regs['C'].ref)) === 0) return 'C';
        if (refsB === undefined) refsB = used(...regs['B'].ref);
        if (refsC === undefined) refsC = used(...regs['C'].ref);
        return (refsB <= refsC) ? 'B' : 'C';
    },
    issave = (res, acc) => acc.val !== null &&                 // check if save acc (res - skip next triplet)
            used(...acc.ref, res ? 2 : 1) > 0 && loc(...acc.ref).length < 2,
    save = () => {
        
    },
    load1 = (trp, canswap) => {                                // load primary operand
        const lc = loc(trp, true);
        if (inreg(lc, 'A')) return;                            // already loaded
        if (canswap && trp.typ2 !== null && inreg(loc(trp, false), 'A')) {
            swap(trp); return;                                 // swappable and secondary already loaded
        }
        const rgA = regs['A'];
        if (/*rgA.val !== null*/issave(false, rgA)) {                                // save accumulator
            const slc = rgwork();                              // in working register
            console.log(`        MOV  ${slc}, A`);             // move to save
            sloc(...rgA.ref, slc);                             // update location
        }
        if (lc !== null)                                       // load from reg
            console.log(`        MOV  A, ${lc.charAt(0)}`);
        else switch (trp.typ1) {
            case 'num':                                        // load immediate
                console.log(`        MVI  A, ${trp.val1}`);
                break;
            case 'var':                                        // load from mem
                console.log(`        LDA  ${trp.val1}`);
                break;
            default: throw new Error(`unknown operand type: ${trp.typ1}`);
        }
        sloc(trp, true, 'A');                                  // set location
    },
    load2 = trp => {                                           // load secondary operand
        let lc = loc(trp, false);
        if (lc !== null) return lc.charAt(0);                  // already loaded
        lc = rgwork();                                         // get working register
        switch (trp.typ2) {
            case 'num':                                        // load immediate
                console.log(`        MVI  ${lc}, ${trp.val2}`);
                break;
            case 'var':                                        // load from mem
                console.log(`        LXI  H, ${trp.val2}`);
                if (used(trp, false) === 0) return 'M';        // one time usage optimization
                console.log(`        MOV  ${lc}, M`);
                break;
            default: throw new Error(`unknown operand type: ${trp.typ2}`);
        }
        sloc(trp, false, lc);                                  // set location
        return lc;
    },
    generate = (trpls, vrs) => {
        triples = trpls; vars = vrs; results = {}; consts = {};
        for (const p in regs) { const rg = regs[p]; rg.val = null; rg.ref = null; }
        for (let i = 0, n = triples.length; i < n; i++) {
            const trp = triples[i];
            console.log(trp.adr, '=', trp.val1, trp.oper, trp.val2 ?? '');
            switch (trp.oper) {
                case 'add':
                    if (const1(trp, true)) swap(trp);          // one time usage optimization
                    load1(trp, true);
                    if (const1(trp, false))                    // one time usage optimization
                        console.log(`        ADI  ${trp.val2}`);
                    else
                        console.log(`        ADD  ${load2(trp)}`);
                    const t = {'adr': trp.adr, 'typ1': 'trp', 'val1': trp.adr};
                    sloc(t, true, 'A');
                    if (/*used(t, true, 2) > 0*/issave(true, regs['A'])) {
                        console.log(`        MOV  D, A`);             // move to save
                        // set location
                    }
                    break;
            }
        }
    };
    return {generate};
}
