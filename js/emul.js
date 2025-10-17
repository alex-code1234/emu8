'use strict';

class GenCpu {
    constructor(memo, type) {
        this.CPU_INSTR_CNT = 10240; // ~8.4MHz for 8080 and Z80, ~4Mhz for 8086, ~12MHz for 6502
        this.HLT_STOP = true;       // stop CPU on HLT (must be false for MP/M)
        this.STOP = -1;             // stop address
        this.STOP_REGS = [];        // register values on stop
        this.RUN = false;           // running
        switch (type) {
            case 0: this.cpu = new Cpu(memo); break;     // 8080
            case 1: this.cpu = createZ80(memo); break;   // Z80
            case 2: this.cpu = createN6502(memo); break; // 6502
            case 3:                                      // 8086
            case 4:                                      // 80186
                this.pic = new Intel8259();
                this.dma = new Intel8237();
                this.ppi = new Intel8255(this.pic);
                this.cpu = new Intel8086(
                    memo.wr.bind(memo), memo.rd.bind(memo), // bind if memo is class
                    this.pic, new Intel8253(this.pic),
                    memo.int.bind(memo)                     // bind if memo is class
                );
                this.cpu.peripherals.push(this.dma);
                this.cpu.peripherals.push(this.ppi);
                this.cpu.peripherals.push(new Intel8272(this.dma, this.pic));
                this.crtc = new Motorola6845();
                if (type === 4) {
                    this.crtc = new EGA(this.crtc, memo.add, memo.ram);
                    this.cpu.peripherals.push(new EMS(memo.add));
                    MACHINE = 1;
                    CPU_186 = 1;
                }
                this.cpu.peripherals.push(this.crtc);
                memo.setChipset(this.crtc, this.ppi);
                break;
            default: throw new Error(`invalid cpu: ${type}`);
        }
        memo.CPU = this; // set CPU reference
    }
    chkRegs() {
        if (this.STOP_REGS.length === 0) return true;
        const state = this.cpu.cpuStatus();
        for (let i = 0, n = this.STOP_REGS.length; i < n; i++) {
            const cond = this.STOP_REGS[i],
                  m = state.match(cond[1]);
            if (m === null || m.length < 2) continue; // ignore malformed entry
            let svalue = m[1], value = cond[3];
            if (value.startsWith('..')) svalue = '..' + svalue.substring(2);
            else if (value.length < svalue.length) svalue = svalue.substr(0, value.length);
            switch (cond[2]) {
                case '<': if (value >= svalue) return false;
                case '>': if (value <= svalue) return false;
                case '==': if (value !== svalue) return false;
                case '!=': if (value === svalue) return false;
                case '<=': if (value > svalue) return false;
                case '>=': if (value < svalue) return false;
            }
        }
        return true;
    }
    async run() {
        this.RUN = true;
        let print = true, res;
        do {
            for (let i = 0; i < this.CPU_INSTR_CNT; i++) { // number of instructions not cycles!
                try { res = this.cpu.step(); }
                catch(exc) {
                    console.error(exc);
                    this.RUN = false;
                    break;
                }
                if (!res || (this.STOP >= 0 && this.cpu.getPC() === this.STOP && this.chkRegs())) {
                    if (res) { console.info('STOP'); this.STOP = -1; this.STOP_REGS.length = 0; }
                    else if (!this.HLT_STOP) break;
                    else console.info('HALT');
                    this.RUN = false;
                    print = false;
                    break;
                }
                if (!this.RUN) break;
            }
            await delay(0);
        } while (this.RUN);
        if (print) console.info('stopped');
    }
    setRegisters(regs) {
        return this.cpu.setRegisters(regs);
    }
    cpuStatus() {
        return this.cpu.cpuStatus();
    }
}

class MemIO {
    constructor(con, type, gsx_support = false) {
        this.con = con;
        this.type = type;
        this.ram = new Uint8Array((type < 3) ? 0x10000 : 0x100000); // 8bit: 64K, 16bit: 1M
        if (gsx_support) this.gsx = GSX(this);
        this.CPU = null; // CPU reference
    }
    rd(a) {
        return this.ram[a];
    }
    wr(a, v) {
        this.ram[a] = v;
    }
    input(p) {
        switch (p) {
            case 0x00: return (this.con.kbd.length > 0) ? 0xff : 0x00;
            case 0x01: return (this.con.kbd.length > 0) ? this.con.kbd.shift() : 0x00;
            default: throw new Error(`unknown input port: ${fmt(p)}`);
        }
    }
    output(p, v) {
        switch (p) {
            case 0x01: this.con.display(v & 0xff); break;
            default: throw new Error(`unknown output port: ${fmt(p)}`);
        }
    }
}

