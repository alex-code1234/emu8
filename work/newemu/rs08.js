'use strict';

async function RS08(cpu, memo) {
    let sysfp;       // this tab reference
    const leds = []; // panel LEDs
    
    const tabs = document.getElementsByClassName('tab-content');
    if (tabs.length < 2) { console.warn('system is not initialized'); return null; }
    const tab = tabs[1],
          [img, img2] = await Promise.all([loadImage('rs08_img.jpg'), loadImage('rs08_img2.jpg')]);
    addStyle(`
.rs08_2 { position: absolute; width: 220px; height:138px; left: 280px; background-color: transparent; }
.rsled { position: absolute; width: 8px; height: 8px; border-radius: 4px;
         background-color: #ff7f50; display: none; }
    `);
    img.className = 'fpimg'; img.style.marginTop = '5px';
    tab.appendChild(img);
    img2.className = 'rs08_2'; img2.style.top = '875px'
    tab.appendChild(img2);
    const led = (left, top) => {
        const res = document.createElement('span');
        res.className = 'rsled'; res.style.left = `${left}px`; res.style.top = `${top}px`;
        tab.appendChild(res);
        leds.push(res);
    };
    for (let i = 0, x = 293; i < 12; i++, x += 17) { if (i === 4) x++; led(x, 899); }    // 1st row
    for (let i = 0, x = 292; i < 12; i++, x += 17) { if (i === 4) x += 2; led(x, 932); } // 2nd row
    for (let i = 0, x = 291; i < 12; i++, x += 17) { if (i === 4) x += 3; led(x, 965); } // 3rd row
    sysfp = document.getElementById('sysfp');
    return {'setDsk': data => console.log(data.length)};
}
