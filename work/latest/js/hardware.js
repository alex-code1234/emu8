'use strict';

async function defaultHW(scr, opts) {
    let opt = opts.get('boot');                                                       // boot as URL
    if (opt !== null) return await initModule(opts, 'boot', [], scr);
    opt = opts.get('cpu_type'); if (opt !== null) setCpuType(+opt);                   // set requested cpu
    const {con, toggleDisplay, cinfo} = await initModule(opts, 'mon', ['js/monitor.js', 'createConsole'], scr),
          memo = await initModule(opts, 'mem', ['', 'createMemo'], con),
          cpu = await initModule(opts, 'cpu', ['', 'createCpu'], memo),
          {keyboard, kinfo, keyboardFS} = await initModule(opts, 'kbd', ['', 'createKeyboard'], con, memo),
          info = `${cinfo ?? 'Unknown'} monitor with ${kinfo ?? 'unknown'} keyboard\n` +
                  `CPU: ${cpuName(CPUTYPE)}, memory: ${memo.size ? memo.size / 1024 : '???'}K, ` +
                  ((CPUTYPE === 2) ?
                          'memory map:\n' +
                          '    F000: console  [ASCII code]                 (write)\n' +
                          '    F000: keyboard [ASCII code, FF - not ready] (read)' :
                          'supported ports (hex):\n' +
                          '    00: console    [ASCII code]                 (output)\n' +
                          '    00: keyboard   [ASCII code, FF - not ready] (input)');
    async function runTest(instrs, stop = null) {
        const tmpInst = CPU_INSTR_CNT, tmpStp = HLT_STOP;
        CPU_INSTR_CNT = instrs; HLT_STOP = true;
        if (stop !== null) CPU.STOP = stop;
        try { await run(); }
        finally { CPU_INSTR_CNT = tmpInst; HLT_STOP = tmpStp; }
    }
    async function cmd(command, parms) {
        let tmp, idx, len;
        switch (command) {
            case 'escs':
                if (parms.length < 2) console.error('missing: seq'); else con.print(parms[1]); break;
            case 'tests':
                switch (CPUTYPE) {
                    case 0: console.log('names: 8080test 80z80test 8080pre 8080ex1'); break;
                    case 1: console.log('names: 80z80test z80exall'); break;
                    case 2:
                        console.log('IDs: 0 - all valid opcodes test,', console.NB);
                        console.log('1 - extended opcodes test, 2 - interrupts test');
                        break;
                    case 3:
                    case 4:
                        console.log('names: add bcdcnv bitwise cmpneg control datatrnf div interrupt');
                        console.log('       jmpmov jump1 jump2 mul rep rotate segpr shifts strings sub');
                        console.log('       codegolf');
                        break;
                }
                break;
            case 'test':
                switch (CPUTYPE) {
                    case 0:
                    case 1:
                        if (parms.length < 2) { console.error('missing: name'); break; }
                        loadBin(await loadFile('tests/' + parms[1].toUpperCase() + '.COM', false), 0x0100);
                        loadBin([                                                     // CP/M stub
                            0x3e,0x0a,0xd3,0x00,0x76,0x3e,0x02,0xb9,0xc2,0x0f,0x00,0x7b,0xd3,0x00,0xc9,
                            0x0e,0x24,0x1a,0xb9,0xc2,0x17,0x00,0xc9,0xd3,0x00,0x13,0xc3,0x11,0x00
                        ], 0x0000);
                        CPU.setRegisters(['x', 'af', '0', 'bc', '0', 'de', '0', 'hl', '0', 'sp', '0', 'pc', '100']);
                        await runTest(CPU_INSTR_CNT * 1000);
                        break;
                    case 2:
                        if (parms.length < 2) { console.error('missing: ID'); break; }
                        switch (idx = pi(parms[1])) {
                            case 0:
                                con.print('all valid opcodes test:_'); await delay(0);
                                loadBin(await loadFile('tests/N6502TEST.BIN', false), 0x0000);
                                CPU.reset(); CPU.setPC(0x400);
                                await runTest(1200000000, 0x3469);
                                con.print((CPU.getPC() === 0x3469) ? 'ok~' : 'error~');
                                break;
                            case 1:
                                con.print('extended opcodes test:~'); await delay(0);
                                loadBin(await loadFile('tests/N6502TEST_EXT.BIN', false), 0x2000);
                                loadBin([0x8d, 0x00, 0xf0, 0x60], 0x2033);            // STA $F000 : RTS - print char
                                loadBin([0x02], 0x202b);                              // KIL - stop on tests end
                                loadBin([0x02], 0x22bf);                              // KIL - stop on test fail
                                CPU.reset(); CPU.setPC(0x2000);
                                await runTest(1000000, 0x10000);
                                break;
                            case 2:
                                con.print('interrupts test:_________'); await delay(0);
                                loadBin(await loadFile('tests/N6502TEST_INT.BIN', false), 0x0400);
                                CPU.reset(); CPU.setPC(0x400);
                                do {
                                    tmp = CPU.getPC(); CPU.step();
                                    switch (tmp) {
                                        case 0x0434: case 0x0464: case 0x04a3: case 0x04de: CPU.setInterrupt(1); break;
                                        case 0x05c8: case 0x05f8: case 0x0637: case 0x0672: CPU.setInterrupt(0); break;
                                        case 0x06a0: case 0x06db: CPU.setInterrupt(1); CPU.setInterrupt(0); break;
                                    }
                                } while (tmp !== CPU.getPC());
                                con.print((tmp === 0x06ec) ? 'ok~' : 'error~');
                                break;
                            default: console.error(`invalid ID: ${idx}`); break;
                        }
                        break;
                    case 3:
                    case 4:
                        if (parms.length < 2) { console.error('missing: name'); break; }
                        if ((tmp = parms[1]) === 'codegolf') {
                            loadBin(await loadFile('tests/CODEGOLF', false), 0x00000);
                            CPU.reset(); CPU.setRegisters(['x', 'cs', '0000', 'ip', '0000', 'sp', '0100']);
                            con.print('^[?25l');                                      // hide cursor to stop scroll
                            await runTest(CPU_INSTR_CNT);
                            for (let i = 0x08000; i <= 0x087cf; i++) {                // print screen
                                const addr = i - 0x08000,
                                      y = addr / 80 | 0, x = addr % 80;
                                let value = memo.rd(i);
                                if (value === 0) value = 0x20;
                                con.print(`^[${y + 1};${x + 1}H`); con.display(value);
                            }
                            con.print('^[?25h');                                      // show cursor
                            break;
                        }
                        con.print(`${tmp}:_`); await delay(0);
                        for (let i = 0; i < 1024; i++)                                // clear memory
                            memo.wr(i, 0x00);
                        loadBin(await loadFile(`tests/${tmp.toUpperCase()}.BIN`, false), 0xf0000);
                        CPU.reset(); CPU.setRegisters(['x', 'cs', 'f000', 'ip', 'fff0']);
                        await runTest(CPU_INSTR_CNT);
                        if (tmp === 'jmpmov')
                            con.print(((memo.rd(0) | memo.rd(1) << 8) === 0x4001) ? 'ok~' : 'error~');
                        else {
                            idx = await loadFile(`tests/RES_${tmp.toUpperCase()}.BIN`, false);
                            len = (tmp === 'mul') ? 0x80 :                            // only OF, CF flags set
                                  (tmp === 'div') ? 0x90 :                            // flags undefined
                                  idx.length;
                            tmp = '';
                            for (let i = 0; i < len; i++) {
                                const t_exp = idx[i], t_org = memo.rd(i);
                                if (t_exp !== t_org) {
                                    tmp = `${fmt(i, 5)}_-_${fmt(t_exp)}.${fmt(t_org)}`;
                                    break;
                                }
                            }
                            con.print((tmp.length === 0) ? 'ok~' : `error_(${tmp})~`);
                        }
                        break;
                }
                break;
            case 'boot':                                                              // boot as command
                if (parms.length < 2) { console.error('missing: name [fnc]'); break; }
                tmp = new URL(location.href); idx = tmp.searchParams;
                idx.set('boot', parms[1]); if (parms.length > 2) idx.set('boot_name', parms[2]);
                location.href = tmp;                                                  // reload page
                break;
            default: return false;
        }
        return true;
    }
    return {
        cpu,                                                                          // cpu
        memo,                                                                         // memory/ports access
        toggleDisplay,                                                                // console visibility
        keyboard,                                                                     // keyboard
        info,                                                                         // optional HW info
        cmd,                                                                          // optional command processor
        keyboardFS                                                                    // full screen keyboard
    };
}

