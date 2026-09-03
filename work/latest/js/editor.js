'use strict';

function EditorImpl(tab, cntnr, lang) {
    if (typeof cntnr === 'string') cntnr = document.getElementById(cntnr);
    const view = document.createElement('code'),
          opts = document.createElement('pre'),
          text = document.createElement('textarea'),
          line = document.createElement('span'),
          deferred = [],
    setLineTop = selStart => {
        if (!tab.checked) { deferred.push([setLineTop, [selStart]]); return; }
        lscroll = opts.scrollTop;
        const cl = text.value.substr(0, selStart).split('\n').length - 1;
        let top = cl * lheight, cnd;
        if ((cnd = top - lscroll) < 0 || cnd > maxhght) {
            if (cnd < 0) lscroll = top;
            else lscroll = top - maxhght;
            cnd = top - lscroll;
            opts.scrollTop = lscroll;
        }
        opts.scrollLeft = 0;
        line.style.top = cnd + 'px';
        line.style.display = 'inline-block';
    },
    doEditing = () => {
        if (!tab.checked) { deferred.push([doEditing, []]); return; }
        if (editing) {
            status.style.display = input.style.display = 'none';
            line.style.display = 'none';
            text.style.display = 'inline-block';
            text.scrollLeft = opts.scrollLeft;
            text.scrollTop = opts.scrollTop;
            activateTxt();
        } else {
            status.style.display = input.style.display = 'inline-block';
            text.style.display = 'none';
            if (lheight === null) {
                lheight = parseFloat(getComputedStyle(line).lineHeight);
                maxhght = parseInt(opts.style.height) - lheight;
            }
            setLineTop(0);
        }
    },
    setEditing = mode => {
        if (editing === mode) return;
        editing = mode;
        doEditing();
    },
    activateTxt = () => {
        if (!tab.checked) { deferred.push([activateTxt, []]); return; }
        text.setSelectionRange(0, 0);
        text.focus();
    },
    setText = (txt, update = false) => {
        text.value = txt;
        view.textContent = text.value + '~';
        Prism.highlightElement(view);
        if (update) return;
        if (editing) activateTxt();
        else setLineTop(0);
    },
    getText = () => text.value,
    setLine = val => {
        if (editing) return false;
        const i = text.value.indexOf(val);
        if (i < 0) return false;
        setLineTop(i);
        return true;
    },
    adjust = () => {
        opts.style.height = text.style.height = cs.height;
        if (!editing) maxhght = parseInt(opts.style.height) - lheight;
    },
    init = () => {
        if (!tab.checked) { deferred.push([init, []]); return; }
        text.style.top = line.style.top = '0px';
        text.style.left = line.style.left = '0px';
        opts.style.width = text.style.width = line.style.width = cs.width;
        adjust();
    };
    let editing = true, updid = null, updsc = null, lheight = null, maxhght, lscroll;
    text.oninput = e => {
        view.textContent = text.value + '~';
        if (updid !== null) clearTimeout(updid);
        updid = setTimeout(() => {
            Prism.highlightElement(view);
            updid = null;
        }, 250);
    };
    text.onscroll = e => {
        opts.scrollLeft = text.scrollLeft;
        opts.scrollTop = text.scrollTop;
    };
    opts.onscroll = e => {
        if (editing) return;
        if (updsc !== null) clearTimeout(updsc);
        else line.style.display = 'none';
        updsc = setTimeout(() => {
            const ost = parseInt(opts.scrollTop),
                  diff = parseInt(lscroll) - ost,
                  newp = parseInt(line.style.top) + diff;
            line.style.top = newp + 'px';
            if (newp >= 0 && newp <= maxhght) line.style.display = 'inline-block';
            lscroll = opts.scrollTop;
            updsc = null;
        }, 100);
    };
    opts.className = `lang-${lang}`;
    opts.appendChild(view);
    line.className = 'line';
    line.innerHTML = '&nbsp;';
    opts.appendChild(line);
    cntnr.classList.add('editor');
    cntnr.appendChild(opts);
    cntnr.appendChild(text);
    const cs = getComputedStyle(cntnr);
    init();
    tab.addEventListener('change', e => {
        if (tab.checked && deferred.length > 0) {
            for (const e of deferred) e[0].apply(null, e[1]);
            deferred.length = 0;
        }
    });
    addEventListener('resize', e => adjust());
    const status = document.createElement('input'), input = document.createElement('input');
    status.style.position = input.style.position = 'fixed';
    status.style.width = input.style.width = '455px';
    status.style.right = input.style.right = '15px';
    status.style.outline = input.style.outline = 'none';
    status.style.fontSize = input.style.fontSize = '16px';
    status.style.backgroundColor = input.style.backgroundColor = 'var(--lbgr)';
    status.style.color = input.style.color = 'var(--lclr)';
    status.style.opacity = input.style.opacity = '0.8';
    status.style.fontFamily = 'monospace';
    status.style.top = '64px';
    status.style.border = 'none';
    status.setAttribute('readonly', 'true');
    status.setAttribute('tabindex', '-1');
    input.style.top = '94px';
    input.style.border = '1px solid var(--lclr)';
    status.style.display = input.style.display = 'none';
    cntnr.appendChild(status); cntnr.appendChild(input);
    return {setText, getText, setEditing, setLine, status, input};
}

