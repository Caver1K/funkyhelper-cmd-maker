/* ---------------------------------------------------------------------- */
/* index.js - main site logic: Discord markdown rendering, app state,     */
/* output/JSON building, download/copy, mode & preview switching.         */
/* ---------------------------------------------------------------------- */

/* ============================== Markdown ============================= */
/* A small renderer for Discord's message formatting syntax, used by the  */
/* Text, Embed and Consoles preview modes.                                */

window.DiscordMarkdown = (function () {
    function escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function applyInlineFormatting(text) {
        // spoilers: ||text||
        text = text.replace(/\|\|([\s\S]+?)\|\|/g,
            '<span class="dc-spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');
        // bold italic: ***text***
        text = text.replace(/\*\*\*([\s\S]+?)\*\*\*/g, "<b><i>$1</i></b>");
        // bold: **text**
        text = text.replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>");
        // underline: __text__
        text = text.replace(/__([\s\S]+?)__/g, "<u>$1</u>");
        // strikethrough: ~~text~~
        text = text.replace(/~~([\s\S]+?)~~/g, "<s>$1</s>");
        // italic: *text*
        text = text.replace(/\*([^*\n]+?)\*/g, "<i>$1</i>");
        // italic: _text_ (avoid matching inside snake_case words)
        text = text.replace(/(^|[^\w])_([^_\n]+?)_(?!\w)/g, "$1<i>$2</i>");
        return text;
    }

    function render(raw) {
        if (raw === null || raw === undefined || raw === "") return "";
        let text = escapeHtml(String(raw));

        // 1. fenced code blocks -- kept verbatim, no further markdown applied
        const codeBlocks = [];
        text = text.replace(/```(?:[a-zA-Z0-9_+-]*\n)?([\s\S]*?)```/g, function (m, code) {
            const idx = codeBlocks.push(code.replace(/\n$/, "")) - 1;
            return "CB" + idx + "";
        });

        // 2. inline code spans -- kept verbatim
        const inlineCodes = [];
        text = text.replace(/`([^`\n]+)`/g, function (m, code) {
            const idx = inlineCodes.push(code) - 1;
            return "IC" + idx + "";
        });

        // 3. masked links [label](url) -- label may still contain formatting
        const links = [];
        text = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, function (m, label, href) {
            const idx = links.push({ label: applyInlineFormatting(label), href: href }) - 1;
            return "LK" + idx + "";
        });

        // 4. remaining inline formatting (bold/italic/underline/strike/spoiler)
        text = applyInlineFormatting(text);

        // 5. line-based block elements: headers, block quotes, lists
        const lines = text.split("\n");
        const htmlLines = [];
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];

            // multi-line block quote: >>> quotes everything after it
            if (/^&gt;&gt;&gt; ?/.test(line)) {
                const rest = lines.slice(i).join("\n").replace(/^&gt;&gt;&gt; ?/, "");
                htmlLines.push('<blockquote class="dc-blockquote">' + rest.replace(/\n/g, "<br>") + '</blockquote>');
                i = lines.length;
                break;
            }

            const headerMatch = line.match(/^(#{1,3}) (.*)$/);
            if (headerMatch) {
                htmlLines.push('<div class="dc-h' + headerMatch[1].length + '">' + headerMatch[2] + '</div>');
                i++;
                continue;
            }

            if (/^-# (.*)$/.test(line)) {
                htmlLines.push('<div class="text-secondary small">' + line.replace(/^-# /, "") + '</div>');
                i++;
                continue;
            }

            if (/^&gt; ?/.test(line)) {
                const quoteLines = [];
                while (i < lines.length && /^&gt; ?/.test(lines[i])) {
                    quoteLines.push(lines[i].replace(/^&gt; ?/, ""));
                    i++;
                }
                htmlLines.push('<blockquote class="dc-blockquote">' + quoteLines.join("<br>") + '</blockquote>');
                continue;
            }

            if (/^(-|\*) (.*)$/.test(line)) {
                const items = [];
                while (i < lines.length && /^(-|\*) (.*)$/.test(lines[i])) {
                    items.push("<li>" + lines[i].replace(/^(-|\*) /, "") + "</li>");
                    i++;
                }
                htmlLines.push('<ul class="dc-list">' + items.join("") + "</ul>");
                continue;
            }

            if (/^\d+\. (.*)$/.test(line)) {
                const items = [];
                while (i < lines.length && /^\d+\. (.*)$/.test(lines[i])) {
                    items.push("<li>" + lines[i].replace(/^\d+\. /, "") + "</li>");
                    i++;
                }
                htmlLines.push('<ol class="dc-list">' + items.join("") + "</ol>");
                continue;
            }

            htmlLines.push(line);
            i++;
        }

        let html = htmlLines.join("<br>");

        // 6. restore placeholders (deepest/innermost first: links, then code)
        html = html.replace(/LK(\d+)/g, function (m, idx) {
            const l = links[Number(idx)];
            return '<a class="dc-link" target="_blank" rel="noopener noreferrer" href="' +
                l.href.replace(/"/g, "&quot;") + '">' + l.label + "</a>";
        });
        html = html.replace(/IC(\d+)/g, function (m, idx) {
            return '<code class="dc-inline-code">' + inlineCodes[Number(idx)] + "</code>";
        });
        html = html.replace(/CB(\d+)/g, function (m, idx) {
            return '<pre class="dc-code-block">' + codeBlocks[Number(idx)] + "</pre>";
        });

        return html;
    }

    return { render, escapeHtml };
})();

/* ================================ App ================================= */

(function () {
    const STORAGE_KEY = "funkyhelper-cmd-maker-draft";
    const IMPORT_TOAST_KEY = "funkyhelper-cmd-maker-import-toast";
    const OUTPUT_LIMIT = 4096;

    function defaultState() {
        return {
            commandName: "",
            mode: "text",
            viewMode: "edit",
            plaintext: { text: "" },
            embed: window.EmbedEditor.defaultState(),
            consoles: []
        };
    }

    let state = defaultState();

    function loadDraft() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return;
            state = Object.assign(defaultState(), parsed);
            state.embed = Object.assign(window.EmbedEditor.defaultState(), parsed.embed || {});
            state.plaintext = Object.assign({ text: "" }, parsed.plaintext || {});
            state.consoles = Array.isArray(parsed.consoles) ? parsed.consoles.map(function (c) {
                return Object.assign(window.ConsolesEditor.newConsole(), c, {
                    embed: Object.assign(window.EmbedEditor.defaultState(), c.embed || {})
                });
            }) : [];
            window.ConsolesEditor.resyncNextId(state.consoles);
        } catch (e) {
            console.warn("Could not load saved draft, starting fresh.", e);
        }
    }

    function saveDraft() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            /* storage unavailable / full - draft simply won't persist */
        }
    }

    function sanitizeFilename(name) {
        const trimmed = (name || "").trim() || "Command_Name";
        const cleaned = trimmed.replace(/[^a-zA-Z0-9_\-]+/g, "_").replace(/^_+|_+$/g, "");
        return cleaned || "Command_Name";
    }

    function buildEmbedPayload() {
        return window.EmbedEditor.buildJson(state.embed);
    }

    function buildConsolesPayload() {
        return window.ConsolesEditor.buildJson(state.consoles) || { consoles: {} };
    }

    /** Full live ".create" command line shown in the output box. */
    function buildCommandText() {
        const name = (state.commandName || "").trim();
        if (!name) return "";
        if (state.mode === "text") {
            return ".create " + name + " " + (state.plaintext.text || "");
        }
        if (state.mode === "embed") {
            return ".create " + name + " `" + JSON.stringify(buildEmbedPayload()) + "`";
        }
        return ".create " + name + " `" + JSON.stringify(buildConsolesPayload()) + "`";
    }

    /** What actually gets written into the downloaded .botcmd file. */
    function buildDownloadContent() {
        if (state.mode === "text") {
            return state.plaintext.text || "";
        }
        if (state.mode === "embed") {
            return "`" + JSON.stringify(buildEmbedPayload()) + "`";
        }
        return "`" + JSON.stringify(buildConsolesPayload()) + "`";
    }

    /* ------------------------------ import ------------------------------- */
    /* Parses pasted/uploaded content back into command name + mode/payload. */
    /* Accepts: a bare backtick-wrapped JSON payload, plain text, or a full  */
    /* ".create Name `...`" / ".create Name plain text" command line.       */

    function parsePayload(payload) {
        const trimmed = (payload || "").trim();
        if (trimmed.length >= 2 && trimmed.charAt(0) === "`" && trimmed.charAt(trimmed.length - 1) === "`") {
            const inner = trimmed.slice(1, -1);
            try {
                const json = JSON.parse(inner);
                if (json && typeof json === "object" && !Array.isArray(json)) {
                    if (json.consoles && typeof json.consoles === "object") {
                        return { kind: "consoles", value: json };
                    }
                    return { kind: "embed", value: json };
                }
            } catch (e) { /* not valid JSON - fall back to plain text below */ }
            return { kind: "text", value: inner };
        }
        return { kind: "text", value: payload || "" };
    }

    function parseImportedText(raw) {
        const text = (raw || "").replace(/\r\n/g, "\n");
        const match = text.match(/^\s*\.create\s+(\S+)\s*([\s\S]*)$/i);
        if (match) {
            return { name: match[1], parsed: parsePayload(match[2]) };
        }
        return { name: null, parsed: parsePayload(text) };
    }

    /* ---------------------------- DOM wiring ---------------------------- */

    document.addEventListener("DOMContentLoaded", function () {
        loadDraft();

        const commandNameInput = document.getElementById("commandNameInput");
        const viewModeToggleBtn = document.getElementById("viewModeToggleBtn");
        const outputText = document.getElementById("outputText");
        const outputPanel = document.getElementById("outputPanel");
        const outputError = document.getElementById("outputError");
        const outputCharCount = document.getElementById("outputCharCount");
        const downloadBtn = document.getElementById("downloadBtn");
        const copyBtn = document.getElementById("copyBtn");
        const uploadBtn = document.getElementById("uploadBtn");
        const pasteBtn = document.getElementById("pasteBtn");
        const uploadFileInput = document.getElementById("uploadFileInput");
        const modeTextBtn = document.getElementById("modeTextBtn");
        const modeEmbedBtn = document.getElementById("modeEmbedBtn");
        const modeConsolesBtn = document.getElementById("modeConsolesBtn");
        const panelText = document.getElementById("panel-text");
        const panelEmbed = document.getElementById("panel-embed");
        const panelConsoles = document.getElementById("panel-consoles");
        const appToastEl = document.getElementById("appToast");
        const appToastBody = document.getElementById("appToastBody");
        const appToast = window.bootstrap ? new window.bootstrap.Toast(appToastEl) : null;

        function showToast(message, variant) {
            appToastEl.classList.remove("text-bg-success", "text-bg-danger");
            appToastEl.classList.add(variant === "error" ? "text-bg-danger" : "text-bg-success");
            appToastBody.textContent = message;
            if (appToast) appToast.show();
        }

        try {
            const pendingToast = sessionStorage.getItem(IMPORT_TOAST_KEY);
            if (pendingToast) {
                sessionStorage.removeItem(IMPORT_TOAST_KEY);
                showToast(pendingToast);
            }
        } catch (e) { /* sessionStorage unavailable - no toast, no harm */ }

        commandNameInput.value = state.commandName;

        function updateOutput() {
            const hasName = !!(state.commandName || "").trim();
            commandNameInput.classList.toggle("is-missing", !hasName);

            const text = buildCommandText();
            outputCharCount.textContent = text.length + " / " + OUTPUT_LIMIT;
            outputCharCount.classList.toggle("limit-exceeded", text.length > OUTPUT_LIMIT);

            if (text.length > OUTPUT_LIMIT) {
                outputText.textContent = "";
                outputError.classList.remove("d-none");
            } else {
                outputText.textContent = text;
                outputError.classList.add("d-none");
            }

            downloadBtn.disabled = !hasName;
            copyBtn.disabled = !hasName;
        }

        function handleChange() {
            updateOutput();
            saveDraft();
        }

        /* ------------------------- editor instances ------------------------ */

        function wrapInCard(el, extraClass) {
            const card = document.createElement("div");
            card.className = "card bg-body-tertiary editor-card" + (extraClass ? " " + extraClass : "");
            const body = document.createElement("div");
            body.className = "editor-surface";
            body.appendChild(el);
            card.appendChild(body);
            return card;
        }

        const textEditor = window.PlaintextEditor.create(state.plaintext, {
            limit: OUTPUT_LIMIT,
            placeholder: "Type message here...",
            onChange: handleChange
        });
        panelText.appendChild(wrapInCard(textEditor.el));

        const embedEditor = window.EmbedEditor.create(state.embed, { onChange: handleChange });
        panelEmbed.appendChild(wrapInCard(embedEditor.el, "align-items-center"));

        const consolesEditor = window.ConsolesEditor.create(state.consoles, { onChange: handleChange });
        panelConsoles.appendChild(consolesEditor.el);

        const editors = [textEditor, embedEditor, consolesEditor];

        /* ---------------------------- view mode ---------------------------- */

        function applyViewMode() {
            viewModeToggleBtn.textContent = state.viewMode === "edit" ? "Preview" : "Edit";
            editors.forEach(function (ed) { ed.setViewMode(state.viewMode); });
        }

        viewModeToggleBtn.addEventListener("click", function () {
            state.viewMode = state.viewMode === "edit" ? "preview" : "edit";
            applyViewMode();
            saveDraft();
        });

        /* ------------------------------ mode -------------------------------- */

        function applyMode() {
            panelText.classList.toggle("active", state.mode === "text");
            panelEmbed.classList.toggle("active", state.mode === "embed");
            panelConsoles.classList.toggle("active", state.mode === "consoles");
            modeTextBtn.classList.toggle("active", state.mode === "text");
            modeEmbedBtn.classList.toggle("active", state.mode === "embed");
            modeConsolesBtn.classList.toggle("active", state.mode === "consoles");
            if (state.mode === "text") textEditor.syncFieldHeights();
            if (state.mode === "embed") embedEditor.syncFieldHeights();
            if (state.mode === "consoles") consolesEditor.syncFieldHeights();
        }

        modeTextBtn.addEventListener("click", function () { state.mode = "text"; applyMode(); handleChange(); });
        modeEmbedBtn.addEventListener("click", function () { state.mode = "embed"; applyMode(); handleChange(); });
        modeConsolesBtn.addEventListener("click", function () {
            // Carry an in-progress Embed-tab draft over into Consoles mode instead
            // of silently losing it, as long as no console has been started yet.
            const noConsolesYet = state.consoles.length === 0;
            if (noConsolesYet && !window.EmbedEditor.isEmpty(state.embed)) {
                const carried = window.ConsolesEditor.newConsole();
                carried.mode = "embed";
                carried.embed = Object.assign(window.EmbedEditor.defaultState(), state.embed);
                state.consoles.push(carried);
                consolesEditor.refresh();
            }
            state.mode = "consoles";
            applyMode();
            handleChange();
        });

        /* --------------------------- command name --------------------------- */

        commandNameInput.addEventListener("input", function () {
            state.commandName = commandNameInput.value;
            handleChange();
        });

        /* ------------------------------ import -------------------------------- */

        function applyImport(raw) {
            if (!(raw || "").trim()) {
                showToast("Nothing to import.", "error");
                return;
            }

            const result = parseImportedText(raw);

            if (result.name) {
                state.commandName = result.name;
                commandNameInput.value = result.name;
            }

            let importedAs = "";
            if (result.parsed.kind === "embed") {
                state.mode = "embed";
                const freshEmbed = result.parsed.value && Object.keys(result.parsed.value).length
                    ? window.EmbedEditor.fromJson(result.parsed.value)
                    : window.EmbedEditor.defaultState();
                Object.keys(state.embed).forEach(function (k) { delete state.embed[k]; });
                Object.assign(state.embed, freshEmbed);
                importedAs = "an Embed";
            } else if (result.parsed.kind === "consoles") {
                state.mode = "consoles";
                const freshConsoles = window.ConsolesEditor.fromJson(result.parsed.value);
                state.consoles.length = 0;
                freshConsoles.forEach(function (c) { state.consoles.push(c); });
                window.ConsolesEditor.resyncNextId(state.consoles);
                importedAs = "Consoles";
            } else {
                state.mode = "text";
                state.plaintext.text = result.parsed.value;
                importedAs = "Text";
            }

            saveDraft();

            // Reload so every editor (including nested console cards) is rebuilt
            // fresh from the saved draft instead of trying to patch live state.
            try {
                sessionStorage.setItem(IMPORT_TOAST_KEY, "Imported as " + importedAs + ".");
            } catch (e) { /* storage unavailable - toast just won't survive the reload */ }
            window.location.reload();
        }

        function readAndImportFile(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function () { applyImport(String(reader.result || "")); };
            reader.onerror = function () { showToast("Could not read that file.", "error"); };
            reader.readAsText(file);
        }

        uploadBtn.addEventListener("click", function () {
            uploadFileInput.click();
        });

        uploadFileInput.addEventListener("change", function () {
            const file = uploadFileInput.files && uploadFileInput.files[0];
            uploadFileInput.value = "";
            readAndImportFile(file);
        });

        /* --------------------------- drag & drop ----------------------------- */

        function dragHasFiles(e) {
            return !!(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1);
        }

        let dragDepth = 0;

        outputPanel.addEventListener("dragenter", function (e) {
            if (!dragHasFiles(e)) return;
            e.preventDefault();
            dragDepth++;
            outputPanel.classList.add("drag-active");
        });

        outputPanel.addEventListener("dragover", function (e) {
            if (!dragHasFiles(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        });

        outputPanel.addEventListener("dragleave", function (e) {
            if (!dragHasFiles(e)) return;
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) outputPanel.classList.remove("drag-active");
        });

        outputPanel.addEventListener("drop", function (e) {
            if (!dragHasFiles(e)) return;
            e.preventDefault();
            dragDepth = 0;
            outputPanel.classList.remove("drag-active");
            const file = e.dataTransfer.files && e.dataTransfer.files[0];
            readAndImportFile(file);
        });

        // Stop a stray drop elsewhere on the page from navigating away to the file.
        ["dragover", "drop"].forEach(function (evt) {
            document.addEventListener(evt, function (e) {
                if (dragHasFiles(e)) e.preventDefault();
            });
        });

        pasteBtn.addEventListener("click", function () {
            if (!(navigator.clipboard && navigator.clipboard.readText)) {
                showToast("Clipboard access isn't available in this browser.", "error");
                return;
            }
            navigator.clipboard.readText().then(function (text) {
                applyImport(text);
            }).catch(function () {
                showToast("Couldn't read the clipboard. Check browser permissions.", "error");
            });
        });

        /* ------------------------------ output ------------------------------- */

        downloadBtn.addEventListener("click", function () {
            const content = buildDownloadContent();
            const filename = sanitizeFilename(state.commandName) + ".botcmd";
            const blob = new Blob([content], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        });

        copyBtn.addEventListener("click", function () {
            const text = buildCommandText();
            const done = function () {
                showToast("Copied to clipboard!");
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(function () {
                    fallbackCopy(text);
                    done();
                });
            } else {
                fallbackCopy(text);
                done();
            }
        });

        function fallbackCopy(text) {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy"); } catch (e) { /* ignore */ }
            document.body.removeChild(ta);
        }

        /* ------------------------------- init -------------------------------- */

        applyMode();
        applyViewMode();
        updateOutput();
    });
})();
