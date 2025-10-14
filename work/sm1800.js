'use strict';

// base system (table version), includes:
// sm 1800.2201.xx - CPU module; xx = 01 - MONID 1.0, xx = 03 - MONID 1.3
// sm 1800.2202.01 - system control module
// sm 1800.3502.01 - RAM 64K module
// sm 1800.7001.01 - parallel interface module
// sm 1800.7201.01 - VTA 2000-30 terminal
// external module - function(SM_1803) { return {read, write[, state]}; }; can use irq method
class SM_1803 extends MemIO {
    constructor(con) {
        super(con, 0, false);
        this.ram2 = new Uint8Array(0x0c00); // 1800.2201 internal memory (2K ROM + 1K RAM)
        this.cfg = 0x00;                    // port 03 (config) value
        this.mm = 0;                        // memory map (0 - internal memory enabled)
        this.p03 = 0x00;                    // ports timeout bit
        this.sconsole = '';                 // console buffer
        this.ccopy = false;                 // console buffer enabled
        this.portHnds = new Map();          // additional modules
        this.DRIVES = [null, null];         // 2 FDC drives (no controllers)
    }
    rd(a) {
        return (this.mm === 0 && a < 0x0c00) ? this.ram2[a] : this.ram[a];
    }
    wr(a, v) {
        if (this.mm !== 0 || a >= 0x0c00) this.ram[a] = v;
        else if (a >= 0x0800) this.ram2[a] = v;
    }
    input(p) {
        switch (p) {
            case 0x00: // keyboard data
                return (this.con.kbd.length > 0) ? this.con.kbd.shift() : 0x00;
            case 0x01: // keyboard status
                return (this.con.kbd.length > 0) ? 0x05 : 0x04;
            case 0x03: // system status
                const res03 = this.p03;
                if (this.p03 !== 0x00) this.p03 = 0x00; // reset timeout bit after read
                return res03;
            default:
                const module = this.portHnds.get(p);
                if (module) return module.read(p);
                this.p03 = 0x02; console.warn(fmt(p));
                return 0x00;
        }
    }
    output(p, v) {
        switch (p) {
            case 0x00: // console data
                v &= 0xff; this.con.display(v);
                if (this.ccopy) this.sconsole += String.fromCharCode(v); // keep screen data
                break;
            case 0x01: // console mode
                break;
            case 0x03: // memory map and IRQ mask
                this.cfg = v; this.mm = (v & 0x10) ? 1 : 0;
                break;
            case 0xd1: // clear power failure signal
                break;
            default:
                const module = this.portHnds.get(p);
                if (module) module.write(p, v);
                else { this.p03 = 0x02; console.warn(fmt(p), fmt(v)); }
                break;
        }
    }
    irq(num) {
        if (this.CPU.cpu.ie && num >= 0 && num < Math.min(8, this.cfg & 0x0f)) // 3.055.003TO p.10
            this.CPU.cpu.setInterrupt(num);
    }
    add(module, ports) {
        for (let i = 0, n = ports.length; i < n; i++) {
            const port = ports[i],
                  mod = this.portHnds.get(port);
            if (mod !== undefined && mod !== module)
                throw new Error(`port already processed: ${port}`);
            this.portHnds.set(port, module);
        }
    }
}

