'use strict';

function RF08dev(mem) {                // RF08/RS08 fixed head disk
    let done = 0, sta = 0;                       // done flag and status
    const DSK = new Uint16Array(4 * 128 * 2048), // disk buffer (1,048,576 x 2)
          CPU = mem.CPU, cpu = CPU.cpu, regs = cpu.regs,
          busy = [null],                         // UI busy flag updater fnc(busy)
          dregs = [0, 0, 0],                     // disk address, disc mem buff, field
    status = () => [(sta & 0o700) >> 6, (sta & 0o7) | done << 3],
    reset = () => { done = 1; sta = 0; dregs[0] = 0; cpu.setInterrupt(~8); },
    process = (num, adr) => {
        if (busy[0] !== null) busy[0](1);        // set busy flag
        switch (num) {
            case 1: switch (adr) {
                case 0o60: dregs[0] &= ~0o7777; done = 0; sta &= ~0o1007; intr(); break; // DCMA
                case 0o61: sta &= 0o7007; cpu.setInterrupt(~8); break;                   // DCIM
                case 0o62: if (sta & 0o1007) regs[PC] = regs[PC] + 1 & 0o7777; break;    // DFSE
                case 0o64: dregs[0] &= 0o7777; intr(); break;                            // DCXA
            } break;
            case 2: switch (adr) {
                case 0o61:                                                               // DSAC
                    if (true) // maintenace not implemented
                        regs[PC] = regs[PC] + 1 & 0o7777;
                    regs[AC] &= 0o10000;
                    break;
                case 0o62: if (done) regs[PC] = regs[PC] + 1 & 0o7777; break;            // DFSC
            } break;
            case 3: switch (adr) {
                case 0o60: dma(true); break;                                             // DMAR
                case 0o62:                                                               // DISK
                    if (sta & 0o1007 || done) regs[PC] = regs[PC] + 1 & 0o7777;
                    break;
                case 0o64:                                                               // DXAL
                    dregs[0] &= 0o7777; dregs[0] |= (regs[AC] & 0o377) << 12;
                    regs[AC] &= 0o10000; intr();
                    break;
            } break;
            case 5: switch (adr) {
                case 0o60: dma(false); break;                                            // DMAW
                case 0o61:                                                               // DIML
                    sta = (sta & 0o7007) | (regs[AC] & 0o770); regs[AC] &= 0o10000; intr();
                    break;
                case 0o64:                                                               // DXAC
                    regs[AC] &= 0o10000; regs[AC] |= dregs[0] >> 12 & 0o377; intr();
                    break;
            } break;
            case 6: switch (adr) {
                case 0o61: regs[AC] = (regs[AC] & 0o10000) | (sta & 0o7777); break;      // DIMA
                case 0o62: regs[AC] = (regs[AC] & 0o10000) | (dregs[0] & 0o7777); break; // DMAC
                case 0o64:                                                               // DMMT
                    // maintenace not implemented
                    regs[AC] &= 0o10000;
                    break;
            } break;
        }
        if (busy[0] !== null) busy[0](0);        // clear busy flag
    },
    intr = () => {
        cpu.setInterrupt(
            ((done && sta & 0o100) ||
            (sta & 0o1007 && sta & 0o400) ||
            (sta & 0o4000 && sta & 0o200)) ? 8 : ~8
        );
    },
    dma = read => {
        dregs[0] |= regs[AC] & 0o7777; regs[AC] &= 0o10000;
        const sif = regs[IF];                            // save IF register
        dregs[2] = (sta & 0o70) >> 3;                    // set extension
        let wc, wa;
        do {
            regs[IF] = 0;                                // WC and WA in core 0
            mem.wr(0o7750, mem.rd(0o7750) + 1 & 0o7777); // incr word count
            wc = mem.rd(0o7750);                         // word count
            mem.wr(0o7751, mem.rd(0o7751) + 1 & 0o7777); // incr mem addr
            wa = mem.rd(0o7751);                         // word address
            regs[IF] = dregs[2];                         // set core
            dregs[1] = read ? DSK[dregs[0]] : mem.rd(wa);
            if (read) mem.wr(wa, dregs[1]);
            else DSK[dregs[0]] = dregs[1];
            dregs[0] = dregs[0] + 1 & 0o3777777;         // incr disk addr
        } while (wc !== 0);
        regs[IF] = sif;                                  // restore IF register
        done = 1; intr();
    },
    res = {
        status, reset, process, busy, dregs,
        'setDsk': img => {                       // set drive image
            if (img === null) DSK.fill(0);
            else {
                if ((img.length % 524288) !== 0) throw new Error(`disk image error: ${img.length}`);
                DSK.set(new Uint16Array(img.buffer), 0);
            }
            reset();
        },
        'getDsk': () => DSK                      // get drive image
    };
    reset();
    cpu.devices.set(0o60, res); cpu.devices.set(0o61, res);
    cpu.devices.set(0o62, res); cpu.devices.set(0o64, res);
    cpu.asm.set(0o6601, 'DCMA'); cpu.asm.set(0o6603, 'DMAR'); cpu.asm.set(0o6605, 'DMAW');
    cpu.asm.set(0o6611, 'DCIM'); cpu.asm.set(0o6612, 'DSAC'); cpu.asm.set(0o6615, 'DIML');
    cpu.asm.set(0o6616, 'DIMA'); cpu.asm.set(0o6621, 'DFSE'); cpu.asm.set(0o6622, 'DFSC');
    cpu.asm.set(0o6623, 'DISK'); cpu.asm.set(0o6626, 'DMAC'); cpu.asm.set(0o6641, 'DCXA');
    cpu.asm.set(0o6643, 'DXAL'); cpu.asm.set(0o6645, 'DXAC'); cpu.asm.set(0o6646, 'DMMT');
    return res;
}