const defaultTheme = {
    'base_bgr': 'var(--lbgr)', 'base_clr': 'var(--lclr)',
    'font': 'Ubuntu Mono, Monaco, Courier, monospace', 'fsize': '14px',
    'line_hght': '1.2',
    'cursor_clr': 'var(--lcur)',
    'line_clr': 'var(--llin)',
    'syntax': `
.token.comment { color: var(--lcom); }
.token.keyword { color: var(--lkey); }
.token.number { color: var(--lnum); }
.token.variable { color: var(--lvar); }
.token.special { color: var(--lspe); }
.token.punctuation { color: var(--lpun); }
    `,
    'theme': `
[data-theme='dark'] {
    --lbgr: #232323;
    --lclr: #989898;
    --lcur: #FFFFFF;
    --llin: #EEEEEE30;
    --lcom: #85816E;
    --lkey: #D3A020;
    --lnum: #AE81FF;
    --lvar: #56C9DF;
    --lspe: #A6E22E;
    --lpun: #D5D8D6;
}
[data-theme='light'] {
    --lbgr: #FAFAFA;
    --lclr: #383A42;
    --lcur: #0F1011;
    --llin: #C0C0C030;
    --lcom: #A0A1A7;
    --lkey: #CA1243;
    --lnum: #A626A4;
    --lvar: #0184BC;
    --lspe: #50A14F;
    --lpun: #383A42;
}
    `
};

async function Editor(tnum, lang, lang_descr, theme = defaultTheme) {
    window.Prism = {'manual': true}; // to prevent Prism automatic processing
    await loadScript('js/prism.js');
    Prism.languages[lang] = lang_descr;
    addStyle(`
${theme.theme}                                                     /* colors definition */
.editor { padding: 0; position: relative; }                        /* editor settings */
.editor pre {
    text-wrap: nowrap;
    background-color: ${theme.base_bgr}; color: ${theme.base_clr}; /* base color */
}
.editor pre, .editor textarea, .editor .line {
    font-family: ${theme.font}; font-size: ${theme.fsize};         /* font */
    line-height: ${theme.line_hght};                               /* line height */
}
.editor pre, .editor textarea {
    padding: 0; margin: 0; overflow: auto; text-align: left;
}
.editor textarea, .editor .line {
    position: absolute;
}
.editor textarea {
    white-space: nowrap; border: none; resize: none;
    background-color: transparent; color: transparent;
    caret-color: ${theme.cursor_clr};                              /* caret color */
}
.editor textarea:focus { outline: none; }
.editor .line {
    color: transparent; display: none;
    background-color: ${theme.line_clr};                           /* line color */
}
${theme.syntax}                                                    /* syntax highlight */
    `);
    const tab = addTab('editor', 'EDITOR', tnum, false),
          div = document.createElement('div');
    tab.style.padding = '0'; tab.style.opacity = '1.0';
    div.style.width = '100%'; div.style.height = '89vh';
    tab.appendChild(div);
    return EditorImpl(document.getElementById('editor'), div, lang);
}