// VTA 2000-30 terminal output
async function SM_1800_7201_out() {
    const con = await createCon(green, 'VT220'),
          old_disp = con.display;
    let in_esc = false, in_pos = 0;
    con.display = ccode => { // override to process VT52 esc codes and DEL (DOS1800) key
        if (ccode === 0x00 || ccode === 0x07) return; // invisible codes (NULL and BELL)
        if (in_pos > 0) {
            in_pos--;
            const str = (ccode - 31).toString();
            for (let i = 0, n = str.length; i < n; i++) old_disp(str.charCodeAt(i));
            ccode = (in_pos > 0) ? 0x3b : 0x66;
        }
        else switch (ccode) {
            case 0x1b: in_esc = true; break;
            case 0x41: case 0x42: case 0x43: case 0x44: case 0x48: case 0x4a: case 0x4b:
                if (in_esc) { old_disp(0x5b); in_esc = false; }
                break;
            case 0x45:
                if (in_esc) { old_disp(0x5b); old_disp(0x32); ccode = 0x4a; in_esc = false; }
                break;
            case 0x59: if (in_esc) { ccode = 0x5b; in_pos = 2; in_esc = false; } break;
            case 0x5b: in_esc = false; break;
            case 0x7f: if (!in_esc) { old_disp(0x08); ccode = 0x20; } break;
        }
        old_disp(ccode);
    };
    return con;
}

// VTA 2000-30 terminal input
class SM_1800_7201_in extends Kbd {
    constructor(con, mon) {
        super(con, mon);
    }
    processKey(val) {
        if (!this.fs_ctrl) switch (val) {
            case 2: super.processKey(27); val = 0x48; break;
            case 3: val = 14; break;
            case 4: super.processKey(27); val = 0x43; break;
            case 5: super.processKey(27); val = 0x41; break;
            case 18: val = 16; break;
            case 19: super.processKey(27); val = 0x44; break;
            case 24: super.processKey(27); val = 0x42; break;
        }
        super.processKey(val);
    }
}

// sm 1800.2001.01 - MTP (1 channel timer) module
function SM_1800_2001(memo) {
    let value = 0x0000,   // value
        counter = 0x0000, // counter
        freq = 1,         // frequency 1kHz
        ie = true,        // interrupt
        us2 = 0,          // control access
        rwcnt = 0x00,     // read/write count
        active = false;   // active
    const
    tick = () => {
        counter = (counter - 1) & 0xffff;
        if (counter === 0x0000) {
            active = false; // stop timer
            if (ie) memo.irq(1);
        }
        activate();
    },
    read = num => {
        switch (num) {
            case 0x60: // timer value
            case 0x64: // timer state
                let val = (num === 0x60) ? value : counter;
                switch (us2) {
                    case 0: val = 0x00; active = false; break; // stop timer
                    case 1: val = val & 0xff; break;
                    case 2: val = val >> 8 & 0xff; break;
                    case 3:
                        if (rwcnt & 0x10) { val = val >> 8 & 0xff; rwcnt &= 0x01; }
                        else { val = val & 0xff; rwcnt |= 0x10; }
                        break;
                }
                return val;
        }
    },
    write = (num, val) => {
        switch (num) {
            case 0x60: // timer value
                switch (us2) {
                    case 0: return;
                    case 1: value = (value & 0xff00) | val; break;
                    case 2: value = val << 8 | (value & 0x00ff); break;
                    case 3:
                        if (rwcnt & 0x01) {
                            value = val << 8 | (value & 0x00ff); rwcnt &= 0x10;
                        } else {
                            value = (value & 0xff00) | val; rwcnt |= 0x01;
                        }
                        break;
                }
                if (us2 < 3 || (rwcnt & 0x01) === 0x00) {
                    counter = value;
                    active = true; activate(); // start timer
                }
                break;
            case 0x63: // timer US2
                us2 = val >> 4 & 0x03; rwcnt = 0x00;
                break;
            case 0x64: // timer US1
                freq = (val & 0x01) ? 0.1 : 1; ie = (val & 0x10) === 0;
                break;
        }
    },
    activate = () => {
        if (active && memo.CPU.RUN) setTimeout(() => tick(), freq);
    };
    return {read, write, activate};
}

