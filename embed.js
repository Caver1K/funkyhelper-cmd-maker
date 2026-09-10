/* ---------------------------------------------------------------------- */
/* embed.js - reusable "Embed" mode editor + preview component            */
/* Used both by the top-level Embed mode and by each console's embed mode */
/* ---------------------------------------------------------------------- */

window.EmbedEditor = (function () {
    const LIMITS = { title: 256, description: 4096, author: 256 };
    const DEFAULT_COLOR_PLACEHOLDER = "2B2D31";

    function defaultState() {
        return {
            title: "",
            titleUrl: "",
            description: "",
            author: "",
            color: "",
            image: "",
            showTitleUrl: false,
            showColor: false,
            showImage: false,
            showAuthor: false
        };
    }

    function normalizeHex(value) {
        if (!value) return "";
        let v = value.trim().replace(/^#/, "").toUpperCase();
        if (/^[0-9A-F]{3}$/.test(v)) {
            v = v.split("").map(function (c) { return c + c; }).join("");
        }
        return /^[0-9A-F]{6}$/.test(v) ? v : "";
    }

    function isHttpUrl(value) {
        if (!value) return false;
        try {
            const u = new URL(value);
            return u.protocol === "http:" || u.protocol === "https:";
        } catch (e) {
            return false;
        }
    }

    function autoGrow(el) {
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
    }

    function svgIcon(pathData, size) {
        size = size || 14;
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
            '" fill="currentColor" viewBox="0 0 16 16">' + pathData + '</svg>';
    }

    const LINK_ICON = svgIcon('<path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9c-.086 0-.17.01-.25.031A2 2 0 0 1 7 10.5H4a2 2 0 1 1 0-4h1.535c.218-.376.495-.714.82-1z"/><path d="M9 5.5a3 3 0 0 0-2.83 4h1.098A2 2 0 0 1 9 6.5h3a2 2 0 1 1 0 4h-1.535a4.5 4.5 0 0 1-.82 1H12a3 3 0 1 0 0-6z"/>');
    const PLUS_ICON = svgIcon('<path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/>');
    const CLOSE_ICON = svgIcon('<path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>');

    function create(state, opts) {
        opts = opts || {};
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

        const embedWrapper = document.createElement("div");
        embedWrapper.className = "discord-embed-wrapper";
        messageBody.appendChild(embedWrapper);

        const embed = document.createElement("div");
        embed.className = "discord-embed";
        embedWrapper.appendChild(embed);

        const colorbar = document.createElement("div");
        colorbar.className = "discord-embed-colorbar";
        embed.appendChild(colorbar);

        const body = document.createElement("div");
        body.className = "discord-embed-body";
        embed.appendChild(body);

        function updateColorbar() {
            const hex = normalizeHex(state.color);
            colorbar.style.background = hex ? "#" + hex : "var(--discord-default-color)";
        }

        /* ---------------- generic collapsible sub-field row ---------------- */
        function makeSubfieldRow(label, placeholder, getValue, setValue, showFlagKey, isColor) {
            const row = document.createElement("div");
            row.className = "embed-subfield d-none";

            const labelEl = document.createElement("span");
            labelEl.className = "embed-subfield-label";
            labelEl.textContent = label;
            row.appendChild(labelEl);

            let colorPicker = null;
            if (isColor) {
                colorPicker = document.createElement("input");
                colorPicker.type = "color";
                colorPicker.className = "embed-color-swatch";
                row.appendChild(colorPicker);
            }

            const input = document.createElement("input");
            input.type = "text";
            input.className = "embed-input flex-grow-1";
            input.placeholder = placeholder;
            input.value = getValue() || "";
            row.appendChild(input);

            function sync() {
                const shown = !!state[showFlagKey];
                row.classList.toggle("d-none", !shown);
            }
            sync();

            input.addEventListener("input", function () {
                setValue(input.value);
                if (isColor) {
                    const hex = normalizeHex(input.value);
                    if (hex && colorPicker) colorPicker.value = "#" + hex;
                    updateColorbar();
                }
                onChange();
            });

            if (colorPicker) {
                colorPicker.value = "#" + (normalizeHex(getValue()) || DEFAULT_COLOR_PLACEHOLDER);
                colorPicker.addEventListener("input", function () {
                    const hex = colorPicker.value.replace("#", "").toUpperCase();
                    input.value = hex;
                    setValue(hex);
                    updateColorbar();
                    onChange();
                });
            }

            return { row, input, sync, colorPicker };
        }

        /* ---------------------------- author ---------------------------- */
        let editingMode = true;

        const authorRow = document.createElement("div");
        authorRow.className = "embed-author-row";
        body.appendChild(authorRow);

        const authorToggleBtn = document.createElement("button");
        authorToggleBtn.type = "button";
        authorToggleBtn.className = "embed-add-field-btn";
        authorToggleBtn.innerHTML = PLUS_ICON + "<span>Author</span>";
        authorRow.appendChild(authorToggleBtn);

        const authorInput = document.createElement("textarea");
        authorInput.rows = 1;
        authorInput.className = "embed-input author-input flex-grow-1";
        authorInput.placeholder = "Author name";
        authorInput.maxLength = LIMITS.author;
        authorInput.value = state.author || "";
        authorRow.appendChild(authorInput);

        const authorClearBtn = document.createElement("button");
        authorClearBtn.type = "button";
        authorClearBtn.className = "embed-icon-btn flex-shrink-0";
        authorClearBtn.title = "Remove author";
        authorClearBtn.innerHTML = CLOSE_ICON;
        authorRow.appendChild(authorClearBtn);

        const authorPreview = document.createElement("div");
        authorPreview.className = "discord-embed-author";
        authorPreview.style.display = "none";
        body.appendChild(authorPreview);

        function syncAuthorRow() {
            if (!editingMode) {
                authorToggleBtn.style.display = "none";
                authorInput.style.display = "none";
                authorClearBtn.style.display = "none";
                return;
            }
            const shown = !!state.showAuthor;
            authorToggleBtn.style.display = shown ? "none" : "";
            authorInput.style.display = shown ? "" : "none";
            authorClearBtn.style.display = shown ? "" : "none";
        }
        syncAuthorRow();

        authorToggleBtn.addEventListener("click", function () {
            state.showAuthor = true;
            syncAuthorRow();
            onChange();
            authorInput.focus();
        });

        authorClearBtn.addEventListener("click", function () {
            state.author = "";
            state.showAuthor = false;
            authorInput.value = "";
            syncAuthorRow();
            onChange();
        });

        authorInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") e.preventDefault();
        });

        authorInput.addEventListener("input", function () {
            if (/\r|\n/.test(authorInput.value)) authorInput.value = authorInput.value.replace(/\r?\n/g, " ");
            state.author = authorInput.value;
            autoGrow(authorInput);
            onChange();
        });

        /* ----------------------------- title ----------------------------- */
        const titleRow = document.createElement("div");
        titleRow.className = "embed-title-row";
        body.appendChild(titleRow);

        const titleInput = document.createElement("textarea");
        titleInput.rows = 1;
        titleInput.className = "embed-input title-input flex-grow-1";
        titleInput.placeholder = "Title";
        titleInput.maxLength = LIMITS.title;
        titleInput.value = state.title || "";
        titleRow.appendChild(titleInput);

        const titleLinkBtn = document.createElement("button");
        titleLinkBtn.type = "button";
        titleLinkBtn.className = "embed-icon-btn flex-shrink-0";
        titleLinkBtn.title = "Add title URL";
        titleLinkBtn.innerHTML = LINK_ICON;
        titleRow.appendChild(titleLinkBtn);

        const titlePreview = document.createElement("div");
        titlePreview.className = "discord-embed-title";
        titlePreview.style.display = "none";
        body.appendChild(titlePreview);

        const titleUrlField = makeSubfieldRow("URL", "url link...",
            function () { return state.titleUrl; },
            function (v) { state.titleUrl = v.trim(); },
            "showTitleUrl");
        body.appendChild(titleUrlField.row);

        titleLinkBtn.addEventListener("click", function () {
            state.showTitleUrl = !state.showTitleUrl;
            titleLinkBtn.classList.toggle("active", state.showTitleUrl);
            titleUrlField.sync();
            onChange();
        });
        titleLinkBtn.classList.toggle("active", !!state.showTitleUrl);

        titleInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") e.preventDefault();
        });

        titleInput.addEventListener("input", function () {
            if (/\r|\n/.test(titleInput.value)) titleInput.value = titleInput.value.replace(/\r?\n/g, " ");
            state.title = titleInput.value;
            autoGrow(titleInput);
            onChange();
        });

        /* -------------------------- description -------------------------- */
        const descTextarea = document.createElement("textarea");
        descTextarea.className = "embed-input description-input";
        descTextarea.rows = 1;
        descTextarea.placeholder = "Message here";
        descTextarea.maxLength = LIMITS.description;
        descTextarea.value = state.description || "";
        body.appendChild(descTextarea);

        const descPreview = document.createElement("div");
        descPreview.className = "discord-embed-description";
        descPreview.style.display = "none";
        body.appendChild(descPreview);

        const descLimitLabel = document.createElement("div");
        descLimitLabel.className = "field-limit text-end";
        body.appendChild(descLimitLabel);

        function updateDescLimitLabel() {
            const len = (state.description || "").length;
            descLimitLabel.textContent = len + " / " + LIMITS.description;
            descLimitLabel.classList.toggle("limit-exceeded", len > LIMITS.description);
        }
        updateDescLimitLabel();

        descTextarea.addEventListener("input", function () {
            state.description = descTextarea.value;
            updateDescLimitLabel();
            autoGrow(descTextarea);
            onChange();
        });

        /* --------------------------- image preview ------------------------- */
        const imageEl = document.createElement("img");
        imageEl.className = "discord-embed-image";
        imageEl.alt = "";
        imageEl.style.display = "none";
        body.appendChild(imageEl);

        function updateImage() {
            const url = (state.image || "").trim();
            if (url && isHttpUrl(url)) {
                imageEl.src = url;
                imageEl.style.display = "block";
            } else {
                imageEl.removeAttribute("src");
                imageEl.style.display = "none";
            }
        }

        /* --------------------------- tools row (color / image) --------------------------- */
        const toolsRow = document.createElement("div");
        toolsRow.className = "d-flex align-items-center gap-3 mt-3 flex-wrap";
        body.appendChild(toolsRow);

        const colorToggleWrap = document.createElement("div");
        colorToggleWrap.className = "d-flex align-items-center gap-1";
        const colorToggleBtn = document.createElement("button");
        colorToggleBtn.type = "button";
        colorToggleBtn.className = "embed-icon-btn";
        colorToggleBtn.title = "Set embed color";
        colorToggleBtn.innerHTML = PLUS_ICON;
        colorToggleWrap.appendChild(colorToggleBtn);
        const colorToggleLabel = document.createElement("span");
        colorToggleLabel.className = "field-limit";
        colorToggleLabel.textContent = "Color";
        colorToggleWrap.appendChild(colorToggleLabel);
        toolsRow.appendChild(colorToggleWrap);

        const imageToggleWrap = document.createElement("div");
        imageToggleWrap.className = "d-flex align-items-center gap-1";
        const imageToggleBtn = document.createElement("button");
        imageToggleBtn.type = "button";
        imageToggleBtn.className = "embed-icon-btn";
        imageToggleBtn.title = "Set embed image";
        imageToggleBtn.innerHTML = PLUS_ICON;
        imageToggleWrap.appendChild(imageToggleBtn);
        const imageToggleLabel = document.createElement("span");
        imageToggleLabel.className = "field-limit";
        imageToggleLabel.textContent = "Image";
        imageToggleWrap.appendChild(imageToggleLabel);
        toolsRow.appendChild(imageToggleWrap);

        const colorField = makeSubfieldRow("Color", DEFAULT_COLOR_PLACEHOLDER,
            function () { return state.color; },
            function (v) { state.color = v.trim(); },
            "showColor", true);
        body.appendChild(colorField.row);

        const imageField = makeSubfieldRow("Image", "image link...",
            function () { return state.image; },
            function (v) { state.image = v.trim(); updateImage(); },
            "showImage");
        body.appendChild(imageField.row);

        colorToggleBtn.addEventListener("click", function () {
            state.showColor = !state.showColor;
            colorToggleBtn.classList.toggle("active", state.showColor);
            colorField.sync();
            onChange();
        });
        colorToggleBtn.classList.toggle("active", !!state.showColor);

        imageToggleBtn.addEventListener("click", function () {
            state.showImage = !state.showImage;
            imageToggleBtn.classList.toggle("active", state.showImage);
            imageField.sync();
            onChange();
        });
        imageToggleBtn.classList.toggle("active", !!state.showImage);

        /* ----------------------------- rendering ----------------------------- */
        function renderPreview() {
            // author
            authorPreview.innerHTML = "";
            const authorText = (state.author || "").trim();
            if (authorText) {
                const span = document.createElement("span");
                span.textContent = authorText;
                authorPreview.appendChild(span);
                authorPreview.style.display = "flex";
            } else {
                authorPreview.style.display = "none";
            }

            // title
            const titleText = (state.title || "").trim();
            if (titleText) {
                const hasUrl = isHttpUrl(state.titleUrl);
                titlePreview.textContent = titleText;
                titlePreview.classList.toggle("has-link", hasUrl);
                if (hasUrl) {
                    titlePreview.onclick = function () {
                        window.open(state.titleUrl, "_blank", "noopener,noreferrer");
                    };
                } else {
                    titlePreview.onclick = null;
                }
                titlePreview.style.display = "block";
            } else {
                titlePreview.style.display = "none";
            }

            // description
            const descText = state.description || "";
            descPreview.innerHTML = descText ? window.DiscordMarkdown.render(descText) : "";
            descPreview.style.display = descText ? "block" : "none";

            updateImage();
            updateColorbar();
        }

        function syncFieldHeights() {
            autoGrow(authorInput);
            autoGrow(titleInput);
            autoGrow(descTextarea);
        }

        updateColorbar();
        updateImage();

        return {
            el: root,
            setViewMode(mode) {
                editingMode = mode !== "preview";
                const editing = editingMode;
                authorPreview.style.display = editing ? "none" : "";
                titleInput.style.display = editing ? "" : "none";
                titleLinkBtn.style.display = editing ? "" : "none";
                descTextarea.style.display = editing ? "" : "none";
                descLimitLabel.style.display = editing ? "" : "none";

                if (editing) {
                    titlePreview.style.display = "none";
                    descPreview.style.display = "none";
                    titleUrlField.sync();
                    colorField.sync();
                    imageField.sync();
                    syncFieldHeights();
                } else {
                    titleUrlField.row.classList.add("d-none");
                    colorField.row.classList.add("d-none");
                    imageField.row.classList.add("d-none");
                    renderPreview();
                }
                syncAuthorRow();
                updateColorbar();
                updateImage();
            },
            refresh() {
                authorInput.value = state.author || "";
                titleInput.value = state.title || "";
                descTextarea.value = state.description || "";
                titleUrlField.input.value = state.titleUrl || "";
                colorField.input.value = state.color || "";
                imageField.input.value = state.image || "";
                if (colorField.colorPicker) {
                    colorField.colorPicker.value = "#" + (normalizeHex(state.color) || DEFAULT_COLOR_PLACEHOLDER);
                }
                titleLinkBtn.classList.toggle("active", !!state.showTitleUrl);
                colorToggleBtn.classList.toggle("active", !!state.showColor);
                imageToggleBtn.classList.toggle("active", !!state.showImage);
                titleUrlField.sync();
                colorField.sync();
                imageField.sync();
                syncAuthorRow();
                updateDescLimitLabel();
                updateColorbar();
                updateImage();
                syncFieldHeights();
            },
            syncFieldHeights: syncFieldHeights
        };
    }

    function buildJson(state) {
        const obj = {};
        const title = (state.title || "").trim();
        const description = (state.description || "").trim();
        const color = normalizeHex(state.color);
        const url = isHttpUrl(state.titleUrl) ? state.titleUrl.trim() : "";
        const image = isHttpUrl(state.image) ? state.image.trim() : "";
        const author = (state.author || "").trim();

        if (title) obj.title = title;
        if (description) obj.description = description;
        if (color) obj.color = color;
        if (url) obj.url = url;
        if (image) obj.image = image;
        if (author) obj.author = author;
        return obj;
    }

    function isEmpty(state) {
        return !(state.title || state.description || state.author ||
            state.color || state.image || state.titleUrl);
    }

    function fromJson(json) {
        const st = defaultState();
        json = json && typeof json === "object" ? json : {};
        if (typeof json.title === "string") st.title = json.title;
        if (typeof json.description === "string") st.description = json.description;
        if (typeof json.color === "string" && normalizeHex(json.color)) {
            st.color = normalizeHex(json.color);
            st.showColor = true;
        }
        if (typeof json.url === "string" && isHttpUrl(json.url)) {
            st.titleUrl = json.url;
            st.showTitleUrl = true;
        }
        if (typeof json.image === "string" && isHttpUrl(json.image)) {
            st.image = json.image;
            st.showImage = true;
        }
        if (typeof json.author === "string" && json.author) {
            st.author = json.author;
            st.showAuthor = true;
        }
        return st;
    }

    return { create, defaultState, buildJson, fromJson, isEmpty, normalizeHex, isHttpUrl, LIMITS };
})();
