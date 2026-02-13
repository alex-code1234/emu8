'use strict';

class ASR33 extends SoftKbd {
    constructor(kbd_elem, con, con_elem) {
        super(kbd_elem, con, con_elem);
    }
    trnCtrls(txt) {
        let res = super.trnCtrls(txt);
        if (res === 0) res = (txt === 'CTRL') ? 3 : (txt === 'SHIFT') ? 2 : 0;
        return res;
    }
}

async function ASR_33(cpu, memo, tnum, addr = 0o03) {
    const [scr_elem, kbd_elem, con_elem] = createUI(
            addTab(`asr33${addr}`, `ASR-33[${fmt(addr, 2)}]`, tnum),
            'asr', `asr${tnum}`, '45px', 26, 5, '20px', '648px', '640px', `
.smkey { font-size: 10px; }
.sp_asr { grid-column: span 8; }
`, `
<div class='section sec_asr'>
    <div class='sp'></div><div class='key key_asr'><span>!</span><span>1</span></div>
    <div class='key key_asr'><span>"</span><span>2</span></div>
    <div class='key key_asr'><span>#</span><span>3</span></div>
    <div class='key key_asr'><span>$</span><span>4</span></div>
    <div class='key key_asr'><span>%</span><span>5</span></div>
    <div class='key key_asr'><span>&</span><span>6</span></div>
    <div class='key key_asr'><span>'</span><span>7</span></div>
    <div class='key key_asr'><span>(</span><span>8</span></div>
    <div class='key key_asr'><span>)</span><span>9</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>0</span></div>
    <div class='key key_asr'><span>*</span><span>:</span></div>
    <div class='key key_asr'><span>=</span><span>-</span></div><div class='sp'></div>
    <div class='key key_asr smkey'>ESC</div>
    <div class='key key_asr'><span class='smkey'>X-ON</span><span>Q</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>W</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>E</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>R</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>T</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>Y</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>U</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>I</span></div>
    <div class='key key_asr'><span class='smkey'>\u2190</span><span>O</span></div>
    <div class='key key_asr'><span>@</span><span>P</span></div>
    <div class='key key_asr smkey'><span>LINE</span><span>FEED</span></div>
    <div class='key key_asr smkey'><span>RE-</span><span>TURN</span></div>
    <div class='key key_asr smkey kctrl'>CTRL</div>
    <div class='key key_asr'><span>&nbsp;</span><span>A</span></div>
    <div class='key key_asr'><span class='smkey'>X-OFF</span><span>S</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>D</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>F</span></div>
    <div class='key key_asr'><span class='smkey'>BELL</span><span>G</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>H</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>J</span></div>
    <div class='key key_asr'><span>[</span><span>K</span></div>
    <div class='key key_asr'><span>\\</span><span>L</span></div>
    <div class='key key_asr'><span>+</span><span>;</span></div>
    <div class='key key_asr smkey'><span>RUB</span><span>OUT</span></div><div class='sp2'></div>
    <div class='sp'></div><div class='key key_asr smkey kshft'>SHIFT</div>
    <div class='key key_asr'><span>&nbsp;</span><span>Z</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>X</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>C</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>V</span></div>
    <div class='key key_asr'><span>&nbsp;</span><span>B</span></div>
    <div class='key key_asr'><span class='smkey'>\u2191</span><span>N</span></div>
    <div class='key key_asr'><span>]</span><span>M</span></div>
    <div class='key key_asr'><span>&lt;</span><span>,</span></div>
    <div class='key key_asr'><span>&gt;</span><span>.</span></div>
    <div class='key key_asr'><span>?</span><span>/</span></div>
    <div class='key key_asr smkey kshft'>SHIFT</div><div class='sp'></div>
    <div class='sp5'></div><div class='sp4'></div><div class='key key_asr sp_asr'>&nbsp;</div>
</div>`);
    
    return new ASR33(kbd_elem, await createCon(scr_elem, '#3d3c3a', undefined, 72, 40, '#fff8dc'), con_elem);
}
