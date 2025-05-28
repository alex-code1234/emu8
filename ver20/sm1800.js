'use strict';

//http://cpm.z80.de/manuals/archive/cpm22htm/axd.htm       - MDS-800 fdd
//https://zx-pk.ru/threads/33253-diskety-8-quot/page6.html - disk img
//https://studfile.net/spbgti/29/folder:28680/#3168494     - sm-1800 info
//https://ruecm.forum2x2.ru/t953-topic
//https://ruecm.forum2x2.ru/t952-topic
//https://zx-pk.ru/archive/index.php/t-15472.html
//https://zx-pk.ru/threads/8399-f-a-q-po-emulyatoru-bashkiriya-2m/page6.html
//http://www.bitsavers.org/pdf/intel/ISIS_II/

class SMMemIO extends MemIO {
    constructor(con) {
        super(con, 0, false);
        this.ram2 = new Uint8Array(0x0c00);                                            // memory map 1
        this.cfg = 0x00;                                                               // port 03 (config) value
        this.mm = 0;                                                                   // memory map
        this.sconsole = '';                                                            // console buffer
        this.ccopy = false;                                                            // console buffer enabled
        this.value = 0x0000;                                                           // timer value
        this.counter = 0x0000;                                                         // timer counter
        this.freq = 1;                                                                 // timer frequency 1kHz
        this.ie = true;                                                                // timer interrupt
        this.us2 = 0;                                                                  // timer access
        this.rwcnt = 0x00;                                                             // timer read/write count
        this.active = false;                                                           // timer active
        this.DRIVES = [null, null];                                                    // Intellec floppy drives 0..1
        this.piol = null;                                                              // fdc IOB address low
        this.pioh = null;                                                              // fdc IOB address high
        this.err = 0x00;                                                               // fdc error
    }
    rd(a) {
        return (a < 0x0c00 && this.mm === 1) ? this.ram2[a] : this.ram[a];
    }
    wr(a, v) {
        if (this.mm === 0) { if (a >= 0x0800) this.ram[a] = v; }
        else if (a >= 0x0c00) this.ram[a] = v;
        else this.ram2[a] = v;
    }
    input(p) {
        switch (p) {
            case 0x00: return (this.con.kbd.length > 0) ? this.con.kbd.shift() : 0x00; // console data
            case 0x01: return (this.con.kbd.length > 0) ? 0x05 : 0x04;                 // console status
            case 0x03: return 0xff; // hw config; DOS1800: if not bit 02 then UNKNOWN MONID VERSION error
            case 0x40: return 0x00;                                                    // second console stub
            case 0x42: return 0x01;                                                    // second console stub
            case 0x60:                                                                 // timer value
            case 0x64:                                                                 // timer state
                let val = (p === 0x60) ? this.value : this.counter;
                switch (this.us2) {
                    case 0: val = 0x00; this.active = false; break;                    // stop timer
                    case 1: val = val & 0xff; break;
                    case 2: val = val >> 8 & 0xff; break;
                    case 3:
                        if (this.rwcnt & 0x10) { val = val >> 8 & 0xff; this.rwcnt &= 0x01; }
                        else { val = val & 0xff; this.rwcnt |= 0x10; }
                        break;
                }
                return val;
            case 0x70:                                                                 // disk status
                if (this.piol !== null && this.pioh !== null) {
                    const adr = this.pioh << 8 | this.piol;
                    let op = this.ram[adr + 1];
                    const cnt = this.ram[adr + 2], trk = this.ram[adr + 3], sec = this.ram[adr + 4],
                          dma = this.ram[adr + 6] << 8 | this.ram[adr + 5];
                    let drv = 0; if (op >= 48) { op -= 48; drv = 1; }
                    if (op === 3) this.err = 0x00;
                    else if (op !== 4 && op !== 6) this.err = 0x02;
                    else {
                        const hnd = this.DRIVES[drv];
                        if (hnd === null || hnd === undefined) this.err = 0x03;
                        else this.err = hnd.transfer(trk, sec, dma, this, op === 4, cnt);
                    }
                    this.piol = null; this.pioh = null;
                    return 0x0d;                                                       // disk state
                }
                return 0x09;
            case 0x71: return 0x00;                                                    // disk result type
            case 0x73: const res = this.err; this.err = 0x00; return res;              // disk result byte
            case 0x78: return 0x00;                                                    // disk 2 stub
            case 0x98:              // wd1793 stub; DOS1800: patch to avoid endless loop
                if (this.mm === 1 && this.ram[0x278b] === 0xfe && this.ram[0x278c] === 0x03)
                    this.ram[0x278c] = 0x00;
                return 0x00;
            default: console.log(fmt(p, 2)); return 0x00;
        }
    }
    output(p, v) {
        switch (p) {
            case 0x00:                                                                 // console data
                v &= 0xff; this.con.display(v);
                if (this.ccopy) this.sconsole += String.fromCharCode(v);               // keep screen data
                break;
            case 0x01: break;                                                          // console mode
            case 0x03: this.cfg = v; this.mm = (v & 0x10) ? 1 : 0; break;              // memory map and irq mask
            case 0x40: break;                                                          // second console stub
            case 0x60:                                                                 // timer value
                switch (this.us2) {
                    case 0: return;
                    case 1: this.value = (this.value & 0xff00) | v; break;
                    case 2: this.value = v << 8 | (this.value & 0x00ff); break;
                    case 3:
                        if (this.rwcnt & 0x01) {
                            this.value = v << 8 | (this.value & 0x00ff); this.rwcnt &= 0x10;
                        } else {
                            this.value = (this.value & 0xff00) | v; this.rwcnt |= 0x01;
                        }
                        break;
                }
                if (this.us2 < 3 || (this.rwcnt & 0x01) === 0x00) {
                    this.counter = this.value;
                    this.active = true; setTimeout(() => this.tick(), this.freq);      // start timer
                }
                break;
            case 0x63:                                                                 // timer US2
                this.us2 = v >> 4 & 0x03; this.rwcnt = 0x00;
                break;
            case 0x64:                                                                 // timer US1
                this.freq = (v & 0x01) ? 0.1 : 1; this.ie = (v & 0x10) === 0;
                break;
            case 0x71: this.piol = v & 0xff; break;                                    // disc IOB low address
            case 0x72: this.pioh = v & 0xff; break;                                    // disk IOB high address
            case 0x77: this.piol = null; this.pioh = null; this.err = 0x00; break;     // disk reset
            case 0x89:              // wd1793; CP/M: patch
                this.ram[0xf748] = this.ram[0xf749] = 0x00;
                this.ram[0xf74f] = this.ram[0xf750] = this.ram[0xf753] = 0x00;
                this.ram[0xf82b] = this.ram[0xf82c] = 0x00;
                this.ram[0xfa08] = this.ram[0xfa09] = 0x00;
                this.ram[0xfa6a] = this.ram[0xfa6b] = this.ram[0xfa6e] = 0x00;
                this.ram.set([0x3e, 0x04, 0xc3, 0xca, 0xf9], 0xf9a5);
                this.ram.set([0x3e, 0x06, 0x47, 0x3a, 0x9f, 0xfd, 0xb7, 0x78, 0xca, 0xd5, 0xf9, 0xf6, 0x30, 0x32,
                        0xf8, 0xf9, 0x3a, 0x9b, 0xfd, 0x32, 0xfa, 0xf9, 0x3a, 0x9c, 0xfd, 0x32, 0xfb, 0xf9, 0x2a,
                        0x9d, 0xfd, 0x22, 0xfc, 0xf9, 0x3e, 0xf7, 0xd3, 0x71, 0x3e, 0xf9, 0xd3, 0x72, 0xdb, 0x70,
                        0xdb, 0x73, 0xc9, 0x80, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00], 0xf9c8);
                break;
            case 0xd1: break;       // DOS1800 3506
            default: console.log(fmt(p, 2), fmt(v, 2)); break;
        }
    }
    tick() {                                                                           // timer
        this.counter = (this.counter - 1) & 0xffff;
        if (this.counter === 0x0000) {
            this.active = false;                                                       // stop timer
            if (this.ie && (this.cfg & 0x02)) this.CPU.cpu.setInterrupt(1);
        }
        if (this.active && this.CPU.RUN) setTimeout(() => this.tick(), this.freq);
    }
}

