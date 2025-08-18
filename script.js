// Unified theme configuration
const THEME_CONFIG = {
  colors: {
    palette: [
      'var(--primary-pink)',
      'var(--primary-purple)', 
      'var(--primary-teal)',
      'var(--primary-green)'
    ],
    buttonClasses: [
      'btn-theme-pink',
      'btn-theme-purple', 
      'btn-theme-teal',
      'btn-theme-green'
    ]
  },
  shapes: {
    types: ['hex', 'pent', 'tri', 'circle', 'quad', 'hept', 'oct'],
    colors: ['pink', 'purple', 'teal', 'green']
  }
};

// Utility functions
const utils = {
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  randomChoice: (array) => array[Math.floor(Math.random() * array.length)],
  getViewportWidth: () => Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0)
};


// Before/After slider functionality
function initBeforeAfterSliders() {
  function initSlider(slider) {
    const initialValue = parseFloat(slider.dataset.initial || '0.5');
    const handle = slider.querySelector('.ba-handle');
    
    const setPosition = (position) => {
      position = utils.clamp(position, 0, 1);
      slider.style.setProperty('--pos', (position * 100).toFixed(2) + '%');
      if (handle) {
        handle.setAttribute('aria-valuenow', String(Math.round(position * 100)));
      }
    };
    
    setPosition(initialValue);

    const pointerToPosition = (event) => {
      const rect = slider.getBoundingClientRect();
      return utils.clamp((event.clientX - rect.left) / rect.width, 0, 1);
    };

    let isDragging = false;
    
    const handlePointerDown = (event) => {
      isDragging = true;
      slider.classList.add('dragging');
      setPosition(pointerToPosition(event));
      event.preventDefault();
    };
    
    const handlePointerMove = (event) => {
      if (isDragging) setPosition(pointerToPosition(event));
    };
    
    const handlePointerUp = () => {
      isDragging = false;
      slider.classList.remove('dragging');
    };

    slider.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    // Keyboard navigation
    if (handle) {
      handle.addEventListener('keydown', (event) => {
        const currentPos = parseFloat(getComputedStyle(slider).getPropertyValue('--pos')) / 100 || 0.5;
        const step = event.shiftKey ? 0.1 : 0.02;
        
        if (event.key === 'ArrowLeft') {
          setPosition(currentPos - step);
          event.preventDefault();
        }
        if (event.key === 'ArrowRight') {
          setPosition(currentPos + step);
          event.preventDefault();
        }
      });
    }
  }
  
  document.querySelectorAll('.ba-slider').forEach(initSlider);
}

// Randomize heading colors
function randomizeHeadingColors() {
  document.querySelectorAll('h2').forEach((heading) => {
    const color = utils.randomChoice(THEME_CONFIG.colors.palette);
    heading.style.color = color;
  });
}

// Randomize themed button colors
function randomizeButtonThemes() {
  document.querySelectorAll('.themed-btn').forEach(button => {
    // Remove existing theme classes
    THEME_CONFIG.colors.buttonClasses.forEach(className => {
      button.classList.remove(className);
    });
    
    // Add random theme class
    const randomTheme = utils.randomChoice(THEME_CONFIG.colors.buttonClasses);
    button.classList.add(randomTheme);
  });
}

// Generate background shapes
function generateBackgroundShapes() {
  const container = document.querySelector('.bg-shapes');
  if (!container) return;
  
  container.innerHTML = '';
  const viewportWidth = utils.getViewportWidth();
  const shapeCount = viewportWidth < 600 ? 48 : 96;
  const sizeRange = viewportWidth < 600 ? { min: 18, max: 50 } : { min: 22, max: 60 };
  
  for (let i = 0; i < shapeCount; i++) {
    const shape = document.createElement('span');
    const shapeType = utils.randomChoice(THEME_CONFIG.shapes.types);
    const shapeColor = utils.randomChoice(THEME_CONFIG.shapes.colors);
    
    shape.className = `shape ${shapeType} ${shapeColor}`;
    
    const size = Math.round(sizeRange.min + Math.random() * (sizeRange.max - sizeRange.min));
    const top = Math.random() * 100;
    const left = Math.random() * 100;
    const rotation = Math.round(Math.random() * 360);
    
    Object.assign(shape.style, {
      width: `${size}px`,
      height: `${size}px`,
      top: `${top}%`,
      left: `${left}%`,
      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      position: 'absolute'
    });
    
    container.appendChild(shape);
  }
}

