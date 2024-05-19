'use strict';

async function asmprog(scr) {
    const kbd = document.getElementById('kbd'),
          mon = document.getElementById('scr'),
          txt = document.createElement('textarea');
    txt.rows = '24'; txt.cols = '64'; txt.style.fontSize = '18px';
    txt.style.marginTop = '5px'; txt.style.marginBottom = '-10px';
    txt.style.border = '2px solid #808080'; txt.style.padding = '10px 10px';
    txt.style.backgroundColor = '#242526'; txt.style.color = '#b0b3b8';
    document.body.insertBefore(txt, mon);
    kbd.onfocus = e => txt.disabled = 'true'; kbd.onblur = e => txt.disabled = '';
    await loadScript('cpm/cpm.js');
    const hw = await cpm22(scr),
          cmd = hw.cmd,
          toggled = hw.toggleDisplay;
    hw.toggleDisplay = () => {
        toggled();
        txt.style.display = (txt.style.display === 'none') ? 'block' : 'none';
    };
    hw.cmd = async (command, parms) => {
        switch (command) {
            case 'asm':
                const [code, cycles, , cref] = Assembler().assemble(txt.value, 0x100, true);
                console.log(loadBin(code, 0x100), `[${cycles}]`);
                console.log(cref);
                SIM_DEBUG = cref;
                break;
            case 'lda':
                txt.value = await loadFile(parms[1], true);
                break;
            default: return cmd(command, parms);
        }
        return true;
    };
    return hw;
}

