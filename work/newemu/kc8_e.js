'use strict';

async function KC8_E(cpu, memo, tnum) {
    let lock = true,       // panel ON/LOCK selector
        state = 0,         // panel STATE selector
        sw_reg = 0,        // panel SW switch
        md_reg = 0,        // panel MD register
        md_dir = 0,        // panel MD DIR register
        halt = 0,          // panel halt state (inverted)
        sstep = 0,         // panel single step state (inverted)
        sysfp,             // this tab reference
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
                stl.background = `url(Pos${state + 1}.bmp)`;
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
                stl.background = sw_reg ? 'url(Up1.bmp)' : 'url(Down1.bmp)';
                break;
            case '3':  // 0..11
            case '4': case '5': case '6': case '7': case '8': case '9':
            case '10': case '11': case '12': case '13': case '14':
                const mask = 0o4000 >> (+btn.id - 3), bit = (regs[SR] & mask) ? 0 : 1;
                if (bit) regs[SR] |= mask; else regs[SR] = (regs[SR] & ~mask) & 0o7777;
                        stl.background = stl.background.replace(
                        bit ? 'Down' : 'Up', bit ? 'Up' : 'Down');
                break;
            case '15': // ADDR
                if (lock || cpu.RUN) break;
                regs[PC] = regs[SR];
                stl.background = 'url(Down2.bmp)';
                setTimeout(() => stl.background = 'url(Up2.bmp)', 200);
                break;
            case '16': // EXT ADDR
                if (lock || cpu.RUN) break;
                const srr = regs[SR];
                regs[IF] = regs[IB] = (srr & 0o70) >> 3; regs[DF] = srr & 0o7;
                stl.background = 'url(Down1.bmp)';
                setTimeout(() => stl.background = 'url(Up1.bmp)', 200);
                break;
            case '17': // CLEAR
                if (lock || cpu.RUN) break;
                cpu.cpu.reset(false);
                cpu.cpu.devices.forEach(dev => { if (dev !== null) dev.reset(); });
                stl.background = 'url(Down2.bmp)';
                setTimeout(() => stl.background = 'url(Up2.bmp)', 200);
                break;
            case '18': // CONT
                if (lock || cpu.RUN) break;
                if (halt || sstep) cpu.cpu.step();
                else cpu.run();
                stl.background = 'url(Down1.bmp)';
                setTimeout(() => stl.background = 'url(Up1.bmp)', 200);
                break;
            case '19': // EXAM
                if (lock || cpu.RUN) break;
                memo.rd(regs[PC]); regs[PC] = regs[PC] + 1 & 0o7777;
                stl.background = 'url(Down2.bmp)';
                setTimeout(() => stl.background = 'url(Up2.bmp)', 200);
                break;
            case '20': // HALT
                if (lock) break;
                halt = halt ? 0 : 1;
                if (halt) cpu.RUN = false;
                stl.background = halt ? 'url(Down1.bmp)' : 'url(Up1.bmp)';
                break;
            case '21': // STEP
                if (lock) break;
                sstep = sstep ? 0 : 1;
                if (sstep) cpu.RUN = false;
                stl.background = sstep ? 'url(Down2.bmp)' : 'url(Up2.bmp)';
                break;
            case '22': // DEP
                if (lock || cpu.RUN) break;
                memo.wr(regs[PC], regs[SR]); regs[PC] = regs[PC] + 1 & 0o7777;
                stl.background = 'url(Up1.bmp)';
                setTimeout(() => stl.background = 'url(Down1.bmp)', 200);
                break;
        }
    },
    setLEDs = (idx, initmsk, value) => {
        for (let mask = initmsk; mask > 0; mask >>= 1)
            leds[idx++].style.backgroundColor = (value & mask) ? '#ffda03' : '#26282a';
    },
    update = () => {
        if (!sysfp.checked) return; // no update for inactive tab
        setLEDs(15, 1, cpu.RUN);                              // RUN
        if (lock) return;
        setLEDs(0, 0o4, regs[(state === 1) ? IF : DF]); setLEDs(3, 0o4000, regs[PC]); // 1st row
        switch (state) {                                                              // 2nd row
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
    const tab = addTab('sysfp', 'KC8-E', tnum),
          img = await loadImage('panel.png');
    addStyle(`
.fpimg { max-width: 725px; height: auto; }
.fpbtn { position: absolute; width: 18px; height:29px; background-color: transparent;
         border: none; font-weight: 1000; }
.fpled { position: absolute; width: 6px; height: 6px; background-color: #26282a;
         border-radius: 3px; }
    `);
    img.className = 'fpimg';
    tab.appendChild(img);
    const btn = (left, top, num, bkg, wdt, txt) => {
        let res;
        if (num !== null && num !== undefined) {
            res = document.createElement('button');
            res.className = 'fpbtn'; res.id = num; res.onclick = bclick;
            if (bkg) res.style.background = `url(${bkg})`;
            if (wdt) res.style.width = `${wdt}px`;
            if (txt) res.textContent = txt;
        } else {
            res = document.createElement('span');
            res.className = 'fpled';
        }
        res.style.left = `${left}px`; res.style.top = `${top}px`;
        tab.appendChild(res);
        return res;
    };
    btn(507, 231, 0, 'Pos1.bmp', 34);    // STATE/STATUS/ETC
    btn(72, 328, 1, null, 24, '\u2501'); // ON/LOCK
    btn(143, 328, 2, 'Down1.bmp');       // SW
    btn(187, 328, 3, 'Down2.bmp');  btn(210, 328, 4, 'Down2.bmp');  // 0 1
    btn(233, 328, 5, 'Down2.bmp');  btn(256, 328, 6, 'Down1.bmp');  // 2 3
    btn(279, 328, 7, 'Down1.bmp');  btn(302, 328, 8, 'Down1.bmp');  // 4 5
    btn(324, 328, 9, 'Down2.bmp');  btn(347, 328, 10, 'Down2.bmp'); // 6 7
    btn(369, 328, 11, 'Down2.bmp'); btn(392, 328, 12, 'Down1.bmp'); // 8 9
    btn(415, 328, 13, 'Down1.bmp'); btn(437, 328, 14, 'Down1.bmp'); // 10 11
    btn(484, 328, 15, 'Up2.bmp');        // ADDR
    btn(507, 328, 16, 'Up1.bmp');        // EXT ADDR
    btn(549, 328, 17, 'Up2.bmp');        // CLEAR
    btn(572, 328, 18, 'Up1.bmp');        // CONT
    btn(595, 328, 19, 'Up2.bmp');        // EXAM
    btn(618, 328, 20, 'Up1.bmp');        // HALT
    btn(641, 328, 21, 'Up2.bmp');        // STEP
    btn(685, 328, 22, 'Down1.bmp');      // DEP
    for (let i = 0, left = 126; i < 15; i++, left += 23) {
        const led = btn(left, 180); leds.push(led); // 1 row
    }
    let led = btn(533, 180); leds.push(led);        // RUN
    for (let i = 0, left = 195; i < 12; i++, left += 23) {
        const led = btn(left, 203); leds.push(led); // 2 row
    }
    sysfp = document.getElementById('sysfp');
    return {};
}