// ===== Minimal TOML parser (subset) =====
// Supports: [section], [[arrayOfTables]], key = value, arrays (incl. multi-line), strings, numbers, booleans.
function parseTomlLight(input) {
  const obj = {};
  let current = obj;
  let currentArraySection = null;

  const stripComments = (line) => {
    let out = '';
    let inStr = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i - 1] !== '\\') inStr = !inStr;
      if (c === '#' && !inStr) break;
      out += c;
    }
    return out;
  };

  const isBalancedArray = (s) => {
    let inStr = false;
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"' && s[i - 1] !== '\\') inStr = !inStr;
      if (inStr) continue;
      if (c === '[') depth++;
      else if (c === ']') depth--;
    }
    return depth === 0;
  };

  const splitTopLevel = (s) => {
    const parts = [];
    let buf = '';
    let inStr = false;
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"' && s[i - 1] !== '\\') inStr = !inStr;
      if (!inStr) {
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === ',' && depth === 0) {
          parts.push(buf.trim());
          buf = '';
          continue;
        }
      }
      buf += c;
    }
    if (buf.trim()) parts.push(buf.trim());
    return parts;
  };

  const parseValue = (raw) => {
    let v = raw.trim();
    if (!v) return null;
    if (v.startsWith('[')) {
      // array
      v = v.replace(/^\[/, '').replace(/\]$/, '').trim();
      if (!v) return [];
      return splitTopLevel(v).map(el => parseValue(el));
    }
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      const quote = v[0];
      v = v.slice(1, -1);
      if (quote === '"') v = v.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      return v;
    }
    if (v === 'true') return true;
    if (v === 'false') return false;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
    return v; // fallback string
  };

  const lines = input.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = stripComments(lines[i]).trim();
    if (!line) continue;

    // Array of tables: [[section]]
    let mArr = line.match(/^\[\[(.+?)\]\]$/);
    if (mArr) {
      const name = mArr[1].trim();
      if (!Array.isArray(obj[name])) obj[name] = [];
      const entry = {};
      obj[name].push(entry);
      current = entry;
      currentArraySection = name;
      continue;
    }

    // Table: [section]
    let mTbl = line.match(/^\[(.+?)\]$/);
    if (mTbl) {
      const name = mTbl[1].trim();
      if (!obj[name] || Array.isArray(obj[name])) obj[name] = {};
      current = obj[name];
      currentArraySection = null;
      continue;
    }

    // Key = value
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const key = line.slice(0, eqIdx).trim();
      let valuePart = line.slice(eqIdx + 1).trim();

      // Handle multi-line arrays
      if (valuePart.startsWith('[') && !isBalancedArray(valuePart)) {
        let buf = valuePart;
        while (i + 1 < lines.length) {
          i++;
          const next = stripComments(lines[i]);
          buf += next;
          if (isBalancedArray(buf)) break;
        }
        valuePart = buf;
      }

      current[key] = parseValue(valuePart);
      continue;
    }
  }

  return obj;
}

// ===== Content loading and rendering from TOML =====
async function loadTomlContent(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const text = await res.text();
  // Prefer local lightweight parser
  try {
    return parseTomlLight(text);
  } catch (e) {
    // Fallback to any global TOML parser if available
    const parser = (window.TOML && window.TOML.parse) || (window.toml && window.toml.parse);
    if (!parser) throw new Error('TOML parser not found.');
    return parser(text);
  }
}

