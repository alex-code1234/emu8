'use strict';

async function cpm(scr) {                 // default version
    return await cpm22(scr);
}

async function cpm22(scr) {
    return await cpm_init(scr, 0);
}

async function cpm30(scr) {
    return await cpm_init(scr, 1);
}

async function mpm(scr) {
    return await cpm_init(scr, 2);
}

// switch CPU:
//     monitor command
//         cpu 0 - 8080
//         cpu 1 - Z80
//     or URL parameter
//         cpu_type=
async function cpm_init(scr, version) {   // CP[MP]/M init
    let urlparams = '?mem_name=cpm_memo', // support CPU switching by command or URL
        urlcpu = URL_OPTS.get('cpu_type');
    if (urlcpu !== null)
        urlparams += `&cpu_type=${urlcpu}`;
    const mod = await defaultHW(scr, new URLSearchParams(urlparams)),
          memo = mod.memo, cmd = mod.cmd,
          nm = cpuName(CPUTYPE),
    getDisk = (pms, n, er, fg) => {       // disk IO command helper
        if (pms.length < n) { console.error(er); return; }
        const dn = pi(pms[1], false);
        if (dn >= CPM_DRIVES.length) { console.error(`invalid drive num: ${dn}`); return; }
        if (!fg) return dn;
        const dd = CPM_DRIVES[dn];
        if (dd === undefined || dd === null) { console.error(`invalid drive: ${dn}`); return; }
        return dd;
    };
    if (CPUTYPE > 1)
        throw new Error(`invalid CPU: ${nm}`);
    switch (version) {
        case 0:
            mod.info = `CP/M 2.2, ${nm}, VT-100, 64K memory, 4 FDC (8" IBM SD)`;
            break;
        case 1:
            mod.info = `CP/M 3.0, ${nm}, VT-100, 160K memory, 4 FDC (8" IBM SD)`;
            break;
        default:
            mod.info = `MP/M II 2.0, ${nm}, VT-100, 400K memory, 4 FDC (8" IBM SD), 2 HDC (4M), 1 HDC (512M)`;
            break;
    }
    mod.cmd = async (command, parms) => { // intercept command processor
        switch (command) {
            case 'tests':                 // add interrupt test
                console.log('name: interrupt, CPU test ', console.NB);
                return cmd(command, parms);
            case 'test':                  // interrupt test
                if (parms[1] === 'interrupt') {
                    loadHex(await loadFile('cpm/int_test.hex', true), 0);
                    hardware.toggleDisplay();
                    CPU.reset();
                    memo.output(0x1b, 1); // start timer
                    CPU.setPC((CPUTYPE === 0) ? 0x95 : 0x90); run();
                    memo.output(0x1b, 0); // stop timer
                    break;
                }
                return cmd(command, parms);
            case 'disk':                  // insert disk
                const disk_num = getDisk(parms, 3, 'missing: drv fname|size', false);
                if (disk_num === undefined) break;
                const disk_fn = parms[2],
                      disk_img = isNaN(disk_fn) ? await CPMDisk(disk_fn) : await CPMDisk(null, +disk_fn);
                CPM_DRIVES[disk_num] = disk_img;
                console.log(disk_img.drive.length);
                break;
            case 'dump':                  // save disk
                const d_drive = getDisk(parms, 2, 'missing: drv', true);
                if (d_drive === undefined) break;
                downloadFile('drive.img', d_drive.drive);
                break;
            case 'read':                  // read file
                const r_drive = getDisk(parms, 3, 'missing: drv fname', true);
                if (r_drive === undefined) break;
                let r_fn;
                const r_buf = r_drive.diskRW(r_fn = parms[2]);
                if (r_buf !== null)
                    downloadFile(r_fn.toUpperCase(), r_buf);
                else
                    console.log(`file ${r_fn} not found or empty`);
                break;
            case 'write':                 // write file
                const w_drive = getDisk(parms, 3, 'missing: drv fname', true);
                if (w_drive === undefined) break;
                let w_fn, w_idx;
                const w_buf = await loadFile(w_fn = parms[2], false);
                if ((w_idx = w_fn.lastIndexOf('/')) >= 0)
                    w_fn = w_fn.substring(w_idx + 1);
                w_drive.diskRW(w_fn, w_buf);
                console.log(w_buf.length);
                break;
            case 'basic':                 // start 8080 MS Basic
                loadHex(await loadFile('cpm/basic.hex', true), 0);
                memo.reset(); HLT_STOP = true;
                hardware.toggleDisplay();
                CPU.reset(); CPU.setPC(0x1000); run();
                break;
            case 'on':                    // start emulator (false - do not load disks)
                if (parms[1] !== 'false') switch (version) {
                    case 0:
                        CPM_DRIVES[0] = await CPMDisk('cpm/cpma.cpm');
                        CPM_DRIVES[1] = await CPMDisk('cpm/cpmb_turbo.cpm');
                        break;
                    case 1:
                        CPM_DRIVES[0] = await CPMDisk('cpm/cpm3a.cpm');
                        CPM_DRIVES[1] = await CPMDisk('cpm/cpm3b.cpm');
                        break;
                    default:
                        CPM_DRIVES[0] = await CPMDisk('cpm/mpma.cpm');
                        CPM_DRIVES[1] = await CPMDisk('cpm/mpmb.cpm');
                        CPM_DRIVES[2] = await CPMDisk(null, 256256);
                        break;
                }
                memo.reset();
                if (version > 0)
                    memo.bank(0);       // bank 0 must be active
                HLT_STOP = version < 2; // no stop on HALT (MP/M is interrupt based)
                let boot_err;
                if ((boot_err = CPM_DRIVES[0].transfer(0, 1, 0x0000, true, memo)) !== 0)
                    console.error(`boot error: ${boot_err}`);
                else {
                    hardware.toggleDisplay();
                    CPU.reset(); run();
                }
                break;
            case 'printer':               // download printer device output
                downloadFile('printer.txt', memo.printer());
                break;
            case 'tape':                  // mount tape to tape reader device
                if (version === 2) return false;
                if (parms.length < 2) {
                    console.error('missing: file [adr len]');
                    break;
                }
                let tl2; // true - transfer binary file as hex file
                const tdata = await loadFile(parms[1], !(tl2 = parms.length > 2)),
                      haddr = tl2 ? pi(parms[2]) : 0x100,              // binary file address
                      hlen = (parms.length > 3) ? pi(parms[3]) : 0x20; // hex file line length
                memo.tape(tl2 ? toIntelHex(tdata, haddr, hlen) : tdata);
                break;
            case 'puncher':               // download tape puncher device output
                if (version === 2) return false;
                downloadFile('puncher.txt', memo.puncher());
                break;
            case 'bank':                  // get/set active memory bank
                if (version === 0) return false;
                if (parms.length < 2)
                    console.log(memo.bank());
                else
                    memo.bank(pi(parms[1], false));
                break;
            case 'ccopy': console.log(memo.ccopy(parms[1])); break;
            case 'console': console.log(memo.console()); break;
            default: return cmd(command, parms);
        }
        return true;
    };
    return mod;
}

