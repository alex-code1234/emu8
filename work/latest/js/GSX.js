'use strict';

function GSX(memo, {
    GSX_COLORS = ['#000000', '#aa0000', '#00aa00', '#0000aa', '#00aaaa', '#aaaa55', '#aa00aa', '#ffffff'],
    GSX_LSTYLS = [[], [5, 5], [1, 2], [5, 2, 1, 2]],
    GSX_MARKRS = ['.', '+', '*', 'O', 'X']
} = {}) {
    let GSX_ver = true, GSX_state = 0, DE_prm = 0x00, GSX_msX, GSX_msY, GSX_step, GSX_data,
        GSX_pmtyp = 2, GSX_lstyl = 0, GSX_lwdth = 1, GSX_lcolr = 7, GSX_pmcolr = 7, GSX_txcolr = 7, GSX_ficolr = 7,
        swdt, shgt, shgt1;
    const geti = (arr, i) => {
        const ind = (i - 1) * 2;
        return memo.rd(arr + ind) | memo.rd(arr + ind + 1) << 8;
    },
    seti = (arr, i, d) => {
        const ind = (i - 1) * 2;
        memo.wr(arr + ind, d & 0xff);
        memo.wr(arr + ind + 1, d >>> 8 & 0xff);
    },
    crosshairs = (cnv, x, y) => {
        if (GSX_msX !== undefined) cnv.putImageData(GSX_data, GSX_msX - 5, GSX_msY - 5);
        GSX_msX = x; GSX_msY = y;
        if (GSX_msX !== undefined) {
            if (GSX_msX < 6) GSX_msX = 6; else if (GSX_msX > swdt - 7) GSX_msX = swdt - 7;
            if (GSX_msY < 6) GSX_msY = 6; else if (GSX_msY > shgt1 - 6) GSX_msY = shgt1 - 6;
            GSX_data = cnv.getImageData(GSX_msX - 5, GSX_msY - 5, 10, 10);
            cnv.strokeStyle = '#888888'; cnv.setLineDash([]); cnv.lineWidth = 1;
            cnv.beginPath();
            cnv.moveTo(GSX_msX - 5, GSX_msY); cnv.lineTo(GSX_msX + 5, GSX_msY);
            cnv.moveTo(GSX_msX, GSX_msY - 5); cnv.lineTo(GSX_msX, GSX_msY + 5);
            cnv.stroke();
        }
    },
    handler = (con, v) => {
        switch (GSX_state) {
            case 0: GSX_state++; DE_prm = v & 0xff; return;
            case 1: GSX_state = 0; DE_prm = v << 8 | DE_prm; break;
        }
        if (GSX_ver) {
            GSX_ver = false;
            con.print(
                '--------------------------------------------------~' +
                'GSX_driver_for_VT-100_ver._1.0~' +
                '--------------------------------------------------~'
            );
            swdt = con.canvas.canvas.width;
            shgt = con.canvas.canvas.height; shgt1 = shgt - 1;
        }
        const contrl = geti(DE_prm, 1),
              intin = geti(DE_prm, 2), ptsin = geti(DE_prm, 3),
              intout = geti(DE_prm, 4), ptsout = geti(DE_prm, 5),
              op = geti(contrl, 1);
        switch (op) {
            case 1:                                        // open workstation
                GSX_pmtyp = geti(intin, 4) - 1;
                if (GSX_pmtyp < 0 || GSX_pmtyp > 4) GSX_pmtyp = 2;
                GSX_lstyl = geti(intin, 2) - 1;
                if (GSX_lstyl < 0 || GSX_lstyl > 3) GSX_lstyl = 0;
                GSX_lcolr = geti(intin, 3);
                if (GSX_lcolr < 0 || GSX_lcolr > 7) GSX_lcolr = 7;
                GSX_pmcolr = geti(intin, 5);
                if (GSX_pmcolr < 0 || GSX_pmcolr > 7) GSX_pmcolr = 7;
                GSX_txcolr = geti(intin, 7);
                if (GSX_txcolr < 0 || GSX_txcolr > 7) GSX_txcolr = 7;
                GSX_ficolr = geti(intin, 10);
                if (GSX_ficolr < 0 || GSX_ficolr > 7) GSX_ficolr = 7;
                GSX_lwdth = 1;
                seti(contrl, 3, 6);
                seti(contrl, 5, 45);
                seti(intout, 1, swdt - 1); seti(intout, 2, shgt1);
                seti(intout, 3, 1);
                seti(intout, 4, 350); seti(intout, 5, 350);
                seti(intout, 6, 1);
                seti(intout, 7, 4);
                seti(intout, 8, 3);
                seti(intout, 9, 5);
                seti(intout, 10, 1);
                seti(intout, 11, 1);
                seti(intout, 12, 0); seti(intout, 13, 0);
                seti(intout, 14, 8);
                seti(intout, 15, 0); for (let j = 16; j <= 35; j++) seti(intout, j, -1);
                seti(intout, 36, 1);
                seti(intout, 37, 0);
                seti(intout, 38, 1);
                seti(intout, 39, 0);
                seti(intout, 40, 8);
                seti(intout, 41, 1); seti(intout, 42, 0); seti(intout, 43, 0); seti(intout, 44, 0);
                seti(intout, 45, 2);
                seti(ptsout, 1, 0); seti(ptsout, 2, 16);
                seti(ptsout, 3, 0); seti(ptsout, 4, 16);
                seti(ptsout, 5, 1); seti(ptsout, 6, 0);
                seti(ptsout, 7, 3); seti(ptsout, 8, 0);
                seti(ptsout, 9, 0); seti(ptsout, 10, 16);
                seti(ptsout, 11, 0); seti(ptsout, 12, 16);
                GSX_msX = undefined; GSX_step = 50;
                return;
            case 2:                                        // close workstation
                con.canvas.globalCompositeOperation = 'source-over';
                con.print('^[?25h');
                break;
            case 3: con.print('^[2J'); break;              // clear workstation
            case 5:                                        // escape
                const escop = geti(contrl, 6);
                switch (escop) {
                    case 1:                                // inquire addressable cells
                        seti(contrl, 5, 2);
                        seti(intout, 1, 25); seti(intout, 2, 80);
                        break;
                    case 4: con.print('^[A'); break;       // cursor up
                    case 5: con.print('^[B'); break;       // cursor down
                    case 6: con.print('^[C'); break;       // cursor right
                    case 7: con.print('^[D'); break;       // cursor left
                    case 8: con.print('^[H'); break;       // cursor home
                    case 9: con.print('^[J'); break;       // erase to end of screen
                    case 10: con.print('^[K'); break;      // erase to end of line
                    case 11:                               // direct cursor address
                        con.print(`^[${geti(intin, 1)};${geti(intin, 2)}f`);
                        break;
                    case 12:                               // output text
                        let pst = '';
                        for (let j = 1, n = geti(contrl, 4); j <= n; j++)
                            pst += String.fromCharCode(geti(intin, j));
                        con.print(pst.replaceAll(' ', '_'));
                        break;
                    case 13: con.print('^[30;47m'); break; // reverse video on
                    case 14: con.print('^[37;40m'); break; // reverse video off
                    case 16:                               // inquire tablet status
                        seti(contrl, 5, 1);
                        seti(intout, 1, 0);
                        break;
                    case 18: con.print('^[?25h'); break;   // show cursor
                    case 19: con.print('^[?25l'); break;   // hide cursor
                }
                break;
            case 6:                                        // polyline
                const plcnt = geti(contrl, 2) * 2;
                let plx1 = geti(ptsin, 1), ply1 = geti(ptsin, 2),
                    plidx = 3;
                con.canvas.strokeStyle = GSX_COLORS[GSX_lcolr];
                con.canvas.lineWidth = GSX_lwdth;
                con.canvas.setLineDash(GSX_LSTYLS[GSX_lstyl]);
                con.canvas.fillStyle = con.canvas.strokeStyle;
                con.canvas.beginPath();
                con.canvas.moveTo(plx1, shgt1 - ply1);
                while (plidx <= plcnt) {
                    const plx2 = geti(ptsin, plidx++), ply2 = geti(ptsin, plidx++);
                    if (plx1 === plx2 && ply1 === ply2)
                        con.canvas.fillRect(plx1, shgt1 - ply1, GSX_lwdth, GSX_lwdth);
                    else
                        con.canvas.lineTo(plx2, shgt1 - ply2);
                    plx1 = plx2; ply1 = ply2;
                }
                con.canvas.stroke();
                break;
            case 7:                                        // polymarker
                const pmcnt = geti(contrl, 2) * 2,
                      pmtxt = GSX_MARKRS[GSX_pmtyp];
                let pmidx = 1;
                con.canvas.fillStyle = GSX_COLORS[GSX_pmcolr];
                while (pmidx <= pmcnt)
                    con.canvas.fillText(pmtxt, geti(ptsin, pmidx++) - 4, shgt1 - geti(ptsin, pmidx++) + 5);
                break;
            case 8:                                        // text
                let gst = '';
                for (let j = 1, n = geti(contrl, 4); j <= n; j++)
                    gst += String.fromCharCode(geti(intin, j));
                con.canvas.fillStyle = GSX_COLORS[GSX_txcolr];
                con.canvas.fillText(gst, geti(ptsin, 1), shgt1 - geti(ptsin, 2) - 2);
                break;
            case 9:                                        // filled area
                const facnt = geti(contrl, 2) * 2,
                      fax = geti(ptsin, 1), fay = shgt1 - geti(ptsin, 2);
                let faidx = 3;
                con.canvas.strokeStyle = GSX_COLORS[GSX_ficolr];
                con.canvas.lineWidth = 1;
                con.canvas.setLineDash([]);
                con.canvas.fillStyle = con.canvas.strokeStyle;
                con.canvas.beginPath();
                con.canvas.moveTo(fax, fay);
                while (faidx <= facnt)
                    con.canvas.lineTo(geti(ptsin, faidx++), shgt1 - geti(ptsin, faidx++));
                con.canvas.lineTo(fax, fay);
                con.canvas.fill();
                break;
            case 10:                                       // cell array
                const cax1 = geti(ptsin, 1), cay1 = geti(ptsin, 2),
                      cax2 = geti(ptsin, 3), cay2 = geti(ptsin, 4),
                      caw = cax2 - cax1, cah = cay2 - cay1;
                con.canvas.strokeStyle = GSX_COLORS[GSX_lcolr];
                con.canvas.lineWidth = 1;
                con.canvas.setLineDash([]);
                con.canvas.beginPath();
                con.canvas.rect(cax1, shgt1 - cay2, caw, cah);
                con.canvas.stroke();
                break;
            case 11:                                       // generalized drawing primitive
                const gdp = geti(contrl, 6);
                switch (gdp) {
                    case 1:                                // bar
                        const gdpx1 = geti(ptsin, 1), gdpy1 = geti(ptsin, 2),
                              gdpx2 = geti(ptsin, 3), gdpy2 = geti(ptsin, 4),
                              gdpw = gdpx2 - gdpx1, gdph = gdpy2 - gdpy1;
                        con.canvas.fillStyle = GSX_COLORS[GSX_ficolr];
                        con.canvas.fillRect(gdpx1, shgt1 - gdpy2, gdpw, gdph);
                        break;
                    case 2:                                // arc
                        const arcsa = geti(intin, 1) * Math.PI / 1800.0,
                              arcea = geti(intin, 2) * Math.PI / 1800.0;
                        con.canvas.strokeStyle = GSX_COLORS[GSX_lcolr];
                        con.canvas.lineWidth = GSX_lwdth;
                        con.canvas.setLineDash(GSX_LSTYLS[GSX_lstyl]);
                        con.canvas.beginPath();
                        con.canvas.arc(geti(ptsin, 1), shgt1 - geti(ptsin, 2), geti(ptsin, 7), arcsa, arcea);
                        con.canvas.stroke();
                        break;
                    case 3:                                // pie slice
                        const piex = geti(ptsin, 1), piey = shgt1 - geti(ptsin, 2),
                              piesa = geti(intin, 1) * Math.PI / 1800.0,
                              pieea = geti(intin, 2) * Math.PI / 1800.0;
                        con.canvas.fillStyle = GSX_COLORS[GSX_ficolr];
                        con.canvas.strokeStyle = con.canvas.fillStyle;
                        con.canvas.lineWidth = 1;
                        con.canvas.setLineDash([]);
                        con.canvas.beginPath();
                        con.canvas.moveTo(geti(ptsin, 3), shgt1 - geti(ptsin, 4));
                        con.canvas.lineTo(piex, piey);
                        con.canvas.lineTo(geti(ptsin, 5), shgt1 - geti(ptsin, 6));
                        con.canvas.arc(piex, piey, geti(ptsin, 7), piesa, pieea);
                        con.canvas.fill();
                        break;
                    case 4:                                // circle
                        con.canvas.fillStyle = GSX_COLORS[GSX_ficolr];
                        con.canvas.beginPath();
                        con.canvas.arc(geti(ptsin, 1), shgt1 - geti(ptsin, 2), geti(ptsin, 5), 0, 2 * Math.PI);
                        con.canvas.fill();
                        break;
                }
                break;
            case 12:                                       // set character height
                con.canvas.font = `${geti(ptsin, 2)}px monospaced`;
                seti(contrl, 3, 2);
                seti(ptsout, 1, 7); seti(ptsout, 2, 14);
                seti(ptsout, 3, 9); seti(ptsout, 4, 16);
                return;
            case 13: seti(intout, 1, 0); break;            // set character up vector
            case 14:                                       // set color representation
                const scridx = geti(intin, 1),
                      scrr = geti(intin, 2), scrg = geti(intin, 3), scrb = geti(intin, 4);
                if (scridx >= 0 && scridx <= 7)
                    GSX_COLORS[scridx] = '#' +
                            (scrr / 10.0 * 2.55 | 0).toString(16).padStart(2, '0') +
                            (scrg / 10.0 * 2.55 | 0).toString(16).padStart(2, '0') +
                            (scrb / 10.0 * 2.55 | 0).toString(16).padStart(2, '0');
                break;
            case 15:                                       // set polyline type
                GSX_lstyl = geti(intin, 1) - 1;
                if (GSX_lstyl < 0 || GSX_lstyl > 3)
                    GSX_lstyl = 0;
                seti(intout, 1, GSX_lstyl + 1);
                break;
            case 16:                                       // set polyline width
                GSX_lwdth = geti(ptsin, 1);
                seti(contrl, 3, 1);
                seti(ptsout, 1, GSX_lwdth); seti(ptsout, 2, 0);
                return;
            case 17:                                       // set polyline color index
                GSX_lcolr = geti(intin, 1);
                if (GSX_lcolr < 0 || GSX_lcolr > 7)
                    GSX_lcolr = 7;
                seti(intout, 1, GSX_lcolr);
                break;
            case 18:                                       // set polymarker type
                GSX_pmtyp = geti(intin, 1) - 1;
                if (GSX_pmtyp < 0 || GSX_pmtyp > 4)
                    GSX_pmtyp = 2;
                seti(intout, 1, GSX_pmtyp + 1);
                break;
            case 19:                                       // set polymarker scale
                seti(contrl, 3, 1);
                seti(ptsout, 1, 0); seti(ptsout, 2, 14);
                return;
            case 20:                                       // set polymarker color index
                GSX_pmcolr = geti(intin, 1);
                if (GSX_pmcolr < 0 || GSX_pmcolr > 7)
                    GSX_pmcolr = 7;
                seti(intout, 1, GSX_pmcolr);
                break;
            case 21: seti(intout, 1, 0); break;            // set font
            case 22:                                       // set text color index
                GSX_txcolr = geti(intin, 1);
                if (GSX_txcolr < 0 || GSX_txcolr > 7)
                    GSX_txcolr = 7;
                seti(intout, 1, GSX_txcolr);
                break;
            case 23: seti(intout, 1, 1); break;            // set interior fill style
            case 25:                                       // set fill color index
                GSX_ficolr = geti(intin, 1);
                if (GSX_ficolr < 0 || GSX_ficolr > 7)
                    GSX_ficolr = 7;
                seti(intout, 1, GSX_ficolr);
                break;
            case 28:                                       // input locator position
                if (GSX_msX === undefined)
                    crosshairs(con.canvas, geti(ptsin, 1) + 5, shgt1 - geti(ptsin, 2) + 5);
                if (con.kbd.length > 0) {
                    const key = con.kbd.shift();
                    switch (key) {                         // graphic cursor
                        case 9: crosshairs(con.canvas, 13, 13); break; // TAB   - step home
                        case 13:                                       // CR    - DONE
                        case 32:                                       // space - PICK
                            seti(contrl, 5, 1); seti(intout, 1, (key === 13) ? 33 : 32);
                            seti(contrl, 3, 1); seti(ptsout, 1, GSX_msX - 5); seti(ptsout, 2, shgt1 - GSX_msY - 5);
                            crosshairs(con.canvas);
                            return;
                        case 97: crosshairs(con.canvas, GSX_msX - GSX_step, GSX_msY); break;             // a - left
                        case 113: GSX_step = GSX_step / 2 | 0; if (GSX_step === 0) GSX_step = 50; break; // q - size
                        case 115: crosshairs(con.canvas, GSX_msX + GSX_step, GSX_msY); break;            // s - right
                        case 119: crosshairs(con.canvas, GSX_msX, GSX_msY - GSX_step); break;            // w - up
                        case 122: crosshairs(con.canvas, GSX_msX, GSX_msY + GSX_step); break;            // z - down
                    }
                }
                seti(contrl, 5, 0);
                break;
            case 32:                                       // set writing mode
                const wrm = geti(intin, 1);
                switch (wrm) {
                    case 1: con.canvas.globalCompositeOperation = 'source-over'; break;
                    case 2: con.canvas.globalCompositeOperation = 'source-in'; break;
                    case 3: con.canvas.globalCompositeOperation = 'xor'; break;
                    case 4: con.canvas.globalCompositeOperation = 'copy'; break;
                }
                seti(intout, 1, wrm);
                break;
            case 33: seti(intout, 1, 1); break;            // set input mode
        }
        seti(contrl, 3, 0);
    };
    return handler;
}
