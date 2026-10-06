import * as cheerio from 'cheerio';
import { cleanText } from '../documents/textCleaner.js';

/**
 * Converts a Cheerio table element into a formatted Markdown table
 * preserving headers, column alignments, and cell values.
 *
 * @param {import('cheerio').Cheerio<any>} $table
 * @param {import('cheerio').CheerioAPI} $
 * @returns {string} Markdown table representation
 */
export const tableToMarkdown = ($table, $) => {
  const rows = [];
  $table.find('tr').each((_, tr) => {
    const cells = [];
    $(tr)
      .find('th, td')
      .each((_, cell) => {
        // Strip inner newlines, trim, replace pipes with escaped pipes
        const cellText = $(cell)
          .text()
          .replace(/\r?\n+/g, ' ')
          .replace(/\|/g, '\\|')
          .trim();
        cells.push(cellText);
      });
    if (cells.length > 0 && cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  });

  if (rows.length === 0) return '';

  // Determine max columns
  const maxCols = Math.max(...rows.map((r) => r.length));
  if (maxCols === 0) return '';

  // Pad rows to uniform column count
  const normalizedRows = rows.map((row) => {
    while (row.length < maxCols) row.push('');
    return row;
  });

  const headerRow = normalizedRows[0];
  const separatorRow = new Array(maxCols).fill('---');
  const dataRows = normalizedRows.slice(1);

  let md = `\n| ${headerRow.join(' | ')} |\n| ${separatorRow.join(' | ')} |\n`;
  for (const row of dataRows) {
    md += `| ${row.join(' | ')} |\n`;
  }
  return `${md}\n`;
};

/**
 * Extracts high-value article body text and tables from raw HTML
 * stripping navigation, menus, footers, headers, scripts, and sidebar clutter.
 *
 * @param {string} html - Raw HTML source code
 * @param {string} url - Source URL of the webpage
 * @returns {{ title: string, fullText: string, sections: Array<{ heading: string, text: string }>, tablesCount: number, textLength: number }}
 */
export const extractHtmlContent = (html, url = '') => {
  if (!html || typeof html !== 'string') {
    return { title: '', fullText: '', sections: [], tablesCount: 0, textLength: 0 };
  }

  const $ = cheerio.load(html);

  // 1. Extract Page Title
  let title = $('h1').first().text().trim();
  if (!title) {
    title = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
  }
  // Strip common site suffix
  title = title
    .replace(/\s*[-–|]\s*(National Institute of Technology Kurukshetra|NIT Kurukshetra|NIT KKR).*$/i, '')
    .trim();

  if (!title) {
    try {
      const parsed = new URL(url);
      title = parsed.pathname.replace(/\/$/, '').split('/').pop() || 'NIT Kurukshetra Official Page';
      title = title.replace(/[-_]+/g, ' ');
    } catch {
      title = 'NIT Kurukshetra Official Page';
    }
  }

  // 2. Remove boilerplate elements before extracting text
  const noiseSelectors = [
    'script',
    'style',
    'noscript',
    'svg',
    'form',
    'iframe',
    'button',
    'input',
    'select',
    'textarea',
    'nav',
    'header',
    'footer',
    '.sidebar',
    '#sidebar',
    '.widget',
    '.widget-area',
    '.menu',
    '.main-navigation',
    '.nav-menu',
    '#masthead',
    '#colophon',
    '.site-header',
    '.site-footer',
    '.site-info',
    '.breadcrumb',
    '.breadcrumbs',
    '.pagination',
    '.page-numbers',
    '.skip-link',
    '.screen-reader-text',
    '.cookie-notice',
    '.cookies',
    '#cookie-notice',
    '.social-share',
    '.share-buttons',
    '.comment-respond',
    '#comments',
  ];
  $(noiseSelectors.join(', ')).remove();

  // 3. Convert all tables to Markdown format in-place
  let tablesCount = 0;
  $('table').each((_, tableElem) => {
    const $tbl = $(tableElem);
    const mdTable = tableToMarkdown($tbl, $);
    if (mdTable) {
      $tbl.replaceWith(`\n${mdTable}\n`);
      tablesCount++;
    } else {
      $tbl.remove();
    }
  });

  // 4. Locate main article container if available
  const contentSelectors = [
    'article',
    'main',
    '.entry-content',
    '#content .entry-content',
    '.post-content',
    '.page-content',
    '#main-content',
    '#primary',
    '#content',
    'body',
  ];

  let $contentContainer = null;
  for (const sel of contentSelectors) {
    const match = $(sel);
    if (match.length > 0 && match.text().trim().length > 100) {
      $contentContainer = match.first();
      break;
    }
  }

  if (!$contentContainer) {
    $contentContainer = $('body');
  }

  // 5. Extract structured text preserving headings and paragraphs
  const sections = [];
  let currentHeading = title || 'General';
  let currentParagraphs = [];

  // Traverse direct children or semantic blocks
  $contentContainer.find('h2, h3, h4, p, ul, ol, blockquote').each((_, elem) => {
    const tagName = elem.tagName.toLowerCase();
    const $el = $(elem);

    if (['h2', 'h3', 'h4'].includes(tagName)) {
      const headingText = $el.text().replace(/\s+/g, ' ').trim();
      if (headingText) {
        if (currentParagraphs.length > 0) {
          sections.push({
            heading: currentHeading,
            text: currentParagraphs.join('\n\n'),
          });
          currentParagraphs = [];
        }
        currentHeading = headingText;
      }
    } else if (tagName === 'p') {
      const pText = $el.text().replace(/\s+/g, ' ').trim();
      if (pText.length > 0) {
        currentParagraphs.push(pText);
      }
    } else if (tagName === 'ul' || tagName === 'ol') {
      const listItems = [];
      $el.find('> li').each((idx, li) => {
        const itemText = $(li).text().replace(/\s+/g, ' ').trim();
        if (itemText) {
          const bullet = tagName === 'ol' ? `${idx + 1}. ` : '* ';
          listItems.push(`${bullet}${itemText}`);
        }
      });
      if (listItems.length > 0) {
        currentParagraphs.push(listItems.join('\n'));
      }
    } else if (tagName === 'blockquote') {
      const quoteText = $el.text().replace(/\s+/g, ' ').trim();
      if (quoteText) {
        currentParagraphs.push(`> ${quoteText}`);
      }
    }
  });

  if (currentParagraphs.length > 0) {
    sections.push({
      heading: currentHeading,
      text: currentParagraphs.join('\n\n'),
    });
  }

  // Fallback: If structured traversal yielded nothing, grab cleaned raw text of contentContainer
  if (sections.length === 0) {
    const rawFallback = $contentContainer.text();
    const cleanedFallback = cleanText(rawFallback);
    if (cleanedFallback.length > 50) {
      sections.push({
        heading: title,
        text: cleanedFallback,
      });
    }
  }

  // Build unified full text
  const fullText = sections
    .map((s) => `### ${s.heading}\n${s.text}`)
    .join('\n\n')
    .trim();

  return {
    title,
    fullText,
    sections,
    tablesCount,
    textLength: fullText.length,
  };
};

export default {
  extractHtmlContent,
  tableToMarkdown,
};
