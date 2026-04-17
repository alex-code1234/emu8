'use strict';

// emu.html?js=pcxt.js&memchk=0..1&run=0..1

async function IBMIO(con) {
    con.print('^[?25l');                  // hide VT-100 cursor
    const ram = new Uint8Array(0x100000),
          DRIVES = [undefined, undefined, undefined]; // disk drives
    let crtc = null, ocl = -1,
        base = 0xb8000, cols = 80, lsiz = 160, stad = 0,
        em_b = null, em_e, em_w, em_r,    // EMS parameters
        eg_b = null, eg_e, eg_w, eg_r;    // EGA parameters
    const cursor = (loc, show) => {       // show / hide cursor
        const x = loc % cols, y = loc / cols | 0,
              a = base + y * lsiz + (x << 1) + stad,
              chr = ram[a], attr = ram[a + 1];
        let fg, bg;
        if (show) { fg = attr >>> 4 & 0x07; bg = attr & 0x0f; }
        else { fg = attr & 0x0f; bg = attr >>> 4 & 0x07; }
        con.output(x, y, fg, bg, chr);
    },
    result = {
        ram, DRIVES,
        'add': (s_a, e_a, w, r) => {      // add memory handler
            if (s_a === 0xa0000) { eg_b = s_a; eg_e = e_a; eg_w = w; eg_r = r; }
            else { em_b = s_a; em_e = e_a; em_w = w; em_r = r; }
        },
        'rd': a => (em_b !== null && a >= em_b && a < em_e) ? em_r(a) :
                (eg_b !== null && a >= eg_b && a < eg_e) ? eg_r(a) :
                ram[a],
        'wr': (a, v) => {
            if (em_b !== null && a >= em_b && a < em_e) {
                // EMS update
                em_w(a, v);
                return;
            }
            if (eg_b !== null && a >= eg_b && a < eg_e) {
                // EGA graphic update
                eg_w(a, v);
                return;
            }
            if (a >= 0xb0000 && a < 0xc0000) {
                // video update
                if (ram[a] === v)
                    return;
                ram[a] = v;
                // check video settings
                const video = ram[0x449];
                let wdth = (video < 2) ? 40 : 80, rows = 25;
                if (ram[0x484] === 0x2a) { // 8x8 font
                    wdth = 90; rows = 43;
                }
                base = (video === 7) ? 0xb0000 : 0xb8000;
                if (a < base) return;     // outside of current video buffer
                stad = (crtc.getRegister(0x0c) << 8 | crtc.getRegister(0x0d)) << 1;
                if (cols !== wdth) {
                    cols = wdth;
                    lsiz = (cols === 40) ? 80 : 160;
                    ocl = -1;
                    con.setWidth(cols, rows);
                }
                // draw character with attribute
                const idx = a - base - stad;
                let chr, attr;
                if (a & 1) { chr = ram[a - 1]; attr = v; }
                else { chr = v; attr = ram[a + 1]; }
                con.output((idx % lsiz) >>> 1, idx / lsiz | 0, attr & 0x0f, attr >>> 4 & 0x07, chr);
                return;
            }
            if (result.CPU.RUN && a >= 0xc0000)
                return;                   // ROM write protected
            ram[a] = v;
        },
        'vcu': () => {                    // cursor update
            if ((crtc.getRegister(0x0a) & 0x1f) <= crtc.getRegister(0x0b)) {
                // cursor visible
                const loc = crtc.getRegister(0x0e) << 8 | crtc.getRegister(0x0f);
                if (loc !== ocl) {        // position changed, update
                    if (ocl >= 0)
                        cursor(ocl, false);
                    cursor(loc, true);
                    ocl = loc;
                }
            }
            else if (ocl >= 0) {          // hide cursor
                cursor(ocl, false);
                ocl = -1;
            }
            setTimeout(result.vcu, 300);
        },
        'int': type => {
            if (type === 0x2f) {          // enable FreeDOS loading
                const regs = result.CPU.cpu.getRegs(),
                      resp = {};
                if (regs.ah === 0x16 && regs.al === 0x80) {
                    resp.al = 0x00;
                    result.CPU.cpu.setRegs(resp);
                    return true;
                }
                return false;
            }
            if (type === 0x18) {          // enable boot from hard drive
                const hdr = DRIVES[2];
                if (hdr) {
                    hdr.transfer(0, 1, 0, 0x7c00, true, result, 1);
                    let check_addr = 0x7c00 + 510;
                    if (ram[check_addr++] === 0x55 && ram[check_addr] === 0xaa) {
                        result.CPU.cpu.setRegs({'cs': 0x0000, 'ip': 0x7c00});
                        return true;
                    }
                }
                return false;
            }
            if (type !== 0x13) return false;
            const regs = result.CPU.cpu.getRegs(),
                  resp = {};
            switch (regs.ah) {
                case 0x00:
                case 0x04:
                case 0x17:
                case 0x18:
                    resp.ah = 0;
                    resp.flags = regs.flags & 0xfe;
                    break;
                case 0x02:
                case 0x03:
                    const memi = result.CPU.cpu.getAddr(regs.es, regs.bh << 8 | regs.bl),
                          cyl = (regs.cl & 0xc0) << 2 | regs.ch,
                          sect = regs.cl & 0x3f,
                          head = regs.dh,
                          wr = regs.ah === 3;
                    let drv = regs.dl;
                    if (drv === 0x80) drv = 2;
                    const hdr = DRIVES[drv];
                    resp.ah = hdr ? hdr.transfer(cyl, sect, head, memi, !wr, result, regs.al) : 0x0c;
                    resp.flags = (resp.ah === 0x00) ? regs.flags & 0xfe : regs.flags | 0x01;
                    break;
                case 0x05:
                    if (regs.dl >= 0x80) return false;
                    const fd = DRIVES[regs.dl];
                    if (fd) {
                        const bf = new Uint8Array(512 * regs.al);
                        bf.fill(0xe5);
                        resp.ah = fd.transfer(regs.ch, 1, regs.dh, 0, false, ArrMemo(bf), regs.al);
                    }
                    else resp.ah = 0x0c;
                    resp.flags = (resp.ah === 0x00) ? regs.flags & 0xfe : regs.flags | 0x01;
                    break;
                case 0x08:
                    if (regs.dl < 0x80) return false;
                    resp.dl = 1; resp.dh = 3;
                    resp.ch = 305 & 0xff; resp.cl = ((305 & 0x300) >>> 2) | 17;
                    resp.ah = 0;
                    resp.flags = regs.flags & 0xfe;
                    break;
                default: return false;
            }
            result.CPU.cpu.setRegs(resp);
            return true;
        },
        'setChipset': (crt, kbd) => {
            crtc = crt;                   // display control
            result.ppi = kbd;             // keyboard control
        }
    };
    return result;
}

