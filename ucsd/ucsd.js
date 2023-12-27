'use strict';

async function ucsd(scr) {                // default version
    return await iU(scr);
}

async function iU(scr) {                  // 8080/Z80 UCSD
    const mod = await defaultHW(scr, new URLSearchParams('?cpu_type=0&mem_name=Umemo')),
          memo = mod.memo, cmd = mod.cmd;
    mod.info = `UCSD IV (8080), 64K memory, ${memo.DISKS.length} disk(s)`;
    mod.cmd = async (command, parms) => { // intercept command processor
        switch (command) {
            case 'on':                    // ON button
                loadHex(await loadFile('ucsd/iucsd.hex', true), 0xff00);
                memo.DISKS[0] = await UCSDDisk('ucsd/ucsd.dsk');
                for (let i = 3; i <= 18; i++)
                    memo.DISKS[0].transfer(0, i, 0x8200 + (i - 3) * 128, true, memo, 1);
                let sp = 0xff00;
                memo.wr(--sp, 0); memo.wr(--sp, 128);
                memo.wr(--sp, 0); memo.wr(--sp, 26);
                memo.wr(--sp, 0); memo.wr(--sp, 0);
                memo.wr(--sp, 0); memo.wr(--sp, 1);
                memo.wr(--sp, 0); memo.wr(--sp, 1);
                memo.wr(--sp, 0); memo.wr(--sp, 128);
                memo.wr(--sp, 0); memo.wr(--sp, 26);
                memo.wr(--sp, 0); memo.wr(--sp, 77);
                memo.wr(--sp, 0xfe); memo.wr(--sp, 0xfe);
                memo.wr(--sp, 0x01); memo.wr(--sp, 0x00);
                memo.wr(--sp, 0xff); memo.wr(--sp, 0x00);
                memo.wr(--sp, 0x01); memo.wr(--sp, 0x00);
                hardware.toggleDisplay();
                CPU.reset(); CPU.setRegisters(['x', 'sp', `${sp.toString(16)}`, 'pc', '8200']); run();
                break;
            default: return cmd(command, parms);
        }
        return true;
    };
    return mod;
}

/*
async function aU(scr) {                  // 6502 UCSD
    const mod = await defaultHW(scr, new URLSearchParams('?cpu_type=2&mem_name=Umemo')),
          memo = mod.memo, cmd = mod.cmd;
    mod.info = `UCSD IV (6502), 64K memory, ${memo.DISKS.length} disk(s)`;
    mod.cmd = async (command, parms) => { // intercept command processor
        switch (command) {
            case 'on':                    // ON button
                loadBin(await loadFile('roms/ucsd/6502/ucsd_sbios.bin', false), 0xff00);
//                memo.DISKS[0] = await UCSDDisk('disks/ucsd/6502/adap650.dsk');
//memo.DISKS[0] = await AppleDisk('ucsd/vi/disks/AP4001E.do');
memo.DISKS[0] = await AppleDisk('ucsd/pascal0.dsk');
//                for (let i = 1; i <= 8; i++)
//                    memo.DISKS[0].transfer(1, i, 0x8000 + (i - 1) * 128, true, memo, 1);
                hardware.toggleDisplay();
                break;
case 'ttt':
let t, s;
console.log(memo.DISKS[0].transfer(t = +parms[1], s = +parms[2], 0, true, memo, 1));
printMem(0, 16);
break;
            default: return cmd(command, parms);
        }
        return true;
    };
    return mod;
}
*/

async function Umemo(con) {               // 8bit UCSD system IO
    await loadScript('js/disks.js');
    const ram = new Uint8Array(0x10000), result = {};
    result.DISKS = [null, null];          // 2 disks
    result.rd = a => {
        if (a === 0xfff1) return (con.kbd.length > 0) ? 0xff : 0x00;
        if (a === 0xfff0) return con.kbd.shift();
        return ram[a];
    };
    result.wr = (a, v) => {
        if (a === 0xfff0) con.display(v);
        else if (a === 0xfff4) {
            const disk = result.DISKS[ram[0xfff5]];
            ram[a] = disk ?
                    disk.transfer(ram[0xfff6], ram[0xfff7], ram[0xfff8] << 8 | ram[0xfff9], v === 0, result, 1) :
                    9;                    // disk not online
        }
        else ram[a] = v;
    };
    return result;
}
