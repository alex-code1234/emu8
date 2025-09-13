'use strict';

async function main() {
    const html_tag = document.querySelector('html');

    console.error = console._logwrapper('var(--error)');
    console.warn = console._logwrapper('var(--warning)');
    console.info = console._logwrapper('var(--secondary)');

    const loadExt = async (name, result, fnc) => {
        const txt = await (await fetch(name, {cache: 'no-store'})).text();
        if (txt.indexOf('404 Not Found') >= 0) return null;
        txt.split('\n').forEach(s => fnc(s.trim(), result));
        return result;
    },
    procCompFrag = (s, result) => {              // load component or fragment
        if (s.length > 0) result.push(s.split(':'));
    },
    procTable = (s, result) => {                 // load truth table
        const arrB = str => str.split('').map(e => (e === 't') ? e : e | 0),
              arrI = str => str.split(',').map(e => e | 0),
        next = s => {                            // no spaces allowed
            if (s.length === 0) return [null, null];
            let idx, result;
            if (s.charAt(0) === '[') {
                let level = 0; idx = -1;
                for (let i = 1, n = s.length; i < n; i++) {
                    const chr = s.charAt(i);
                    if (chr === '[') level++;
                    else if (chr === ']') {
                        level--;
                        if (level < 0) { idx = i; break; }
                    }
                }
                if (idx < 0) { s = ''; return [null, null]; }
                idx++;
                result = s.substring(0, idx);
                if (result.length < 3) result = null;
            } else {
                idx = s.indexOf(','); if (idx < 0) idx = s.length;
                result = s.substring(0, idx);
                if (result.length === 0) result = null;
            }
            return [result, idx + 1];
        },
        procMap = (s, map, id) => {
            while (s.length > 0) {
                let [item, idx] = next(s);
                if (item === null) { console.error(`Expected inputs for ${id}`); return null; }
                const key = item;
                s = s.substring(idx); [item, idx] = next(s);
                if (item === null) { console.error(`Expected outputs for ${id}`); return null; }
                if (item.charAt(0) === '[') {
                    item = procMap(item.substring(1, item.length - 1), new Map(), id + ` : ${key}`);
                    if (item === null) return null;
                }
                else item = arrB(item);
                s = s.substring(idx);
                map.set(key, item);
            }
            return map;
        };
        let item, idx;
        [item, idx] = next(s);
        if (item === null) return;
        const key = item;
        s = s.substring(idx); [item, idx] = next(s);
        if (item === null || item.charAt(0) !== '[') {
            console.error(`Error reading data for ${key}: expected map`); return;
        }
        const table = procMap(item.substring(1, item.length - 1), new Map(), key);
        if (table === null) return;
        s = s.substring(idx); [item, idx] = next(s);
        if (item !== null) {
            if (item.charAt(0) !== '[') {
                console.error(`Error reading data for ${key}: expected async idx array`); return;
            }
            item = arrI(item.substring(1, item.length - 1));
        }
        const defs = item;
        s = s.substring(idx); [item, idx] = next(s);
        if (item !== null) {
            if (item.charAt(0) === '[') {
                console.error(`Error reading data for ${key}: expected clock idx`); return;
            }
            item = item | 0;
        }
        const clock = item;
        s = s.substring(idx); [item, idx] = next(s);
        if (item === null || item.charAt(0) === '[') {
            console.error(`Error reading data for ${key}: expected inputs length`); return;
        }
        const len = item | 0, idxs = [];
        for (let i = 0; i < len; i++)
            if (defs === null || !defs.includes(i)) idxs.push(i);
        s = s.substring(idx); [item, idx] = next(s);
        if (item === null || item.charAt(0) !== '[') {
            console.error(`Error reading data for ${key}: expected initial values`); return;
        }
        const initRes = arrI(item.substring(1, item.length - 1));
        result.set(key, [table, defs, clock, idxs, initRes]);
    },
    fragments = await loadExt('fragments.dat', [], procCompFrag),
    components = await loadExt('components.dat', [], procCompFrag),
    tables = await loadExt('tables.dat', new Map(), procTable);

    window.onbeforeunload = e => {               // prevent right mouse click exit
        e.returnValue = true; e.preventDefault();
    };

    const container = document.getElementById('diagram'),
          textEditing = evt => graph.isEditing();

    container.onselectstart = textEditing;       // disable text selection and context menu if not editing
    container.onmousedown = textEditing;
   	container.oncontextmenu = textEditing;
    
    const graph = new mxGraph(container);        // create graph
    graph.centerZoom = false;
    graph.setConnectable(false);                 // disable connections from vertex
    graph.gridSize = 10;

    graph.setPanning(true);                      // enable panning
    mxPanningHandler.prototype.pinchEnabled = false;
    mxPanningHandler.prototype.useGrid = true;
    mxPanningHandler.prototype.isPanningTrigger = (me) => {
        const evt = me.getEvent(),
              st = me.getState() ?? null;
        return st === null || (mxEvent.isPopupTrigger(evt) &&
                (mxEvent.isControlDown(evt) || mxEvent.isShiftDown(evt)));
    };
    graph.addListener(mxEvent.TAP_AND_HOLD, (sender, evt) => {
        let me;
        if (!mxEvent.isMultiTouchEvent(evt) && (me = evt.getProperty('event')) &&
                (evt.getProperty('cell') ?? null) === null) {
            const pt = mxUtils.convertPoint(container, mxEvent.getClientX(me), mxEvent.getClientY(me));
            rubber.start(pt.x, pt.y);
            evt.consume();
        }
    });
    const rubber = new mxRubberband(graph);      // enable rubberband selection

    graph.popupMenuHandler.autoExpand = true;    // setup popup menu
    graph.popupMenuHandler.isSelectOnPopup = me => mxEvent.isMouseEvent(me.getEvent());
    let gsaTemp;
    const wnd = document.getElementById('wnd'),  // options window element
          osc = document.getElementById('osc'),  // oscillators window element
          sys = document.getElementById('sys'),  // settings window element
          sysfn = document.getElementById('sysfn'), // graph name
          sysmt = document.getElementById('sysmt'), // execution max ticks
          oscillators = new Map(),               // oscillator canvases
          logicFncs = new Map(),                 // logic processors
    getStrAttr = (style, name) => (style &&
            (gsaTemp = style.match(new RegExp(`${name}=(.*?)(;|$)`)))) ? gsaTemp[1] : null,
    getAdjHeight = style => {                    // get adjusted cell height
        const num1 = getStrAttr(style, 'inputs').split(',').length,
              num2 = getStrAttr(style, 'outputs').split(',').length;
        return ((num1 > num2) ? num1 : num2) * graph.gridSize * 2;       // grid alignment
    },
    setProps = cell => {                         // update properties view
        wnd.innerHTML = `
<label for="stl">Style:</label><input id="stl" type="text" value="${cell.style}"/>
<button id="update">Update</button>`;
        document.getElementById('update').onclick = e => {
            let style = document.getElementById('stl').value;
            if (style.indexOf('resizable') < 0) style += ';resizable=0';
            if (style.indexOf('gate') >= 0) {
                const ga = getStrAttr(style, 'gate');
                if (ga === '1') style = style.replace('gate=1', 'gate=one');
            }
            if (style.indexOf('inputs') >= 0 || style.indexOf('outputs') >= 0) {
                const geom = cell.geometry.clone(); geom.height = getAdjHeight(style);
                graph.getModel().setGeometry(cell, geom);                // grid alignment
                graph.getView().getState(cell).style['points'] = null;   // update constraints
            }
            graph.getModel().setStyle(cell, style);
            if (cell.value === '=') updateOsc(cell);
        };
    },
    alignEdge = (view, left) => {                // remove edge horizontal bend
        const vcell = view.cell,
              tcell = left ? vcell.source : vcell.target;
        if (!tcell) { console.warn('Not connected'); return; }
        const geom = vcell.geometry.clone(),
              points = geom.points,                                      // only 1 bend (2 points) expected
              term = left ? geom.sourcePoint : geom.targetPoint;         // terminal point
        if (!points || points.length === 0) { console.warn('No bends/offsets'); return; }
        let delta;
        switch (points.length) {
            case 1:                                                      // offset only
                if (term.y === points[0].y) { console.warn('Offset on different side'); return; }
                delta = term.y - points[0].y;
                points.length = 0;                                       // remove offset
                break;
            case 3:                                                      // 1 bend and vertical offset
                if (points[0].x === points[1].x) {                       // target offset
                    points[1].y = points[2].y;                           // include to bend
                    points.splice(2, 1);                                 // remove offset
                }
                else if (points[1].x === points[2].x) {                  // source offset
                    points[1].y = points[0].y;                           // include to bend
                    points.splice(0, 1);                                 // remove offset
                }
            case 2:                                                      // 1 bend (2 points)
                if (points[0].x !== points[1].x) { console.warn('Not vertical bend'); return; }
                delta = left ? points[1].y - points[0].y : points[0].y - points[1].y;
                break;
            default: console.warn('Too many bends/offsets'); return;
        }
        if (!tcell.edge) {                                               // connected vertex
            const cgeom = tcell.geometry.clone();
            cgeom.y += delta;                                            // move up/down
            graph.getModel().setGeometry(tcell, cgeom);
        }
        term.y += delta;                                                 // move up/down
        if (points.length > 0)
            if (left) points[0].y = points[1].y;                         // same as right
            else points[1].y = points[0].y;                              // same as left
        graph.getModel().setGeometry(vcell, geom);
    },
    alignJoin = view => {                        // remove vertical bend at edges join
        const vcell = view.cell;
        if (!vcell.source || !vcell.target) { console.warn('Not connected'); return; }
        const geom = vcell.geometry.clone(),
              points = geom.points, len = points.length;
        if (len < 2) { console.warn('No bends'); return; }
        let jpoint, point, vert;
        if (vcell.source.edge) {
            jpoint = geom.sourcePoint; point = points[0];
            vert = point.x === points[1].x;
        } else if (vcell.target.edge) {
            jpoint = geom.targetPoint; point = points[len - 1];
            vert = point.x === points[len - 2].x;
        }
        else { console.warn('No joins'); return; }
        if (vert) jpoint.x = point.x;
        else jpoint.y = point.y;
        graph.getModel().setGeometry(vcell, geom);
    },
    moveJoin = (view, left)  => {                // move edges join to x coordinate of vertical line
        const vcell = view.cell;
        if (!vcell.source || !vcell.target) { console.warn('Not connected'); return; }
        const geom = vcell.geometry.clone(),
              points = geom.points, len = points?.length;
        if (len !== 2 || points[0].x !== points[1].x) { console.warn('No vertical line'); return; }
        let jpoint, point, edge;
        if (left) { edge = vcell.source.edge; jpoint = geom.sourcePoint; point = points[0]; }
        else { edge = vcell.target.edge; jpoint = geom.targetPoint; point = points[1]; }
        if (!edge) { console.warn('Not join'); return; }
        jpoint.x = point.x; jpoint.y = point.y;
        graph.getModel().setGeometry(vcell, geom);
    },
    edgeError = (edges, msg, color = 'red') => { // highlight nodes and exit Array.some loop
        graph.setCellStyles(mxConstants.STYLE_STROKECOLOR, color, edges);
        if (msg) console.error(msg);
        return true;
    },
    isGenCell = cell => ['H', 'L', '~'].includes(cell.value), // check for generator cell
    isOscCell = cell => cell.value === '=',                   // check for oscillograph cell
    isBus = cell => cell.edge && (getStrAttr(cell.style, 'strokeWidth') ?? 0 | 0) > EDGE_STROKEWIDTH,
    processResult = result => {
        if (result.length > 1) {                                         // remove duplicates
            const uniq = new Set();                                      // (because of join wires)
            let i = 0;
            while (i < result.length) {
                const obj = result[i][1];
                if (uniq.has(obj)) result.splice(i, 1);
                else { uniq.add(obj); i++; }
            }
        }
        if (result.length > 1) {
            for (let i = 0, n = result.length; i < n; i++) result[i] = result[i][1];
            return edgeError(result, 'More than 1 output');              // report all outputs
        }
        return (result.length === 0) ? null : result[0];
    },
    getBusOutput = (bus, edge) => {
        const result = [];
        if (bus.source) {
            if (!isBus(bus.source)) return edgeError([bus.source], 'Invalid bus connection');
            const tmp = getBusOutput(bus.source, edge);
            if (tmp === true) return true;
            if (tmp !== null) result.push(tmp);
        }
        if (bus.target) {
            if (!isBus(bus.target)) return edgeError([bus.target], 'Invalid bus connection');
            const tmp = getBusOutput(bus.target, edge);
            if (tmp === true) return true;
            if (tmp !== null) result.push(tmp);
        }
        const id = edge.value;
        if (!id) return edgeError([edge], 'Missing label');
        if (bus.edges.some(e => {
            if (e !== edge && e.value === id) {
                const tmp = getOutput(e, (e.source === bus) ? e.target : e.source);
                if (tmp === true) return true;
                if (tmp !== null) result.push(tmp);
            }
        })) return true;
        return processResult(result);
    },
    getOutput = (edge, term) => {                // find output for opposite terminal
        if (!term) return edgeError([edge], 'Disconnected wire');
        const result = [];
        if (term.edge) {                                                 // joined wire
            if (isBus(term)) return getBusOutput(term, edge);            // process bus
            let tmp = getOutput(term, term.source);                      // output for source
            if (tmp === true) return true;                               // propagate error
            if (tmp !== null) result.push(tmp);
            tmp = getOutput(term, term.target);                          // output for target
            if (tmp === true) return true;
            if (tmp !== null) result.push(tmp);
        }
        else if (isGenCell(term)) result.push([null, term]);             // generator cell
        else if (!isOscCell(term)) {                                     // not oscillograph cell
            const style = edge.style;
            if (edge.source === term && getStrAttr(style, 'exitX') === '1')
                result.push([getStrAttr(style, 'exitY'), term]);
            else if (edge.target === term && getStrAttr(style, 'entryX') === '1')
                result.push([getStrAttr(style, 'entryY'), term]);
        }
        const joined = graph.model.filterDescendants(cell =>             // find joined wires
                cell.edge && (cell.source === edge || cell.target === edge));
        if (joined.some(e => {                                           // joined wires
            const tmp = getOutput(e, (e.source === edge) ? e.target : e.source);
            if (tmp === true) return true;                               // propagate error
            if (tmp !== null) result.push(tmp);
        })) return true;
        return processResult(result);
    },
    getInputs = cell => {                        // find inputs for logic cell
        if (isGenCell(cell)) return null;                                // no inputs for generator cell
        const result = [];
        if (cell.edges.some(edge => {                                    // check all edges
            const style = edge.style;
            let term, attr = null;                                       // other terminal and constraint
            if (edge.source === cell) {
                term = edge.target;
                if (!isOscCell(cell) && getStrAttr(style, 'exitX') === '0')
                    attr = getStrAttr(style, 'exitY');
            } else {
                term = edge.source;
                if (!isOscCell(cell) && getStrAttr(style, 'entryX') === '0')
                    attr = getStrAttr(style, 'entryY');
            }
            const input = getOutput(edge, term);
            if (input === true) return true;                             // propagate error
            if (input !== null && input[1].id !== cell.id) result.push([attr, ...input]);
        })) return true;                                                 // propagate error
        if (result.length === 0) return edgeError([cell], 'No input(s)');
        return result;
    },
    createFnc = async (funcs, cell) => {         // create logic processor
        let result = funcs.get(cell.id);                                 // check if created
        if (!result) {
            let atr = getStrAttr(cell.style, 'logic');
            if (!atr) atr = getStrAttr(cell.style, 'gate');
            if (!atr) atr = cell.value;
            if (!atr) return edgeError([cell], 'Logic processor not set');
            const fnc = logicFncs.get(atr);                              // get processor
            if (!fnc) return edgeError([cell], `Logic processor not found: ${atr}`);
            try {
                result = await fnc(cell);                                // initialize processor
            } catch(e) {
                return edgeError([cell], e.stack);
            }
            funcs.set(cell.id, result);
        }
        return result;
    },
    convertInputs = async (cell, inps, funcs) => { // convert cell inputs for execution structure
        const result = new Map(),
              getNum = (state, atr, input) => atr ? state.pts[input ? 0 : 1].indexOf(atr) : 0,
        createState = async elem => {
            const points = graph.getAllConnectionConstraints(graph.view.getState(elem));
            let pts = [[], []];
            if (points) points.forEach(p => pts[p.point.x ? 1 : 0].push(p.point.y.toString()));
            else if (isOscCell(cell)) pts[0].push('0');                  // osc node has 1 input
            const fnc = await createFnc(funcs, elem);
            if (fnc === true) return true;                               // propagate error
            return {pts, 'inputs': pts[0].length, fnc, 'arr': []};
        },
        numError = (elem, str, atr) => {
            const elems = [elem], edge = elem.edges.find(e =>
                    getStrAttr(e.style, (e.source === elem) ? 'exitY' : 'entryY') === atr);
            if (edge) elems.push(edge);
            return edgeError(elems, `Invalid ${str} index: ${atr}`);
        },
        thisState = await createState(cell);
        if (thisState === true) return true;                             // propagate error
        if (inps.length !== thisState.inputs) return edgeError([cell], 'Not connected input(s)');
        for (let i = 0, n = inps.length; i < n; i++) {
            const [inp, out, elem] = inps[i];
            let state = result.get(elem.id);
            if (!state) {
                state = await createState(elem);
                if (state === true) return true;                         // propagate error
                result.set(elem.id, state);
            }
            const inIdx = getNum(thisState, inp, true);
            if (inIdx < 0) return numError(cell, 'input', inp);
            const outIdx = getNum(state, out, false);
            if (outIdx < 0) return numError(elem, 'output', out);
            state.arr.push([inIdx, outIdx]);
        }
        return [thisState.fnc, [...result].map(e => [e[0], e[1].fnc, e[1].arr])];
    },
    getScheme = async () => {                    // validate scheme and generate execution structure
        const result = new Map(),                                        // id => inputs
              errors = [],                                               // previous errors
              funcs = new Map(),                                         // processors cache
        processInputs = async cell => {
            if (result.get(cell.id)) return;                             // skip processed cell
            const inps = getInputs(cell);
            if (inps === true) return true;                              // propagate error
            if (inps === null) return;                                   // skip generator cells
            const indexes = await convertInputs(cell, inps, funcs);
            if (indexes === true) return true;                           // propagate error
            result.set(cell.id, indexes);
            for (let i = 0, n = inps.length; i < n; i++)
                if (await processInputs(inps[i][2])) return true;        // process dependent cells
        },
        terms = graph.model.filterDescendants(cell => {                  // all oscillographs
            if (getStrAttr(cell.style, mxConstants.STYLE_STROKECOLOR) === 'red') errors.push(cell);
            return isOscCell(cell);                                      // find output terminals
        });
        if (errors.length > 0)                                           // clear previous errors
            graph.setCellStyles(mxConstants.STYLE_STROKECOLOR, 'var(--dbgborder)', errors);
        for (let i = 0, n = terms.length; i < n; i++)
            if (await processInputs(terms[i])) return null;              // validation error
        return [terms.map(e => e.id), result];
    },
    runScheme = (validated, cache = new Map(), tick = null) => {
        const [roots, scheme] = validated,
        processNode = id => {
            const proc = cache.get(id);          // check if already processing
            if (proc) return proc();             // processing, return initial value
            const [fnc, parms] = scheme.get(id),
                  inputs = new Array(parms.length);
            cache.set(id, fnc);                  // start processing
            for (let i = 0, n = parms.length; i < n; i++) {
                const [out_id, out_fnc, maps] = parms[i],
                      out_res = scheme.has(out_id) ?
                              processNode(out_id) :                      // process
                              out_fnc(t);                                // terminal node (no inputs)
                for (let j = 0, m = maps.length; j < m; j++) {
                    const [in_idx, out_idx] = maps[j];                   // map output bits to input
                    inputs[in_idx] = out_res[out_idx];
                }
            }
            cache.delete(id);                    // finished processing
            return fnc(t, inputs);
        };
        let t, maxt;
        if (tick !== null) { t = tick; roots.forEach(processNode); return; }
        t = 0; maxt = sysmt.value | 0;
        if (maxt === 0) { maxt = 50; console.warn(`Max time ticks set to ${maxt}`); }
        while (t < maxt) { roots.forEach(processNode); t++; }
    },
    oscFunc = function() {                       // oscillograph
        const width = 1000, horz = 2, vert = 0.5,
              canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = 30;
        const ctx = canvas.getContext('2d'),
              points = new Uint8Array(width),
        colorAtr = (v, refresh = true) => {
            if (v === undefined) return ctx.strokeStyle;
            ctx.strokeStyle = v; if (refresh) draw();
        },
        draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let x = 0, y = points[oscStart] ? 2 : canvas.height - 2;
            ctx.lineWidth = horz; ctx.beginPath(); ctx.moveTo(x, y);
            for (let i = oscStart + 1; i < current; i++) {
                x += oscStep; if (x > canvas.width) x = canvas.width;
                ctx.lineTo(x, y);
                if (x === canvas.width) break;
                const ny = points[i] ? 2 : canvas.height - 2;
                if (ny !== y) {
                    ctx.stroke();
                    ctx.lineWidth = vert; ctx.beginPath(); ctx.moveTo(x, y);
                    y = ny; ctx.lineTo(x, y);
                    ctx.stroke();
                    ctx.lineWidth = horz; ctx.beginPath(); ctx.moveTo(x, y);
                }
            }
            ctx.stroke();
        },
        addPoint = (bit, refresh = true) => {
            points[current++] = bit;
            if (current >= points.length) {
                current--;                       // shift left 1 point
                points.set(points.slice(1), 0);
            }
            if (refresh) draw();
        },
        clear = (refresh = true) => { points.fill(0); current = 0; if (refresh) draw(); };
        let current = 0, drag = false, dragStart, oldStart, thisFnc = this;
        colorAtr(getComputedStyle(document.querySelector(':root')).getPropertyValue('--osccolor'));
        const getPoint = e => e.changedTouches ? e.changedTouches[0].clientX : e.pageX;
        canvas.ontouchstart = canvas.onmousedown = e => {
            dragStart = getPoint(e); oldStart = oscStart; drag = true;
        };
        canvas.ontouchend = canvas.onmouseup = e => {
            drag = false;
            if (oscStart !== oldStart)           // refresh other oscillographs
                for (const fnc of oscillators.values()) if (fnc !== thisFnc) fnc.draw();
        };
        canvas.ontouchmove = canvas.onmousemove = e => {
            if (!drag) return false;
            let delta = null, point = getPoint(e);
            if (point < dragStart) if (oscStart < current - 1) delta = 1;
            if (point > dragStart) if (oscStart > 0) delta = -1;
            if (delta !== null) { oscStart += delta; draw(); }
        };
        return {canvas, colorAtr, draw, addPoint, clear};
    },
    addOsc = cell => {                           // create oscillograph
        const elem = new oscFunc();
        osc.appendChild(elem.canvas);
        oscillators.set(cell.id, elem);
    },
    updateOsc = cell => {                        // update oscillograph parameters
        const elem = oscillators.get(cell.id),
              color = getStrAttr(cell.style, 'fillColor');
        if (color !== null && color !== elem.colorAtr()) elem.colorAtr(color);
        let step = getStrAttr(cell.style, 'step') | 0,
            start = getStrAttr(cell.style, 'start') | 0;
        if (step === oscStep || step < 1 || step > 100) step = null;
        if (start === oscStart || start < 0 || start >= 1000) start = null;
        if (step !== null || start !== null) {
            if (step !== null) oscStep = step;
            if (start !== null) oscStart = start;
            for (const e of oscillators.values()) e.draw();
        }
    },
    removeOsc = cell => {                        // delete oscillograph
        const elem = oscillators.get(cell.id);
        if (elem) {
            oscillators.delete(cell.id);
            elem.canvas.remove();
        }
    },
    loadXml = async name => {                    // load XML
        const node = mxUtils.parseXml(await loadFile(name, true)).documentElement,
              error = node.querySelector('parsererror');
        if (error) throw new Error(error.querySelector('div').childNodes[0].nodeValue.trim());
        return node;
    },
    loadGraph = async name => {                  // load graph
        try {
            const node = await loadXml(name),
                  model = graph.getModel();
            oscillators.clear();                                         // clear oscillators
            osc.innerHTML = '';                                          // clear oscillators window
            model.beginUpdate();
            try {
                new mxCodec(node.ownerDocument).decode(node, model);
            } finally {
                model.endUpdate();
            }
            parent = graph.getDefaultParent();                           // refresh default parent
            model.filterDescendants(isOscCell).forEach(addOsc);          // add oscillators
        } catch(e) {
            console.error(e.stack);
        }
    },
    loadScheme = async name => {                 // load scheme
        let scheme;
        try {
            scheme = new mxCodec().decode(await loadXml(name));
            const cache = new Map();                                     // processors cache
            for (const [key, list] of scheme[1]) {                       // replace cells with processors
                const [cell, list2] = list,
                      fnc = await createFnc(cache, cell);
                if (fnc === true) throw new Error(`Create processor error for cell: ${cell.id}`);
                list[0] = fnc;                                           // replace level 1 cell
                for (const list3 of list2) {
                    const [id, cell2] = list3,
                          fnc2 = await createFnc(cache, cell2);
                    if (fnc2 === true) throw new Error(`Create processor error for cell: ${cell2.id}`);
                    list3[1] = fnc2;                                     // replace level 2 cell
                }
            }
        } catch(e) {
            console.error(e.stack);
            scheme = null;
        }
        return scheme;
    },
    loadGroup = async name => {                  // load graph as group
        try {
            const node = await loadXml(name), visited = new Set();
            let root = [...node.childNodes].find(n => n.nodeName === 'root'), tmp;
            if (!root) return;
            let cells = [...root.childNodes];
            const ref = (idx, src, trg) => cells.slice(idx + 1).find(n => n.nodeName === 'mxCell' &&
                    ((src && (tmp = n.getAttribute('id')) === src) || (trg && tmp === trg)));
            for (let i = 0, n = cells.length; i < n; i++) {
                const c = cells[i];
                if (c.nodeName !== 'mxCell') continue;
                const id = c.getAttribute('id'), edge = c.getAttribute('edge');
                if (edge !== '1' && edge !== 'true') continue;
                visited.add(c.id);
                const elem = ref(i, c.getAttribute('source'), c.getAttribute('target'));
                if (elem) {                                              // found forward ref
                    root.removeChild(elem);                              // swap nodes
                    root.insertBefore(elem, c);
                    visited.add(elem.getAttribute('id'));
                    cells = [...root.childNodes];                        // refresh list
                }
            }
            if (visited.size === 0) return;
            const mod = new mxCodec().decode(node), layer = mod.root.children[0],
                  model = graph.getModel(), owner = graph.getDefaultParent();
            model.beginUpdate();
            try {
                model.add(owner, mod.root.children[0], model.getChildCount(owner));
                graph.setSelectionCells(graph.ungroupCells([layer]));
            } finally {
                model.endUpdate();
            }
            model.filterDescendants(cell => {                            // process added oscillators
                if (isOscCell(cell) && !oscillators.has(cell.id)) addOsc(cell);
            });
        } catch(e) {
            console.error(e.stack);
        }
    },
    openWnd = (elem, title, x, y, w, h) => {     // open window for element
        elem.style.display = 'block';
        const result = new mxWindow(title, elem, x, y, w, h, false, true);
        result.addListener(mxEvent.CLOSE, wndListener(elem));
        result.setClosable(true); result.show();
        elem.instance = result;
    },
    wndListener = elem => {                      // window closed listener
        const result = e => {
            elem.instance.removeListener(mxEvent.CLOSE, result);
            elem.instance.destroy(); elem.instance = undefined;
            elem.style.display = 'none';
        };
        return result;
    },
    createEdge = (style, x1, y1, x2, y2, value = '', event = true) => {
        let elm = new mxCell(value, new mxGeometry(0, 0, 0, 0), style);
        elm.geometry.setTerminalPoint(new mxPoint(x1, y1), true);
        elm.geometry.setTerminalPoint(new mxPoint(x2, y2), false);
        elm.geometry.relative = true; elm.edge = true;
        elm = graph.addCell(elm);
        if (event) graph.fireEvent(new mxEventObject('cellsInserted', 'cells', [elm]));
        return elm;
    },
    connectToBus = (bus, elem, inputs) => {
        const model = graph.getModel(),
              view = graph.getView();
        try {
            const style = 'endArrow=none;edgeStyle=orthogonalEdgeStyle',
                  eg = elem.geometry,
                  vbus = view.getState(bus),
                  seg = mxUtils.findNearestSegment(vbus, inputs ? eg.x : eg.x + eg.width, eg.y),
                  x = vbus.absolutePoints[seg].x,                        // source/target point
                  fdim = mxUtils.getSizeForString('W', vbus.style[mxConstants.STYLE_FONTSIZE]),
                  offy = fdim.height / 2 | 0,                            // label y offset
                  offx = (fdim.width / 2 | 0) + 2,                       // label x offset
                  cnstrs = graph.getAllConnectionConstraints(view.getState(elem));
            model.beginUpdate();
            try {
                cnstrs.forEach(cnstr => {
                    if ((inputs && cnstr.point.x === 0) || (!inputs && cnstr.point.x === 1)) {
                        const y = (eg.y + eg.height * cnstr.point.y) | 0, // source/target point
                              g = inputs ? [x, y, 0, 0] : [0, 0, x, y],
                              edge = createEdge(style, ...g, 'X', false);
                        graph.connectCell(edge, bus, inputs, null);
                        graph.connectCell(edge, elem, !inputs, cnstr);
                        const geom = edge.geometry.clone();
                        geom.points = [new mxPoint(x, y)];               // remove bends
                        geom.x = inputs ? -1 : 1; geom.y = offy;         // label position/offset
                        geom.offset = new mxPoint(inputs ? offx : -offx, 0); // label offset
                        model.setGeometry(edge, geom);
                    }
                });
            } finally {
                model.endUpdate();
            }
        } catch(e) {
            console.error(e.stack);
        }
    };
    let lastId, encoder;                         // scheme serialization
    mxObjectCodec.prototype.beforeEncode = function(sender, obj, node) {
        if (obj instanceof Map) return [...obj];                         // Map as array
        return obj;
    };
    mxObjectCodec.prototype.convertAttributeToXml = function(sender, obj, name, value) {
        if (!Array.isArray(obj)) return value;
        if (typeof value === 'string' && Array.isArray(obj[1])) lastId = value;
        else if (typeof value === 'function') {                          // processor as associated cell
            const cell = graph.model.getCell((obj[0] === value) ? lastId : obj[0]);
            return sender.encode(cell).outerHTML;
        }
        return value;
    };
    mxObjectCodec.prototype.beforeDecode = function(sender, node, obj) {
        encoder = sender;
        return node;
    };
    mxObjectCodec.prototype.addObjectValue = (obj, fieldname, value, template) => {
        if (value === null || value === template) return;
        if (typeof value === 'string' && value.startsWith('<mxCell ')) { // create cell for processor
            const cell = encoder.decode(mxUtils.parseXml(value).documentElement);
            if (isGenCell(cell)) cell.value = 'inp';                     // substitute sources
            else if (isOscCell(cell)) cell.value = 'out';                // substitute outputs
            value = cell;
        }
        if (fieldname !== null && fieldname.length > 0) obj[fieldname] = value;
        else if (obj instanceof Map) obj.set(value[0], value[1]);
        else obj.push(value);
    };
    let theme = 'light', grid = 'Show',
        parent = graph.getDefaultParent(),       // first child of the root (layer 0)
        oscStep = 8, oscStart = 0;               // shared data for oscillographs
    logicFncs.set('&', cell => {                 // NAND gate
        const result = [0],
              negate = getStrAttr(cell.style, 'outputs').startsWith('/');
        return (t, inputs) => {
            if (inputs) result[0] = inputs.includes(0) ? negate ? 1 : 0 : negate ? 0 : 1;
            return result;
        };
    });
    logicFncs.set('one', cell => {               // NOR gate
        const result = [0],
              negate = getStrAttr(cell.style, 'outputs').startsWith('/');
        return (t, inputs) => {
            if (inputs) result[0] = inputs.includes(1) ? negate ? 0 : 1 : negate ? 1 : 0;
            return result;
        };
    });
    logicFncs.set('H', cell => {                 // HI signal
        const result = [1]; return (t) => result;
    });
    logicFncs.set('L', cell => {                 // LO signal
        const result = [0]; return (t) => result;
    });
    logicFncs.set('~', cell => {                 // generator
        const result = [0];
        let freq = (getStrAttr(cell.style, 'freq') ?? '8') | 0, prevT = null, counter = 0;
        if (freq < 2) {
            console.warn(`Frequency set to minimum (2) at id: ${cell.id}`);
            freq = 2;
        }
        let ticks = getStrAttr(cell.style, 'ticks');                     // impulse(s) descr
        if (ticks !== null) {
            ticks = ticks.split(',');
            if (ticks[0] === '+') { result[0] = 1; ticks.shift(); }      // start H
            freq = ticks.shift() | 0;                                    // stay ticks
        }
        return t => {
            if (t !== prevT) {
                prevT = t; counter++;
                if (counter >= freq) {
                    counter = 0; result[0] = result[0] ? 0 : 1;
                    if (ticks !== null) {
                        if (ticks.length === 0) freq = Infinity;         // stay on last level
                        else freq = ticks.shift() | 0;                   // next
                    }
                }
            }
            return result;
        };
    });
    logicFncs.set('=', cell => {                 // oscillograph
        const oscillograph = oscillators.get(cell.id);
        return (t, inputs) => {
            oscillograph.addPoint(inputs[0]);
        };
    });
    logicFncs.set('inp', cell => {               // input terminal
        const index = getStrAttr(cell.style, 'ord') ?? cell.geometry.y,  // for sorting
              result = [0];
        return (t, input) => {
            if (t === true) return index;               // sorting call
            if (input !== undefined) result[0] = input; // external call
            else return result;                         // normal call
        }
    });
    logicFncs.set('out', cell => {               // output terminal
        const index = getStrAttr(cell.style, 'ord') ?? cell.geometry.y;  // for sorting
        let result = 0;
        return (t, inputs) => {
            if (t === true) return index;               // sorting call
            if (inputs === undefined) return result;    // external call
            else result = inputs[0];                    // normal call
        }
    });
    logicFncs.set('group', async cell => {       // sub-graph node
        const scheme = await loadScheme(getStrAttr(cell.style, 'scm')),
              inps = [], outs = [], cache = new Map(),
        result = scheme[0].map(e => {
            outs.push(scheme[1].get(e)[0]);      // prepare outputs
            return 0;                            // prepare result
        });
        outs.sort((a, b) => a(true) - b(true));  // sort by vertical placement
        const map = scheme[1];
        [...map.values()].forEach(e => e[1].forEach(e => {
            const [id, fnc] = e;
            if (!map.has(id) && !inps.includes(fnc))
                inps.push(fnc);                  // find all inputs
        }));
        inps.sort((a, b) => a(true) - b(true));  // sort by vertical placement
        return (t, inputs) => {
            if (t === undefined) return result;  // loopback, return current value
            for (let i = 0, n = inputs.length; i < n; i++)
                inps[i](t, inputs[i]);           // map inputs
            runScheme(scheme, cache, t);         // execute one step
            for (let i = 0, n = outs.length; i < n; i++)
                result[i] = outs[i]();           // merge outputs
            return result;
        };
    });
    logicFncs.set('table', async cell => {       // truth table node
        const [table, defs, clock, idxs, initRes] = tables.get(getStrAttr(cell.style, 'table'));
        let result = initRes, prevC = 0;
        return (t, inputs) => {
            if (t === undefined) return result;                // loopback
            let map, key;
            if (defs === null) map = table;
            else {                                             // async bits
                key = '';
                for (let i = 0, n = defs.length; i < n; i++) key += inputs[defs[i]];
                map = table.get(key);
                if (Array.isArray(map)) { result = map.slice(0); return result; }
            }
            key = '';                                          // remaining bits
            for (let i = 0, n = idxs.length; i < n; i++) {
                const idx = idxs[i];
                let bit = inputs[idx];
                if (idx === clock) {                           // raising or falling edge
                    const change = (bit === prevC) ? '0' : (bit === 0) ? '-' : '+';
                    prevC = bit; bit = change;
                }
                key += bit;
            }
            map = map.get(key);
            if (Array.isArray(map)) {
                map = map.slice(0);
                for (let i = 0, n = result.length; i < n; i++) // toggle bit
                    if (map[i] === 't') map[i] = result[i] ? 0 : 1;
                result = map;
            }
            return result;
        };
    });
    graph.getSelectionModel().addListener(mxEvent.CHANGE, (sender, evt) => {
        if (wnd.instance === undefined) return;  // options view not active
        wnd.innerHTML = '';                      // clear properties view
        let l, view;
        if ((l = evt.getProperty('removed')) && l.length > 0 && (view = l[l.length - 1]) && view.vertex)
            setProps(view);
    });
    graph.popupMenuHandler.factoryMethod = (menu, cell, evt) => {
        if (graph.getSelectionCount() === 2) {   // setup auto connection menu
            const [cell1, cell2] = graph.getSelectionCells(),
                  edge = cell1.edge ? cell1 : cell2.edge ? cell2 : null,
                  vert = cell1.vertex ? cell1 : cell2.vertex ? cell2 : null;
            if (vert !== null && edge !== null && isBus(edge) &&
                    (getStrAttr(vert.style, 'inputs') || getStrAttr(vert.style, 'outputs'))) {
                menu.addItem('Connect inputs', null, () => connectToBus(edge, vert, true));
                menu.addItem('Connect outputs', null, () => connectToBus(edge, vert, false));
            }
            return;
        }
        const view = graph.view.getState(cell, false);
        if (view) {                              // setup selected cell menu
            if (view.style?.['points'] || view.style?.['resizable'] === 0) { // setup selected logic menu
                if (wnd.instance === undefined) menu.addItem('Edit...', null, () => {
                    openWnd(wnd, 'Options', 350, 500, 400, 114);
                    setProps(view.cell);
                });
            } else {                             // setup selected edge menu
                menu.addItem('Align left', null, () => alignEdge(view, true));
                menu.addItem('Align right', null, () => alignEdge(view, false));
                menu.addItem('Align join', null, () => alignJoin(view));
                menu.addItem('Move left join', null, () => moveJoin(view, true));
                menu.addItem('Move right join', null, () => moveJoin(view, false));
            }
            menu.addItem('Delete', null, () => graph.removeCells(null, true));
            menu.addSeparator();
        }
        const addmenu = menu.addItem('Add', null, null);
        menu.addItem('Wire', null, () => createEdge(
            'endArrow=none;edgeStyle=orthogonalEdgeStyle', 20, 20, 60, 20), addmenu);
        menu.addItem('Bus', null, () => createEdge(
            'endArrow=none;edgeStyle=orthogonalEdgeStyle;strokeWidth=4', 20, 20, 60, 20), addmenu);
        menu.addItem('Source', null, () =>
            graph.insertVertex(parent, null, '~', 20, 20, 32, 32, 'shape=ellipse;resizable=0'),
            addmenu);
        menu.addItem('Gate', null, () =>
            graph.insertVertex(parent, null, '', 20, 20, 30, 40, 'inputs=,;outputs=/;gate=&'),
            addmenu);
        if (fragments !== null) {
            const smenu = menu.addItem('Fragment', null, null, addmenu);
            fragments.forEach(d => menu.addItem(d[0], null, async () => await loadGroup(d[1]), smenu));
        }
        if (components !== null) {
            const smenu = menu.addItem('Component', null, null, addmenu);
            components.forEach(d => menu.addItem(d[0], null, () =>
                    graph.insertVertex(parent, null, '', 20, 20, 40, getAdjHeight(d[1]), d[1]), smenu));
        }
        const sysmenu = menu.addItem('System', null, null);
        menu.addItem('UnDo', null, () => undoManager.undo(), sysmenu);
        menu.addItem('ReDo', null, () => undoManager.redo(), sysmenu);
        menu.addItem('ZoomIn', null, () => graph.zoomIn(), sysmenu);
        menu.addItem('ZoomOut', null, () => graph.zoomOut(), sysmenu);
        menu.addItem('Cancel zoom', null, () => graph.zoomActual(), sysmenu);
        menu.addItem('Cancel pan', null, () => graph.getView().setTranslate(0, 0), sysmenu);
        menu.addItem(`${multiselection ? 'Single' : 'Multi'} selection`, null, () =>
            multiselection = !multiselection, sysmenu);
        if (osc.instance === undefined) menu.addItem('View oscillograph', null, () =>
                openWnd(osc, 'Oscillograph', 50, 210, 700, 315), sysmenu);
        else menu.addItem('Clear oscillograph', null, () => {
            oscStart = 0;                                                // reset start
            for (const [id, fnc] of oscillators)
                if (!graph.model.getCell(id)) removeOsc({id});           // cell removed
                else fnc.clear();
        }, sysmenu);
        menu.addItem('View graph', null, () => {
            const enc = new mxCodec(), doc = enc.encode(graph.getModel());
            console.log(mxUtils.getPrettyXml(doc));
        }, sysmenu);
        menu.addItem(`${grid} grid`, null, () => {
            container.style.background = (grid === 'Show') ?
                    `url(${mxBasePath}/images/wires-grid.gif)` : null;
            grid = (grid === 'Show') ? 'Hide' : 'Show';
        }, sysmenu);
        menu.addItem('Save graph', null, () => {
            const enc = new mxCodec(), doc = enc.encode(graph.getModel());
            downloadFile(sysfn.value, mxUtils.getPrettyXml(doc));
        }, sysmenu);
        menu.addItem('Load graph', null, async () => await loadGraph(sysfn.value), sysmenu);
        menu.addItem('Load as group', null, async () => await loadGroup(sysfn.value), sysmenu);
        if (sys.instance === undefined) menu.addItem('Settings...', null, () =>
                openWnd(sys, 'Settings', 250, 18, 500, 282), sysmenu);
        menu.addSeparator(sysmenu);
        menu.addItem('Clear console', null, () => console.clear(), sysmenu);
        menu.addItem(`Set ${theme} theme`, null, () => {
            html_tag.setAttribute('data-theme', theme);
            theme = (theme === 'dark') ? 'light' : 'dark';
        }, sysmenu);
        menu.addSeparator();
        menu.addItem('Verify scheme', null, async () => await getScheme());
        menu.addItem('Save scheme', null, async () => {
            const scheme = await getScheme();
            if (scheme === null) return;
            downloadFile(sysfn.value, mxUtils.getPrettyXml(new mxCodec().encode(scheme)));
        });
        menu.addItem('Run', null, async () => {
            const verified = await getScheme();
            if (verified === null) return;       // validation error
            try {
                runScheme(verified);
            } catch(e) {
                console.error(e.stack);
            }
        });
    };
    let cellSelected = false,
        selectionEmpty = false,
        menuShowing = false,
        multiselection = false;                  // is multiple cells selection
    graph.fireMouseEvent = function(evtName, me, sender) {
        if (evtName == mxEvent.MOUSE_DOWN) {     // for hit detection on edges
            me = this.updateMouseEvent(me);
            cellSelected = this.isCellSelected(me.getCell());
            selectionEmpty = this.isSelectionEmpty();
            menuShowing = graph.popupMenuHandler.isMenuShowing();
        }
        mxGraph.prototype.fireMouseEvent.apply(this, arguments);
    };
    graph.isToggleEvent = function(me) {
        return mxGraph.prototype.isToggleEvent.apply(this, arguments) || multiselection;
    };
    // show popup menu if cell was selected or selection was empty and background was clicked
    graph.popupMenuHandler.mouseUp = function(sender, me) {
        this.popupTrigger = !graph.isEditing() && (
            this.popupTrigger || (
                !menuShowing && !graph.isEditing() && (
                    (selectionEmpty && me.getCell() == null && graph.isSelectionEmpty()) ||
                    (cellSelected && graph.isCellSelected(me.getCell())) ||
                    (multiselection && me.getCell() && graph.getSelectionCount() === 2)
                )
            )
        );
        mxPopupMenuHandler.prototype.mouseUp.apply(this, arguments);
    };
    graph.addListener(mxEvent.CELLS_REMOVED, (sender, evt) => {
        evt.properties.cells.forEach(cell => {
            if (cell.vertex && cell.value === '=') removeOsc(cell);
        });
    });
    graph.addListener(mxEvent.LABEL_CHANGED, (sender, evt) => {
        const cell = evt.properties.cell;
        if (evt.properties.old === '=') removeOsc(cell);
        else if (evt.properties.value === '=') addOsc(cell);
    });

    mxEvent.addMouseWheelListener((evt, up) => { // mouse wheel for zoom
        if (up) graph.zoomIn();
        else graph.zoomOut();
        mxEvent.consume(evt);
    });

    mxGraphHandler.prototype.guidesEnabled = true;
    mxGraphHandler.prototype.previewColor = 'var(--dbgborder)';
    mxConstants.GUIDE_COLOR = 'var(--secondary)';
    mxConstants.GUIDE_STROKEWIDTH = 1;
    mxConstants.VERTEX_SELECTION_COLOR = 'var(--selection)';
    mxConstants.VERTEX_SELECTION_STROKEWIDTH = 1.5;
    mxConstants.EDGE_SELECTION_COLOR = 'var(--selection)';
    mxConstants.EDGE_SELECTION_STROKEWIDTH = 1.5;
    mxEdgeHandler.prototype.snapToTerminals = true;

    const EDGE_STROKEWIDTH = 1;                  // default edge stroke width (different for bus)
    ((style) => {                                // default vertex style
        style[mxConstants.STYLE_STROKEWIDTH] = 1;
        style[mxConstants.STYLE_STROKECOLOR] = 'var(--dbgborder)';
        style[mxConstants.STYLE_FILLCOLOR] = 'var(--dbgbckgrnd)';
        style[mxConstants.STYLE_FONTCOLOR] = 'var(--dbgcolor)';
        style[mxConstants.STYLE_FONTSIZE] = 14;
    })(graph.getStylesheet().getDefaultVertexStyle());
    ((style) => {                                // default edge style
        style[mxConstants.STYLE_STROKEWIDTH] = EDGE_STROKEWIDTH;
        style[mxConstants.STYLE_STROKECOLOR] = 'var(--dbgborder)';
        style[mxConstants.STYLE_FONTCOLOR] = 'var(--dbgcolor)';
        style[mxConstants.STYLE_FONTSIZE] = 14;
    })(graph.getStylesheet().getDefaultEdgeStyle());

    const defFntTop = 5, defFntBot = 5, defFntSiz = 10, defFntClr = 'var(--dbgborder)',
    genPoints = (data, w, h, ftop, fbot, fsize, input) => {
        if (data === null) return null;
        const res = [], vals = data.split(','),
              deltaH = (h - (ftop + fbot)) / vals.length,
              fontD = mxUtils.getSizeForString('W', fsize),
        setMode = () => {                        // parse control character
            if (txt.charAt(0) === '/') { txt = txt.substring(1).trim(); mod |= 1; }
            else if (txt.charAt(0) === '^') { txt = txt.substring(1).trim(); mod |= 2; }
            else if (txt.charAt(0) === 'v') { txt = txt.substring(1).trim(); mod |= 4; }
        };
        let txt, mod, hhh = (deltaH - fontD.height) / 2 + ftop; if (hhh < ftop) hhh = ftop;
        for (let i = 0, n = vals.length; i < n; i++) {
            mod = 0; txt = vals[i].trim();
            let txtd;
            if (txt.length === 0) txtd = fontD;
            else {
                setMode(); setMode();            // up to 2 control chars
                txtd = mxUtils.getSizeForString(txt, fsize);
            }
            const adj = Math.round(hhh * graph.gridSize) / graph.gridSize; // snap to grid
            res.push([input ? 5 : w - txtd.width - 5, adj, txtd.width, txt, mod]);
            hhh += deltaH;
        }
        return res;
    },
    ShapeMixin = {
        paintVertexShape(c, x, y, w, h) {
            this.superPaintVertexShape(...arguments);
            if (!this.style) return;
            const fntSiz = this.style['fntsiz'] ?? defFntSiz,
                  fntBld = this.style['fntbld'] ?? false,
                  fntScl = fntSiz * this.scale;
            let points = this.style['points'] ?? null, cntr;
            if (points === null) {
                const inps = this.style['inputs'] ?? null, outs = this.style['outputs'] ?? null;
                if (inps === null && outs === null) return;
                this.style['resizable'] = 0;                 // disable resize
                this.style['verticalLabelPosition'] = 'top'; // default label position
                this.style['verticalAlign'] = 'bottom';
                const fntTop = this.style['fnttop'] ?? defFntTop,
                      fntBot = this.style['fntbot'] ?? defFntBot;
                points = []; this.style['points'] = points;
                points.push(genPoints(inps, w, h, fntTop, fntBot, fntSiz, true));
                points.push(genPoints(outs, w, h, fntTop, fntBot, fntSiz, false));
            }
            c.setFontColor(defFntClr);
            for (let i = 0; i < 2; i++) {
                const data = points[i];
                for (let j = 0, m = data.length; j < m; j++) {
                    const [dx, dy, tw, txt, mod] = data[j];
                    if (txt.length > 0) {
                        this.plainText(c, x + dx, y + dy, w, h, txt, fntBld, fntScl);
                        if (mod & 1) { // negate label
                            c.begin();
                            c.moveTo(x + dx, y + dy);
                            c.lineTo(x + dx + tw, y + dy);
                            c.stroke();
                        }
                    }
                    if (mod & 1) {     // negate contact
                        c.begin();
                        c.ellipse((i === 0) ? x - 5 : x + w, y + dy + 2, 5, 5);
                        c.stroke();
                    }
                    if (mod & 2) {     // falling edge clock contact
                        c.begin();
                        if (i === 0) {
                            c.moveTo(x, y + dy); c.lineTo(x + 5, y + dy + 5); c.lineTo(x, y + dy + 10);
                        } else {
                            c.moveTo(x + w, y + dy); c.lineTo(x + w + 5, y + dy + 5);
                            c.lineTo(x + w, y + dy + 10);
                        }
                        c.stroke();
                    }
                    if (mod & 4) {     // rising edge clock contact
                        c.begin();
                        if (i === 0) {
                            c.moveTo(x, y + dy); c.lineTo(x - 5, y + dy + 5); c.lineTo(x, y + dy + 10);
                        } else {
                            c.moveTo(x + w, y + dy); c.lineTo(x + w - 5, y + dy + 5);
                            c.lineTo(x + w, y + dy + 10);
                        }
                        c.stroke();
                    }
                }
            }
            if (cntr = this.style['gate']) {
                if (cntr === 'one') cntr = '1';
                this.plainText(c, x + 5, y + 5, 10, 10, cntr, fntBld, fntScl);
            }
        },
        plainText(c, x, y, w, h, str, fontBold, fontSize) {
            c.plainText(x, y, w, h, str, 'left', 'top', false, '', false, 0, null);
            c.root.querySelectorAll('g').forEach(g => { // patch implementation
                g.setAttribute('font-size', fontSize + 'px');
                if (fontBold) g.setAttribute('font-weight', 'bold');
            });
        }
    };
    mxRectangleShape.prototype.superPaintVertexShape = mxRectangleShape.prototype.paintVertexShape;
    Object.assign(mxRectangleShape.prototype, ShapeMixin);

    const undoManager = new mxUndoManager(),     // setup undo manager
          u_lst = (sender, evt) => undoManager.undoableEditHappened(evt.getProperty('edit'));
    graph.getModel().addListener(mxEvent.UNDO, u_lst);
    graph.getView().addListener(mxEvent.UNDO, u_lst);

    mxShape.prototype.svgStrokeTolerance = 12;   // improve touch handling
    mxVertexHandler.prototype.tolerance = 12;
    mxEdgeHandler.prototype.tolerance = 12;
    mxGraph.prototype.tolerance = 12;
    mxConnectionHandler.prototype.ignoreMouseDown = true;
    mxConstants.LABEL_HANDLE_SIZE = 10;

    mxGraph.prototype.getAllConnectionConstraints = (terminal, source) => { // vertex connection points
        const points = terminal.style['points'] ?? null;
        if (points === null) return null;
        const geom = terminal.cell.geometry, res = [];
        for (let i = 0; i < 2; i++) {
            const data = points[i];
            for (let j = 0, m = data.length; j < m; j++) {
                const [, dy, , , mod] = data[j],
                      offs = (mod & 1) ? i ? 5.0 : -5.0 :
                              (mod & 2) ? i ? 5.0 : undefined :
                              (mod & 4) ? i ? undefined : -5.0 : undefined,
                      pct = (dy + 5.0) / geom.height;
                res.push(new mxConnectionConstraint(new mxPoint(i, pct), false, undefined, offs));
            }
        }
        return res;
    };
    mxConstraintHandler.prototype.intersects = (icon, point, source, existingEdge) => {
        return (!source || existingEdge) && mxUtils.intersects(icon.bounds, point);
    };
    graph.addListener(mxEvent.CELL_CONNECTED, (sender, evt) => {
        const edge = sender.view.getState(evt.getProperty('edge'));
        if (edge) {
            const terminal = sender.view.getState(evt.getProperty('terminal')),
                  source = evt.getProperty('source');
            let color = sender.getStylesheet().getDefaultEdgeStyle()[mxConstants.STYLE_STROKECOLOR];
            if (terminal?.style.points && isNaN(source ? edge.style.exitX : edge.style.entryX)) {
                console.error(`${source ? 'source' : 'target'} port error`);
                color = 'var(--error)';
            }
            sender.setCellStyles(mxConstants.STYLE_STROKECOLOR, color, [edge.cell]);
        }
    });

    graph.isValidSource = function(cell) {                                  // edge to edge connection
        return cell?.edge || mxGraph.prototype.isValidSource.apply(this, arguments);
    };
    const getPreviewTerminalState = mxEdgeHandler.prototype.getPreviewTerminalState;
    let lastMouseX, lastMouseY;                            // last mouse position
    mxEdgeHandler.prototype.getPreviewTerminalState = function(me) {
        lastMouseX = me.graphX; lastMouseY = me.graphY;    // set last mouse position
        let ret = getPreviewTerminalState.apply(this, arguments),
            edge = me.getCell();
        if (edge && edge.edge && this.graph.getSelectionCell() !== edge) {
            const state = this.graph.view.getState(edge);
            this.marker.setCurrentState(state, me, this.marker.validColor);
            ret = state;
        }
        else if (ret == null && this.marker && (!this.error || (this.error && this.error === '')))
            this.marker.reset();
        return ret;
    };
    const getFixedTerminalPoint = mxGraphView.prototype.getFixedTerminalPoint;
    mxGraphView.prototype.getFixedTerminalPoint = function(edge, terminal, source, constraint) {
        if (!terminal || !terminal.absolutePoints) {
            edge.style[source ? 'startArrow' : 'endArrow'] = undefined;
            return getFixedTerminalPoint.apply(this, arguments);
        }
        let pt;
        if (lastMouseX === undefined) {
            const geom = edge.cell.geometry,
                  gp = source ? geom.sourcePoint : geom.targetPoint,
                  s = this.scale, t = this.translate, o = edge.origin;
            pt = new mxPoint(s * (t.x + gp.x + o.x), s * (t.y + gp.y + o.y));
        } else {
            pt = new mxPoint(lastMouseX, lastMouseY);      // use last mouse position
            lastMouseX = undefined; lastMouseY = undefined;
        }
        const seg = mxUtils.findNearestSegment(terminal, pt.x, pt.y),
              p0 = terminal.absolutePoints[seg], pe = terminal.absolutePoints[seg + 1],
              vertical = p0.x - pe.x === 0;
        if (vertical) {
            pt.x = p0.x;
            pt.y = Math.min(pt.y, Math.max(p0.y, pe.y));
            pt.y = Math.max(pt.y, Math.min(p0.y, pe.y));
        } else {
            pt.y = p0.y;
            pt.x = Math.min(pt.x, Math.max(p0.x, pe.x));
            pt.x = Math.max(pt.x, Math.min(p0.x, pe.x));
        }
        if (terminal.style['strokeWidth'] === EDGE_STROKEWIDTH)
            edge.style[source ? 'startArrow' : 'endArrow'] = 'oval';
        return pt;
    };

    console.info(mxClient.VERSION);
}