class IBMKbd extends SoftKbd {
    constructor(kbd_elem, con, con_elem, mon) {
        super(kbd_elem, con, con_elem);
        this.CPU = mon.emu.CPU;
        this.PPI = mon.emu.memo.ppi;
    }
    translateKey(e, soft) {
        let cde = 0, modifier = [];
        switch (e.key) {
            case 'Esc': cde = 0x01; break;
            case '!1': cde = 0x02; break;
            case '@2': cde = 0x03; break;
            case '#3': cde = 0x04; break;
            case '$4': cde = 0x05; break;
            case '%5': cde = 0x06; break;
            case '^6': cde = 0x07; break;
            case '&7': cde = 0x08; break;
            case '*8': cde = 0x09; break;
            case '(9': cde = 0x0a; break;
            case ')0': cde = 0x0b; break;
            case '_-': cde = 0x0c; break;
            case '+=': cde = 0x0d; break;
            case 'Backspace': cde = 0x0e; break;
            case 'Tab': cde = 0x0f; break;
            case 'Q': cde = 0x10; break;
            case 'W': cde = 0x11; break;
            case 'E': cde = 0x12; break;
            case 'R': cde = 0x13; break;
            case 'T': cde = 0x14; break;
            case 'Y': cde = 0x15; break;
            case 'U': cde = 0x16; break;
            case 'I': cde = 0x17; break;
            case 'O': cde = 0x18; break;
            case 'P': cde = 0x19; break;
            case '{[': cde = 0x1a; break;
            case '}]': cde = 0x1b; break;
            case 'Enter': cde = 0x1c; break;
            case 'A': cde = 0x1e; break;
            case 'S': cde = 0x1f; break;
            case 'D': cde = 0x20; break;
            case 'F': cde = 0x21; break;
            case 'G': cde = 0x22; break;
            case 'H': cde = 0x23; break;
            case 'J': cde = 0x24; break;
            case 'K': cde = 0x25; break;
            case 'L': cde = 0x26; break;
            case ':;': cde = 0x27; break;
            case '"\'': cde = 0x28; break;
            case '~`': cde = 0x29; break;
            case '|\\': cde = 0x2b; break;
            case 'Z': cde = 0x2c; break;
            case 'X': cde = 0x2d; break;
            case 'C': cde = 0x2e; break;
            case 'V': cde = 0x2f; break;
            case 'B': cde = 0x30; break;
            case 'N': cde = 0x31; break;
            case 'M': cde = 0x32; break;
            case '<,': cde = 0x33; break;
            case '>.': cde = 0x34; break;
            case '?/': cde = 0x35; break;
            case 'Space': cde = 0x39; break;
            case 'F1': cde = 0x3b; break;
            case 'F2': cde = 0x3c; break;
            case 'F3': cde = 0x3d; break;
            case 'F4': cde = 0x3e; break;
            case 'F5': cde = 0x3f; break;
            case 'F6': cde = 0x40; break;
            case 'F7': cde = 0x41; break;
            case 'F8': cde = 0x42; break;
            case 'F9': cde = 0x43; break;
            case 'F10': cde = 0x44; break;
            case 'F11': cde = 0x57; break;
            case 'F12': cde = 0x58; break;
            case 'Home': cde = 0x47; break;
            case 'PgUp': cde = 0x49; break;
            case 'End': cde = 0x4f; break;
            case 'PgDn': cde = 0x51; break;
            case 'Insert': cde = 0x52; break;
            case 'Del': cde = 0x53; break;
            case '\u2190': cde = 0x4b; break;
            case '\u2191': cde = 0x48; break;
            case '\u2192': cde = 0x4d; break;
            case '\u2193': cde = 0x50; break;
        }
        if (cde > 0) {
            if (this.fs_shift) modifier.push(0x2a);
            if (this.fs_ctrl) modifier.push(0x1d);
            if (this.fs_alt) modifier.push(0x38);
            return [cde, modifier];
        }
        return null;
    }
    processKey(val) {
        this.keyPress(...val);
    }
    async keyPress(cde, modifier) {
        await this.mods(modifier, false);
        this.PPI.keyTyped(cde);
        await delay(10);
        this.PPI.keyTyped(0x80 | cde);
        await this.mods(modifier, true);
    }
    async mods(mod, up) {
        for (let i = 0; i < mod.length; i++)
            if (up) {
                await delay(10);
                this.PPI.keyTyped(0x80 | mod[i]);
            } else {
                this.PPI.keyTyped(mod[i]);
                await delay(10);
            }
    }
}

