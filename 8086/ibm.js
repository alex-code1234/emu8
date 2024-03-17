'use strict';

async function ibm(scr) {                 // default version
    return await pc(scr);
}

async function pc(scr) {                  // PC (5150)
    return await initibm(3, 'IBM PC, CGA, 640K memory, 2 FDC', async (mod, memo, cmd) => {
        loadBin(await loadFile('8086/basic.bin', false), 0xf6000);
        loadBin(await loadFile('8086/bios.bin', false), 0xfe000);
        DRIVES[0] = await DOSDisk('8086/pcdos_3_30_1.img');     // A:
        DRIVES[1] = await DOSDisk('8086/pcdos_3_30_2.img');     // B:
    });
}

async function xt(scr) {                  // XT (5160)
    return await initibm(4, 'IBM PC XT, EGA, 640K + 2M memory, 2 FDC, 10M HD', async (mod, memo, cmd) => {
        loadBin(await loadFile('8086/basic.bin', false), 0xf6000);
        loadBin(await loadFile('8086/bios2.bin', false), 0xfe000);
        const ega_rom = await loadFile('8086/ibm_ega.bin', false),
              length = ega_rom.length;
        for (let i = 0; i < length; i++)                        // reversed image
            memo.wr(0xc0000 + i, ega_rom[length - 1 - i]);
        DRIVES[2] = await DOSDisk('8086/hdc.img');              // C:
    });
}

async function initibm(proc, info, fnc) { // generic init
    const mod = await defaultHW(scr,
            new URLSearchParams(`?cpu_type=${proc}&cpu_name=cibm&mem_name=mibm&kbd_name=kibm`)),
          memo = mod.memo, cmd = mod.cmd;
    mod.info = info;
    mod.cmd = async (command, parms) => { // intercept command processor
        switch (command) {
            case 'on':
                await fnc(mod, memo, cmd);
                memo.wr(0x472, 0x00); memo.wr(0x473, 0x00);     // reset soft reset flag
                if (parms.length > 1 && parms[1] === 'false') {
                    memo.wr(0x472, 0x34); memo.wr(0x473, 0x12); // set soft reset flag
                }
                hardware.toggleDisplay();
                CPU.reset(); CPU.setRegisters({cs: 0xffff, ip: 0x0000}); run();
                break;
            default: return cmd(command, parms);
        }
        return true;
    };
    return mod;
}

async function cibm(memo) {               // IBM PC CPU
    await loadScript('js/js8086.js');
    await loadScript('js/disks.js');
    await loadScript('8086/chipset.js');
    const pic = new Intel8259(),
          dma = new Intel8237(),
          ppi = new Intel8255(pic),
          cpu = new Intel8086(memo.wr, memo.rd, pic, new Intel8253(pic), memo.int);
    cpu.peripherals.push(dma);
    cpu.peripherals.push(ppi);
    let crtc = new Motorola6845();
    if (CPUTYPE === 4)
        crtc = new EGA(crtc, memo.add, memo.ram);
    cpu.peripherals.push(crtc);
    cpu.peripherals.push(new Intel8272(dma, pic));
    if (CPUTYPE === 4) {
        cpu.peripherals.push(new EMS(memo.add));
        MACHINE = 1;
        CPU_186 = 1;
    }
    memo.setChipset(crtc, ppi);
    return cpu;
}

const DRIVES = [undefined, undefined, undefined]; // disk drives

