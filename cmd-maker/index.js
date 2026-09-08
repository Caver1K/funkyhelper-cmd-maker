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
        const name = (state.commandName || "").trim() || "Command_Name";
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

    /* ---------------------------- DOM wiring ---------------------------- */

    document.addEventListener("DOMContentLoaded", function () {
        loadDraft();

        const commandNameInput = document.getElementById("commandNameInput");
        const viewModeToggleBtn = document.getElementById("viewModeToggleBtn");
        const outputText = document.getElementById("outputText");
        const outputError = document.getElementById("outputError");
        const outputCharCount = document.getElementById("outputCharCount");
        const downloadBtn = document.getElementById("downloadBtn");
        const copyBtn = document.getElementById("copyBtn");
        const modeTextBtn = document.getElementById("modeTextBtn");
        const modeEmbedBtn = document.getElementById("modeEmbedBtn");
        const modeConsolesBtn = document.getElementById("modeConsolesBtn");
        const panelText = document.getElementById("panel-text");
        const panelEmbed = document.getElementById("panel-embed");
        const panelConsoles = document.getElementById("panel-consoles");
        const copyToastEl = document.getElementById("copyToast");
        const copyToast = window.bootstrap ? new window.bootstrap.Toast(copyToastEl) : null;

        commandNameInput.value = state.commandName;

        function updateOutput() {
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
        }

        modeTextBtn.addEventListener("click", function () { state.mode = "text"; applyMode(); handleChange(); });
        modeEmbedBtn.addEventListener("click", function () { state.mode = "embed"; applyMode(); handleChange(); });
        modeConsolesBtn.addEventListener("click", function () { state.mode = "consoles"; applyMode(); handleChange(); });

        /* --------------------------- command name --------------------------- */

        commandNameInput.addEventListener("input", function () {
            state.commandName = commandNameInput.value;
            handleChange();
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
                if (copyToast) copyToast.show();
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
