'use strict';

async function compiler(scr) {
    const mon = document.getElementById('scr'),
          txt = document.createElement('textarea');
    txt.rows = '3'; txt.cols = '83'; txt.style.marginTop = '5px'; txt.style.marginBottom = '-10px';
txt.value = 'word a, b, c, d; byte e, f;\na = 0;';
    document.body.insertBefore(txt, mon);
    const kbd = document.getElementById('kbd');
    kbd.onfocus = ev => txt.disabled = 'true';
    kbd.onblur = ev => txt.disabled = '';
    await loadScript('cpm/cpm.js');
    const hw = await cpm22(scr);
    let out_dat = null;                                   // [match, error, tmp1, tmp2, timeout ref, resolve ref, reject ref]
    const out_org = hw.memo.output,                       // original ports output
          tmoutf = () => clearf(6, new Error('timeout')), // timeout function
          clearf = (num, val) => {                        // clear processing function, num - handler to call
              clearTimeout(out_dat[4]);                   // clear timeout
              hw.memo.output = out_org;                   // restore original handler
              const handler = out_dat[num];               // resolve or reject ref
              out_dat = null;                             // clear data
              handler(val);                               // call handler
          },
          waitos = (s, e = null, t = 60) => {             // wait for OS output - s to match, e to error match, t timeout in sec
              hw.memo.output = out_new;                   // install interceptor
              return new Promise((res, rej) => out_dat = [s, e, '', '', setTimeout(tmoutf, t * 1000), res, rej]);
          },
          out_new = (p, v) => {                           // intercept ports output
              out_org(p, v);                              // normal processing
              if (p === 0x01) {                           // console output
                  const chr = String.fromCharCode(v & 0xff);
                  out_dat[2] += chr;
                  if (out_dat[2].length > out_dat[0].length) out_dat[2] = out_dat[2].substring(1);
                  if (out_dat[2] === out_dat[0]) clearf(5, true);
                  else if (out_dat[1] !== null) {
                      out_dat[3] += chr;
                      if (out_dat[3].length > out_dat[1].length) out_dat[3] = out_dat[3].substring(1);
                      if (out_dat[3] === out_dat[1]) clearf(6, new Error(out_dat[1]));
                  }
              }
          },
          execcmd = async (cmd, expect, error = null, t = 20) => {
              run();                                      // start emulation
              for (let i = 0, n = cmd.length; i < n; i++) // enter command
                  hw.keyboard('', 229, cmd.charAt(i));
              await delay(300);                           // time to process input
              const p = waitos(expect, error, t);         // start listening
              hw.keyboard('', 13, '');                    // execute command
              let res;
              try { await p; res = null; } catch(e) { res = e; }
              CPU.RUN = false;                            // stop emulation
              if (res !== null) throw res;
          };
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
                          'decr': reg =>          `        DCR  ${reg}\n`,
                          'shl': `
@SHLF:  DCR  E
        RM
        ORA  A
        RZ
        RAL
        JMP  @SHLF`,
                          'shr': `
@SHRF:  DCR  E
        RM
        ORA  A
        RZ
        RAR
        JMP  @SHRF`,
                          'peephole': base => {
        // MOV  ?, A   begin
        //    ---
        // MOV  A, ?   match, remove if A and ? not changed
        base.phopt('MOV  A, (.)$', cnd => `MOV  ${cnd}, A`, cnd => {
            const pattern = [
                `MOV  [A${cnd}], `, `MVI  [A${cnd}], `, 'LDA  ', 'CALL ', 'CMA', `INR  [A${cnd}]`, `DCR  [A${cnd}]`,
                'ADI  ', 'ADD  ', 'SUI  ', 'SUB  ', 'XRI  ', 'XRA  ', 'ANI  ', 'ANA  ', 'ORI  ', 'ORA  ', 'RAL', 'RAR'
            ];
            if (cnd === 'M') pattern.push(['LXI  H, ']);
            return pattern;
        });
        // MOV  ?, any begin
        //    ---
        // MOV  E, ?   match if ? not M, remove if ? not changed; repl. ? at begin and ren. ? before MOV  ?, . or CALL
        base.phopt('MOV  E, ([^M])$', cnd => `MOV  ${cnd}, `, cnd => [`MOV  ${cnd}, `], (lines, start, i, cnd) => {
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
            cnd => [`ADI  ${cnd}`, `ADD  ${cnd}`, `SUI  ${cnd}`, `SUB  ${cnd}`, `MOV  ., ${cnd}`],
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
            if (cnd === 'M') pattern.push(['LXI  H, ']);
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
            if (start > 0 && (mtch = lines[start - 1].match('MOV  L, (.+)$')) !== null) {
                start--; cnd = mtch[1];
                ptrn = [`MOV  L, [^${cnd}]`, 'LXI  H, ', 'DAD  ', 'LHLD ', 'INX  H', 'DCX  H'];
                if (cnd === 'A') ptrn.push([
                    'MOV  A, ', 'MVI  A, ', 'LDA  ', 'CALL ', 'CMA', 'INR  A', 'DCR  A', 'ADI  ', 'ADD  ',
                    'SUI  ', 'SUB  ', 'XRI  ', 'XRA  ', 'ANI  ', 'ANA  ', 'ORI  ', 'ORA  ', 'RAL', 'RAR'
                ]);
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
            'MVI  H, ', 'MOV  H, ', 'MOV  L, ', 'LXI  H, ', 'DAD  ', 'LHLD ', 'INX  H', 'DCX  H'
        ]);
        // LXI  H, any begin
        // XCHG        match, remove and rename preceding H to D
        base.phopt('XCHG', cnd => `LXI  H, `, cnd => ['LHLD ', 'LXI  [DH], '], (lines, start, i, cnd) => {
            if (i !== start + 1) return false;
            lines.splice(i, 1);                                                   // remove match
            lines[start] = lines[start].replace('LXI  H, ', 'LXI  D, ');          // rename H at begin
            return true;
        });
                          },
                          'accW': 'HL',
                          'workW': 'DE',
                          'savW': 'S',
                          'addW': reg =>          `        DAD  ${reg}\n`,
                          'incrW': reg =>         `        INX  ${reg}\n`,
                          'decrW': reg =>         `        DCX  ${reg}\n`,
                          'loadaW': name =>       `        LHLD ${name}\n`,
                          'saveaW': name =>       `        SHLD ${name}\n`,
                          'swapW': () =>          `        XCHG\n`,
                          'saveW': () =>          '        PUSH H\n',
                          'restW': reg =>         `        POP  ${reg}\n`,
                          'subW': `
@SUBW:  MOV  A, L
        SUB  E
        MOV  L, A
        MOV  A, H
        SBB  D
        MOV  H, A
        RET`
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
byte a, b, c; b = 19; c = 27;
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
byte a, b, c; b = 19; c = 27;
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
        LDA  b
        MOV  B, A
        CPI  19
        MVI  A, 1
        JNZ  $+4
        XRA  A
        STA  b
        LXI  H, c
        MVI  M, 27
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
byte a, b, c;
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
byte a, b, c;
a = (c + 2) << (b + 2);
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
        LDA  b
        ADD  A
        STA  a
                `);
                test(`
byte a, b, c;
a = b << b;
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
        LDA  b
        MOV  E, A
        ADD  E
        CALL @SHLF
        STA  a
                `);
                test(`
byte a, b, c;
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
byte a, b, c;
a = b + 2; c = a + 1;
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
        LDA  b
        STA  a
        LXI  H, c
        MVI  M, 7
                `);
                test(`
byte a, b, c;
a = b; c = a;
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
        LDA  b
        STA  a
        STA  c
                `);
                test(`
byte a, b, c, d;
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
byte a, b;
a = b + a - 1;
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
                test(`
word a, b, c, d; byte e, f;
e = 2 + f; d = f + 2; c = f + 2;
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
        LHLD b
        LDA  c
        MOV  E, A
        MVI  D, 0
        DAD  D
        LDA  d
        ADI  4
        MOV  E, A
        MVI  D, 0
        DAD  D
        LDA  c
        ADI  6
        MOV  E, A
        MVI  D, 0
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
        MVI  D, 0
        CALL @SUBW
        SHLD c
        XCHG
        DAD  D
        SHLD e
        LHLD c
        XCHG
        CALL @SUBW
        SHLD f
                `);
                test(`
word a, b, c, d; byte e, f;
a = 5 + b + b + 1;
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
        LHLD b
        XCHG
        LHLD c
        DAD  D
        DAD  D
        SHLD a
                `);
                console.log(compile(txt.value));
                break;
            case 'test':
                await execcmd('b:', 'B>');
                await execcmd('dir', 'B>');
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
    },function Parser(emit) {
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
    // <decl> ::= 'byte' | 'word' <dvar> [ , <dvar> ]* ;
    // <asgn> ::= <id> '=' <expr> ;
    dvar = typ => { name(); emit('vdc', [token, typ]); },
    parse = prg => {
        text = prg; index = 0; token = ''; pb_idx = 0;
        getch(); spskip();
        while (look !== '') {
            name();
            if (token === 'byte' || token === 'word') {
                const typ = (token === 'byte') ? 0 : 1;
                dvar(typ); while (look === ',') { match(','); dvar(typ); } match(';');
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
    findtrp = adr => {
        for (let i = triples.length - 1; i >= 0; i--) {
            const trp = triples[i];
            if (trp.adr === adr) return trp;
        }
        throw new Error(`TAC not found: ${adr}`);
    },
    typW = (typ, val) => {
        if (typ === null || val === null) return false;
        if ('num var trp'.indexOf(typ) < 0) throw new Error(`unknown operand type: ${typ}`);
        return (typ === 'num' && (val < -128 || val > 255)) || // word number
                (typ === 'var' && vars[val].typ === 1) ||      // word variable
                (typ === 'trp' && findtrp(val).typ === 1);     // word triplet
    },
    rentrp = (trp, oldadr, newtyp, newadr) => {
        let changed = false;
        if (trp.typ1 === 'trp' && trp.val1 === oldadr) { trp.typ1 = newtyp; trp.val1 = newadr; changed = true; }
        if (trp.typ2 === 'trp' && trp.val2 === oldadr) { trp.typ2 = newtyp; trp.val2 = newadr; changed = true; }
        if (changed) trp.typ = (typW(trp.typ1, trp.val1) || typW(trp.typ2, trp.val2)) ? 1 : 0;
    },
    create = (typ1, val1, oper, typ2 = null, val2 = null, push = true) => {
        const typ = (typW(typ1, val1) || typW(typ2, val2)) ? 1 : 0,
              trp = {'adr': `:${tripleNum++}`, typ1, val1, oper, typ2, val2, typ};
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
        vars,                                                  // variables - var: val=reg[reg], typ=0|1
        results,                                               // triplets  - adr: reg[reg]
        consts,                                                // constants - num: reg[reg]
        code;                                                  // generated assembly
    const regs = codec.regs,                                   // regs      - reg: val=var|adr|num, ref=<trp,first>
    loc = (trp, first) => {                                    // get operand location
        const typ = first ? trp.typ1 : trp.typ2;
        switch (typ) {
            case 'num': return consts[first ? trp.val1 : trp.val2] ?? null;
            case 'trp': return results[first ? trp.val1 : trp.val2] ?? null;
            case 'var': return vars[first ? trp.val1 : trp.val2].val ?? null;
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
        if (isNaN(rval)) {
            if (rval.startsWith('*')) return;                  // variable reference, skip
            if (rval.charAt(0) === ':') results[rval] = rmreg(results[rval], reg);
            else vars[rval].val = rmreg(vars[rval].val, reg);
        }
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
    ttrp = (adr, typ1, val1, typ = 0) => { return {adr, typ1, val1, typ}; }, // create temporary triplet
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
        codec.peephole({fndop, chgop, phopt});                 // peephole optimization
        return code;
    },
    inregW = (lc, reg) => inreg(lc, reg.charAt(0)) && inreg(lc, reg.charAt(1)),
    slocW = (trp, first, reg) => { sloc(trp, first, reg.charAt(0)); sloc(trp, first, reg.charAt(1)); },
    saveW = trp => {
        const rv0 = regs[codec.accW.charAt(0)], rv1 = regs[codec.accW.charAt(1)];
        if (rv0.val === null || rv1.val === null || rv0.val !== rv1.val) return;
        rv0.ref[0].adr = trp.adr;                              // set start address for usage counter
        if (used(...rv0.ref, 1) <= 0) return;                  // not used
if (regs[codec.savW].val !== null) throw new Error(`can't save acc value at: ${trp.adr}`);
        code += codec.saveW();                                 // save accumulator
        sloc(...rv0.ref, codec.savW);                          // set location
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
                if (inreg(lc, codec.savW)) {                   // saved
                    code += codec.restW(reg.charAt(0));        // restore
                    clrreg(codec.savW);                        // clear save register
                } else {                                       // type 0 result
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
                if (trp.typ1 === 'var') {                      // load variable
                    saveW(trp);                                // save accumulator if needed
                    loadW(trp, true, codec.accW, loc(trp, true));
                }
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
                    default: rg = codec.accW.charAt(0); break;                               // 1    1      111
                }
                switch (trp.oper) {
                    case 'add': code += codec.addW(rg); break;
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
                if (vars[trp.val1].typ !== 1) throw new Error(`illegal assignment: ${trp.val1}`);
                const vlc = loc(trp, false);
                if (!inregW(vlc, codec.accW)) loadW(trp, false, codec.accW, vlc);
                code += codec.saveaW(trp.val1);
                break;
            default: throw new Error(`illegal operation: ${trp.oper}`);
        }
        if (trp.oper !== 'asg') {                              // assignment not used in expressions
            const trpr = ttrp(trp.adr, 'trp', trp.adr, 1);
            slocW(trpr, true, codec.accW);
        }
    };
    return {generate};
}

// var a: word, b: byte, c: word, d: byte, e, f: word;
// a = 1234; c = 5678; b = 12; d = 56;
// a = c + b; c = a - d; e = a + c; f = a - c;
//
//       LXI  H, 04d2    LXI  H, 1234
//       SHLD 01e8       SHLD a
//       LXI  H, 162e    LXI  H, 5678
//       SHLD 01eb       SHLD c
//       LXI  H, 01ea    LXI  H, b
//       MVI  M, 0c      MVI  M, 12
//       LXI  H, 01ed    LXI  H, d
//       MVI  M, 38      MVI  M, 56
//       LDA  01ea       LHLD c
//       LXI  D, 01eb    LDA  b
//       CALL 0163       MOV  E, A
//                       MVI  D, 0
//                       DAD  D
//       SHLD 01e8       SHLD a
//       INX  D          LDA  d
//       LDAX D          MOV  E, A
//       XCHG            MVI  D, 0
//       CALL 017a       CALL @SUBW
//       SHLD 01eb       SHLD c
//                       XCHG
//       DAD  D          DAD  D
//       SHLD 01ee       SHLD e
//       LHLD 01eb       LHLD c
//                       XCHG
//       CALL 0173       CALL @SUBW
//       SHLD 01f0       SHLD f
//
// 0163: XCHG
//       MOV  E, A
//       MVI  D, 00
//       XCHG
//       LDAX D
//       ADD  L
//       MOV  L, A
//       INX  D
//       LDAX D
//       ADC  H
//       MOV  H, A
//       RET
//
// 0170: MOV  E, A
//       MVI  D, 00
// 0173: MOV  A, E
//       SUB  L
//       MOV  L, A
//       MOV  A, D
//       SBB  H
//       MOV  H, A
//       RET
//
// 017a: MOV  C, A
//       MVI  B, 00
//       MOV  A, E
//       SUB  C
//       MOV  L, A
//       MOV  A, D
//       SBB  B
//       MOV  H, A
//       RET
//
// word a, b, c, d;
// d = b + c - 2 - (a + b + 7);
//
//       LHLD c          LHLD b
//       XCHG            XCHG
//       LHLD b          LHLD c
//       DAD  D          DAD  D
//       DCX  H          DCX  H
//       DCX  H          DCX  H
//       PUSH H          PUSH H
//       LHLD b
//       XCHG
//       LHLD a          LHLD a
//       DAD  D          DAD  D
//       LXI  D, 0007    LXI  D, 7
//       DAD  D          DAD  D
//       POP  D          POP  D
//                       XCHG
//       CALL 014c       CALL @SUBW
//       SHLD d          SHLD d
//
// 014c: MOV  A, E
//       SUB  L
//       MOV  L, A
//       MOV  A, D
//       SBB  H
//       MOV  H, A
//       RET
//
// word a, b, c, d;
// d = b + c - 8 - (a + 7 + b);
//
//       LHLD c          LHLD b
//       XCHG            XCHG
//       LHLD b          LHLD c
//       DAD  D          DAD  D
//       XCHG
//       MVI  A, 08      LXI  D, 8
//       CALL 0158       CALL @SUBW
//       LXI  D, 0007    PUSH H
//       PUSH H          LHLD a
//       LHLD a          LXI  D, 7
//       DAD  D          DAD  D
//       PUSH H
//                       XCHG
//       LHLD b          LHLD b
//       POP  B
//       DAD  B          DAD  D
//       POP  D          POP  D
//                       XCHG
//       CALL 0151       CALL @SUBW
//       SHLD d          SHLD d
//
// 014e: MOV  E, A
//       MVI  D, 00
// 0151: MOV  A, E
//       SUB  L
//       MOV  L, A
//       MOV  A, D
//       SBB  H
//       MOV  H, A
//       RET
//
// 0158: MOV  C, A
//       MVI  B, 00
// 015b: MOV  A, E
//       SUB  C
//       MOV  L, A
//       MOV  A, D
//       SBB  B
//       MOV  H, A
//       RET
//
// word a, b, c, d; byte e, f;
// a = 3 + (7 + ((b + c) + (d + 4) + (c + 6) + 5));
//
//      LHLD 01bd        LHLD b
//      XCHG             XCHG
//      LHLD 01bb        LHLD c
//      DAD  D           DAD  D
//      LXI  D, 0004     PUSH H
//      PUSH H           LHLD d
//      LHLD 01bf        LXI  D, 4
//      DAD  D           DAD  D
//      POP  B           POP  D
//      DAD  B           DAD  D
//      LXI  D, 0006     PUSH H
//      PUSH H           LHLD c
//      LHLD 01bd        LXI  D, 6
//      DAD  D           DAD  D
//      POP  B           POP  D
//      DAD  B           DAD  D
//      LXI  D, 0005     LXI  D, 5
//      DAD  D           DAD  D
//      LXI  B, 0007     LXI  D, 7
//      DAD  B           DAD  D
//      INX  H           INX  H
//      INX  H           INX  H
//      INX  H           INX  H
//      SHLD 01b9        SHLD a
//
// word a, b; byte c, d, e, f;
// a = 3 + (7 + ((b + c) + (d + 4) + (c + 6) + 5));
//
//      LDA  01c9        LHLD b
//      LXI  D, 01c7     LDA  c
//      CALL 0154        MOV  E, A
//                       MVI  D, 0
//                       DAD  D
//      LDA  01ca        LDA  d
//      ADI  04          ADI  4
//      MOV  E, A        MOV  E, A
//      MVI  D, 00       MVI  D, 0
//      DAD  D           DAD  D
//      LDA  01c9        LDA  c
//      ADI  06          ADI  6
//      MOV  E, A        MOV  E, A
//      MVI  D, 00       MVI  D, 0
//      DAD  D           DAD  D
//      LXI  D, 0005     LXI  D, 5
//      DAD  D           DAD  D
//      LXI  B, 0007     LXI  D, 7
//      DAD  B           DAD  D
//      INX  H           INX  H
//      INX  H           INX  H
//      INX  H           INX  H
//      SHLD 01c5        SHLD a
//
// 0154:XCHG
//      MOV  E, A
//      MVI  D, 00
//      XCHG
//      LDAX D
//      ADD  L
//      MOV  L, A
//      INX  D
//      LDAX D
//      ADC  H
//      MOV  H, A
//      RET
//
// word a, b, c, d; byte e, f;
// a = 5 + b + b + 1;
//
//      LHLD 01a2        LXI  D, 5
//      LXI  B, 0005     LHLD b
//      DAD  B           DAD  D
//      PUSH H           XCHG
//      LHLD 01a2        LHLD b
//      POP  B
//      DAD  B           DAD  D
//      INX  H           INX  H
//      SHLD 01a0        SHLD a
//
// word a, b, c, d; byte e, f;
// a = b + 5 + b;
//
//      LXI  D, 0005     LHLD b
//      LHLD 01a1        LXI  D, 5
//      DAD  D           DAD  D
//      PUSH H           XCHG
//      LHLD 01a1        LHLD b
//      POP  B
//      DAD  B           DAD  D
//      SHLD 019f        SHLD a
//
