'use strict';

async function KC8_E(cpu, memo, tab_ref, tab) {
    let lock = true,       // panel ON/LOCK selector
        state = 0,         // panel STATE selector
        sw_reg = 0,        // panel SW switch
        md_reg = 0,        // panel MD register
        md_dir = 0,        // panel MD DIR register
        halt = 0,          // panel halt state (inverted)
        sstep = 0,         // panel single step state (inverted)
        tmo = null;        // timer interval id
    const leds = [],       // panel LEDs
          regs = cpu.cpu.regs, // CPU state
          mrd = memo.rd,       // original memo read
          mwr = memo.wr,       // original memo write
    bclick = e => {
        const btn = e.target, stl = btn.style;
        switch (btn.id) {
            case '0':  // STATE selector
                state = (state + 1) % 6;
                stl.backgroundImage = `url(Pos${state + 1}.bmp)`;
                break;
            case '1':  // ON/LOCK selector
                lock = !lock;
                if (lock) {
                    cpu.CPU_INSTR_CNT = 10240; // default speed
                    clearInterval(tmo);
                    for (let i = 0; i < 28; i++) // dim lights, except RUN light
                        if (i !== 15) leds[i].style.backgroundColor = '#26282a';
                } else {
                    cpu.CPU_INSTR_CNT = 4000; // ~original speed
                    tmo = setInterval(update, 10);
                }
                btn.textContent = lock ? '\u2501' : '\u2503';
                break;
            case '2':  // SW
                sw_reg = sw_reg ? 0 : 1;
                stl.backgroundImage = sw_reg ? 'url(Up1.bmp)' : 'url(Down1.bmp)';
                break;
            case '3':  // 0..11
            case '4': case '5': case '6': case '7': case '8': case '9':
            case '10': case '11': case '12': case '13': case '14':
                const mask = 0o4000 >> (+btn.id - 3), bit = (regs[SR] & mask) ? 0 : 1;
                if (bit) regs[SR] |= mask; else regs[SR] = (regs[SR] & ~mask) & 0o7777;
                        stl.backgroundImage = stl.backgroundImage.replace(
                        bit ? 'Down' : 'Up', bit ? 'Up' : 'Down');
                break;
            case '15': // ADDR
                if (lock || cpu.RUN) break;
                regs[PC] = regs[SR];
                stl.backgroundImage = 'url(Down2.bmp)';
                setTimeout(() => stl.backgroundImage = 'url(Up2.bmp)', 200);
                break;
            case '16': // EXT ADDR
                if (lock || cpu.RUN) break;
                const srr = regs[SR];
                regs[DF] = (srr & 0o70) >> 3; regs[IF] = regs[IB] = srr & 0o7;
                stl.backgroundImage = 'url(Down1.bmp)';
                setTimeout(() => stl.backgroundImage = 'url(Up1.bmp)', 200);
                break;
            case '17': // CLEAR
                if (lock || cpu.RUN) break;
                cpu.cpu.reset(false);
                cpu.cpu.devices.forEach(dev => { if (dev !== null) dev.reset(); });
                stl.backgroundImage = 'url(Down2.bmp)';
                setTimeout(() => stl.backgroundImage = 'url(Up2.bmp)', 200);
                break;
            case '18': // CONT
                if (lock || cpu.RUN) break;
                if (halt || sstep) cpu.cpu.step();
                else cpu.run();
                stl.backgroundImage = 'url(Down1.bmp)';
                setTimeout(() => stl.backgroundImage = 'url(Up1.bmp)', 200);
                break;
            case '19': // EXAM
                if (lock || cpu.RUN) break;
                memo.rd(regs[PC]); regs[PC] = regs[PC] + 1 & 0o7777;
                stl.backgroundImage = 'url(Down2.bmp)';
                setTimeout(() => stl.backgroundImage = 'url(Up2.bmp)', 200);
                break;
            case '20': // HALT
                if (lock) break;
                halt = halt ? 0 : 1;
                if (halt) cpu.RUN = false;
                stl.backgroundImage = halt ? 'url(Down1.bmp)' : 'url(Up1.bmp)';
                break;
            case '21': // STEP
                if (lock) break;
                sstep = sstep ? 0 : 1;
                if (sstep) cpu.RUN = false;
                stl.backgroundImage = sstep ? 'url(Down2.bmp)' : 'url(Up2.bmp)';
                break;
            case '22': // DEP
                if (lock || cpu.RUN) break;
                memo.wr(regs[PC], regs[SR]); regs[PC] = regs[PC] + 1 & 0o7777;
                stl.backgroundImage = 'url(Up1.bmp)';
                setTimeout(() => stl.backgroundImage = 'url(Down1.bmp)', 200);
                break;
        }
    },
    setLEDs = (idx, initmsk, value) => {
        for (let mask = initmsk; mask > 0; mask >>= 1)
            leds[idx++].style.backgroundColor = (value & mask) ? '#ffda03' : '#26282a';
    },
    update = () => {
        if (!tab_ref.checked) return; // no update for inactive tab
        setLEDs(15, 1, cpu.RUN);                              // RUN
        if (lock) return;
        setLEDs(0, 0o4, regs[DF]); setLEDs(3, 0o4000, regs[PC]); // 1st row
        switch (state) {                                         // 2nd row
            case 0:                                       // STATE
                setLEDs(16, 0o40, 0);              // no fetch and instr lights
                setLEDs(22, 1, md_dir);                       // DIR
                setLEDs(23, 1, 0);                 // no data light
                setLEDs(24, 1, sw_reg);                       // SW
                setLEDs(25, 1, 0);                 // no PAUSE light
                setLEDs(26, 0o2, 0);               // no BRK and BRK_prg lights
                break;
            case 1:                                       // STATUS
                setLEDs(16, 1, (regs[AC] & 0o10000) ? 1 : 0); // LINK
                setLEDs(17, 1, 0);                 // no GT light
                setLEDs(18, 1, (regs[IR] !== 0) ? 1 : 0);     // INTB
                const ief = regs[IE] !== 0;
                setLEDs(19, 1, ief ? 0 : 1);                  // NOINT
                setLEDs(20, 1, ief ? 1 : 0);                  // ION
                setLEDs(21, 1, regs[UF]);                     // UM
                setLEDs(22, 0o4, regs[IF]);                   // IF0..2
                setLEDs(25, 0o4, regs[DF]);                   // DF0..2
                break;
            case 2: setLEDs(16, 0o4000, regs[AC]); break; // AC
            case 3: setLEDs(16, 0o4000, md_reg); break;   // MD
            case 4: setLEDs(16, 0o4000, regs[MQ]); break; // MQ
            case 5: setLEDs(16, 0o4000, 0); break; // no BUS lights
        }
    };
    memo.rd = (a, d) => { md_reg = mrd(a, d); md_dir = 1; return md_reg; };
    memo.wr = (a, v, d) => { mwr(a, v, d); md_reg = v; md_dir = 0; };
    addStyle(`
.fpbtn { position: absolute; width: 2.5%; height: 9%; border: none;
         background-size: cover; background-color: transparent; font-weight: 1000; }
.fpled { position: absolute; width: 0.9%; height: 1.7%; border-radius: 20px;
         background-color: #26282a; }
    `);
    const img = await loadImage('panel.png'),
          cntr = getImageCont(img),
    btn = (left, top, num, bkg, wdt, txt) => {
        let res;
        if (num !== null && num !== undefined) {
            res = document.createElement('button');
            res.className = 'fpbtn'; res.id = num; res.onclick = bclick;
            if (bkg) res.style.backgroundImage = `url(${bkg})`;
            if (wdt) res.style.width = `${wdt}%`;
            if (txt) res.textContent = txt;
        } else {
            res = document.createElement('span');
            res.className = 'fpled';
        }
        res.style.left = `${left}%`; res.style.top = `${top}%`;
        cntr.appendChild(res);
        return res;
    };
    btn(67.585, 48.2,   0,  'Pos1.bmp', 4.45);           // STATE/STATUS/ETC
    btn(6.95,   75.2,   1,  null,       4.45, '\u2501'); // ON/LOCK
    btn(17.32,  75.198, 2,  'Down1.bmp');                // SW
    btn(23.45,  75.198, 3,  'Down2.bmp'); btn(26.6,  75.198, 4,  'Down2.bmp'); // 0 1
    btn(29.75,  75.198, 5,  'Down2.bmp'); btn(32.9,  75.198, 6,  'Down1.bmp'); // 2 3
    btn(36,     75.198, 7,  'Down1.bmp'); btn(39.15, 75.198, 8,  'Down1.bmp'); // 4 5
    btn(42.3,   75.198, 9,  'Down2.bmp'); btn(45.45, 75.198, 10, 'Down2.bmp'); // 6 7
    btn(48.55,  75.198, 11, 'Down2.bmp'); btn(51.7,  75.198, 12, 'Down1.bmp'); // 8 9
    btn(54.85,  75.198, 13, 'Down1.bmp'); btn(57.95, 75.198, 14, 'Down1.bmp'); // 10 11
    btn(64.45,  75.198, 15, 'Up2.bmp');   // ADDR
    btn(67.6,   75.198, 16, 'Up1.bmp');   // EXT ADDR
    btn(73.5,   75.198, 17, 'Up2.bmp');   // CLEAR
    btn(76.65,  75.198, 18, 'Up1.bmp');   // CONT
    btn(79.75,  75.198, 19, 'Up2.bmp');   // EXAM
    btn(82.9,   75.198, 20, 'Up1.bmp');   // HALT
    btn(86,     75.198, 21, 'Up2.bmp');   // STEP
    btn(92.05,  75.198, 22, 'Down1.bmp'); // DEP
    for (let i = 0, left = 15; i < 15; i++, left += 3.154) {     // 1 row
        const led = btn(left, 33.5); leds.push(led);
    }
    let led = btn(71.2, 33.5); leds.push(led);                   // RUN
    for (let i = 0, left = 24.462; i < 12; i++, left += 3.154) { // 2 row
        const led = btn(left, 40.355); leds.push(led);
    }
    tab.appendChild(cntr);
    return {};
}
