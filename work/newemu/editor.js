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
            line.style.display = 'none';
            text.style.display = 'inline-block';
            text.scrollLeft = opts.scrollLeft;
            text.scrollTop = opts.scrollTop;
            activateTxt();
        } else {
            text.style.display = 'none';
            if (lheight === null) {
                lheight = parseFloat(getComputedStyle(line).lineHeight);
                maxhght = parseInt(opts.clientHeight) - lheight;
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
    setText = txt => {
        text.value = txt;
        view.textContent = text.value + '~';
        Prism.highlightElement(view);
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
        if (!editing) maxhght = parseInt(opts.clientHeight) - lheight;
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
    return {setText, getText, setEditing, setLine};
}

const defaultTheme = {
    'base_bgr': '#232323', 'base_clr': '#989898',
    'font': 'Ubuntu Mono, Monaco, Courier, monospace', 'fsize': '14px',
    'line_hght': '1.2',
    'cursor_clr': '#fff',
    'line_clr': '#eeeeee30',
    'syntax': `
.token.comment { color: #85816E; }
.token.keyword { color: #D3A020; }
.token.number { color: #AE81FF; }
.token.variable { color: #56C9DF; }
.token.special { color: #A6E22E; }
.token.punctuation { color: #D5D8D6; }
    `
};

async function Editor(tnum, theme = defaultTheme) {
    window.Prism = {'manual': true}; // to prevent Prism automatic processing
    await loadScript('prism.js');
    Prism.languages.pal = {
        'comment': /\/.*/,
        'keyword': /\b(?:i|tad|dca|isz|and|jms|jmp|cll|cla|sza|cia|sna|nop|hlt|bsw|rtl|rtr|spa|iac|rar|ral|szl|cma|cml|stl|snl)\b/i,
        'special': /(?:\*[0-7]+)/,
        'number': /\b[0-7]+\b/,
        'variable': /\b(?:[a-zA-Z]([a-zA-Z]|[0-9])*)\b/,
        'punctuation': /[(),+-.=\[\]]/
    };
    addStyle(`
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
    return EditorImpl(document.getElementById('editor'), div, 'pal');
}