class Emulator {
    constructor(cpu, mem, type) {
        this.CPU = cpu;
        this.memo = mem;
        this.SIM_DEBUG = null; // address - name assoc. string (addr: name[ \n])
        this.D_SPC = '';       // display header space  (8bit CPU: empty,  16bit CPU: one space)
        this.D_WDT = 4;        // display address width (8bit CPU: 4,      16bit CPU: 5)
        this.D_AMS = 0xffff;   // display address mask  (8bit CPU: 0xffff, 16bit CPU: 0xfffff)
        this.D_CMD = 3;        // display command pad   (8bit CPU: 3,      16bit CPU: 6)
        this.D_PRF = 'PC: ';   // display regs prefix   (8bit CPU: 'PC: ', 16bit CPU: '\n')
        this.D_STT = 0xfffe;   // display stack top     (8080 and Z80: 0xfffe, 6502: 0x01fe, 8086: 0xffffe)
        this.D_DCW = 300;      // display debug width   (8bit CPU: 300,    16bit CPU: 430)
        this.D_DRW = 200;      // display debug rg wdth (8bit CPU: 200,    16bit CPU: 230)
        if (type === 2) this.D_STT = 0x01fe; // for 6502
        else if (type > 2) {                 // for 8086 and 80186
            this.D_SPC = ' '; this.D_WDT = 5; this.D_AMS = 0xfffff; this.D_CMD = 6; this.D_PRF = '\n';
            this.D_STT = 0xffffe; this.D_DCW = 430; this.D_DRW = 230;
        }
        this.watches = []; // debug watches
        this.dbgw = null;  // debug window
        this.ssettings = { // scope settings
            width: 1000, maxpoints: 1000, configs: [{}],
            addr: 0x0000, scope: null, orig_write: null
        };
    }
    loadBin(data, start, mem) {
        if (mem === undefined) mem = this.memo;
        const n = data.length;
        for (let i = 0; i < n; i++) mem.wr(start++, data[i]);
        return n;
    }
    loadHex(text, start, mem) {
        const lines = text.split(/[\r\n]+/);
        let length = 0;
        for (let i = 0, n = lines.length; i < n; i++) {
            let line = lines[i].trim(), idx;
            if ((idx = line.indexOf(';')) >= 0) line = line.substr(0, idx).trim();
            if (line.length === 0) continue;
            line = line.replaceAll(' ', '');
            const code = [];
            let count, s;
            idx = line.indexOf(':');
            if (idx >= 0)
                if (idx === 0) { // intel hex
                    count = pi(line.substr(1, 2));
                    start = pi(line.substr(3, 4));
                    s = 9;       // skip fill byte
                } else {         // list hex
                    start = pi(line.substr(0, idx));
                    s = idx + 1;
                    count = ((line.length - s) / 2) | 0;
                }
            else {               // plain hex
                count = (line.length / 2) | 0;
                s = 0;
            }
            for (let j = 0; j < count; j++) {
                code.push(pi(line.substr(s, 2)));
                s += 2;
            }
            length += this.loadBin(code, start, mem);
            start += count;
        }
        return length;
    }
    printMem(a, lines = 16, mem, logger = console.log) {
        if (mem === undefined) mem = this.memo;
        logger(`Addr   ${this.D_SPC}0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  ASCII           `);
        for (let i = 0; i < lines; i++) {
            let s = `${fmt(a, this.D_WDT)}: `, // addr
                s2 = '';                       // ascii
            for (let j = 0; j < 16; j++) {
                const c = mem.rd(a + j);
                if (c === undefined) break;
                s += `${fmt(c)} `;
                s2 += (c >= 0x20 && c <= 0x7f) ? String.fromCharCode(c) : '.';
            }
            logger(s, s2);
            a = (a + 16) & this.D_AMS;
        }
        return a;
    }
    disassemble1(a) {
        if (a === undefined) a = this.CPU.cpu.getPC();
        const r = [],
              d = this.CPU.cpu.disassembleInstruction(a);
        r.push(fmt(a, this.D_WDT));
        r.push(': ');
        let end = d[0] - a;
        for (let i = 0; i < end; i++) {
            const c = this.memo.rd(a + i);
            if (c === undefined) break;
            r.push(fmt(c));
        }
        while (end++ < this.D_CMD) r.push('  ');
        r.push(' ');
        r.push(d[1]);
        return [d[0], r.join('')];
    }
    printAsm(a, lines = 16, logger = console.log) {
        for (let i = 0; i < lines; i++) {
            const r = this.disassemble1(a);
            let sim = '', m;
            if (this.SIM_DEBUG !== null) {
                m = this.SIM_DEBUG.match(`${fmt(a, this.D_WDT)}: (.+?)[ \n]`);
                if (m !== null) sim = `${' '.padStart(28 - r[1].length, ' ')}<b>${m[1]}</b>`;
            }
            logger(r[1] + sim);
            a = r[0] & this.D_AMS;
        }
        return a;
    }
    printRegs(logger = console.log) {
        const regs = this.CPU.cpuStatus().replaceAll('|', ' ').replaceAll('#', '\n');
        logger(`${regs} ${this.D_PRF}${this.disassemble1(this.CPU.cpu.getPC())[1]}`);
    }
    debug_find(wnd, addr) {
        addr = fmt(addr, this.D_WDT);
        const nodes = wnd[0].childNodes;
        for (let i = 0, n = nodes.length; i < n; i++) {
            const node = nodes[i];
            if (node.innerText.startsWith(addr))
                return node;
        }
        return null;
    }
    debug_asm(wnd, addr) {
        wnd[0].innerHTML = '';
        wnd.prevNode = undefined;
        this.printAsm(addr, 75, wnd[1]);
    }
    debug_set(wnd) {
        const addr = this.CPU.cpu.getPC();
        let node = this.debug_find(wnd, addr);
        if (node === null) {
            this.debug_asm(wnd, addr);
            node = this.debug_find(wnd, addr);
        }
        if (wnd.prevNode) wnd.prevNode.style.backgroundColor = 'var(--dbgbckgrnd)';
        node.style.backgroundColor = 'var(--dbghilight)';
        const inrect = node.getBoundingClientRect(),
              outrect = wnd[0].getBoundingClientRect();
        if (inrect.top < outrect.top)
            node.scrollIntoView(true);
        else if (inrect.bottom > outrect.bottom)
            node.scrollIntoView(false);
        wnd.prevNode = node;
    }
    debug_sp() {
        let addr = this.CPU.cpu.getSP(), s = '', i = 8, dw = false;
        if (Array.isArray(addr)) {
            addr = pi(`${addr[0]}:${addr[1]}`);
            dw = true; // 16bit, double word on return stack (ip, cs)
        }
        while (i-- > 0) {
            let w = this.memo.rd(addr++) | this.memo.rd(addr++) << 8;
            if (dw) {
                if (addr > this.D_STT) break;
                w = ((this.memo.rd(addr++) | this.memo.rd(addr++) << 8) << 4) + w;
            }
            s += fmt(w, this.D_WDT) + ' ';
            if (i > 0 && i % 4 === 0) s += '\n';
            if (addr > this.D_STT) break;
        }
        return s;
    }
    debug_regs(wnd) {
        wnd[0].innerHTML = '';
        const s = this.CPU.cpuStatus();
        wnd[1](s.replaceAll('|', '\n').replaceAll('#', '\n'));
        wnd[1]();
        if (this.CPU.cpu.getSP) wnd[1](this.debug_sp());
    }
    debug_watch(wnd) {
        wnd[0].innerHTML = '';
        for (let i = 0, n = this.watches.length; i < n; i++) {
            const adr = this.watches[i], val = this.memo.rd(adr);
            wnd[1](`${fmt(adr, this.D_WDT)}: ${fmt(val)} ${val.toString(2).padStart(8, '0')}`);
        }
    }
    debug_update() {
        this.debug_set(this.dbgw);
        this.debug_regs(this.dbgw.regs);
        this.debug_watch(this.dbgw.watch);
    }
    debug(h, show = true) {
        if (show) {
            if (this.dbgw !== null) { console.error('debug active'); return; }
            const x = window.innerWidth - this.D_DCW - 17 - this.D_DRW - 17 - 5,
                  y = 5;
            this.dbgw = console.open(x, y, this.D_DCW, h + 17,
                    'var(--dbgcolor)', 'var(--dbgbckgrnd)');
            this.dbgw.regs = console.open(x + this.D_DCW + 17, y, this.D_DRW, 116,
                    'var(--dbgcolor)', 'var(--dbgbckgrnd)');
            this.dbgw.watch = console.open(x + this.D_DCW + 17, y + 116 + 17, this.D_DRW, h - 116,
                    'var(--dbgcolor)', 'var(--dbgbckgrnd)');
            if (this.memo.scope) { // requested scope
                this.dbgw.scope = console.open(x, y + h + 34, this.D_DCW + this.D_DRW + 33, 80);
                const tmp = this.dbgw.scope[0], ssettings = this.ssettings;
                ssettings.orig_write = this.memo.wr;
                ssettings.scope = oscilloscope(tmp, this.memo.scope, ssettings);
                tmp.style.padding = tmp.style.margin = '0px 0px 0px 0px';
                this.memo.wr = (a, v) => {
                    ssettings.orig_write(a, v);
                    if (a === ssettings.addr) ssettings.scope.update(v);
                };
            }
            this.debug_update();
        } else {
            if (this.dbgw === null) { console.error('debug not active'); return; }
            if (this.dbgw.scope) {
                console.close(this.dbgw.scope);
                this.dbgw.scope = null;
                this.ssettings.scope = null;
                this.memo.wr = this.ssettings.orig_write;
                this.ssettings.orig_write = null;
            }
            console.close(this.dbgw.watch);
            this.dbgw.watch = null;
            console.close(this.dbgw.regs);
            this.dbgw.regs = null;
            console.close(this.dbgw);
            this.dbgw = null;
        }
    }
    stop() {
        this.CPU.RUN = false;
    }
}

