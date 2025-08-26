'use strict';

async function main() {
    const html_tag = document.querySelector('html');

    console.error = console._logwrapper('var(--error)');
    console.warn = console._logwrapper('var(--warning)');
    console.info = console._logwrapper('var(--secondary)');

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
    const wnd = document.getElementById('wnd'),  // options window element
          osc = document.getElementById('osc'),  // graphics window element
          oscillators = new Map(),               // graph canvases
    getStrAttr = (style, name) => (style &&
            (m = style.match(new RegExp(`${name}=(.*?)(;|$)`)))) ? m[1] : null,
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
                const num = getStrAttr(style, 'inputs').split(',').length;
                cell.geometry.height = num * 20;
            }
            graph.getModel().setStyle(cell, style);
            if (cell.value === '=') updateOsc(cell);
        };
    },
    alignEdge = (view, left) => {                // remove edge bend
        const vcell = view.cell,
              tcell = left ? vcell.source : vcell.target;
        if (!tcell) return;                                              // not connected
        const geom = vcell.geometry.clone(),
              points = geom.points,                                      // only 1 bend (2 points) expected
              term = left ? geom.sourcePoint : geom.targetPoint;         // terminal point
        if (!points || points.length === 0) return;                      // no bends/offsets
        let delta;
        switch (points.length) {
            case 1:                                                      // offset only
                if (term.y === points[0].y) {                            // offset on different side
                    console.warn(points);
                    return;
                }
                delta = term.y - points[0].y;
                points.length = 0;                                       // remove offset
                break;
            case 3:                                                      // 1 bend and vertical offset
                if (points[0].x === points[1].x) {                       // target offset
                    points[1].y = points[2].y;                           // include to bend
                    points.splice(2);                                    // remove offset
                }
                else if (points[1].x === points[2].x) {                  // source offset
                    points[1].y = points[0].y;                           // include to bend
                    points.splice(0);                                    // remove offset
                }
            case 2:                                                      // 1 bend (2 points)
                if (points[0].x !== points[1].x) {                       // not vertical bend
                    console.warn(points);
                    return;
                }
                delta = left ? points[1].y - points[0].y : points[0].y - points[1].y;
                break;
            default:
                console.warn(points);
                return;
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
    edgeError = (edges, msg, color = 'red') => { // highlite nodes and exit Array.some loop
        graph.setCellStyles(mxConstants.STYLE_STROKECOLOR, color, edges);
        if (msg) console.error(msg);
        return true;
    },
    getOutput = (edge, term) => {                // find output for opposite terminal
        if (!term) return edgeError([edge], 'Disconnected wire');
        const result = [];
        if (term.edge) {                                                 // joined wire
            let tmp = getOutput(term, term.source);                      // output for source
            if (tmp === true) return true;                               // propagate error
            if (tmp !== null) result.push(tmp);
            tmp = getOutput(term, term.target);                          // output for target
            if (tmp === true) return true;
            if (tmp !== null) result.push(tmp);
        }
        else if (['H', 'L', '~'].includes(term.value)) result.push([null, term]);
        else if (term.value !== '=') {                                   // not input
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
        if (result.length > 1) {
            for (let i = 0, n = result.length; i < n; i++) result[i] = result[i][1];
            return edgeError(result, 'More than 1 output');              // report all outputs
        }
        return (result.length === 0) ? null : result[0];
    },
    oscFunc = function() {                       // oscillograph
        const canvas = document.createElement('canvas');
        canvas.width = 1000; canvas.height = 30;
        const ctx = canvas.getContext('2d'),
              points = new Uint8Array(1000),
        colorAtr = v => (v === undefined) ? ctx.strokeStyle : ctx.strokeStyle = v,
        draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
            let x = 0, y = points[oscStart] ? 2 : canvas.height - 2;
            ctx.moveTo(x, y);
            for (let i = oscStart + 1; i < oscCount; i++) {
                x += oscStep; if (x > canvas.width) x = canvas.width;
                ctx.lineTo(x, y);
                if (x === canvas.width) break;
                const ny = points[i] ? 2 : canvas.height - 2;
                if (ny !== y) { y = ny; ctx.lineTo(x, y); }
            }
            ctx.stroke();
        };
        ctx.lineWidth = 1; colorAtr('#aaaaaa');
        return {canvas, colorAtr, draw};
    },
    addOsc = cell => {                           // create oscillograph
        const elem = new oscFunc();
        osc.appendChild(elem.canvas);
        oscillators.set(cell.id, elem);
    },
    updateOsc = cell => {                        // update oscillograph parameters
        const elem = oscillators.get(cell.id),
              color = getStrAttr(cell.style, 'fillColor');
        if (color !== null && color !== elem.colorAtr()) { elem.colorAtr(color); elem.draw(); }
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
    optwndlst = e => {
        optwnd.removeListener(mxEvent.CLOSE, optwndlst);
        optwnd.destroy(); optwnd = null;
        wnd.style.display = 'none';
    },
    oscwndlst = e => {
        oscwnd.removeListener(mxEvent.CLOSE, oscwndlst);
        oscwnd.destroy(); oscwnd = null;
        osc.style.display = 'none';
    };
    let theme = 'light', grid = 'Show', optwnd = null, m, oscwnd = null,
        parent = graph.getDefaultParent(),       // first child of the root (layer 0)
        oscStep = 8, oscStart = 0, oscCount = 0; // shared data for oscillographs
    graph.getSelectionModel().addListener(mxEvent.CHANGE, (sender, evt) => {
        if (optwnd === null) return;             // options view not active
        wnd.innerHTML = '';                      // clear properties view
        let l, view;
        if ((l = evt.getProperty('removed')) && l.length > 0 && (view = l[l.length - 1]) && view.vertex)
            setProps(view);
    });
    graph.popupMenuHandler.factoryMethod = (menu, cell, evt) => {
        const view = graph.view.getState(cell, false);
        if (view) {                              // setup selected cell menu
            if (view.style?.['points'] || view.style?.['resizable'] === 0) { // setup selected logic menu
                if (optwnd === null) menu.addItem('Edit...', null, () => {
                    wnd.style.display = 'block';
                    optwnd = new mxWindow('Options', wnd, 350, 500, 400, 300, false, true);
                    optwnd.addListener(mxEvent.CLOSE, optwndlst); optwnd.setClosable(true); optwnd.show();
                    setProps(view.cell);
                });
            } else {                             // setup selected edge menu
                menu.addItem('Align left', null, () => alignEdge(view, true));
                menu.addItem('Align right', null, () => alignEdge(view, false));
            }
            menu.addItem('Delete', null, () => graph.removeCells(null, true));
            menu.addSeparator();
        }
        const addmenu = menu.addItem('Add', null, null);
        menu.addItem('Wire', null, () => {
            let elm = new mxCell('', new mxGeometry(0, 0, 0, 0),
                    'endArrow=none;edgeStyle=orthogonalEdgeStyle');
            elm.geometry.setTerminalPoint(new mxPoint(20, 20), true);
            elm.geometry.setTerminalPoint(new mxPoint(60, 20), false);
            elm.geometry.relative = true; elm.edge = true;
            elm = graph.addCell(elm);
            graph.fireEvent(new mxEventObject('cellsInserted', 'cells', [elm]));
        }, addmenu);
        menu.addItem('Source', null, () =>
            graph.insertVertex(parent, null, '~', 20, 20, 32, 32, 'shape=ellipse;resizable=0'),
            addmenu);
        menu.addItem('Gate', null, () =>
            graph.insertVertex(parent, null, '', 20, 20, 30, 40, 'inputs=,;outputs=/;gate=&'),
            addmenu);
// add more elements
        const sysmenu = menu.addItem('System', null, null);
        menu.addItem('UnDo', null, () => undoManager.undo(), sysmenu);
        menu.addItem('ReDo', null, () => undoManager.redo(), sysmenu);
        menu.addItem('ZoomIn', null, () => graph.zoomIn(), sysmenu);
        menu.addItem('ZoomOut', null, () => graph.zoomOut(), sysmenu);
        menu.addItem('Cancel zoom', null, () => graph.zoomActual(), sysmenu);
        if (oscwnd === null) menu.addItem('View oscillograph', null, () => {
            osc.style.display = 'block';
            oscwnd = new mxWindow('Oscillograph', osc, 50, 190, 700, 282, false, true);
            oscwnd.addListener(mxEvent.CLOSE, oscwndlst); oscwnd.setClosable(true); oscwnd.show();
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
            downloadFile('scheme.xml', mxUtils.getPrettyXml(doc));
        }, sysmenu);
        menu.addItem('Load graph', null, async () => {
            try {
                const txt = await loadFile('scheme.xml', true),
                      doc = mxUtils.parseXml(txt),
                      node = doc.documentElement,
                      enc = new mxCodec(node.ownerDocument),
                      model = graph.getModel(),
                      error = node.querySelector('parsererror');
                if (error) throw new Error(error.querySelector('div').childNodes[0].nodeValue.trim());
                model.beginUpdate();
                try {
                    enc.decode(node, model);
                } finally {
                    model.endUpdate();
                }
                parent = graph.getDefaultParent(); // refresh default parent
                model.filterDescendants(cell => cell.vertex && cell.value === '=').forEach(addOsc);
            } catch(e) {
                console.error(e.stack);
            }
        }, sysmenu);
        menu.addSeparator(sysmenu);
        menu.addItem('Clear console', null, () => console.clear(), sysmenu);
        menu.addItem(`Set ${theme} theme`, null, () => {
            html_tag.setAttribute('data-theme', theme);
            theme = (theme === 'dark') ? 'light' : 'dark';
        }, sysmenu);
        menu.addSeparator();
        menu.addItem('Verify', null, () => {
let debug = false;
            const terminals = graph.model.filterDescendants(cell => cell.vertex && cell.value === '='),
            /*getOutput = (edge, term) => {
                if (!term) return edgeError([edge], 'Disconnected wire');
                if (term.edge) {
                    let tmp1 = getOutput(term, term.source);
                    if (tmp1 === true) return true;
                    let tmp2 = getOutput(term, term.target);
                    if (tmp2 === true) return true;
                    if (tmp1 !== null && tmp2 !== null) return edgeError([term], 'More than 1 output');
                    if (tmp1 === null && tmp2 === null) return edgeError([term], 'No output');
                    return (tmp1 === null) ? tmp2 : tmp1;
                }
                if (term.value === 'H' || term.value === 'L' || term.value === '~') return [null, term];
                if (term.value === '=') return null;
                const style = edge.style;
                if (edge.source === term && getStrAttr(style, 'exitX') === '1')
                    return [getStrAttr(style, 'exitY'), term];
                if (edge.target === term && getStrAttr(style, 'entryX') === '1')
                    return [getStrAttr(style, 'entryY'), term];
                return null;
            },*/
            layers = [],
            getCellInputs = cell => {
//                const inputs = [...graph.getIncomingEdges(cell), ...graph.getOutgoingEdges(cell)];
//console.log(inputs.length, cell.edges.length);
// add joining edges
const goals = new Set(/*inputs*/cell.edges);
const joins = graph.model.filterDescendants(cell => cell.edge && !goals.has(cell) &&
(goals.has(cell.source) || goals.has(cell.target)));
//if (debug) inputs.push(...joins);
                if (/*inputs*/cell.edges.some(edge => {
                    const input = getOutput(edge, (edge.source === cell) ? edge.target : edge.source);
                    if (input === true) return true;
                    if (input !== null) layers.push(input);
                })) return true;
                if (layers.length === 0) return edgeError([cell], 'No input');
//if (debug) edgeError(joins, null, 'green');
            };
//debug = true;
            terminals.some(getCellInputs);
//debug = false;
console.log(layers.map(l => l.map((g, i) => i ? g.id : g)));
//edgeError([layers[0][1]], '');
let ttt = layers[0][1]; layers.length = 0;
//debug = true;
getCellInputs(ttt);
//debug = false;
console.log(layers.map(l => l.map((g, i) => i ? g.id : g)));
//edgeError([layers[0][1],layers[1][1]], '');
ttt = layers[0][1]; layers.length = 0;
debug = true;
getCellInputs(ttt);
debug = false;
console.log(layers.map(l => l.map((g, i) => i ? g.id : g)));
edgeError([layers[0][1], layers[1][1], layers[2][1]], '');
        });
    };
    let cellSelected = false,
        selectionEmpty = false,
        menuShowing = false;
    graph.fireMouseEvent = function(evtName, me, sender) {
        if (evtName == mxEvent.MOUSE_DOWN) {     // for hit detection on edges
            me = this.updateMouseEvent(me);
            cellSelected = this.isCellSelected(me.getCell());
            selectionEmpty = this.isSelectionEmpty();
            menuShowing = graph.popupMenuHandler.isMenuShowing();
        }
        mxGraph.prototype.fireMouseEvent.apply(this, arguments);
    };
    // show popup menu if cell was selected or selection was empty and background was clicked
    graph.popupMenuHandler.mouseUp = function(sender, me) {
        this.popupTrigger = !graph.isEditing() && (
            this.popupTrigger || (
                !menuShowing && !graph.isEditing() && (
                    (selectionEmpty && me.getCell() == null && graph.isSelectionEmpty()) ||
                    (cellSelected && graph.isCellSelected(me.getCell()))
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
    mxEdgeHandler.prototype.snapToTerminals = true;

    ((style) => {                                // default vertex style
        style[mxConstants.STYLE_STROKEWIDTH] = 1;
        style[mxConstants.STYLE_STROKECOLOR] = 'var(--dbgborder)';
        style[mxConstants.STYLE_FILLCOLOR] = 'var(--dbgbckgrnd)';
        style[mxConstants.STYLE_FONTCOLOR] = 'var(--dbgcolor)';
        style[mxConstants.STYLE_FONTSIZE] = '14';
    })(graph.getStylesheet().getDefaultVertexStyle());
    ((style) => {                                // default edge style
        style[mxConstants.STYLE_STROKEWIDTH] = 1;
        style[mxConstants.STYLE_STROKECOLOR] = 'var(--dbgborder)';
        style[mxConstants.STYLE_FONTCOLOR] = 'var(--dbgcolor)';
        style[mxConstants.STYLE_FONTSIZE] = '14';
    })(graph.getStylesheet().getDefaultEdgeStyle());

    const defFntTop = 5/*0*/, defFntBot = 2/*7*/, defFntSiz = 14/*11*/, defFntClr = 'var(--dbgborder)',
    genPoints = (data, w, h, ftop, fbot, fsize, input) => {
        if (data === null) return null;
        const res = [], vals = data.split(','),
              deltaH = (h - (ftop + fbot)) / vals.length,
              fontD = mxUtils.getSizeForString('W', fsize);
        let hhh = (deltaH - fontD.height) / 2 + ftop; if (hhh < ftop) hhh = ftop;
        for (let i = 0, n = vals.length; i < n; i++) {
            let mod = 0, txt = vals[i].trim(), txtd;
            if (txt.length === 0) txtd = fontD;
            else {
                if (txt.charAt(0) === '/') { txt = txt.substring(1).trim(); mod |= 1; } // first spec char
                else if (txt.charAt(0) === '^') { txt = txt.substring(1).trim(); mod |= 2; }
                if (txt.charAt(0) === '/') { txt = txt.substring(1).trim(); mod |= 1; } // second spec char
                else if (txt.charAt(0) === '^') { txt = txt.substring(1).trim(); mod |= 2; }
                txtd = mxUtils.getSizeForString(txt, fsize);
            }
            res.push([input ? 5 : w - txtd.width - 5, hhh, txtd.width, txt, mod]);
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
                      fntBot = this.style['fntbot'] ?? defFntBot,
                      txtd = mxUtils.getSizeForString('W', fntSiz);
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
                            c.moveTo(x + dx, y + dy - 2);
                            c.lineTo(x + dx + tw, y + dy - 2);
                            c.stroke();
                        }
                    }
                    if (mod & 1) {     // negate contact
                        c.begin();
                        c.ellipse((i === 0) ? x - 5 : x + w, y + dy + 3, 5, 5);
                        c.stroke();
                    }
                    if (mod & 2) {     // clock contact
                        c.begin();
                        if (i === 0) {
                            c.moveTo(x, y + dy);
                            c.lineTo(x + 5, y + dy + 5);
                            c.lineTo(x, y + dy + 10);
                        } else {
                            c.moveTo(x + w, y + dy);
                            c.lineTo(x + w - 5, y + dy + 5);
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
                      offs = (mod & 1) ? i ? 5.0 : -5.0 : undefined,
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
        edge.style[source ? 'startArrow' : 'endArrow'] = 'oval';
        return pt;
    };

    console.info(mxClient.VERSION);
}
