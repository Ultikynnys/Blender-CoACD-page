# Blender CoACD Landing Page

## TOML Configuration Overview
The landing page content is driven entirely by TOML configuration files loaded at runtime by `script.js`. Each page variant points to a different TOML file:

- `content.toml` - default CoACD landing page (used when no `page` query parameter is provided or `?page=coacd`).
- `content2.toml` - UltiBridge for Unity variant (`?page=unity`).
- `content3.toml` - UltiBridge for Unreal Engine variant (`?page=unreal`).

`script.js` determines which configuration to load in this order:

1. Global `window.CONTENT_TOML_URL` (if set before the script runs).
2. `data-toml` attribute on the `<body>` tag.
3. `toml`, `page`, or `config` query parameters appended to the URL.
4. Fallback to `content.toml`.

## Common Sections
Each TOML file contains the same major sections that populate the HTML structure in `index.html`:

- **`[site]`**: Page title, banner image, and research/documentation link settings. Setting `research_link_enabled = false` hides the button.
- **`[theme_colors]`**: Overrides for the CSS variables applied to headers, buttons, and generated shapes.
- **`[meta]`**: Optional Open Graph metadata applied to the document head. Fields mirror standard OG tags (`og_title`, `og_description`, etc.).
- **`[titles]`**: Optional overrides for the section headings (`comparisons`, `showcase`, `support`).
- **`[introduction]`**: Text content, bullet lists, and optional imagery for the intro card. Supports:
  - `title`
  - `paragraphs` (array)
  - `parameters_title` + `parameters` (array)
  - `usage_title` + `usage_steps` (array)
  - `usage_image`, `usage_image_alt`, `usage_image_caption`
  - Additional optional `usage_image_2` variants for certain pages
- **`[[comparisons]]`** (array of tables): Controls the before/after sliders. Fields include `initial`, `color`, `before`, `after`, `caption`, and `handle_shape`.
- **`[showcase]`**: Either provide `video_url` to embed an iframe or omit it to show `placeholder` text.
- **`[support]`**: Card content and CTA link (`title`, `text`, `link_text`, `link_url`).
- **`[[citations]]`**: Optional BibTeX references rendered at the end of the page.

## Adding a New Variant
1. Duplicate one of the existing TOML files and update the content.
2. Add assets referenced by the TOML (images, banners, etc.) to the project root or update paths accordingly.
3. Link the new TOML by either:
   - Passing `?toml=your-file.toml` in the URL, **or**
   - Extending the routing logic in `script.js` (look for the `page` query parameter block around `DOMContentLoaded`).
4. Open `index.html` with the appropriate query string to verify your changes.

## Tips
- Use Markdown-style `**bold**` inside paragraphs and list items; `script.js` converts them to `<strong>` tags and applies theme colors automatically.
- Leave optional sections blank or omit tables entirely if you do not need them-the renderer checks for presence before injecting HTML.
- When disabling the research/documentation link, set both `research_link_enabled = false` and leave the other fields as-is for clarity.