async function RS08(cpu, memo) {
    const tabs = document.getElementsByClassName('tab-content');
    if (tabs.length < 2) { console.warn('system is not initialized'); return null; }
    let tmo = null, cont = 0;                       // timeout updater id and continue flag
    const dev = RF08dev(memo),                      // monitored device
          sysfp = document.getElementById('sysfp'), // this tab ref
          leds = [],                                // device LEDs
          dregs = dev.dregs,                        // device state
    setLEDs = (idx, initmsk, value) => {
        for (let mask = initmsk; mask > 0; mask >>= 1)
            leds[idx++].style.display = (value & mask) ? 'block' : 'none';
    },
    busy = flag => {                                // monitor drive activity
        if (!sysfp.checked) return; // no update for inactive tab
        cont = flag;
        if (flag && tmo === null) update();
    },
    update = () => {                                // monitor drive data
        if (!sysfp.checked) {              // no update for inactive tab
            tmo = null; return;
        }
        setLEDs(0, 0o4, dregs[2]);         // 1st row (field)
        setLEDs(3, 0o400, dregs[0] >> 11); // 1st row
        setLEDs(13, 0o2000, dregs[0]);     // 2nd row
        setLEDs(24, 0o4000, dregs[1]);     // 3rd row
        tmo = cont ? setTimeout(update, 10) : null;
    };
    const tab = tabs[1],
          [img, img2] = await Promise.all([loadImage('rs08_img.jpg'), loadImage('rs08_img2.jpg')]),
    led = (left, top) => {
        const res = document.createElement('span');
        res.className = 'rsled'; res.style.left = `${left}px`; res.style.top = `${top}px`;
        tab.appendChild(res);
        leds.push(res);
    };
    addStyle(`
.rs08_2 { position: absolute; width: 220px; height:138px; left: 280px; background-color: transparent; }
.rsled { position: absolute; width: 8px; height: 8px; border-radius: 4px;
         background-color: #ff7f50; display: none; }
    `);
    img.className = 'fpimg'; img.style.marginTop = '5px';
    tab.appendChild(img);
    img2.className = 'rs08_2'; img2.style.top = '875px'
    tab.appendChild(img2);
    for (let i = 0, x = 293; i < 12; i++, x += 17) { if (i === 4) x++; led(x, 899); }    // 1st row
    for (let i = 0, x = 292; i < 12; i++, x += 17) { if (i === 4) x += 2; led(x, 932); } // 2nd row
    for (let i = 0, x = 291; i < 12; i++, x += 17) { if (i === 4) x += 3; led(x, 965); } // 3rd row
    dev.busy[0] = busy;                             // start monitoring
    return dev;
}
