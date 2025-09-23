import { getImageScore, logMarian, getFormattedText } from '../shared/utils.js';
const bookSeriesRegex = /^Book (\d+) of \d+$/i;

const includedLabels = [
    'Contributors',
    'Publisher',
    'Publication date',
    'Program Type',
    'Language',
    'Print length',
    'Listening Length',
    'ISBN-10',
    'ISBN-13',
    'ASIN',
    'Series',
    'Series Place',
  ];

async function getAmazonDetails() {
	logMarian('Extracting Amazon details');

  const imgEl = document.querySelector('#imgBlkFront, #landingImage');
  const bookDetails = getDetailBullets();
  const audibleDetails = getAudibleDetails();
  const contributors = extractAmazonContributors();

  bookDetails["Edition Format"] = getSelectedFormat() || '';
  bookDetails["Title"] = document.querySelector('#productTitle')?.innerText.trim();
  bookDetails["Description"] = getBookDescription() || '';
  bookDetails["img"] = imgEl?.src ? getHighResImageUrl(imgEl.src) : null;
  bookDetails["imgScore"] = imgEl?.src ? await getImageScore(imgEl.src) : 0;
  bookDetails["Contributors"] = contributors;
  
  if (bookDetails["Edition Format"] == "Kindle") {
    bookDetails['Reading Format'] = 'Ebook'; 
  } else if (bookDetails["Edition Format"] == "Audible") {
    bookDetails['Reading Format'] = 'Audiobook';
  } else {
    bookDetails['Reading Format'] = 'Physical Book';
  }

  // logMarian("bookDetails", bookDetails);
  // logMarian("audibleDetails", audibleDetails);
 
  return {
    ...bookDetails,
    ...audibleDetails,
  };
}

function getHighResImageUrl(src) {
  return src.replace(/\._[^.]+(?=\.)/, '');
}

function getDetailBullets() {
  const bullets = document.querySelectorAll('#detailBullets_feature_div li');
  const details = {};

  bullets.forEach(li => {
    // Identify the edition labels, skip if not found
    const labelSpan = li.querySelector('span.a-text-bold');
    if (!labelSpan) return;

    // Clean up label text
    let label = labelSpan.textContent
      .replace(/[\u200E\u200F\u202A-\u202E:\u00A0\uFEFF‎‏]/g, '')
      .replace(':', '')
      .trim();

    // Fetch and clean the value of the detail
    const valueSpan = labelSpan.nextElementSibling;
    let value = valueSpan?.textContent?.replace(/\s+/g, ' ').trim();

    // Handle book series special case
    const match = bookSeriesRegex.exec(label) || bookSeriesRegex.exec(value);
    if (match) {
      details['Series'] = value;
      details['Series Place'] = match[1];
      return;
    }

    // logMarian(label, includedLabels.includes(label));
    // Print debug info for labels not included
    // skip if not included in the list
    if (!includedLabels.includes(label)) {
      // logMarian(`Label not currently included: "${label}"`);
      return;
    }

    // Final check that both label and value are present
    if (!label || !value) return;

    // Rename "Print length" to "Pages" and extract number only
    if (label === 'Print length') {
      label = 'Pages';
      const pageMatch = value.match(/\d+/);
      value = pageMatch ? pageMatch[0] : value;
    }

    details[label] = value;
  });

  return details;
}

function getAudibleDetails() {
  const table = document.querySelector('#audibleProductDetails table');
  if (!table) return {};

  const details = {};
  const rows = table.querySelectorAll('tr');

  rows.forEach(row => {
    const label = row.querySelector('th span')?.textContent?.trim();
    const value = row.querySelector('td')?.innerText?.trim();
    const match = bookSeriesRegex.exec(label) || bookSeriesRegex.exec(value);

    // Handle book series special case
    if (match) {
      details['Series'] = value;
      details['Series Place'] = match[1];
      return;
    }

    // Match any Audible.<TLD> Release Date
    if (/^Audible\.[^\s]+ Release Date$/i.test(label)) {
      details['Publication date'] = value;
    } else if (label === 'Audible.com Release Date') {
      details['Publication date'] = value;
    } else if (label === 'Program Type') {
      details['Reading Format'] = value;
      details['Edition Format'] = "Audible";
    } else if (label === 'Listening Length') {
      const timeMatch = value.match(/(\d+)\s*hours?\s*(?:and)?\s*(\d+)?\s*minutes?/i);
      if (timeMatch) {
        const arr = [];
        if (timeMatch[1]) arr.push(`${timeMatch[1]} hours`);
        if (timeMatch[2]) arr.push(`${timeMatch[2]} minutes`);
        details['Listening Length'] = arr;
      } else {
        details['Listening Length'] = value;
      }
    } else if (label && value) {
      details[label] = value;
    }
  });

  // Extract image (if available)
  const imgEl = document.querySelector('#audibleProductImage img');
  if (imgEl?.src) {
    details.img = imgEl.src;
  }

  return details;
}

function getBookDescription() {
  const container = document.querySelector('#bookDescription_feature_div .a-expander-content');
  if (!container) return '';

  let text = getFormattedText(container);

  return text
    .replace(/[ \t]+/g, ' ')    // Multiple spaces/tabs to single space
    .replace(/\n /g, '\n')      // Remove spaces after newlines
    .replace(/ \n/g, '\n')      // Remove spaces before newlines
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim();
}

function getSelectedFormat() {
  const selected = document.querySelector('#tmmSwatches .swatchElement.selected .slot-title span[aria-label]');
  if (selected) {
    return selected.getAttribute('aria-label')?.replace(' Format:', '').trim();
  }
  return null;
}

function extractAmazonContributors() {
  const contributors = [];

  const authorSpans = document.querySelectorAll('#bylineInfo .author');
  authorSpans.forEach(span => {
    const name = span.querySelector('a')?.innerText.trim();
    const roleText = span.querySelector('.contribution span')?.innerText.trim();
    let roles = [];

    if (roleText) {
      // e.g., "(Author)", "(Illustrator)", "(Author, Narrator)"
      const roleMatch = roleText.match(/\(([^)]+)\)/);
      if (roleMatch) {
        // Split by comma and trim each role
        roles = roleMatch[1].split(',').map(r => r.trim());
      }
    } else {
      roles.push("Contributor"); // fallback if role is missing
    }

    // Ignore if any role is Publisher
    if (roles.includes("Publisher")) return;

    if (name) {
      // Check for duplicates and merge roles
      const existing = contributors.find(c => c.name === name);
      if (existing) {
        roles.forEach(role => {
          if (!existing.roles.includes(role)) existing.roles.push(role);
        });
      } else {
        contributors.push({ name, roles });
      }
    }
  });

  return contributors;
}

export { getAmazonDetails };