function Assembler(extrns = {}) {
    let names;
    const CODES = [
        ['NOP',       0,1,4 ],['LXI  B, ',  2,3,10],['STAX B',    0,1,7 ],['INX  B',    0,1,5 ],
        ['INR  B',    0,1,5 ],['DCR  B',    0,1,5 ],['MVI  B, ',  1,2,7 ],['RLC',       0,1,4 ],
        ['*NOP',      0,1,4 ],['DAD  B',    0,1,10],['LDAX B',    0,1,7 ],['DCX  B',    0,1,5 ],
        ['INR  C',    0,1,5 ],['DCR  C',    0,1,5 ],['MVI  C, ',  1,2,7 ],['RRC',       0,1,4 ],
        ['*NOP',      0,1,4 ],['LXI  D, ',  2,3,10],['STAX D',    0,1,7 ],['INX  D',    0,1,5 ],
        ['INR  D',    0,1,5 ],['DCR  D',    0,1,5 ],['MVI  D, ',  1,2,7 ],['RAL',       0,1,4 ],
        ['*NOP',      0,1,4 ],['DAD  D',    0,1,10],['LDAX D',    0,1,7 ],['DCX  D',    0,1,5 ],
        ['INR  E',    0,1,5 ],['DCR  E',    0,1,5 ],['MVI  E, ',  1,2,7 ],['RAR',       0,1,4 ],
        ['*NOP',      0,1,4 ],['LXI  H, ',  2,3,10],['SHLD ',     2,3,16],['INX  H',    0,1,5 ],
        ['INR  H',    0,1,5 ],['DCR  H',    0,1,5 ],['MVI  H, ',  1,2,7 ],['DAA',       0,1,4 ],
        ['*NOP',      0,1,4 ],['DAD  H',    0,1,10],['LHLD ',     2,3,16],['DCX  H',    0,1,5 ],
        ['INR  L',    0,1,5 ],['DCR  L',    0,1,5 ],['MVI  L, ',  1,2,7 ],['CMA',       0,1,4 ],
        ['*NOP',      0,1,4 ],['LXI  SP, ', 2,3,10],['STA  ',     2,3,13],['INX  SP',   0,1,5 ],
        ['INR  M',    0,1,10],['DCR  M',    0,1,10],['MVI  M, ',  1,2,10],['STC',       0,1,4 ],
        ['*NOP',      0,1,4 ],['DAD  SP',   0,1,10],['LDA  ',     2,3,13],['DCX  SP',   0,1,5 ],
        ['INR  A',    0,1,5 ],['DCR  A',    0,1,5 ],['MVI  A, ',  1,2,7 ],['CMC',       0,1,4 ],
        ['MOV  B, B', 0,1,5 ],['MOV  B, C', 0,1,5 ],['MOV  B, D', 0,1,5 ],['MOV  B, E', 0,1,5 ],
        ['MOV  B, H', 0,1,5 ],['MOV  B, L', 0,1,5 ],['MOV  B, M', 0,1,7 ],['MOV  B, A', 0,1,5 ],
        ['MOV  C, B', 0,1,5 ],['MOV  C, C', 0,1,5 ],['MOV  C, D', 0,1,5 ],['MOV  C, E', 0,1,5 ],
        ['MOV  C, H', 0,1,5 ],['MOV  C, L', 0,1,5 ],['MOV  C, M', 0,1,7 ],['MOV  C, A', 0,1,5 ],
        ['MOV  D, B', 0,1,5 ],['MOV  D, C', 0,1,5 ],['MOV  D, D', 0,1,5 ],['MOV  D, E', 0,1,5 ],
        ['MOV  D, H', 0,1,5 ],['MOV  D, L', 0,1,5 ],['MOV  D, M', 0,1,7 ],['MOV  D, A', 0,1,5 ],
        ['MOV  E, B', 0,1,5 ],['MOV  E, C', 0,1,5 ],['MOV  E, D', 0,1,5 ],['MOV  E, E', 0,1,5 ],
        ['MOV  E, H', 0,1,5 ],['MOV  E, L', 0,1,5 ],['MOV  E, M', 0,1,7 ],['MOV  E, A', 0,1,5 ],
        ['MOV  H, B', 0,1,5 ],['MOV  H, C', 0,1,5 ],['MOV  H, D', 0,1,5 ],['MOV  H, E', 0,1,5 ],
        ['MOV  H, H', 0,1,5 ],['MOV  H, L', 0,1,5 ],['MOV  H, M', 0,1,7 ],['MOV  H, A', 0,1,5 ],
        ['MOV  L, B', 0,1,5 ],['MOV  L, C', 0,1,5 ],['MOV  L, D', 0,1,5 ],['MOV  L, E', 0,1,5 ],
        ['MOV  L, H', 0,1,5 ],['MOV  L, L', 0,1,5 ],['MOV  L, M', 0,1,7 ],['MOV  L, A', 0,1,5 ],
        ['MOV  M, B', 0,1,7 ],['MOV  M, C', 0,1,7 ],['MOV  M, D', 0,1,7 ],['MOV  M, E', 0,1,7 ],
        ['MOV  M, H', 0,1,7 ],['MOV  M, L', 0,1,7 ],['HLT',       0,1,7 ],['MOV  M, A', 0,1,7 ],
        ['MOV  A, B', 0,1,5 ],['MOV  A, C', 0,1,5 ],['MOV  A, D', 0,1,5 ],['MOV  A, E', 0,1,5 ],
        ['MOV  A, H', 0,1,5 ],['MOV  A, L', 0,1,5 ],['MOV  A, M', 0,1,7 ],['MOV  A, A', 0,1,5 ],
        ['ADD  B',    0,1,4 ],['ADD  C',    0,1,4 ],['ADD  D',    0,1,4 ],['ADD  E',    0,1,4 ],
        ['ADD  H',    0,1,4 ],['ADD  L',    0,1,4 ],['ADD  M',    0,1,7 ],['ADD  A',    0,1,4 ],
        ['ADC  B',    0,1,4 ],['ADC  C',    0,1,4 ],['ADC  D',    0,1,4 ],['ADC  E',    0,1,4 ],
        ['ADC  H',    0,1,4 ],['ADC  L',    0,1,4 ],['ADC  M',    0,1,7 ],['ADC  A',    0,1,4 ],
        ['SUB  B',    0,1,4 ],['SUB  C',    0,1,4 ],['SUB  D',    0,1,4 ],['SUB  E',    0,1,4 ],
        ['SUB  H',    0,1,4 ],['SUB  L',    0,1,4 ],['SUB  M',    0,1,7 ],['SUB  A',    0,1,4 ],
        ['SBB  B',    0,1,4 ],['SBB  C',    0,1,4 ],['SBB  D',    0,1,4 ],['SBB  E',    0,1,4 ],
        ['SBB  H',    0,1,4 ],['SBB  L',    0,1,4 ],['SBB  M',    0,1,7 ],['SBB  A',    0,1,4 ],
        ['ANA  B',    0,1,4 ],['ANA  C',    0,1,4 ],['ANA  D',    0,1,4 ],['ANA  E',    0,1,4 ],
        ['ANA  H',    0,1,4 ],['ANA  L',    0,1,4 ],['ANA  M',    0,1,7 ],['ANA  A',    0,1,4 ],
        ['XRA  B',    0,1,4 ],['XRA  C',    0,1,4 ],['XRA  D',    0,1,4 ],['XRA  E',    0,1,4 ],
        ['XRA  H',    0,1,4 ],['XRA  L',    0,1,4 ],['XRA  M',    0,1,7 ],['XRA  A',    0,1,4 ],
        ['ORA  B',    0,1,4 ],['ORA  C',    0,1,4 ],['ORA  D',    0,1,4 ],['ORA  E',    0,1,4 ],
        ['ORA  H',    0,1,4 ],['ORA  L',    0,1,4 ],['ORA  M',    0,1,7 ],['ORA  A',    0,1,4 ],
        ['CMP  B',    0,1,4 ],['CMP  C',    0,1,4 ],['CMP  D',    0,1,4 ],['CMP  E',    0,1,4 ],
        ['CMP  H',    0,1,4 ],['CMP  L',    0,1,4 ],['CMP  M',    0,1,7 ],['CMP  A',    0,1,4 ],
        ['RNZ',       0,1,11],['POP  B',    0,1,10],['JNZ  ',     2,3,10],['JMP  ',     2,3,10],
        ['CNZ  ',     2,3,17],['PUSH B',    0,1,11],['ADI  ',     1,2,7 ],['RST  0',    0,1,11],
        ['RZ',        0,1,11],['RET',       0,1,10],['JZ   ',     2,3,10],['*JMP ',     2,3,10],
        ['CZ   ',     2,3,17],['CALL ',     2,3,17],['ACI  ',     1,2,7 ],['RST  1',    0,1,11],
        ['RNC',       0,1,11],['POP  D',    0,1,10],['JNC  ',     2,3,10],['OUT  ',     1,2,10],
        ['CNC  ',     2,3,17],['PUSH D',    0,1,11],['SUI  ',     1,2,7 ],['RST  2',    0,1,11],
        ['RC',        0,1,11],['*RET',      0,1,10],['JC   ',     2,3,10],['IN   ',     1,2,10],
        ['CC   ',     2,3,17],['*CALL ',    2,3,17],['SBI  ',     1,2,7 ],['RST  3',    0,1,11],
        ['RPO',       0,1,11],['POP  H',    0,1,10],['JPO  ',     2,3,10],['XTHL',      0,1,18],
        ['CPO  ',     2,3,17],['PUSH H',    0,1,11],['ANI  ',     1,2,7 ],['RST  4',    0,1,11],
        ['RPE',       0,1,11],['PCHL',      0,1,5 ],['JPE  ',     2,3,10],['XCHG',      0,1,5 ],
        ['CPE  ',     2,3,17],['*CALL ',    2,3,17],['XRI  ',     1,2,7 ],['RST  5',    0,1,11],
        ['RP',        0,1,11],['POP  PSW',  0,1,10],['JP   ',     2,3,10],['DI',        0,1,4 ],
        ['CP   ',     2,3,17],['PUSH PSW',  0,1,11],['ORI  ',     1,2,7 ],['RST  6',    0,1,11],
        ['RM',        0,1,11],['SPHL',      0,1,5 ],['JM   ',     2,3,10],['EI',        0,1,4 ],
        ['CM   ',     2,3,17],['*CALL ',    2,3,17],['CPI  ',     1,2,7 ],['RST  7',    0,1,11]
    ],
    isNaNext = str => str.match(/^[0-9a-f]+$/i) === null,
    findCode = stmt => {
        for (let i = 0; i < 256; i++) {
            const cod = CODES[i];
            if (stmt.indexOf(cod[0]) >= 0) return [i, ...cod];
        }
        throw new Error(`invalid operation: ${stmt}`);
    },
    toCode = (num, len) => {
        switch (len) {
            case 1: return [num & 0xff];
            case 2: return [num & 0xff, num >>> 8 & 0xff];
            default: throw new Error(`invalid parameter length: ${len} for ${num.toString(16)}`);
        }
    },
    toBytes = (prm, len) => {
        if (prm.charAt(0) === '"') {
            if (!prm.endsWith('"') || prm.length !== 3) throw new Error(`invalid parameter: ${prm}`);
            prm = prm.charCodeAt(1).toString(16);
        }
        return toCode(+`0x${prm}`, len);
    },
    code = [],
    getLabel = label => {
        let result = names[label];
        if (result === undefined) {
            result = [-1, []];     // address, refs: [[offset, data length, arith], ...]
            names[label] = result;
        }
        return result;
    },
    getOffs = str => {                   // address arithmetic
        const m = str.match('^(.+)([+-])(.+)$');
        if (m !== null) {
            const value = m[3].trim();
            if (isNaNext(value)) throw new Error(`invalid expression: ${str}`);
            const sign = (m[2] === '+') ? 1 : -1,
                  offs = +`0x${value}` * sign;
            m[0] = m[1].trim();          // clean name
            m[1] = offs;                 // offset
            m.length = 2;
        }
        return m;
    },
    handleLabel = (label, len, org) => {
        const arith = getOffs(label),
              offs = (arith !== null) ? arith[1] : 0;
        if (label.charAt(0) === '$') {   // special variable $
            if (len < 2) throw new Error(`invalid expression length: ${label}`);
            code.push(...toCode(org + code.length + offs, len));
            return;
        }
        if (arith !== null) label = arith[0];
        const nm = getLabel(label);
        let ref = nm[0];
        if (ref < 0) {
            nm[1].push([code.length, len, offs]); ref = 0;
        }
        else ref += offs;
        code.push(...toCode(ref, len));
    },
    resolveRefs = () => {
        for (const prop in names) {
            const [ref, refs] = names[prop];
            if (ref < 0) throw new Error(`undefined reference: ${prop}`);
            for (let i = 0, n = refs.length; i < n; i++) {
                let [pos, len, offs] = refs[i];
                const bytes = toCode(ref + offs, len);
                for (let j = 0; j < len; j++) code[pos++] = bytes[j];
            }
        }
    },
    handleEqu = (oper, org) => {
        const name = oper[1].trim();
        let value = oper[2].trim();
        if (isNaNext(value)) {
            if (value.charAt(0) !== '$') throw new Error(`invalid value: ${value} for ${name}`);
            const arith = getOffs(value),
                  offs = (arith !== null) ? arith[1] : 0;
            value = (org + code.length + offs).toString(16);
        }
        getLabel(name)[0] = +`0x${value}`;
    },
    handleDbDw = (oper, org) => {
        const op = oper[0],
              len = (op.indexOf('DB ') >= 0) ? 1 : 2,
              values = oper[1].trim().split(',');
        let i = 0, n = values.length;
        while (i < n) {
            let value = values[i++].trim();
            if (value.length === 0) throw new Error(`invalid statement: ${op}`);
            if (value.charAt(0) === '"') {
                while (i < n && !value.endsWith('"')) {               // string beginning
                    value += ',';                                     // restore ',' inside string
                    const prev = value.length;                        // save look back limit
                    value += values[i++];                             // add string part after ','
                    let j = value.length - 1;                         // last char of string
                    while (j >= prev && value.charAt(j) === ' ') j--; // skip ' ' after closing '"'
                    if (value.charAt(j) === '"') {                    // found closing '"'
                        value = value.substring(0, j + 1);            // trim spaces
                        break;
                    }
                }
                if (!value.endsWith('"')) throw new Error(`invalid parameter: ${value} at: ${op}`);
                for (let j = 1, m = value.length - 1; j < m; j++)
                    code.push(...toCode(+`0x${value.charCodeAt(j).toString(16)}`, len));
            }
            else if (isNaNext(value)) handleLabel(value, len, org);
            else code.push(...toCode(+`0x${value}`, len));
        }
    },
    handleDs = oper => {
        let name = oper[1].trim(), value;
        if (isNaNext(name)) {
            value = getLabel(name)[0];
            if (value < 0) throw new Error(`undefined reference: ${name} at: ${oper[0]}`);
        }
        else value = +`0x${name}`;
        for (let i = 0; i < value; i++) code.push(0x00);
    },
    genRefs = () => {
        const alns = [], nlns = [];
        let ares = '', nres = '';
        for (const prop in names) {
            const value = names[prop];
            alns.push(prop.padEnd(8, ' ') + ': ' + value[0].toString(16).padStart(4, '0'));
            nlns.push(value[0].toString(16).padStart(4, '0') + ': ' + prop.padEnd(8, ' '));
        }
        alns.sort(); nlns.sort();
        let p = 0;
        for (let i = 1, n = alns.length; i < n; i++) {
            if (alns[p].length > 0) { alns[p] += '    '; nlns[p] += '    '; }
            alns[p] += alns[i]; nlns[p] += nlns[i];
            if (alns[p].length >= 80) {
                alns[p] = alns[p].trim(); nlns[p] = nlns[p].trim();
                ares += alns[p] + '\n'; nres += nlns[p] + '\n';
                p++; alns[p] = ''; nlns[p] = '';
            }
        }
        if (alns[p] !== '') { ares += alns[p] + '\n'; nres += nlns[p] + '\n'; }
        return ares + '\n\n' + nres;
    },
    inStr = (str, pos) => {
        let quotes = 0;                          // check if inside string
        for (let k = pos - 1; k >= 0; k--) if (str.charAt(k) === '"') quotes++;
        return (quotes & 0x01) !== 0;            // odd - inside string
    },
    assemble = (txt, org = 0x100, cref = false) => {
        code.length = 0; names = {...extrns};    // initialize
        const prg = txt.split('\n');
        let cycles = 0, oper;
        for (let i = 0, n = prg.length; i < n; i++) {
            let stmt = prg[i].trim(),            // process line
                comm = stmt.indexOf(';');        // is comment?
            while (comm >= 0) {                  // check if in string
                if (inStr(stmt, comm)) comm = stmt.indexOf(';', comm + 1);
                else {                           // found, remove comment
                    stmt = stmt.substring(0, comm).trim();
                    break;                       // done processing comments
                }
            }
            if (stmt.length === 0) continue;     // skip empty line
            if ((oper = stmt.match('(.+) EQU (.+)')) !== null) {
                handleEqu(oper, org); continue;  // handle EQU
            }
            const col = stmt.match('^([^ "]+) *:(.*)$');
            if (col !== null) {                  // handle label
                const label = col[1];
                if (label.length === 0) throw new Error(`invalid label at: ${stmt}`);
                const nm = getLabel(label);
                if (nm[0] !== -1) throw new Error(`duplicate label: ${label}`);
                nm[0] = org + code.length;
                stmt = col[2].trim();
                if (stmt.length === 0) continue; // label only, skip
            }
            if ((oper = stmt.match('D[BW] (.+)')) !== null) {
                handleDbDw(oper, org); continue; // handle DB and DW
            }
            if ((oper = stmt.match('DS (.+)')) !== null) {
                handleDs(oper); continue;        // handle DS
            }
            const cmd = findCode(stmt);          // processor opcode
            code.push(cmd[0]); cycles += cmd[4];
            const prmlen = cmd[2];
            if (prmlen > 0) {                    // opcode parameter(s)
                const prm = stmt.substring(cmd[1].length).trim();
                if (!isNaNext(prm) || prm.charAt(0) === '"') code.push(...toBytes(prm, prmlen));
                else handleLabel(prm, prmlen, org);
            }
        }
        resolveRefs();                           // resolve forward references
        return [code, cycles, names, cref ? genRefs() : null];
    };
    return {assemble};
}