class Keyboard {
    constructor(kbdElem = document.getElementsByClassName('keyboard')[0],
            touch = false) { // use down/up interface
        this.kbdElem = kbdElem;
        this.fs_shift = false;
        this.fs_ctrl = false;
        this.fs_alt = false;
        this.fs_caps = false;
        const shfts = kbdElem.getElementsByClassName('kshft'),
              ctrls = kbdElem.getElementsByClassName('kctrl'),
              alts = kbdElem.getElementsByClassName('kalt');
        kbdElem.onclick = e => {
            let elem = e.target;
            if (elem.tagName === 'SPAN') elem = elem.parentNode;
            const key = elem.innerText.replace('\n', '');
            switch (key) {
                case 'CapsLock':
                    this.fs_caps = !this.fs_caps; this.fs_shift = this.fs_caps;
                    shfts[0].style.borderColor = shfts[1].style.borderColor = this.fs_caps ?
                            'var(--keypressed)' : 'var(--onbackground)';
                    break;
                case 'Shift':
                    this.fs_shift = !this.fs_shift;
                    shfts[0].style.borderColor = shfts[1].style.borderColor = this.fs_shift ?
                            'var(--keypressed)' : 'var(--onbackground)';
                    if (!this.fs_shift) this.fs_caps = false;
                    break;
                case 'Ctrl':
                    this.fs_ctrl = !this.fs_ctrl;
                    ctrls[0].style.borderColor = ctrls[1].style.borderColor = this.fs_ctrl ?
                            'var(--keypressed)' : 'var(--onbackground)';
                    break;
                case 'Alt':
                    this.fs_alt = !this.fs_alt;
                    alts[0].style.borderColor = alts[1].style.borderColor = this.fs_alt ?
                            'var(--keypressed)' : 'var(--onbackground)';
                    break;
                default:
                    this.kbdHandler({key}, true, false);
                    if (!this.fs_caps && this.fs_shift) {
                        shfts[0].style.borderColor = shfts[1].style.borderColor = 'var(--onbackground)';
                        this.fs_shift = false;
                    }
                    if (this.fs_ctrl) {
                        ctrls[0].style.borderColor = ctrls[1].style.borderColor = 'var(--onbackground)';
                        this.fs_ctrl = false;
                    }
                    if (this.fs_alt) {
                        alts[0].style.borderColor = alts[1].style.borderColor = 'var(--onbackground)';
                        this.fs_alt = false;
                    }
                    break;
            }
        };
        document.onkeydown = e => {
            switch (e.key) {
                case 'Shift': this.fs_shift = true; break;
                case 'Control': this.fs_ctrl = true; break;
                case 'Alt': this.fs_alt = true; break;
                default: this.kbdHandler(e, false, true); return;
            }
            if (touch) this.kbdHandler(e, false, true);
        };
        document.onkeyup = e => {
            switch (e.key) {
                case 'Shift': this.fs_shift = false; break;
                case 'Control': this.fs_ctrl = false; break;
                case 'Alt': this.fs_alt = false; break;
                default: this.kbdHandler(e, false, false); return;
            }
            if (touch) this.kbdHandler(e, false, false);
        };
    }
    kbdHandler(e, soft, isDown) {
        let val = null;
        switch (e.key) {
            case 'Escape':
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
            case ' ':
            case 'Space': val = 32; break;
            case 'Insert': val = 15; break;
            case 'PageUp':
            case 'PgUp': val = 18; break;
            case 'Delete':
            case 'Del': val = 127; break;
            case 'Home':
            case 'End': val = 2; break;
            case 'PageDown':
            case 'PgDn': val = 3; break;
            case 'ArrowLeft':
            case '\u2190': val = 19; break; // left arrow
            case 'ArrowUp':
            case '\u2191': val = 5; break;  // up arrow
            case 'ArrowRight':
            case '\u2192': val = 4; break;  // right arrow
            case 'ArrowDown':
            case '\u2193': val = 24; break; // down arrow
            default:
                if (e.key.length > 1) val = e.key.charCodeAt(this.fs_shift ? 0 : 1);
                else {
                    if (soft && !this.fs_shift) e.key = e.key.toLowerCase();
                    val = e.key.charCodeAt(0);
                }
                break;
        }
        if (val !== null) {
            val &= 0xff;
            if (this.fs_ctrl) {
                if (val >= 0x60) val -= 0x60;
                if (val >= 0x40) val -= 0x40;
            }
        }
        return val;
    }
}