async function mibm(con) {                // IBM PC system IO
    con.print('^[?25l');                  // hide VT-100 cursor
    const ram = new Uint8Array(0x100000);
    let crtc = null, ocl = -1, scrvis = false,
        base = 0xb8000, cols = 80, lsiz = 160, stad = 0,
        em_b = null, em_e, em_w, em_r,    // EMS parameters
        eg_b = null, eg_e, eg_w, eg_r;    // EGA parameters
    const contgl = con.toggle,
    cursor = (loc, show) => {             // show / hide cursor
        const x = loc % cols, y = loc / cols | 0,
              a = base + y * lsiz + (x << 1) + stad,
              chr = ram[a], attr = ram[a + 1];
        let fg, bg;
        if (show) { fg = attr >>> 4 & 0x07; bg = attr & 0x0f; }
        else { fg = attr & 0x0f; bg = attr >>> 4 & 0x07; }
        con.output(x, y, fg, bg, chr);
    },
    result = {
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
                const video = ram[0x449],
                      wdth = (video < 2) ? 40 : 80;
                base = (video === 7) ? 0xb0000 : 0xb8000;
                stad = (crtc.getRegister(0x0c) << 8 | crtc.getRegister(0x0d)) << 1;
                if (cols !== wdth) {
                    cols = wdth;
                    lsiz = (cols === 40) ? 80 : 160;
                    ocl = -1;
                    con.setWidth(cols);
                }
                // draw character with attribute
                const idx = a - base - stad;
                let chr, attr;
                if (a & 1) { chr = ram[a - 1]; attr = v; }
                else { chr = v; attr = ram[a + 1]; }
                con.output((idx % lsiz) >>> 1, idx / lsiz | 0, attr & 0x0f, attr >>> 4 & 0x07, chr);
                return;
            }
            if (CPU.RUN && a >= 0xc0000)
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
            if (scrvis)
                setTimeout(result.vcu, 300);
        },
        'int': type => {
            if (CPUTYPE === 4) {
                if (type === 0x2f) {      // enable FreeDOS loading
                    const regs = CPU.getRegs(),
                          resp = {};
                    if (regs.ah === 0x16 && regs.al === 0x80) {
                        resp.al = 0x00;
                        CPU.setRegs(resp);
                        return true;
                    }
                    return false;
                }
                if (type === 0x18) {      // enable boot from hard drive
                    const hdr = DRIVES[2];
                    if (hdr) {
                        hdr.transfer(0, 1, 0, 0x7c00, true, result, 1);
                        let check_addr = 0x7c00 + 510;
                        if (ram[check_addr++] === 0x55 && ram[check_addr] === 0xaa) {
                            CPU.setRegisters({cs: 0x0000, ip: 0x7c00});
                            return true;
                        }
                    }
                    return false;
                }
            }
            if (type !== 0x13)
                return false;
            const regs = CPU.getRegs(),
                  resp = {};
            switch (regs.ah) {
                case 0x02:
                case 0x03:
                    const memi = CPU.getAddr(regs.es, regs.bh << 8 | regs.bl),
                          cyl = (regs.cl & 0xc0) << 2 | regs.ch,
                          sect = regs.cl & 0x3f,
                          head = regs.dh,
                          wr = regs.ah === 3;
                    let drv = regs.dl;
                    if (drv === 0x80)
                        drv = 2;
                    const hdr = DRIVES[drv];
                    resp.ah = hdr ? hdr.transfer(cyl, sect, head, memi, !wr, result, regs.al) : 0x0c;
                    resp.flags = (resp.ah === 0x00) ? regs.flags & 0xfe : regs.flags | 0x01;
                    break;
                case 0x00:
                    resp.ah = 0;
                    resp.flags = regs.flags & 0xfe;
                    break;
                case 0x04:
                case 0x08:
                case 0x18:
                    if (regs.dl !== 0x80)
                        return false;
                    if (regs.ah === 0x08) {
                        resp.dl = 1; resp.dh = 3;
                        resp.ch = 305 & 0xff; resp.cl = ((305 & 0x300) >>> 2) | 17;
                    }
                    resp.ah = 0;
                    resp.flags = regs.flags & 0xfe;
                    break;
                default:
                    return false;
            }
            CPU.setRegs(resp);
            return true;
        }
    };
    result.ram = ram;                     // system memory reference
    result.setChipset = (crt, kbd) => {
        crtc = crt;                       // display control
        result.ppi = kbd;                 // keyboard control
    };
    con.toggle = () => {                  // override console toggle
        contgl();
        scrvis = !scrvis;
        if (scrvis)
            result.vcu();
    };
    return result;
}

