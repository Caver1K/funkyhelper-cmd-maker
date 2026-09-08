/* ---------------------------------------------------------------------- */
/* plaintext.js - reusable "Text" mode editor component                   */
/* Used both by the top-level Text mode and by each console's text mode.  */
/* ---------------------------------------------------------------------- */

window.PlaintextEditor = (function () {
    const DEFAULT_LIMIT = 4096;

    function create(state, opts) {
        opts = opts || {};
        const limit = opts.limit || DEFAULT_LIMIT;
        const placeholder = opts.placeholder || "Type message here...";
        const onChange = opts.onChange || function () {};

        const wrap = document.createElement("div");
        wrap.className = "plaintext-editor d-flex flex-column";

        const textarea = document.createElement("textarea");
        textarea.className = "plaintext-textarea";
        textarea.placeholder = placeholder;
        textarea.maxLength = limit;
        textarea.value = state.text || "";

        const preview = document.createElement("div");
        preview.className = "plaintext-preview";
        preview.style.display = "none";

        const limitLabel = document.createElement("div");
        limitLabel.className = "field-limit text-end mt-1";

        function updateLimitLabel() {
            const len = (state.text || "").length;
            limitLabel.textContent = len + " / " + limit;
            limitLabel.classList.toggle("limit-exceeded", len > limit);
        }

        textarea.addEventListener("input", function () {
            state.text = textarea.value;
            updateLimitLabel();
            onChange();
        });

        function renderPreview() {
            preview.innerHTML = state.text
                ? window.DiscordMarkdown.render(state.text)
                : "";
        }

        updateLimitLabel();

        wrap.appendChild(textarea);
        wrap.appendChild(preview);
        wrap.appendChild(limitLabel);

        return {
            el: wrap,
            setViewMode(mode) {
                if (mode === "preview") {
                    renderPreview();
                    textarea.style.display = "none";
                    preview.style.display = "block";
                } else {
                    textarea.style.display = "block";
                    preview.style.display = "none";
                }
            },
            refresh() {
                if (textarea.value !== (state.text || "")) {
                    textarea.value = state.text || "";
                }
                updateLimitLabel();
            }
        };
    }

    return { create };
})();