// read data from com port
// 03fc 1 - data ready
// 03fe   - 20 (data set ready)
// 03fd   - 01 (data ready)
// 03f8   - xx (data)
// write data to com port
// 03fc 3  - request to send and data ready
// 03fe    - 10 (clear to send)
// 03fd    - 60 (FIFO and transmit reg empty)
// 03f8 xx - data
function COMPort() {
    let reading = false, wenabled = true;
    const data = [],
    isConnected = port => port >= 0x03f8 && port <= 0x03fe,
    portIn = (w, port) => {
        switch (port) {
            case 0x03f8:
                if (!reading) break;
                const res = data.shift();
                if (data.length === 0) reading = false;
                return res;
            case 0x03fd: return reading ? 0x01 : 0x60;
            case 0x03fe: return reading ? 0x20 : 0x30;
        }
        return 0x00;
    },
    portOut = (w, port, val) => {
        switch (port) {
            case 0x03f8:
                if (!reading && wenabled) data.push(val);
                break;
            case 0x03fb:
                wenabled = val !== 0x80;
                break;
        }
    },
    setData = txt => {
        data.push(...(txt.split('').map(e => e.charCodeAt(0))), 0x1a);
        reading = true;
        return txt.length;
    },
    getData = () => {
        const res = data.slice(0);
        data.length = 0;
        return new Uint8Array(res);
    };
    return {isConnected, portIn, portOut, setData, getData};
}