class Monitor {
    constructor(emu, debug_height = 450, logger = console.log) {
        this.emu = emu;
        this.addr = 0;
        this.debug_height = debug_height;
        this.logger = logger;
        this.parser = new RegExp('([a-z]+)([!<>=]+)([\.0-9a-f]+)$', 'i');
        this.find = null;
        this.findidx = -1;
    }
    async exec(command) {
        const parms = command.trim().split(/[\s\t]+/);
        await this.handler(parms, parms[0]);
    }
    async handler(parms, cmd) {
        let tmp, len, adr, idx, hex;
        switch (cmd) {
            case '':
                try { this.emu.CPU.cpu.step(); } catch(exc) { console.error(exc); break; }
                this.addr = this.emu.CPU.cpu.getPC();
                if (this.emu.dbgw !== null) {
                    this.emu.debug_update();
                    break;
                }
            case 'x':
                if (parms.length > 1 && (tmp = this.emu.CPU.setRegisters(parms)).length > 0) console.error(tmp);
                else if (this.emu.dbgw === null) this.emu.printRegs(this.logger);
                else {
                    this.emu.debug_set(this.emu.dbgw);
                    this.emu.debug_regs(this.emu.dbgw.regs);
                }
                break;
            case 'g':
                len = parms.length;
                if (len > 1 && (tmp = parms[1]) !== '-') this.emu.CPU.cpu.setPC(pi(tmp));
                if (len > 2) this.prepareStop(parms[2]);
                this.emu.CPU.run();
                console.info('running...');
                break;
            case 'step':
                this.prepareStop((parms.length > 1) ? parms[1] : null);
                if (this.emu.dbgw === null) this.emu.CPU.run();
                else {
                    await this.emu.CPU.run();
                    if (this.emu.dbgw !== null) this.emu.debug_update();
                }
                break;
            case 'debug':
                this.emu.debug(this.debug_height, true);
                break;
            case 'quit':
                this.emu.debug(this.debug_height, false);
                break;
            case 'refresh':
                if (this.emu.dbgw === null) { console.error('debug not active'); break; }
                this.emu.dbgw[0].innerHTML = '';
                this.emu.debug_update();
                break;
            case 'wadd':
                if (parms.length < 2) { console.error('missing: adr [adr ...]'); break; }
                for (let i = 1, n = parms.length; i < n; i++)
                    if (this.emu.watches.indexOf(tmp = pi(parms[i])) < 0) this.emu.watches.push(tmp);
                if (this.emu.dbgw !== null) this.emu.debug_watch(this.emu.dbgw.watch);
                break;
            case 'wrem':
                if (parms.length < 2) { console.error('missing: adr [adr ...]'); break; }
                for (let i = 1, n = parms.length; i < n; i++)
                    if ((idx = this.emu.watches.indexOf(pi(parms[i]))) >= 0) this.emu.watches.splice(idx, 1);
                if (this.emu.dbgw !== null) this.emu.debug_watch(this.emu.dbgw.watch);
                break;
            case 'sadr':
                if (parms.length < 2) { console.error('missing: adr'); break; }
                if ((adr = pi(parms[1])) !== this.emu.ssettings.addr) {
                    this.emu.ssettings.addr = adr;
                    if (this.emu.ssettings.scope !== null) this.emu.ssettings.scope.clear();
                }
                break;
            case 'sadd':
                if (parms.length < 2) { console.error('missing: mask [color [width]]'); break; }
                tmp = pi(parms[1]);
                if ((hex = this.emu.ssettings.configs.find(e => e.mask === tmp)) === undefined) {
                    hex = {'mask': tmp}; this.emu.ssettings.configs.push(hex);
                }
                hex.color = parms[2] ?? '#03dac6';
                hex.width = (parms[3] ? pi(parms[3], false) : null) ?? 1;
                if (this.emu.ssettings.scope !== null) this.emu.ssettings.scope.set(this.emu.ssettings.configs);
                break;
            case 'srem':
                if (parms.length < 2) { console.error('missing: mask'); break; }
                tmp = pi(parms[1]);
                if ((idx = this.emu.ssettings.configs.findIndex(e => e.mask === tmp)) >= 0) {
                    this.emu.ssettings.configs.splice(idx, 1);
                    if (this.emu.ssettings.scope !== null) this.emu.ssettings.scope.set(this.emu.ssettings.configs);
                }
                else console.error(`mask: 0x${fmt(tmp)} not found`);
                break;
            case 'swdt':
                if (parms.length < 2) { console.error('missing: width'); break; }
                this.emu.ssettings.width = pi(parms[1], false);
                if (this.emu.ssettings.scope !== null) this.emu.ssettings.scope.width(this.emu.ssettings.width);
                break;
            case 'spts':
                if (parms.length < 2) { console.error('missing: points'); break; }
                this.emu.ssettings.maxpoints = pi(parms[1], false);
                if (this.emu.ssettings.scope !== null) this.emu.ssettings.scope.points(this.emu.ssettings.maxpoints);
                break;
            case 'd':
                if (parms.length > 1) this.addr = pi(parms[1]);
                this.addr = this.emu.printMem(this.addr, undefined, undefined, this.logger);
                break;
            case 'l':
                if (parms.length > 1) this.addr = pi(parms[1]);
                this.addr = this.emu.printAsm(this.addr, undefined, this.logger);
                break;
            case 'm':
                if (parms.length < 3) console.error('missing: adr b [b ...]');
                else this.logger(this.emu.loadBin(parms.slice(2).map(i => pi(i) & 0xff), pi(parms[1]) & this.emu.D_AMS));
                break;
            case 'r':
                if ((len = parms.length) < 2) { console.error('missing: [a=100] fn [h=0]'); break; }
                idx = 1;
                try { adr = pi(parms[1]) & this.emu.D_AMS; idx++; } catch(exc) { adr = 0x100; }
                if (len < idx + 1) { console.error('missing: [a=100] fn [h=0]'); break; }
                hex = (len > idx + 1) ? parms[idx + 1] === '1' : false;
                tmp = await loadFile(parms[idx], hex);
                this.logger(hex ? this.emu.loadHex(tmp, adr) : this.emu.loadBin(tmp, adr));
                break;
            case 'w':
                if (parms.length < 3) { console.error('missing: a1 a2'); break; }
                adr = pi(parms[1]) & this.emu.D_AMS;
                len = pi(parms[2]) & this.emu.D_AMS;
                if (adr > len) { console.error(`end address: ${len.toString(16)} < start: ${adr.toString(16)}`); break; }
                tmp = new Uint8Array(len - adr + 1);
                for (let i = adr, a = 0; i <= len; i++) tmp[a++] = this.emu.memo.rd(i);
                downloadFile('block.bin', tmp);
                break;
            case 'cls':
                console.clear();
                break;
            case 'find': // find byte sequence
                if (parms.length >= 2) {
                    const str = parms[1].trim();
                    if ((str.length % 2) !== 0) {
                        console.error('bytes must be in 2 digits each'); break;
                    }
                    this.find = []; this.findidx = 0;
                    for (let i = 0, n = str.length; i < n; i += 2)
                        this.find.push(pi(str.substring(i, i + 2)));
                }
                if (this.find === null) { console.error('missing: bytes'); break; }
                if (this.findidx < 0) { console.log('not found'); break; }
                const maxmem = this.emu.D_AMS + 1;
                do {
                    while (this.findidx < maxmem &&
                            this.emu.memo.rd(this.findidx++) !== this.find[0]) ;
                    if (this.findidx >= maxmem) break;
                    let i = 1, tmpidx = this.findidx;
                    while (i < this.find.length &&
                            this.emu.memo.rd(this.findidx++) === this.find[i]) i++;
                    if (i >= this.find.length) break;
                    this.findidx = tmpidx;
                } while (this.findidx < maxmem);
                if (this.findidx >= maxmem) {
                    this.findidx = -1; console.log('not found'); break;
                }
                this.findidx -= this.find.length - 1;
                this.addr = this.emu.printMem(this.findidx - 1, undefined, undefined, this.logger);
                break;
            case 'esc':  // send string to console
                if (parms.length < 2) { console.error('missing: str'); break; }
                this.emu.memo.con.print(parms[1]);
                break;
            case 'stop': // stop emulation
                this.emu.stop();
                break;
            default: console.error(`invalid command: ${cmd}`); break;
        }
    }
    prepareStop(str) {
        if (str === null) this.emu.CPU.STOP = this.emu.disassemble1()[0] & this.emu.D_AMS;
        else {
            const idx = str.indexOf(';');
            if (idx < 0) this.emu.CPU.STOP = pi(str) & this.emu.D_AMS;
            else {
                this.emu.CPU.STOP = pi(str.substring(0, idx)) & this.emu.D_AMS;
                this.emu.CPU.STOP_REGS = str.substring(idx + 1).split(',');
                let err = null;
                for (let i = 0, n = this.emu.CPU.STOP_REGS.length; i < n; i++) {
                    const txt = this.emu.CPU.STOP_REGS[i],
                          exp = txt.match(this.parser);
                    if (exp === null || exp.length < 4) {
                        err = `invalid expression: ${txt}`; break;
                    }
                    exp[1] = new RegExp(`${exp[1]}\:([0-9a-f]+)( |#|\||$)`, 'i');
                    this.emu.CPU.STOP_REGS[i] = exp;
                }
                if (err !== null) {
                    this.emu.CPU.STOP = -1; this.emu.CPU.STOP_REGS.length = 0;
                    throw new Error(err);
                }
            }
        }
    }
}