// sm 1800.5602 - FDC PLx45D
function SM_1800_5602(memo) {
    let status = 0x10, cmd = 0x00, trk = -1, drv, sec, pos, fdc,
        f40 = 0,       // track start mark (index hole) bit
        dirty = false; // sector buffer written
    const buff = new Uint8Array(128 + 21),
          mmm = {'rd': adr => buff[adr], 'wr': (adr, val) => buff[adr] = val},
    read = num => {
        if (num === 0x98) { // state
            if (cmd & 0x40 && (status & 0x10) === 0 && pos === 255)
                if (f40 > 1) f40 = 0;
                else { status |= 0x40; f40++; }
            else f40 = 0;
            const res = status;
            if ((status & 0x11) === 0x11) status &= 0xfe;
            if (status & 0x02) status &= 0xfd;
            if (status & 0x20) status &= 0xdf;
            if (status & 0x40) status &= 0xbf;
            return res;
        }                   // data (0x9a)
        if (status & 0x10 || (cmd & 0x08) === 0 || cmd & 0x80) return 0x00;
        if (pos >= buff.length) {
            sec++;
            if (sec > 26) { sec = 0; pos = 255; status |= 0x40; }
            else { load(); pos = 0; }
        }
        if (pos === 2 || pos === 17) status |= 0x02;
        else if (pos === 7 || pos === 147) status |= 0x20;
        return (pos < buff.length) ? buff[pos++] : 0x00;
    },
    write = (num, data) => {
        switch (num) {
            case 0x89:      // CW0
                drv = (data & 0x01) ? 1 : 0;
                fdc = memo.DRIVES[drv];
                if (fdc === null) status |= 0x10;
                else if (data & 0x20) { // step
                    trk += (data & 0x10) ? 1 : -1;
                    if (trk < 0 || trk >= 77) status |= 0x10;
                    else { status &= 0xef; sec = 0; pos = 255; }
                }
                status |= 0x01;
                break;
            case 0x88:      // CW1
                cmd = data;
                break;
            default:        // data (0x8a)
                if (status & 0x10 || (cmd & 0x08) === 0) break;
                if (pos >= buff.length) {
                    sec++;
                    if (sec > 26) { sec = 0; pos = 255; status |= 0x40; }
                    else { load(); pos = -1; }
                }
                switch (cmd & 0x05) {
                    case 0:                         // write async
                        if (data === 0xfb) pos = 19; // data index mark
                        break;
                    case 1:                         // write sync
                        if (pos >= 0 && pos < buff.length) {
                            buff[pos++] = data; dirty = true;
                            if (pos > 147) pos = buff.length; // stop writing after data
                        }
                        break;
                    case 5:                         // write CRC
                        if (dirty) {
                            dirty = false;
                            fdc.transfer(trk, sec, 19, mmm, false, 1);
                        }
                        break;
                }
                break;
        }
    },
    load = () => {
        fdc.transfer(trk, sec, 19, mmm, true, 1);
        buff[3] = 0xfe; buff[4] = trk; buff[6] = sec; buff[18] = 0xfb;
    },
    state = () => {
        return {status, cmd, trk, drv, sec, pos, f40, dirty, buff};
    };
    return {read, write, state};
}