// pre-compiled drives
const CPM_DRIVES = [          // available in:
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

async function cpm_memo(con) {            // CPM system memory and IO
    await loadScript('js/disks.js'); // use disks
    const ram = new Uint8Array(65536),
          SEG = 49152, rams = [new Uint8Array(SEG), ram],
          datetime = () => {
              let date; // temp = (date - (8 years) + (1 day)) / day
              return [date = new Date(), ((date.getTime() - 252442799999 + 86400000) / 86400000) | 0];
          };
    let dskstat = 0, iocount = 0, drv = 0, trk = 0, sec = 0, dma = 0,
        printer = '', tape = '', tapepos = 0, puncher = '',
        TIMER_RUN = false,
        bank = 1, clkcmd = 0, [clkdata, clktemp] = datetime(),
        sconsole = '', ccopy = false;
    const timer10 = async (value) => {
        if (value !== 1) { TIMER_RUN = false; return; }
        else if (TIMER_RUN) return;
        TIMER_RUN = true;
        CPU.setInterrupt(7); // one time for interrupt test
        while (TIMER_RUN) {
            await delay(100);
            if (CPU.RUN)
                CPU.setInterrupt(7);
        }
    },
    result = {
        'rd': a => (bank == 1 || a >= SEG) ? ram[a] : rams[bank][a],
        'wr': (a, v) => {
            if (bank == 1 || a >= SEG) ram[a] = v;
            else rams[bank][a] = v;
        },
        'input': p => {
            switch (p) {
                case 0x00: return (con.kbd.length > 0) ? 0xff : 0x00;                   // console status
                case 0x01: return (con.kbd.length > 0) ? con.kbd.shift() & 0x7f : 0x00; // console data
                case 0x02: return 0x1a;                                                 // printer status
                case 0x04: return 0xff;                                                 // auxilary status
                case 0x05:                                                              // paper tape (aux)
                    return (tapepos >= tape.length) ? 0x1a : tape.charCodeAt(tapepos++) & 0xff;
                case 0x0a: return drv;                                                  // fdc drive
                case 0x0b: return trk;                                                  // fdc track
                case 0x0c: return sec & 0x00ff;                                         // fdc sector low
                case 0x0d: return (iocount === 0) ? 0xff : 0x00;                        // fdc command
                case 0x0e: return dskstat;                                              // fdc status
                case 0x0f: return dma & 0x00ff;                                         // dma address low
                case 0x10: return (dma & 0xff00) >>> 8;                                 // dma address high
                case 0x11: return (sec & 0xff00) >>> 8;                                 // fdc sector high
                case 0x1a:                                                              // clock data
                    let res;
                    switch (clkcmd) {
                        case 0:                                    // sec
                            [clkdata, clktemp] = datetime();
                            res = clkdata.getSeconds();
                            break;
                        case 1: res = clkdata.getMinutes(); break; // min
                        case 2: res = clkdata.getHours(); break;   // hrs
                        case 3: return clktemp & 0xff;             // days low
                        case 4: return (clktemp >>> 8) & 0xff;     // days high
                        default: return 0x1a; // CTRL-Z to simulate EOF
                    }
                    const tens = (res / 10) | 0,
                          units = (res % 10) | 0;
                    return (tens << 4) | units;
                case 0x28: return 0x00;                                                 // console 1 status
                case 0x2a: return 0x00;                                                 // console 2 status
                case 0x2c: return 0x00;                                                 // console 3 status
                case 0x2e: return 0x00;                                                 // console 4 status
                default: throw new Error(`unknown input port: ${p.toString(16).padStart(2, '0')}`);
            }
        },
        'output': (p, v) => {
            switch (p) {
                case 0x00:                                                              // tests data
                    if (v === 0x0a) v = 0x0d;
                    else if (v === 0x0d) break;
                    console.log(String.fromCharCode(v), console.NB);
                    break;
                case 0x01:                                                              // console data
                    con.display(v & 0xff);
                    if (ccopy) sconsole += String.fromCharCode(v & 0xff);               // keep screen data
                    break;
                case 0x03: printer += String.fromCharCode(v); break;                    // printer data
                case 0x04: if (v & 0x01) tapepos = 0; break;                            // rewind tape (aux)
                case 0x05: puncher += String.fromCharCode(v); break;                    // paper puncher (aux)
                case 0x0a: drv = v & 0xff; break;                                       // fdc drive
                case 0x0b: trk = v & 0xff; break;                                       // fdc track
                case 0x0c: sec = (sec & 0xff00) | (v & 0xff); break;                    // fdc sector low
                case 0x0d:                                                              // fdc command
                    if (v !== 0 && v !== 1)
                        dskstat = 7; // illegal command
                    else {
                        iocount++;
                        (async () => {
                            try {
                                const dd = CPM_DRIVES[drv];
                                dskstat = dd ?
                                        dd.transfer(trk, sec, dma, v === 0, result) :
                                        1; // illegal drive
                            } catch(e) {
                                console.error(e.message + '\n', e.stack);
                            }
                            iocount--;
                        })();
                    }
                    break;
                case 0x0f: dma = (dma & 0xff00) | (v & 0xff); break;                    // dma address low
                case 0x10: dma = (dma & 0x00ff) | ((v & 0xff) << 8); break;             // dma address high
                case 0x11: sec = (sec & 0x00ff) | ((v & 0xff) << 8); break;             // fdc sector high
                case 0x14:                                                              // mmu init
                    if (v > 8)
                        throw new Error(`invalid memory banks: ${v}`);
                    while (v-- > 2)
                        rams.push(new Uint8Array(SEG));
                    break;
                case 0x15:                                                              // mmu select
                    if (v >= rams.length)
                        throw new Error(`invalid memory bank: ${v}`);
                    bank = v & 0xff;
                    break;
                case 0x19: clkcmd = v & 0xff; break;                                    // clock command
                case 0x1b: timer10(v); break;                                           // 10ms interrupt timer
                default: throw new Error(`unknown output port: ${p.toString(16).padStart(2, '0')}`);
            }
        },
        'tape': (value) => { tape = value; tapepos = 0; },
        'printer': () => printer,
        'puncher': () => puncher,
        'bank': (value) => {
            if (value === undefined)
                return bank;
            if (value >= rams.length)
                throw new Error(`invalid memory bank: ${value}`);
            bank = value;
        },
        'ccopy': flag => {
            if (flag !== undefined) ccopy = flag === 'true';
            sconsole = '';
            return ccopy;
        },
        'console': () => sconsole,
        'reset': () => {
            timer10(0); // stop timer
            ram.fill(0x00);
            rams.length = 2; rams[0].fill(0x00);
            dskstat = 0; iocount = 0; drv = 0; trk = 0; sec = 0; dma = 0;
            printer = ''; tape = ''; tapepos = 0; puncher = '';
            bank = 1; clkcmd = 0; [clkdata, clktemp] = datetime();
            sconsole = '';
        }
    };
    return result;
}