class CPMMemIO extends MemIO {
    constructor(con, type, mpm = false, gsx_support = false, con2 = null) {
        super(con, type, gsx_support);
        this.mpm = mpm;                                   // MP/M special handling
        this.con2 = con2;                                 // second console for MP/M
        this.SEG = 49152;                                 // page size for CP/M+ and MP/M
        this.rams = [new Uint8Array(this.SEG), this.ram]; // paged RAM for CP/M+ and MP/M
        this.CPM_DRIVES = [                               // disk drives
            null, // A: (8" IBM SD)      CP/M 2.2, CP/M 3.0, MP/M
            null, // B: (8" IBM SD)      CP/M 2.2, CP/M 3.0, MP/M
            null, // C: (8" IBM SD)      CP/M 2.2, CP/M 3.0, MP/M
            null, // D: (8" IBM SD)      CP/M 2.2, CP/M 3.0, MP/M
            null, // none
            null, // none
            null, // none
            null, // none
            null, // I: (4Mb harddisk)                       MP/M
            null, // J: (4Mb harddisk)                       MP/M
            null, // K: (4Mb harddisk)
            null, // L: (4Mb harddisk)
            null, // none
            null, // none
            null, // none
            null  // P: (512Mb harddisk)                     MP/M
        ];
        this.dskstat = 0; // disk parameters
        this.iocount = 0;
        this.drv = 0;
        this.trk = 0;
        this.sec = 0;
        this.dma = 0;
        this.printer = ''; // printer
        this.tape = '';    // tape
        this.tapepos = 0;
        this.puncher = ''; // puncher
        this.TIMER_RUN = false;
        this.bank = 1; // current memory bank
        this.clkcmd = 0;
        [this.clkdata, this.clktemp] = this.dateTime();
        this.sconsole = ''; // console buffer
        this.ccopy = false; // console buffer enabled
        this.wfname = null; // work file full name (set for one R/O automatically updated file)
        this.wfdnme = null; // work file name
        this.wfdrv = -1;    // work file drive
        this.wfdate = null; // work file modified date
        this.tckcnt = 0;    // ticks count for MP/M
    }
    dateTime() {
        let date; // temp = (date - (8 years) + (1 day)) / day
        return [date = new Date(), ((date.getTime() - 252442799999 + 86400000) / 86400000) | 0];
    }
    async timer10(value) {
        if (value !== 1) { this.TIMER_RUN = false; return; }
        else if (this.TIMER_RUN) return;
        this.TIMER_RUN = true;
        this.CPU.cpu.setInterrupt(7); // one time for interrupt test
        while (this.TIMER_RUN) {
            await delay(100);
            if (this.CPU.RUN) this.CPU.cpu.setInterrupt(7);
        }
    }
    rd(a) {
        return (this.bank == 1 || a >= this.SEG) ? this.ram[a] : this.rams[this.bank][a];
    }
    wr(a, v) {
        if (this.bank == 1 || a >= this.SEG) this.ram[a] = v;
        else this.rams[this.bank][a] = v;
    }
    input(p) {
        switch (p) {
            case 0x00: return (this.con.kbd.length > 0) ? 0xff : 0x00;                        // console status
            case 0x01: return (this.con.kbd.length > 0) ? this.con.kbd.shift() & 0x7f : 0x00; // console data
            case 0x02: return 0x1a;                                                           // printer status
            case 0x04: return 0xff;                                                           // auxilary status
            case 0x05:                                                                        // paper tape (aux)
                return (this.tapepos >= this.tape.length) ? 0x1a : this.tape.charCodeAt(this.tapepos++) & 0xff;
            case 0x0a: return this.drv;                                                       // fdc drive
            case 0x0b: return this.trk;                                                       // fdc track
            case 0x0c: return this.sec & 0x00ff;                                              // fdc sector low
            case 0x0d: return (this.iocount === 0) ? 0xff : 0x00;                             // fdc command
            case 0x0e: return this.dskstat;                                                   // fdc status
            case 0x0f: return this.dma & 0x00ff;                                              // dma address low
            case 0x10: return (this.dma & 0xff00) >>> 8;                                      // dma address high
            case 0x11: return (this.sec & 0xff00) >>> 8;                                      // fdc sector high
            case 0x1a:                                                                        // clock data
                let res;
                switch (this.clkcmd) {
                    case 0:                                         // sec
                        if (this.mpm) {                             // optimized clock for MP/M
                            this.tckcnt++;
                            if (this.tckcnt > 60) this.tckcnt = 0;  // 1 minute counter
                            return this.tckcnt;
                        }
                        [this.clkdata, this.clktemp] = this.dateTime();
                        res = this.clkdata.getSeconds();
                        break;
                    case 1: res = this.clkdata.getMinutes(); break; // min
                    case 2: res = this.clkdata.getHours(); break;   // hrs
                    case 3: return this.clktemp & 0xff;             // days low
                    case 4: return (this.clktemp >>> 8) & 0xff;     // days high
                    default: return 0x1a;                           // CTRL-Z to simulate EOF
                }
                const tens = (res / 10) | 0,                        // to BCD
                      units = (res % 10) | 0;
                return (tens << 4) | units;
            case 0x28: return this.con2 ? (this.con2.kbd.length > 0) ? 0x03 : 0x02 : 0x00;    // console 1 status
            case 0x29: return (this.con2.kbd.length > 0) ? this.con2.kbd.shift() & 0x7f : 0x02;
            case 0x2a: return 0x00;                                                           // console 2 status
            case 0x2c: return 0x00;                                                           // console 3 status
            case 0x2e: return 0x00;                                                           // console 4 status
            default: throw new Error(`unknown input port: ${fmt(p)}`);
        }
    }
    output(p, v) {
        switch (p) {
            case 0x00:                                                                        // tests data
                if (v === 0x0a) { console.log(); break; }
                else if (v === 0x0d) break;
                console.log(String.fromCharCode(v), console.NB);
                break;
            case 0x01:                                                                        // console data
                v &= 0xff;
                this.con.display(v);
                if (this.ccopy) this.sconsole += String.fromCharCode(v);                      // keep screen data
                break;
            case 0x03: this.printer += String.fromCharCode(v); break;                         // printer data
            case 0x04: if (v & 0x01) this.tapepos = 0; break;                                 // rewind tape (aux)
            case 0x05: this.puncher += String.fromCharCode(v); break;                         // paper puncher (aux)
            case 0x0a: this.drv = v & 0xff; break;                                            // fdc drive
            case 0x0b: this.trk = v & 0xff; break;                                            // fdc track
            case 0x0c: this.sec = (this.sec & 0xff00) | (v & 0xff); break;                    // fdc sector low
            case 0x0d:                                                                        // fdc command
                if (v !== 0 && v !== 1) this.dskstat = 7; // illegal command
                else {
                    this.iocount++;
                    (async () => {
                        try {
                            const dd = this.CPM_DRIVES[this.drv];
                            if (dd === null || dd === undefined) this.dskstat = 1; // illegal drive
                            else {
                                if (this.wfname !== null && this.wfdrv === this.drv && // work file set
                                        v === 0 && this.trk === 2 && this.sec === 1) { // read first DIR sector
                                    const hndl = await preLoadFile(this.wfname);       // check modified time
                                    if (hndl.headers.get('Last-Modified') > this.wfdate)
                                        dd.diskRW(this.wfdnme, new Uint8Array(await hndl.arrayBuffer()));
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
            case 0x14:                                                                        // mmu init
                if (v > 8) throw new Error(`invalid memory banks: ${v}`);
                while (v-- > 2) this.rams.push(new Uint8Array(this.SEG));
                break;
            case 0x15:                                                                        // mmu select
                if (v >= this.rams.length) throw new Error(`invalid memory bank: ${v}`);
                this.bank = v & 0xff;
                break;
            case 0x19: this.clkcmd = v & 0xff; break;                                         // clock command
            case 0x1b: this.timer10(v); break;                                                // 10ms interrupt timer
            case 0x29: this.con2.display(v & 0xff); break;
            case 0xdd: this.gsx(this.con, v); break;                                          // GSX support
            default: throw new Error(`unknown output port: ${fmt(p)}`);
        }
    }
    setTape(value) {
        this.tape = value; this.tapepos = 0;
    }
    setBank(value) {
        if (value >= this.rams.length) throw new Error(`invalid memory bank: ${value}`);
        this.bank = value;
    }
    setCopy(flag) {
        this.ccopy = flag; this.sconsole = '';
    }
    reset() {
        this.timer10(0); // stop timer
        this.ram.fill(0x00);
        this.rams.length = 2; this.rams[0].fill(0x00);
        this.dskstat = 0; this.iocount = 0; this.drv = 0; this.trk = 0; this.sec = 0; this.dma = 0;
        this.printer = ''; this.tape = ''; this.tapepos = 0; this.puncher = '';
        this.bank = 1; this.clkcmd = 0; [this.clkdata, this.clktemp] = this.dateTime();
        this.sconsole = '';
    }
}

class CPMMonitor extends Monitor {
    constructor(emu, debug_height, logger) {
        super(emu, debug_height, logger);
    }
    getDisk(pms, n, er, fg) {             // disk IO command helper
        if (pms.length < n) { console.error(er); return; }
        const dn = pi(pms[1], false);
        if (dn >= this.emu.memo.CPM_DRIVES.length) { console.error(`invalid drive num: ${dn}`); return; }
        if (!fg) return dn;
        const dd = this.emu.memo.CPM_DRIVES[dn];
        if (dd === undefined || dd === null) { console.error(`invalid drive: ${dn}`); return; }
        return dd;
    }
    async handler(parms, cmd) {
        switch (cmd) {
            case 'read':                  // read file
                const r_drive = this.getDisk(parms, 3, 'missing: drv fname', true);
                if (r_drive === undefined) break;
                let r_fn;
                const r_buf = r_drive.diskRW(r_fn = parms[2]);
                if (r_buf !== null) downloadFile(r_fn.toUpperCase(), r_buf);
                else console.log(`file ${r_fn} not found or empty`);
                break;
            case 'write':                 // write file
                const w_drive = this.getDisk(parms, 3, 'missing: drv fname [R/O=0]', true);
                if (w_drive === undefined) break;
                let w_fn, w_idx, w_nn;
                const hndl = await preLoadFile(w_fn = parms[2]),
                      w_buf = new Uint8Array(await hndl.arrayBuffer());
                w_nn = ((w_idx = w_fn.lastIndexOf('/')) >= 0) ? w_fn.substring(w_idx + 1) : w_fn;
                w_drive.diskRW(w_nn, w_buf);
                console.log(w_buf.length);
                if (parms.length > 3 && parms[3] === '1') { // set R/O working file
                    this.emu.memo.wfname = w_fn;
                    this.emu.memo.wfdnme = w_nn;
                    this.emu.memo.wfdrv = pi(parms[1], false);
                    this.emu.memo.wfdate = hndl.headers.get('Last-Modified');
                }
                break;
            case 'bank':                  // get/set active memory bank
                if (parms.length < 2) this.logger(this.emu.memo.bank);
                else this.emu.memo.setBank(pi(parms[1]));
                break;
            case 'copy':                  // console output snapshot
                if (parms.length < 2) {
                    console.log('"',this.emu.memo.sconsole,'"');
                    this.emu.memo.setCopy(false);
                }
                else this.emu.memo.setCopy(parms[1] === '1');
                break;
            case 'on':                    // start emulator (0 - do not load disks)
                if (parms.length < 2) { console.error('missing: ver (0=CP/M 2.2|1=CP/M 3.0|2=MP/M II'); break; }
                const version = pi(parms[1]);
                this.emu.memo.reset();
                if (version > 0) this.emu.memo.setBank(0); // bank 0 must be active for CP/M+ and MP/M
                this.emu.CPU.HLT_STOP = version < 2;       // no stop on HALT for MP/M (interrupt based)
                let boot_err;                              // boot loader
                if ((boot_err = this.emu.memo.CPM_DRIVES[0].transfer(0, 1, 0x0000, true, this.emu.memo)) !== 0)
                    console.error(`boot error: ${boot_err}`);
                else { this.emu.CPU.cpu.reset(); this.emu.CPU.run(); }
                break;
            default: await super.handler(parms, cmd); break;
        }
    }
}