// sm 5635.10 - FDC ES 5074
// sm 5635.09 - FDC SM 5615
function SM_5635_10(memo) {
    let piol = null, pioh = null, // IOB addr lo/hi
        err = 0x00;               // IO result
    const buff = new Uint8Array(128),
          mmm = {'rd': adr => buff[adr], 'wr': (adr, val) => buff[adr] = val},
    read = num => {
        switch (num) {
            case 0x70: // status
                if (piol !== null && pioh !== null) { // execute command
                    const adr = pioh << 8 | piol,
                          byt = memo.rd(adr + 1),
                          op = byt & 0x07,
                          drv = (byt & 0x10) >>> 4,    // limit drive to 1 bit (2 drives)
                          trk = memo.rd(adr + 3),
                          dma = memo.rd(adr + 6) << 8 | memo.rd(adr + 5),
                          hnd = (drv >= 0 && drv < 2) ? memo.DRIVES[drv] : null;
                    let cnt = memo.rd(adr + 2),
                        sec = memo.rd(adr + 4) & 0x1f; // limit sector to 5 bits (26 sectors)
                    if (hnd === null) err = 0x80;   // empty or invalid drive, set not ready
                    else switch (op) {
                        case 2: case 4: case 6:     // format/read/write
                            let trns = memo;
                            if (op === 2) {
                                trns = mmm; sec = 1; cnt = 26;
                                buff.fill(memo.rd(dma));
                            }
                            err = trnErr(hnd.transfer(trk, sec, dma, trns, op === 4, cnt));
                            break;
                        case 7: err = 0x02; break;  // write deleted not supported, set CRC error
                        default: err = 0x00; break; // seek, recalibrate, verify CRC - no error
                    }
                    piol = null; pioh = null;
                    return drvRd(0x0c); // interrupt pending
                }
                return drvRd(0x08);     // no interrupt
            case 0x71: // result
                return 0x00;
            case 0x73: // result byte
                const res = err; err = 0x00;
                return res;
        }
    },
    write = (num, data) => {
        switch (num) {
            case 0x71: piol = data & 0xff; break;                   // IOB lo
            case 0x72: pioh = data & 0xff; break;                   // IOB hi
            case 0x77: piol = null; pioh = null; err = 0x00; break; // reset
        }
    },
    drvRd = byte => {
        if (memo.DRIVES[0] !== null) byte |= 0x01; else byte &= 0xfe; // drive 0 ready
        if (memo.DRIVES[1] !== null) byte |= 0x02; else byte &= 0xfd; // drive 1 ready
        return byte;
    },
    trnErr = byte => (byte === 2 || byte === 3) ? 0x08 : // c, h, s    -> address error
            (byte === 5 || byte === 6) ? 0x02 :          // read/write -> CRC error
            byte,                                        // no translation
    state = () => {
        return {err, piol, pioh};
    };
    return {read, write, state};
}

// sm 1800.6202 - paper tape puncher/reader
function SM_1800_6202(memo) {
    let pos = 0;
    const buff = [],
    read = num => {
        if (num === 0x20) return (pos >= buff.length) ? 0x1a : buff[pos++] & 0xff;
        let res = 0x04;
        if (pos <= buff.length) res |= 0x01;
        return res;
    },
    write = (num, data) => {
        buff.push(data & 0xff);
    },
    tape = data => {
        pos = 0;
        if (data === undefined) {
            let i = 0;            // remove starting NIL [00 (x40)] segment
            while (i < buff.length && buff[i] === 0x00) i++;
            if (i >= 40) buff.splice(0, 40);
            i = buff.length - 40; // remove ending NIL [00 (x40)] segment
            if (i >= 0) {
                while (i < buff.length && buff[i] === 0x00) i++;
                if (i >= buff.length) buff.splice(buff.length - 40, 40);
            }
            if (buff.length === 0) return null;
            const res = new Uint8Array(buff);
            buff.length = 0;
            return res;
        }
        buff.length = 0;
        for (let i = 0, n = data.length; i < n; i++) buff.push(data[i]);
    },
    state = () => { return {pos, 'size': buff.length, buff}; };
    return {read, write, tape, state};
}

