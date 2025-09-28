# Font Configuration Guide

The website now supports custom font configuration through TOML files. You can override the default fonts by adding a `[fonts]` section to any TOML configuration file.

## Available Font Options

### Font Families
- `font_family_primary` - Main body text font
- `font_family_secondary` - Secondary text and buttons font  
- `font_family_heading` - Headings (h1, h2, etc.) font
- `font_family_mono` - Monospace font for code and dates

### Font Sizes
- `font_size_base` - Base font size for body text (default: "1.1rem")
- `font_size_heading` - Font size for main headings (default: "2.5rem")
- `font_size_small` - Font size for small text elements (default: "0.9rem")

### Font Weights
- `font_weight_normal` - Normal text weight (default: "400")
- `font_weight_medium` - Medium text weight for buttons (default: "600")
- `font_weight_bold` - Bold text weight for headings (default: "700")

### Typography Settings
- `line_height_base` - Line height for body text (default: "1.6")
- `line_height_heading` - Line height for headings (default: "1.2")
- `letter_spacing_normal` - Normal letter spacing (default: "0")
- `letter_spacing_wide` - Wide letter spacing for buttons (default: "0.02em")

## Example Configuration

```toml
[fonts]
  font_family_primary = "'Inter', 'Segoe UI', system-ui, sans-serif"
  font_family_secondary = "'Inter', 'Segoe UI', system-ui, sans-serif"
  font_family_heading = "'Inter', 'Segoe UI', system-ui, sans-serif"
  font_family_mono = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace"
  font_size_base = "1.1rem"
  font_size_heading = "2.5rem"
  font_size_small = "0.9rem"
  font_weight_normal = "400"
  font_weight_medium = "500"
  font_weight_bold = "700"
  line_height_base = "1.6"
  line_height_heading = "1.2"
  letter_spacing_normal = "0"
  letter_spacing_wide = "0.025em"
```

## Font Stack Recommendations

### Modern Sans-Serif
```toml
font_family_primary = "'Inter', 'Segoe UI', system-ui, sans-serif"
```

### Classic Serif
```toml
font_family_heading = "'Georgia', 'Times New Roman', serif"
```

### Developer-Friendly Monospace
```toml
font_family_mono = "'JetBrains Mono', 'Fira Code', 'Source Code Pro', monospace"
```

### System Fonts (Fast Loading)
```toml
font_family_primary = "system-ui, -apple-system, 'Segoe UI', 'Roboto', sans-serif"
```

## Notes

- All font settings are optional - if not specified, the defaults will be used
- Font family values should include fallback fonts for better compatibility
- Use quotes around font names that contain spaces
- Font sizes can use any CSS unit (rem, px, em, %)
- Changes take effect immediately when the TOML file is loaded