function setMetaTags(meta = {}) {
  const set = (prop, content) => {
    if (!content) return;
    let el = document.querySelector(`meta[property="${prop}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', prop);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };
  set('og:type', meta.og_type);
  set('og:url', meta.og_url);
  set('og:title', meta.og_title);
  set('og:description', meta.og_description);
  set('og:image', meta.og_image);
}

// ===== Citations helpers =====
function parseBibtexEntry(text = '') {
  const entry = {};
  if (typeof text !== 'string') return entry;
  const header = text.match(/@(\w+)\s*\{\s*([^,\n]+)\s*,/i);
  if (header) {
    entry.entrytype = header[1].toLowerCase();
    entry.citekey = header[2];
  }
  // key = {value}
  let m;
  const braceRe = /(\w+)\s*=\s*\{([^}]*)\}/g;
  while ((m = braceRe.exec(text)) !== null) {
    entry[m[1].toLowerCase()] = m[2].trim();
  }
  // key = "value"
  const quoteRe = /(\w+)\s*=\s*"([^"]*)"/g;
  while ((m = quoteRe.exec(text)) !== null) {
    const k = m[1].toLowerCase();
    if (!(k in entry)) entry[k] = m[2].trim();
  }
  return entry;
}

function formatBibtexAuthors(authorField = '') {
  if (!authorField) return '';
  const parts = authorField.split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean);
  const names = parts.map(a => {
    if (a.includes(',')) {
      const bits = a.split(',').map(s => s.trim());
      const last = bits[0] || '';
      const first = bits.slice(1).join(' ').trim();
      return (first ? `${first} ${last}` : last).trim();
    }
    return a.trim();
  });
  return names.join(', ');
}

function formatCitationHtml(fields = {}) {
  const authors = formatBibtexAuthors(fields.author);
  const year = fields.year ? String(fields.year) : '';
  const title = fields.title || '';
  const journal = fields.journal || fields.booktitle || '';
  const volume = fields.volume ? String(fields.volume) : '';
  const number = fields.number ? String(fields.number) : '';
  const pages = fields.pages ? String(fields.pages).replace(/--/g, '–') : '';
  const publisher = fields.publisher || '';

  // Build multiline HTML: line1 = authors (bold) + (year), line2 = title, line3 = journal/volume/number/pages, line4 = publisher
  const line1 = [authors ? `<strong>${authors}</strong>` : '', year ? `(${year})` : '']
    .filter(Boolean)
    .join(' ');
  const line2 = title ? `${title}.` : '';
  let line3 = '';
  if (journal) {
    line3 = `<em>${journal}</em>`;
    if (volume) line3 += ` ${volume}`;
    if (number) line3 += `(${number})`;
    if (pages) line3 += `:${pages}`;
    line3 += '.';
  }
  const line4 = publisher ? `Publisher: ${publisher}.` : '';

  return [line1, line2, line3, line4].filter(s => s && s.trim()).join('<br>');
}

function renderCitationsSection(cfg) {
  const items = Array.isArray(cfg?.citations) ? cfg.citations : [];
  if (!items.length) return;
  const main = document.querySelector('main.content-container') || document.querySelector('main') || document.body;
  if (!main) return;

  const section = document.createElement('section');
  section.className = 'citations section';
  section.id = 'citations';

  const h2 = document.createElement('h2');
  h2.className = 'section__title';
  h2.id = 'citations-title';
  h2.textContent = (cfg?.titles?.citations) || 'Citations';
  section.appendChild(h2);

  const card = document.createElement('div');
  card.className = 'card';

  const list = document.createElement('ol');
  list.className = 'citation-list';

  items.forEach((it) => {
    const li = document.createElement('li');
    const fields = parseBibtexEntry(String(it.bibtex || ''));
    const html = formatCitationHtml(fields);
    if (html) li.innerHTML = html;
    else li.textContent = it.bibtex || it.id || '';
    list.appendChild(li);
  });

  card.appendChild(list);
  section.appendChild(card);
  main.appendChild(section);
}

function renderContent(cfg) {
  // Header: banner + research paper link
  const siteLogo = document.querySelector('.site-logo');
  if (cfg?.site?.banner && siteLogo) {
    siteLogo.src = cfg.site.banner;
  }
  const researchBtn = document.querySelector('.research-paper-btn');
  if (researchBtn) {
    const text = cfg?.site?.research_link_text;
    const url = cfg?.site?.research_link_url;
    const title = (cfg?.site?.research_link_title ?? text) || '';
    const target = cfg?.site?.research_link_target ?? '_blank';
    const rel = cfg?.site?.research_link_rel ?? 'noopener noreferrer';
    if (text && url) {
      researchBtn.textContent = text;
      researchBtn.href = url;
      researchBtn.setAttribute('title', title);
      researchBtn.setAttribute('target', target);
      researchBtn.setAttribute('rel', rel);
      researchBtn.style.display = '';
    } else {
      // Hide the button if TOML doesn't define it
      researchBtn.style.display = 'none';
    }
  }

  // Meta tags (optional)
  if (cfg?.meta) setMetaTags(cfg.meta);
  if (cfg?.site?.title) document.title = cfg.site.title;

  // Introduction
  const introTitle = document.getElementById('intro-title');
  const introContent = document.getElementById('intro-content');
  if (introTitle && cfg?.introduction?.title) introTitle.textContent = cfg.introduction.title;
  if (introContent) {
    introContent.innerHTML = '';
    const paras = cfg?.introduction?.paragraphs || [];
    paras.forEach(t => {
      const p = document.createElement('p');
      p.textContent = t;
      introContent.appendChild(p);
    });

    // Build Parameters section nodes (do not append yet)
    const paramsTitle = cfg?.introduction?.parameters_title || cfg?.introduction?.parametersTitle || 'Parameters';
    let parameters = Array.isArray(cfg?.introduction?.parameters)
      ? cfg.introduction.parameters
      : [];
    // Back-compat: if no 'parameters' provided, fall back to 'usage_parameters'
    if ((!parameters || parameters.length === 0) && Array.isArray(cfg?.introduction?.usage_parameters)) {
      parameters = cfg.introduction.usage_parameters;
    } else if ((!parameters || parameters.length === 0) && Array.isArray(cfg?.introduction?.usageParameters)) {
      parameters = cfg.introduction.usageParameters;
    }
    const hasParams = Array.isArray(parameters) && parameters.length > 0;
    const paramNodes = [];
    if (hasParams) {
      const h3p = document.createElement('h3');
      h3p.className = 'intro__params-title';
      h3p.textContent = paramsTitle;
      paramNodes.push(h3p);

      const ulp = document.createElement('ul');
      ulp.className = 'intro__params-list';
      parameters.forEach(item => {
        const li = document.createElement('li');
        li.textContent = String(item);
        ulp.appendChild(li);
      });
      paramNodes.push(ulp);
    }

    // Build Usage section nodes (do not append yet)
    const usageTitle = cfg?.introduction?.usage_title || cfg?.introduction?.usageTitle || 'Usage';
    let usageItems = Array.isArray(cfg?.introduction?.usage_steps)
      ? cfg.introduction.usage_steps
      : [];
    // Back-compat: if no steps provided and no parameters detected, show legacy usage_parameters as the usage list
    if ((!usageItems || usageItems.length === 0) && (!parameters || parameters.length === 0)) {
      const legacy = Array.isArray(cfg?.introduction?.usage_parameters)
        ? cfg.introduction.usage_parameters
        : (cfg?.introduction?.usageParameters || []);
      usageItems = legacy;
    }
    const usageNodes = [];
    if (usageTitle) {
      const h3 = document.createElement('h3');
      h3.className = 'intro__usage-title';
      h3.textContent = usageTitle;
      usageNodes.push(h3);
    }
    if (Array.isArray(usageItems) && usageItems.length) {
      const ul = document.createElement('ul');
      ul.className = 'intro__usage-list';
      usageItems.forEach(item => {
        const li = document.createElement('li');
        li.textContent = String(item);
        ul.appendChild(li);
      });
      usageNodes.push(ul);
    }

    // Usage image (single)
    const usageImage = cfg?.introduction?.usage_image || cfg?.introduction?.usageImage;
    const usageImageAlt = cfg?.introduction?.usage_image_alt || cfg?.introduction?.usageImageAlt || 'Usage illustration';
    const usageImageCaption = cfg?.introduction?.usage_image_caption || cfg?.introduction?.usageImageCaption || '';

    // If image exists, place Parameters + Usage in left column, image in right column
    if (usageImage) {
      const grid = document.createElement('div');
      grid.className = 'intro__usage-grid';

      const mainCol = document.createElement('div');
      mainCol.className = 'intro__usage-main';
      // Usage first
      usageNodes.forEach(node => mainCol.appendChild(node));
      // Then Parameters
      paramNodes.forEach(node => mainCol.appendChild(node));
      grid.appendChild(mainCol);

      const mediaCol = document.createElement('div');
      mediaCol.className = 'intro__usage-media';
      const figure = document.createElement('figure');
      const img = document.createElement('img');
      img.src = usageImage;
      img.alt = usageImageAlt || '';
      img.loading = 'lazy';
      figure.appendChild(img);
      if (usageImageCaption) {
        const figcap = document.createElement('figcaption');
        figcap.className = 'intro__usage-caption';
        figcap.textContent = usageImageCaption;
        figure.appendChild(figcap);
      }
      mediaCol.appendChild(figure);
      grid.appendChild(mediaCol);

      introContent.appendChild(grid);
    } else {
      // No image: append sequentially into intro content (Usage first)
      usageNodes.forEach(node => introContent.appendChild(node));
      paramNodes.forEach(node => introContent.appendChild(node));
    }
  }

  // Titles overrides
  if (cfg?.titles) {
    const t = cfg.titles;
    if (t.comparisons) {
      const el = document.getElementById('comparisons-title');
      if (el) el.textContent = t.comparisons;
    }
    if (t.showcase) {
      const el = document.getElementById('showcase-title');
      if (el) el.textContent = t.showcase;
    }
    if (t.support) {
      const el = document.getElementById('support-title');
      if (el) el.textContent = t.support;
    }
  }

  // Comparisons grid
  const grid = document.getElementById('comparisons-grid');
  if (grid) {
    grid.innerHTML = '';
    const items = Array.isArray(cfg?.comparisons) ? cfg.comparisons : [];
    items.forEach(item => {
      const initial = typeof item.initial === 'number' ? item.initial : 0.5;
      const color = item.color || 'purple';
      const caption = item.caption || '';
      const before = item.before || '';
      const after = item.after || '';

      const card = document.createElement('div');
      card.className = 'card card--compact';
      card.innerHTML = `
        <div class="ba-slider" data-initial="${initial}" data-color="${color}">
          <div class="ba-pane after">${after ? `<img src="${after}" alt="After image">` : '<span>After</span>'}</div>
          <div class="ba-pane before">${before ? `<img src="${before}" alt="Before image">` : '<span>Before</span>'}</div>
          <button class="ba-handle" role="slider" aria-label="Drag to compare" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" tabindex="0"></button>
        </div>
        ${caption ? `<p class="comparison-caption">${caption}</p>` : ''}
      `;
      grid.appendChild(card);
    });
  }

  // Showcase
  const showcase = document.getElementById('showcase-container');
  if (showcase) {
    showcase.innerHTML = '';
    if (cfg?.showcase?.video_url) {
      const iframe = document.createElement('iframe');
      iframe.src = cfg.showcase.video_url;
      iframe.width = '100%';
      iframe.height = '100%';
      iframe.style.border = '0';
      iframe.setAttribute('allowfullscreen', '');
      showcase.appendChild(iframe);
    } else {
      showcase.textContent = cfg?.showcase?.placeholder || 'Showcase Video Placeholder';
    }
  }

  // Support
  const supportTitle = document.getElementById('support-title');
  const supportText = document.getElementById('support-text');
  const supportLink = document.getElementById('support-link');
  if (cfg?.support?.title && supportTitle) supportTitle.textContent = cfg.support.title;
  if (supportText && cfg?.support?.text) supportText.textContent = cfg.support.text;
  if (supportLink && cfg?.support) {
    if (cfg.support.link_text) supportLink.textContent = cfg.support.link_text;
    if (cfg.support.link_url) supportLink.href = cfg.support.link_url;
  }
  
  // Citations (appended at the bottom)
  renderCitationsSection(cfg);
}

// Initialize all functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  // Prevent flashing hardcoded link before TOML is applied
  const preBtn = document.querySelector('.research-paper-btn');
  if (preBtn) preBtn.style.display = 'none';
  let cfg = null;
  try {
    cfg = await loadTomlContent('content.toml');
    renderContent(cfg);
  } catch (err) {
    console.warn('Content load failed, using defaults:', err);
  }
  // Initialize interactive/visual features after content is in the DOM
  initBeforeAfterSliders();
  randomizeHeadingColors();
  randomizeButtonThemes();
  generateBackgroundShapes();
});