class SMMonitor extends Monitor {
    constructor(emu) {
        super(emu);
    }
    async handler(parms, cmd) {
        try { switch (cmd) {
            case 'rom':  // load RO memory
                let len;
                if ((len = parms.length) < 2) { console.error('missing: fn [h=0]'); break; }
                const hex = (len > 2) ? parms[2] === '1' : false,
                      tmp = await loadFile(parms[1], hex),
                      mmm = {'wr': (a, v) => this.emu.memo.ram2[a] = v};
                      len = hex ?
                              this.emu.loadHex(tmp, 0x0000, mmm) :
                              this.emu.loadBin(tmp, 0x0000, mmm);
                if (len > 0x0800) console.error(`invalid ROM length: ${len}`);
                break;
            case 'disk': // insert disk
                if (parms.length < 3) { console.error('missing: drv fn'); break; }
                const dn = pi(parms[1], false);
                if (dn >= this.emu.memo.DRIVES.length) {
                    console.error(`invalid drive num: ${dn}`); break;
                }
                const img = await loadFile(parms[2], false);
                if (img.length !== 256256) {
                    console.error(`disk image error: ${img.length}`); break;
                }
                if (this.emu.memo.DRIVES[dn] === null)
                    this.emu.memo.DRIVES[dn] = Disk(77, 26, 128, 1, 0x10000);
                this.emu.memo.DRIVES[dn].drive.set(img, 0);
                console.log(img.length);
                break;
            case 'dump': // save disk
                if (parms.length < 2) { console.error('missing: drv'); break; }
                const dv = pi(parms[1], false);
                if (dv >= this.emu.memo.DRIVES.length) {
                    console.error(`invalid drive num: ${dv}`); break;
                }
                const dd = this.emu.memo.DRIVES[dv];
                if (dd === null) { console.error(`empty drive: ${dv}`); break; }
                downloadFile('drive.img', dd.drive);
                break;
            case 'dtsm': // read disk, track, sec to mem
                if (parms.length < 5) { console.error('missing: drv trk sec mem [c=1]'); break; }
                const d_num = pi(parms[1], false),
                      t_num = pi(parms[2], false),
                      s_num = pi(parms[3], false),
                      m_num = pi(parms[4]),
                      cnt = (parms.length > 5) ? pi(parms[5], false) : 1;
                if (d_num >= this.emu.memo.DRIVES.length) {
                    console.error(`invalid drive num: ${d_num}`); break;
                }
                if (t_num > 76) { console.error(`invalid track num: ${t_num}`); break; }
                if (s_num < 1 || s_num > 26) {
                    console.error(`invalid sector num: ${s_num}`); break;
                }
                console.log(this.emu.memo.DRIVES[d_num]
                        .transfer(t_num, s_num, m_num, this.emu.memo, true, cnt));
                break;
            case 'copy': // console output snapshot
                if (parms.length < 2) {
                    console.log(this.emu.memo.sconsole);
                    this.emu.memo.ccopy = false; this.emu.memo.sconsole = '';
                }
                else this.emu.memo.ccopy = parms[1] === '1';
                break;
            case 'map':  // get/set active memory map
                if (parms.length < 2) { console.log(this.emu.memo.mm); break; }
                const mm = pi(parms[1], false);
                if (mm < 0 || mm > 1) console.error(`invalid memory map: ${mm}`);
                else this.emu.memo.mm = mm;
                break;
            case 'state': // get port handler state
                if (parms.length < 2) { console.error('missing: port'); break; }
                const port = pi(parms[1]),
                      phnd = this.emu.memo.portHnds.get(port);
                if (phnd === undefined) { console.error(`no handler for port: ${port}`); break; }
                console.log(phnd.state ? phnd.state() : 'no state');
                break;
            case 'tape': // load/unload tape
                const tphn = this.emu.memo.portHnds.get(0x20);
                if (tphn === undefined) { console.error('tape device not connected'); break; }
                if (parms.length < 2) {
                    const tbuf = tphn.tape();
                    if (tbuf === null) console.log('tape empty');
                    else downloadFile('tape.dat', tbuf);
                } else {
                    let tbuf = (parms[1] === 'reset') ? [] : await loadFile(parms[1], false);
                    if (parms.length > 2 && parms[2] === '1') {
                        tbuf = toIntelHex(tbuf, undefined, 0x10).split('');
                        for (let i = 0, n = tbuf.length; i < n; i++)
                            tbuf[i] = tbuf[i].charCodeAt(0);
                    }
                    tphn.tape(tbuf);
                    console.log(tbuf.length);
                }
                break;
            default: await super.handler(parms, cmd); break;
        } } catch (e) { console.error(e.stack); }
    }
}