function getScanCode(key, code, value) {
    switch (code) {
        case 51 /*VK_ESCAPE    ctrl-4*/: return [0x01, 0];
        case 46 /*VK_DELETE*/: return [0x53, 0];
        case 37 /*VK_LEFT*/: return [0x4b, 0];
        case 39 /*VK_RIGHT*/: return [0x4d, 0];
        case 8  /*VK_BACK_SPACE*/: return [0x0e, 0];
        case 84 /*VK_TAB       ctrl-t*/: return [0x0f, 0];
        case 13 /*VK_ENTER*/: return [0x1c, 0];
        case 88 /*VK_CAPS_LOCK ctrl-x*/: return [0x3a, 0];
        case 48 /*VK_F1        ctrl-1*/: return [0x3b, 0];
        case 70 /*VK_F2        ctrl-f*/: return [0x3c, 0];
        case 50 /*VK_F3        ctrl-3*/: return [0x3d, 0];
        case 65 /*VK_F4        ctrl-a*/: return [0x3e, 0];
        case 52 /*VK_F5        ctrl-5*/: return [0x3f, 0];
        case 53 /*VK_F6        ctrl-6*/: return [0x40, 0];
        case 54 /*VK_F7        ctrl-7*/: return [0x41, 0];
        case 55 /*VK_F8        ctrl-8*/: return [0x42, 0];
        case 66 /*VK_F9        ctrl-b*/: return [0x43, 0];
        case 68 /*VK_F10       ctrl-d*/: return [0x44, 0];
        case 72 /*VK_HOME      ctrl-h*/: return [0x47, 0];
        case 87 /*VK_UP        ctrl-w*/: return [0x48, 0];
        case 83 /*VK_PAGE_UP   ctrl-s*/: return [0x49, 0];
        case 69 /*VK_END       ctrl-e*/: return [0x4f, 0];
        case 90 /*VK_DOWN      ctrl-z*/: return [0x50, 0];
        case 75 /*VK_PAGE_DOWN ctrl-k*/: return [0x51, 0];
        case 73 /*VK_INSERT    ctrl-i*/: return [0x52, 0];
        case 229:
            let modifier = 0;
            if (value >= 'A' && value <= 'Z') {
                value = value.toLowerCase();
                modifier = 0x2a; // VK_SHIFT
            }
            switch (value) {
                case '1' /*VK_1*/: return [0x02, 0];
                case '!' /* !  */: return [0x02, 0x2a];
                case '2' /*VK_2*/: return [0x03, 0];
                case '@' /* @  */: return [0x03, 0x2a];
                case '3' /*VK_3*/: return [0x04, 0];
                case '#' /* #  */: return [0x04, 0x2a];
                case '4' /*VK_4*/: return [0x05, 0];
                case '$' /* $  */: return [0x05, 0x2a];
                case '5' /*VK_5*/: return [0x06, 0];
                case '%' /* %  */: return [0x06, 0x2a];
                case '6' /*VK_6*/: return [0x07, 0];
                case '^' /* ^  */: return [0x07, 0x2a];
                case '7' /*VK_7*/: return [0x08, 0];
                case '&' /* &  */: return [0x08, 0x2a];
                case '8' /*VK_8*/: return [0x09, 0];
                case '*' /* *  */: return [0x09, 0x2a];
                case '9' /*VK_9*/: return [0x0a, 0];
                case '(' /* (  */: return [0x0a, 0x2a];
                case '0' /*VK_0*/: return [0x0b, 0];
                case ')' /* )  */: return [0x0b, 0x2a];
                case '-' /*VK_MINUS*/: return [0x0c, 0];
                case '_' /* _  */: return [0x0c, 0x2a];
                case '=' /*VK_EQUALS*/: return [0x0d, 0];
                case '+' /* +  */: return [0x0d, 0x2a];
                case 'q' /*VK_Q*/: return [0x10, modifier];
                case 'w' /*VK_W*/: return [0x11, modifier];
                case 'e' /*VK_E*/: return [0x12, modifier];
                case 'r' /*VK_R*/: return [0x13, modifier];
                case 't' /*VK_T*/: return [0x14, modifier];
                case 'y' /*VK_Y*/: return [0x15, modifier];
                case 'u' /*VK_U*/: return [0x16, modifier];
                case 'i' /*VK_I*/: return [0x17, modifier];
                case 'o' /*VK_O*/: return [0x18, modifier];
                case 'p' /*VK_P*/: return [0x19, modifier];
                case '[' /*VK_OPEN_BRACKET*/: return [0x1a, 0];
                case '{' /* {  */: return [0x1a, 0x2a];
                case ']' /*VK_CLOSE_BRACKET*/: return [0x1b, 0];
                case '}' /* }  */: return [0x1b, 0x2a];
                case 'a' /*VK_A*/: return [0x1e, modifier];
                case 's' /*VK_S*/: return [0x1f, modifier];
                case 'd' /*VK_D*/: return [0x20, modifier];
                case 'f' /*VK_F*/: return [0x21, modifier];
                case 'g' /*VK_G*/: return [0x22, modifier];
                case 'h' /*VK_H*/: return [0x23, modifier];
                case 'j' /*VK_J*/: return [0x24, modifier];
                case 'k' /*VK_K*/: return [0x25, modifier];
                case 'l' /*VK_L*/: return [0x26, modifier];
                case ';' /*VK_SEMICOLON*/: return [0x27, 0];
                case ':' /* :  */: return [0x27, 0x2a];
                case '\'' /*VK_QUOTE*/: return [0x28, 0];
                case '"' /* "  */: return [0x28, 0x2a];
                case '`' /*VK_BACK_QUOTE*/: return [0x29, 0];
                case '~' /* ~  */: return [0x29, 0x2a];
                case '\\' /*VK_BACK_SLASH*/: return [0x2b, 0];
                case '|' /* |  */: return [0x2b, 0x2a];
                case 'z' /*VK_Z*/: return [0x2c, modifier];
                case 'x' /*VK_X*/: return [0x2d, modifier];
                case 'c' /*VK_C*/: return [0x2e, modifier];
                case 'v' /*VK_V*/: return [0x2f, modifier];
                case 'b' /*VK_B*/: return [0x30, modifier];
                case 'n' /*VK_N*/: return [0x31, modifier];
                case 'm' /*VK_M*/: return [0x32, modifier];
                case ',' /*VK_COMMA*/: return [0x33, 0];
                case '<' /* <  */: return [0x33, 0x2a];
                case '.' /*VK_PERIOD*/: return [0x34, 0];
                case '>' /* >  */: return [0x34, 0x2a];
                case '/' /*VK_SLASH*/: return [0x35, 0];
                case '?' /* ?  */: return [0x35, 0x2a];
                case ' ' /*VK_SPACE*/: return [0x39, 0];
                default: return [0, 0];
            }
        default: return [0, 0];
    }
}

async function kibm(con, memo) {          // IBM PC keyboard
    return {
        'keyboard': async (key, code, value) => {
            if (value === null)
                return;
            const [cde, modifier] = getScanCode(key, code, value);
            if (cde > 0) {
                if (modifier > 0) {
                    memo.ppi.keyTyped(modifier);
                    await delay(10);
                }
                memo.ppi.keyTyped(cde);
                await delay(10);
                memo.ppi.keyTyped(0x80 | cde);
                if (modifier > 0) {
                    await delay(10);
                    memo.ppi.keyTyped(0x80 | modifier);
                }
            }
        }
    };
}