class IBMMon extends Monitor {
    constructor(emu, com) {
        super(emu);
        this.com = com;
    }
    async handler(parms, cmd) {
        let tmp;
        try { switch (cmd) {
            case 'disk':
                if (parms.length < 2) { console.error('missing drv [fname]'); break; }
                const drv = pi(parms[1], false);
                if (drv < 0 || drv > 2) { console.error(`invalid drv: ${drv}`); break; }
                if (parms.length < 3) {
                    tmp = this.emu.memo.DRIVES[drv];
                    if (tmp === undefined) { console.log('empty drive'); break; }
                    downloadFile('drive.img', tmp.drive);
                } else {
                    tmp = await DOSDisk(parms[2]);
                    this.emu.memo.DRIVES[drv] = tmp;
                    console.log(tmp.drive.length);
                }
                break;
            case 'com1':
                if (parms.length < 2) {
                    tmp = this.com.getData();
                    if (tmp.length === 0) console.log('empty buffer');
                    else downloadFile('com1.txt', tmp);
                }
                else console.log(this.com.setData(await loadFile(parms[1], true)));
                break;
            default: await super.handler(parms, cmd); break;
        } } catch (e) { console.error(e.stack); }
    }
}

async function main() {
    let loads = [
        loadScript('../../emu/github/emu8/js/js8086.js'),
        loadScript('../../emu/github/emu8/js/disks.js'),
        loadScript('pcxt/chipset.js'),
        loadFile('pcxt/basic.bin', false),
        loadFile('pcxt/bios2.bin', false),
        loadFile('pcxt/ibm_ega.bin', false)
    ];
    const [scr_elem, kbd_elem, con_elem] = createUI(
        addTab('emul', 'EMULATOR', 1, true),
        'emul', 'emu', '36px', 36, 6, 'calc(36px / 10)', '800px', '480px', `
.sec_emul_right { grid-template-columns: repeat(6, calc(36px / 2)); }
        `, `
<div class='section sec_emul sec_emul_left'>
    <div class='key key_emul'>Esc</div><div class='key key_emul'>F1</div>
    <div class='key key_emul'>F2</div><div class='key key_emul'>F3</div>
    <div class='key key_emul'>F4</div><div class='key key_emul'>F5</div>
    <div class='key key_emul'>F6</div><div class='key key_emul'>F7</div>
    <div class='key key_emul'>F8</div><div class='key key_emul'>F9</div>
    <div class='key key_emul'>F10</div><div class='key key_emul'>F11</div>
    <div class='key key_emul'>F12</div><div class='sp2'></div><div class='sp2'></div>
    <div class='key key_emul'><span>~</span><span>` + '`' + `</span></div>
    <div class='key key_emul'><span>!</span><span>1</span></div>
    <div class='key key_emul'><span>@</span><span>2</span></div>
    <div class='key key_emul'><span>#</span><span>3</span></div>
    <div class='key key_emul'><span>$</span><span>4</span></div>
    <div class='key key_emul'><span>%</span><span>5</span></div>
    <div class='key key_emul'><span>^</span><span>6</span></div>
    <div class='key key_emul'><span>&</span><span>7</span></div>
    <div class='key key_emul'><span>*</span><span>8</span></div>
    <div class='key key_emul'><span>(</span><span>9</span></div>
    <div class='key key_emul'><span>)</span><span>0</span></div>
    <div class='key key_emul'><span>_</span><span>-</span></div>
    <div class='key key_emul'><span>+</span><span>=</span></div>
    <div class='key key_emul sp4'>Backspace</div>
    <div class='key key_emul sp3'>Tab</div><div class='key key_emul'>Q</div>
    <div class='key key_emul'>W</div><div class='key key_emul'>E</div>
    <div class='key key_emul'>R</div><div class='key key_emul'>T</div>
    <div class='key key_emul'>Y</div><div class='key key_emul'>U</div>
    <div class='key key_emul'>I</div><div class='key key_emul'>O</div>
    <div class='key key_emul'>P</div>
    <div class='key key_emul'><span>{</span><span>[</span></div>
    <div class='key key_emul'><span>}</span><span>]</span></div>
    <div class='key key_emul sp3'><span>|</span><span>\\</span></div>
    <div class='key key_emul sp4'>CapsLock</div><div class='key key_emul'>A</div>
    <div class='key key_emul'>S</div><div class='key key_emul'>D</div>
    <div class='key key_emul'>F</div><div class='key key_emul'>G</div>
    <div class='key key_emul'>H</div><div class='key key_emul'>J</div>
    <div class='key key_emul'>K</div><div class='key key_emul'>L</div>
    <div class='key key_emul'><span>:</span><span>;</span></div>
    <div class='key key_emul'><span>"</span><span>'</span></div>
    <div class='key key_emul sp4'>Enter</div>
    <div class='key key_emul sp5 kshft'>Shift</div><div class='key key_emul'>Z</div>
    <div class='key key_emul'>X</div><div class='key key_emul'>C</div>
    <div class='key key_emul'>V</div><div class='key key_emul'>B</div>
    <div class='key key_emul'>N</div><div class='key key_emul'>M</div>
    <div class='key key_emul'><span><</span><span>,</span></div>
    <div class='key key_emul'><span>></span><span>.</span></div>
    <div class='key key_emul'><span>?</span><span>/</span></div>
    <div class='key key_emul sp5 kshft'>Shift</div>
    <div class='key key_emul sp3 kctrl'>Ctrl</div><div class='key key_emul kalt'>Alt</div>
    <div class='key key_emul sp20'>Space</div>
    <div class='key key_emul kalt'>Alt</div><div class='key key_emul sp3 kctrl'>Ctrl</div>
</div>
<div class='section sec_emul sec_emul_right'>
    <div class='sp2'></div><div class='sp2'></div><div class='sp2'></div>
    <div class='key key_emul'>Insert</div><div class='key key_emul'>Home</div>
    <div class='key key_emul'>PgUp</div><div class='key key_emul'>Del</div>
    <div class='key key_emul'>End</div><div class='key key_emul'>PgDn</div>
    <div class='sp2'></div><div class='sp2'></div><div class='sp2'></div>
    <div class='sp2'></div><div class='key key_emul i'>&#8593;</div><div class='sp2'></div>
    <div class='key key_emul i'>&#8592;</div><div class='key key_emul i'>&#8595;</div>
    <div class='key key_emul i'>&#8594;</div>
</div>`, 30),
    getNum = (p, e) => {
        const res = +(URL_OPTS.get(p) ?? 0);
        if (isNaN(res)) throw new Error(`invalid parameter: ${p}; ${e}`);
        return res;
    };
    loads = await Promise.all(loads);
    const con = await createCon(scr_elem, blue, 'CP437', 80, 25),
          mem = await IBMIO(con),
          cpu = new GenCpu(mem, 4),
          com = COMPort(),
          emu = new Emulator(cpu, mem, 4),
          mon = new IBMMon(emu, com),
          kbd = new IBMKbd(kbd_elem, con, con_elem, mon);
    cpu.cpu.peripherals.push(com);
    mem.ram.set(loads[3], 0xf6000);
    mem.ram.set(loads[4], 0xfe000);
    const ega_rom = loads[5],
          length = ega_rom.length;
    for (let i = 0; i < length; i++)                  // reversed image
        mem.wr(0xc0000 + i, ega_rom[length - 1 - i]);
    mem.DRIVES[2] = await DOSDisk('pcxt/hdc.img');    // C:
    cpu.cpu.setRegs({'cs': 0xffff, 'ip': 0x0000});
    mem.vcu();                                        // show cursor
    if (getNum('memchk', 'expected: 0 - no check mem, 1 - check mem') === 0) {
        mem.wr(0x472, 0x34); mem.wr(0x473, 0x12);     // set soft reset flag (bypass memory test)
    }
    if (getNum('run', 'expected: 0 - load only, 1 - run'))
        cpu.run();                                    // start
    term.setPrompt('> ');                             // set terminal
    while (true) mon.exec(await term.prompt());
}