async function main() {
    await loadScript('../emu/github/emu8/js/js8080.js');
    await loadScript('../emu/github/emu8/js/disks.js');
    const con = await SM_1800_7201_out(),
          mem = new SM_1803(con),
          cpu = new GenCpu(mem, 0),
          emu = new Emulator(cpu, mem, 0),
          mon = new SMMonitor(emu),
          kbd = new SM_1800_7201_in(con, mon);
    mem.add(SM_1800_2001(mem), [0x60, 0x63, 0x64]);
    mem.add(SM_1800_6202(mem), [0x20, 0x21]);
//    mem.add(SM_1800_5602(mem), [0x88, 0x89, 0x8a, 0x98, 0x9a]);
    mem.add(SM_5635_10(mem), [0x70, 0x71, 0x72, 0x73, 0x77]);
mem.add({'write': (p, v) => {
mem.ram[0xf748] = mem.ram[0xf749] = 0x00;
mem.ram[0xf74f] = mem.ram[0xf750] = mem.ram[0xf753] = 0x00;
mem.ram.set([0x3e, 0x04, 0xc3, 0xca, 0xf9], 0xf9a5);
mem.ram.set([
    0x3e, 0x06, 0x47, 0x3a, 0x9f, 0xfd, 0xb7, 0x78, 0xca, 0xd5, 0xf9, 0xf6, 0x30, 0x32,
    0xf8, 0xf9, 0x3a, 0x9b, 0xfd, 0x32, 0xfa, 0xf9, 0x3a, 0x9c, 0xfd, 0x32, 0xfb, 0xf9, 0x2a,
    0x9d, 0xfd, 0x22, 0xfc, 0xf9, 0x3e, 0xf7, 0xd3, 0x71, 0x3e, 0xf9, 0xd3, 0x72, 0xdb, 0x70,
    0xdb, 0x73, 0xc9, 0x80, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00
], 0xf9c8);
}}, [0x89]);
    term.setPrompt('> ');
// MONID 1.0: for SM_1800_5602
//await mon.exec('rom MONID10.ROM');
// MONID 1.3: for SM_5635_10
await mon.exec('rom MONID.ROM');
//mem.ram.set([
//0x21, 0x00, 0x08, 0xaf, 0xf5, 0xf1, 0x2b, 0x86, 0xf5, 0x7c, 0xb5, 0xc2, 0x05, 0x10, 0xf1, 0xfe,
//0x97, 0xca, 0x00, 0x10, 0x01, 0x1d, 0x10, 0xcd, 0x4c, 0x00, 0xcd, 0x40, 0x00, 0x6f, 0x7b, 0x69,
//0x62, 0x6b, 0x61, 0x00                 // test ROM CRC (for 1.3)
//0xcd, 0x6a, 0x00, 0xcd, 0x49, 0x00, 0x60, 0x69, 0xcd, 0x6a, 0x00, 0xcd, 0x49, 0x00, 0xaf, 0xf5,
//0xf1, 0x86, 0x23, 0x0b, 0xf5, 0x78, 0xb1, 0xc2, 0x10, 0x10, 0xf1, 0xcd, 0x61, 0x00, 0xcd, 0x40,
//0x00                                   // calc CRC
//], 0x1000);
//await mon.exec('r sm1800/sm_timer.hex 1'); // test timer module
//await mon.exec('disk 0 SM_SPO.dsk');
//await mon.exec('disk 1 sm1800/disks/4.098.056DUBL.bin');
// CPM 2.2: uses SM_1800_5602 only if not patched
await mon.exec('disk 0 SM_CPM.dsk');
await mon.exec('disk 1 ../emu/github/emu8/cpm/cpma.cpm');
// DOS 2.0: unknown MONID version if MONID1.3 and SM_1800_5602 loaded
//await mon.exec('disk 0 sm1800/disks/dos1copy.bin');
//await mon.exec('disk 1 sm1800/disks/dos2copy.bin');
//await mon.exec('disk 0 SM_DOS.dsk');
    mon.exec('g');
    while (true) await mon.exec(await term.prompt());
}
