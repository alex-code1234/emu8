'use strict';

class DiskMonitor extends CPMMonitor {
    constructor(emu, debug_height, logger) {
        super(emu, debug_height, logger);
    }
    async handler(parms, cmd) {
        switch (cmd) {
            case 'disk':                  // insert disk
                const disk_num = this.getDisk(parms, 3, 'missing: drv fname|size', false);
                if (disk_num === undefined) break;
                const disk_fn = parms[2],
                      disk_img = isNaN(disk_fn) ? await CPMDisk(disk_fn) : await CPMDisk(null, +disk_fn);
                this.emu.memo.CPM_DRIVES[disk_num] = disk_img;
                console.log(disk_img.drive.length);
                break;
            case 'dump':                  // save disk
                const d_drive = this.getDisk(parms, 2, 'missing: drv', true);
                if (d_drive === undefined) break;
                downloadFile('drive.img', d_drive.drive);
                break;
            case 'dtsm':                  // read disk, track, sec to mem
                if (parms.length < 5) { console.error('missing: drv trk sec mem'); return; }
                const d_num = pi(parms[1], false),
                      t_num = pi(parms[2], false),
                      s_num = pi(parms[3], false),
                      m_num = pi(parms[4]);
                if (d_num >= this.emu.memo.CPM_DRIVES.length) { console.error(`invalid drive num: ${d_num}`); return; }
                if (t_num > 76) { console.error(`invalid track num: ${t_num}`); return; }
                if (s_num < 1 || s_num > 26) { console.error(`invalid sector num: ${s_num}`); return; }
                console.log(this.emu.memo.CPM_DRIVES[d_num].transfer(t_num, s_num, m_num, true, this.emu.memo));
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
                term.write('read drv fn          ', 'var(--secondary)');
                term.print('get file fn from drive drv: 0 - A, 1 - B, ...');
                term.write('write drv fn [R/O=0] ', 'var(--secondary)');
                term.print('upload file fn to drive drv; R/O=1 - set working file (live)');
                term.write('bank [num]           ', 'var(--secondary)');
                term.print('print/set current memory bank');
                term.write('copy [flg]           ', 'var(--secondary)');
                term.print('print/set console output snapshot; flg=1 - start copy');
                term.write('on ver               ', 'var(--secondary)');
                term.print('boot CP/M version ver; ver=0 - 2.2, ver=1 - 3.0, ver=2 - MP/M;');
                term.print('                     bootable disk must be in drive 0');
                term.write('disk drv fn/sz       ', 'var(--secondary)');
                term.print('load disk img file fn or empty disk with size sz to drive drv');
                term.write('dump drv             ', 'var(--secondary)');
                term.print('get disk img file for drive drv');
                term.write('dtsm drv trk sec mem ', 'var(--secondary)');
                term.print('load sector sec of track trk from drive drv to memory mem');
                break;
            default: await super.handler(parms, cmd); break;
        }
    }
}

async function main() {
    const cputyp = pi(URL_OPTS.get('cpu') ?? '0', false), // CPU type
          ostyp = pi(URL_OPTS.get('os') ?? '0', false);   // OS type
    await loadScript('../js/disks.js');
    switch (cputyp) {
        case 0:
            await loadScript('../js/js8080.js');
            break;
        case 1:
            await loadScript('../js/jsZ80.js');
            break;
        default:
            console.error(`invalid cpu value: ${cputyp}`);
            break;
    }
    const con = await createCon(amber, 'VT220'),
          mem = new CPMMemIO(con, cputyp, true, false),
          cpu = new GenCpu(mem, cputyp),
          emu = new Emulator(cpu, mem, cputyp),
          mon = new DiskMonitor(emu),
          kbd = new Kbd(con, mon);
    switch (ostyp) {
        case 0:
            mem.CPM_DRIVES[0] = await CPMDisk('../cpm/cpma.cpm');
            break;
        case 1:
            mem.CPM_DRIVES[0] = await CPMDisk('../cpm/cpm3a.cpm');
            break;
        case 2:
            mem.CPM_DRIVES[0] = await CPMDisk('../cpm/mpma.cpm');
            break;
        default:
            console.error(`invalid os value: ${ostyp}`);
            break;
    }
    term.setPrompt('> ');
    mon.exec(`on ${ostyp}`);
    while (true) {
        const input = await term.prompt();
        mon.exec(input.trim());
    }
}