class SMMonitor extends Monitor {
    constructor(emu) {
        super(emu, undefined, undefined);
    }
    async handler(parms, cmd) {
        try {
        let len, hex, tmp, mmm;
        switch (cmd) {
            case 'rom':                   // load RO memory
                if ((len = parms.length) < 2) { console.error('missing: fn [h=0]'); break; }
                hex = (len > 2) ? parms[2] === '1' : false;
                tmp = await loadFile(parms[1], hex);
                mmm = {'wr': (a, v) => this.emu.memo.ram[a] = v};
                console.log(hex ? this.emu.loadHex(tmp, 0x0000, mmm) : this.emu.loadBin(tmp, 0x0000, mmm));
                break;
            case 'disk':                  // insert disk
                if (parms.length < 3) { console.error('missing: drv fn'); break; }
                const dn = pi(parms[1], false);
                if (dn >= this.emu.memo.DRIVES.length) { console.error(`invalid drive num: ${dn}`); break; }
                const img = await loadFile(parms[2], false);
                if (img.length !== 256256) { console.error(`disk image error: ${img.length}`); break; }
                if (this.emu.memo.DRIVES[dn] === null) this.emu.memo.DRIVES[dn] = Disk(77, 26, 128, 1, 0x10000);
                this.emu.memo.DRIVES[dn].drive.set(img, 0);
                console.log(img.length);
                break;
            case 'dtsm':                  // read disk, track, sec to mem
                if (parms.length < 5) { console.error('missing: drv trk sec mem [c=1]'); break; }
                const d_num = pi(parms[1], false),
                      t_num = pi(parms[2], false),
                      s_num = pi(parms[3], false),
                      m_num = pi(parms[4]),
                      cnt = (parms.length > 5) ? pi(parms[5], false) : 1;
                if (d_num >= this.emu.memo.DRIVES.length) { console.error(`invalid drive num: ${d_num}`); break; }
                if (t_num > 76) { console.error(`invalid track num: ${t_num}`); break; }
                if (s_num < 1 || s_num > 26) { console.error(`invalid sector num: ${s_num}`); break; }
                console.log(this.emu.memo.DRIVES[d_num].transfer(t_num, s_num, m_num, this.emu.memo, true, cnt));
                break;
            case 'map':                   // get/set active memory map
                if (parms.length < 2) { console.log(this.emu.memo.mm); break; }
                tmp = pi(parms[1], false);
                if (tmp < 0 || tmp > 1) console.error(`invalid memory map: ${tmp}`);
                else this.emu.memo.mm = tmp;
                break;
            case 'copy':                  // console output snapshot
                if (parms.length < 2) {
                    console.log(this.emu.memo.sconsole);
                    this.emu.memo.ccopy = false; this.emu.memo.sconsole = '';
                }
                else this.emu.memo.ccopy = parms[1] === '1';
                break;
            case 'esc':                   // send string to console
                if (parms.length < 2) { console.error('missing: str'); break; }
                this.emu.memo.con.print(parms[1]);
                break;
            case 'kbd':                   // send string to keyboard buffer
                if (parms.length < 2) { console.error('missing: str'); break; }
                tmp = parms[1].replaceAll('\\n', '\r').replaceAll('\\s', ' ');
                for (let i = 0, n = tmp.length; i < n; i++) {
                    this.emu.memo.con.kbd.push(tmp.charCodeAt(i));
                    await delay(15);
                }
                break;
            case 'help':
                term.write('<Enter>              ', 'var(--secondary)');
                term.print('CPU one step');
                term.write('x [reg/flg val ...]  ', 'var(--secondary)');
                term.print('print/set CPU registers/flags');
                term.write('g [adr] [- stop]     ', 'var(--secondary)');
                term.print('start CPU from adr to stop address');
                term.write('step [adr]           ', 'var(--secondary)');
                term.print('step CPU till adr or next instruction');
                term.write('debug                ', 'var(--secondary)');
                term.print('start interactive debugger');
                term.write('quit                 ', 'var(--secondary)');
                term.print('exit interactive debugger');
                term.write('refresh              ', 'var(--secondary)');
                term.print('update interactive debugger UI');
                term.write('wadd adr [adr ...]   ', 'var(--secondary)');
                term.print('add memory adr to debugger`s watch panel');
                term.write('wrem adr [adr ...]   ', 'var(--secondary)');
                term.print('remove memory adr from debugger`s watch panel');
                term.write('sadr adr             ', 'var(--secondary)');
                term.print('set adr for debugger`s scope panel');
                term.write('sadd msk [clr [wdt]] ', 'var(--secondary)');
                term.print('add graph for bit mask with color and width to debugger`s');
                term.print('                     scope panel; msk - bit mask, clr - color, wdt - width');
                term.write('srem msk             ', 'var(--secondary)');
                term.print('remove graph for bit mask from debugger`s scope panel');
                term.write('swdt wdt             ', 'var(--secondary)');
                term.print('set graphs width for debugger`s scope panel');
                term.write('spts pts             ', 'var(--secondary)');
                term.print('set graphs x-axis points pts for debugger`s scope panel');
                term.write('d [adr]              ', 'var(--secondary)');
                term.print('dump memory from address adr');
                term.write('l [adr]              ', 'var(--secondary)');
                term.print('disassemble memory from address adr');
                term.write('m adr b [b ...]      ', 'var(--secondary)');
                term.print('modify memory from address adr with bytes b');
                term.write('r [a=100] fn [h=0]   ', 'var(--secondary)');
                term.print('load file fn to memory at address a; h=1 - hex file');
                term.write('w a1 a2              ', 'var(--secondary)');
                term.print('get block of memory from address a1 to a2 inclusive');
                term.write('cls                  ', 'var(--secondary)');
                term.print('clear terminal');
                term.write('rom fn [h=0]         ', 'var(--secondary)');
                term.print('load file fn to ROM at address 0000');
                term.write('disk drv fn          ', 'var(--secondary)');
                term.print('load disk img file fn to drive drv');
                term.write('dtsm d t s m [c=1]   ', 'var(--secondary)');
                term.print('load c sectors starting from sector s of track t from');
                term.print('                     drive d to memory m');
                term.write('map [m]              ', 'var(--secondary)');
                term.print('print/set active memory map m - 0|1');
                term.write('copy [f]             ', 'var(--secondary)');
                term.print('print screen copy / set screen copy enable flag f - 0|1');
                term.write('esc str              ', 'var(--secondary)');
                term.print('send str to console; ^ to ESC, _ to space, ~ to CRLF');
                term.write('kbd str              ', 'var(--secondary)');
                term.print('send str to keyboard buffer; \\n to CR, \\s to space');
                break;
            default: await super.handler(parms, cmd); break;
        }
        } catch (e) { console.error(e.stack); }
    }
}

