'use strict';

function VC8E(CPU, disp) {             // VC8-E point plot control board
    let state = 0,                               // status register
        x = 0, y = 0;                            // X and Y registers
    const cpu = CPU.cpu, regs = cpu.regs,
    status = () => [state & 0o01, (state & 0o4000) ? 1 : 0],
    reset = () => { state = 0; },
    process = num => {
        switch (num) {
            case 0:                          // DILC
                state = 0; cpu.setInterrupt(~8);
                break;
            case 1: state &= 0o01; break;    // DICD
            case 2:                          // DISD
                if (state & 0o4000) regs[PC] = regs[PC] + 1 & 0o7777;
                break;
            case 3:                          // DILX
            case 4:                          // DILY
                if (num === 3) x = regs[AC] & 0o1777;
                else y = regs[AC] & 0o1777;
                state |= 0o4000;
                if (state & 0o01) cpu.setInterrupt(8);
                break;
            case 5: disp.dot(x, y); break;   // DIXY
            case 6:                          // DILE
                if (regs[AC] & 0o01) state |= 0o01;
                else state &= 0o4000;
                regs[AC] = 0;
                break;
            case 7: regs[AC] = state; break; // DIRE
        }
    },
    res = {status, reset, process};
    cpu.devices.set(0o05, res);
    cpu.asm.set(0o6050, 'DILC'); cpu.asm.set(0o6051, 'DICD'); cpu.asm.set(0o6052, 'DISD');
    cpu.asm.set(0o6053, 'DILX'); cpu.asm.set(0o6054, 'DILY'); cpu.asm.set(0o6055, 'DIXY');
    cpu.asm.set(0o6056, 'DILE'); cpu.asm.set(0o6057, 'DIRE');
    return res;
}

function Type30(scr, tab) {
    scr.width = 512; scr.height = 512;
    const canvas = scr.getContext('2d'),
          idata = canvas.getImageData(0, 0, scr.width, scr.height),
          data = idata.data, len = data.length,
          pixs = new Uint32Array(data.buffer),
    cvt = n => (n > 511) ? (n - 511) / 2 | 0 : 256 + (n / 2 | 0),
    dot = (x, y) => pixs[cvt(y) * 512 + cvt(x)] = 0xff01ff07,
    update = () => {
        if (!tab.checked) return; // no update for inactive tab
        let draw = false;
        for (let i = 3; i < len; i += 4) {
            const val = data[i];
            if (val > 0) {
                data[i] = (val === 255) ? 254 : (val > 31) ? val - 32 : 0;
                if (!draw) draw = true;
            }
        }
        if (draw) canvas.putImageData(idata, 0, 0);
    };
    setInterval(update, 40);
    return {dot};
}

async function VC_8E(cpu, memo, tnum, tab_ref, tab) {
    let scr_elem;
    if (tab_ref) { // system tab
        addStyle(`
            .vc8div { margin: 0 0; padding: 5px 5px; background: #728fce; }
            .vc8disp { width: 460px; height: 460px; margin: auto auto; display: block;
                       border-radius: 20px; overflow: hidden; background: #000000; }
        `);
        const div = document.createElement('div'); div.className = 'vc8div';
        scr_elem = document.createElement('canvas'); scr_elem.className = 'vc8disp'
        div.appendChild(scr_elem); tab.appendChild(div);
    } else {       // separate tab
        [scr_elem] = createUI(
            addTab('vc8e', 'VC-8E', tnum, true),
            'vc8', 'vc81', '36px', 1, 1, '4px', '700px', '700px',
            '#kbd_vc81 { visibility: hidden; display: none; }', ''
        );
        tab_ref = document.getElementById('vc8e');
    }
    const type30 = Type30(scr_elem, tab_ref),
          vc8e = VC8E(cpu, type30);
    return {};
}
