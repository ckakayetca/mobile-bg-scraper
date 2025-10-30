import axios from 'axios';
import fs from 'fs';
import { TextDecoder } from 'util';

// Configuration constants
const MAX_PAGES_TO_SCRAPE = 0; // Set to 0 for unlimited pages
const REQUEST_DELAY_MS = 0; // Delay between requests in milliseconds

class MobileBGScraper {
    constructor() {
        this.baseUrl = 'https://www.mobile.bg';
        this.startUrl = 'https://www.mobile.bg/obiavi/avtomobili-dzhipove/ot-2008/do-2015/namira-se-v-balgariya?price=7000&price1=15000&km=150000';
        this.firstOwnerKeywords = ['първи', 'първият', 'първия', 'история'];
        this.carLinks = [];
        this.results = [];
        this.currentPage = 1;
        this.maxPages = MAX_PAGES_TO_SCRAPE;
        this.delay = REQUEST_DELAY_MS;
    }

    // Simple regex-based HTML parser
    parseHTML(html) {
        return {
            querySelectorAll: (selector) => {
                if (selector.includes('a[href*="obiava-"]')) {
                    const regex = /<a[^>]+href="([^"]*obiava-[^"]*)"[^>]*>/gi;
                    const matches = [];
                    let match;
                    while ((match = regex.exec(html)) !== null) {
                        if (match[1]) { // Check if we have a valid match
                            const href = match[1];
                            const index = match.index;
                            matches.push({
                                getAttribute: (attr) => attr === 'href' ? href : null,
                                closest: (tag) => this.findParentContainer(html, index, tag)
                            });
                        }
                    }
                    return matches;
                }
                return [];
            },
            querySelector: (selector) => {
                if (selector.includes('a.next') || selector.includes('a[class*="next"]')) {
                    // Try multiple regex patterns to find the next page link
                    const patterns = [
                        /<a[^>]+class="[^"]*next[^"]*"[^>]+href="([^"]*)"[^>]*>/i,
                        /<a[^>]+href="([^"]*)"[^>]+class="[^"]*next[^"]*"[^>]*>/i,
                        /<a[^>]+class="[^"]*saveSlink[^"]*next[^"]*"[^>]+href="([^"]*)"[^>]*>/i,
                        /<a[^>]+href="([^"]*)"[^>]*><span>Напред<\/span><\/a>/i,
                        /<a[^>]+href="([^"]*)"[^>]*class="[^"]*next[^"]*"[^>]*><span>Напред<\/span><\/a>/i
                    ];

                    for (const pattern of patterns) {
                        const match = html.match(pattern);
                        if (match) {
                            console.log(`Found next page link with href: ${match[1]}`);
                            return {
                                getAttribute: (attr) => attr === 'href' ? match[1] : null
                            };
                        }
                    }

                    // Debug: show a sample of the HTML around "next"
                    const nextIndex = html.toLowerCase().indexOf('next');
                    if (nextIndex !== -1) {
                        const sample = html.substring(Math.max(0, nextIndex - 100), nextIndex + 200);
                        console.log('HTML sample around "next":', sample);
                    }
                    console.log('No next page link found in HTML');
                }
                return null;
            }
        };
    }

    // Find parent container for a car listing
    findParentContainer(html, linkIndex, tag) {
        // Look for the main car listing container (class="item")
        // Search backwards from the link to find the item div
        const beforeLink = html.substring(0, linkIndex);

        // Find the last occurrence of <div class="item" before the link
        const itemDivRegex = /<div[^>]+class="[^"]*item[^"]*"[^>]*>/gi;
        let lastItemDiv = -1;
        let match;

        while ((match = itemDivRegex.exec(beforeLink)) !== null) {
            lastItemDiv = match.index;
        }

        if (lastItemDiv === -1) {
            return null;
        }

        // Extract the complete item div content
        const divStart = lastItemDiv;
        const divEnd = this.findMatchingCloseTag(html, divStart);
        if (divEnd === -1) {
            return null;
        }

        const divContent = html.substring(divStart, divEnd);

        // Find the description div (class="info") within this car listing
        let descriptionText = '';
        const infoDivMatch = divContent.match(/<div[^>]+class="info"[^>]*>(.*?)(?=<div|<span|$)/is);
        if (infoDivMatch && infoDivMatch[1]) {
            descriptionText = this.stripHtmlTags(infoDivMatch[1]).toLowerCase();
        }

        return {
            textContent: descriptionText,
            rawHtml: divContent.toLowerCase(),
            fullHtml: divContent,
            querySelector: (selector) => {
                if (selector === '.seller') {
                    return divContent.includes('class="seller"') ? {} : null;
                }
                if (selector === '.info') {
                    return infoDivMatch ? {} : null;
                }
                return null;
            },
            classList: {
                contains: (className) => {
                    return divContent.includes(`class="`) &&
                        divContent.includes(className);
                }
            },
            parentElement: null
        };
    }

    // Find matching closing tag
    findMatchingCloseTag(html, startIndex) {
        let depth = 1;
        let i = startIndex + 4; // Skip '<div'

        while (i < html.length && depth > 0) {
            if (html.substring(i, i + 2) === '</') {
                if (html.substring(i, i + 6) === '</div>') {
                    depth--;
                    if (depth === 0) return i + 6;
                }
            } else if (html.substring(i, i + 1) === '<' && html.substring(i + 1, i + 4) === 'div') {
                depth++;
            }
            i++;
        }
        return -1;
    }

    // Strip HTML tags to get text content
    stripHtmlTags(html) {
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Check if car listing contains first-owner keywords
    isFirstOwner(carElement) {
        const text = carElement.textContent.toLowerCase();

        // Skip if contains "нов внос" (new import)
        if (text.includes('нов внос')) {
            console.log('⚠️ Skipping listing with "нов внос"');
            return false;
        }

        const hasKeyword = this.firstOwnerKeywords.some(keyword => text.includes(keyword));
        if (hasKeyword) {
            console.log('✓ Found first-owner keyword in description!');
        }

        return hasKeyword;
    }

    // Check if car has seller div (skip these)
    hasSellerDiv(carElement) {
        return carElement.querySelector('.seller') !== null;
    }

    // Check if car is TOP or VIP ad (skip these)
    isTopOrVipAd(carElement) {
        // Check if the carElement has the raw HTML content
        if (carElement.rawHtml) {
            return carElement.rawHtml.includes('class="item top') ||
                carElement.rawHtml.includes('class="item vip') ||
                carElement.rawHtml.includes('class="item top ') ||
                carElement.rawHtml.includes('class="item vip ');
        }
        return false;
    }

    // Find which keyword matched in description, or null
    findMatchingKeyword(textLower) {
        for (const keyword of this.firstOwnerKeywords) {
            if (textLower.includes(keyword)) return keyword;
        }
        return null;
    }

    // Parse car details from a listing container
    parseCarDetails(carContainer, href) {
        const html = carContainer.fullHtml || '';

        // Title - look for anchor tag with class="title" inside zaglavie div
        let title = '';
        // Try anchor tag with class="title" first (most common)
        const titleAnchorMatch = html.match(/<a[^>]+class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
        if (titleAnchorMatch) {
            title = this.stripHtmlTags(titleAnchorMatch[1]);
        } else {
            // Fallback to div with class="title"
            const titleDivMatch = html.match(/<div[^>]+class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            if (titleDivMatch) {
                title = this.stripHtmlTags(titleDivMatch[1]);
            }
        }

        // Price
        let price = '';
        const priceMatch = html.match(/<div[^>]+class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (priceMatch) {
            const priceText = this.stripHtmlTags(priceMatch[1]);
            // Extract BGN price (usually after лв. or just the number in лв)
            const bgnMatch = priceText.match(/([\d\s.,]+)\s*лв\.?/i);
            if (bgnMatch) {
                price = bgnMatch[1].trim();
            } else {
                price = priceText.trim();
            }
        }

        // Params block
        let paramsHtml = '';
        const paramsMatch = html.match(/<div[^>]+class="[^"]*params[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (paramsMatch) paramsHtml = paramsMatch[1];

        const paramsText = this.stripHtmlTags(paramsHtml).toLowerCase();

        // Extract fields
        const yearMatch = paramsText.match(/(\d{4})\s*г/);
        const mileageMatch = paramsText.match(/([\d\s\.]+)\s*км/);
        const fuelMatch = paramsText.match(/(дизелов|бензинов|газ)/);
        const hpMatch = paramsText.match(/([\d\s\.]+)\s*к\.с\.?/);
        const volumeMatch = paramsText.match(/([\d\s\.]+)\s*куб\.см/);
        const transmissionMatch = paramsText.match(/(автоматична|ръчна)/);
        const formFactorMatch = paramsText.match(/(седан|комби|купе|хечбек|джип)/);

        const norm = (s) => (s || '').toString().replace(/\s+/g, ' ').trim();
        const digits = (s) => (s || '').toString().replace(/[^0-9]/g, '');
        const priceDigits = digits(price);

        return {
            link: href,
            title: norm(title),
            price: priceDigits,
            year: digits(yearMatch?.[1] || '').slice(0, 4),
            mileage: digits(mileageMatch?.[1] || ''),
            fuel: norm(fuelMatch?.[1] || ''),
            engineVolume: digits(volumeMatch?.[1] || ''),
            horsepower: digits(hpMatch?.[1] || ''),
            transmission: norm(transmissionMatch?.[1] || ''),
            formFactor: norm(formFactorMatch?.[1] || ''),
        };
    }

    // Extract car links from a page
    extractCarLinks(document) {
        const carLinks = [];

        // Find all car listing containers - looking for the pattern we saw in the HTML
        const carElements = document.querySelectorAll('a[href*="obiava-"]');

        console.log(`Found ${carElements.length} car links on this page`);

        for (const link of carElements) {
            if (!link || !link.getAttribute) continue;
            const href = link.getAttribute('href');
            if (href && href.includes('obiava-') && href.includes('-')) {
                // Get the parent container to check for seller div and first-owner keywords
                let carContainer = link.closest('div');

                // Walk up the DOM to find the main car listing container
                while (carContainer && !carContainer.classList.contains('list') && carContainer.parentElement) {
                    carContainer = carContainer.parentElement;
                }

                if (carContainer) {
                    // Skip if has seller div
                    if (this.hasSellerDiv(carContainer)) {
                        continue;
                    }

                    // Skip if it's a TOP or VIP ad
                    if (this.isTopOrVipAd(carContainer)) {
                        continue;
                    }

                    // Skip imports by description
                    const desc = carContainer.textContent || '';
                    if (desc.includes('нов внос')) {
                        continue;
                    }

                    // Check if it's a first-owner car and capture matched keyword
                    const matchedKeyword = this.findMatchingKeyword(desc);
                    if (matchedKeyword) {
                        const fullUrl = href.startsWith('//') ? 'https:' + href : href;
                        carLinks.push(fullUrl);
                        const details = this.parseCarDetails(carContainer, fullUrl);
                        this.results.push({ ...details, matchedKeyword });
                        console.log(`Found first-owner car: ${fullUrl}`);
                    }
                }
            }
        }

        return carLinks;
    }

    // Get next page URL
    getNextPageUrl(document, currentPage) {
        // Look for next page link
        const nextLink = document.querySelector('a.next, a[class*="next"]');
        if (nextLink) {
            const href = nextLink.getAttribute('href');
            if (href) {
                const fullUrl = href.startsWith('//') ? 'https:' + href : href;
                console.log(`Found next page link: ${fullUrl}`);
                return fullUrl;
            }
        }

        // Fallback: construct next page URL based on the pattern we saw
        const nextPage = currentPage;
        const baseUrl = this.startUrl.replace(/p-\d+/, '').replace(/\?/, '?');
        const nextPageUrl = baseUrl.includes('?')
            ? `${baseUrl}&p-${nextPage}`
            : `${baseUrl}?p-${nextPage}`;

        console.log(`Constructed next page URL: ${nextPageUrl}`);
        return nextPageUrl;
    }

    // Check if there are more pages
    hasNextPage(document) {
        const nextLink = document.querySelector('a.next, a[class*="next"]');
        if (nextLink) {
            console.log('Next page link found');
            return true;
        }
        console.log('No next page link found');
        return false;
    }

    // Fetch a single page
    async fetchPage(url) {
        try {
            console.log(`Fetching page: ${url}`);
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: 10000,
                responseType: 'arraybuffer' // Get raw binary data
            });

            // Convert from Windows-1251 to UTF-8
            const decoder = new TextDecoder('windows-1251');
            const html = decoder.decode(response.data);

            return html;
        } catch (error) {
            console.error(`Error fetching ${url}:`, error.message);
            return null;
        }
    }

    // Process a single page
    async processPage(url) {
        console.log(`\n--- Processing Page ${this.currentPage} ---`);
        const html = await this.fetchPage(url);
        if (!html) {
            console.log('Failed to fetch page HTML');
            return false;
        }

        const document = this.parseHTML(html);
        const pageCarLinks = this.extractCarLinks(document);

        this.carLinks.push(...pageCarLinks);
        console.log(`Page ${this.currentPage}: Found ${pageCarLinks.length} first-owner cars`);
        console.log(`Total cars found so far: ${this.carLinks.length}`);

        const hasNext = this.hasNextPage(document);
        console.log(`Has next page: ${hasNext}`);

        return hasNext;
    }

    // Save results to CSV file
    saveResults() {
        // Deduplicate by link
        const seen = new Set();
        const unique = [];
        for (const r of this.results) {
            if (seen.has(r.link)) continue;
            seen.add(r.link);
            unique.push(r);
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `first-owner-cars-${timestamp}.csv`;
        const esc = (s) => (s ?? '').toString().replace(/\|/g, ' ').trim();
        const header = 'Линк|Заглавие|Цена|Година на производство|Пробег|Тип гориво|Обем на двигателя|Мощност|Скоростна кутия|Форм фактор|Намерен по ключова дума';
        const rows = unique.map(r => [
            esc(r.link),
            esc(r.title),
            esc(r.price),
            esc(r.year),
            esc(r.mileage),
            esc(r.fuel),
            esc(r.engineVolume),
            esc(r.horsepower),
            esc(r.transmission),
            esc(r.formFactor),
            esc(r.matchedKeyword)
        ].join('|'));

        fs.writeFileSync(filename, [header, ...rows].join('\n'), 'utf8');
        console.log(`\nResults saved to ${filename}`);
        console.log(`Total first-owner cars found: ${unique.length} (${this.results.length - unique.length} duplicates removed)`);
    }

    // Main scraping function
    async scrape() {
        console.log('Starting mobile.bg scraper...');
        console.log(`Target URL: ${this.startUrl}`);
        console.log(`Looking for keywords: ${this.firstOwnerKeywords.join(', ')}`);
        console.log(`Page limit: ${this.maxPages === 0 ? 'Unlimited' : this.maxPages} pages`);
        console.log(`Request delay: ${this.delay}ms`);
        console.log('---');

        let currentUrl = this.startUrl;
        let hasMorePages = true;

        while (hasMorePages && (this.maxPages === 0 || this.currentPage <= this.maxPages)) {
            hasMorePages = await this.processPage(currentUrl);

            if (hasMorePages) {
                this.currentPage++;

                // Get the next page URL from the current page
                const currentPageHtml = await this.fetchPage(currentUrl);
                if (currentPageHtml) {
                    const document = this.parseHTML(currentPageHtml);
                    const nextPageUrl = this.getNextPageUrl(document, this.currentPage);

                    if (nextPageUrl && nextPageUrl !== currentUrl) {
                        currentUrl = nextPageUrl;
                        console.log(`Moving to page ${this.currentPage}: ${currentUrl}`);
                    } else {
                        console.log('No next page found. Stopping.');
                        hasMorePages = false;
                    }
                } else {
                    console.log('Failed to fetch current page. Stopping.');
                    hasMorePages = false;
                }

                // Add delay between requests
                await new Promise(resolve => setTimeout(resolve, this.delay));
            }
        }

        console.log('---');
        if (this.maxPages > 0 && this.currentPage > this.maxPages) {
            console.log(`Page limit reached (${this.maxPages} pages). Stopping.`);
        }
        console.log('Scraping completed!');
        this.saveResults();
    }
}

// Run the scraper
const scraper = new MobileBGScraper();
scraper.scrape().catch(console.error);