class SMKbd extends Kbd {
    constructor(con, mon) {
        super(con, mon);
    }
    processKey(val) {
        if (val >= 0x61 && val <= 0x7a)   // convert a..z to upper case
            val -= 0x20;
        super.processKey(val);
    }
}

async function main() {
    await loadScript('../js/js8080.js');
    await loadScript('../js/disks.js');
    const con = await createCon(green, 'VT220'),
          mem = new SMMemIO(con),
          cpu = new GenCpu(mem, 0),
          emu = new Emulator(cpu, mem, 0),
          mon = new SMMonitor(emu),
          kbd = new SMKbd(con, mon);
    const old_disp = con.display;         // override console to process VT52 esc codes and DEL (DOS1800) key
    let in_esc = false, in_pos = 0;
    con.display = ccode => {
        if (in_pos > 0) {
            in_pos--;
            const str = (ccode - 31).toString();
            for (let i = 0, n = str.length; i < n; i++) old_disp(str.charCodeAt(i));
            ccode = (in_pos > 0) ? 0x3b : 0x66;
        }
        else switch (ccode) {
            case 0x1b: in_esc = true; break;
            case 0x41:
            case 0x42:
            case 0x43:
            case 0x44:
            case 0x48:
            case 0x4a:
            case 0x4b: if (in_esc) { old_disp(0x5b); in_esc = false; } break;
            case 0x45: if (in_esc) { old_disp(0x5b); old_disp(0x32); ccode = 0x4a; in_esc = false; } break;
            case 0x59: if (in_esc) { ccode = 0x5b; in_pos = 2; in_esc = false; } break;
            case 0x7f: if (!in_esc) { old_disp(0x08); ccode = 0x20; } break;
        }
        old_disp(ccode);
    };
    term.setPrompt('> ');
    await mon.exec('rom MONID.ROM');
//    await mon.exec('disk 0 SM_SPO.dsk');
    await mon.exec('disk 0 SM_DOS.dsk');
//    await mon.exec('disk 0 SM_CPM.dsk');
    mon.exec('g');
    while (true) {
        const input = await term.prompt();
        mon.exec(input.trim());
    }
}