async function createConsole(scr) {
    const con = await VT_100(scr);
    return {
        con,                                                                          // console
        'toggleDisplay': () => con.toggle(),                                          // console visibility
        'cinfo': 'VT-100'                                                             // optional info
    };
}

async function createMemo(con) {
    let ram = new Uint8Array((CPUTYPE < 3) ? 0x10000 : 0x100000);                     // 8bit: 64K, 16bit: 1M
    const result = {};
    if (CPUTYPE === 2) {                                                              // memory mapped IO
        result.rd = a => (a === 0xf000) ? (con.kbd.length > 0) ? con.kbd.shift() & 0xff : 0xff : ram[a];
        result.wr = (a, v) => { if (a === 0xf000) con.display(v & 0xff); else ram[a] = v; };
    } else {
        result.rd = a => ram[a];                                                      // memory
        result.wr = (a, v) => ram[a] = v;
        result.input = p => {                                                         // input ports
            switch (p) {
                case 0x00: return (con.kbd.length > 0) ? con.kbd.shift() & 0xff : 0xff;
                default: throw new Error(`unknown input port: ${p.toString(16).padStart(2, '0')}`);
            }
        };
        result.output = (p, v) => {                                                   // output ports
            switch (p) {
                case 0x00: con.display(v & 0xff); break;
                default: throw new Error(`unknown output port: ${p.toString(16).padStart(2, '0')}`);
            }
        };
    }
    result.size = ram.length;                                                         // optional RAM size
    return result;
}

