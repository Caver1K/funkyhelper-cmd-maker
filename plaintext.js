/* ---------------------------------------------------------------------- */
/* plaintext.js - reusable "Text" mode editor component                   */
/* Used both by the top-level Text mode and by each console's text mode.  */
/* ---------------------------------------------------------------------- */

window.PlaintextEditor = (function () {
    const DEFAULT_LIMIT = 4096;

    function autoGrow(el) {
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
    }

    function create(state, opts) {
        opts = opts || {};
        const limit = opts.limit || DEFAULT_LIMIT;
        const placeholder = opts.placeholder || "Type message here...";
        const onChange = opts.onChange || function () {};

        const root = document.createElement("div");
        root.className = "discord-message";

        const avatar = document.createElement("img");
        avatar.className = "discord-message-avatar";
        avatar.src = "vendor/profile-picture.png";
        avatar.alt = "";
        root.appendChild(avatar);

        const messageBody = document.createElement("div");
        messageBody.className = "discord-message-body";
        root.appendChild(messageBody);

        const messageHeader = document.createElement("div");
        messageHeader.className = "discord-message-header";
        messageBody.appendChild(messageHeader);

        const username = document.createElement("span");
        username.className = "discord-message-username";
        username.textContent = "FunkyHelper";
        messageHeader.appendChild(username);

        const appBadge = document.createElement("span");
        appBadge.className = "discord-app-badge";
        appBadge.textContent = "APP";
        messageHeader.appendChild(appBadge);

        const textarea = document.createElement("textarea");
        textarea.className = "plaintext-textarea discord-message-content";
        textarea.rows = 1;
        textarea.placeholder = placeholder;
        textarea.maxLength = limit;
        textarea.value = state.text || "";
        messageBody.appendChild(textarea);

        const preview = document.createElement("div");
        preview.className = "plaintext-preview discord-message-content";
        preview.style.display = "none";
        messageBody.appendChild(preview);

        const limitLabel = document.createElement("div");
        limitLabel.className = "field-limit text-end mt-1";
        messageBody.appendChild(limitLabel);

        function updateLimitLabel() {
            const len = (state.text || "").length;
            limitLabel.textContent = len + " / " + limit;
            limitLabel.classList.toggle("limit-exceeded", len > limit);
        }

        textarea.addEventListener("input", function () {
            state.text = textarea.value;
            updateLimitLabel();
            autoGrow(textarea);
            onChange();
        });

        function renderPreview() {
            preview.innerHTML = state.text
                ? window.DiscordMarkdown.render(state.text)
                : "";
        }

        updateLimitLabel();

        return {
            el: root,
            setViewMode(mode) {
                if (mode === "preview") {
                    renderPreview();
                    textarea.style.display = "none";
                    preview.style.display = "block";
                } else {
                    textarea.style.display = "block";
                    preview.style.display = "none";
                    autoGrow(textarea);
                }
            },
            refresh() {
                if (textarea.value !== (state.text || "")) {
                    textarea.value = state.text || "";
                }
                updateLimitLabel();
                autoGrow(textarea);
                if (preview.style.display !== "none") {
                    renderPreview();
                }
            },
            syncFieldHeights() {
                autoGrow(textarea);
            }
        };
    }

    return { create };
})();
