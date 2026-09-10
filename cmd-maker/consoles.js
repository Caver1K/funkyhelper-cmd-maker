/* ---------------------------------------------------------------------- */
/* consoles.js - "Consoles" mode: a horizontally-scrolling row of console */
/* cards, each independently switchable between Text and Embed content.   */
/* ---------------------------------------------------------------------- */

window.ConsolesEditor = (function () {
    let nextId = 1;

    function svgIcon(pathData, size) {
        size = size || 16;
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
            '" fill="currentColor" viewBox="0 0 16 16">' + pathData + '</svg>';
    }

    const TRASH_ICON = svgIcon('<path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>');
    const PLUS_ICON = svgIcon('<path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/>', 14);

    function newConsole() {
        return {
            id: nextId++,
            namesRaw: "",
            mode: "embed",
            text: "",
            embed: window.EmbedEditor.defaultState()
        };
    }

    function parseNames(namesRaw) {
        return (namesRaw || "")
            .split(",")
            .map(function (n) { return n.trim(); })
            .filter(function (n) { return n.length > 0; });
    }

    function consoleHasContent(c) {
        if (c.namesRaw.trim()) return true;
        if (c.mode === "text") return !!c.text.trim();
        return !window.EmbedEditor.isEmpty(c.embed);
    }

    function create(consolesArray, opts) {
        opts = opts || {};
        const onChange = opts.onChange || function () {};

        let pendingDeleteId = null;
        const confirmBtn = document.getElementById("confirmDeleteConsoleBtn");
        const modalEl = document.getElementById("deleteConsoleModal");
        let bsModal = null;
        if (window.bootstrap && modalEl) {
            bsModal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
        }
        if (confirmBtn) {
            confirmBtn.onclick = function () {
                if (pendingDeleteId !== null) {
                    removeById(pendingDeleteId);
                    pendingDeleteId = null;
                }
                if (bsModal) bsModal.hide();
            };
        }

        const root = document.createElement("div");
        root.className = "d-flex flex-column h-100";

        const header = document.createElement("div");
        header.className = "consoles-header d-flex justify-content-between align-items-center mb-2";

        const headerLabel = document.createElement("span");
        headerLabel.className = "text-secondary small";
        headerLabel.textContent = "Consoles";
        header.appendChild(headerLabel);

        const addBtnTop = document.createElement("button");
        addBtnTop.type = "button";
        addBtnTop.className = "btn btn-primary btn-sm add-console-btn-top";
        addBtnTop.title = "Add console";
        addBtnTop.innerHTML = PLUS_ICON + " Add console";
        addBtnTop.addEventListener("click", function () { addConsole(); });
        header.appendChild(addBtnTop);

        root.appendChild(header);

        const row = document.createElement("div");
        row.className = "consoles-row";
        root.appendChild(row);

        row.addEventListener("wheel", function (e) {
            // Let the ordinary vertical scroll wheel drive this horizontal
            // row while the mouse is over it, instead of requiring a
            // horizontal scrollbar drag or a shift+scroll gesture.
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && row.scrollWidth > row.clientWidth) {
                row.scrollLeft += e.deltaY;
                e.preventDefault();
            }
        }, { passive: false });

        let currentViewMode = "edit";
        let cardInstances = [];

        function removeById(id) {
            const idx = consolesArray.findIndex(function (c) { return c.id === id; });
            if (idx !== -1) {
                consolesArray.splice(idx, 1);
                render();
                onChange();
            }
        }

        function addConsole() {
            consolesArray.push(newConsole());
            render();
            onChange();
        }

        function buildCard(consoleState) {
            const card = document.createElement("div");
            card.className = "console-card card bg-body-tertiary";

            const cardBody = document.createElement("div");
            cardBody.className = "card-body";
            card.appendChild(cardBody);

            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.className = "form-control console-name-input";
            nameInput.placeholder = "Console name(s), comma separated";
            nameInput.value = consoleState.namesRaw;
            nameInput.addEventListener("input", function () {
                consoleState.namesRaw = nameInput.value;
                onChange();
            });
            cardBody.appendChild(nameInput);

            const toggleGroup = document.createElement("div");
            toggleGroup.className = "btn-group btn-group-sm w-100 console-mode-toggle";
            toggleGroup.setAttribute("role", "group");

            const textBtn = document.createElement("button");
            textBtn.type = "button";
            textBtn.className = "btn btn-outline-light";
            textBtn.textContent = "Text";

            const embedBtn = document.createElement("button");
            embedBtn.type = "button";
            embedBtn.className = "btn btn-outline-light";
            embedBtn.textContent = "Embed";

            toggleGroup.appendChild(textBtn);
            toggleGroup.appendChild(embedBtn);
            cardBody.appendChild(toggleGroup);

            const slot = document.createElement("div");
            slot.className = "console-editor-slot";
            cardBody.appendChild(slot);

            const textEditor = window.PlaintextEditor.create(consoleState, {
                limit: 4096,
                placeholder: "Type message here...",
                onChange: onChange
            });
            const embedEditor = window.EmbedEditor.create(consoleState.embed, {
                onChange: onChange
            });
            slot.appendChild(textEditor.el);
            slot.appendChild(embedEditor.el);

            function syncModeButtons() {
                textBtn.classList.toggle("active", consoleState.mode === "text");
                embedBtn.classList.toggle("active", consoleState.mode === "embed");
                textEditor.el.classList.toggle("console-editor-hidden", consoleState.mode !== "text");
                embedEditor.el.classList.toggle("console-editor-hidden", consoleState.mode !== "embed");
            }
            syncModeButtons();

            textBtn.addEventListener("click", function () {
                consoleState.mode = "text";
                syncModeButtons();
                textEditor.syncFieldHeights();
                onChange();
            });
            embedBtn.addEventListener("click", function () {
                consoleState.mode = "embed";
                syncModeButtons();
                embedEditor.syncFieldHeights();
                onChange();
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "btn btn-outline-danger btn-sm w-100 console-delete-btn";
            deleteBtn.innerHTML = TRASH_ICON + " Delete console";
            deleteBtn.addEventListener("click", function () {
                if (consoleHasContent(consoleState)) {
                    pendingDeleteId = consoleState.id;
                    if (bsModal) {
                        bsModal.show();
                    } else if (window.confirm("Delete this console? It has content in it.")) {
                        removeById(consoleState.id);
                    }
                } else {
                    removeById(consoleState.id);
                }
            });
            cardBody.appendChild(deleteBtn);

            return {
                el: card,
                setViewMode(mode) {
                    textEditor.setViewMode(mode);
                    embedEditor.setViewMode(mode);
                },
                refresh() {
                    if (nameInput.value !== consoleState.namesRaw) nameInput.value = consoleState.namesRaw;
                    textEditor.refresh();
                    embedEditor.refresh();
                    syncModeButtons();
                },
                syncFieldHeights() {
                    textEditor.syncFieldHeights();
                    embedEditor.syncFieldHeights();
                }
            };
        }

        function render() {
            row.innerHTML = "";
            cardInstances = [];

            if (consolesArray.length === 0) {
                consolesArray.push(newConsole());
            }

            consolesArray.forEach(function (c) {
                const inst = buildCard(c);
                cardInstances.push(inst);
                row.appendChild(inst.el);
                inst.setViewMode(currentViewMode);
            });
        }

        render();

        return {
            el: root,
            setViewMode(mode) {
                currentViewMode = mode;
                cardInstances.forEach(function (inst) { inst.setViewMode(mode); });
            },
            refresh() {
                render();
            },
            syncFieldHeights() {
                cardInstances.forEach(function (inst) { inst.syncFieldHeights(); });
            }
        };
    }

    function buildJson(consolesArray) {
        const consoles = {};
        const consoleMaps = {};
        let hasAny = false;

        consolesArray.forEach(function (c) {
            const names = parseNames(c.namesRaw);
            if (names.length === 0) return;

            let content;
            if (c.mode === "text") {
                const t = (c.text || "").trim();
                if (!t) return;
                content = t;
            } else {
                const json = window.EmbedEditor.buildJson(c.embed);
                if (Object.keys(json).length === 0) return;
                content = json;
            }

            const key = names.length > 1 ? names[0] + "-" : names[0];
            consoles[key] = content;
            hasAny = true;
            if (names.length > 1) {
                consoleMaps[key] = names;
            }
        });

        if (!hasAny) return null;

        const result = { consoles: consoles };
        if (Object.keys(consoleMaps).length > 0) {
            result.consoleMaps = consoleMaps;
        }
        return result;
    }

    function resyncNextId(consolesArray) {
        let max = 0;
        (consolesArray || []).forEach(function (c) {
            if (typeof c.id === "number" && c.id > max) max = c.id;
        });
        nextId = max + 1;
    }

    function fromJson(payload) {
        const consolesObj = (payload && typeof payload.consoles === "object" && payload.consoles) || {};
        const maps = (payload && typeof payload.consoleMaps === "object" && payload.consoleMaps) || {};
        const result = [];

        Object.keys(consolesObj).forEach(function (key) {
            const content = consolesObj[key];
            const names = Array.isArray(maps[key]) && maps[key].length ? maps[key] : [key.replace(/-$/, "")];
            const c = newConsole();
            c.namesRaw = names.join(", ");

            if (typeof content === "string") {
                c.mode = "text";
                c.text = content;
            } else if (content && typeof content === "object") {
                c.mode = "embed";
                c.embed = window.EmbedEditor.fromJson(content);
            }
            result.push(c);
        });

        return result;
    }

    return { create, newConsole, buildJson, fromJson, resyncNextId };
})();