async function createCpu(memo) {
    switch (CPUTYPE) {
        case 0:                                                                       // 8080
            await loadScript('js/js8080.js'); return new Cpu(memo);
        case 1:                                                                       // Z80
            await loadScript('js/jsZ80.js'); return createZ80(memo);
        case 2:                                                                       // 6502
            await loadScript('js/js6502.js'); return createN6502(memo);
        case 3:                                                                       // 8086
        case 4:                                                                       // 80186
            await loadScript('js/js8086.js'); const c = new Intel8086(memo.wr, memo.rd);
            c.peripherals.push({                                                      // enable ports
                'isConnected': p => p === 0x00,
                'portIn': (w, p) => memo.input(p),
                'portOut': (w, p, v) => memo.output(p, v)
            });
            CPU_186 = CPUTYPE - 3; return c;
        default: throw new Error(`invalid cpu: ${CPUTYPE}`);
    }
}

async function createKeyboard(con, memo) {
    return {
        'keyboard': async (key, code, value) => {                                     // keyboard
            if (value === null) {
                if (memo.key) memo.key(null);                                         // optional key preview
                return;
            }
            let val = null;
            switch (code) {
                case 51: val = 27;  break;                                            // VK_ESCAPE     ctrl-4
                case 37: val = 19;  break;                                            // VK_LEFT
                case 39: val = 4;   break;                                            // VK_RIGHT
                case 8:  val = 8;   break;                                            // VK_BACK_SPACE
                case 46: val = 127; break;                                            // VK_DEL
                case 84: val = 9;   break;                                            // VK_TAB        ctrl-t
                case 13: val = 13;  break;                                            // VK_ENTER
                case 87: val = 5;   break;                                            // VK_UP         ctrl-w
                case 83: val = 18;  break;                                            // VK_PAGE_UP    ctrl-s
                case 90: val = 24;  break;                                            // VK_DOWN       ctrl-z
                case 76: val = 3;   break;                                            // VK_PAGE_DOWN  ctrl-l
                case 229: val = value.charCodeAt(0); break;
            }
            if (val === null && key >= 'a' && key <= 'z')
                val = key.charCodeAt(0) - 96;                                         // CTRL-<a..z>
            if (val !== null) {
                val &= 0xff;
                if (memo.key) { val = memo.key(val); if (val === null) return; }      // optional key preview
                con.kbd.push(val);
            }
        },
        'kinfo': 'ANSI',                                                              // optional info
        'keyboardFS': con => (shft, ctrl, alt, txt) => {                              // full screen keyboard
            let val = null;
            switch (txt) {
                case 'Esc': val = 27; break;
                case 'F1':
                case 'F2':
                case 'F3':
                case 'F4':
                case 'F5':
                case 'F6':
                case 'F7':
                case 'F8':
                case 'F9':
                case 'F10':
                case 'F11':
                case 'F12': break;
                case 'Backspace': val = 8; break;
                case 'Tab': val = 9; break;
                case 'Enter': val = 13; break;
                case 'Space': val = 32; break;
                case 'Insert': val = 15; break;
                case 'PgUp': val = 18; break;
                case 'Del': val = 127; break;
                case 'Home':
                case 'End': val = 2; break;
                case 'PgDn': val = 3; break;
                case '\u2190': val = 19; break;
                case '\u2191': val = 5; break;
                case '\u2192': val = 4; break;
                case '\u2193': val = 24; break;
                default:
                    if (txt.length > 1) val = txt.charCodeAt(shft ? 0 : 1);
                    else {
                        if (!shft) txt = txt.toLowerCase();
                        val = txt.charCodeAt(0);
                    }
                    break;
            }
            if (val !== null) {
                val &= 0xff;
                if (ctrl) {
                    if (val >= 0x60) val -= 0x60;
                    if (val >= 0x40) val -= 0x40;
                }
                con.kbd.push(val);
            }
        }
    };
}
